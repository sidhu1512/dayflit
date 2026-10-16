import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CheckSquare, Flame, Repeat, Timer } from "lucide-react";
import { useFocus, focusByDay, focusByHour, focusByTask, focusStreak, workEntries } from "@/stores/focus";
import { useTasks } from "@/stores/tasks";
import { useHabits, isDoneOn, isScheduledOn } from "@/stores/habits";
import { dateKey, formatDuration } from "@/lib/dates";
import { useJournal } from "@/stores/journal";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { activityByDay } from "@/lib/activity";
import { Heatmap } from "@/components/Heatmap";
import { ReviewView } from "@/views/Review";
import { subDays } from "date-fns";
import { cn } from "@/lib/ids";
import { IntelligencePatterns } from "@/components/IntelligencePatterns";
import { SlidingPillContainer } from "@/components/ui/MotionPrimitives";
import { InfoHint } from "@/components/ui/InfoHint";

const RANGES = [7, 14, 30, 90] as const;

export function StatsView() {
  const viewParam = useUi((s) => s.viewParam);
  const [tab, setTab] = useState<"overview" | "review" | "consistency">("overview");
  useEffect(() => {
    if (viewParam === "review" || viewParam === "consistency" || viewParam === "overview") {
      setTab(viewParam);
      useUi.getState().navigate("stats", null);
    }
  }, [viewParam]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-1 flex-nowrap min-w-0">
        <div className="text-[1.05em] font-semibold truncate min-w-0 flex-1 flex items-center gap-1.5">
          <span>Insights</span>
          <InfoHint text="Productivity patterns, focus metrics, and daily consistency trends." />
        </div>
        <SlidingPillContainer activeKey={tab} className="flex rounded-lg bg-surface-2/60 p-0.5 shrink-0" pillClassName="bg-surface-3 shadow-xs rounded-md">
          {([["overview", "Overview"], ["review", "Weekly review"], ["consistency", "Consistency"]] as const).map(([id, label]) => (
            <button
              key={id}
              data-active={tab === id ? "true" : undefined}
              className={cn("relative z-10 rounded-md px-2 py-0.5 text-[0.8em] transition-colors shrink-0 whitespace-nowrap", tab === id ? "text-text font-medium" : "text-muted")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </SlidingPillContainer>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "overview" && <Overview />}
        {tab === "review" && <ReviewView />}
        {tab === "consistency" && <Consistency />}
      </div>
    </div>
  );
}

function Consistency() {
  const tasks = useTasks((s) => s.tasks);
  const history = useFocus((s) => s.history);
  const habits = useHabits((s) => s.habits);
  const entries = useJournal((s) => s.entries);
  const weekStartsOn = useSettings((s) => s.settings.calendar.weekStartsOn);
  const [weeks, setWeeks] = useState<26 | 52>(26);
  const days = useMemo(() => activityByDay({ tasks, history, entries, habits }, subDays(new Date(), weeks * 7), new Date()), [tasks, history, entries, habits, weeks]);
  return (
    <div className="scroll h-full px-4 pb-4 pt-2">
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between flex-nowrap min-w-0 gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <div className="text-[0.85em] font-medium truncate">Consistency</div>
            <InfoHint text="Completed tasks, focus time, journal entries and habits, every day. Levels are relative to your own typical day." />
          </div>
          <div className="flex rounded-lg bg-surface-2/60 p-0.5 shrink-0">
            {([26, 52] as const).map((w) => (
              <button key={w} className={cn("rounded-md px-2 py-0.5 text-[0.8em] shrink-0 whitespace-nowrap", weeks === w ? "bg-surface-3 text-text font-medium" : "text-muted")} onClick={() => setWeeks(w)}>
                {w === 26 ? "6 months" : "1 year"}
              </button>
            ))}
          </div>
        </div>
        <Heatmap days={days} weeks={weeks} weekStartsOn={weekStartsOn} />
      </div>
      <div className="mt-3 text-[0.75em] text-faint">A day counts when you complete a task, finish a focus block, write a journal entry or check off a habit. Levels are relative to your own typical day.</div>
    </div>
  );
}

function Overview() {
  const history = useFocus((s) => s.history);
  const tasks = useTasks((s) => s.tasks);
  const habits = useHabits((s) => s.habits);
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const today = new Date();

  const focusDays = useMemo(() => focusByDay(history, days, today), [history, days]);
  const totalFocus = focusDays.reduce((a, d) => a + d.secs, 0);
  const sessions = focusDays.reduce((a, d) => a + d.sessions, 0);
  const activeDays = focusDays.filter((d) => d.secs > 0).length;
  const doneByDay = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const d = addDays(today, i - days + 1);
        const k = dateKey(d);
        return { key: k, n: tasks.filter((t) => t.status === "done" && t.completedAt && dateKey(new Date(t.completedAt)) === k).length };
      }),
    [tasks, days],
  );
  const doneTotal = doneByDay.reduce((a, d) => a + d.n, 0);
  const created = tasks.filter((t) => t.createdAt > Date.now() - days * 86_400_000).length;
  const hours = useMemo(() => focusByHour(history, days), [history, days]);
  const peakHour = hours.indexOf(Math.max(...hours));
  const byTask = useMemo(() => focusByTask(history, days).slice(0, 6), [history, days]);
  const completionRate = useMemo(() => {
    const entries = workEntries(history).filter((e) => e.endedAt > Date.now() - days * 86_400_000);
    return entries.length ? entries.filter((e) => e.completed).length / entries.length : 0;
  }, [history, days]);
  const habitRate = useMemo(() => {
    let sched = 0;
    let done = 0;
    for (let i = 0; i < days; i++) {
      const d = addDays(today, -i);
      for (const h of habits) {
        if (h.archived || dateKey(d) < dateKey(new Date(h.createdAt)) || !isScheduledOn(h, d)) continue;
        sched++;
        if (isDoneOn(h, dateKey(d))) done++;
      }
    }
    return sched ? done / sched : null;
  }, [habits, days]);
  const maxFocus = Math.max(1, ...focusDays.map((d) => d.secs));
  const maxDone = Math.max(1, ...doneByDay.map((d) => d.n));

  return (
    <div className="scroll h-full px-4 pb-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="flex-1 text-[0.85em] text-muted">Last</div>
        <div className="flex rounded-lg bg-surface-2/60 p-0.5">
          {RANGES.map((r) => (
            <button key={r} className={cn("rounded-md px-2 py-0.5 text-[0.8em]", days === r ? "bg-surface-3 text-text" : "text-muted")} onClick={() => setDays(r)}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile icon={<Timer size={13} />} label="Focus time" value={formatDuration(totalFocus)} sub={`${sessions} blocks · ${activeDays}/${days} days`} />
        <Tile icon={<CheckSquare size={13} />} label="Tasks done" value={String(doneTotal)} sub={`${created} created`} />
        <Tile icon={<Flame size={13} />} label="Focus streak" value={`${focusStreak(history)}d`} sub={`${Math.round(completionRate * 100)}% blocks finished`} />
        <Tile icon={<Repeat size={13} />} label="Habits" value={habitRate === null ? "—" : `${Math.round(habitRate * 100)}%`} sub="completion rate" />
      </div>

      <div className="mt-4">
        <IntelligencePatterns />
      </div>

      <Chart title="Focus per day" subtitle={peakHour >= 0 && hours[peakHour] > 0 ? `Peak hour: ${format(new Date(2000, 0, 1, peakHour), "h a")}` : undefined}>
        <Bars data={focusDays.map((d) => ({ key: d.key, v: d.secs / maxFocus, label: formatDuration(d.secs) }))} days={days} />
      </Chart>

      <Chart title="Tasks completed per day">
        <Bars data={doneByDay.map((d) => ({ key: d.key, v: d.n / maxDone, label: `${d.n}` }))} days={days} color="rgb(60 207 142 / 0.8)" />
      </Chart>

      <Chart title="When you focus" subtitle="by hour of day">
        <div className="flex h-16 items-end gap-px">
          {hours.map((h, i) => {
            const max = Math.max(1, ...hours);
            return <div key={i} className="flex-1 rounded-t-sm bg-accent/70" style={{ height: `${Math.max(2, (h / max) * 100)}%` }} />;
          })}
        </div>
        <div className="mt-1 flex justify-between text-[0.65em] text-faint">
          <span>12am</span>
          <span>6am</span>
          <span>12pm</span>
          <span>6pm</span>
          <span>11pm</span>
        </div>
      </Chart>

      {byTask.length > 0 && (
        <Chart title="Most focused on">
          <div className="flex flex-col gap-1.5">
            {byTask.map((t) => (
              <div key={t.taskId ?? t.title} className="text-[0.85em]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-faint">{t.sessions}×</span>
                  <span className="tabular w-14 text-right text-muted">{formatDuration(t.secs)}</span>
                </div>
                <div className="mt-0.5 h-1 rounded-full bg-surface-3/60">
                  <div className="h-full rounded-full bg-accent/80" style={{ width: `${(t.secs / byTask[0].secs) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Chart>
      )}
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
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

function Chart({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card mt-3 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[0.85em] font-medium">
          <span>{title}</span>
          {subtitle && <InfoHint text={subtitle} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function Bars({ data, days, color }: { data: { key: string; v: number; label: string }[]; days: number; color?: string }) {
  const today = dateKey();
  return (
    <div>
      <div className="flex h-20 items-end gap-px">
        {data.map((d) => (
          <div key={d.key} className="group relative flex-1">
            <div className={cn("w-full rounded-t-sm transition-[height]", d.key === today && "ring-1 ring-text/30")} style={{ height: `${Math.max(2, d.v * 80)}px`, background: color ?? "rgb(var(--accent) / 0.8)" }} />
            <div className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-3 px-1.5 py-0.5 text-[0.7em] group-hover:block">
              {format(new Date(d.key + "T00:00:00"), "EEE d")}: {d.label}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.65em] text-faint">
        <span>{format(addDays(new Date(), -days + 1), "d MMM")}</span>
        <span>today</span>
      </div>
    </div>
  );
}
