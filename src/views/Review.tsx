import { useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CalendarClock, CheckSquare, ChevronLeft, ChevronRight, Flame, Minus, Repeat, Sparkles, Timer } from "lucide-react";
import { useTasks } from "@/stores/tasks";
import { useFocus } from "@/stores/focus";
import { useHabits } from "@/stores/habits";
import { useJournal } from "@/stores/journal";
import { useCalendar } from "@/stores/calendar";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { activityByDay, sum } from "@/lib/activity";
import { timeboxOf } from "@/components/Timeline";
import { dateKey, formatDuration, parseDue, weekDays } from "@/lib/dates";
import { cn } from "@/lib/ids";
import type { Task } from "@/lib/types";

function pct(a: number, b: number): number | null {
  if (!b) return a ? 100 : null;
  return Math.round(((a - b) / b) * 100);
}

function Trend({ now, prev, invert }: { now: number; prev: number; invert?: boolean }) {
  const p = pct(now, prev);
  if (p === null || p === 0) return <span className="inline-flex items-center gap-0.5 text-faint"><Minus size={11} /> same</span>;
  const up = p > 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("inline-flex items-center gap-0.5", good ? "text-success" : "text-danger")}>
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(p)}%
    </span>
  );
}

/** Weekly review: this week versus last, patterns, and what to carry forward. */
export function ReviewView() {
  const tasks = useTasks((s) => s.tasks);
  const history = useFocus((s) => s.history);
  const habits = useHabits((s) => s.habits);
  const entries = useJournal((s) => s.entries);
  const eventsBetween = useCalendar((s) => s.eventsBetween);
  const weekStartsOn = useSettings((s) => s.settings.calendar.weekStartsOn);
  const goalMin = useSettings((s) => s.settings.focus.dailyGoalMin);
  const navigate = useUi((s) => s.navigate);
  const [offset, setOffset] = useState(0);
  const anchor = addDays(new Date(), offset * 7);
  const days = weekDays(anchor, weekStartsOn);
  const prevDays = weekDays(addDays(anchor, -7), weekStartsOn);
  const week = useMemo(() => activityByDay({ tasks, history, entries, habits }, days[0], days[6]), [tasks, history, entries, habits, offset]);
  const prev = useMemo(() => activityByDay({ tasks, history, entries, habits }, prevDays[0], prevDays[6]), [tasks, history, entries, habits, offset]);
  const wStart = startOfDay(days[0]).getTime();
  const wEnd = startOfDay(addDays(days[6], 1)).getTime();
  const isCurrent = offset === 0;

  const doneTasks = tasks.filter((t) => t.status === "done" && t.completedAt && t.completedAt >= wStart && t.completedAt < wEnd);
  const focusSecs = sum(week, (d) => d.focusSecs);
  const prevFocus = sum(prev, (d) => d.focusSecs);
  const blocks = sum(week, (d) => d.focusBlocks);
  const habitsDone = sum(week, (d) => d.habitsDone);
  const habitsSched = sum(week, (d) => d.habitsScheduled);
  const prevHabitsRate = sum(prev, (d) => d.habitsScheduled) ? sum(prev, (d) => d.habitsDone) / sum(prev, (d) => d.habitsScheduled) : 0;
  const journalCount = sum(week, (d) => d.journalEntries);
  const journalWords = sum(week, (d) => d.journalWords);
  const activeDays = week.filter((d) => d.score > 0).length;
  const goalDays = week.filter((d) => d.focusSecs >= goalMin * 60).length;
  const bestDay = [...week].sort((a, b) => b.score - a.score)[0];
  const events = eventsBetween(wStart, wEnd);
  const meetingSecs = sum(events.filter((e) => !e.allDay), (e) => (e.end - e.start) / 1000);
  const timeboxed = tasks.filter((t) => { const b = timeboxOf(t); return b && b.start >= wStart && b.start < wEnd; });
  const timeboxedDone = timeboxed.filter((t) => t.status === "done").length;
  const unfinished: Task[] = tasks.filter((t) => {
    if (t.status !== "open" || t.backlog || !t.due) return false;
    const d = parseDue(t.due);
    return !!d && d.getTime() < wEnd && d.getTime() >= wStart - 30 * 86_400_000;
  });
  const overdueNow = tasks.filter((t) => t.status === "open" && !t.backlog && t.due && t.due.slice(0, 10) < dateKey());
  const topTasks = useMemo(() => {
    const m = new Map<string, { title: string; secs: number }>();
    for (const h of history) {
      if (h.phase !== "work" || h.endedAt < wStart || h.endedAt >= wEnd) continue;
      const k = h.taskId ?? h.label ?? "untitled";
      const cur = m.get(k) ?? { title: h.taskTitle ?? h.label ?? "Unlinked focus", secs: 0 };
      cur.secs += h.actualSecs;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.secs - a.secs).slice(0, 4);
  }, [history, offset]);
  const peakHour = useMemo(() => {
    const hours = new Array(24).fill(0) as number[];
    for (const h of history) if (h.phase === "work" && h.endedAt >= wStart && h.endedAt < wEnd) hours[new Date(h.startedAt).getHours()] += h.actualSecs;
    const max = Math.max(...hours);
    return max > 0 ? hours.indexOf(max) : null;
  }, [history, offset]);
  const carry = [...overdueNow, ...unfinished.filter((t) => !overdueNow.includes(t))].slice(0, 8);
  const insights: string[] = [];
  if (focusSecs > prevFocus * 1.2 && prevFocus > 0) insights.push(`Focus time is up ${pct(focusSecs, prevFocus)}% on last week.`);
  if (prevFocus > 0 && focusSecs < prevFocus * 0.8) insights.push(`Focus time dropped ${Math.abs(pct(focusSecs, prevFocus) ?? 0)}% versus last week.`);
  if (peakHour !== null) insights.push(`Your most productive hour was around ${format(new Date(2000, 0, 1, peakHour), "h a")}. Protect it.`);
  if (timeboxed.length > 0) insights.push(`${timeboxedDone} of ${timeboxed.length} timeboxed tasks got done (${Math.round((timeboxedDone / timeboxed.length) * 100)}%).`);
  if (habitsSched > 0) insights.push(`Habits ${Math.round((habitsDone / habitsSched) * 100)}% complete${prevHabitsRate ? `, last week ${Math.round(prevHabitsRate * 100)}%` : ""}.`);
  if (meetingSecs > 0) insights.push(`${formatDuration(meetingSecs)} in meetings versus ${formatDuration(focusSecs)} of deep focus.`);
  if (journalCount === 0 && isCurrent) insights.push("No journal entries yet this week. Even two lines count.");
  if (activeDays === 7) insights.push("Active every single day. That is consistency.");

  return (
    <div className="scroll h-full px-4 pb-4">
      <div className="flex items-center gap-2 pt-1">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[1.05em] font-semibold">{isCurrent ? "This week" : offset === -1 ? "Last week" : `Week of ${format(days[0], "d MMM")}`}</div>
          <div className="text-[0.76em] text-muted">
            {format(days[0], "d MMM")} – {format(days[6], "d MMM yyyy")} · {activeDays}/7 active days
          </div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" disabled={isCurrent} onClick={() => setOffset((o) => Math.min(0, o + 1))} aria-label="Next week">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile icon={<CheckSquare size={13} />} label="Completed" value={String(doneTasks.length)} sub={<Trend now={doneTasks.length} prev={sum(prev, (d) => d.tasksDone)} />} />
        <Tile icon={<Timer size={13} />} label="Focus" value={formatDuration(focusSecs)} sub={<span className="inline-flex items-center gap-2"><Trend now={focusSecs} prev={prevFocus} /><span className="text-faint">{blocks} blocks · goal met {goalDays}/7</span></span>} />
        <Tile icon={<Repeat size={13} />} label="Habits" value={habitsSched ? `${Math.round((habitsDone / habitsSched) * 100)}%` : "—"} sub={<span className="text-faint">{habitsDone}/{habitsSched} check-ins</span>} />
        <Tile icon={<BookOpen size={13} />} label="Journal" value={String(journalCount)} sub={<span className="text-faint">{journalWords} words</span>} />
      </div>

      <div className="card mt-3 p-3">
        <div className="mb-2 text-[0.85em] font-medium">Day by day</div>
        <div className="flex items-end gap-1.5">
          {week.map((d, i) => {
            const max = Math.max(1, ...week.map((x) => x.score));
            const isToday = d.key === dateKey();
            return (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-end" style={{ height: 56 }}>
                  <div className={cn("w-full rounded-t-md", d.key === bestDay?.key && d.score > 0 ? "bg-accent" : "bg-accent/45")} style={{ height: `${Math.max(3, (d.score / max) * 100)}%` }} aria-label={`${d.key} score ${d.score.toFixed(1)}`} />
                </div>
                <span className={cn("text-[0.68em]", isToday ? "font-semibold text-accent" : "text-faint")}>{format(days[i], "EEEEE")}</span>
              </div>
            );
          })}
        </div>
        {bestDay && bestDay.score > 0 && (
          <div className="mt-1.5 text-[0.75em] text-faint">
            Best day: {format(new Date(bestDay.key + "T00:00:00"), "EEEE")} · {bestDay.tasksDone} tasks, {formatDuration(bestDay.focusSecs)} focus
          </div>
        )}
      </div>

      {topTasks.length > 0 && (
        <Section title="Where the focus went">
          {topTasks.map((t) => (
            <div key={t.title} className="flex items-center gap-2 py-1 text-[0.85em]">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="tabular text-muted">{formatDuration(t.secs)}</span>
            </div>
          ))}
        </Section>
      )}

      {insights.length > 0 && (
        <Section title="Patterns">
          {insights.map((s) => (
            <div key={s} className="flex items-start gap-2 py-1 text-[0.85em]">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
              <span>{s}</span>
            </div>
          ))}
        </Section>
      )}

      {(events.length > 0 || timeboxed.length > 0) && (
        <Section title="Calendar & timeboxing">
          <div className="grid grid-cols-2 gap-2 text-[0.85em]">
            <div className="rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <div className="text-[0.75em] uppercase tracking-wider text-faint">Meetings</div>
              <div>{events.filter((e) => !e.allDay).length} · {formatDuration(meetingSecs)}</div>
            </div>
            <div className="rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <div className="text-[0.75em] uppercase tracking-wider text-faint">Timeboxed</div>
              <div>
                {timeboxedDone}/{timeboxed.length} done
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title={isCurrent ? "Carry into next week" : "Left unfinished"} action={carry.length > 0 ? <button className="btn btn-ghost btn-sm text-muted" onClick={() => navigate("tasks")}>Tasks <ArrowRight size={12} /></button> : undefined}>
        {carry.length === 0 ? (
          <div className="py-1 text-[0.85em] text-faint">Nothing left behind. Clean slate.</div>
        ) : (
          carry.map((t) => (
            <button key={t.id} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[0.85em] hover:bg-surface-2/60" onClick={() => { navigate("tasks"); useUi.getState().setEditingTask(t.id); }}>
              <CalendarClock size={12} className={cn("shrink-0", overdueNow.includes(t) ? "text-danger" : "text-faint")} />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              {t.due && <span className="text-[0.85em] text-faint">{t.due.slice(5, 10)}</span>}
            </button>
          ))
        )}
        {carry.length > 0 && isCurrent && (
          <button
            className="btn btn-sm mt-2"
            onClick={() => {
              const next = dateKey(addDays(days[6], 1));
              for (const t of overdueNow) useTasks.getState().reschedule(t.id, next);
              useUi.getState().toast({ title: `Moved ${overdueNow.length} overdue task${overdueNow.length === 1 ? "" : "s"} to next week`, kind: "success" });
            }}
            disabled={overdueNow.length === 0}
          >
            <Flame size={13} /> Move overdue to next week
          </button>
        )}
      </Section>
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="card px-3 py-2">
      <div className="flex items-center gap-1 text-[0.7em] uppercase tracking-wider text-faint">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-[1.35em] font-semibold tabular">{value}</div>
      {sub && <div className="text-[0.72em] text-muted">{sub}</div>}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="section-title">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
