import { create } from "zustand";
import { addDays } from "date-fns";
import { uid } from "@/lib/ids";
import { dateKey, parseKey } from "@/lib/dates";
import { loadCollection, scheduleSave } from "@/lib/persist";
import type { Habit, HabitSchedule } from "@/lib/types";
import { HABIT_ICON_NAMES, normalizeHabitIcon } from "@/components/icons";

export type HabitInput = Partial<Omit<Habit, "id" | "createdAt" | "log">> & { name: string };

interface HabitsState {
  habits: Habit[];
  loaded: boolean;
  recoveredFrom: string | null;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  add: (input: HabitInput) => Habit;
  update: (id: string, patch: Partial<Habit>) => void;
  remove: (id: string) => void;
  increment: (id: string, key?: string, delta?: number) => void;
  setCount: (id: string, key: string, count: number) => void;
  toggle: (id: string, key?: string) => void;
  reorder: (ids: string[]) => void;
  byId: (id: string) => Habit | undefined;
}

export const HABIT_ICONS = HABIT_ICON_NAMES;
export const HABIT_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171", "#a3e635", "#e879f9"];

export function makeHabit(input: HabitInput): Habit {
  const t = Date.now();
  return {
    id: uid(),
    name: input.name.trim(),
    icon: normalizeHabitIcon(input.icon),
    color: input.color ?? HABIT_COLORS[Math.floor(Math.random() * HABIT_COLORS.length)],
    schedule: input.schedule ?? { type: "daily" },
    target: Math.max(1, input.target ?? 1),
    unit: input.unit ?? "",
    log: {},
    createdAt: t,
    archived: input.archived ?? false,
    reminderTime: input.reminderTime ?? null,
    order: input.order ?? t,
    notes: input.notes ?? "",
    domainId: input.domainId ?? null,
    goalId: input.goalId ?? null,
  };
}

function normalize(raw: unknown): Habit[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((h) => h && typeof h === "object" && typeof (h as Habit).name === "string").map((h) => ({ ...makeHabit({ name: (h as Habit).name }), ...(h as Habit), icon: normalizeHabitIcon((h as Habit).icon), log: (h as Habit).log ?? {} }));
}

export const useHabits = create<HabitsState>((set, get) => {
  const persist = (habits: Habit[]) => {
    set({ habits });
    scheduleSave("habits", habits);
  };
  return {
    habits: [],
    loaded: false,
    recoveredFrom: null,
    load: async () => {
      const { data, recoveredFrom } = await loadCollection<unknown>("habits", []);
      set({ habits: normalize(data), loaded: true, recoveredFrom });
    },
    reload: async () => {
      const { data } = await loadCollection<unknown>("habits", []);
      set({ habits: normalize(data) });
    },
    add: (input) => {
      const h = makeHabit(input);
      persist([...get().habits, h]);
      return h;
    },
    update: (id, patch) => persist(get().habits.map((h) => (h.id === id ? { ...h, ...patch } : h))),
    remove: (id) => persist(get().habits.filter((h) => h.id !== id)),
    increment: (id, key = dateKey(), delta = 1) => {
      const h = get().byId(id);
      if (!h) return;
      const cur = (h.log ?? {})[key] ?? 0;
      const next = Math.max(0, cur + delta);
      const log = { ...(h.log ?? {}) };
      if (next === 0) delete log[key];
      else log[key] = next;
      get().update(id, { log });
    },
    setCount: (id, key, count) => {
      const h = get().byId(id);
      if (!h) return;
      const log = { ...(h.log ?? {}) };
      if (count <= 0) delete log[key];
      else log[key] = count;
      get().update(id, { log });
    },
    toggle: (id, key = dateKey()) => {
      const h = get().byId(id);
      if (!h) return;
      const cur = (h.log ?? {})[key] ?? 0;
      get().setCount(id, key, cur >= h.target ? 0 : h.target);
    },
    reorder: (ids) => {
      const map = new Map(ids.map((id, i) => [id, i]));
      persist(get().habits.map((h) => (map.has(h.id) ? { ...h, order: map.get(h.id)! } : h)));
    },
    byId: (id) => get().habits.find((h) => h.id === id),
  };
});

// ---------- helpers ----------

export function isScheduledOn(h: Habit, d: Date): boolean {
  const s = h.schedule;
  if (s.type === "daily") return true;
  if (s.type === "weekdays") return s.days.includes(d.getDay());
  return true; // timesPerWeek: any day counts
}

export function isDoneOn(h: Habit, key: string): boolean {
  return ((h.log ?? {})[key] ?? 0) >= h.target;
}

export function describeSchedule(s: HabitSchedule): string {
  if (s.type === "daily") return "Every day";
  if (s.type === "timesPerWeek") return `${s.times}× per week`;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (s.days.length === 7) return "Every day";
  if (s.days.length === 5 && !s.days.includes(0) && !s.days.includes(6)) return "Weekdays";
  return s.days.map((d) => names[d]).join(", ");
}

/** Current streak in days (or weeks for timesPerWeek), counting back from today or yesterday. */
export function streak(h: Habit, today = new Date()): number {
  if (h.schedule.type === "timesPerWeek") {
    // count consecutive weeks meeting the target
    let weeks = 0;
    let cursor = new Date(today);
    cursor.setHours(12, 0, 0, 0);
    for (let i = 0; i < 260; i++) {
      const start = new Date(cursor);
      start.setDate(start.getDate() - ((cursor.getDay() + 6) % 7)); // Monday noon
      let count = 0;
      const dayCursor = new Date(start);
      for (let d = 0; d < 7; d++) {
        if (d > 0) dayCursor.setDate(dayCursor.getDate() + 1);
        if (isDoneOn(h, dateKey(dayCursor))) count++;
      }
      if (count >= h.schedule.times) {
        weeks++;
      } else if (i > 0) {
        break;
      }
      // If i === 0 and count < target, current week is still in progress; continue checking prior weeks
      cursor = new Date(start);
      cursor.setDate(cursor.getDate() - 1);
    }
    return weeks;
  }
  let n = 0;
  let d = new Date(today);
  d.setHours(12, 0, 0, 0);
  // If today isn't done yet, start from yesterday so the streak isn't broken prematurely.
  if (!isDoneOn(h, dateKey(d))) d.setDate(d.getDate() - 1);
  const createdMs = typeof h.createdAt === "number" && !isNaN(h.createdAt) ? h.createdAt : typeof (h as unknown as { created?: number }).created === "number" ? (h as unknown as { created: number }).created : 0;
  const minTime = createdMs > 0 ? createdMs - 86_400_000 * 2 : 0;
  for (let i = 0; i < 3650; i++) {
    const key = dateKey(d);
    if (!isScheduledOn(h, d)) {
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (isDoneOn(h, key)) n++;
    else break;
    d.setDate(d.getDate() - 1);
    if (minTime > 0 && d.getTime() < minTime) break;
  }
  return n;
}

export function completionRate(h: Habit, days = 30, today = new Date()): number {
  let scheduled = 0;
  let done = 0;
  const createdMs = typeof h.createdAt === "number" && !isNaN(h.createdAt) ? h.createdAt : typeof (h as unknown as { created?: number }).created === "number" ? (h as unknown as { created: number }).created : 0;
  const minKey = createdMs > 0 ? dateKey(new Date(createdMs)) : "";
  const d = new Date(today);
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    if (i > 0) d.setDate(d.getDate() - 1);
    const dk = dateKey(d);
    if (minKey && dk < minKey) break;
    if (!isScheduledOn(h, d)) continue;
    scheduled++;
    if (isDoneOn(h, dk)) done++;
  }
  return scheduled ? done / scheduled : 0;
}

export function habitsForDay(habits: Habit[], d: Date): Habit[] {
  return habits.filter((h) => !h.archived && isScheduledOn(h, d)).sort((a, b) => a.order - b.order);
}
