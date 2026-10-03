import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { CheckSquare, Filter, Inbox, ListChecks, Search, Sparkles, Trash2 } from "lucide-react";
import { useTasks, todayTasks, upcomingTasks, inboxTasks, backlogTasks, doneTasks, sortTasks, overdueTasks } from "@/stores/tasks";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { QuickAdd } from "@/components/QuickAdd";
import { TaskItem } from "@/components/TaskItem";
import { Empty } from "@/components/Empty";
import { dateKey, relativeDay, parseKey } from "@/lib/dates";
import { cn } from "@/lib/ids";
import type { Task } from "@/lib/types";

const FILTERS = [
  { id: "today", label: "Today", icon: <Sparkles size={13} /> },
  { id: "upcoming", label: "Upcoming", icon: <ListChecks size={13} /> },
  { id: "inbox", label: "Inbox", icon: <Inbox size={13} /> },
  { id: "all", label: "All", icon: <CheckSquare size={13} /> },
  { id: "backlog", label: "Someday", icon: <Filter size={13} /> },
  { id: "done", label: "Done", icon: <CheckSquare size={13} /> },
];

export function TasksView() {
  const tasks = useTasks((s) => s.tasks);
  const reorder = useTasks((s) => s.reorder);
  const archiveOld = useTasks((s) => s.archiveOld);
  const lists = useSettings((s) => s.settings.tasks.lists);
  const filter = useUi((s) => s.tasksFilter);
  const setFilter = useUi((s) => s.setTasksFilter);
  const viewParam = useUi((s) => s.viewParam);
  const selectedId = useUi((s) => s.selectedTaskId);
  const setSelected = useUi((s) => s.setSelectedTask);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [quickFocus, setQuickFocus] = useState(false);

  useEffect(() => {
    if (viewParam === "new") {
      setQuickFocus(true);
      useUi.getState().navigate("tasks", null);
      window.setTimeout(() => setQuickFocus(false), 200);
    }
  }, [viewParam]);

  const allTags = useMemo(() => [...new Set(tasks.filter((t) => t.status === "open").flatMap((t) => t.tags))].sort(), [tasks]);
  const isList = !FILTERS.some((f) => f.id === filter);

  const base: Task[] = useMemo(() => {
    switch (filter) {
      case "today":
        return todayTasks(tasks);
      case "upcoming":
        return upcomingTasks(tasks, new Date(), 365);
      case "inbox":
        return inboxTasks(tasks);
      case "all":
        return sortTasks(tasks.filter((t) => t.status === "open"));
      case "backlog":
        return backlogTasks(tasks);
      case "done":
        return doneTasks(tasks);
      default:
        return sortTasks(tasks.filter((t) => t.status === "open" && t.list === filter));
    }
  }, [tasks, filter]);

  const shown = useMemo(() => {
    let list = base;
    if (tag) list = list.filter((t) => t.tags.includes(tag));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(s) || t.notes.toLowerCase().includes(s) || t.tags.some((x) => x.includes(s)));
    }
    return list;
  }, [base, tag, q]);

  // group upcoming by day
  const groups = useMemo(() => {
    if (filter !== "upcoming") return null;
    const m = new Map<string, Task[]>();
    for (const t of shown) {
      const k = t.due!.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [shown, filter]);

  const doneGroups = useMemo(() => {
    if (filter !== "done") return null;
    const m = new Map<string, Task[]>();
    for (const t of shown) {
      const k = dateKey(new Date(t.completedAt ?? 0));
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [shown, filter]);

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (useUi.getState().editingTaskId || useUi.getState().paletteOpen) return;
      const idx = shown.findIndex((t) => t.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(shown[Math.min(shown.length - 1, idx + 1)]?.id ?? null);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(shown[Math.max(0, idx - 1)]?.id ?? shown[0]?.id ?? null);
      } else if (selectedId && (e.key === "x" || e.key === " ")) {
        e.preventDefault();
        useTasks.getState().toggle(selectedId);
      } else if (selectedId && (e.key === "e" || e.key === "Enter")) {
        e.preventDefault();
        useUi.getState().setEditingTask(selectedId);
      } else if (selectedId && e.key === "f") {
        e.preventDefault();
        void import("@/stores/focus").then((m) => m.useFocus.getState().startForTask(selectedId));
      } else if (selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        useTasks.getState().remove(selectedId);
        useUi.getState().toast({ title: "Task deleted", kind: "info", action: { label: "Undo", onClick: () => useTasks.getState().undo() } });
      } else if (selectedId && e.key === "t") {
        e.preventDefault();
        useTasks.getState().reschedule(selectedId, dateKey());
      } else if (selectedId && e.key === "m") {
        e.preventDefault();
        useTasks.getState().reschedule(selectedId, dateKey(addDays(new Date(), 1)));
      } else if (selectedId && e.key === "w") {
        e.preventDefault();
        useTasks.getState().reschedule(selectedId, dateKey(addDays(new Date(), 7)));
      } else if (selectedId && ["1", "2", "3", "4", "0"].includes(e.key) && !e.ctrlKey) {
        e.preventDefault();
        const p = ({ "1": "urgent", "2": "high", "3": "medium", "4": "low", "0": "none" } as const)[e.key as "1"];
        useTasks.getState().update(selectedId, { priority: p });
      } else if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-task-search]")?.focus();
      } else if (e.key === "n" && !e.ctrlKey) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-quickadd]")?.focus();
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selectedId, setSelected]);

  const onDrop = (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const ids = shown.map((t) => t.id);
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(targetId);
    if (fi < 0 || ti < 0) return;
    ids.splice(fi, 1);
    ids.splice(ti, 0, from);
    reorder(ids);
  };

  const quickExtra: Partial<Task> = filter === "today" ? { due: dateKey() } : filter === "backlog" ? { backlog: true } : isList ? { list: filter } : {};
  const renderItem = (t: Task) => (
    <TaskItem
      key={t.id}
      task={t}
      selected={selectedId === t.id}
      showList={filter !== "today" && !isList}
      draggable={filter !== "done" && filter !== "upcoming"}
      onDragStart={() => (dragId.current = t.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(t.id)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-1">
        <div className="scroll flex items-center gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={cn("btn btn-sm btn-ghost shrink-0", filter === f.id && "!bg-accent/15 !text-accent")} onClick={() => setFilter(f.id)}>
              {f.icon} {f.label}
              {f.id === "today" && overdueTasks(tasks).length > 0 && <span className="rounded-full bg-danger/20 px-1.5 text-[0.75em] text-danger">{overdueTasks(tasks).length}</span>}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-surface-3" />
          {lists.map((l) => (
            <button key={l} className={cn("btn btn-sm btn-ghost shrink-0", filter === l && "!bg-accent/15 !text-accent")} onClick={() => setFilter(l)}>
              {l}
              <span className="text-faint">{tasks.filter((t) => t.status === "open" && t.list === l).length || ""}</span>
            </button>
          ))}
        </div>
        <div className="mt-2">
          <QuickAdd extra={quickExtra} autoFocus={quickFocus} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 py-1">
            <Search size={13} className="text-faint" />
            <input data-task-search className="flex-1 bg-transparent text-[0.85em] outline-none placeholder:text-faint" placeholder="Filter…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (setQ(""), (e.target as HTMLInputElement).blur())} />
          </div>
          {allTags.length > 0 && (
            <select className="input !w-auto !py-1 text-[0.82em]" value={tag ?? ""} onChange={(e) => setTag(e.target.value || null)}>
              <option value="">all tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="scroll flex-1 px-2.5 pb-3 pt-2">
        {shown.length === 0 ? (
          <Empty icon={<CheckSquare size={28} />} title={q ? "No matching tasks" : filter === "done" ? "Nothing completed yet" : filter === "inbox" ? "Inbox zero" : "All clear"} body={filter === "today" ? "Add something above, or press n." : undefined} />
        ) : groups ? (
          groups.map(([k, list]) => (
            <div key={k} className="mb-2">
              <div className="section-title px-2 pb-1 pt-2">
                {relativeDay(parseKey(k))} <span className="font-normal normal-case tracking-normal text-faint">· {format(parseKey(k), "d MMM")}</span>
              </div>
              {list.map(renderItem)}
            </div>
          ))
        ) : doneGroups ? (
          <>
            {doneGroups.map(([k, list]) => (
              <div key={k} className="mb-2">
                <div className="section-title px-2 pb-1 pt-2">{relativeDay(parseKey(k))}</div>
                {list.map(renderItem)}
              </div>
            ))}
            {shown.length > 20 && (
              <button className="btn btn-ghost btn-sm mx-auto mt-2 flex text-faint" onClick={() => { const n = archiveOld(30); useUi.getState().toast({ title: n ? `Removed ${n} old completed tasks` : "Nothing older than 30 days", kind: "info" }); }}>
                <Trash2 size={12} /> Clear completed older than 30 days
              </button>
            )}
          </>
        ) : (
          shown.map(renderItem)
        )}
      </div>
      <div className="hide-in-focus flex items-center gap-3 border-t hairline px-4 py-1 text-[0.72em] text-faint">
        <span>j/k move</span>
        <span>x done</span>
        <span>e edit</span>
        <span>f focus</span>
        <span>t/m/w today/tmrw/week</span>
        <span>1-4 priority</span>
      </div>
    </div>
  );
}
