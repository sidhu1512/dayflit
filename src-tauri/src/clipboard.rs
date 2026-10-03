//! Clipboard capture: listens for WM_CLIPBOARDUPDATE (see system.rs), reads text or image,
//! records the source application/window and emits `sid://clipboard/item`.

use crate::store::Store;
use crate::system;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{Emitter, Manager};

pub static ENABLED: AtomicBool = AtomicBool::new(false);
pub static CAPTURE_IMAGES: AtomicBool = AtomicBool::new(true);
static SEQ: AtomicU64 = AtomicU64::new(0);
static LAST_HASH: AtomicU64 = AtomicU64::new(0);
static IGNORED: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
static SUPPRESS_UNTIL: AtomicU64 = AtomicU64::new(0);

const MAX_TEXT: usize = 200_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipSource {
    pub app: String,
    pub title: String,
    pub exe: String,
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: String,
    /// "text" | "image" | "link"
    pub kind: String,
    pub text: String,
    pub image: Option<String>,
    pub source: ClipSource,
    pub at: i64,
    pub width: u32,
    pub height: u32,
}

pub fn set_ignored(list: Vec<String>) {
    let mut all = default_ignored();
    for s in list {
        let s = s.to_ascii_lowercase();
        if !all.contains(&s) {
            all.push(s);
        }
    }
    *IGNORED.get_or_init(|| Mutex::new(default_ignored())).lock() = all;
}

pub fn default_ignored() -> Vec<String> {
    ["1password.exe", "keepass.exe", "keepassxc.exe", "bitwarden.exe", "dashlane.exe", "lastpass.exe", "nordpass.exe", "enpass.exe", "protonpass.exe", "roboform.exe"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Suppress capture for a short while (used when Sid itself writes to the clipboard).
pub fn suppress(ms: u64) {
    let until = chrono::Utc::now().timestamp_millis() as u64 + ms;
    SUPPRESS_UNTIL.store(until, Ordering::Relaxed);
}

/// Returns the source and whether it came from the actual clipboard owner (vs. the foreground fallback).
fn source_info() -> (ClipSource, bool) {
    #[cfg(windows)]
    {
        use windows::Win32::System::DataExchange::GetClipboardOwner;
        use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GA_ROOT};
        unsafe {
            if let Ok(owner) = GetClipboardOwner() {
                if !owner.is_invalid() {
                    let root = GetAncestor(owner, GA_ROOT);
                    let root = if root.is_invalid() { owner } else { root };
                    let mut info = system::window_info(root);
                    if info.title.is_empty() {
                        // Owner windows are often hidden helpers; fall back to the foreground window title.
                        let fg = system::foreground();
                        if fg.pid == info.pid {
                            info.title = fg.title;
                        }
                    }
                    if !info.exe.is_empty() {
                        return (ClipSource { app: friendly_name(&info.process_name), title: info.title, exe: info.exe, process_name: info.process_name }, true);
                    }
                }
            }
        }
    }
    let fg = system::foreground();
    if fg.process_name.eq_ignore_ascii_case("sid.exe") || fg.process_name.is_empty() {
        // The owner already exited (CLI tools, scripts) and we are in front: don't claim it as ours.
        return (ClipSource { app: "Clipboard".into(), title: String::new(), exe: String::new(), process_name: String::new() }, false);
    }
    (ClipSource { app: friendly_name(&fg.process_name), title: fg.title, exe: fg.exe, process_name: fg.process_name }, false)
}

pub fn friendly_name(process_name: &str) -> String {
    let p = process_name.to_ascii_lowercase();
    let n = p.trim_end_matches(".exe");
    let known = [
        ("chrome", "Google Chrome"),
        ("msedge", "Microsoft Edge"),
        ("firefox", "Firefox"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("code", "VS Code"),
        ("cursor", "Cursor"),
        ("devenv", "Visual Studio"),
        ("notepad", "Notepad"),
        ("notepad++", "Notepad++"),
        ("explorer", "File Explorer"),
        ("outlook", "Outlook"),
        ("olk", "Outlook"),
        ("winword", "Word"),
        ("excel", "Excel"),
        ("powerpnt", "PowerPoint"),
        ("onenote", "OneNote"),
        ("teams", "Microsoft Teams"),
        ("ms-teams", "Microsoft Teams"),
        ("slack", "Slack"),
        ("discord", "Discord"),
        ("spotify", "Spotify"),
        ("windowsterminal", "Terminal"),
        ("powershell", "PowerShell"),
        ("cmd", "Command Prompt"),
        ("acrobat", "Acrobat"),
        ("figma", "Figma"),
        ("obsidian", "Obsidian"),
        ("notion", "Notion"),
        ("telegram", "Telegram"),
        ("whatsapp", "WhatsApp"),
        ("zoom", "Zoom"),
        ("dayflit", "Dayflit"),
        ("sid", "Dayflit"),
    ];
    for (k, v) in known {
        if n == k {
            return v.to_string();
        }
    }
    if n.is_empty() {
        return "Unknown".into();
    }
    let mut c = n.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => "Unknown".into(),
    }
}

fn hash_bytes(b: &[u8]) -> u64 {
    let mut h = DefaultHasher::new();
    b.hash(&mut h);
    h.finish()
}

fn looks_like_url(s: &str) -> bool {
    let t = s.trim();
    !t.contains(char::is_whitespace) && (t.starts_with("http://") || t.starts_with("https://")) && t.len() < 2048
}

/// Called from the message window on every clipboard change. Debounced/coalesced.
pub fn on_update() {
    log::debug!("clipboard update (enabled={})", ENABLED.load(Ordering::Relaxed));
    if !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let now = chrono::Utc::now().timestamp_millis() as u64;
    if now < SUPPRESS_UNTIL.load(Ordering::Relaxed) {
        return;
    }
    let seq = SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(160));
        if SEQ.load(Ordering::Relaxed) != seq {
            return; // superseded by a newer change
        }
        match read_clipboard(true) {
            Some(item) => {
                log::info!("clipboard captured {} from {}", item.kind, item.source.app);
                if let Some(app) = system::app_handle() {
                    let _ = app.emit("sid://clipboard/item", &item);
                }
            }
            None => log::info!("clipboard read returned nothing"),
        }
    });
}

/// Read the clipboard now. `dedupe` skips content identical to the last capture and ignored apps.
pub fn read_clipboard(dedupe: bool) -> Option<ClipItem> {
    let (source, owner_known) = source_info();
    if dedupe {
        let ignored = IGNORED.get_or_init(|| Mutex::new(default_ignored())).lock().clone();
        let pn = source.process_name.to_ascii_lowercase();
        if ignored.iter().any(|i| !i.is_empty() && pn == *i) {
            log::info!("clipboard ignored app {pn}");
            return None;
        }
        if owner_known && source.process_name.eq_ignore_ascii_case("sid.exe") {
            return None;
        }
    }
    let mut cb = arboard::Clipboard::new().ok()?;
    let now = chrono::Utc::now().timestamp_millis();
    if let Ok(text) = cb.get_text() {
        let text = text.trim_end().to_string();
        if text.trim().is_empty() {
            return None;
        }
        let h = hash_bytes(text.as_bytes());
        if dedupe && LAST_HASH.swap(h, Ordering::Relaxed) == h {
            return None;
        }
        LAST_HASH.store(h, Ordering::Relaxed);
        let text: String = if text.len() > MAX_TEXT { text.chars().take(MAX_TEXT).collect() } else { text };
        let kind = if looks_like_url(&text) { "link" } else { "text" };
        return Some(ClipItem { id: uuid::Uuid::new_v4().to_string(), kind: kind.into(), text, image: None, source, at: now, width: 0, height: 0 });
    }
    if !CAPTURE_IMAGES.load(Ordering::Relaxed) && dedupe {
        return None;
    }
    if let Ok(img) = cb.get_image() {
        let (w, h) = (img.width as u32, img.height as u32);
        if w == 0 || h == 0 || w * h > 40_000_000 {
            return None;
        }
        let hash = hash_bytes(&img.bytes[..img.bytes.len().min(65_536)]) ^ ((w as u64) << 32 | h as u64);
        if dedupe && LAST_HASH.swap(hash, Ordering::Relaxed) == hash {
            return None;
        }
        LAST_HASH.store(hash, Ordering::Relaxed);
        let rgba = image::RgbaImage::from_raw(w, h, img.bytes.into_owned())?;
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(rgba).write_to(&mut png, image::ImageFormat::Png).ok()?;
        let app = system::app_handle()?;
        let store = app.state::<Arc<Store>>();
        let name = store.save_image(png.get_ref(), "png").ok()?;
        return Some(ClipItem { id: uuid::Uuid::new_v4().to_string(), kind: "image".into(), text: String::new(), image: Some(name), source, at: now, width: w, height: h });
    }
    None
}

pub fn write_text(text: &str) -> Result<(), String> {
    suppress(600);
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text.to_string()).map_err(|e| e.to_string())
}
