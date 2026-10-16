import { useMemo } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { ArrowRight, CalendarDays, Clock, Compass, Moon, Play, RotateCcw, Sparkles, Sun, Video, Wand2 } from "lucide-react";
import { autoPlan, timeboxOf } from "@/components/Timeline";
import { JournalTodayCard } from "@/views/Journal";
import { MeetingPrep } from "@/components/MeetingPrep";
import { useTasks, todayTasks, overdueTasks, completedOn, sortTasks } from "@/stores/tasks";
import { useHabits, habitsForDay, isDoneOn } from "@/stores/habits";
import { useCalendar, eventsOnDay, nextMeeting } from "@/stores/calendar";
import { useFocus, focusSecondsOn } from "@/stores/focus";
import { useLife } from "@/stores/life";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { uiSound } from "@/lib/audio";
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
import { cn } from "@/lib/ids";


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

  const lifeData = useLife((s) => s.data);
  const domains = lifeData.domains;
  const goals = lifeData.goals;
  const projects = lifeData.projects;

  const todaysDomainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    due.forEach((t) => {
      let dId = t.domainId;
      if (!dId && t.goalId) {
        dId = goals.find((g) => g.id === t.goalId)?.domainId || null;
      }
      if (!dId && t.projectId) {
        dId = projects.find((p) => p.id === t.projectId)?.domainId || null;
      }
      if (dId && domains.some((d) => d.id === dId)) {
        counts[dId] = (counts[dId] || 0) + 1;
      }
    });
    todaysHabits.forEach((h) => {
      let dId = h.domainId;
      if (!dId && h.goalId) {
        dId = goals.find((g) => g.id === h.goalId)?.domainId || null;
      }
      if (dId && domains.some((d) => d.id === dId)) {
        counts[dId] = (counts[dId] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([id, count]) => {
        const dom = domains.find((d) => d.id === id);
        return dom ? { domain: dom, count } : null;
      })
      .filter(Boolean) as { domain: (typeof domains)[0]; count: number }[];
  }, [due, todaysHabits, domains, goals, projects]);

  const toast = useUi((s) => s.toast);
  const updateTask = useTasks((s) => s.update);

  // Sunsama-Style Daily Capacity Meter
  const workdayEndHour = 18;
  const currentHourDecimal = today.getHours() + today.getMinutes() / 60;
  const remainingWorkdayHours = Math.max(0, Math.round((workdayEndHour - currentHourDecimal) * 10) / 10);
  const plannedMins = due.reduce((acc, t) => acc + (t.estimateMin || 30), 0);
  const plannedHours = Math.round((plannedMins / 60) * 10) / 10;
  const capacityPercent = remainingWorkdayHours > 0 ? Math.min(100, Math.round((plannedHours / remainingWorkdayHours) * 100)) : 100;
  const isOverCapacity = remainingWorkdayHours > 0 && plannedHours > remainingWorkdayHours;

  const unfinishedTasks = useMemo(() => [...overdue, ...due], [overdue, due]);

  const handleEveningWrapUp = () => {
    if (unfinishedTasks.length === 0) {
      toast({ title: "Evening Wrap-Up", body: "All tasks completed for today! Enjoy your evening.", kind: "success" });
      return;
    }
    const tomorrowKey = dateKey(addDays(today, 1));
    for (const t of unfinishedTasks) {
      updateTask(t.id, { due: tomorrowKey });
    }
    uiSound("pop", 0.35);
    toast({
      title: "Evening Wrap-Up Complete",
      body: `Rolled over ${unfinishedTasks.length} unfinished task${unfinishedTasks.length > 1 ? "s" : ""} to Tomorrow. Rest well!`,
      kind: "success",
    });
  };

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

      {/* Sunsama-Style Daily Capacity Meter & Evening Wrap-Up Ritual */}
      <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-surface-2/40 p-3.5 border hairline transition-all hover:bg-surface-2/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Clock size={13} />
            </span>
            <span className="text-[0.82em] font-semibold text-text">Daily Capacity Meter</span>
          </div>
          <div className="text-[0.76em] text-muted tabular-nums">
            <span className="font-semibold text-text">{plannedHours}h</span> planned ·{" "}
            <span className="font-semibold text-text">{remainingWorkdayHours}h</span> remaining
          </div>
        </div>

        {/* Capacity Bar */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isOverCapacity ? "bg-amber-400" : "bg-accent",
            )}
            style={{ width: `${Math.min(100, Math.max(6, capacityPercent))}%` }}
          />
        </div>

        <div className="mt-0.5 flex items-center justify-between text-[0.74em] gap-2 min-w-0">
          <span className="text-muted truncate min-w-0 flex-1">
            {isOverCapacity
              ? "Careful: Planned tasks exceed remaining workday hours."
              : remainingWorkdayHours === 0
              ? "Workday complete. Time for evening wind-down!"
              : `${remainingWorkdayHours}h of available focus time left.`}
          </span>
          <button
            className="btn btn-ghost btn-sm flex items-center gap-1.5 text-[0.9em] font-medium text-accent hover:bg-accent/10 transition-colors shrink-0 whitespace-nowrap"
            onClick={handleEveningWrapUp}
            title="Roll over all unfinished tasks to tomorrow"
          >
            <Moon size={12} />
            <span>Evening Wrap-Up<span className="hidden sm:inline"> / Roll Over</span></span>
          </button>
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

      {todaysDomainCounts.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-2/40 px-3 py-2 border hairline text-[0.78em] transition-colors hover:bg-surface-2/70 min-w-0">
          <div
            className="flex items-center gap-2 overflow-x-auto overflow-y-hidden no-scrollbar min-w-0 flex-1 flex-nowrap"
            onWheel={(e) => {
              if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
          >
            <span className="flex items-center gap-1 font-semibold text-text shrink-0">
              <Compass size={13} className="text-accent" /> Life Alignment
            </span>
            <div className="flex items-center gap-1.5">
              {todaysDomainCounts.map(({ domain, count }) => (
                <span
                  key={domain.id}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${domain.color} 15%, transparent)`,
                    color: domain.color,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: domain.color }} />
                  {domain.name.split(" ")[0]} ({count})
                </span>
              ))}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm flex items-center gap-1 text-[0.82em] text-muted hover:text-text shrink-0 ml-2"
            onClick={() => navigate("life")}
          >
            Vision & Map <ArrowRight size={11} />
          </button>
        </div>
      )}

      <div className="mt-3">
        {running ? (
          <div className="card p-3">
            <FocusPanel size={150} />
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-surface-2/40 px-3 py-2 border hairline transition-colors hover:bg-surface-2/70">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Play size={14} className="ml-0.5" />
              </span>
              <div>
                <div className="text-[0.88em] font-medium leading-tight">Ready to focus?</div>
                <div className="text-[0.74em] text-muted">Pomodoro or deep work block</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate("focus")}>
              Start Focus
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <QuickAdd extra={{ due: key }} placeholder="Add a task for today…" />
        </div>
        {due.some((t) => !timeboxOf(t)) && (
          <button
            className="btn btn-ghost btn-icon h-[38px] w-[38px] shrink-0 rounded-xl bg-surface-2/70 text-muted hover:text-accent hover:bg-surface-2"
            onClick={() => {
              const n = autoPlan(today, due, events, now, settings.calendar.dayEndHour, useTasks.getState().update);
              useUi.getState().toast({ title: n ? `Planned ${n} task${n === 1 ? "" : "s"} on the calendar` : "No room left today", kind: n ? "success" : "info", action: n ? { label: "Open", onClick: () => navigate("calendar") } : undefined });
            }}
            aria-label="Plan my day"
            title="Auto-plan tasks on calendar"
          >
            <Wand2 size={16} />
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
