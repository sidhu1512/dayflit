import { addDays, startOfDay } from "date-fns";
import type { FocusHistoryEntry, Habit, JournalEntry, Task } from "./types";
import { dateKey } from "./dates";
import { isDoneOn, isScheduledOn } from "@/stores/habits";

export interface DayActivity {
  key: string;
  tasksDone: number;
  tasksCreated: number;
  focusSecs: number;
  focusBlocks: number;
  journalEntries: number;
  journalWords: number;
  habitsDone: number;
  habitsScheduled: number;
  /** 0..4 intensity bucket for the heatmap */
  level: number;
  /** weighted score used for levels and streaks */
  score: number;
}

export interface ActivityInputs {
  tasks: Task[];
  history: FocusHistoryEntry[];
  entries: JournalEntry[];
  habits: Habit[];
}

/** Score: a completed task = 1, 25 focus minutes = 1, a journal entry = 1.5, each habit done = 0.5. */
export function scoreOf(d: Omit<DayActivity, "level" | "score" | "key">): number {
  return d.tasksDone + d.focusSecs / 1500 + d.journalEntries * 1.5 + d.habitsDone * 0.5;
}

export function activityByDay(inputs: ActivityInputs, from: Date, to: Date): DayActivity[] {
  const map = new Map<string, DayActivity>();
  const start = startOfDay(from);
  const end = startOfDay(to);
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    map.set(dateKey(d), { key: dateKey(d), tasksDone: 0, tasksCreated: 0, focusSecs: 0, focusBlocks: 0, journalEntries: 0, journalWords: 0, habitsDone: 0, habitsScheduled: 0, level: 0, score: 0 });
  }
  const get = (ts: number) => map.get(dateKey(new Date(ts)));
  for (const t of inputs.tasks) {
    if (t.status === "done" && t.completedAt) {
      const d = get(t.completedAt);
      if (d) d.tasksDone++;
    }
    const c = get(t.createdAt);
    if (c) c.tasksCreated++;
  }
  for (const h of inputs.history) {
    if (h.phase !== "work") continue;
    const d = get(h.endedAt);
    if (d) {
      d.focusSecs += h.actualSecs;
      d.focusBlocks++;
    }
  }
  for (const e of inputs.entries) {
    const d = map.get(e.date);
    if (d) {
      d.journalEntries++;
      d.journalWords += e.body.trim() ? e.body.trim().split(/\s+/).length : 0;
    }
  }
  for (const [key, d] of map) {
    const date = new Date(key + "T00:00:00");
    for (const h of inputs.habits) {
      if (h.archived || dateKey(date) < dateKey(new Date(h.createdAt)) || !isScheduledOn(h, date)) continue;
      d.habitsScheduled++;
      if (isDoneOn(h, key)) d.habitsDone++;
    }
  }
  const list = [...map.values()];
  for (const d of list) d.score = scoreOf(d);
  // Levels relative to the user's own typical day (75th percentile), so a quiet user still sees contrast.
  const scores = list.map((d) => d.score).filter((s) => s > 0).sort((a, b) => a - b);
  const p75 = scores.length ? scores[Math.floor(scores.length * 0.75)] : 1;
  const unit = Math.max(1, p75 / 3);
  for (const d of list) d.level = d.score <= 0 ? 0 : Math.min(4, Math.ceil(d.score / unit));
  return list;
}

export function activityStreak(days: DayActivity[], today = dateKey()): number {
  const byKey = new Map(days.map((d) => [d.key, d]));
  let n = 0;
  let d = new Date(today + "T00:00:00");
  if ((byKey.get(dateKey(d))?.score ?? 0) <= 0) d = addDays(d, -1);
  while ((byKey.get(dateKey(d))?.score ?? 0) > 0) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestStreak(days: DayActivity[]): number {
  let best = 0;
  let cur = 0;
  for (const d of days) {
    if (d.score > 0) {
      cur++;
      best = Math.max(best, cur);
    } else cur = 0;
  }
  return best;
}

export function sum<T>(list: T[], f: (t: T) => number): number {
  return list.reduce((a, x) => a + f(x), 0);
}
