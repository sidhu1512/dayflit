import { useMemo } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { ArrowRight, CalendarDays, Play, Sun, Video, Wand2 } from "lucide-react";
import { autoPlan, timeboxOf } from "@/components/Timeline";
import { JournalTodayCard } from "@/views/Journal";
import { MeetingPrep } from "@/components/MeetingPrep";
import { useTasks, todayTasks, overdueTasks, completedOn, sortTasks } from "@/stores/tasks";
import { useHabits, habitsForDay, isDoneOn } from "@/stores/habits";
import { useCalendar, eventsOnDay, nextMeeting } from "@/stores/calendar";
import { useFocus, focusSecondsOn } from "@/stores/focus";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { QuickAdd } from "@/components/QuickAdd";
import { TaskItem } from "@/components/TaskItem";
import { HabitRow } from "@/components/HabitRow";
import { EventCard } from "@/components/EventCard";
import { MediaCard } from "@/components/MediaCard";
import { FocusPanel } from "@/components/FocusPanel";
import { Empty } from "@/components/Empty";
import { dateKey, formatDuration } from "@/lib/dates";
import { openExternal } from "@/lib/open";
import { useNow } from "@/lib/useNow";

export function TodayView() {
  const now = useNow(30_000);
  const tasks = useTasks((s) => s.tasks);
  const habits = useHabits((s) => s.habits);
  const eventsBetween = useCalendar((s) => s.eventsBetween);
  const cache = useCalendar((s) => s.cache);
  const sources = useCalendar((s) => s.sources);
  const snap = useFocus((s) => s.snap);
  const history = useFocus((s) => s.history);
  const settings = useSettings((s) => s.settings);
  const navigate = useUi((s) => s.navigate);
  const selectedId = useUi((s) => s.selectedTaskId);

  const today = new Date(now);
  const key = dateKey(today);
  const due = useMemo(() => todayTasks(tasks, today), [tasks, now]);
  const overdue = useMemo(() => overdueTasks(tasks, today), [tasks, now]);
  const done = useMemo(() => completedOn(tasks, key), [tasks, key]);
  const tomorrow = useMemo(() => sortTasks(tasks.filter((t) => t.status === "open" && t.due?.slice(0, 10) === dateKey(addDays(today, 1)))), [tasks, now]);
  const events = useMemo(() => eventsOnDay(eventsBetween(startOfDay(today).getTime(), startOfDay(addDays(today, 1)).getTime()), today), [cache, sources, now]);
  const upcomingEvents = events.filter((e) => e.end > now);
  const meeting = nextMeeting(events, now, 15);
  const todaysHabits = habitsForDay(habits, today);
  const habitsDone = todaysHabits.filter((h) => isDoneOn(h, key)).length;
  const focusSecs = focusSecondsOn(history, key);
  const goal = settings.focus.dailyGoalMin * 60;
  const running = snap.session && snap.session.status !== "finished";
  const hour = today.getHours();
  const greeting = hour < 5 ? "Night owl mode" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const total = due.length + done.length;

  return (
    <div className="scroll h-full px-4 pb-4">
      <div className="flex items-end justify-between pt-1">
        <div>
          <div className="text-[0.78em] font-medium uppercase tracking-widest text-faint">{format(today, "EEEE, d MMMM")}</div>
          <h1 className="text-[1.5em] font-semibold leading-tight">{greeting}</h1>
        </div>
        <div className="text-right text-[0.78em] text-muted">
          {total > 0 && (
            <div>
              {done.length}/{total} tasks
            </div>
          )}
          {focusSecs > 0 && (
            <div className={focusSecs >= goal ? "text-success" : ""}>
              {formatDuration(focusSecs)} focused{goal ? ` · goal ${settings.focus.dailyGoalMin}m` : ""}
            </div>
          )}
        </div>
      </div>

      {meeting && (
        <button className="card card-hover anim-slide mt-3 flex w-full items-center gap-3 !border-accent/40 !bg-accent/10 px-3 py-2.5 text-left" onClick={() => void openExternal(meeting.meeting!.url)}>
          <Video size={18} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.92em] font-medium">{meeting.title}</div>
            <div className="text-[0.78em] text-muted">
              {meeting.start <= now ? "Happening now" : `Starts in ${Math.max(1, Math.round((meeting.start - now) / 60_000))} min`} · {meeting.meeting!.provider}
            </div>
          </div>
          <span className="btn btn-primary btn-sm">Join</span>
        </button>
      )}
      {meeting && <MeetingPrep ev={meeting} />}

      <div className="mt-3">
        {running ? (
          <div className="card p-3">
            <FocusPanel size={150} />
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="btn flex-1 justify-start" onClick={() => navigate("focus")}>
              <Play size={14} className="text-accent" /> Start a focus session
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <QuickAdd extra={{ due: key }} placeholder="Add a task for today…" />
        </div>
        {due.some((t) => !timeboxOf(t)) && (
          <button
            className="btn shrink-0 !py-2"
            onClick={() => {
              const n = autoPlan(today, due, events, now, settings.calendar.dayEndHour, useTasks.getState().update);
              useUi.getState().toast({ title: n ? `Planned ${n} task${n === 1 ? "" : "s"} on the calendar` : "No room left today", kind: n ? "success" : "info", action: n ? { label: "Open", onClick: () => navigate("calendar") } : undefined });
            }}
            aria-label="Plan my day"
            data-tip="Plan my day"
          >
            <Wand2 size={15} />
          </button>
        )}
      </div>

      {overdue.length > 0 && (
        <Section title={`Overdue · ${overdue.length}`} accent="text-danger">
          {sortTasks(overdue).map((t) => (
            <TaskItem key={t.id} task={t} selected={selectedId === t.id} dense />
          ))}
        </Section>
      )}

      <Section title={`Today · ${due.filter((t) => !overdue.includes(t)).length}`}>
        {due.filter((t) => !overdue.includes(t)).length === 0 && overdue.length === 0 ? (
          <Empty icon={<Sun size={28} />} title={done.length ? "All clear for today" : "Nothing planned yet"} body={done.length ? `${done.length} done. Enjoy the calm or pull something from tomorrow.` : "Add a task above or press Ctrl+N."} />
        ) : (
          due.filter((t) => !overdue.includes(t)).map((t) => <TaskItem key={t.id} task={t} selected={selectedId === t.id} dense />)
        )}
      </Section>

      {(upcomingEvents.length > 0 || sources.length > 0) && (
        <Section title="Agenda" action={<button className="btn btn-ghost btn-sm text-muted" onClick={() => navigate("calendar")}>Calendar <ArrowRight size={12} /></button>}>
          {upcomingEvents.length === 0 ? (
            <div className="px-2 py-1 text-[0.85em] text-faint">No more events today.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {upcomingEvents.slice(0, 6).map((e) => (
                <EventCard key={e.id} ev={e} now={now} dense />
              ))}
            </div>
          )}
        </Section>
      )}
      {sources.length === 0 && upcomingEvents.length === 0 && (
        <button className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[0.82em] text-faint hover:bg-surface-2/60" onClick={() => navigate("settings", "calendar")}>
          <CalendarDays size={14} /> Connect a calendar to see today's meetings here
        </button>
      )}

      {todaysHabits.length > 0 && (
        <Section title={`Habits · ${habitsDone}/${todaysHabits.length}`} action={<button className="btn btn-ghost btn-sm text-muted" onClick={() => navigate("habits")}>All <ArrowRight size={12} /></button>}>
          {todaysHabits.map((h) => (
            <HabitRow key={h.id} habit={h} dense onOpen={() => navigate("habits", h.id)} />
          ))}
        </Section>
      )}

      <JournalTodayCard />

      {settings.media.showCard && (
        <div className="mt-4">
          <MediaCard />
        </div>
      )}

      {tomorrow.length > 0 && (
        <Section title={`Tomorrow · ${tomorrow.length}`}>
          {tomorrow.slice(0, 5).map((t) => (
            <TaskItem key={t.id} task={t} dense />
          ))}
        </Section>
      )}

      {done.length > 0 && settings.tasks.showCompletedInToday && (
        <Section title={`Done today · ${done.length}`}>
          {done.slice(0, 8).map((t) => (
            <TaskItem key={t.id} task={t} dense />
          ))}
        </Section>
      )}
    </div>
  );
}

export function Section({ title, children, action, accent }: { title: string; children: React.ReactNode; action?: React.ReactNode; accent?: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between px-1">
        <div className={`section-title ${accent ?? ""}`}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
