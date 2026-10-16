import { useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { Flame, Check, Trophy } from "lucide-react";
import type { Habit } from "@/lib/types";
import { dateKey, formatDue } from "@/lib/dates";
import { isDoneOn, streak } from "@/stores/habits";
import { cn } from "@/lib/ids";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

interface HabitHeatmapProps {
  habit: Habit;
  weeks?: number;
  weekStartsOn?: 0 | 1;
  onToggleDate?: (key: string) => void;
  compact?: boolean;
}

export function HabitHeatmap({
  habit,
  weeks = 16,
  weekStartsOn = 1,
  onToggleDate,
  compact = false,
}: HabitHeatmapProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const today = startOfDay(new Date());

  // Calculate grid columns: each column has 7 days
  const { cols, totalCompletions, completionRate } = useMemo(() => {
    const offset = (today.getDay() - weekStartsOn + 7) % 7;
    let cursor = addDays(today, -offset - (weeks - 1) * 7);
    const columns: Date[][] = [];
    let completedCount = 0;
    let totalEligible = 0;

    for (let c = 0; c < weeks; c++) {
      const col: Date[] = [];
      for (let r = 0; r < 7; r++) {
        col.push(cursor);
        const k = dateKey(cursor);
        if (cursor.getTime() <= today.getTime()) {
          totalEligible++;
          if (isDoneOn(habit, k)) {
            completedCount++;
          }
        }
        cursor = addDays(cursor, 1);
      }
      columns.push(col);
    }

    const rate = totalEligible > 0 ? Math.round((completedCount / totalEligible) * 100) : 0;

    return {
      cols: columns,
      totalCompletions: completedCount,
      completionRate: rate,
    };
  }, [habit, weeks, weekStartsOn, today]);

  const currentStreak = streak(habit);
  const activeHoverDate = hoveredKey ? new Date(hoveredKey + "T00:00:00") : null;
  const hoverCount = hoveredKey ? habit.log[hoveredKey] ?? 0 : 0;
  const hoverDone = hoveredKey ? isDoneOn(habit, hoveredKey) : false;

  return (
    <div className={cn("select-none", compact ? "text-[0.72em]" : "text-[0.8em]")}>
      {/* Top summary row */}
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-muted">
        <div className="flex items-center gap-2.5">
          {currentStreak > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-warning">
              <Flame size={12} /> {currentStreak} streak
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Check size={12} className="text-success" />
            <span className="font-semibold text-text">{totalCompletions}</span> completed
          </span>
          <span className="text-faint">{completionRate}% consistency</span>
        </div>

        <div className="flex items-center gap-1 text-[0.85em] text-faint">
          <span>less</span>
          <span className="h-2 w-2 rounded-[2px] bg-surface-3/50" />
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: `color-mix(in srgb, ${habit.color} 40%, transparent)` }}
          />
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: `color-mix(in srgb, ${habit.color} 75%, transparent)` }}
          />
          <span className="h-2 w-2 rounded-[2px]" style={{ background: habit.color }} />
          <span>more</span>
        </div>
      </div>

      {/* Grid container with horizontal scroll */}
      <div className="overflow-x-auto overflow-y-hidden pb-1">
        <div className="relative inline-block">
          {/* Month labels */}
          <div className="mb-0.5 flex h-3 text-[0.68em] text-faint">
            {cols.map((col, i) => {
              const first = col[0];
              const show = i === 0 || first.getDate() <= 7;
              return (
                <div key={i} className={cn("shrink-0 text-left", compact ? "w-[10px]" : "w-[12px]")}>
                  {show && first.getDate() <= 7 ? MONTHS[first.getMonth()] : ""}
                </div>
              );
            })}
          </div>

          {/* Matrix of days */}
          <div className="flex gap-[2px]">
            {cols.map((col, cIdx) => (
              <div key={cIdx} className="flex flex-col gap-[2px]">
                {col.map((d) => {
                  const k = dateKey(d);
                  const isFuture = d.getTime() > today.getTime();
                  const isToday = k === dateKey(today);
                  const count = habit.log[k] ?? 0;
                  const done = isDoneOn(habit, k);
                  const partial = !done && count > 0;

                  let cellBg = "rgb(var(--surface-3) / 0.4)";
                  if (done) cellBg = habit.color;
                  else if (partial) {
                    const ratio = Math.min(1, count / (habit.target || 1));
                    cellBg = `color-mix(in srgb, ${habit.color} ${Math.round(ratio * 70)}%, transparent)`;
                  }

                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={isFuture}
                      onClick={() => onToggleDate?.(k)}
                      onMouseEnter={() => setHoveredKey(k)}
                      onMouseLeave={() => setHoveredKey(null)}
                      className={cn(
                        "rounded-[2.5px] transition-all",
                        compact ? "h-[9px] w-[9px]" : "h-[11px] w-[11px]",
                        isFuture && "pointer-events-none opacity-0",
                        isToday && "ring-1 ring-accent",
                        hoveredKey === k && "scale-125 ring-2 ring-text/80 z-10",
                      )}
                      style={{
                        background: cellBg,
                        boxShadow: done ? `0 0 6px ${habit.color}40` : undefined,
                      }}
                      aria-label={`${k}: ${done ? "Done" : `${count}/${habit.target}`}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hover inspector badge */}
      {hoveredKey && activeHoverDate && (
        <div className="mt-1 flex items-center justify-between text-[0.78em] text-muted anim-fade">
          <span>
            {format(activeHoverDate, "EEE, MMM d, yyyy")}
            {dateKey(today) === hoveredKey ? " (Today)" : ""}
          </span>
          <span className="font-medium" style={{ color: hoverDone ? habit.color : undefined }}>
            {hoverDone
              ? "Completed"
              : hoverCount > 0
                ? `${hoverCount}/${habit.target} ${habit.unit || "logged"}`
                : "Not logged"}
          </span>
        </div>
      )}
    </div>
  );
}
