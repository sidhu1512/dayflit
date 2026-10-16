//! Window management: main workspace, bubble (minimized orb), PiP timer and command palette.
//! Handles transparency materials, smart edge docking, multi-monitor clamping and remembering
//! positions in `%APPDATA%\Sid\window_state.json`.

use crate::store::atomic_write;
use crate::system::{self, MonitorInfo};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Anything that can report its outer rect (both `Window` and `WebviewWindow`).
pub trait WindowLike<R: tauri::Runtime> {
    fn rect(&self) -> Option<WinRect>;
}
impl<R: tauri::Runtime> WindowLike<R> for tauri::Window<R> {
    fn rect(&self) -> Option<WinRect> {
        let (p, s) = (self.outer_position().ok()?, self.outer_size().ok()?);
        Some(WinRect { x: p.x, y: p.y, width: s.width, height: s.height })
    }
}
impl<R: tauri::Runtime> WindowLike<R> for tauri::WebviewWindow<R> {
    fn rect(&self) -> Option<WinRect> {
        let (p, s) = (self.outer_position().ok()?, self.outer_size().ok()?);
        Some(WinRect { x: p.x, y: p.y, width: s.width, height: s.height })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WinRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowState {
    pub main: Option<WinRect>,
    pub bubble: Option<WinRect>,
    pub pip: Option<WinRect>,
    /// "main" | "bubble"
    pub mode: String,
    pub always_on_top: bool,
    pub material: String,
    pub dark: bool,
    pub pip_visible: bool,
}

static STATE: OnceLock<Mutex<WindowState>> = OnceLock::new();
static STATE_PATH: OnceLock<PathBuf> = OnceLock::new();

pub const MAIN_DEFAULT: (u32, u32) = (820, 760);
pub const MAIN_MIN: (u32, u32) = (520, 560);
pub const BUBBLE_SIZE: u32 = 84;
pub const PIP_SIZE: (u32, u32) = (460, 60);
pub const PALETTE_SIZE: (u32, u32) = (720, 480);
pub const VOICE_SIZE: (u32, u32) = (500, 280);
pub const NUDGE_SIZE: (u32, u32) = (520, 80);
pub const DOCK_THRESHOLD: i32 = 28;

pub fn init(app: &AppHandle) {
    let path = app.state::<std::sync::Arc<crate::store::Store>>().app_config_dir().join("window_state.json");
    let st = std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str::<WindowState>(&s).ok()).unwrap_or_default();
    let _ = STATE_PATH.set(path);
    let _ = STATE.set(Mutex::new(st));
}

pub fn state() -> WindowState {
    STATE.get().map(|m| m.lock().clone()).unwrap_or_default()
}

static FLUSH_PENDING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Update in-memory state and schedule a debounced write (drag events fire constantly).
pub fn update_state(f: impl FnOnce(&mut WindowState)) {
    if let Some(m) = STATE.get() {
        f(&mut m.lock());
    }
    if !FLUSH_PENDING.swap(true, std::sync::atomic::Ordering::Relaxed) {
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(500));
            FLUSH_PENDING.store(false, std::sync::atomic::Ordering::Relaxed);
            flush_now();
        });
    }
}

pub fn flush_now() {
    if let (Some(m), Some(p)) = (STATE.get(), STATE_PATH.get()) {
        let json = serde_json::to_string_pretty(&*m.lock()).unwrap_or_default();
        let _ = atomic_write(p, json.as_bytes());
    }
}

fn monitor_for_rect(mons: &[MonitorInfo], r: &WinRect) -> Option<MonitorInfo> {
    let cx = r.x + r.width as i32 / 2;
    let cy = r.y + r.height as i32 / 2;
    mons.iter()
        .find(|m| cx >= m.bounds.x && cx < m.bounds.x + m.bounds.width && cy >= m.bounds.y && cy < m.bounds.y + m.bounds.height)
        .cloned()
        .or_else(|| {
            // Best overlap
            mons.iter()
                .max_by_key(|m| {
                    let ox = (r.x + r.width as i32).min(m.bounds.x + m.bounds.width) - r.x.max(m.bounds.x);
                    let oy = (r.y + r.height as i32).min(m.bounds.y + m.bounds.height) - r.y.max(m.bounds.y);
                    if ox > 0 && oy > 0 {
                        ox * oy
                    } else {
                        0
                    }
                })
                .filter(|m| {
                    let ox = (r.x + r.width as i32).min(m.bounds.x + m.bounds.width) - r.x.max(m.bounds.x);
                    let oy = (r.y + r.height as i32).min(m.bounds.y + m.bounds.height) - r.y.max(m.bounds.y);
                    ox > 40 && oy > 40
                })
                .cloned()
        })
}

fn primary(mons: &[MonitorInfo]) -> Option<MonitorInfo> {
    mons.iter().find(|m| m.primary).cloned().or_else(|| mons.first().cloned())
}

/// Clamp an arbitrary window rect so it is fully inside the work area of the monitor it mostly lives on.
/// min_w and min_h specify minimum allowed size.
pub fn clamp_rect_to_monitor(r: WinRect, min_w: u32, min_h: u32) -> WinRect {
    let mons = system::monitors();
    if mons.is_empty() {
        return r;
    }
    let m = monitor_for_rect(&mons, &r).or_else(|| primary(&mons));
    let Some(m) = m else { return r };
    let wa = &m.work_area;
    let b = &m.bounds;
    let w = (r.width as i32).max(min_w as i32).min(b.width) as u32;
    let h = (r.height as i32).max(min_h as i32).min(b.height) as u32;
    let x = r.x.clamp(b.x, b.x + b.width - w as i32);
    // Allow top-docked companion to reach bounds.y (physical top of monitor)
    let min_y = b.y.min(wa.y);
    let max_y = (wa.y + wa.height - h as i32).max(min_y);
    let y = r.y.clamp(min_y, max_y);
    WinRect { x, y, width: w, height: h }
}

/// Clamp a main window rect so it is fully inside the work area of the monitor it mostly lives on,
/// enforcing MAIN_MIN (520x560).
pub fn clamp_to_monitor(r: WinRect) -> WinRect {
    clamp_rect_to_monitor(r, MAIN_MIN.0, MAIN_MIN.1)
}

fn default_main_rect() -> WinRect {
    let mons = system::monitors();
    let m = primary(&mons);
    let (w, h) = MAIN_DEFAULT;
    match m {
        Some(m) => {
            let scale = m.scale;
            let pw = (w as f64 * scale) as u32;
            let ph = ((h as f64 * scale) as i32).min(m.work_area.height - 24) as u32;
            let margin = (16.0 * scale) as i32;
            WinRect { x: m.work_area.x + m.work_area.width - pw as i32 - margin, y: m.work_area.y + margin, width: pw, height: ph }
        }
        None => WinRect { x: 100, y: 100, width: w, height: h },
    }
}

pub fn ensure_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_min_size(Some(LogicalSize::new(MAIN_MIN.0 as f64, MAIN_MIN.1 as f64)));
        let _ = w.set_decorations(false);
        return Ok(w);
    }
    let st = state();
    let rect = clamp_to_monitor(st.main.clone().unwrap_or_else(default_main_rect));
    let w = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("DayFlit")
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .resizable(true)
        .maximizable(false)
        .skip_taskbar(false)
        .always_on_top(st.always_on_top)
        .visible(false)
        .min_inner_size(MAIN_MIN.0 as f64, MAIN_MIN.1 as f64)
        .position(rect.x as f64, rect.y as f64)
        .build()?;
    // Builder .position() takes logical units; set exact physical rect afterwards.
    let _ = w.set_position(PhysicalPosition::new(rect.x, rect.y));
    set_outer_size(&w, rect.width.max(MAIN_MIN.0), rect.height.max(MAIN_MIN.1));
    apply_material(&w, &st.material, st.dark);
    round_corners(&w, true);
    Ok(w)
}

/// Allow the bubble to render its soft drop-shadow with native DWM alpha transparency.
pub fn make_circular(w: &WebviewWindow) {
    let _ = w;
}

pub fn ensure_bubble(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("bubble") {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, "bubble", WebviewUrl::App("bubble.html".into()))
        .title("DayFlit")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .inner_size(BUBBLE_SIZE as f64, BUBBLE_SIZE as f64)
        .build()?;
    make_circular(&w);
    Ok(w)
}

pub fn ensure_pip(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("pip") {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, "pip", WebviewUrl::App("pip.html".into()))
        .title("DayFlit Focus")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .inner_size(PIP_SIZE.0 as f64, PIP_SIZE.1 as f64)
        .build()?;
    round_corners(&w, false);
    Ok(w)
}

pub fn ensure_palette(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("palette") {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, "palette", WebviewUrl::App("palette.html".into()))
        .title("DayFlit Palette")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .inner_size(PALETTE_SIZE.0 as f64, PALETTE_SIZE.1 as f64)
        .build()?;
    round_corners(&w, false);
    Ok(w)
}

/// Difference between the outer (with DWM frame/shadow) and inner size, in physical pixels.
pub fn frame_extents(w: &WebviewWindow) -> (u32, u32) {
    match (w.outer_size(), w.inner_size()) {
        (Ok(o), Ok(i)) => (o.width.saturating_sub(i.width), o.height.saturating_sub(i.height)),
        _ => (0, 0),
    }
}

/// Set the window's *outer* size (what `outer_size` will report afterwards).
pub fn set_outer_size(w: &WebviewWindow, width: u32, height: u32) {
    let (fw, fh) = frame_extents(w);
    let _ = w.set_size(PhysicalSize::new(width.saturating_sub(fw).max(100), height.saturating_sub(fh).max(100)));
}

pub fn ensure_voice(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("voice") {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, "voice", WebviewUrl::App("voice.html".into()))
        .title("DayFlit Voice")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        .maximizable(false)
        .minimizable(false)
        .min_inner_size(360.0, 80.0)
        .max_inner_size(800.0, 700.0)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .inner_size(VOICE_SIZE.0 as f64, VOICE_SIZE.1 as f64)
        .build()?;
    round_corners(&w, false);
    Ok(w)
}

/// Show the voice capture pill near the top of the monitor with the cursor. mode: "hold" | "toggle".
pub fn show_voice(app: &AppHandle, mode: &str) {
    if let Ok(w) = ensure_voice(app) {
        let scale = w.scale_factor().unwrap_or(1.0);
        let initial_w = VOICE_SIZE.0;
        let initial_h = 110u32;
        let pw = ((initial_w as f64) * scale).round() as u32;
        let ph = ((initial_h as f64) * scale).round() as u32;
        let mons = system::monitors();
        let cursor = app.cursor_position().ok();
        let m = cursor
            .and_then(|c| monitor_for_rect(&mons, &WinRect { x: c.x as i32, y: c.y as i32, width: 1, height: 1 }))
            .or_else(|| primary(&mons));
        if let Some(mon) = m {
            let x = mon.work_area.x + (mon.work_area.width - pw as i32) / 2;
            let y = mon.work_area.y + (24.0 * scale) as i32;
            let rect = clamp_rect_to_monitor(WinRect { x, y, width: pw, height: ph }, 200, 80);
            #[cfg(windows)]
            {
                use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
                if let Ok(hwnd) = w.hwnd() {
                    unsafe {
                        let _ = SetWindowPos(
                            hwnd,
                            None,
                            rect.x,
                            rect.y,
                            rect.width as i32,
                            rect.height as i32,
                            SWP_NOACTIVATE | SWP_NOZORDER,
                        );
                    }
                }
            }
            #[cfg(not(windows))]
            {
                let _ = w.set_size(PhysicalSize::new(rect.width, rect.height));
                let _ = w.set_position(PhysicalPosition::new(rect.x, rect.y));
            }
        }
        let _ = w.emit("sid://voice/open", mode);
        let _ = w.show();
        if mode != "hold" {
            let _ = w.set_focus();
        }
    }
}

pub fn resize_voice(app: &AppHandle, target_w: u32, target_h: u32) {
    if let Some(w) = app.get_webview_window("voice") {
        let scale = w.scale_factor().unwrap_or(1.0);
        let phys_w = (target_w as f64 * scale).round() as u32;
        let phys_h = (target_h as f64 * scale).round() as u32;
        if let (Ok(cur_pos), Ok(cur_size)) = (w.outer_position(), w.outer_size()) {
            if cur_size.width == phys_w && cur_size.height == phys_h {
                return;
            }
            // Symmetrical horizontal centering preserving current center
            let center_x = cur_pos.x + cur_size.width as i32 / 2;
            let new_x = center_x - phys_w as i32 / 2;
            let new_y = cur_pos.y;

            let rect = clamp_rect_to_monitor(WinRect { x: new_x, y: new_y, width: phys_w, height: phys_h }, 200, 80);

            #[cfg(windows)]
            {
                use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
                if let Ok(hwnd) = w.hwnd() {
                    unsafe {
                        let _ = SetWindowPos(
                            hwnd,
                            None,
                            rect.x,
                            rect.y,
                            rect.width as i32,
                            rect.height as i32,
                            SWP_NOACTIVATE | SWP_NOZORDER,
                        );
                    }
                }
            }
            #[cfg(not(windows))]
            {
                let _ = w.set_size(PhysicalSize::new(rect.width, rect.height));
                let _ = w.set_position(PhysicalPosition::new(rect.x, rect.y));
            }
        }
    }
}

pub fn hide_voice(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("voice") {
        let _ = w.hide();
    }
}

pub fn ensure_nudge(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("nudge") {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, "nudge", WebviewUrl::App("nudge.html".into()))
        .title("DayFlit")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .inner_size(NUDGE_SIZE.0 as f64, NUDGE_SIZE.1 as f64)
        .build()?;
    round_corners(&w, false);
    Ok(w)
}

/// Show the focus nudge at the top-centre of the monitor with the cursor without stealing focus.
pub fn show_nudge(app: &AppHandle, payload: &crate::distraction::NudgePayload) {
    if let Ok(w) = ensure_nudge(app) {
        let scale = w.scale_factor().unwrap_or(1.0);
        let pw = ((NUDGE_SIZE.0 as f64) * scale) as u32;
        let mons = system::monitors();
        let cursor = app.cursor_position().ok();
        let m = cursor
            .and_then(|c| monitor_for_rect(&mons, &WinRect { x: c.x as i32, y: c.y as i32, width: 1, height: 1 }))
            .or_else(|| primary(&mons));
        if let Some(m) = m {
            let x = m.work_area.x + (m.work_area.width - pw as i32) / 2;
            let y = m.work_area.y + (16.0 * scale) as i32;
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
        let _ = w.emit("sid://nudge/show", payload);
        let _ = w.show();
    }
}

pub fn hide_nudge(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("nudge") {
        let _ = w.hide();
    }
}

pub fn round_corners(w: &WebviewWindow, round: bool) {
    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND};
        if let Ok(hwnd) = w.hwnd() {
            let pref = if round { DWMWCP_ROUND } else { DWMWCP_DONOTROUND };
            unsafe {
                let _ = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &pref as *const _ as *const _, std::mem::size_of_val(&pref) as u32);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (w, round);
    }
}

/// material: "none" | "acrylic" | "mica" | "tabbed" | "blur"
pub fn apply_material(w: &WebviewWindow, material: &str, dark: bool) {
    #[cfg(windows)]
    {
        use window_vibrancy::*;
        let _ = clear_acrylic(w);
        let _ = clear_mica(w);
        let _ = clear_tabbed(w);
        let _ = clear_blur(w);
        let tint = if dark { Some((18u8, 18u8, 24u8, 90u8)) } else { Some((250u8, 250u8, 252u8, 110u8)) };
        let r = match material {
            "acrylic" => apply_acrylic(w, tint).map_err(|e| e.to_string()),
            "mica" => apply_mica(w, Some(dark)).map_err(|e| e.to_string()),
            "tabbed" => apply_tabbed(w, Some(dark)).map_err(|e| e.to_string()),
            "blur" => apply_blur(w, tint).map_err(|e| e.to_string()),
            _ => Ok(()),
        };
        if let Err(e) = r {
            log::warn!("material {material}: {e}");
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (w, material, dark);
    }
}

pub fn show_main(app: &AppHandle) {
    if let Ok(w) = ensure_main(app) {
        // Clamp in case monitors changed while hidden.
        if let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) {
            let r = clamp_to_monitor(WinRect { x: p.x, y: p.y, width: s.width, height: s.height });
            if r.x != p.x || r.y != p.y {
                let _ = w.set_position(PhysicalPosition::new(r.x, r.y));
            }
        }
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        #[cfg(windows)]
        {
            use windows::Win32::UI::WindowsAndMessaging::{BringWindowToTop, SetForegroundWindow, SetWindowPos, HWND_TOP, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW};
            if let Ok(hwnd) = w.hwnd() {
                unsafe {
                    let _ = SetWindowPos(hwnd, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                    let _ = BringWindowToTop(hwnd);
                    let _ = SetForegroundWindow(hwnd);
                }
            }
        }
        if let Some(b) = app.get_webview_window("bubble") {
            let _ = b.hide();
        }
        update_state(|s| s.mode = "main".into());
        let _ = app.emit("sid://window/mode", "main");
    }
}

pub fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        remember_main(&w);
        let _ = w.hide();
    }
}

pub fn remember_main<R: tauri::Runtime>(w: &impl WindowLike<R>) {
    if let Some(r) = w.rect() {
        if r.width > 50 && r.height > 50 && r.x > -30000 {
            update_state(|st| st.main = Some(r));
        }
    }
}

pub fn toggle_main(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(w) if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) => {
            if w.is_focused().unwrap_or(false) {
                minimize_to_bubble(app);
            } else {
                let _ = w.set_focus();
            }
        }
        _ => show_main(app),
    }
}

/// Collapse the main window into the floating bubble.
pub fn minimize_to_bubble(app: &AppHandle) {
    let main = app.get_webview_window("main");
    let mut near: Option<WinRect> = None;
    if let Some(w) = &main {
        remember_main(w);
        if let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) {
            near = Some(WinRect { x: p.x, y: p.y, width: s.width, height: s.height });
        }
        let _ = w.hide();
    }
    if let Ok(b) = ensure_bubble(app) {
        let st = state();
        let scale = b.scale_factor().unwrap_or(1.0);
        let size = (BUBBLE_SIZE as f64 * scale) as u32;
        let rect = match st.bubble {
            Some(r) => WinRect { width: size, height: size, ..r },
            None => match near {
                Some(n) => WinRect { x: n.x + n.width as i32 - size as i32, y: n.y, width: size, height: size },
                None => WinRect { x: 200, y: 200, width: size, height: size },
            },
        };
        let rect = clamp_rect_to_monitor(rect, size, size);
        let _ = b.set_size(PhysicalSize::new(size, size));
        let _ = b.set_position(PhysicalPosition::new(rect.x, rect.y));
        make_circular(&b);
        let _ = b.show();
        update_state(|s| s.mode = "bubble".into());
        let _ = app.emit("sid://window/mode", "bubble");
    }
}

pub fn remember_bubble(app: &AppHandle) {
    if let Some(b) = app.get_webview_window("bubble") {
        if let (Ok(p), Ok(s)) = (b.outer_position(), b.outer_size()) {
            update_state(|st| st.bubble = Some(WinRect { x: p.x, y: p.y, width: s.width, height: s.height }));
        }
    }
}

/// Snap the window flush to a monitor edge if it is within DOCK_THRESHOLD (scaled) of it.
pub fn smart_dock(w: &WebviewWindow) -> Option<String> {
    let (p, s) = (w.outer_position().ok()?, w.outer_size().ok()?);
    let mons = system::monitors();
    let r = WinRect { x: p.x, y: p.y, width: s.width, height: s.height };
    let m = monitor_for_rect(&mons, &r)?;
    let th = (DOCK_THRESHOLD as f64 * m.scale) as i32;
    let wa = &m.work_area;
    let mut x = p.x;
    let mut y = p.y;
    let mut docked = vec![];
    if (p.x - wa.x).abs() <= th {
        x = wa.x;
        docked.push("left");
    } else if ((p.x + s.width as i32) - (wa.x + wa.width)).abs() <= th {
        x = wa.x + wa.width - s.width as i32;
        docked.push("right");
    }
    if (p.y - wa.y).abs() <= th {
        y = wa.y;
        docked.push("top");
    } else if ((p.y + s.height as i32) - (wa.y + wa.height)).abs() <= th {
        y = wa.y + wa.height - s.height as i32;
        docked.push("bottom");
    }
    if docked.is_empty() {
        return None;
    }
    if x != p.x || y != p.y {
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    Some(docked.join("-"))
}

/// Snap to a named edge/corner or "fill-height".
pub fn snap(w: &WebviewWindow, target: &str) -> Option<()> {
    let (p, s) = (w.outer_position().ok()?, w.outer_size().ok()?);
    let mons = system::monitors();
    let r = WinRect { x: p.x, y: p.y, width: s.width, height: s.height };
    let m = monitor_for_rect(&mons, &r).or_else(|| primary(&mons))?;
    let wa = m.work_area.clone();
    let margin = (12.0 * m.scale) as i32;
    let (mut x, mut y, mut width, mut height) = (p.x, p.y, s.width as i32, s.height as i32);
    match target {
        "left" => x = wa.x + margin,
        "right" => x = wa.x + wa.width - width - margin,
        "top" => y = wa.y + margin,
        "bottom" => y = wa.y + wa.height - height - margin,
        "top-left" => {
            x = wa.x + margin;
            y = wa.y + margin;
        }
        "top-right" => {
            x = wa.x + wa.width - width - margin;
            y = wa.y + margin;
        }
        "bottom-left" => {
            x = wa.x + margin;
            y = wa.y + wa.height - height - margin;
        }
        "bottom-right" => {
            x = wa.x + wa.width - width - margin;
            y = wa.y + wa.height - height - margin;
        }
        "center" => {
            x = wa.x + (wa.width - width) / 2;
            y = wa.y + (wa.height - height) / 2;
        }
        "fill-height" => {
            y = wa.y;
            height = wa.height;
        }
        "sidebar-right" => {
            width = width.min(wa.width / 3).max(MAIN_MIN.0 as i32);
            x = wa.x + wa.width - width;
            y = wa.y;
            height = wa.height;
        }
        "sidebar-left" => {
            width = width.min(wa.width / 3).max(MAIN_MIN.0 as i32);
            x = wa.x;
            y = wa.y;
            height = wa.height;
        }
        _ => return None,
    }
    set_outer_size(w, width as u32, height as u32);
    let _ = w.set_position(PhysicalPosition::new(x, y));
    Some(())
}

/// Move the window to the next monitor (same relative position).
pub fn move_to_next_monitor(w: &WebviewWindow) -> Option<()> {
    let (p, s) = (w.outer_position().ok()?, w.outer_size().ok()?);
    let mons = system::monitors();
    if mons.len() < 2 {
        return None;
    }
    let r = WinRect { x: p.x, y: p.y, width: s.width, height: s.height };
    let cur = monitor_for_rect(&mons, &r)?;
    let idx = mons.iter().position(|m| m.name == cur.name)?;
    let next = &mons[(idx + 1) % mons.len()];
    let rel_x = (p.x - cur.work_area.x) as f64 / cur.work_area.width.max(1) as f64;
    let rel_y = (p.y - cur.work_area.y) as f64 / cur.work_area.height.max(1) as f64;
    let nx = next.work_area.x + (rel_x * next.work_area.width as f64) as i32;
    let ny = next.work_area.y + (rel_y * next.work_area.height as f64) as i32;
    let clamped = clamp_rect_to_monitor(WinRect { x: nx, y: ny, width: s.width, height: s.height }, 40, 40);
    let _ = w.set_position(PhysicalPosition::new(clamped.x, clamped.y));
    Some(())
}

pub fn pip_top_center(app: &AppHandle, pw: u32, ph: u32, _scale: f64) -> WinRect {
    let mons = system::monitors();
    let cursor = app.cursor_position().ok();
    let m = cursor
        .and_then(|c| monitor_for_rect(&mons, &WinRect { x: c.x as i32, y: c.y as i32, width: 1, height: 1 }))
        .or_else(|| primary(&mons));
    match m {
        Some(mon) => {
            let x = mon.bounds.x + (mon.bounds.width - pw as i32) / 2;
            let y = mon.bounds.y; // Full top edge flush with screen bezel
            WinRect { x, y, width: pw, height: ph }
        }
        None => WinRect { x: 100, y: 0, width: pw, height: ph },
    }
}

pub fn show_pip(app: &AppHandle) {
    if let Ok(w) = ensure_pip(app) {
        let scale = w.scale_factor().unwrap_or(1.0);
        let (pw, ph) = (((PIP_SIZE.0 as f64) * scale).round() as u32, ((PIP_SIZE.1 as f64) * scale).round() as u32);
        let default_rect = pip_top_center(app, pw, ph, scale);
        let rect = clamp_rect_to_monitor(default_rect, 100, 32);
        let _ = w.set_size(PhysicalSize::new(pw, ph));
        let _ = w.set_position(PhysicalPosition::new(rect.x, rect.y));
        let _ = w.show();
        update_state(|s| {
            s.pip = Some(rect);
            s.pip_visible = true;
        });
    }
}

pub fn snap_pip_top_center(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("pip") {
        let scale = w.scale_factor().unwrap_or(1.0);
        let size = w.outer_size().unwrap_or(PhysicalSize::new(
            ((PIP_SIZE.0 as f64) * scale).round() as u32,
            ((PIP_SIZE.1 as f64) * scale).round() as u32,
        ));
        let rect = pip_top_center(app, size.width, size.height, scale);
        let rect = clamp_rect_to_monitor(rect, 100, 32);
        let _ = w.set_position(PhysicalPosition::new(rect.x, rect.y));
        update_state(|s| s.pip = Some(rect));
    }
}

pub fn adjust_pip_size(app: &AppHandle, target_w: u32, target_h: u32) {
    if let Some(w) = app.get_webview_window("pip") {
        let scale = w.scale_factor().unwrap_or(1.0);
        let phys_w = (target_w as f64 * scale).round() as u32;
        let phys_h = (target_h as f64 * scale).round() as u32;
        if let (Ok(cur_pos), Ok(cur_size)) = (w.outer_position(), w.outer_size()) {
            if cur_size.width == phys_w && cur_size.height == phys_h {
                return;
            }
            let mons = system::monitors();
            let cur_rect = WinRect { x: cur_pos.x, y: cur_pos.y, width: cur_size.width, height: cur_size.height };
            let mon = monitor_for_rect(&mons, &cur_rect).or_else(|| primary(&mons));

            // Symmetrical expansion: if docked near the top, snap to screen top center
            let (new_x, new_y) = match &mon {
                Some(m) if (cur_pos.y - m.bounds.y).abs() <= 50 => {
                    let center_x = m.bounds.x + m.bounds.width / 2;
                    (center_x - phys_w as i32 / 2, m.bounds.y)
                }
                _ => {
                    let center_x = cur_pos.x + cur_size.width as i32 / 2;
                    (center_x - phys_w as i32 / 2, cur_pos.y)
                }
            };
            
            let rect = clamp_rect_to_monitor(WinRect { x: new_x, y: new_y, width: phys_w, height: phys_h }, 100, 32);

            #[cfg(windows)]
            {
                use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOCOPYBITS, SWP_NOZORDER};
                if let Ok(hwnd) = w.hwnd() {
                    unsafe {
                        let _ = SetWindowPos(
                            hwnd,
                            None,
                            rect.x,
                            rect.y,
                            rect.width as i32,
                            rect.height as i32,
                            SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOCOPYBITS,
                        );
                    }
                }
            }
            #[cfg(not(windows))]
            {
                let _ = w.set_size(PhysicalSize::new(rect.width, rect.height));
                let _ = w.set_position(PhysicalPosition::new(rect.x, rect.y));
            }

            update_state(|s| {
                if let Some(p) = &mut s.pip {
                    p.x = rect.x;
                    p.y = rect.y;
                    p.width = rect.width;
                    p.height = rect.height;
                }
            });
        }
    }
}

pub fn hide_pip(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("pip") {
        if let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) {
            update_state(|st| {
                st.pip = Some(WinRect { x: p.x, y: p.y, width: s.width, height: s.height });
                st.pip_visible = false;
            });
        }
        let _ = w.hide();

        let behavior = app.state::<crate::CloseBehavior>().0.lock().clone();
        if behavior == "quit" {
            let main_visible = app.get_webview_window("main").map(|m| m.is_visible().unwrap_or(false)).unwrap_or(false);
            let bubble_visible = app.get_webview_window("bubble").map(|b| b.is_visible().unwrap_or(false)).unwrap_or(false);
            if !main_visible && !bubble_visible {
                flush_now();
                app.exit(0);
            }
        }
    }
}

pub fn remember_pip(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("pip") {
        if let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) {
            update_state(|st| st.pip = Some(WinRect { x: p.x, y: p.y, width: s.width, height: s.height }));
        }
    }
}

/// Show the command palette centred on the monitor that holds the cursor.
pub fn show_palette(app: &AppHandle, mode: &str) {
    if let Ok(w) = ensure_palette(app) {
        let scale = w.scale_factor().unwrap_or(1.0);
        let (pw, ph) = (((PALETTE_SIZE.0 as f64) * scale) as u32, ((PALETTE_SIZE.1 as f64) * scale) as u32);
        let mons = system::monitors();
        let cursor = app.cursor_position().ok();
        let m = cursor
            .and_then(|c| {
                let r = WinRect { x: c.x as i32, y: c.y as i32, width: 1, height: 1 };
                monitor_for_rect(&mons, &r)
            })
            .or_else(|| primary(&mons));
        if let Some(m) = m {
            let x = m.work_area.x + (m.work_area.width - pw as i32) / 2;
            let y = m.work_area.y + (m.work_area.height as f64 * 0.18) as i32;
            let _ = w.set_size(PhysicalSize::new(pw, ph));
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
        let _ = w.emit("sid://palette/open", mode);
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn hide_palette(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("palette") {
        let _ = w.hide();
    }
}

pub fn set_always_on_top(app: &AppHandle, on: bool) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_always_on_top(on);
    }
    update_state(|s| s.always_on_top = on);
}

pub fn set_material(app: &AppHandle, material: &str, dark: bool) {
    if let Some(w) = app.get_webview_window("main") {
        apply_material(&w, material, dark);
    }
    update_state(|s| {
        s.material = material.to_string();
        s.dark = dark;
    });
}

#[allow(dead_code)]
pub fn logical_size(w: &WebviewWindow) -> Option<LogicalSize<f64>> {
    let s = w.inner_size().ok()?;
    let f = w.scale_factor().ok()?;
    Some(s.to_logical(f))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::system::Rect;

    #[test]
    fn test_symmetrical_resize_maintains_center() {
        // Initial state: window at x=800, width=300 -> Center = 950
        let cur_x = 800i32;
        let cur_w = 300i32;
        let cur_center = cur_x + cur_w / 2;

        // Hover expand: width grows to 400
        let target_w = 400i32;
        let new_x = cur_center - target_w / 2;
        let new_center = new_x + target_w / 2;

        assert_eq!(new_x, 750); // expands 50px to the left
        assert_eq!(new_x + target_w, 1150); // expands 50px to the right (800+300=1100 -> 1150)
        assert_eq!(cur_center, new_center, "Center point must remain identical when expanding");

        // Hover unexpand: width shrinks back to 300
        let restore_w = 300i32;
        let restore_x = cur_center - restore_w / 2;
        let restore_center = restore_x + restore_w / 2;

        assert_eq!(restore_x, 800);
        assert_eq!(cur_center, restore_center, "Center point must remain identical when shrinking");
    }

    #[test]
    fn test_top_center_math() {
        let bounds = Rect { x: 0, y: 0, width: 1920, height: 1080 };
        let pw = 344u32;
        let top_center_x = bounds.x + (bounds.width - pw as i32) / 2;
        let top_center_y = bounds.y;

        assert_eq!(top_center_x, (1920 - 344) / 2);
        assert_eq!(top_center_y, 0, "Must be at full top of screen bezel");
        assert_eq!(top_center_x + pw as i32 / 2, 1920 / 2, "Must be horizontally centered on monitor");
    }

    #[test]
    fn test_clamp_rect_does_not_inflate_small_windows() {
        // Pip small window: 344 x 64 at top center
        let pip_rect = WinRect { x: 788, y: 0, width: 344, height: 64 };
        let clamped = clamp_rect_to_monitor(pip_rect.clone(), 100, 32);
        // If clamped used MAIN_MIN it would inflate to 520x560
        assert_eq!(clamped.width, 344, "Small window must NOT be inflated to MAIN_MIN (520)");
        assert_eq!(clamped.height, 64, "Small window must NOT be inflated to MAIN_MIN (560)");
        assert_eq!(clamped.x, 788);
        assert_eq!(clamped.y, 0);
    }

    #[test]
    fn test_voice_window_resize_centering_and_clamping() {
        // Voice initial state: 500x110 centered at top of 1920x1080 display
        let work_area = Rect { x: 0, y: 0, width: 1920, height: 1040 };
        let scale = 1.25f64; // Test fractional DPI scale (125%)
        let cur_w = (500.0 * scale).round() as u32; // 625px
        let _cur_h = (110.0 * scale).round() as u32; // 138px
        let cur_x = work_area.x + (work_area.width - cur_w as i32) / 2; // (1920 - 625) / 2 = 647
        let cur_y = work_area.y + (24.0 * scale) as i32; // 30

        let center_x = cur_x + cur_w as i32 / 2;

        // Transcript expands to 500x260 logical pixels
        let target_w = (500.0 * scale).round() as u32; // 625px
        let target_h = (260.0 * scale).round() as u32; // 325px

        let new_x = center_x - target_w as i32 / 2;
        let new_center = new_x + target_w as i32 / 2;

        assert_eq!((center_x - new_center).abs(), 0, "Horizontal center must remain invariant");
        assert_eq!(new_x, cur_x, "Window x should match since width was constant 500");

        // Verify clamping does not alter coordinates within valid work area
        let voice_rect = WinRect { x: new_x, y: cur_y, width: target_w, height: target_h };
        let clamped = clamp_rect_to_monitor(voice_rect, 200, 80);
        assert_eq!(clamped.width, target_w);
        assert_eq!(clamped.height, target_h);
        assert_eq!(clamped.x, cur_x);
        assert_eq!(clamped.y, cur_y);
    }
}
