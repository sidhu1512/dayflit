import { create } from "zustand";
import { ipc, isTauri, on } from "@/lib/ipc";
import { loadCollection } from "@/lib/persist";
import { dateKey } from "@/lib/dates";
import type { FocusConfig, FocusHistoryEntry, FocusSnapshot } from "@/lib/types";
import { useSettings } from "./settings";
import { useTasks } from "./tasks";
import { setAmbient, stopAmbient, type AmbientKind } from "@/lib/audio";

interface FocusState {
  snap: FocusSnapshot;
  history: FocusHistoryEntry[];
  loaded: boolean;
  ambientOn: boolean;
  load: () => Promise<void>;
  reloadHistory: () => Promise<void>;
  start: (overrides?: Partial<FocusConfig>) => Promise<void>;
  startForTask: (taskId: string, overrides?: Partial<FocusConfig>) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  toggle: () => Promise<void>;
  skip: () => Promise<void>;
  stop: (discard?: boolean) => Promise<void>;
  extend: (secs: number) => Promise<void>;
  setAmbient: (on: boolean) => void;
  attach: () => Promise<() => void>;
}

const emptySnap: FocusSnapshot = { session: null, remainingSecs: 0, elapsedSecs: 0, endsAt: null, progress: 0, now: Date.now() };

function buildConfig(overrides: Partial<FocusConfig> = {}): FocusConfig {
  const d = useSettings.getState().settings.focus.defaults;
  return { ...d, taskId: null, taskTitle: null, label: null, ...overrides };
}

export const useFocus = create<FocusState>((set, get) => ({
  snap: emptySnap,
  history: [],
  loaded: false,
  ambientOn: false,
  load: async () => {
    const { data } = await loadCollection<FocusHistoryEntry[]>("focus_history", []);
    set({ history: Array.isArray(data) ? data : [], loaded: true });
    if (isTauri) {
      try {
        set({ snap: await ipc.focusGet() });
      } catch {
        /* ignore */
      }
    }
  },
  reloadHistory: async () => {
    const { data } = await loadCollection<FocusHistoryEntry[]>("focus_history", []);
    set({ history: Array.isArray(data) ? data : [] });
  },
  start: async (overrides = {}) => {
    const cfg = buildConfig(overrides);
    const snap = await ipc.focusStart(cfg);
    set({ snap });
    const s = useSettings.getState().settings;
    if (s.focus.ambient.autoStart && s.focus.ambient.kind !== "none") get().setAmbient(true);
    if (s.focus.pipAutoShow) void ipc.showPip().catch(() => {});
  },
  startForTask: async (taskId, overrides = {}) => {
    const t = useTasks.getState().byId(taskId);
    const est = t?.estimateMin;
    const extra: Partial<FocusConfig> = { taskId, taskTitle: t?.title ?? null };
    if (overrides.mode === "deep" && est && est > 0) extra.workSecs = est * 60;
    await get().start({ ...extra, ...overrides });
  },
  pause: async () => set({ snap: await ipc.focusPause() }),
  resume: async () => set({ snap: await ipc.focusResume() }),
  toggle: async () => set({ snap: await ipc.focusToggle() }),
  skip: async () => set({ snap: await ipc.focusSkip() }),
  stop: async (discard = false) => {
    const s = get().snap.session;
    const snap = await ipc.focusStop(discard);
    set({ snap });
    if (get().ambientOn) get().setAmbient(false);
    if (s && useSettings.getState().settings.focus.pipAutoShow) void ipc.hidePip().catch(() => {});
  },
  extend: async (secs) => set({ snap: await ipc.focusExtend(secs) }),
  setAmbient: (on) => {
    const a = useSettings.getState().settings.focus.ambient;
    if (on && a.kind !== "none") setAmbient(a.kind as AmbientKind, a.volume);
    else stopAmbient();
    set({ ambientOn: on && a.kind !== "none" });
  },
  attach: async () => {
    const uns: (() => void)[] = [];
    uns.push(await on<FocusSnapshot>("sid://focus/state", (snap) => set({ snap })));
    uns.push(await on<FocusSnapshot>("sid://focus/tick", (snap) => set({ snap })));
    uns.push(
      await on<FocusHistoryEntry>("sid://focus/history-updated", (entry) => {
        set((s) => ({ history: [...s.history.filter((h) => h.id !== entry.id), entry] }));
        if (entry.taskId && entry.phase === "work") useTasks.getState().addFocusTime(entry.taskId, entry.actualSecs);
      }),
    );
    uns.push(
      await on<{ phase: string; natural: boolean; sessionDone: boolean }>("sid://focus/phase-complete", (p) => {
        const st = useSettings.getState().settings;
        if (p.sessionDone) {
          if (get().ambientOn) get().setAmbient(false);
          if (st.focus.pipAutoShow) void ipc.hidePip().catch(() => {});
        } else if (p.phase === "work" && get().ambientOn) {
          // fade ambient during breaks
          stopAmbient();
        } else if (p.phase !== "work" && get().ambientOn) {
          const a = st.focus.ambient;
          setAmbient(a.kind as AmbientKind, a.volume);
        }
      }),
    );
    return () => uns.forEach((u) => u());
  },
}));

// ---------- stats helpers ----------

export function workEntries(history: FocusHistoryEntry[]) {
  return history.filter((h) => h.phase === "work");
}

export function focusSecondsOn(history: FocusHistoryEntry[], key: string): number {
  return workEntries(history)
    .filter((h) => dateKey(new Date(h.endedAt)) === key)
    .reduce((a, h) => a + h.actualSecs, 0);
}

export function focusByDay(history: FocusHistoryEntry[], days: number, today = new Date()): { key: string; secs: number; sessions: number }[] {
  const out: { key: string; secs: number; sessions: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const entries = workEntries(history).filter((h) => dateKey(new Date(h.endedAt)) === key);
    out.push({ key, secs: entries.reduce((a, h) => a + h.actualSecs, 0), sessions: entries.length });
  }
  return out;
}

export function focusStreak(history: FocusHistoryEntry[], today = new Date()): number {
  let n = 0;
  const d = new Date(today);
  if (focusSecondsOn(history, dateKey(d)) < 60) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    if (focusSecondsOn(history, dateKey(d)) >= 60) n++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function focusByHour(history: FocusHistoryEntry[], days = 30): number[] {
  const cutoff = Date.now() - days * 86_400_000;
  const hours = new Array(24).fill(0) as number[];
  for (const h of workEntries(history)) {
    if (h.endedAt < cutoff) continue;
    hours[new Date(h.startedAt).getHours()] += h.actualSecs;
  }
  return hours;
}

export function focusByTask(history: FocusHistoryEntry[], days = 30): { taskId: string | null; title: string; secs: number; sessions: number }[] {
  const cutoff = Date.now() - days * 86_400_000;
  const map = new Map<string, { taskId: string | null; title: string; secs: number; sessions: number }>();
  for (const h of workEntries(history)) {
    if (h.endedAt < cutoff) continue;
    const key = h.taskId ?? h.label ?? "__none";
    const cur = map.get(key) ?? { taskId: h.taskId, title: h.taskTitle ?? h.label ?? "Unlinked focus", secs: 0, sessions: 0 };
    cur.secs += h.actualSecs;
    cur.sessions++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.secs - a.secs);
}
