//! Distraction awareness during focus blocks. Polls the foreground window (reliable on Windows)
//! and, when a configured app or window-title keyword comes to the front during a running work
//! phase, shows a small non-blocking nudge. Browser URLs are not readable without accessibility
//! hooks, so detection relies on window titles (e.g. "YouTube - Google Chrome"), which is honest
//! and covers the common cases.

use crate::{focus, system, windows};
use parking_lot::Mutex;
use serde::Serialize;
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

static CONFIG: OnceLock<Mutex<Config>> = OnceLock::new();
static SNOOZED_SESSION: Mutex<Option<String>> = Mutex::new(None);
static STARTED: AtomicBool = AtomicBool::new(false);

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

fn matches(cfg: &Config, fg: &system::ForegroundInfo, notif_state: &str) -> Option<String> {
    let pn = fg.process_name.to_ascii_lowercase();
    if pn.is_empty() || pn == "sid.exe" {
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
                let fg = system::foreground();
                let state = system::notification_state();
                let Some(reason) = matches(&cfg, &fg, &state) else { continue };
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
