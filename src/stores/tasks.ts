import { create } from "zustand";
import { uid } from "@/lib/ids";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { dateKey, parseDue, parseKey, toDueString } from "@/lib/dates";
import { parseQuickAdd, type ParsedTask } from "@/lib/nlp";
import { nextOccurrence, normalizeMonthly } from "@/lib/recurrence";
import type { CaptureSource, Priority, Subtask, Task } from "@/lib/types";
import { useSettings } from "./settings";

export type TaskInput = Partial<Omit<Task, "id" | "createdAt" | "updatedAt">> & { title: string };

interface TasksState {
  tasks: Task[];
  loaded: boolean;
  recoveredFrom: string | null;
  undoStack: { label: string; tasks: Task[] }[];
  load: () => Promise<void>;
  reload: () => Promise<void>;
  add: (input: TaskInput) => Task;
  quickAdd: (text: string, extra?: Partial<Task>) => Task | null;
  update: (id: string, patch: Partial<Task>) => void;
  remove: (id: string) => void;
  complete: (id: string) => Task | null;
  uncomplete: (id: string) => void;
  toggle: (id: string) => void;
  snooze: (id: string, until: number | null) => void;
  reschedule: (id: string, due: string | null, hasTime?: boolean) => void;
  reorder: (ids: string[]) => void;
  addFocusTime: (id: string, secs: number) => void;
  addSubtask: (id: string, title: string) => void;
  toggleSubtask: (id: string, subId: string) => void;
  removeSubtask: (id: string, subId: string) => void;
  duplicate: (id: string) => Task | null;
  bulk: (ids: string[], patch: Partial<Task>) => void;
  undo: () => boolean;
  archiveOld: (days: number) => number;
  byId: (id: string) => Task | undefined;
}

function now() {
  return Date.now();
}

function snapshot(get: () => TasksState, label: string) {
  const s = get();
  return [...s.undoStack.slice(-19), { label, tasks: s.tasks }];
}

export function makeTask(input: TaskInput): Task {
  const t = now();
  return {
    id: uid(),
    title: input.title.trim(),
    notes: input.notes ?? "",
    status: input.status ?? "open",
    priority: input.priority ?? "none",
    due: input.due ?? null,
    hasTime: input.hasTime ?? false,
    tags: input.tags ?? [],
    list: input.list ?? useSettings.getState().settings.tasks.defaultList,
    recurrence: input.recurrence ?? null,
    createdAt: t,
    updatedAt: t,
    completedAt: input.completedAt ?? null,
    order: input.order ?? t,
    estimateMin: input.estimateMin ?? null,
    focusSecs: input.focusSecs ?? 0,
    subtasks: input.subtasks ?? [],
    links: input.links ?? [],
    images: input.images ?? [],
    source: input.source ?? null,
    snoozedUntil: input.snoozedUntil ?? null,
    pinned: input.pinned ?? false,
    backlog: input.backlog ?? false,
    completions: input.completions ?? 0,
  };
}

function normalize(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object" && typeof (t as Task).title === "string")
    .map((t) => ({ ...makeTask({ title: (t as Task).title }), ...(t as Task) }));
}

export function parsedToInput(p: ParsedTask, extra: Partial<Task> = {}): TaskInput {
  return {
    title: p.title || "Untitled task",
    due: p.due,
    hasTime: p.hasTime,
    priority: p.priority !== "none" ? p.priority : (extra.priority ?? "none"),
    tags: [...new Set([...(extra.tags ?? []), ...p.tags])],
    list: p.list ?? extra.list,
    recurrence: p.recurrence ?? extra.recurrence ?? null,
    estimateMin: p.estimateMin ?? extra.estimateMin ?? null,
    backlog: p.backlog || !!extra.backlog,
    ...extra,
    ...(p.due ? { due: p.due, hasTime: p.hasTime } : {}),
    ...(p.backlog ? { due: null, hasTime: false, backlog: true } : {}),
  };
}

export const useTasks = create<TasksState>((set, get) => {
  const persist = (tasks: Task[]) => {
    set({ tasks });
    scheduleSave("tasks", tasks);
  };
  return {
    tasks: [],
    loaded: false,
    recoveredFrom: null,
    undoStack: [],
    load: async () => {
      const { data, recoveredFrom } = await loadCollection<unknown>("tasks", []);
      set({ tasks: normalize(data), loaded: true, recoveredFrom });
    },
    reload: async () => {
      const { data } = await loadCollection<unknown>("tasks", []);
      set({ tasks: normalize(data) });
    },
    add: (input) => {
      const t = makeTask(input);
      persist([t, ...get().tasks]);
      return t;
    },
    quickAdd: (text, extra = {}) => {
      if (!text.trim()) return null;
      const lists = useSettings.getState().settings.tasks.lists;
      const p = parseQuickAdd(text, { knownLists: lists });
      const input = parsedToInput(p, extra);
      if (input.list && !lists.includes(input.list)) {
        useSettings.getState().set((s) => ({ ...s, tasks: { ...s.tasks, lists: [...s.tasks.lists, input.list as string] } }));
      }
      return get().add(input);
    },
    update: (id, patch) => {
      persist(get().tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now() } : t)));
    },
    remove: (id) => {
      set({ undoStack: snapshot(get, "Delete task") });
      persist(get().tasks.filter((t) => t.id !== id));
    },
    complete: (id) => {
      const t = get().tasks.find((x) => x.id === id);
      if (!t || t.status === "done") return null;
      const ts = now();
      let spawned: Task | null = null;
      let updated: Task = { ...t, status: "done", completedAt: ts, updatedAt: ts, snoozedUntil: null };
      if (t.recurrence) {
        const rec = normalizeMonthly(t.recurrence, parseDue(t.due) ?? new Date());
        const base = rec.mode === "completion" || !t.due ? new Date() : (parseDue(t.due) as Date);
        if (t.hasTime && rec.mode === "completion" && t.due) {
          const d = parseDue(t.due)!;
          base.setHours(d.getHours(), d.getMinutes(), 0, 0);
        }
        const next = nextOccurrence(rec, base);
        if (next) {
          // The task itself rolls forward; a done copy is recorded for history.
          spawned = { ...t, id: uid(), status: "done", completedAt: ts, updatedAt: ts, recurrence: null, subtasks: t.subtasks.map((s) => ({ ...s, done: true })) };
          updated = {
            ...t,
            due: toDueString(next, t.hasTime),
            updatedAt: ts,
            completions: (t.completions ?? 0) + 1,
            subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
            snoozedUntil: null,
            focusSecs: 0,
          };
        }
      }
      const rest = get().tasks.map((x) => (x.id === id ? updated : x));
      persist(spawned ? [spawned, ...rest] : rest);
      return spawned ?? updated;
    },
    uncomplete: (id) => {
      persist(get().tasks.map((t) => (t.id === id ? { ...t, status: "open", completedAt: null, updatedAt: now() } : t)));
    },
    toggle: (id) => {
      const t = get().tasks.find((x) => x.id === id);
      if (!t) return;
      if (t.status === "done") get().uncomplete(id);
      else get().complete(id);
    },
    snooze: (id, until) => get().update(id, { snoozedUntil: until }),
    reschedule: (id, due, hasTime) => {
      const t = get().byId(id);
      if (!t) return;
      let next = due;
      let ht = hasTime ?? (due ? t.hasTime : false);
      // Keep the time of day when moving a timed task to another date.
      if (due && due.length <= 10 && hasTime === undefined && t.hasTime && t.due) {
        const old = parseDue(t.due);
        const d = parseKey(due);
        if (old) {
          d.setHours(old.getHours(), old.getMinutes(), 0, 0);
          next = toDueString(d, true);
          ht = true;
        }
      }
      get().update(id, { due: next, hasTime: ht, backlog: next ? false : t.backlog, snoozedUntil: null });
    },
    reorder: (ids) => {
      const base = now();
      const orderMap = new Map(ids.map((id, i) => [id, base - ids.length + i]));
      persist(get().tasks.map((t) => (orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t)));
    },
    addFocusTime: (id, secs) => {
      const t = get().byId(id);
      if (t) get().update(id, { focusSecs: (t.focusSecs ?? 0) + secs });
    },
    addSubtask: (id, title) => {
      const t = get().byId(id);
      if (!t || !title.trim()) return;
      const s: Subtask = { id: uid(), title: title.trim(), done: false };
      get().update(id, { subtasks: [...t.subtasks, s] });
    },
    toggleSubtask: (id, subId) => {
      const t = get().byId(id);
      if (!t) return;
      get().update(id, { subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) });
    },
    removeSubtask: (id, subId) => {
      const t = get().byId(id);
      if (!t) return;
      get().update(id, { subtasks: t.subtasks.filter((s) => s.id !== subId) });
    },
    duplicate: (id) => {
      const t = get().byId(id);
      if (!t) return null;
      const copy = makeTask({ ...t, title: t.title, status: "open", completedAt: null, focusSecs: 0, subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })) });
      persist([copy, ...get().tasks]);
      return copy;
    },
    bulk: (ids, patch) => {
      set({ undoStack: snapshot(get, "Bulk edit") });
      const idSet = new Set(ids);
      persist(get().tasks.map((t) => (idSet.has(t.id) ? { ...t, ...patch, updatedAt: now() } : t)));
    },
    undo: () => {
      const stack = get().undoStack;
      if (!stack.length) return false;
      const last = stack[stack.length - 1];
      set({ undoStack: stack.slice(0, -1) });
      persist(last.tasks);
      return true;
    },
    archiveOld: (days) => {
      if (days <= 0) return 0;
      const cutoff = now() - days * 86_400_000;
      const before = get().tasks.length;
      const kept = get().tasks.filter((t) => !(t.status === "done" && (t.completedAt ?? 0) < cutoff));
      if (kept.length !== before) persist(kept);
      return before - kept.length;
    },
    byId: (id) => get().tasks.find((t) => t.id === id),
  };
});

// ---------- selectors ----------

export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export function isSnoozed(t: Task, nowMs = Date.now()) {
  return !!t.snoozedUntil && t.snoozedUntil > nowMs;
}

export function sortTasks(list: Task[], nowMs = Date.now()): Task[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ad = parseDue(a.due)?.getTime() ?? Infinity;
    const bd = parseDue(b.due)?.getTime() ?? Infinity;
    const aOver = ad < nowMs && a.hasTime ? 0 : 1;
    const bOver = bd < nowMs && b.hasTime ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (ad !== bd) return ad - bd;
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.order - b.order;
  });
}

export function openTasks(tasks: Task[]) {
  return tasks.filter((t) => t.status === "open");
}

export function todayTasks(tasks: Task[], nowDate = new Date()): Task[] {
  const key = dateKey(nowDate);
  const nowMs = nowDate.getTime();
  return sortTasks(
    tasks.filter((t) => t.status === "open" && !t.backlog && !isSnoozed(t, nowMs) && t.due && t.due.slice(0, 10) <= key),
    nowMs,
  );
}

export function overdueTasks(tasks: Task[], nowDate = new Date()): Task[] {
  const key = dateKey(nowDate);
  return tasks.filter((t) => t.status === "open" && !t.backlog && t.due && t.due.slice(0, 10) < key);
}

export function upcomingTasks(tasks: Task[], nowDate = new Date(), days = 30): Task[] {
  const key = dateKey(nowDate);
  const end = dateKey(new Date(nowDate.getTime() + days * 86_400_000));
  return sortTasks(tasks.filter((t) => t.status === "open" && !t.backlog && t.due && t.due.slice(0, 10) > key && t.due.slice(0, 10) <= end));
}

export function inboxTasks(tasks: Task[]): Task[] {
  return sortTasks(tasks.filter((t) => t.status === "open" && !t.backlog && !t.due));
}

export function backlogTasks(tasks: Task[]): Task[] {
  return sortTasks(tasks.filter((t) => t.status === "open" && t.backlog));
}

export function doneTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

export function completedOn(tasks: Task[], key: string): Task[] {
  return tasks.filter((t) => t.status === "done" && t.completedAt && dateKey(new Date(t.completedAt)) === key);
}

export function makeSourceFromClip(source: { app: string; title: string; exe?: string }): CaptureSource {
  return { app: source.app, title: source.title, exe: source.exe };
}
