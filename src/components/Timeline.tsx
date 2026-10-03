import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { Check, GripVertical, Play, Trash2, Video, X } from "lucide-react";
import { useCalendar } from "@/stores/calendar";
import type { CalEvent, Task } from "@/lib/types";
import { useTasks } from "@/stores/tasks";
import { useFocus } from "@/stores/focus";
import { useUi } from "@/stores/ui";
import { formatTime, parseDue, toDueString } from "@/lib/dates";
import { openExternal } from "@/lib/open";
import { cn } from "@/lib/ids";
import { uiSound } from "@/lib/audio";

export const HOUR_PX = 48;
export const SNAP_MIN = 15;
const DEFAULT_MIN = 30;

export const TASK_DRAG_TYPE = "application/x-sid-task";

interface Laid<T> {
  item: T;
  col: number;
  total: number;
}

function layout<T>(items: T[], start: (t: T) => number, end: (t: T) => number): Laid<T>[] {
  const sorted = [...items].sort((a, b) => start(a) - start(b) || end(b) - end(a));
  const cols: number[] = [];
  const laid = sorted.map((item) => {
    let col = cols.findIndex((e) => e <= start(item));
    if (col < 0) {
      col = cols.length;
      cols.push(end(item));
    } else cols[col] = end(item);
    return { item, col, total: 1 };
  });
  return laid.map((x) => {
    const overlapping = laid.filter((y) => start(y.item) < end(x.item) && end(y.item) > start(x.item));
    return { ...x, total: Math.max(...overlapping.map((y) => y.col)) + 1 };
  });
}

export function timeboxOf(t: Task): { start: number; end: number } | null {
  if (!t.hasTime || !t.due) return null;
  const d = parseDue(t.due);
  if (!d) return null;
  const mins = t.estimateMin && t.estimateMin > 0 ? t.estimateMin : DEFAULT_MIN;
  return { start: d.getTime(), end: d.getTime() + mins * 60_000 };
}

/** Day timeline with calendar events and timeboxed tasks. Tasks can be dropped, moved and resized. */
export function Timeline({ day, events, tasks, now, startHour, endHour, onOpenTask }: {
  day: Date;
  events: CalEvent[];
  tasks: Task[];
  now: number;
  startHour: number;
  endHour: number;
  onOpenTask?: (id: string) => void;
}) {
  const update = useTasks((s) => s.update);
  const toggle = useTasks((s) => s.toggle);
  const startForTask = useFocus((s) => s.startForTask);
  const snap = useFocus((s) => s.snap);
  const setEditing = useUi((s) => s.setEditingTask);
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; originY: number; start: number; end: number; cur: number } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ start: number; mins: number } | null>(null);
  const [evDrag, setEvDrag] = useState<{ ev: CalEvent; mode: "move" | "resize"; originY: number; start: number; end: number } | null>(null);
  const [creating, setCreating] = useState<{ start: number; end: number; title: string } | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const sources = useCalendar((s) => s.sources);
  const moveEvent = useCalendar((s) => s.moveEvent);
  const createEvent = useCalendar((s) => s.createEvent);
  const renameEvent = useCalendar((s) => s.renameEvent);
  const deleteEvent = useCalendar((s) => s.deleteEvent);
  const toast = useUi((s) => s.toast);
  const editableSources = sources.filter((s) => s.enabled && s.kind && s.kind !== "ics" && s.canEdit);
  const isEditable = (e: CalEvent) => editableSources.some((s) => s.id === e.sourceId);

  const dayStart = startOfDay(day).getTime();
  const timed = events.filter((e) => !e.allDay);
  const boxed = tasks.filter((t) => timeboxOf(t));
  let sh = startHour;
  let eh = endHour;
  for (const e of timed) {
    sh = Math.min(sh, Math.floor((e.start - dayStart) / 3_600_000));
    eh = Math.max(eh, Math.ceil((e.end - dayStart) / 3_600_000));
  }
  for (const t of boxed) {
    const b = timeboxOf(t)!;
    sh = Math.min(sh, Math.floor((b.start - dayStart) / 3_600_000));
    eh = Math.max(eh, Math.ceil((b.end - dayStart) / 3_600_000));
  }
  sh = Math.max(0, sh);
  eh = Math.min(24, Math.max(eh, sh + 1));
  const height = (eh - sh) * HOUR_PX;
  const top = (ms: number) => ((ms - dayStart) / 3_600_000 - sh) * HOUR_PX;
  const msAtY = useCallback(
    (y: number) => {
      const mins = Math.round(((y / HOUR_PX) * 60 + sh * 60) / SNAP_MIN) * SNAP_MIN;
      return dayStart + Math.max(0, Math.min(24 * 60 - SNAP_MIN, mins)) * 60_000;
    },
    [dayStart, sh],
  );
  const relY = (clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? clientY - r.top : 0;
  };

  const laidEvents = useMemo(() => {
    const items = timed.map((e) => (evDrag && evDrag.ev.id === e.id ? { ...e, start: evDrag.start, end: evDrag.end } : e));
    return layout(items, (e) => e.start, (e) => e.end);
  }, [timed, evDrag]);

  // ---- pointer drag for synced events
  useEffect(() => {
    if (!evDrag) return;
    const onMove = (e: MouseEvent) => {
      const dMin = Math.round(((e.clientY - evDrag.originY) / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN;
      setEvDrag((d) => {
        if (!d) return d;
        const len = d.ev.end - d.ev.start;
        if (d.mode === "move") {
          const start = Math.max(dayStart, Math.min(dayStart + 24 * 3_600_000 - len, d.ev.start + dMin * 60_000));
          return { ...d, start, end: start + len };
        }
        return { ...d, end: Math.max(d.ev.start + SNAP_MIN * 60_000, d.ev.end + dMin * 60_000) };
      });
    };
    const onUp = () => {
      setEvDrag((d) => {
        if (d && (d.start !== d.ev.start || d.end !== d.ev.end)) {
          void moveEvent(d.ev, d.start, d.end)
            .then(() => uiSound("tick", 0.3))
            .catch((err) => toast({ title: "Could not move event", body: String(err), kind: "error" }));
        }
        return null;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [evDrag, dayStart, moveEvent, toast]);
  const laidTasks = useMemo(() => {
    const items = boxed.map((t) => {
      const b = timeboxOf(t)!;
      if (drag && drag.id === t.id) return { t, start: drag.start, end: drag.end };
      return { t, start: b.start, end: b.end };
    });
    return layout(items, (x) => x.start, (x) => x.end);
  }, [boxed, drag]);

  // ---- pointer drag for move/resize
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const dy = e.clientY - drag.originY;
      const dMin = Math.round((dy / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN;
      setDrag((d) => {
        if (!d) return d;
        const t = tasks.find((x) => x.id === d.id);
        const box = t ? timeboxOf(t) : null;
        if (!box) return d;
        if (d.mode === "move") {
          const start = Math.max(dayStart, Math.min(dayStart + 24 * 3_600_000 - (box.end - box.start), box.start + dMin * 60_000));
          return { ...d, start, end: start + (box.end - box.start) };
        }
        const end = Math.max(box.start + SNAP_MIN * 60_000, box.end + dMin * 60_000);
        return { ...d, end };
      });
    };
    const onUp = () => {
      setDrag((d) => {
        if (d) {
          const t = tasks.find((x) => x.id === d.id);
          const box = t ? timeboxOf(t) : null;
          if (t && box && (d.start !== box.start || d.end !== box.end)) {
            update(t.id, { due: toDueString(new Date(d.start), true), hasTime: true, estimateMin: Math.round((d.end - d.start) / 60_000) });
            uiSound("tick", 0.3);
          }
        }
        return null;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, tasks, update, dayStart]);

  // ---- HTML5 drop from the unscheduled list
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    const t = tasks.find((x) => x.id === id);
    setDropPreview({ start: msAtY(relY(e.clientY)), mins: t?.estimateMin || DEFAULT_MIN });
  };
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    setDropPreview(null);
    if (!id) return;
    e.preventDefault();
    const t = tasks.find((x) => x.id === id) ?? useTasks.getState().byId(id);
    if (!t) return;
    const start = msAtY(relY(e.clientY));
    update(t.id, { due: toDueString(new Date(start), true), hasTime: true, estimateMin: t.estimateMin || DEFAULT_MIN, backlog: false, snoozedUntil: null });
    uiSound("pop", 0.3);
  };

  const nowTop = top(now);
  const isToday = isSameDay(day, now);
  const runningTaskId = snap.session && snap.session.status !== "finished" ? snap.session.config.taskId : null;

  return (
    <div
      ref={ref}
      className={cn("relative ml-12 select-none", dropPreview && "ring-1 ring-accent/30 rounded-lg")}
      data-timeline
      style={{ height }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropPreview(null)}
      onDrop={onDrop}
      onDoubleClick={(e) => {
        if (!editableSources.length || (e.target as HTMLElement).closest("[data-block]")) return;
        const start = msAtY(relY(e.clientY));
        setCreating({ start, end: start + 30 * 60_000, title: "" });
      }}
    >
      {Array.from({ length: eh - sh + 1 }).map((_, i) => (
        <div key={i} className="absolute left-0 right-0 border-t hairline" style={{ top: i * HOUR_PX }}>
          <span className="absolute -left-12 -top-2 w-10 text-right text-[0.68em] tabular text-faint">{format(new Date(dayStart + (sh + i) * 3_600_000), "h a")}</span>
        </div>
      ))}
      {Array.from({ length: eh - sh }).map((_, i) => (
        <div key={"h" + i} className="absolute left-0 right-0 border-t border-dashed hairline opacity-50" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
      ))}
      {isToday && nowTop >= 0 && nowTop <= height && (
        <div className="absolute left-0 right-0 z-10 border-t-2 border-danger" style={{ top: nowTop }}>
          <span className="absolute -left-1.5 -top-[5px] h-2 w-2 rounded-full bg-danger" />
        </div>
      )}
      {dropPreview && (
        <div className="pointer-events-none absolute left-0 right-0 z-20 rounded-lg border-2 border-dashed border-accent/70 bg-accent/10 px-2 py-1 text-[0.75em] text-accent" style={{ top: top(dropPreview.start), height: Math.max(22, (dropPreview.mins / 60) * HOUR_PX) }}>
          {formatTime(new Date(dropPreview.start))} · {dropPreview.mins}m
        </div>
      )}
      {creating && (
        <div className="absolute left-0 right-0 z-30 rounded-lg border border-accent bg-bg/95 p-2 shadow-xl" style={{ top: top(creating.start) }} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            className="input !py-1 text-[0.85em]"
            placeholder={`New event at ${formatTime(new Date(creating.start))} (${Math.round((creating.end - creating.start) / 60_000)}m)`}
            value={creating.title}
            onChange={(e) => setCreating({ ...creating, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") setCreating(null);
              if (e.key === "Enter" && creating.title.trim()) {
                const src = editableSources[0];
                void createEvent(src.id, creating.title.trim(), creating.start, creating.end)
                  .then((ev) => toast({ title: ev ? `Added to ${src.name}` : "Could not create event", kind: ev ? "success" : "error" }))
                  .catch((err) => toast({ title: "Could not create event", body: String(err), kind: "error" }));
                setCreating(null);
              }
            }}
          />
          <div className="mt-1 flex items-center gap-1 text-[0.72em] text-faint">
            {editableSources.length > 1 ? `Goes to ${editableSources[0].name}` : ""} Enter to save · Esc to cancel
            <div className="flex-1" />
            {[15, 30, 60].map((m) => (
              <button key={m} className={cn("chip cursor-pointer", creating.end - creating.start === m * 60_000 && "chip-accent")} onClick={() => setCreating({ ...creating, end: creating.start + m * 60_000 })}>
                {m}m
              </button>
            ))}
          </div>
        </div>
      )}
      {editingEvent && (
        <div className="absolute left-0 right-0 z-30 rounded-lg border border-accent bg-bg/95 p-2 shadow-xl" style={{ top: Math.max(0, top(editingEvent.start) - 4) }} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <input
              autoFocus
              className="input !py-1 text-[0.85em]"
              defaultValue={editingEvent.title}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingEvent(null);
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v && v !== editingEvent.title) void renameEvent(editingEvent, v).catch((err) => toast({ title: "Could not rename", body: String(err), kind: "error" }));
                  setEditingEvent(null);
                }
              }}
            />
            {editingEvent.meeting && (
              <button className="btn btn-sm" onClick={() => void openExternal(editingEvent.meeting!.url)}>
                <Video size={12} /> Join
              </button>
            )}
            <button className="btn btn-ghost btn-icon btn-sm text-danger" aria-label="Delete event" onClick={() => { const ev = editingEvent; setEditingEvent(null); void deleteEvent(ev).then(() => toast({ title: "Event deleted", kind: "info" })).catch((err) => toast({ title: "Could not delete", body: String(err), kind: "error" })); }}>
              <Trash2 size={13} />
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={() => setEditingEvent(null)}>
              <X size={13} />
            </button>
          </div>
          <div className="mt-1 text-[0.72em] text-faint">
            {formatTime(new Date(editingEvent.start))} – {formatTime(new Date(editingEvent.end))} · drag the block to move, pull its bottom edge to resize
          </div>
        </div>
      )}
      {laidEvents.map(({ item: e, col, total }) => {
        const t = Math.max(0, top(e.start));
        const h = Math.max(22, top(e.end) - t);
        const past = e.end <= now;
        const live = e.start <= now && e.end > now;
        const editable = isEditable(e);
        const dragging = evDrag?.ev.id === e.id;
        return (
          <div
            key={e.id}
            data-block
            className={cn("absolute overflow-hidden rounded-lg border px-2 py-1 text-[0.78em] leading-tight", past && "opacity-50", editable && "cursor-grab", dragging && "z-30 shadow-xl ring-2 ring-accent/40")}
            style={{ top: t, height: h, left: `${(col / total) * 100}%`, width: `calc(${100 / total}% - 4px)`, background: `color-mix(in srgb, ${e.color} 22%, transparent)`, borderColor: `color-mix(in srgb, ${e.color} 55%, transparent)` }}
            onMouseDown={(me) => {
              if (!editable || me.button !== 0 || (me.target as HTMLElement).closest("button")) return;
              setEvDrag({ ev: e, mode: "move", originY: me.clientY, start: e.start, end: e.end });
            }}
            onDoubleClick={(me) => {
              me.stopPropagation();
              if (editable) setEditingEvent(e);
            }}
          >
            {editable && !past && (
              <div
                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                onMouseDown={(me) => {
                  me.stopPropagation();
                  setEvDrag({ ev: e, mode: "resize", originY: me.clientY, start: e.start, end: e.end });
                }}
              />
            )}
            <div className="flex items-center gap-1">
              <span className="truncate font-medium">{e.title || "(untitled)"}</span>
              {live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />}
            </div>
            {h > 34 && (
              <div className="truncate text-faint">
                {formatTime(new Date(e.start))} – {formatTime(new Date(e.end))}
                {e.location && !e.meeting ? ` · ${e.location}` : ""}
                {e.meeting ? ` · ${e.meeting.provider}` : ""}
              </div>
            )}
            {e.meeting && !past && h > 50 && (
              <button className="mt-1 inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[0.9em] font-medium text-accent-fg" onClick={() => void openExternal(e.meeting!.url)}>
                <Video size={10} /> Join
              </button>
            )}
          </div>
        );
      })}
      {laidTasks.map(({ item, col, total }) => {
        const { t, start, end } = item;
        const y = Math.max(0, top(start));
        const h = Math.max(24, top(end) - y);
        const done = t.status === "done";
        const dragging = drag?.id === t.id;
        const running = runningTaskId === t.id;
        return (
          <div
            key={t.id}
            data-block
            className={cn(
              "group absolute z-[5] overflow-hidden rounded-lg border px-2 py-1 text-[0.78em] leading-tight transition-shadow",
              done ? "border-success/40 bg-success/10 opacity-70" : "border-accent/50 bg-accent/15",
              dragging && "z-30 shadow-xl ring-2 ring-accent/40",
              running && "ring-2 ring-accent",
            )}
            style={{ top: y, height: h, left: `${(col / total) * 100}%`, width: `calc(${100 / total}% - 4px)`, cursor: dragging ? "grabbing" : "grab" }}
            onMouseDown={(e) => {
              if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
              const box = timeboxOf(t)!;
              setDrag({ id: t.id, mode: "move", originY: e.clientY, start: box.start, end: box.end, cur: 0 });
            }}
            onDoubleClick={() => (onOpenTask ?? setEditing)(t.id)}
          >
            <div className="flex items-center gap-1">
              <button
                className={cn("checkbox !h-3.5 !w-3.5 !rounded-[4px]", done && "")}
                data-checked={done}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!done) uiSound("complete", 0.3);
                  toggle(t.id);
                }}
                aria-label={done ? "Mark open" : "Complete"}
              >
                {done && <Check size={9} strokeWidth={3} />}
              </button>
              <span className={cn("min-w-0 flex-1 truncate font-medium", done && "line-through")}>{t.title}</span>
              <GripVertical size={11} className="shrink-0 text-faint opacity-0 group-hover:opacity-100" />
            </div>
            {h > 36 && (
              <div className="flex items-center gap-1 text-faint">
                <span className="truncate">
                  {formatTime(new Date(start))} · {Math.round((end - start) / 60_000)}m
                </span>
                {!done && !running && (
                  <button
                    className="ml-auto inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[0.9em] font-medium text-accent-fg opacity-0 transition group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void startForTask(t.id, { mode: "deep", workSecs: Math.max(5, Math.round((end - start) / 60_000)) * 60, targetWorkPhases: 1 });
                    }}
                  >
                    <Play size={10} /> Focus
                  </button>
                )}
                {running && <span className="ml-auto text-accent">focusing</span>}
              </div>
            )}
            {!done && (
              <div
                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const box = timeboxOf(t)!;
                  setDrag({ id: t.id, mode: "resize", originY: e.clientY, start: box.start, end: box.end, cur: 0 });
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Draggable list of tasks that are not yet placed on the timeline. */
export function UnscheduledList({ tasks, day }: { tasks: Task[]; day: Date }) {
  const update = useTasks((s) => s.update);
  if (!tasks.length) return null;
  return (
    <div className="mt-2">
      <div className="section-title mb-1 px-1">Unscheduled · drag onto the timeline</div>
      <div className="flex flex-col gap-1">
        {tasks.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="card flex cursor-grab items-center gap-2 px-2.5 py-1.5 text-[0.85em] active:cursor-grabbing"
          >
            <GripVertical size={13} className="shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <span className="text-[0.85em] text-faint">{t.estimateMin ? `${t.estimateMin}m` : ""}</span>
            <button
              className="btn btn-ghost btn-sm text-[0.85em] text-muted"
              onClick={() => {
                // Place at the next free quarter hour from now (or 9:00 on other days).
                const base = isSameDay(day, new Date()) ? new Date() : new Date(startOfDay(day).getTime() + 9 * 3_600_000);
                const mins = Math.ceil((base.getHours() * 60 + base.getMinutes()) / SNAP_MIN) * SNAP_MIN;
                const start = new Date(startOfDay(day).getTime() + mins * 60_000);
                update(t.id, { due: toDueString(start, true), hasTime: true, estimateMin: t.estimateMin || DEFAULT_MIN, backlog: false });
              }}
            >
              Place
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fit unscheduled tasks into free gaps between events, starting from `from`. */
export function autoPlan(day: Date, tasks: Task[], events: CalEvent[], from: number, endHour: number, update: (id: string, patch: Partial<Task>) => void): number {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + endHour * 3_600_000;
  const busy = [...events.filter((e) => !e.allDay).map((e) => [e.start, e.end] as [number, number]), ...tasks.filter((t) => timeboxOf(t)).map((t) => { const b = timeboxOf(t)!; return [b.start, b.end] as [number, number]; })].sort((a, b) => a[0] - b[0]);
  let cursor = Math.ceil(Math.max(from, dayStart) / (SNAP_MIN * 60_000)) * SNAP_MIN * 60_000;
  let placed = 0;
  for (const t of tasks.filter((x) => !timeboxOf(x) && x.status === "open")) {
    const mins = t.estimateMin || DEFAULT_MIN;
    // find first gap
    let start = cursor;
    for (;;) {
      const clash = busy.find(([s, e]) => s < start + mins * 60_000 && e > start);
      if (!clash) break;
      start = Math.ceil(clash[1] / (SNAP_MIN * 60_000)) * SNAP_MIN * 60_000;
    }
    if (start + mins * 60_000 > dayEnd) break;
    update(t.id, { due: toDueString(new Date(start), true), hasTime: true, estimateMin: mins, backlog: false });
    busy.push([start, start + mins * 60_000]);
    busy.sort((a, b) => a[0] - b[0]);
    cursor = start + mins * 60_000 + 5 * 60_000;
    placed++;
  }
  return placed;
}

export function isSameDayKey(a: Date, b: Date) {
  return isSameDay(a, b);
}

export { addDays };
