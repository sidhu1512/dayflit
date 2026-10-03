//! Windows media integration through the Global System Media Transport Controls (SMTC).
//! Works with Spotify desktop, browsers, Groove, VLC etc. Also exposes system master volume.

use parking_lot::Mutex;
use serde::Serialize;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaSession {
    pub app_id: String,
    pub app_name: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// playing | paused | stopped | closed | opened | changing | unknown
    pub status: String,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub available: bool,
    pub current: Option<MediaSession>,
    pub sessions: Vec<MediaSession>,
    /// data: URL for the current track's artwork
    pub thumbnail: Option<String>,
    pub volume: f32,
    pub muted: bool,
}

static LAST: OnceLock<Mutex<MediaState>> = OnceLock::new();
static THUMB_CACHE: OnceLock<Mutex<(String, Option<String>)>> = OnceLock::new();
/// Preferred app id substring for control routing ("spotify" by default).
static PREFERRED: OnceLock<Mutex<String>> = OnceLock::new();

pub fn last_state() -> MediaState {
    LAST.get_or_init(|| Mutex::new(MediaState::default())).lock().clone()
}

pub fn set_preferred(app: &str) {
    *PREFERRED.get_or_init(|| Mutex::new("spotify".into())).lock() = app.to_ascii_lowercase();
}

fn preferred() -> String {
    PREFERRED.get_or_init(|| Mutex::new("spotify".into())).lock().clone()
}

pub fn friendly_app_name(app_id: &str) -> String {
    let l = app_id.to_ascii_lowercase();
    if l.contains("spotify") {
        "Spotify".into()
    } else if l.contains("chrome") {
        "Chrome".into()
    } else if l.contains("msedge") || l.contains("edge") {
        "Edge".into()
    } else if l.contains("firefox") {
        "Firefox".into()
    } else if l.contains("vlc") {
        "VLC".into()
    } else if l.contains("zunemusic") || l.contains("mediaplayer") {
        "Media Player".into()
    } else if l.contains("itunes") || l.contains("applemusic") || l.contains("apple") {
        "Apple Music".into()
    } else if l.contains("youtube") {
        "YouTube Music".into()
    } else if l.contains("brave") {
        "Brave".into()
    } else if l.contains("opera") {
        "Opera".into()
    } else if l.contains("tidal") {
        "TIDAL".into()
    } else if l.contains("deezer") {
        "Deezer".into()
    } else if l.contains("foobar") {
        "foobar2000".into()
    } else if l.contains("musicbee") {
        "MusicBee".into()
    } else {
        // "Company.App_hash!App" or "app.exe"
        let base = app_id.split('!').next().unwrap_or(app_id);
        let base = base.split('_').next().unwrap_or(base);
        let base = base.rsplit('.').next().unwrap_or(base);
        let base = base.trim_end_matches(".exe");
        let mut c = base.chars();
        match c.next() {
            Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            None => "Media".into(),
        }
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use base64::Engine;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    };
    use windows::Storage::Streams::DataReader;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    thread_local! {
        static INIT: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    }

    pub fn ensure_init() {
        INIT.with(|i| {
            if !i.get() {
                unsafe {
                    let _ = RoInitialize(RO_INIT_MULTITHREADED);
                    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                }
                i.set(true);
            }
        });
    }

    fn manager() -> Option<Manager> {
        ensure_init();
        Manager::RequestAsync().ok()?.join().ok()
    }

    fn status_str(s: PlaybackStatus) -> &'static str {
        match s {
            PlaybackStatus::Playing => "playing",
            PlaybackStatus::Paused => "paused",
            PlaybackStatus::Stopped => "stopped",
            PlaybackStatus::Closed => "closed",
            PlaybackStatus::Opened => "opened",
            PlaybackStatus::Changing => "changing",
            _ => "unknown",
        }
    }

    fn session_info(s: &Session, is_current: bool) -> MediaSession {
        let app_id = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
        let mut info = MediaSession { app_name: friendly_app_name(&app_id), app_id, is_current, ..Default::default() };
        if let Ok(pi) = s.GetPlaybackInfo() {
            if let Ok(st) = pi.PlaybackStatus() {
                info.status = status_str(st).into();
            }
        }
        if let Ok(props) = s.TryGetMediaPropertiesAsync().and_then(|a| a.join()) {
            info.title = props.Title().map(|h| h.to_string()).unwrap_or_default();
            info.artist = props.Artist().map(|h| h.to_string()).unwrap_or_default();
            info.album = props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default();
        }
        if let Ok(tl) = s.GetTimelineProperties() {
            let pos = tl.Position().map(|d| d.Duration / 10_000).unwrap_or(0);
            let end = tl.EndTime().map(|d| d.Duration / 10_000).unwrap_or(0);
            let start = tl.StartTime().map(|d| d.Duration / 10_000).unwrap_or(0);
            // Position is a snapshot at LastUpdatedTime; extrapolate while playing.
            let mut position = pos;
            if info.status == "playing" {
                if let Ok(lu) = tl.LastUpdatedTime() {
                    // DateTime.UniversalTime is 100ns since 1601-01-01
                    let updated_unix_ms = lu.UniversalTime / 10_000 - 11_644_473_600_000;
                    let now = chrono::Utc::now().timestamp_millis();
                    if updated_unix_ms > 0 && now > updated_unix_ms {
                        position = pos + (now - updated_unix_ms).min(end.max(pos));
                    }
                }
            }
            info.position_ms = position.max(0);
            info.duration_ms = (end - start).max(0);
        }
        info
    }

    fn thumbnail(s: &Session) -> Option<String> {
        let props = s.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
        let thumb = props.Thumbnail().ok()?;
        let stream = thumb.OpenReadAsync().ok()?.join().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 4_000_000 {
            return None;
        }
        let ct = stream.ContentType().map(|h| h.to_string()).unwrap_or_else(|_| "image/png".into());
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.join().ok()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;
        let ct = if ct.is_empty() { "image/png".to_string() } else { ct };
        Some(format!("data:{};base64,{}", ct, base64::engine::general_purpose::STANDARD.encode(&buf)))
    }

    pub fn read_state(with_thumb: bool) -> MediaState {
        let mut st = MediaState { volume: get_volume().unwrap_or(0.0), muted: get_mute().unwrap_or(false), ..Default::default() };
        let Some(m) = manager() else { return st };
        let current_id = m.GetCurrentSession().ok().and_then(|s| s.SourceAppUserModelId().ok()).map(|h| h.to_string());
        let mut current_session: Option<Session> = None;
        if let Ok(list) = m.GetSessions() {
            let n = list.Size().unwrap_or(0);
            for i in 0..n {
                if let Ok(s) = list.GetAt(i) {
                    let id = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
                    let is_current = Some(&id) == current_id.as_ref();
                    let info = session_info(&s, is_current);
                    if is_current {
                        current_session = Some(s);
                        st.current = Some(info.clone());
                    }
                    st.sessions.push(info);
                }
            }
        }
        if st.current.is_none() {
            if let Some(first) = st.sessions.first().cloned() {
                st.current = Some(first);
            }
        }
        st.available = !st.sessions.is_empty();
        if with_thumb {
            if let (Some(cur), Some(sess)) = (&st.current, &current_session) {
                let key = format!("{}|{}|{}", cur.app_id, cur.title, cur.artist);
                let cache = THUMB_CACHE.get_or_init(|| Mutex::new((String::new(), None)));
                let cached = cache.lock().clone();
                if cached.0 == key {
                    st.thumbnail = cached.1;
                } else {
                    let t = thumbnail(sess);
                    *cache.lock() = (key, t.clone());
                    st.thumbnail = t;
                }
            }
        } else {
            st.thumbnail = last_state().thumbnail;
        }
        st
    }

    /// Pick the session to control: explicit app id, else preferred app (Spotify), else current.
    fn pick_session(app_id: Option<&str>) -> Option<Session> {
        let m = manager()?;
        let list = m.GetSessions().ok()?;
        let n = list.Size().unwrap_or(0);
        let pref = preferred();
        let mut fallback = None;
        for i in 0..n {
            if let Ok(s) = list.GetAt(i) {
                let id = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default().to_ascii_lowercase();
                if let Some(want) = app_id {
                    if id == want.to_ascii_lowercase() {
                        return Some(s);
                    }
                } else if !pref.is_empty() && id.contains(&pref) {
                    return Some(s);
                }
                if fallback.is_none() {
                    fallback = Some(s);
                }
            }
        }
        if app_id.is_some() {
            return None;
        }
        m.GetCurrentSession().ok().or(fallback)
    }

    pub fn control(action: &str, app_id: Option<&str>) -> Result<bool, String> {
        ensure_init();
        let Some(s) = pick_session(app_id) else { return Ok(false) };
        let r = match action {
            "play" => s.TryPlayAsync(),
            "pause" => s.TryPauseAsync(),
            "toggle" => s.TryTogglePlayPauseAsync(),
            "next" => s.TrySkipNextAsync(),
            "prev" | "previous" => s.TrySkipPreviousAsync(),
            "stop" => s.TryStopAsync(),
            _ => return Err(format!("unknown media action {action}")),
        };
        r.and_then(|a| a.join()).map_err(|e| e.to_string())
    }

    /// Pause every session that is currently playing (used when a focus session ends).
    pub fn pause_all() {
        ensure_init();
        let Some(m) = manager() else { return };
        if let Ok(list) = m.GetSessions() {
            for i in 0..list.Size().unwrap_or(0) {
                if let Ok(s) = list.GetAt(i) {
                    let playing = s.GetPlaybackInfo().and_then(|p| p.PlaybackStatus()).map(|st| st == PlaybackStatus::Playing).unwrap_or(false);
                    if playing {
                        let _ = s.TryPauseAsync().and_then(|a| a.join());
                    }
                }
            }
        }
    }

    fn endpoint() -> windows::core::Result<IAudioEndpointVolume> {
        ensure_init();
        unsafe {
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
            dev.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
        }
    }

    pub fn get_volume() -> Option<f32> {
        unsafe { endpoint().ok()?.GetMasterVolumeLevelScalar().ok() }
    }

    pub fn set_volume(v: f32) -> Result<(), String> {
        unsafe { endpoint().and_then(|e| e.SetMasterVolumeLevelScalar(v.clamp(0.0, 1.0), std::ptr::null())).map_err(|e| e.to_string()) }
    }

    pub fn get_mute() -> Option<bool> {
        unsafe { endpoint().ok()?.GetMute().ok().map(|b| b.as_bool()) }
    }

    pub fn set_mute(m: bool) -> Result<(), String> {
        unsafe { endpoint().and_then(|e| e.SetMute(m, std::ptr::null())).map_err(|e| e.to_string()) }
    }
}

#[cfg(windows)]
pub use win::{control, pause_all, read_state, set_mute, set_volume};

#[cfg(windows)]
pub fn ensure_com() {
    win::ensure_init();
}
#[cfg(not(windows))]
pub fn ensure_com() {}

#[cfg(not(windows))]
pub fn read_state(_with_thumb: bool) -> MediaState {
    MediaState::default()
}
#[cfg(not(windows))]
pub fn control(_a: &str, _app: Option<&str>) -> Result<bool, String> {
    Ok(false)
}
#[cfg(not(windows))]
pub fn pause_all() {}
#[cfg(not(windows))]
pub fn get_volume() -> Option<f32> {
    None
}
#[cfg(not(windows))]
pub fn set_volume(_v: f32) -> Result<(), String> {
    Ok(())
}
#[cfg(not(windows))]
pub fn set_mute(_m: bool) -> Result<(), String> {
    Ok(())
}

pub fn play_async(_app: AppHandle) {
    std::thread::spawn(move || {
        let _ = control("play", None);
    });
}

pub fn pause_async(_app: AppHandle) {
    std::thread::spawn(pause_all);
}

/// Background poller: emits `sid://media/state` whenever the visible state changes.
pub fn start_poller(app: AppHandle) {
    std::thread::Builder::new()
        .name("media-poller".into())
        .spawn(move || {
            let mut last_track = String::new();
            loop {
                let prev = last_state();
                let probe = read_state(false);
                let track_key = probe.current.as_ref().map(|c| format!("{}|{}|{}", c.app_id, c.title, c.artist)).unwrap_or_default();
                let st = if track_key != last_track || (probe.thumbnail.is_none() && probe.current.is_some()) {
                    last_track = track_key;
                    read_state(true)
                } else {
                    probe
                };
                let changed = {
                    let a = &prev;
                    let b = &st;
                    a.available != b.available
                        || a.current.as_ref().map(|c| (c.app_id.clone(), c.title.clone(), c.artist.clone(), c.status.clone(), c.position_ms / 1000, c.duration_ms))
                            != b.current.as_ref().map(|c| (c.app_id.clone(), c.title.clone(), c.artist.clone(), c.status.clone(), c.position_ms / 1000, c.duration_ms))
                        || a.sessions.len() != b.sessions.len()
                        || (a.volume - b.volume).abs() > 0.005
                        || a.muted != b.muted
                        || a.thumbnail != b.thumbnail
                };
                if changed {
                    *LAST.get_or_init(|| Mutex::new(MediaState::default())).lock() = st.clone();
                    let _ = app.emit("sid://media/state", &st);
                }
                std::thread::sleep(Duration::from_millis(1000));
            }
        })
        .expect("media poller");
}
