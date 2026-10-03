import { create } from "zustand";
import { addDays, startOfDay } from "date-fns";
import { uid } from "@/lib/ids";
import { ipc, isTauri } from "@/lib/ipc";
import { loadCollection, scheduleSave } from "@/lib/persist";
import type { CalEvent, CalendarSource } from "@/lib/types";

export const SOURCE_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171"];

interface CacheEntry {
  events: CalEvent[];
  fetchedAt: number;
  calendarName: string | null;
  error: string | null;
}

interface CalendarState {
  sources: CalendarSource[];
  cache: Record<string, CacheEntry>;
  loaded: boolean;
  refreshing: Record<string, boolean>;
  load: () => Promise<void>;
  addSource: (input: { name: string; url: string; color?: string; kind?: "ics" | "google" | "outlook"; externalId?: string; canEdit?: boolean }) => CalendarSource;
  createEvent: (sourceId: string, title: string, start: number, end: number) => Promise<CalEvent | null>;
  moveEvent: (ev: CalEvent, start: number, end: number) => Promise<boolean>;
  renameEvent: (ev: CalEvent, title: string) => Promise<boolean>;
  deleteEvent: (ev: CalEvent) => Promise<boolean>;
  sourceOf: (ev: CalEvent) => CalendarSource | undefined;
  updateSource: (id: string, patch: Partial<CalendarSource>) => void;
  removeSource: (id: string) => void;
  refresh: (id?: string, force?: boolean) => Promise<void>;
  eventsBetween: (from: number, to: number) => CalEvent[];
}

const RANGE_BACK_DAYS = 30;
const RANGE_AHEAD_DAYS = 120;

export const useCalendar = create<CalendarState>((set, get) => {
  const persistSources = (sources: CalendarSource[]) => {
    set({ sources });
    scheduleSave("calendar_sources", sources);
  };
  const persistCache = (cache: Record<string, CacheEntry>) => {
    set({ cache });
    scheduleSave("calendar_cache", cache);
  };
  return {
    sources: [],
    cache: {},
    loaded: false,
    refreshing: {},
    load: async () => {
      const [s, c] = await Promise.all([loadCollection<CalendarSource[]>("calendar_sources", []), loadCollection<Record<string, CacheEntry>>("calendar_cache", {})]);
      set({ sources: Array.isArray(s.data) ? s.data : [], cache: c.data && typeof c.data === "object" ? c.data : {}, loaded: true });
    },
    addSource: (input) => {
      const src: CalendarSource = {
        id: uid(),
        name: input.name.trim() || "Calendar",
        url: input.url.trim(),
        color: input.color ?? SOURCE_COLORS[get().sources.length % SOURCE_COLORS.length],
        enabled: true,
        refreshMinutes: input.kind && input.kind !== "ics" ? 10 : 30,
        kind: input.kind ?? "ics",
        externalId: input.externalId,
        canEdit: input.canEdit ?? false,
      };
      persistSources([...get().sources, src]);
      void get().refresh(src.id, true);
      return src;
    },
    updateSource: (id, patch) => {
      persistSources(get().sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      if (patch.url) void get().refresh(id, true);
    },
    removeSource: (id) => {
      persistSources(get().sources.filter((s) => s.id !== id));
      const cache = { ...get().cache };
      delete cache[id];
      persistCache(cache);
    },
    refresh: async (id, force = false) => {
      if (!isTauri) return;
      const now = Date.now();
      const from = startOfDay(addDays(new Date(), -RANGE_BACK_DAYS)).getTime();
      const to = startOfDay(addDays(new Date(), RANGE_AHEAD_DAYS)).getTime();
      const targets = get().sources.filter((s) => s.enabled && (!id || s.id === id));
      await Promise.all(
        targets.map(async (src) => {
          const entry = get().cache[src.id];
          const stale = !entry || now - entry.fetchedAt > (src.refreshMinutes || 30) * 60_000;
          if (!force && !stale) return;
          set((s) => ({ refreshing: { ...s.refreshing, [src.id]: true } }));
          try {
            const r =
              src.kind && src.kind !== "ics" && src.externalId
                ? await ipc
                    .syncFetch(src.kind, src.externalId, src.color, from, to)
                    .then((events) => ({ sourceId: src.id, events: events.map((e) => ({ ...e, sourceId: src.id })), fetchedAt: Date.now(), calendarName: null, error: null }))
                    .catch((e) => ({ sourceId: src.id, events: [], fetchedAt: Date.now(), calendarName: null, error: String(e) }))
                : await ipc.calendarFetch(src, from, to);
            const cache = { ...get().cache };
            if (r.error && entry) {
              // keep old events, surface the error
              cache[src.id] = { ...entry, error: r.error };
            } else {
              cache[src.id] = { events: r.events, fetchedAt: r.fetchedAt, calendarName: r.calendarName, error: r.error };
              if (r.calendarName && (src.name === "Calendar" || !src.name)) {
                persistSources(get().sources.map((s) => (s.id === src.id ? { ...s, name: r.calendarName as string } : s)));
              }
            }
            persistCache(cache);
          } finally {
            set((s) => ({ refreshing: { ...s.refreshing, [src.id]: false } }));
          }
        }),
      );
    },
    sourceOf: (ev) => get().sources.find((s) => s.id === ev.sourceId),
    createEvent: async (sourceId, title, start, end) => {
      const src = get().sources.find((s) => s.id === sourceId);
      if (!src || !src.kind || src.kind === "ics" || !src.externalId) return null;
      const ev = await ipc.syncCreate(src.kind, src.externalId, src.color, title, start, end);
      const e = { ...ev, sourceId };
      const cache = { ...get().cache };
      const entry = cache[sourceId] ?? { events: [], fetchedAt: Date.now(), calendarName: null, error: null };
      cache[sourceId] = { ...entry, events: [...entry.events, e] };
      persistCache(cache);
      return e;
    },
    moveEvent: async (ev, start, end) => {
      const src = get().sourceOf(ev);
      if (!src || !src.kind || src.kind === "ics") return false;
      const updated = await ipc.syncUpdate(ev.id, src.color, { start, end });
      const cache = { ...get().cache };
      const entry = cache[src.id];
      if (entry) cache[src.id] = { ...entry, events: entry.events.map((x) => (x.id === ev.id ? { ...updated, sourceId: src.id } : x)) };
      persistCache(cache);
      return true;
    },
    renameEvent: async (ev, title) => {
      const src = get().sourceOf(ev);
      if (!src || !src.kind || src.kind === "ics") return false;
      const updated = await ipc.syncUpdate(ev.id, src.color, { title });
      const cache = { ...get().cache };
      const entry = cache[src.id];
      if (entry) cache[src.id] = { ...entry, events: entry.events.map((x) => (x.id === ev.id ? { ...updated, sourceId: src.id } : x)) };
      persistCache(cache);
      return true;
    },
    deleteEvent: async (ev) => {
      const src = get().sourceOf(ev);
      if (!src || !src.kind || src.kind === "ics") return false;
      await ipc.syncDelete(ev.id);
      const cache = { ...get().cache };
      const entry = cache[src.id];
      if (entry) cache[src.id] = { ...entry, events: entry.events.filter((x) => x.id !== ev.id) };
      persistCache(cache);
      return true;
    },
    eventsBetween: (from, to) => {
      const enabled = new Set(get().sources.filter((s) => s.enabled).map((s) => s.id));
      const out: CalEvent[] = [];
      for (const [sid, entry] of Object.entries(get().cache)) {
        if (!enabled.has(sid)) continue;
        const src = get().sources.find((s) => s.id === sid);
        for (const e of entry.events) if (e.end >= from && e.start <= to) out.push(src ? { ...e, color: src.color } : e);
      }
      return out.sort((a, b) => a.start - b.start);
    },
  };
});

export function eventsOnDay(events: CalEvent[], day: Date): CalEvent[] {
  const s = startOfDay(day).getTime();
  const e = s + 86_400_000;
  return events.filter((ev) => ev.end > s && ev.start < e);
}

export function nextMeeting(events: CalEvent[], now = Date.now(), withinMin = 15): CalEvent | null {
  return events.filter((e) => e.meeting && e.end > now && e.start - now < withinMin * 60_000).sort((a, b) => a.start - b.start)[0] ?? null;
}
