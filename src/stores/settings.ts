import { create } from "zustand";
import { ipc, isTauri } from "@/lib/ipc";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { applyTheme, resolveDark } from "@/lib/themes";
import type { Settings } from "@/lib/types";

export const SETTINGS_VERSION = 1;

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  "toggle-main": "Alt+Space",
  palette: "Ctrl+Shift+Space",
  "quick-task": "Ctrl+Shift+T",
  "quick-note": "Ctrl+Shift+N",
  "capture-clipboard": "Ctrl+Shift+C",
  "voice-capture": "Ctrl+Shift+V",
  "quick-journal": "Ctrl+Shift+J",
  "focus-toggle": "Ctrl+Shift+F",
  "pip-toggle": "Ctrl+Shift+P",
  "bubble-toggle": "",
  "media-toggle": "",
  "media-next": "",
};

export const SHORTCUT_ACTIONS: { id: string; label: string; hint: string }[] = [
  { id: "toggle-main", label: "Show / hide Dayflit", hint: "Brings the workspace forward or collapses it" },
  { id: "palette", label: "Command palette", hint: "Global launcher: search, commands, quick actions" },
  { id: "quick-task", label: "Quick task", hint: "Capture a task from anywhere" },
  { id: "quick-note", label: "Quick note", hint: "Capture a note from anywhere" },
  { id: "capture-clipboard", label: "Capture clipboard", hint: "Grab the clipboard with its source app" },
  { id: "voice-capture", label: "Voice capture (hold)", hint: "Hold to record, release to transcribe" },
  { id: "quick-journal", label: "Quick journal entry", hint: "Write a journal entry from anywhere" },
  { id: "focus-toggle", label: "Start / pause focus", hint: "Toggles the current focus session" },
  { id: "pip-toggle", label: "Floating timer", hint: "Shows or hides the compact timer" },
  { id: "bubble-toggle", label: "Bubble mode", hint: "Collapse to / restore from the bubble" },
  { id: "media-toggle", label: "Play / pause media", hint: "Controls the active media app" },
  { id: "media-next", label: "Next track", hint: "Skips to the next track" },
];

export function defaultSettings(): Settings {
  return {
    appearance: {
      themeId: "graphite",
      mode: "system",
      accent: null,
      opacity: 0.86,
      material: "acrylic",
      density: "comfortable",
      fontSize: 14,
      radius: 18,
      reduceMotion: false,
      fontFamily: "system",
      showBackgroundGlow: true,
    },
    window: {
      alwaysOnTop: false,
      closeBehavior: "bubble",
      startInBubble: false,
      adaptiveOpacity: true,
      inactiveOpacity: 0.72,
      smartDock: true,
      autostart: false,
      bubbleShowsTimer: true,
    },
    focus: {
      defaults: {
        mode: "pomodoro",
        workSecs: 25 * 60,
        shortBreakSecs: 5 * 60,
        longBreakSecs: 15 * 60,
        cyclesBeforeLong: 4,
        targetWorkPhases: 4,
        autoStartBreaks: true,
        autoStartWork: false,
        mediaOnStart: "none",
        mediaOnBreak: "none",
        mediaOnEnd: "pause",
        notify: true,
        sound: "chime",
        soundVolume: 0.7,
      },
      pauseOnLock: true,
      resumeOnUnlock: false,
      pipAutoShow: true,
      minimalUiDuringFocus: true,
      ambient: { kind: "none", volume: 0.5, autoStart: false },
      dailyGoalMin: 120,
    },
    media: { preferredApp: "spotify", spotifyClientId: "", showCard: true },
    clipboard: { enabled: false, captureImages: true, ignoredApps: [], maxItems: 300, notifyOnCapture: false },
    calendar: { weekStartsOn: 1, dayStartHour: 7, dayEndHour: 22, joinReminderMin: 2, showDeclined: false, autoJoin: false, workStartHour: 9, workEndHour: 18, slotMinutes: 30 },
    tasks: { defaultList: "Inbox", lists: ["Inbox", "Work", "Personal"], autoArchiveDoneDays: 30, showCompletedInToday: true, carryOverOverdue: true, defaultEstimateMin: null },
    notifications: { enabled: true, dueReminders: true, reminderMinutesBefore: 10, respectQuietHours: true, habitReminders: true },
    journal: { reminderTime: null, defaultJournalId: null, pinHash: null, lockAfterMin: 10, showOnToday: true },
    voice: { engine: "auto", whisperModel: "base.en", language: "en", keepAudio: true, defaultDestination: "ask", autoSave: false, inputDevice: null },
    distraction: { enabled: true, apps: ["steam.exe", "epicgameslauncher.exe", "discord.exe", "battle.net.exe", "riotclientservices.exe"], keywords: ["YouTube", "Reddit", "Twitter", "X.com", "Instagram", "TikTok", "Facebook", "Netflix", "Twitch", "9GAG"], cooldownMin: 5, sound: false, detectFullscreen: true },
    updates: { autoCheck: true, channel: "stable" },
    shortcuts: { ...DEFAULT_SHORTCUTS },
    onboardingDone: false,
    version: SETTINGS_VERSION,
  };
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = out[k];
    if (b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v)) out[k] = deepMerge(b, v);
    else if (v !== undefined) out[k] = v;
  }
  return out as T;
}

type Patch = { [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K] };

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  recoveredFrom: string | null;
  shortcutFailures: string[];
  load: () => Promise<void>;
  update: (patch: Patch) => void;
  set: (fn: (s: Settings) => Settings) => void;
  applySideEffects: (prev: Settings | null) => Promise<void>;
  reset: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: defaultSettings(),
  loaded: false,
  recoveredFrom: null,
  shortcutFailures: [],
  load: async () => {
    const { data, recoveredFrom } = await loadCollection<Partial<Settings> | null>("settings", null);
    const merged = deepMerge(defaultSettings(), data ?? {});
    merged.shortcuts = { ...DEFAULT_SHORTCUTS, ...(data?.shortcuts ?? {}) };
    set({ settings: merged, loaded: true, recoveredFrom });
    applyTheme(merged.appearance);
    await get().applySideEffects(null);
  },
  update: (patch) => {
    const prev = get().settings;
    const next = deepMerge(prev, patch);
    set({ settings: next });
    scheduleSave("settings", next);
    applyTheme(next.appearance);
    void get().applySideEffects(prev);
  },
  set: (fn) => {
    const prev = get().settings;
    const next = fn(prev);
    set({ settings: next });
    scheduleSave("settings", next);
    applyTheme(next.appearance);
    void get().applySideEffects(prev);
  },
  applySideEffects: async (prev) => {
    const s = get().settings;
    if (!isTauri) return;
    const dark = resolveDark(s.appearance.mode);
    const jobs: Promise<unknown>[] = [];
    if (!prev || prev.appearance.material !== s.appearance.material || resolveDark(prev.appearance.mode) !== dark || prev.appearance.themeId !== s.appearance.themeId) {
      jobs.push(ipc.setMaterial(s.appearance.material, dark).catch(() => {}));
    }
    if (!prev || prev.window.alwaysOnTop !== s.window.alwaysOnTop) jobs.push(ipc.setAlwaysOnTop(s.window.alwaysOnTop).catch(() => {}));
    if (!prev || prev.window.closeBehavior !== s.window.closeBehavior) jobs.push(ipc.setCloseBehavior(s.window.closeBehavior).catch(() => {}));
    if (!prev || prev.focus.pauseOnLock !== s.focus.pauseOnLock || prev.focus.resumeOnUnlock !== s.focus.resumeOnUnlock) {
      jobs.push(ipc.setLockBehavior(s.focus.pauseOnLock, s.focus.resumeOnUnlock).catch(() => {}));
    }
    if (!prev || JSON.stringify(prev.clipboard) !== JSON.stringify(s.clipboard)) {
      jobs.push(ipc.clipboardSetMonitoring(s.clipboard.enabled, s.clipboard.captureImages, s.clipboard.ignoredApps).catch(() => {}));
    }
    if (!prev || prev.media.preferredApp !== s.media.preferredApp) jobs.push(ipc.mediaSetPreferred(s.media.preferredApp).catch(() => {}));
    if (!prev || JSON.stringify(prev.distraction) !== JSON.stringify(s.distraction)) {
      const d = s.distraction;
      jobs.push(ipc.distractionSetConfig(d.enabled, d.apps, d.keywords, d.cooldownMin, d.sound, d.detectFullscreen).catch(() => {}));
    }
    if (!prev || JSON.stringify(prev.voice) !== JSON.stringify(s.voice)) jobs.push(ipc.voiceSetConfig(s.voice.engine, s.voice.whisperModel, s.voice.language, s.voice.keepAudio, s.voice.inputDevice).catch(() => {}));
    if (!prev || JSON.stringify(prev.shortcuts) !== JSON.stringify(s.shortcuts)) {
      jobs.push(
        ipc
          .shortcutsApply(s.shortcuts)
          .then((failed) => set({ shortcutFailures: failed }))
          .catch(() => {}),
      );
    }
    if (!prev || prev.window.autostart !== s.window.autostart) {
      jobs.push(
        import("@tauri-apps/plugin-autostart")
          .then(async (m) => {
            const enabled = await m.isEnabled();
            if (s.window.autostart && !enabled) await m.enable();
            if (!s.window.autostart && enabled) await m.disable();
          })
          .catch(() => {}),
      );
    }
    await Promise.all(jobs);
  },
  reset: () => {
    const prev = get().settings;
    const next = defaultSettings();
    set({ settings: next });
    scheduleSave("settings", next);
    applyTheme(next.appearance);
    void get().applySideEffects(prev);
  },
}));

// React to OS theme changes when in "system" mode.
if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const s = useSettings.getState().settings;
    if (s.appearance.mode === "system") {
      applyTheme(s.appearance);
      if (isTauri) void ipc.setMaterial(s.appearance.material, resolveDark("system")).catch(() => {});
    }
  });
}
