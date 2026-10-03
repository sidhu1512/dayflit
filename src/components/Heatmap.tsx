import { useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { BookOpen, CheckSquare, Flame, Repeat, Timer } from "lucide-react";
import type { DayActivity } from "@/lib/activity";
import { activityStreak, longestStreak, sum } from "@/lib/activity";
import { dateKey, formatDuration, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/ids";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** GitHub-style consistency heatmap over the last `weeks` weeks with a day inspector. */
export function Heatmap({ days, weeks = 26, weekStartsOn = 1, onSelect }: { days: DayActivity[]; weeks?: number; weekStartsOn?: 0 | 1 | 6; onSelect?: (d: DayActivity | null) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(days.map((d) => [d.key, d])), [days]);
  const today = startOfDay(new Date());
  // grid columns = weeks, rows = 7, ending at today
  const offset = (today.getDay() - weekStartsOn + 7) % 7;
  const gridStart = addDays(today, -(weeks * 7 - 1) - offset + (7 - 1) - (6 - offset));
  const cols: Date[][] = [];
  let cursor = addDays(today, -offset - (weeks - 1) * 7);
  for (let c = 0; c < weeks; c++) {
    const col: Date[] = [];
    for (let r = 0; r < 7; r++) {
      col.push(cursor);
      cursor = addDays(cursor, 1);
    }
    cols.push(col);
  }
  void gridStart;
  const active = days.filter((d) => d.score > 0).length;
  const streak = activityStreak(days);
  const best = longestStreak(days);
  const sel = selected ? byKey.get(selected) ?? null : null;

  const pick = (k: string | null) => {
    setSelected(k);
    onSelect?.(k ? byKey.get(k) ?? null : null);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78em] text-muted">
        <span>
          <span className="font-semibold text-text">{active}</span> active days
        </span>
        <span className="inline-flex items-center gap-1">
          <Flame size={12} className="text-warning" /> <span className="font-semibold text-text">{streak}</span> day streak
        </span>
        <span>
          best <span className="font-semibold text-text">{best}</span>
        </span>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1">
          less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: cellColor(l) }} />
          ))}
          more
        </span>
      </div>
      <div className="scroll overflow-x-auto pb-1">
        <div className="relative inline-block">
          <div className="mb-0.5 flex h-3 text-[0.65em] text-faint" style={{ paddingLeft: 0 }}>
            {cols.map((col, i) => {
              const first = col[0];
              const show = i === 0 || first.getDate() <= 7;
              return (
                <div key={i} className="w-[13px] shrink-0">
                  {show && first.getDate() <= 7 ? MONTHS[first.getMonth()] : ""}
                </div>
              );
            })}
          </div>
          <div className="flex gap-[2px]">
            {cols.map((col, i) => (
              <div key={i} className="flex flex-col gap-[2px]">
                {col.map((d) => {
                  const k = dateKey(d);
                  const a = byKey.get(k);
                  const future = d.getTime() > today.getTime();
                  return (
                    <button
                      key={k}
                      className={cn("h-[11px] w-[11px] rounded-[3px] transition-transform hover:scale-125", selected === k && "ring-2 ring-text/60", future && "opacity-0")}
                      style={{ background: cellColor(a?.level ?? 0) }}
                      onClick={() => pick(selected === k ? null : k)}
                      aria-label={`${k}: ${a ? describe(a) : "no activity"}`}
                      disabled={future}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {sel && (
        <div className="anim-fade mt-2 rounded-xl bg-surface-2/60 px-3 py-2 text-[0.82em]">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">
              {relativeDay(new Date(sel.key + "T00:00:00"))} <span className="font-normal text-faint">· {format(new Date(sel.key + "T00:00:00"), "d MMM yyyy")}</span>
            </span>
            <span className="text-faint">score {sel.score.toFixed(1)}</span>
          </div>
          {sel.score === 0 ? (
            <div className="text-faint">A rest day.</div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CheckSquare size={12} /> {sel.tasksDone} task{sel.tasksDone === 1 ? "" : "s"} done
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Timer size={12} /> {formatDuration(sel.focusSecs)} focus · {sel.focusBlocks} block{sel.focusBlocks === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen size={12} /> {sel.journalEntries} journal entr{sel.journalEntries === 1 ? "y" : "ies"}
                {sel.journalWords ? ` · ${sel.journalWords} words` : ""}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Repeat size={12} /> {sel.habitsDone}/{sel.habitsScheduled} habits
              </span>
            </div>
          )}
        </div>
      )}
      {!sel && days.length > 0 && (
        <div className="mt-2 text-[0.75em] text-faint">
          {formatDuration(sum(days, (d) => d.focusSecs))} focused · {sum(days, (d) => d.tasksDone)} tasks · {sum(days, (d) => d.journalEntries)} entries over the last {weeks} weeks. Click a day to inspect it.
        </div>
      )}
    </div>
  );
}

function describe(a: DayActivity): string {
  return `${a.tasksDone} tasks, ${Math.round(a.focusSecs / 60)} focus min, ${a.journalEntries} journal, ${a.habitsDone}/${a.habitsScheduled} habits`;
}

export function cellColor(level: number): string {
  if (level <= 0) return "rgb(var(--surface-3) / 0.7)";
  const alpha = [0, 0.3, 0.5, 0.75, 1][Math.min(4, level)];
  return `rgb(var(--accent) / ${alpha})`;
}
