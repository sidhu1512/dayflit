import { create } from "zustand";
import { isTauri } from "./ipc";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string;
}

interface UpdaterState {
  checking: boolean;
  available: UpdateInfo | null;
  downloading: boolean;
  progress: { done: number; total: number | null } | null;
  ready: boolean;
  error: string | null;
  lastChecked: number | null;
  check: (silent?: boolean) => Promise<UpdateInfo | null>;
  install: () => Promise<void>;
  relaunch: () => Promise<void>;
}

// The plugin's Update object is kept outside the store (not serialisable).
let pending: import("@tauri-apps/plugin-updater").Update | null = null;

function friendly(e: unknown): string {
  const s = String(e);
  if (/OWNER\/sid|example\.com|Could not fetch|dns|resolve|404|Not Found|ENOTFOUND|failed to connect/i.test(s)) return "No update server is configured yet. See docs/UPDATES.md to point Dayflit at your releases.";
  if (/signature/i.test(s)) return "The update's signature did not match. The download was discarded.";
  return s;
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  checking: false,
  available: null,
  downloading: false,
  progress: null,
  ready: false,
  error: null,
  lastChecked: null,
  check: async (silent = false) => {
    if (!isTauri || get().checking) return null;
    set({ checking: true, error: null });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const u = await check({ timeout: 15_000 });
      set({ lastChecked: Date.now() });
      if (u) {
        pending = u;
        const info: UpdateInfo = { version: u.version, currentVersion: u.currentVersion, date: u.date ?? null, notes: u.body ?? "" };
        set({ available: info });
        return info;
      }
      set({ available: null });
      return null;
    } catch (e) {
      set({ lastChecked: Date.now() });
      if (!silent) set({ error: friendly(e) });
      return null;
    } finally {
      set({ checking: false });
    }
  },
  install: async () => {
    if (!pending) return;
    set({ downloading: true, progress: { done: 0, total: null }, error: null });
    try {
      let done = 0;
      await pending.downloadAndInstall((ev) => {
        if (ev.event === "Started") set({ progress: { done: 0, total: ev.data.contentLength ?? null } });
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          set((s) => ({ progress: { done, total: s.progress?.total ?? null } }));
        } else if (ev.event === "Finished") set({ ready: true });
      });
      set({ ready: true });
    } catch (e) {
      set({ error: friendly(e) });
    } finally {
      set({ downloading: false });
    }
  },
  relaunch: async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
}));
