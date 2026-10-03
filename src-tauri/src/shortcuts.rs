//! Global shortcuts. The frontend sends an action→accelerator map; Rust registers them and
//! dispatches actions even while every webview is hidden.

use crate::windows;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

static MAP: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new(); // shortcut string -> action

#[derive(Clone, Debug)]
pub struct VoiceConfig {
    pub engine: String,
    pub model: String,
    pub language: String,
    pub keep_audio: bool,
    pub device: Option<String>,
}

static VOICE: OnceLock<Mutex<VoiceConfig>> = OnceLock::new();

pub fn voice_config() -> VoiceConfig {
    VOICE.get_or_init(|| Mutex::new(VoiceConfig { engine: "auto".into(), model: "base.en".into(), language: "en".into(), keep_audio: true, device: None })).lock().clone()
}

pub fn set_voice_config(c: VoiceConfig) {
    let cell = VOICE.get_or_init(|| Mutex::new(c.clone()));
    *cell.lock() = c;
}

fn map() -> &'static Mutex<HashMap<String, String>> {
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn handle(app: &AppHandle, shortcut: &Shortcut, state: ShortcutState) {
    let key = shortcut.to_string();
    let action = map().lock().get(&key).cloned();
    let Some(a) = action else { return };
    if a == "voice-capture" {
        // Hold to record, release to transcribe.
        match state {
            ShortcutState::Pressed => {
                if !crate::voice::is_recording() {
                    windows::show_voice(app, "hold");
                    let app2 = app.clone();
                    std::thread::spawn(move || {
                        let c = voice_config();
                        let use_winrt = c.engine == "windows" || (c.engine == "auto" && !crate::voice::model_path(&app2, &c.model).exists());
                        if let Err(e) = crate::voice::start(&app2, c.device.clone(), c.language.clone(), use_winrt) {
                            let _ = app2.emit("sid://voice/error", e.to_string());
                        }
                    });
                }
            }
            ShortcutState::Released => {
                if crate::voice::is_recording() {
                    let app2 = app.clone();
                    std::thread::spawn(move || {
                        let c = voice_config();
                        let t = crate::voice::stop_and_transcribe(&app2, &c.engine, &c.model, &c.language, c.keep_audio);
                        let _ = app2.emit("sid://voice/transcript", &t);
                    });
                }
            }
        }
        return;
    }
    if state != ShortcutState::Pressed {
        return;
    }
    dispatch(app, &a);
}

pub fn dispatch(app: &AppHandle, action: &str) {
    match action {
        "toggle-main" => windows::toggle_main(app),
        "show-main" => windows::show_main(app),
        "bubble-toggle" => {
            let st = windows::state();
            if st.mode == "bubble" {
                windows::show_main(app)
            } else {
                windows::minimize_to_bubble(app)
            }
        }
        "palette" => windows::show_palette(app, "commands"),
        "quick-task" => windows::show_palette(app, "task"),
        "quick-note" => windows::show_palette(app, "note"),
        "quick-journal" => windows::show_palette(app, "journal"),
        "search" => windows::show_palette(app, "search"),
        "pip-toggle" => {
            let visible = app.get_webview_window("pip").map(|w| w.is_visible().unwrap_or(false)).unwrap_or(false);
            if visible {
                windows::hide_pip(app)
            } else {
                windows::show_pip(app)
            }
        }
        "focus-toggle" => {
            let engine = app.state::<std::sync::Arc<crate::focus::FocusEngine>>();
            let snap = engine.snapshot();
            if snap.session.is_some() && snap.session.as_ref().map(|s| s.status != crate::focus::Status::Finished).unwrap_or(false) {
                engine.toggle();
            } else {
                let _ = app.emit("sid://shortcut", "focus-start");
            }
        }
        "capture-clipboard" => {
            let app2 = app.clone();
            std::thread::spawn(move || {
                let item = crate::clipboard::read_clipboard(false);
                let _ = app2.emit("sid://clipboard/capture", item);
                windows::show_palette(&app2, "capture");
            });
        }
        "media-toggle" => {
            std::thread::spawn(|| {
                let _ = crate::media::control("toggle", None);
            });
        }
        "media-next" => {
            std::thread::spawn(|| {
                let _ = crate::media::control("next", None);
            });
        }
        other => {
            let _ = app.emit("sid://shortcut", other);
        }
    }
}

/// Register the given action→accelerator map. Returns the actions whose shortcut failed to register.
pub fn apply(app: &AppHandle, wanted: HashMap<String, String>) -> Vec<String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut failed = vec![];
    let mut new_map = HashMap::new();
    for (action, accel) in wanted {
        let accel = accel.trim().to_string();
        if accel.is_empty() {
            continue;
        }
        match accel.parse::<Shortcut>() {
            Ok(sc) => {
                if gs.register(sc).is_ok() {
                    new_map.insert(sc.to_string(), action);
                } else {
                    log::warn!("shortcut {accel} for {action} could not be registered");
                    failed.push(action);
                }
            }
            Err(e) => {
                log::warn!("bad shortcut {accel}: {e}");
                failed.push(action);
            }
        }
    }
    *map().lock() = new_map;
    failed
}
