import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CalEvent,
  CalendarSource,
  Clip,
  FocusConfig,
  FocusSnapshot,
  LinkPreview,
  MediaState,
  MeetingLink,
  SpotifyStatus,
  WindowStateInfo,
} from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw new Error(`not in tauri: ${cmd}`);
  return invoke<T>(cmd, args);
}

export interface LoadResult<T = unknown> {
  data: T | null;
  recoveredFrom: string | null;
  savedAt: string | null;
}

export interface DataDirInfo {
  path: string;
  appConfigDir: string;
  imagesDir: string;
  backupsDir: string;
  logsDir: string;
  collections: { name: string; bytes: number; modified: string | null }[];
  totalBytes: number;
  imageCount: number;
}

export interface ExportReport {
  dir: string;
  notes: number;
  journal: number;
  tasks: number;
  habits: number;
  sessions: number;
  clips: number;
  attachments: number;
}

export interface SyncStatus {
  provider: string;
  connected: boolean;
  account: string;
  clientId: string;
  redirectUri: string;
}

export interface RemoteCalendar {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  canEdit: boolean;
}

export interface BackupInfo {
  file: string;
  path: string;
  createdAt: string;
  size: number;
}

export interface MonitorInfo {
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scale: number;
  primary: boolean;
}

export interface ForegroundInfo {
  title: string;
  exe: string;
  processName: string;
  pid: number;
  hwnd: number;
}

export interface FetchResult {
  sourceId: string;
  events: CalEvent[];
  fetchedAt: number;
  calendarName: string | null;
  error: string | null;
}

export type RawClip = Omit<Clip, "pinned" | "convertedTo">;

export interface VoiceStatus {
  recording: boolean;
  transcribing: boolean;
  engine: string;
  whisperModel: string;
  whisperReady: boolean;
  modelsDir: string;
  devices: string[];
  elapsedMs: number;
}

export interface VoiceTranscript {
  text: string;
  engine: string;
  durationMs: number;
  audio: string | null;
  error: string | null;
}

export const ipc = {
  // store
  load: <T>(name: string) => call<LoadResult<T>>("store_load", { name }),
  save: (name: string, data: unknown) => call<void>("store_save", { name, data }),
  storeInfo: () => call<DataDirInfo>("store_info"),
  backupNow: (withImages: boolean, label = "") => call<BackupInfo>("store_backup_now", { withImages, label }),
  listBackups: () => call<BackupInfo[]>("store_list_backups"),
  restoreBackup: (path: string) => call<string[]>("store_restore_backup", { path }),
  changeDataDir: (path: string, mode: "move" | "copy" | "adopt") => call<string>("store_change_dir", { path, mode }),
  saveImage: (dataBase64: string, ext: string) => call<string>("store_save_image", { dataBase64, ext }),
  saveAttachment: (dataBase64: string, ext: string) => call<string>("store_save_attachment", { dataBase64, ext }),
  imagePath: (name: string) => call<string>("store_image_path", { name }),
  deleteImage: (name: string) => call<void>("store_delete_image", { name }),
  listImages: () => call<string[]>("store_list_images"),
  openFolder: (which: "data" | "backups" | "logs" | "images" | "config") => call<void>("store_open_folder", { which }),
  log: (line: string) => call<void>("app_log", { line }).catch(() => {}),
  exportMarkdown: (dir: string) => call<ExportReport>("export_markdown", { dir }),

  // focus
  focusStart: (config: FocusConfig) => call<FocusSnapshot>("focus_start", { config }),
  focusPause: () => call<FocusSnapshot>("focus_pause"),
  focusResume: () => call<FocusSnapshot>("focus_resume"),
  focusToggle: () => call<FocusSnapshot>("focus_toggle"),
  focusSkip: () => call<FocusSnapshot>("focus_skip"),
  focusStop: (discard: boolean) => call<FocusSnapshot>("focus_stop", { discard }),
  focusExtend: (secs: number) => call<FocusSnapshot>("focus_extend", { secs }),
  focusGet: () => call<FocusSnapshot>("focus_get"),

  // media
  mediaState: () => call<MediaState>("media_state"),
  mediaControl: (action: string, appId?: string) => call<boolean>("media_control", { action, appId: appId ?? null }),
  mediaSetVolume: (volume: number) => call<void>("media_set_volume", { volume }),
  mediaSetMute: (muted: boolean) => call<void>("media_set_mute", { muted }),
  mediaSetPreferred: (app: string) => call<void>("media_set_preferred", { app }),

  // spotify
  spotifyStatus: () => call<SpotifyStatus>("spotify_status"),
  spotifyConnect: (clientId: string) => call<SpotifyStatus>("spotify_connect", { clientId }),
  spotifyDisconnect: () => call<SpotifyStatus>("spotify_disconnect"),
  spotifyApi: <T = unknown>(method: string, path: string, body?: unknown) => call<T>("spotify_api", { method, path, body: body ?? null }),
  spotifyControl: (action: string, contextUri?: string, deviceId?: string) =>
    call<unknown>("spotify_control", { action, contextUri: contextUri ?? null, deviceId: deviceId ?? null }),

  // system
  foreground: () => call<ForegroundInfo>("system_foreground"),
  monitors: () => call<MonitorInfo[]>("system_monitors"),
  notificationState: () => call<string>("system_notification_state"),
  setLockBehavior: (pauseOnLock: boolean, resumeOnUnlock: boolean) => call<void>("system_set_lock_behavior", { pauseOnLock, resumeOnUnlock }),

  // clipboard
  clipboardSetMonitoring: (enabled: boolean, captureImages: boolean, ignored: string[]) =>
    call<void>("clipboard_set_monitoring", { enabled, captureImages, ignored }),
  clipboardReadNow: () => call<RawClip | null>("clipboard_read_now"),
  clipboardWriteText: (text: string) => call<void>("clipboard_write_text", { text }),
  clipboardDefaultIgnored: () => call<string[]>("clipboard_default_ignored"),

  // calendar / links
  calendarFetch: (source: CalendarSource, from: number, to: number) => call<FetchResult>("calendar_fetch", { source, from, to }),
  syncStatus: (provider: string) => call<SyncStatus>("sync_status", { provider }),
  syncConnect: (provider: string, clientId: string, clientSecret: string) => call<SyncStatus>("sync_connect", { provider, clientId, clientSecret }),
  syncDisconnect: (provider: string) => call<SyncStatus>("sync_disconnect", { provider }),
  syncCalendars: (provider: string) => call<RemoteCalendar[]>("sync_calendars", { provider }),
  syncFetch: (provider: string, calendarId: string, color: string, from: number, to: number) => call<CalEvent[]>("sync_fetch", { provider, calendarId, color, from, to }),
  syncCreate: (provider: string, calendarId: string, color: string, title: string, start: number, end: number, description = "") =>
    call<CalEvent>("sync_create", { provider, calendarId, color, title, start, end, description }),
  syncUpdate: (id: string, color: string, patch: { title?: string; start?: number; end?: number }) =>
    call<CalEvent>("sync_update", { id, color, title: patch.title ?? null, start: patch.start ?? null, end: patch.end ?? null }),
  syncDelete: (id: string) => call<void>("sync_delete", { id }),
  detectMeeting: (text: string) => call<MeetingLink | null>("calendar_detect_meeting", { text }),
  linkPreview: (url: string) => call<LinkPreview>("link_preview", { url }),
  linkSeed: (items: LinkPreview[]) => call<void>("link_seed", { items }),

  // windows
  showMain: () => call<void>("window_show_main"),
  hideMain: () => call<void>("window_hide_main"),
  toggleMain: () => call<void>("window_toggle_main"),
  minimizeToBubble: () => call<void>("window_minimize_to_bubble"),
  restoreFromBubble: () => call<void>("window_restore_from_bubble"),
  smartDock: () => call<string | null>("window_smart_dock"),
  snap: (target: string) => call<boolean>("window_snap", { target }),
  nextMonitor: () => call<boolean>("window_next_monitor"),
  setAlwaysOnTop: (on: boolean) => call<void>("window_set_always_on_top", { on }),
  setMaterial: (material: string, dark: boolean) => call<void>("window_set_material", { material, dark }),
  showPip: () => call<void>("window_show_pip"),
  hidePip: () => call<void>("window_hide_pip"),
  togglePip: () => call<boolean>("window_toggle_pip"),
  showPalette: (mode: string) => call<void>("window_show_palette", { mode }),
  hidePalette: () => call<void>("window_hide_palette"),
  windowState: () => call<WindowStateInfo>("window_get_state"),
  rememberWindow: (label: string) => call<void>("window_remember", { label }),
  setCloseBehavior: (behavior: string) => call<void>("window_set_close_behavior", { behavior }),

  // voice
  voiceStatus: () => call<VoiceStatus>("voice_status"),
  voiceSetConfig: (engine: string, model: string, language: string, keepAudio: boolean, device: string | null) =>
    call<void>("voice_set_config", { engine, model, language, keepAudio, device }),
  voiceStart: () => call<void>("voice_start"),
  voiceStop: () => call<VoiceTranscript>("voice_stop"),
  voiceCancel: () => call<void>("voice_cancel"),
  voiceTranscribeFile: (path: string) => call<VoiceTranscript>("voice_transcribe_file", { path }),
  voiceDownloadModel: (model: string) => call<string>("voice_download_model", { model }),
  voiceDeleteModel: (model: string) => call<void>("voice_delete_model", { model }),
  showVoice: (mode: "hold" | "toggle") => call<void>("window_show_voice", { mode }),
  hideNudge: () => call<void>("window_hide_nudge"),
  nudgeSnooze: () => call<void>("nudge_snooze"),
  distractionSetConfig: (enabled: boolean, apps: string[], keywords: string[], cooldownMin: number, sound: boolean, detectFullscreen: boolean) =>
    call<void>("distraction_set_config", { enabled, apps, keywords, cooldownMin, sound, detectFullscreen }),
  hideVoice: () => call<void>("window_hide_voice"),

  // misc
  soundPlay: (name: string, volume: number) => call<void>("sound_play", { name, volume }),
  shortcutsApply: (map: Record<string, string>) => call<string[]>("shortcuts_apply", { map }),
  quit: () => call<void>("app_quit"),
  relaunch: () => call<void>("app_relaunch"),
  appInfo: () => call<{ version: string; name: string; pid: number; os: string; arch: string }>("app_info"),
};

export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!isTauri) return Promise.resolve(() => {});
  return listen<T>(event, (e) => handler(e.payload));
}
