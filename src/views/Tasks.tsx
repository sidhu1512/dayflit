import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { CheckSquare, Filter, Inbox, ListChecks, Search, Sparkles, Trash2, X } from "lucide-react";
import { useTasks, todayTasks, upcomingTasks, inboxTasks, backlogTasks, doneTasks, sortTasks, overdueTasks } from "@/stores/tasks";
import { useSettings } from "@/stores/settings";
import { useLife } from "@/stores/life";
import { useUi } from "@/stores/ui";
import { QuickAdd } from "@/components/QuickAdd";
import { TaskItem } from "@/components/TaskItem";
import { Empty } from "@/components/Empty";
import { dateKey, relativeDay, parseKey } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { HorizontalPillStrip, type PillStripItem } from "@/components/ui/HorizontalPillStrip";
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
  const domains = useLife((s) => s.data.domains);
  const filter = useUi((s) => s.tasksFilter);
  const setFilter = useUi((s) => s.setTasksFilter);
  const viewParam = useUi((s) => s.viewParam);
  const selectedId = useUi((s) => s.selectedTaskId);
  const setSelected = useUi((s) => s.setSelectedTask);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
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
  const customLists = useMemo(() => lists.filter((l) => !FILTERS.some((f) => f.label.toLowerCase() === l.toLowerCase() || f.id.toLowerCase() === l.toLowerCase())), [lists]);
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
    if (domainFilter) list = list.filter((t) => t.domainId === domainFilter);
    if (tag) list = list.filter((t) => t.tags.includes(tag));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(s) || t.notes.toLowerCase().includes(s) || t.tags.some((x) => x.includes(s)));
    }
    return list;
  }, [base, domainFilter, tag, q]);

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

  const [showSearch, setShowSearch] = useState(false);
  const activeFilterLabel = FILTERS.find((f) => f.id === filter)?.label ?? filter;

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
        setShowSearch(true);
        setTimeout(() => document.querySelector<HTMLInputElement>("[data-task-search]")?.focus(), 50);
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

  const handleAddList = async () => {
    const name = await useUi.getState().promptUser({
      title: "New Task List",
      body: "Enter a name for your custom task list:",
      placeholder: "e.g. Work, Personal, Side Projects, Sprint…",
      confirmLabel: "Create List",
    });
    if (name && name.trim()) {
      const listName = name.trim();
      const currentLists = useSettings.getState().settings.tasks.lists || [];
      if (!currentLists.includes(listName)) {
        useSettings.getState().update({
          tasks: {
            ...useSettings.getState().settings.tasks,
            lists: [...currentLists, listName],
          },
        });
      }
      setFilter(listName);
    }
  };

  const handleDeleteList = (listName: string) => {
    const currentLists = useSettings.getState().settings.tasks.lists || [];
    useSettings.getState().update({
      tasks: {
        ...useSettings.getState().settings.tasks,
        lists: currentLists.filter((l) => l !== listName),
      },
    });
    for (const t of tasks) {
      if (t.list === listName) {
        useTasks.getState().update(t.id, { list: undefined });
      }
    }
    if (filter === listName) {
      setFilter("today");
    }
  };

  const handleRenameList = (oldName: string, newName: string) => {
    const cleanNew = newName.trim();
    if (!cleanNew || cleanNew === oldName) return;
    const currentLists = useSettings.getState().settings.tasks.lists || [];
    useSettings.getState().update({
      tasks: {
        ...useSettings.getState().settings.tasks,
        lists: currentLists.map((l) => (l === oldName ? cleanNew : l)),
      },
    });
    for (const t of tasks) {
      if (t.list === oldName) {
        useTasks.getState().update(t.id, { list: cleanNew });
      }
    }
    if (filter === oldName) {
      setFilter(cleanNew);
    }
  };

  const taskPillItems = useMemo<PillStripItem[]>(() => {
    const items: PillStripItem[] = FILTERS.map((f) => ({
      id: f.id,
      label: f.label,
      icon: f.icon,
      badge:
        f.id === "today" && overdueTasks(tasks).length > 0 ? (
          <span className="rounded-full bg-danger/20 px-1 text-[0.72em] font-bold text-danger tabular">
            {overdueTasks(tasks).length}
          </span>
        ) : undefined,
      active: filter === f.id,
      onSelect: () => setFilter(f.id),
    }));

    for (const l of customLists) {
      const count = tasks.filter((t) => t.status === "open" && t.list === l).length;
      items.push({
        id: l,
        label: l,
        badge: count ? <span className="text-faint text-[0.85em] tabular">{count}</span> : undefined,
        active: filter === l,
        onSelect: () => setFilter(l),
      });
    }

    return items;
  }, [filter, tasks, customLists, setFilter]);

  return (
    <div className="flex h-full flex-col min-w-0">
      <div className="px-4 pt-1 min-w-0 max-w-full">
        <div className="flex items-center justify-between pb-1.5 pt-1 min-w-0 flex-nowrap">
          <div className="flex items-baseline gap-2 min-w-0 flex-1 mr-2">
            <h1 className="text-[1.25em] font-semibold tracking-tight truncate">{activeFilterLabel}</h1>
            <span className="text-[0.78em] font-medium text-muted tabular shrink-0">{shown.length} {shown.length === 1 ? "task" : "tasks"}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={cn("btn btn-ghost btn-icon btn-sm text-muted", (showSearch || q) && "text-accent bg-accent/10")}
              onClick={() => {
                setShowSearch((v) => !v);
                if (!showSearch) setTimeout(() => document.querySelector<HTMLInputElement>("[data-task-search]")?.focus(), 50);
              }}
              aria-label="Filter tasks (/)"
              title="Filter tasks (/)"
            >
              <Search size={14} />
            </button>
            {allTags.length > 0 && (
              <select className="input !w-auto max-w-[120px] truncate !py-0.5 !px-2 text-[0.8em]" value={tag ?? ""} onChange={(e) => setTag(e.target.value || null)}>
                <option value="">all tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            )}
            {domains.length > 0 && (
              <select
                className="input !w-auto max-w-[120px] truncate !py-0.5 !px-2 text-[0.8em]"
                value={domainFilter ?? ""}
                onChange={(e) => setDomainFilter(e.target.value || null)}
                aria-label="Filter tasks by Life Pillar"
              >
                <option value="">all pillars</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {(showSearch || q) && (
          <div className="anim-fade mb-2 flex items-center gap-2 rounded-xl bg-surface-2/60 px-2.5 py-1">
            <Search size={13} className="text-faint shrink-0" />
            <input
              data-task-search
              className="flex-1 bg-transparent text-[0.85em] outline-none placeholder:text-faint"
              placeholder="Filter tasks… (Esc to clear)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQ("");
                  setShowSearch(false);
                }
              }}
            />
            {q && (
              <button className="btn btn-ghost btn-icon btn-sm !p-0.5 text-faint hover:text-text" onClick={() => setQ("")}>
                <X size={12} />
              </button>
            )}
          </div>
        )}

        <HorizontalPillStrip
          activeKey={filter}
          className="pb-2 min-h-[36px]"
          items={taskPillItems}
          onAdd={handleAddList}
          onDelete={handleDeleteList}
          onRename={handleRenameList}
          canModify={(id) => !FILTERS.some((f) => f.id === id)}
          addLabel="Add new task list"
          addAriaLabel="Add Task List"
          quickSwitcherLabel={(n) => `All (${n}) ▾`}
          quickSwitcherThreshold={5}
        />

        <div className="pb-1">
          <QuickAdd extra={quickExtra} autoFocus={quickFocus} />
        </div>
      </div>
      <div className="scroll min-h-0 flex-1 px-2.5 pb-10 pt-2">
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
        <div className="h-8 shrink-0 pointer-events-none" />
      </div>
      <div className="hide-in-focus shrink-0 flex items-center gap-3 border-t hairline px-4 py-1 text-[0.72em] text-faint bg-surface/50 backdrop-blur-xs">
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
