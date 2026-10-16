import { useMemo } from "react";
import { format } from "date-fns";
import { CheckCircle2, Flame, Timer, XCircle } from "lucide-react";
import { useFocus, focusSecondsOn, focusStreak, workEntries } from "@/stores/focus";
import { useSettings } from "@/stores/settings";
import { FocusPanel } from "@/components/FocusPanel";
import { MediaCard } from "@/components/MediaCard";
import { dateKey, formatDuration, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { InfoHint } from "@/components/ui/InfoHint";

export function FocusView() {
  const history = useFocus((s) => s.history);
  const snap = useFocus((s) => s.snap);
  const settings = useSettings((s) => s.settings);
  const running = snap.session && snap.session.status !== "finished";
  const todaySecs = focusSecondsOn(history, dateKey());
  const goal = settings.focus.dailyGoalMin * 60;
  const streak = focusStreak(history);
  const recent = useMemo(() => [...workEntries(history)].sort((a, b) => b.endedAt - a.endedAt).slice(0, 25), [history]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof recent>();
    for (const e of recent) {
      const k = dateKey(new Date(e.endedAt));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [recent]);

  return (
    <div className="scroll h-full px-4 pb-4">
      <div className={cn("card mt-1 p-4", running && "!border-accent/30")}>
        <FocusPanel size={running ? 210 : 160} />
      </div>

      <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))] min-w-0">
        <Stat icon={<Timer size={14} />} label="Today" value={formatDuration(todaySecs)} sub={goal ? `${Math.min(100, Math.round((todaySecs / goal) * 100))}% of ${settings.focus.dailyGoalMin}m` : undefined} progress={goal ? todaySecs / goal : undefined} />
        <Stat icon={<Flame size={14} />} label="Streak" value={`${streak}d`} sub="days with focus" />
        <Stat icon={<CheckCircle2 size={14} />} label="Blocks" value={String(workEntries(history).filter((e) => dateKey(new Date(e.endedAt)) === dateKey()).length)} sub="completed today" />
      </div>

      {settings.media.showCard && (
        <div className="mt-3">
          <MediaCard />
        </div>
      )}

      <div className="section-title mt-5 mb-1 px-1 flex items-center gap-1.5">
        <span>Recent sessions</span>
        <InfoHint text="Completed focus blocks and stopwatch intervals tracked across the current week." />
      </div>
      {recent.length === 0 ? (
        <div className="px-1 py-2 text-[0.85em] text-faint">Completed focus blocks appear here.</div>
      ) : (
        groups.map(([k, list]) => (
          <div key={k} className="mb-2">
            <div className="px-1 py-1 text-[0.75em] font-medium text-muted">
              {relativeDay(new Date(k + "T00:00:00"))} · {formatDuration(list.reduce((a, e) => a + e.actualSecs, 0))}
            </div>
            {list.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.85em] hover:bg-surface-2/50">
                {e.completed ? <CheckCircle2 size={14} className="shrink-0 text-success" /> : <XCircle size={14} className="shrink-0 text-faint" />}
                <span className="min-w-0 flex-1 truncate">{e.taskTitle ?? e.label ?? (e.mode === "stopwatch" ? "Stopwatch" : "Focus block")}</span>
                <span className="text-faint">{format(new Date(e.startedAt), "h:mm a")}</span>
                <span className="tabular w-12 text-right text-muted">{formatDuration(e.actualSecs)}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub, progress }: { icon: React.ReactNode; label: string; value: string; sub?: string; progress?: number }) {
  return (
    <div className="card relative overflow-hidden px-3 py-2 min-w-0">
      <div className="flex items-center gap-1 text-[0.72em] uppercase tracking-wider text-faint truncate">
        {icon} <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 text-[1.3em] font-semibold tabular truncate">{value}</div>
      {sub && <div className="text-[0.72em] text-muted truncate">{sub}</div>}
      {progress !== undefined && <div className="absolute bottom-0 left-0 h-0.5 bg-accent transition-[width]" style={{ width: `${Math.min(100, progress * 100)}%` }} />}
    </div>
  );
}
