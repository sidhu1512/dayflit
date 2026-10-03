//! Windows system integration: session lock/unlock, power suspend/resume, display on/off,
//! display topology changes, Focus Assist (quiet hours) state, foreground window info and
//! monitor work areas. A hidden message-only window receives the broadcasts.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

pub static PAUSE_FOCUS_ON_LOCK: AtomicBool = AtomicBool::new(true);
pub static RESUME_FOCUS_ON_UNLOCK: AtomicBool = AtomicBool::new(false);
static APP: OnceLock<AppHandle> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundInfo {
    pub title: String,
    pub exe: String,
    pub process_name: String,
    pub pid: u32,
    pub hwnd: isize,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: String,
    pub bounds: Rect,
    pub work_area: Rect,
    pub scale: f64,
    pub primary: bool,
}

fn app() -> Option<&'static AppHandle> {
    APP.get()
}

fn emit<T: Serialize + Clone>(event: &str, payload: T) {
    if let Some(a) = app() {
        let _ = a.emit(event, payload);
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::{w, PCWSTR, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Power::{RegisterPowerSettingNotification, POWERBROADCAST_SETTING};
    use windows::Win32::System::RemoteDesktop::{WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION};
    use windows::Win32::System::SystemServices::GUID_CONSOLE_DISPLAY_STATE;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_ACCEPTS_NOTIFICATIONS, QUNS_APP, QUNS_BUSY, QUNS_NOT_PRESENT, QUNS_PRESENTATION_MODE, QUNS_QUIET_TIME, QUNS_RUNNING_D3D_FULL_SCREEN};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, RegisterClassW, TranslateMessage, DEVICE_NOTIFY_WINDOW_HANDLE, MSG, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_OVERLAPPED,
        PBT_APMRESUMEAUTOMATIC, PBT_APMRESUMESUSPEND, PBT_APMSUSPEND, PBT_POWERSETTINGCHANGE, WM_CLIPBOARDUPDATE, WM_DISPLAYCHANGE, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE, WNDCLASSW, WTS_SESSION_LOCK, WTS_SESSION_UNLOCK,
    };
    use windows::Win32::System::DataExchange::AddClipboardFormatListener;

    unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match msg {
            WM_WTSSESSION_CHANGE => {
                let code = wparam.0 as u32;
                if code == WTS_SESSION_LOCK {
                    emit("sid://system/session", "lock");
                    if let Some(a) = app() {
                        if let Some(engine) = a.try_state::<std::sync::Arc<crate::focus::FocusEngine>>() {
                            engine.on_lock(PAUSE_FOCUS_ON_LOCK.load(Ordering::Relaxed));
                        }
                    }
                } else if code == WTS_SESSION_UNLOCK {
                    emit("sid://system/session", "unlock");
                    if RESUME_FOCUS_ON_UNLOCK.load(Ordering::Relaxed) {
                        if let Some(a) = app() {
                            if let Some(engine) = a.try_state::<std::sync::Arc<crate::focus::FocusEngine>>() {
                                let snap = engine.snapshot();
                                if snap.session.as_ref().map(|s| s.status == crate::focus::Status::Paused).unwrap_or(false) {
                                    engine.resume();
                                }
                            }
                        }
                    }
                }
                LRESULT(0)
            }
            WM_POWERBROADCAST => {
                let code = wparam.0 as u32;
                if code == PBT_APMSUSPEND {
                    emit("sid://system/power", "suspend");
                } else if code == PBT_APMRESUMEAUTOMATIC || code == PBT_APMRESUMESUSPEND {
                    emit("sid://system/power", "resume");
                } else if code == PBT_POWERSETTINGCHANGE && lparam.0 != 0 {
                    let s = &*(lparam.0 as *const POWERBROADCAST_SETTING);
                    if s.PowerSetting == GUID_CONSOLE_DISPLAY_STATE {
                        let v = s.Data[0];
                        emit("sid://system/display", match v { 0 => "off", 1 => "on", 2 => "dim", _ => "unknown" });
                    }
                }
                LRESULT(1)
            }
            WM_DISPLAYCHANGE => {
                emit("sid://system/display-change", monitors());
                LRESULT(0)
            }
            WM_CLIPBOARDUPDATE => {
                crate::clipboard::on_update();
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    pub fn start_message_window() {
        std::thread::Builder::new()
            .name("sid-system-events".into())
            .spawn(|| unsafe {
                let hinstance = GetModuleHandleW(None).unwrap_or_default();
                let class_name = w!("SidSystemEvents");
                let wc = WNDCLASSW { lpfnWndProc: Some(wndproc), hInstance: hinstance.into(), lpszClassName: class_name, ..Default::default() };
                RegisterClassW(&wc);
                // A hidden *top-level* window: message-only windows (HWND_MESSAGE) never receive broadcast
                // messages such as WM_WTSSESSION_CHANGE, WM_POWERBROADCAST or WM_DISPLAYCHANGE.
                let hwnd = match CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, class_name, w!("Sid events"), WS_OVERLAPPED, 0, 0, 0, 0, None, None, Some(hinstance.into()), None) {
                    Ok(h) => h,
                    Err(e) => {
                        log::error!("message window: {e}");
                        return;
                    }
                };
                match WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION) {
                    Ok(()) => log::info!("session notifications registered"),
                    Err(e) => log::warn!("WTSRegisterSessionNotification: {e}"),
                }
                match AddClipboardFormatListener(hwnd) {
                    Ok(()) => log::info!("clipboard listener registered"),
                    Err(e) => log::warn!("AddClipboardFormatListener: {e}"),
                }
                if let Err(e) = RegisterPowerSettingNotification(HANDLE(hwnd.0), &GUID_CONSOLE_DISPLAY_STATE, DEVICE_NOTIFY_WINDOW_HANDLE) {
                    log::warn!("RegisterPowerSettingNotification: {e}");
                }
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            })
            .expect("system events thread");
    }

    pub fn notification_state() -> String {
        unsafe {
            match SHQueryUserNotificationState() {
                Ok(s) => match s {
                    QUNS_NOT_PRESENT => "not_present",
                    QUNS_BUSY => "busy",
                    QUNS_RUNNING_D3D_FULL_SCREEN => "fullscreen",
                    QUNS_PRESENTATION_MODE => "presentation",
                    QUNS_ACCEPTS_NOTIFICATIONS => "accepts",
                    QUNS_QUIET_TIME => "quiet_time",
                    QUNS_APP => "app",
                    _ => "unknown",
                }
                .to_string(),
                Err(_) => "unknown".into(),
            }
        }
    }

    pub fn start_notification_state_poller() {
        std::thread::Builder::new()
            .name("sid-quiet-hours".into())
            .spawn(|| {
                let mut last = String::new();
                loop {
                    let s = notification_state();
                    if s != last {
                        last = s.clone();
                        emit("sid://system/notification-state", s);
                    }
                    std::thread::sleep(std::time::Duration::from_secs(4));
                }
            })
            .expect("quiet hours poller");
    }

    pub fn process_exe(pid: u32) -> String {
        unsafe {
            let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
            let mut buf = vec![0u16; 1024];
            let mut len = buf.len() as u32;
            let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(h);
            if r.is_ok() {
                String::from_utf16_lossy(&buf[..len as usize])
            } else {
                String::new()
            }
        }
    }

    pub fn window_info(hwnd: HWND) -> ForegroundInfo {
        unsafe {
            let len = GetWindowTextLengthW(hwnd);
            let mut buf = vec![0u16; (len.max(0) as usize) + 1];
            let n = GetWindowTextW(hwnd, &mut buf);
            let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let exe = process_exe(pid);
            let process_name = exe.rsplit(['\\', '/']).next().unwrap_or("").to_string();
            ForegroundInfo { title, exe, process_name, pid, hwnd: hwnd.0 as isize }
        }
    }

    pub fn foreground() -> ForegroundInfo {
        unsafe { window_info(GetForegroundWindow()) }
    }

    unsafe extern "system" fn enum_proc(hmon: HMONITOR, _hdc: HDC, _rc: *mut RECT, lp: LPARAM) -> windows::core::BOOL {
        let out = &mut *(lp.0 as *mut Vec<MonitorInfo>);
        let mut mi = MONITORINFOEXW::default();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(hmon, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
            let mut dx = 96u32;
            let mut dy = 96u32;
            let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
            let r = mi.monitorInfo.rcMonitor;
            let w = mi.monitorInfo.rcWork;
            let name_len = mi.szDevice.iter().position(|c| *c == 0).unwrap_or(mi.szDevice.len());
            out.push(MonitorInfo {
                name: String::from_utf16_lossy(&mi.szDevice[..name_len]),
                bounds: Rect { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top },
                work_area: Rect { x: w.left, y: w.top, width: w.right - w.left, height: w.bottom - w.top },
                scale: dx as f64 / 96.0,
                primary: (mi.monitorInfo.dwFlags & 1) != 0,
            });
        }
        true.into()
    }

    pub fn monitors() -> Vec<MonitorInfo> {
        let mut out: Vec<MonitorInfo> = vec![];
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(enum_proc), LPARAM(&mut out as *mut _ as isize));
        }
        out
    }

    #[allow(dead_code)]
    pub fn null_pcwstr() -> PCWSTR {
        PCWSTR::null()
    }
}

#[cfg(windows)]
pub use win::{foreground, monitors, notification_state, window_info};

#[cfg(not(windows))]
pub fn foreground() -> ForegroundInfo {
    ForegroundInfo::default()
}
#[cfg(not(windows))]
pub fn monitors() -> Vec<MonitorInfo> {
    vec![]
}
#[cfg(not(windows))]
pub fn notification_state() -> String {
    "unknown".into()
}
#[cfg(not(windows))]
pub fn process_exe(_pid: u32) -> String {
    String::new()
}

pub fn start(app: AppHandle) {
    let _ = APP.set(app);
    #[cfg(windows)]
    {
        win::start_message_window();
        win::start_notification_state_poller();
    }
}

pub fn app_handle() -> Option<&'static AppHandle> {
    app()
}
