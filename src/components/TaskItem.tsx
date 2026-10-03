import { memo, useState } from "react";
import { AlarmClock, Check, ChevronRight, Copy, Flag, GripVertical, MoreHorizontal, Pencil, Pin, Play, Repeat, Timer, Trash2 } from "lucide-react";
import type { Task } from "@/lib/types";
import { formatDue, formatDuration, isOverdue, isDueToday } from "@/lib/dates";
import { useTasks } from "@/stores/tasks";
import { useUi } from "@/stores/ui";
import { useFocus } from "@/stores/focus";
import { uiSound } from "@/lib/audio";
import { describeRecurrence } from "@/lib/recurrence";
import { cn } from "@/lib/ids";

export const TaskItem = memo(function TaskItem({ task, selected, dense, showList, draggable, onDragStart, onDragOver, onDrop }: {
  task: Task;
  selected?: boolean;
  dense?: boolean;
  showList?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const toggle = useTasks((s) => s.toggle);
  const update = useTasks((s) => s.update);
  const remove = useTasks((s) => s.remove);
  const duplicate = useTasks((s) => s.duplicate);
  const setEditing = useUi((s) => s.setEditingTask);
  const setSelected = useUi((s) => s.setSelectedTask);
  const toast = useUi((s) => s.toast);
  const startForTask = useFocus((s) => s.startForTask);
  const [menu, setMenu] = useState(false);
  const done = task.status === "done";
  const overdue = !done && isOverdue(task.due, task.hasTime);
  const today = !done && isDueToday(task.due);
  const subDone = task.subtasks.filter((s) => s.done).length;

  const onToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!done) uiSound("complete", 0.35);
    toggle(task.id);
  };

  const snoozeOptions = [
    { label: "1 hour", ms: 3_600_000 },
    { label: "3 hours", ms: 3 * 3_600_000 },
    { label: "Tomorrow", ms: 0 },
  ];

  return (
    <div
      className={cn("task-row group relative flex items-start gap-2.5 rounded-xl px-2.5", dense ? "py-1.5" : "py-2", "hover:bg-surface-2/60")}
      data-done={done}
      data-selected={!!selected}
      onClick={() => setSelected(task.id)}
      onDoubleClick={() => setEditing(task.id)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      {draggable && <GripVertical size={14} className="mt-1 shrink-0 cursor-grab text-faint opacity-0 group-hover:opacity-100" />}
      <button className="checkbox mt-0.5" data-checked={done} data-priority={task.priority} onClick={onToggle} aria-label={done ? "Mark open" : "Complete"}>
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <div className="task-title min-w-0 flex-1 truncate text-[0.95em] leading-snug">{task.title}</div>
          {task.pinned && <Pin size={12} className="mt-1 shrink-0 text-accent" />}
        </div>
        {(task.due || task.tags.length > 0 || task.recurrence || task.estimateMin || task.subtasks.length > 0 || (showList && task.list) || task.focusSecs > 0 || task.snoozedUntil) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.78em] text-muted">
            {task.due && (
              <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-danger", today && !overdue && "text-accent")}>
                <AlarmClock size={11} />
                {formatDue(task.due, task.hasTime)}
              </span>
            )}
            {task.snoozedUntil && task.snoozedUntil > Date.now() && <span className="chip">snoozed</span>}
            {task.recurrence && (
              <span className="inline-flex items-center gap-1" aria-label={describeRecurrence(task.recurrence)}>
                <Repeat size={11} />
              </span>
            )}
            {task.priority !== "none" && (
              <span className={cn("inline-flex items-center gap-0.5", `priority-${task.priority}`)}>
                <Flag size={11} />
                {task.priority}
              </span>
            )}
            {task.estimateMin && (
              <span className="inline-flex items-center gap-1">
                <Timer size={11} />
                {task.estimateMin}m{task.focusSecs > 0 && ` · ${formatDuration(task.focusSecs)} done`}
              </span>
            )}
            {!task.estimateMin && task.focusSecs > 0 && (
              <span className="inline-flex items-center gap-1">
                <Timer size={11} />
                {formatDuration(task.focusSecs)}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className={cn(subDone === task.subtasks.length && "text-success")}>
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {showList && task.list && <span className="text-faint">{task.list}</span>}
            {task.tags.map((t) => (
              <span key={t} className="text-faint">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-data-[selected=true]:opacity-100">
        {!done && (
          <button
            className="btn btn-ghost btn-icon btn-sm text-muted"
            aria-label="Focus on this task" data-tip="Focus on this task"
            onClick={(e) => {
              e.stopPropagation();
              void startForTask(task.id);
            }}
          >
            <Play size={13} />
          </button>
        )}
        <button
          className="btn btn-ghost btn-icon btn-sm text-muted"
          aria-label="Edit" data-tip="Edit"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(task.id);
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm text-muted"
          aria-label="More" data-tip="More"
          onClick={(e) => {
            e.stopPropagation();
            setMenu((m) => !m);
          }}
        >
          <MoreHorizontal size={13} />
        </button>
      </div>
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenu(false); }} onContextMenu={(e) => { e.preventDefault(); setMenu(false); }} />
          <div className="glass anim-pop absolute right-2 top-full z-50 mt-1 w-48 p-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <MenuItem icon={<Pencil size={13} />} label="Edit" onClick={() => { setMenu(false); setEditing(task.id); }} />
            {!done && <MenuItem icon={<Play size={13} />} label="Start focus" onClick={() => { setMenu(false); void startForTask(task.id); }} />}
            <MenuItem icon={<Pin size={13} />} label={task.pinned ? "Unpin" : "Pin to top"} onClick={() => { setMenu(false); update(task.id, { pinned: !task.pinned }); }} />
            {!done && (
              <div className="relative">
                <div className="px-2 pb-0.5 pt-1.5 text-[0.7em] uppercase tracking-wide text-faint">Snooze</div>
                <div className="flex gap-1 px-1 pb-1">
                  {snoozeOptions.map((o) => (
                    <button
                      key={o.label}
                      className="btn btn-sm flex-1 !px-1 text-[0.8em]"
                      onClick={() => {
                        setMenu(false);
                        let until: number;
                        if (o.ms === 0) {
                          const d = new Date();
                          d.setDate(d.getDate() + 1);
                          d.setHours(8, 0, 0, 0);
                          until = d.getTime();
                        } else until = Date.now() + o.ms;
                        update(task.id, { snoozedUntil: until });
                        toast({ title: "Snoozed", body: `Hidden until ${o.label.toLowerCase()}`, kind: "info" });
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <MenuItem icon={<Copy size={13} />} label="Duplicate" onClick={() => { setMenu(false); duplicate(task.id); }} />
            <MenuItem icon={<ChevronRight size={13} />} label={task.backlog ? "Move to Inbox" : "Move to Someday"} onClick={() => { setMenu(false); update(task.id, { backlog: !task.backlog, due: task.backlog ? task.due : null }); }} />
            <div className="divider my-1" />
            <MenuItem
              icon={<Trash2 size={13} />}
              label="Delete"
              danger
              onClick={() => {
                setMenu(false);
                remove(task.id);
                toast({ title: "Task deleted", kind: "info", action: { label: "Undo", onClick: () => useTasks.getState().undo() } });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
});

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.88em] hover:bg-surface-2", danger && "text-danger")} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
