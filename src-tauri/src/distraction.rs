//! Distraction awareness during focus blocks. Polls the foreground window (reliable on Windows)
//! and, when a configured app or window-title keyword comes to the front during a running work
//! phase, shows a small non-blocking nudge. Browser URLs are not readable without accessibility
//! hooks, so detection relies on window titles (e.g. "YouTube - Google Chrome"), which is honest
//! and covers the common cases.

use crate::{focus, system, windows};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug)]
pub struct Config {
    pub enabled: bool,
    pub apps: Vec<String>,
    pub keywords: Vec<String>,
    pub cooldown_min: u32,
    pub sound: bool,
    pub detect_fullscreen: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NudgePayload {
    pub app: String,
    pub title: String,
    pub remaining_secs: i64,
    pub task_title: Option<String>,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySession {
    pub id: String,
    pub exe: String,
    pub process_name: String,
    pub title: String,
    pub category: String,
    pub start_time: i64,
    pub end_time: i64,
    pub duration_secs: i64,
}

static CONFIG: OnceLock<Mutex<Config>> = OnceLock::new();
static SNOOZED_SESSION: Mutex<Option<String>> = Mutex::new(None);
static STARTED: AtomicBool = AtomicBool::new(false);
static SESSIONS: Mutex<Vec<ActivitySession>> = Mutex::new(Vec::new());
static ACTIVE_SESSION: Mutex<Option<ActivitySession>> = Mutex::new(None);
static TRANSIENT_APP: Mutex<Option<(ActivitySession, Instant)>> = Mutex::new(None);
static ACTIVITY_PAUSED: AtomicBool = AtomicBool::new(true);

#[allow(dead_code)]
pub fn classify_activity(process_name: &str, title: &str) -> String {
    let p = process_name.to_ascii_lowercase();
    let t = title.to_ascii_lowercase();

    // 1. Distraction
    if ["steam.exe", "epicgameslauncher.exe", "discord.exe"].iter().any(|k| p.contains(k))
        || ["youtube", "reddit", "twitter", "x.com", "instagram", "tiktok", "netflix", "twitch"].iter().any(|k| t.contains(k))
    {
        return "Distraction".into();
    }

    // 2. Deep Work / Coding
    if ["code.exe", "cursor.exe", "devenv.exe", "idea64.exe", "pycharm64.exe", "webstorm64.exe", "windowsterminal.exe", "powershell.exe", "cmd.exe", "sublime_text.exe", "rustrover64.exe", "clion64.exe", "bash.exe", "git"].iter().any(|k| p.contains(k))
        || ["visual studio", "cursor", "intellij", "pycharm", "webstorm", "terminal", "github", "gitlab", ".rs", ".ts", ".tsx", ".py"].iter().any(|k| t.contains(k))
    {
        return "Deep Work / Coding".into();
    }

    // 3. Design
    if ["figma.exe", "photoshop.exe", "illustrator.exe", "blender.exe", "canva.exe", "afterfx.exe", "premiere.exe"].iter().any(|k| p.contains(k))
        || ["figma", "photoshop", "illustrator", "blender", "excalidraw"].iter().any(|k| t.contains(k))
    {
        return "Design".into();
    }

    // 4. Communication
    if ["slack.exe", "teams.exe", "telegram.exe", "whatsapp.exe", "zoom.exe", "outlook.exe", "thunderbird.exe"].iter().any(|k| p.contains(k))
        || ["slack", "teams", "telegram", "whatsapp", "zoom", "gmail", "outlook"].iter().any(|k| t.contains(k))
    {
        return "Communication".into();
    }

    // 5. Browsing
    if ["chrome.exe", "firefox.exe", "msedge.exe", "brave.exe", "arc.exe", "opera.exe", "safari.exe"].iter().any(|k| p.contains(k)) {
        return "Browsing".into();
    }

    "Deep Work / Coding".into()
}

#[allow(dead_code)]
pub fn record_foreground(fg: &system::ForegroundInfo) {
    if ACTIVITY_PAUSED.load(Ordering::Relaxed) {
        return;
    }
    let pn = fg.process_name.to_ascii_lowercase();
    if pn.is_empty() || pn == "dayflit.exe" || pn == "sid.exe" {
        return;
    }

    let now_ms = chrono::Utc::now().timestamp_millis();
    let now_instant = Instant::now();

    let mut active_lock = ACTIVE_SESSION.lock();
    let mut transient_lock = TRANSIENT_APP.lock();

    if let Some(active) = active_lock.as_mut() {
        if active.process_name.eq_ignore_ascii_case(&fg.process_name) {
            // Same application, update end time and duration
            active.end_time = now_ms;
            active.duration_secs = ((now_ms - active.start_time) / 1000).max(1);
            if !fg.title.is_empty() {
                active.title = fg.title.clone();
            }
            // Expire transient candidate only if window switch threshold (15s) has passed
            if let Some((_, switch_time)) = transient_lock.as_ref() {
                if switch_time.elapsed().as_secs() >= 15 {
                    *transient_lock = None;
                }
            }
            return;
        }

        // Switched to a different application
        if let Some((prev_active, switch_time)) = transient_lock.take() {
            if switch_time.elapsed().as_secs() < 15 && prev_active.process_name.eq_ignore_ascii_case(&fg.process_name) {
                // Switched back to previous app in < 15s: consolidate and merge back into previous
                let mut sessions = SESSIONS.lock();
                sessions.retain(|s| s.id != prev_active.id);
                drop(sessions);

                *active = prev_active;
                active.end_time = now_ms;
                active.duration_secs = ((now_ms - active.start_time) / 1000).max(1);
                if !fg.title.is_empty() {
                    active.title = fg.title.clone();
                }
                return;
            }
        }

        // If active session lasted at least 5s, commit it
        if active.duration_secs >= 5 {
            let mut sessions = SESSIONS.lock();
            sessions.retain(|s| s.id != active.id);
            if sessions.len() >= 500 {
                sessions.remove(0);
            }
            sessions.push(active.clone());
        }

        // Save old active as potential transient return
        *transient_lock = Some((active.clone(), now_instant));

        // Start new active session
        let category = classify_activity(&fg.process_name, &fg.title);
        *active = ActivitySession {
            id: format!("act_{}", now_ms),
            exe: fg.exe.clone(),
            process_name: fg.process_name.clone(),
            title: if fg.title.is_empty() { fg.process_name.clone() } else { fg.title.clone() },
            category,
            start_time: now_ms,
            end_time: now_ms + 1000,
            duration_secs: 1,
        };
    } else {
        // Initial session
        let category = classify_activity(&fg.process_name, &fg.title);
        *active_lock = Some(ActivitySession {
            id: format!("act_{}", now_ms),
            exe: fg.exe.clone(),
            process_name: fg.process_name.clone(),
            title: if fg.title.is_empty() { fg.process_name.clone() } else { fg.title.clone() },
            category,
            start_time: now_ms,
            end_time: now_ms + 1000,
            duration_secs: 1,
        });
    }
}

pub fn get_activity_sessions() -> Vec<ActivitySession> {
    let mut list = SESSIONS.lock().clone();
    if let Some(active) = ACTIVE_SESSION.lock().as_ref() {
        if active.duration_secs >= 3 && !list.iter().any(|s| s.id == active.id) {
            list.push(active.clone());
        }
    }
    list
}

pub fn set_activity_paused(paused: bool) {
    ACTIVITY_PAUSED.store(paused, Ordering::Relaxed);
}

pub fn is_activity_paused() -> bool {
    ACTIVITY_PAUSED.load(Ordering::Relaxed)
}

pub fn clear_activity_sessions() {
    SESSIONS.lock().clear();
    *ACTIVE_SESSION.lock() = None;
    *TRANSIENT_APP.lock() = None;
}

fn config() -> &'static Mutex<Config> {
    CONFIG.get_or_init(|| {
        Mutex::new(Config {
            enabled: true,
            apps: vec!["steam.exe".into(), "epicgameslauncher.exe".into(), "discord.exe".into()],
            keywords: vec!["YouTube".into(), "Reddit".into(), "Twitter".into(), "Instagram".into(), "TikTok".into(), "Netflix".into(), "Twitch".into()],
            cooldown_min: 5,
            sound: false,
            detect_fullscreen: true,
        })
    })
}

pub fn set_config(c: Config) {
    *config().lock() = c;
}

pub fn snooze_current_session(app: &AppHandle) {
    let engine = app.state::<Arc<focus::FocusEngine>>();
    if let Some(s) = engine.snapshot().session {
        *SNOOZED_SESSION.lock() = Some(s.id);
    }
}

pub fn matches_distraction(cfg: &Config, fg: &system::ForegroundInfo, notif_state: &str) -> Option<String> {
    let pn = fg.process_name.to_ascii_lowercase();
    if pn.is_empty() || pn == "sid.exe" || pn == "dayflit.exe" {
        return None;
    }
    if cfg.apps.iter().any(|a| !a.is_empty() && pn == a.to_ascii_lowercase()) {
        return Some("app".into());
    }
    let title = fg.title.to_ascii_lowercase();
    if !title.is_empty() && cfg.keywords.iter().any(|k| !k.is_empty() && title.contains(&k.to_ascii_lowercase())) {
        return Some("keyword".into());
    }
    if cfg.detect_fullscreen && notif_state == "fullscreen" {
        return Some("fullscreen".into());
    }
    None
}

pub fn start(app: AppHandle) {
    if STARTED.swap(true, Ordering::Relaxed) {
        return;
    }
    std::thread::Builder::new()
        .name("distraction-watch".into())
        .spawn(move || {
            let mut last_nudge: HashMap<String, Instant> = HashMap::new();
            let mut last_session = String::new();
            loop {
                std::thread::sleep(Duration::from_millis(2000));
                let fg = system::foreground();

                let cfg = config().lock().clone();
                if !cfg.enabled {
                    continue;
                }
                let engine = app.state::<Arc<focus::FocusEngine>>();
                let snap = engine.snapshot();
                let Some(s) = snap.session.as_ref() else { continue };
                if s.status != focus::Status::Running || s.phase != focus::Phase::Work {
                    continue;
                }
                if s.id != last_session {
                    last_session = s.id.clone();
                    last_nudge.clear();
                }
                if SNOOZED_SESSION.lock().as_deref() == Some(s.id.as_str()) {
                    continue;
                }
                let state = system::notification_state();
                let Some(reason) = matches_distraction(&cfg, &fg, &state) else { continue };
                let key = if reason == "fullscreen" { "fullscreen".to_string() } else { fg.process_name.to_ascii_lowercase() };
                let cooldown = Duration::from_secs(cfg.cooldown_min.max(1) as u64 * 60);
                if last_nudge.get(&key).map(|t| t.elapsed() < cooldown).unwrap_or(false) {
                    continue;
                }
                last_nudge.insert(key, Instant::now());
                let payload = NudgePayload {
                    app: crate::clipboard::friendly_name(&fg.process_name),
                    title: fg.title.clone(),
                    remaining_secs: snap.remaining_secs,
                    task_title: s.config.task_title.clone(),
                    reason,
                };
                if cfg.sound {
                    crate::sound::play("soft", 0.35);
                }
                windows::show_nudge(&app, &payload);
            }
        })
        .expect("distraction thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_distraction_exempts_dayflit() {
        let cfg = Config {
            enabled: true,
            apps: vec!["steam.exe".into(), "discord.exe".into(), "dayflit.exe".into()],
            keywords: vec!["YouTube".into()],
            cooldown_min: 5,
            sound: false,
            detect_fullscreen: false,
        };

        // Dayflit executable must be unconditionally exempt even if in apps list
        let fg_dayflit = system::ForegroundInfo {
            process_name: "dayflit.exe".into(),
            title: "DayFlit - Focus Session".into(),
            exe: "dayflit.exe".into(),
            pid: 1001,
            hwnd: 0,
        };
        assert_eq!(matches_distraction(&cfg, &fg_dayflit, "normal"), None);

        // Capitalized dayflit
        let fg_dayflit_cap = system::ForegroundInfo {
            process_name: "DayFlit.exe".into(),
            title: "DayFlit Companion".into(),
            exe: "DayFlit.exe".into(),
            pid: 1001,
            hwnd: 0,
        };
        assert_eq!(matches_distraction(&cfg, &fg_dayflit_cap, "normal"), None);

        // Distracting app matches
        let fg_discord = system::ForegroundInfo {
            process_name: "discord.exe".into(),
            title: "Discord - #general".into(),
            exe: "discord.exe".into(),
            pid: 1002,
            hwnd: 0,
        };
        assert_eq!(matches_distraction(&cfg, &fg_discord, "normal"), Some("app".into()));

        // Distracting keyword in title
        let fg_browser = system::ForegroundInfo {
            process_name: "chrome.exe".into(),
            title: "Relaxing Lo-Fi Beats - YouTube - Google Chrome".into(),
            exe: "chrome.exe".into(),
            pid: 1003,
            hwnd: 0,
        };
        assert_eq!(matches_distraction(&cfg, &fg_browser, "normal"), Some("keyword".into()));
    }

    #[test]
    fn test_classify_activity_categories() {
        assert_eq!(classify_activity("code.exe", "main.rs - DayFlit"), "Deep Work / Coding");
        assert_eq!(classify_activity("windowsterminal.exe", "PowerShell"), "Deep Work / Coding");
        assert_eq!(classify_activity("figma.exe", "DayFlit UI Components"), "Design");
        assert_eq!(classify_activity("slack.exe", "general"), "Communication");
        assert_eq!(classify_activity("chrome.exe", "Hacker News"), "Browsing");
        assert_eq!(classify_activity("chrome.exe", "Lo-Fi Beats - YouTube"), "Distraction");
        assert_eq!(classify_activity("steam.exe", "Steam"), "Distraction");
    }

    #[test]
    fn test_record_foreground_and_pause() {
        clear_activity_sessions();
        set_activity_paused(false);

        let fg1 = system::ForegroundInfo {
            process_name: "code.exe".into(),
            title: "src/windows/pip.tsx - DayFlit".into(),
            exe: "C:\\Program Files\\VSCode\\code.exe".into(),
            pid: 2001,
            hwnd: 1,
        };
        record_foreground(&fg1);

        let sessions = get_activity_sessions();
        assert!(!sessions.is_empty() || ACTIVE_SESSION.lock().is_some());

        // Test pause
        set_activity_paused(true);
        assert!(is_activity_paused());
        set_activity_paused(false);
    }

    #[test]
    fn test_transient_window_consolidation() {
        clear_activity_sessions();
        set_activity_paused(false);

        // App A (VS Code) starts
        let fg_code = system::ForegroundInfo {
            process_name: "code.exe".into(),
            title: "src/windows/pip.tsx - DayFlit".into(),
            exe: "C:\\Program Files\\VSCode\\code.exe".into(),
            pid: 2001,
            hwnd: 1,
        };
        record_foreground(&fg_code);
        let orig_id = ACTIVE_SESSION.lock().as_ref().unwrap().id.clone();

        // Brief switch to App B (Slack)
        let fg_slack = system::ForegroundInfo {
            process_name: "slack.exe".into(),
            title: "Slack - #general".into(),
            exe: "C:\\Program Files\\Slack\\slack.exe".into(),
            pid: 2002,
            hwnd: 2,
        };
        record_foreground(&fg_slack);
        // Second poll in Slack still within <15s
        record_foreground(&fg_slack);

        // Switch back to App A within 15 seconds
        record_foreground(&fg_code);

        // App A should be restored with the original session ID (consolidated)
        let active = ACTIVE_SESSION.lock().as_ref().unwrap().clone();
        assert_eq!(active.process_name, "code.exe");
        assert_eq!(active.id, orig_id);
    }
}



