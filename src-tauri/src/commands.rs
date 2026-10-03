//! IPC surface exposed to the webviews.

use crate::{calendar, clipboard, distraction, focus, links, media, sound, spotify, store::Store, sync, system, voice, windows};
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

type Res<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------- store ----------

#[tauri::command]
pub async fn store_load(store: State<'_, Arc<Store>>, name: String) -> Res<crate::store::LoadResult> {
    let s = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || s.load(&name).map_err(err)).await.map_err(err)?
}

#[tauri::command]
pub async fn store_save(store: State<'_, Arc<Store>>, name: String, data: Value) -> Res<()> {
    let s = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || s.save(&name, data).map_err(err)).await.map_err(err)?
}

#[tauri::command]
pub fn store_info(store: State<'_, Arc<Store>>) -> Res<crate::store::DataDirInfo> {
    store.info().map_err(err)
}

#[tauri::command]
pub async fn store_backup_now(store: State<'_, Arc<Store>>, with_images: bool, label: String) -> Res<crate::store::BackupInfo> {
    let s = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || s.backup_now(with_images, &label).map_err(err)).await.map_err(err)?
}

#[tauri::command]
pub fn store_list_backups(store: State<'_, Arc<Store>>) -> Res<Vec<crate::store::BackupInfo>> {
    store.list_backups().map_err(err)
}

#[tauri::command]
pub async fn store_restore_backup(app: AppHandle, store: State<'_, Arc<Store>>, path: String) -> Res<Vec<String>> {
    let s = store.inner().clone();
    let r = tauri::async_runtime::spawn_blocking(move || s.restore_backup(&path).map_err(err)).await.map_err(err)??;
    let _ = app.emit("sid://store/reload", &r);
    Ok(r)
}

#[tauri::command]
pub async fn store_change_dir(app: AppHandle, store: State<'_, Arc<Store>>, path: String, mode: String) -> Res<String> {
    let s = store.inner().clone();
    let r = tauri::async_runtime::spawn_blocking(move || s.change_data_dir(std::path::Path::new(&path), &mode).map_err(err)).await.map_err(err)??;
    let _ = app.emit("sid://store/reload", Vec::<String>::new());
    Ok(r.to_string_lossy().to_string())
}

#[tauri::command]
pub fn store_save_image(store: State<'_, Arc<Store>>, data_base64: String, ext: String) -> Res<String> {
    let raw = data_base64.split(',').next_back().unwrap_or("");
    let bytes = base64::engine::general_purpose::STANDARD.decode(raw).map_err(err)?;
    if bytes.len() > 40_000_000 {
        return Err("image too large".into());
    }
    store.save_image(&bytes, &ext).map_err(err)
}

#[tauri::command]
pub fn store_save_attachment(store: State<'_, Arc<Store>>, data_base64: String, ext: String) -> Res<String> {
    let raw = data_base64.split(',').next_back().unwrap_or("");
    let bytes = base64::engine::general_purpose::STANDARD.decode(raw).map_err(err)?;
    if bytes.len() > 200_000_000 {
        return Err("attachment too large".into());
    }
    store.save_attachment(&bytes, &ext).map_err(err)
}

#[tauri::command]
pub fn store_image_path(store: State<'_, Arc<Store>>, name: String) -> Res<String> {
    store.image_path(&name).map(|p| p.to_string_lossy().to_string()).map_err(err)
}

#[tauri::command]
pub fn store_delete_image(store: State<'_, Arc<Store>>, name: String) -> Res<()> {
    store.delete_image(&name).map_err(err)
}

#[tauri::command]
pub fn store_list_images(store: State<'_, Arc<Store>>) -> Vec<String> {
    store.list_images()
}

#[tauri::command]
pub fn store_open_folder(store: State<'_, Arc<Store>>, which: String) -> Res<()> {
    let p = match which.as_str() {
        "backups" => store.backups_dir(),
        "logs" => store.logs_dir(),
        "images" => store.images_dir(),
        "config" => store.app_config_dir(),
        _ => store.data_dir(),
    };
    tauri_plugin_opener::open_path(p.to_string_lossy().to_string(), None::<&str>).map_err(err)
}

#[tauri::command]
pub async fn export_markdown(store: State<'_, Arc<Store>>, dir: String) -> Res<crate::export::ExportReport> {
    let s = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || crate::export::export_markdown(&s, std::path::Path::new(&dir)).map_err(err)).await.map_err(err)?
}

#[tauri::command]
pub fn app_log(store: State<'_, Arc<Store>>, line: String) {
    store.append_log(&line);
}

// ---------- focus ----------

#[tauri::command]
pub fn focus_start(engine: State<'_, Arc<focus::FocusEngine>>, config: focus::FocusConfig) -> focus::Snapshot {
    engine.start(config)
}
#[tauri::command]
pub fn focus_pause(engine: State<'_, Arc<focus::FocusEngine>>) -> focus::Snapshot {
    engine.pause()
}
#[tauri::command]
pub fn focus_resume(engine: State<'_, Arc<focus::FocusEngine>>) -> focus::Snapshot {
    engine.resume()
}
#[tauri::command]
pub fn focus_toggle(engine: State<'_, Arc<focus::FocusEngine>>) -> focus::Snapshot {
    engine.toggle()
}
#[tauri::command]
pub fn focus_skip(engine: State<'_, Arc<focus::FocusEngine>>) -> focus::Snapshot {
    engine.skip()
}
#[tauri::command]
pub fn focus_stop(engine: State<'_, Arc<focus::FocusEngine>>, discard: bool) -> focus::Snapshot {
    engine.stop(discard)
}
#[tauri::command]
pub fn focus_extend(engine: State<'_, Arc<focus::FocusEngine>>, secs: i64) -> focus::Snapshot {
    engine.extend(secs)
}
#[tauri::command]
pub fn focus_get(engine: State<'_, Arc<focus::FocusEngine>>) -> focus::Snapshot {
    engine.snapshot()
}

// ---------- media ----------

#[tauri::command]
pub async fn media_state() -> Res<media::MediaState> {
    tauri::async_runtime::spawn_blocking(|| media::read_state(true)).await.map_err(err)
}

#[tauri::command]
pub async fn media_control(action: String, app_id: Option<String>) -> Res<bool> {
    tauri::async_runtime::spawn_blocking(move || media::control(&action, app_id.as_deref())).await.map_err(err)?
}

#[tauri::command]
pub async fn media_set_volume(volume: f32) -> Res<()> {
    tauri::async_runtime::spawn_blocking(move || media::set_volume(volume)).await.map_err(err)?
}

#[tauri::command]
pub async fn media_set_mute(muted: bool) -> Res<()> {
    tauri::async_runtime::spawn_blocking(move || media::set_mute(muted)).await.map_err(err)?
}

#[tauri::command]
pub fn media_set_preferred(app: String) {
    media::set_preferred(&app);
}

// ---------- spotify ----------

#[tauri::command]
pub fn spotify_status() -> spotify::SpotifyStatus {
    spotify::status()
}

#[tauri::command]
pub async fn spotify_connect(app: AppHandle, client_id: String) -> Res<spotify::SpotifyStatus> {
    spotify::connect(app, client_id).await.map_err(err)
}

#[tauri::command]
pub fn spotify_disconnect(app: AppHandle) -> spotify::SpotifyStatus {
    spotify::disconnect();
    let st = spotify::status();
    let _ = app.emit("sid://spotify/status", &st);
    st
}

#[tauri::command]
pub async fn spotify_api(method: String, path: String, body: Option<Value>) -> Res<Value> {
    spotify::api(&method, &path, body).await.map_err(err)
}

#[tauri::command]
pub async fn spotify_control(action: String, context_uri: Option<String>, device_id: Option<String>) -> Res<Value> {
    spotify::control(&action, context_uri, device_id).await.map_err(err)
}

// ---------- system ----------

#[tauri::command]
pub fn system_foreground() -> system::ForegroundInfo {
    system::foreground()
}

#[tauri::command]
pub fn system_monitors() -> Vec<system::MonitorInfo> {
    system::monitors()
}

#[tauri::command]
pub fn system_notification_state() -> String {
    system::notification_state()
}

#[tauri::command]
pub fn system_set_lock_behavior(pause_on_lock: bool, resume_on_unlock: bool) {
    system::PAUSE_FOCUS_ON_LOCK.store(pause_on_lock, Ordering::Relaxed);
    system::RESUME_FOCUS_ON_UNLOCK.store(resume_on_unlock, Ordering::Relaxed);
}

// ---------- clipboard ----------

#[tauri::command]
pub fn clipboard_set_monitoring(enabled: bool, capture_images: bool, ignored: Vec<String>) {
    clipboard::ENABLED.store(enabled, Ordering::Relaxed);
    clipboard::CAPTURE_IMAGES.store(capture_images, Ordering::Relaxed);
    clipboard::set_ignored(ignored);
}

#[tauri::command]
pub async fn clipboard_read_now() -> Res<Option<clipboard::ClipItem>> {
    tauri::async_runtime::spawn_blocking(|| clipboard::read_clipboard(false)).await.map_err(err)
}

#[tauri::command]
pub fn clipboard_write_text(text: String) -> Res<()> {
    clipboard::write_text(&text)
}

#[tauri::command]
pub fn clipboard_default_ignored() -> Vec<String> {
    clipboard::default_ignored()
}

// ---------- calendar & links ----------

#[tauri::command]
pub async fn calendar_fetch(source: calendar::CalendarSource, from: i64, to: i64) -> calendar::FetchResult {
    calendar::fetch_source(source, from, to).await
}

// ---------- Google / Outlook sync ----------

#[tauri::command]
pub fn sync_status(provider: String) -> Res<sync::SyncStatus> {
    sync::status(&provider).map_err(err)
}

#[tauri::command]
pub async fn sync_connect(app: AppHandle, provider: String, client_id: String, client_secret: String) -> Res<sync::SyncStatus> {
    let st = sync::connect(&provider, client_id, client_secret).await.map_err(err)?;
    let _ = app.emit("sid://sync/status", &st);
    Ok(st)
}

#[tauri::command]
pub fn sync_disconnect(app: AppHandle, provider: String) -> Res<sync::SyncStatus> {
    let st = sync::disconnect(&provider).map_err(err)?;
    let _ = app.emit("sid://sync/status", &st);
    Ok(st)
}

#[tauri::command]
pub async fn sync_calendars(provider: String) -> Res<Vec<sync::RemoteCalendar>> {
    sync::calendars(&provider).await.map_err(err)
}

#[tauri::command]
pub async fn sync_fetch(provider: String, calendar_id: String, color: String, from: i64, to: i64) -> Res<Vec<calendar::CalEvent>> {
    sync::fetch(&provider, &calendar_id, &color, from, to).await.map_err(err)
}

#[tauri::command]
pub async fn sync_create(provider: String, calendar_id: String, color: String, title: String, start: i64, end: i64, description: String) -> Res<calendar::CalEvent> {
    sync::create(&provider, &calendar_id, &color, &title, start, end, &description).await.map_err(err)
}

#[tauri::command]
pub async fn sync_update(id: String, color: String, title: Option<String>, start: Option<i64>, end: Option<i64>) -> Res<calendar::CalEvent> {
    sync::update(&id, &color, title, start, end).await.map_err(err)
}

#[tauri::command]
pub async fn sync_delete(id: String) -> Res<()> {
    sync::delete(&id).await.map_err(err)
}

#[tauri::command]
pub fn calendar_detect_meeting(text: String) -> Option<calendar::MeetingLink> {
    calendar::detect_meeting(&[&text])
}

#[tauri::command]
pub async fn link_preview(url: String) -> links::LinkPreview {
    links::fetch(&url).await
}

#[tauri::command]
pub fn link_seed(items: Vec<links::LinkPreview>) {
    links::seed(items);
}

// ---------- windows ----------

#[tauri::command]
pub fn window_show_main(app: AppHandle) {
    windows::show_main(&app);
}
#[tauri::command]
pub fn window_hide_main(app: AppHandle) {
    windows::hide_main(&app);
}
#[tauri::command]
pub fn window_toggle_main(app: AppHandle) {
    windows::toggle_main(&app);
}
#[tauri::command]
pub fn window_minimize_to_bubble(app: AppHandle) {
    windows::minimize_to_bubble(&app);
}
#[tauri::command]
pub fn window_restore_from_bubble(app: AppHandle) {
    windows::remember_bubble(&app);
    windows::show_main(&app);
}
#[tauri::command]
pub fn window_smart_dock(window: WebviewWindow) -> Option<String> {
    let r = windows::smart_dock(&window);
    if window.label() == "main" {
        windows::remember_main(&window);
    }
    r
}
#[tauri::command]
pub fn window_snap(window: WebviewWindow, target: String) -> bool {
    let r = windows::snap(&window, &target).is_some();
    windows::remember_main(&window);
    r
}
#[tauri::command]
pub fn window_next_monitor(window: WebviewWindow) -> bool {
    let r = windows::move_to_next_monitor(&window).is_some();
    windows::remember_main(&window);
    r
}
#[tauri::command]
pub fn window_set_always_on_top(app: AppHandle, on: bool) {
    windows::set_always_on_top(&app, on);
}
#[tauri::command]
pub fn window_set_material(app: AppHandle, material: String, dark: bool) {
    windows::set_material(&app, &material, dark);
}
#[tauri::command]
pub fn window_show_pip(app: AppHandle) {
    windows::show_pip(&app);
}
#[tauri::command]
pub fn window_hide_pip(app: AppHandle) {
    windows::hide_pip(&app);
}
#[tauri::command]
pub fn window_toggle_pip(app: AppHandle) -> bool {
    let visible = app.get_webview_window("pip").map(|w| w.is_visible().unwrap_or(false)).unwrap_or(false);
    if visible {
        windows::hide_pip(&app);
        false
    } else {
        windows::show_pip(&app);
        true
    }
}
#[tauri::command]
pub fn window_show_palette(app: AppHandle, mode: String) {
    windows::show_palette(&app, &mode);
}
#[tauri::command]
pub fn window_hide_palette(app: AppHandle) {
    windows::hide_palette(&app);
}
#[tauri::command]
pub fn window_get_state() -> windows::WindowState {
    windows::state()
}
#[tauri::command]
pub fn window_remember(app: AppHandle, label: String) {
    match label.as_str() {
        "bubble" => windows::remember_bubble(&app),
        "pip" => windows::remember_pip(&app),
        _ => {
            if let Some(w) = app.get_webview_window("main") {
                windows::remember_main(&w);
            }
        }
    }
}
#[tauri::command]
pub fn window_set_close_behavior(app: AppHandle, behavior: String) {
    *app.state::<crate::CloseBehavior>().0.lock() = behavior;
}

// ---------- voice ----------

#[tauri::command]
pub fn voice_status(app: AppHandle) -> voice::VoiceStatus {
    let c = crate::shortcuts::voice_config();
    voice::status(&app, &c.engine, &c.model)
}

#[tauri::command]
pub fn voice_set_config(engine: String, model: String, language: String, keep_audio: bool, device: Option<String>) {
    crate::shortcuts::set_voice_config(crate::shortcuts::VoiceConfig { engine, model, language, keep_audio, device });
}

#[tauri::command]
pub async fn voice_start(app: AppHandle) -> Res<()> {
    let c = crate::shortcuts::voice_config();
    let use_winrt = c.engine == "windows" || (c.engine == "auto" && !voice::model_path(&app, &c.model).exists());
    tauri::async_runtime::spawn_blocking(move || voice::start(&app, c.device.clone(), c.language.clone(), use_winrt).map_err(err)).await.map_err(err)?
}

#[tauri::command]
pub async fn voice_stop(app: AppHandle) -> Res<voice::Transcript> {
    let c = crate::shortcuts::voice_config();
    tauri::async_runtime::spawn_blocking(move || voice::stop_and_transcribe(&app, &c.engine, &c.model, &c.language, c.keep_audio)).await.map_err(err)
}

#[tauri::command]
pub async fn voice_transcribe_file(app: AppHandle, path: String) -> Res<voice::Transcript> {
    let c = crate::shortcuts::voice_config();
    tauri::async_runtime::spawn_blocking(move || voice::transcribe_file(&app, &path, &c.model, &c.language).map_err(err)).await.map_err(err)?
}

#[tauri::command]
pub fn voice_cancel(app: AppHandle) {
    voice::cancel(&app);
}

#[tauri::command]
pub async fn voice_download_model(app: AppHandle, model: String) -> Res<String> {
    voice::download_model(app, model).await.map_err(err)
}

#[tauri::command]
pub fn voice_delete_model(app: AppHandle, model: String) -> Res<()> {
    voice::delete_model(&app, &model).map_err(err)
}

#[tauri::command]
pub fn window_show_voice(app: AppHandle, mode: String) {
    windows::show_voice(&app, &mode);
}

#[tauri::command]
pub fn window_hide_voice(app: AppHandle) {
    windows::hide_voice(&app);
}

// ---------- distraction nudges ----------

#[tauri::command]
pub fn distraction_set_config(enabled: bool, apps: Vec<String>, keywords: Vec<String>, cooldown_min: u32, sound: bool, detect_fullscreen: bool) {
    distraction::set_config(distraction::Config { enabled, apps, keywords, cooldown_min, sound, detect_fullscreen });
}

#[tauri::command]
pub fn nudge_snooze(app: AppHandle) {
    distraction::snooze_current_session(&app);
    windows::hide_nudge(&app);
}

#[tauri::command]
pub fn window_hide_nudge(app: AppHandle) {
    windows::hide_nudge(&app);
}

// ---------- sound & shortcuts ----------

#[tauri::command]
pub fn sound_play(name: String, volume: f32) {
    sound::play(&name, volume);
}

#[tauri::command]
pub fn shortcuts_apply(app: AppHandle, map: HashMap<String, String>) -> Vec<String> {
    crate::shortcuts::apply(&app, map)
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        windows::remember_main(&w);
    }
    app.exit(0);
}

#[tauri::command]
pub fn app_relaunch(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> Value {
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "name": app.package_info().name,
        "pid": std::process::id(),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}
