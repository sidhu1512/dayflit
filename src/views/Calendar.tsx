import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, Settings2 } from "lucide-react";
import { useCalendar, eventsOnDay } from "@/stores/calendar";
import { useTasks, sortTasks } from "@/stores/tasks";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { EventCard } from "@/components/EventCard";
import { TaskItem } from "@/components/TaskItem";
import { QuickAdd } from "@/components/QuickAdd";
import { Empty } from "@/components/Empty";
import { dateKey, weekDays } from "@/lib/dates";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/ids";
import type { CalEvent, Task } from "@/lib/types";
import { Timeline, UnscheduledList, autoPlan, timeboxOf } from "@/components/Timeline";
import { CalendarClock, Wand2 } from "lucide-react";

export function CalendarView() {
  const now = useNow(60_000);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [mode, setMode] = useState<"day" | "week">("day");
  const settings = useSettings((s) => s.settings.calendar);
  const eventsBetween = useCalendar((s) => s.eventsBetween);
  const cache = useCalendar((s) => s.cache);
  const sources = useCalendar((s) => s.sources);
  const refresh = useCalendar((s) => s.refresh);
  const refreshing = useCalendar((s) => s.refreshing);
  const tasks = useTasks((s) => s.tasks);
  const navigate = useUi((s) => s.navigate);
  const days = useMemo(() => weekDays(anchor, settings.weekStartsOn), [anchor, settings.weekStartsOn]);
  const rangeStart = days[0].getTime();
  const rangeEnd = addDays(days[6], 1).getTime();
  const events = useMemo(() => eventsBetween(rangeStart, rangeEnd), [cache, sources, rangeStart, rangeEnd]);
  const busy = Object.values(refreshing).some(Boolean);
  const errors = sources.filter((s) => s.enabled && cache[s.id]?.error).map((s) => `${s.name}: ${cache[s.id].error}`);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "h") setAnchor((a) => addDays(a, mode === "day" ? -1 : -7));
      else if (e.key === "ArrowRight" || e.key === "l") setAnchor((a) => addDays(a, mode === "day" ? 1 : 7));
      else if (e.key === "t") setAnchor(startOfDay(new Date()));
      else if (e.key === "d") setMode("day");
      else if (e.key === "w") setMode("week");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const dayEvents = (d: Date) => eventsOnDay(events, d);
  const dayTasks = (d: Date) => sortTasks(tasks.filter((t) => t.status === "open" && !t.backlog && t.due?.slice(0, 10) === dateKey(d)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 pt-1">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setAnchor((a) => addDays(a, mode === "day" ? -1 : -7))} aria-label="Previous (←)" data-tip="Previous (←)">
          <ChevronLeft size={16} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(startOfDay(new Date()))} aria-label="Today (t)" data-tip="Today (t)">
          Today
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setAnchor((a) => addDays(a, mode === "day" ? 1 : 7))} aria-label="Next (→)" data-tip="Next (→)">
          <ChevronRight size={16} />
        </button>
        <div className="ml-1 min-w-0 flex-1 truncate text-[0.95em] font-semibold">{mode === "day" ? format(anchor, "EEEE, d MMMM yyyy") : `${format(days[0], "d MMM")} – ${format(days[6], "d MMM yyyy")}`}</div>
        <div className="flex rounded-lg bg-surface-2/60 p-0.5">
          {(["day", "week"] as const).map((m) => (
            <button key={m} className={cn("rounded-md px-2 py-0.5 text-[0.8em] capitalize", mode === m ? "bg-surface-3 text-text" : "text-muted")} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
        <button className={cn("btn btn-ghost btn-icon btn-sm", busy && "spin")} onClick={() => void refresh(undefined, true)} aria-label="Refresh calendars" data-tip="Refresh calendars" disabled={busy || sources.length === 0}>
          <RefreshCw size={14} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate("settings", "calendar")} aria-label="Calendar sources" data-tip="Calendar sources">
          <Settings2 size={14} />
        </button>
      </div>

      {/* week strip */}
      <div className="mt-2 grid grid-cols-7 gap-1 px-3">
        {days.map((d) => {
          const isToday = isSameDay(d, now);
          const active = mode === "day" && isSameDay(d, anchor);
          const n = dayEvents(d).length + dayTasks(d).length;
          return (
            <button key={d.toISOString()} className={cn("flex flex-col items-center rounded-lg py-1", active ? "bg-accent/15 text-accent" : "hover:bg-surface-2/60", isToday && !active && "text-accent")} onClick={() => { setAnchor(startOfDay(d)); setMode("day"); }}>
              <span className="text-[0.68em] uppercase text-faint">{format(d, "EEE")}</span>
              <span className={cn("text-[0.95em] font-semibold", isToday && "rounded-full bg-accent px-1.5 text-accent-fg")}>{format(d, "d")}</span>
              <span className="mt-0.5 flex h-1 gap-0.5">{Array.from({ length: Math.min(3, n) }).map((_, i) => <span key={i} className="h-1 w-1 rounded-full bg-faint" />)}</span>
            </button>
          );
        })}
      </div>

      {errors.length > 0 && (
        <div className="mx-3 mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-[0.78em] text-danger">
          {errors.map((e) => (
            <div key={e} className="truncate">
              {e}
            </div>
          ))}
        </div>
      )}

      {mode === "day" ? (
        <DayView day={anchor} events={dayEvents(anchor)} tasks={dayTasks(anchor)} now={now} startHour={settings.dayStartHour} endHour={settings.dayEndHour} noSources={sources.length === 0} onAddSource={() => navigate("settings", "calendar")} />
      ) : (
        <div className="scroll flex-1 px-3 pb-3 pt-2">
          {days.map((d) => {
            const evs = dayEvents(d);
            const ts = dayTasks(d);
            if (!evs.length && !ts.length) return null;
            return (
              <div key={d.toISOString()} className="mb-3">
                <div className={cn("section-title mb-1 px-1", isSameDay(d, now) && "text-accent")}>{format(d, "EEEE d")}</div>
                <div className="flex flex-col gap-1">
                  {evs.map((e) => (
                    <EventCard key={e.id} ev={e} now={now} dense />
                  ))}
                  {ts.map((t) => (
                    <TaskItem key={t.id} task={t} dense />
                  ))}
                </div>
              </div>
            );
          })}
          {days.every((d) => !dayEvents(d).length && !dayTasks(d).length) && <Empty icon={<CalendarDays size={28} />} title="A quiet week" body={sources.length ? "No events or dated tasks." : "Connect a calendar in Settings to see events here."} />}
        </div>
      )}
    </div>
  );
}

function DayView({ day, events, tasks, now, startHour, endHour, noSources, onAddSource }: { day: Date; events: CalEvent[]; tasks: Task[]; now: number; startHour: number; endHour: number; noSources: boolean; onAddSource: () => void }) {
  const update = useTasks((s) => s.update);
  const toast = useUi((s) => s.toast);
  const allDay = events.filter((e) => e.allDay);
  const timeboxed = tasks.filter((t) => timeboxOf(t));
  const unscheduled = tasks.filter((t) => !timeboxOf(t) && t.status === "open");
  const isToday = isSameDay(day, now);
  const empty = events.length === 0 && tasks.length === 0;
  const plan = () => {
    const from = isToday ? now : startOfDay(day).getTime() + startHour * 3_600_000;
    const n = autoPlan(day, tasks, events, from, endHour, update);
    toast({ title: n ? `Planned ${n} task${n === 1 ? "" : "s"}` : "No room left today", body: n ? "Drag blocks to adjust, double-click to edit." : "Try moving something to tomorrow.", kind: n ? "success" : "info" });
  };
  return (
    <div className="scroll flex-1 px-3 pb-3 pt-2">
      <QuickAdd extra={{ due: dateKey(day) }} placeholder={`Add a task for ${format(day, "EEE d")}…`} compact />
      {(allDay.length > 0) && (
        <div className="mt-2 flex flex-col gap-1">
          {allDay.map((e) => (
            <EventCard key={e.id} ev={e} now={now} dense />
          ))}
        </div>
      )}
      {unscheduled.length > 0 && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[0.8em] text-muted">
            {unscheduled.length} task{unscheduled.length === 1 ? "" : "s"} without a time slot
          </span>
          <button className="btn btn-sm" onClick={plan}>
            <Wand2 size={13} /> Plan my day
          </button>
        </div>
      )}
      <UnscheduledList tasks={unscheduled} day={day} />
      {empty && noSources && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-2/50 px-3 py-2 text-[0.8em] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={13} /> Connect a calendar to see meetings alongside your plan.
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onAddSource}>
            Add
          </button>
        </div>
      )}
      <div className="mt-3">
        <Timeline day={day} events={events} tasks={timeboxed} now={now} startHour={startHour} endHour={endHour} />
      </div>
      <div className="mt-3 text-center text-[0.7em] text-faint">Drag tasks onto the timeline · drag blocks to move, pull the bottom edge to resize · double-click a block to edit, empty space to add an event</div>
    </div>
  );
}
