mod calendar;
mod clipboard;
mod commands;
mod distraction;
mod export;
mod focus;
mod links;
mod media;
mod oauth;
mod shortcuts;
mod sync;
mod sound;
mod spotify;
mod store;
mod system;
mod voice;
mod windows;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

/// "bubble" | "tray" | "quit" — what the main window's close button does.
pub struct CloseBehavior(pub Mutex<String>);

struct FileLogger;
impl log::Log for FileLogger {
    fn enabled(&self, m: &log::Metadata) -> bool {
        m.level() <= log::Level::Info
    }
    fn log(&self, r: &log::Record) {
        if !self.enabled(r.metadata()) {
            return;
        }
        if let Some(app) = system::app_handle() {
            if let Some(store) = app.try_state::<Arc<store::Store>>() {
                store.append_log(&format!("[{}] {}: {}", r.level(), r.target(), r.args()));
            }
        }
        #[cfg(debug_assertions)]
        eprintln!("[{}] {}", r.level(), r.args());
    }
    fn flush(&self) {}
}
static LOGGER: FileLogger = FileLogger;

pub fn run() {
    let _ = log::set_logger(&LOGGER).map(|()| log::set_max_level(log::LevelFilter::Info));
    let start_hidden = std::env::args().any(|a| a == "--hidden" || a == "--minimized");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, sc, ev| shortcuts::handle(app, sc, ev.state())).build())
        .manage(CloseBehavior(Mutex::new("bubble".into())))
        .setup(move |app| {
            let handle = app.handle().clone();
            let store = Arc::new(store::Store::new()?);
            app.manage(store.clone());
            spotify::init(store.app_config_dir());
            oauth::init(store.app_config_dir());
            windows::init(&handle);
            let engine = focus::FocusEngine::new(handle.clone());
            app.manage(engine);
            system::start(handle.clone());
            media::start_poller(handle.clone());
            log::info!("Dayflit starting; data dir {}", store.data_dir().display());

            // Tray
            let show = MenuItemBuilder::with_id("show", "Open Dayflit").build(app)?;
            let capture = MenuItemBuilder::with_id("palette", "Quick capture…").build(app)?;
            let focus_toggle = MenuItemBuilder::with_id("focus-toggle", "Start / pause focus").build(app)?;
            let pip = MenuItemBuilder::with_id("pip-toggle", "Floating timer").build(app)?;
            let bubble = MenuItemBuilder::with_id("bubble-toggle", "Collapse to bubble").build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Dayflit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &capture, &focus_toggle, &pip, &bubble]).separator().items(&[&settings]).separator().items(&[&quit]).build()?;
            let icon = app.default_window_icon().cloned().expect("icon");
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("Dayflit")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "show" => windows::show_main(app),
                    "quit" => {
                        if let Some(w) = app.get_webview_window("main") {
                            windows::remember_main(&w);
                        }
                        windows::flush_now();
                        app.exit(0);
                    }
                    "settings" => {
                        windows::show_main(app);
                        let _ = app.emit("sid://navigate", "settings");
                    }
                    other => shortcuts::dispatch(app, other),
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        windows::toggle_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Windows: main + helpers (pre-created hidden so they open instantly).
            let main = windows::ensure_main(&handle)?;
            let _ = windows::ensure_bubble(&handle);
            let _ = windows::ensure_pip(&handle);
            let _ = windows::ensure_palette(&handle);
            let _ = windows::ensure_voice(&handle);
            let _ = windows::ensure_nudge(&handle);
            distraction::start(handle.clone());
            let st = windows::state();
            if start_hidden || st.mode == "bubble" {
                windows::minimize_to_bubble(&handle);
            } else {
                let _ = main.show();
                let _ = main.set_focus();
            }
            if st.pip_visible {
                windows::show_pip(&handle);
            }

            // Daily automatic backup.
            let s2 = store.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(20));
                let newest = s2.list_backups().ok().and_then(|l| l.first().map(|b| b.created_at));
                let due = newest.map(|t| (chrono::Utc::now() - t).num_hours() >= 24).unwrap_or(true);
                if due {
                    match s2.backup_now(false, "") {
                        Ok(b) => log::info!("auto backup {}", b.file),
                        Err(e) => log::error!("auto backup failed: {e}"),
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        let behavior = app.state::<CloseBehavior>().0.lock().clone();
                        match behavior.as_str() {
                            "quit" => {
                                windows::remember_main(window);
                                windows::flush_now();
                            }
                            "tray" => {
                                api.prevent_close();
                                windows::hide_main(app);
                            }
                            _ => {
                                api.prevent_close();
                                windows::minimize_to_bubble(app);
                            }
                        }
                    } else {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => match window.label() {
                    "main" => {
                        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
                            windows::remember_main(window);
                        }
                    }
                    "bubble" => windows::remember_bubble(app),
                    "pip" => windows::remember_pip(app),
                    _ => {}
                },
                WindowEvent::Focused(false) => {
                    if window.label() == "palette" {
                        let w = window.clone();
                        // Small delay so clicks inside the palette that briefly steal focus don't close it.
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(120));
                            if !w.is_focused().unwrap_or(false) {
                                let _ = w.hide();
                            }
                        });
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::store_load,
            commands::store_save,
            commands::store_info,
            commands::store_backup_now,
            commands::store_list_backups,
            commands::store_restore_backup,
            commands::store_change_dir,
            commands::store_save_image,
            commands::store_save_attachment,
            commands::store_image_path,
            commands::store_delete_image,
            commands::store_list_images,
            commands::store_open_folder,
            commands::app_log,
            commands::export_markdown,
            commands::focus_start,
            commands::focus_pause,
            commands::focus_resume,
            commands::focus_toggle,
            commands::focus_skip,
            commands::focus_stop,
            commands::focus_extend,
            commands::focus_get,
            commands::media_state,
            commands::media_control,
            commands::media_set_volume,
            commands::media_set_mute,
            commands::media_set_preferred,
            commands::spotify_status,
            commands::spotify_connect,
            commands::spotify_disconnect,
            commands::spotify_api,
            commands::spotify_control,
            commands::system_foreground,
            commands::system_monitors,
            commands::system_notification_state,
            commands::system_set_lock_behavior,
            commands::clipboard_set_monitoring,
            commands::clipboard_read_now,
            commands::clipboard_write_text,
            commands::clipboard_default_ignored,
            commands::calendar_fetch,
            commands::sync_status,
            commands::sync_connect,
            commands::sync_disconnect,
            commands::sync_calendars,
            commands::sync_fetch,
            commands::sync_create,
            commands::sync_update,
            commands::sync_delete,
            commands::calendar_detect_meeting,
            commands::link_preview,
            commands::link_seed,
            commands::window_show_main,
            commands::window_hide_main,
            commands::window_toggle_main,
            commands::window_minimize_to_bubble,
            commands::window_restore_from_bubble,
            commands::window_smart_dock,
            commands::window_snap,
            commands::window_next_monitor,
            commands::window_set_always_on_top,
            commands::window_set_material,
            commands::window_show_pip,
            commands::window_hide_pip,
            commands::window_toggle_pip,
            commands::window_show_palette,
            commands::window_hide_palette,
            commands::window_get_state,
            commands::window_remember,
            commands::window_set_close_behavior,
            commands::voice_status,
            commands::voice_start,
            commands::voice_stop,
            commands::voice_cancel,
            commands::voice_transcribe_file,
            commands::voice_download_model,
            commands::voice_delete_model,
            commands::voice_set_config,
            commands::window_show_voice,
            commands::window_hide_voice,
            commands::window_hide_nudge,
            commands::nudge_snooze,
            commands::distraction_set_config,
            commands::sound_play,
            commands::shortcuts_apply,
            commands::app_quit,
            commands::app_relaunch,
            commands::app_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Dayflit")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                windows::flush_now();
            }
        });
}
