//! Focus session engine. Authoritative timer lives here so it keeps accurate time even
//! when the webview is hidden/throttled. Emits `sid://focus/state` and `sid://focus/tick`.

use crate::{media, sound, store::Store};
use chrono::Utc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Work,
    ShortBreak,
    LongBreak,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Running,
    Paused,
    /// Phase finished; waiting for the user to start the next one.
    Awaiting,
    Finished,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusConfig {
    /// "pomodoro" | "deep" | "custom" | "stopwatch"
    pub mode: String,
    pub work_secs: u64,
    pub short_break_secs: u64,
    pub long_break_secs: u64,
    pub cycles_before_long: u32,
    /// Total work phases in this session (pomodoro default 4, deep 1). 0 = unlimited.
    pub target_work_phases: u32,
    pub auto_start_breaks: bool,
    pub auto_start_work: bool,
    pub task_id: Option<String>,
    pub task_title: Option<String>,
    /// "none" | "play"
    pub media_on_start: String,
    /// "none" | "pause"
    pub media_on_break: String,
    /// "none" | "pause"
    pub media_on_end: String,
    pub notify: bool,
    pub sound: String,
    pub sound_volume: f32,
    pub label: Option<String>,
}

impl Default for FocusConfig {
    fn default() -> Self {
        Self {
            mode: "pomodoro".into(),
            work_secs: 25 * 60,
            short_break_secs: 5 * 60,
            long_break_secs: 15 * 60,
            cycles_before_long: 4,
            target_work_phases: 4,
            auto_start_breaks: true,
            auto_start_work: false,
            task_id: None,
            task_title: None,
            media_on_start: "none".into(),
            media_on_break: "none".into(),
            media_on_end: "none".into(),
            notify: true,
            sound: "chime".into(),
            sound_volume: 0.7,
            label: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub config: FocusConfig,
    pub phase: Phase,
    pub status: Status,
    /// 1-based index of the current work phase.
    pub work_phase_index: u32,
    pub completed_work_phases: u32,
    pub duration_secs: u64,
    pub session_started_at: i64,
    pub phase_started_at: i64,
    /// Milliseconds accumulated in this phase before the current running stretch.
    pub accumulated_ms: i64,
    pub running_since: Option<i64>,
    pub paused_at: Option<i64>,
    pub total_work_ms: i64,
    pub extended_secs: i64,
    pub pause_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub session: Option<Session>,
    pub remaining_secs: i64,
    pub elapsed_secs: i64,
    pub ends_at: Option<i64>,
    pub progress: f64,
    pub now: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub session_id: String,
    pub task_id: Option<String>,
    pub task_title: Option<String>,
    pub label: Option<String>,
    pub mode: String,
    pub phase: Phase,
    pub planned_secs: u64,
    pub actual_secs: i64,
    pub started_at: i64,
    pub ended_at: i64,
    pub completed: bool,
    pub work_phase_index: u32,
    pub pause_count: u32,
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

pub struct FocusEngine {
    app: AppHandle,
    inner: Arc<Mutex<Option<Session>>>,
    last_tick_second: Mutex<i64>,
}

impl FocusEngine {
    pub fn new(app: AppHandle) -> Arc<Self> {
        let e = Arc::new(Self { app, inner: Arc::new(Mutex::new(None)), last_tick_second: Mutex::new(-1) });
        let weak = Arc::downgrade(&e);
        std::thread::Builder::new()
            .name("focus-ticker".into())
            .spawn(move || loop {
                std::thread::sleep(Duration::from_millis(250));
                let Some(e) = weak.upgrade() else { break };
                e.tick();
            })
            .expect("spawn ticker");
        e
    }

    fn elapsed_ms(s: &Session, now: i64) -> i64 {
        s.accumulated_ms + s.running_since.map(|r| now - r).unwrap_or(0)
    }

    pub fn snapshot(&self) -> Snapshot {
        let now = now_ms();
        let g = self.inner.lock();
        match g.as_ref() {
            None => Snapshot { session: None, remaining_secs: 0, elapsed_secs: 0, ends_at: None, progress: 0.0, now },
            Some(s) => {
                let elapsed = Self::elapsed_ms(s, now);
                let stopwatch = s.config.mode == "stopwatch" && s.phase == Phase::Work;
                let dur_ms = (s.duration_secs as i64) * 1000;
                let remaining = if stopwatch { 0 } else { (dur_ms - elapsed).max(0) };
                let ends_at = if s.status == Status::Running && !stopwatch { Some(now + remaining) } else { None };
                Snapshot {
                    session: Some(s.clone()),
                    remaining_secs: (remaining + 999) / 1000,
                    elapsed_secs: elapsed / 1000,
                    ends_at,
                    progress: if stopwatch || dur_ms == 0 { 0.0 } else { (elapsed as f64 / dur_ms as f64).clamp(0.0, 1.0) },
                    now,
                }
            }
        }
    }

    fn emit_state(&self) {
        let snap = self.snapshot();
        let _ = self.app.emit("sid://focus/state", &snap);
        self.update_tray(&snap);
    }

    fn update_tray(&self, snap: &Snapshot) {
        if let Some(tray) = self.app.tray_by_id("main") {
            let tip = match &snap.session {
                Some(s) if s.status == Status::Running => {
                    let m = snap.remaining_secs / 60;
                    let sec = snap.remaining_secs % 60;
                    let what = match s.phase {
                        Phase::Work => s.config.task_title.clone().unwrap_or_else(|| "Focus".into()),
                        Phase::ShortBreak => "Short break".into(),
                        Phase::LongBreak => "Long break".into(),
                    };
                    format!("Dayflit — {what} · {m:02}:{sec:02}")
                }
                Some(s) if s.status == Status::Paused => "Dayflit — focus paused".into(),
                _ => "Dayflit".into(),
            };
            let _ = tray.set_tooltip(Some(tip));
        }
    }

    fn tick(&self) {
        let now = now_ms();
        let mut completed: Option<Session> = None;
        {
            let mut g = self.inner.lock();
            if let Some(s) = g.as_mut() {
                if s.status == Status::Running {
                    let elapsed = Self::elapsed_ms(s, now);
                    let stopwatch = s.config.mode == "stopwatch" && s.phase == Phase::Work;
                    if !stopwatch && elapsed >= (s.duration_secs as i64) * 1000 {
                        completed = Some(s.clone());
                    }
                }
            }
        }
        if let Some(s) = completed {
            self.complete_phase(s, true);
            return;
        }
        // Emit a light tick once per second while running.
        let snap = self.snapshot();
        if snap.session.as_ref().map(|s| s.status == Status::Running).unwrap_or(false) {
            let sec = now / 1000;
            let mut last = self.last_tick_second.lock();
            if *last != sec {
                *last = sec;
                let _ = self.app.emit("sid://focus/tick", &snap);
                if sec % 5 == 0 {
                    self.update_tray(&snap);
                }
            }
        }
    }

    fn phase_duration(cfg: &FocusConfig, phase: &Phase) -> u64 {
        match phase {
            Phase::Work => cfg.work_secs,
            Phase::ShortBreak => cfg.short_break_secs,
            Phase::LongBreak => cfg.long_break_secs,
        }
    }

    pub fn start(&self, cfg: FocusConfig) -> Snapshot {
        let now = now_ms();
        let s = Session {
            id: uuid::Uuid::new_v4().to_string(),
            duration_secs: Self::phase_duration(&cfg, &Phase::Work),
            config: cfg.clone(),
            phase: Phase::Work,
            status: Status::Running,
            work_phase_index: 1,
            completed_work_phases: 0,
            session_started_at: now,
            phase_started_at: now,
            accumulated_ms: 0,
            running_since: Some(now),
            paused_at: None,
            total_work_ms: 0,
            extended_secs: 0,
            pause_count: 0,
        };
        *self.inner.lock() = Some(s);
        if cfg.media_on_start == "play" {
            media::play_async(self.app.clone());
        }
        self.emit_state();
        self.snapshot()
    }

    pub fn pause(&self) -> Snapshot {
        let now = now_ms();
        {
            let mut g = self.inner.lock();
            if let Some(s) = g.as_mut() {
                if s.status == Status::Running {
                    s.accumulated_ms = Self::elapsed_ms(s, now);
                    s.running_since = None;
                    s.paused_at = Some(now);
                    s.status = Status::Paused;
                    s.pause_count += 1;
                }
            }
        }
        self.emit_state();
        self.snapshot()
    }

    pub fn resume(&self) -> Snapshot {
        let now = now_ms();
        let mut start_media = false;
        {
            let mut g = self.inner.lock();
            if let Some(s) = g.as_mut() {
                match s.status {
                    Status::Paused => {
                        s.running_since = Some(now);
                        s.paused_at = None;
                        s.status = Status::Running;
                    }
                    Status::Awaiting => {
                        // Begin the pending phase.
                        s.phase_started_at = now;
                        s.accumulated_ms = 0;
                        s.running_since = Some(now);
                        s.status = Status::Running;
                        start_media = s.phase == Phase::Work && s.config.media_on_start == "play";
                    }
                    _ => {}
                }
            }
        }
        if start_media {
            media::play_async(self.app.clone());
        }
        self.emit_state();
        self.snapshot()
    }

    pub fn toggle(&self) -> Snapshot {
        let status = self.inner.lock().as_ref().map(|s| s.status.clone());
        match status {
            Some(Status::Running) => self.pause(),
            Some(Status::Paused) | Some(Status::Awaiting) => self.resume(),
            _ => self.snapshot(),
        }
    }

    pub fn extend(&self, secs: i64) -> Snapshot {
        {
            let mut g = self.inner.lock();
            if let Some(s) = g.as_mut() {
                let d = (s.duration_secs as i64 + secs).max(60);
                s.duration_secs = d as u64;
                s.extended_secs += secs;
            }
        }
        self.emit_state();
        self.snapshot()
    }

    /// Skip the current phase (counts as completed if it was a break; work is recorded as incomplete).
    pub fn skip(&self) -> Snapshot {
        let cur = self.inner.lock().clone();
        if let Some(s) = cur {
            self.complete_phase(s, false);
        }
        self.snapshot()
    }

    pub fn stop(&self, discard: bool) -> Snapshot {
        let now = now_ms();
        let cur = self.inner.lock().take();
        if let Some(s) = cur {
            let elapsed = Self::elapsed_ms(&s, now);
            if !discard && s.phase == Phase::Work && elapsed >= 60_000 {
                // A stopwatch has no target length: stopping it is completing it.
                let completed = s.config.mode == "stopwatch";
                self.record(&s, elapsed / 1000, completed, now);
            }
            if s.config.media_on_end == "pause" {
                media::pause_async(self.app.clone());
            }
        }
        self.emit_state();
        self.snapshot()
    }

    fn record(&self, s: &Session, actual_secs: i64, completed: bool, now: i64) {
        let entry = HistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: s.id.clone(),
            task_id: s.config.task_id.clone(),
            task_title: s.config.task_title.clone(),
            label: s.config.label.clone(),
            mode: s.config.mode.clone(),
            phase: s.phase.clone(),
            planned_secs: s.duration_secs,
            actual_secs,
            started_at: s.phase_started_at,
            ended_at: now,
            completed,
            work_phase_index: s.work_phase_index,
            pause_count: s.pause_count,
        };
        let store = self.app.state::<Arc<Store>>();
        let mut list: Vec<serde_json::Value> = store
            .load("focus_history")
            .ok()
            .and_then(|r| r.data)
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        if let Ok(v) = serde_json::to_value(&entry) {
            list.push(v);
        }
        if let Err(e) = store.save("focus_history", serde_json::Value::Array(list)) {
            log::error!("save focus history: {e}");
        }
        let _ = self.app.emit("sid://focus/history-updated", &entry);
    }

    fn complete_phase(&self, s: Session, natural: bool) {
        let now = now_ms();
        let elapsed_secs = Self::elapsed_ms(&s, now) / 1000;
        let was_work = s.phase == Phase::Work;
        if was_work && (natural || elapsed_secs >= 60) {
            self.record(&s, elapsed_secs, natural, now);
        }
        let cfg = s.config.clone();
        let completed_work = s.completed_work_phases + if was_work && natural { 1 } else { 0 };
        let target = cfg.target_work_phases;
        let session_done = was_work && target > 0 && completed_work >= target;

        // Determine next phase.
        let (next_phase, next_index) = if was_work {
            if session_done {
                (None, s.work_phase_index)
            } else if cfg.cycles_before_long > 0 && completed_work > 0 && completed_work % cfg.cycles_before_long == 0 {
                (Some(Phase::LongBreak), s.work_phase_index)
            } else {
                (Some(Phase::ShortBreak), s.work_phase_index)
            }
        } else {
            (Some(Phase::Work), s.work_phase_index + 1)
        };

        {
            let mut g = self.inner.lock();
            match next_phase {
                None => {
                    if let Some(cur) = g.as_mut() {
                        cur.status = Status::Finished;
                        cur.completed_work_phases = completed_work;
                        cur.running_since = None;
                        cur.accumulated_ms = 0;
                        cur.total_work_ms += if was_work { elapsed_secs * 1000 } else { 0 };
                    }
                }
                Some(p) => {
                    if let Some(cur) = g.as_mut() {
                        let auto = match p {
                            Phase::Work => cfg.auto_start_work,
                            _ => cfg.auto_start_breaks,
                        };
                        cur.completed_work_phases = completed_work;
                        cur.total_work_ms += if was_work { elapsed_secs * 1000 } else { 0 };
                        cur.duration_secs = Self::phase_duration(&cfg, &p);
                        cur.phase = p;
                        cur.work_phase_index = next_index;
                        cur.phase_started_at = now;
                        cur.accumulated_ms = 0;
                        cur.extended_secs = 0;
                        cur.paused_at = None;
                        cur.pause_count = 0;
                        cur.running_since = if auto { Some(now) } else { None };
                        cur.status = if auto { Status::Running } else { Status::Awaiting };
                    }
                }
            }
        }

        // Side effects only for natural completions (skips are silent).
        if natural {
            if cfg.sound != "none" {
                sound::play(&cfg.sound, cfg.sound_volume);
            }
            if cfg.notify {
                let (title, body) = if was_work {
                    if session_done {
                        ("Session complete".to_string(), format!("Great work — {} focus blocks done.", completed_work))
                    } else {
                        ("Focus block done".to_string(), "Time for a break.".to_string())
                    }
                } else {
                    ("Break over".to_string(), match &cfg.task_title { Some(t) => format!("Back to: {t}"), None => "Ready for the next focus block.".into() })
                };
                let _ = self.app.notification().builder().title(title).body(body).show();
            }
            if was_work && (cfg.media_on_break == "pause" || (session_done && cfg.media_on_end == "pause")) {
                media::pause_async(self.app.clone());
            }
            if !was_work && cfg.media_on_start == "play" && cfg.auto_start_work {
                media::play_async(self.app.clone());
            }
        }
        let _ = self.app.emit(
            "sid://focus/phase-complete",
            serde_json::json!({ "phase": s.phase, "natural": natural, "sessionDone": session_done, "completedWork": completed_work }),
        );
        self.emit_state();
    }

    /// Called when the workstation locks (optional auto-pause).
    pub fn on_lock(&self, pause_on_lock: bool) {
        if pause_on_lock {
            let running = self.inner.lock().as_ref().map(|s| s.status == Status::Running).unwrap_or(false);
            if running {
                self.pause();
                let _ = self.app.emit("sid://focus/auto-paused", "lock");
            }
        }
    }

}
