import React, { useMemo } from "react";
import { Brain, Flame, Sparkles, TrendingUp, Zap, Clock, Smile } from "lucide-react";
import { useJournal } from "@/stores/journal";
import { useFocus } from "@/stores/focus";
import { useHabits } from "@/stores/habits";
import { useTasks } from "@/stores/tasks";
import { computeBehavioralIntelligence } from "@/lib/correlations";
import { HabitIcon } from "@/components/icons";
import { cn } from "@/lib/ids";

export function IntelligencePatterns({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const entries = useJournal((s) => s.entries);
  const focusHistory = useFocus((s) => s.history);
  const habits = useHabits((s) => s.habits);
  const tasks = useTasks((s) => s.tasks);

  const intel = useMemo(
    () => computeBehavioralIntelligence(tasks, focusHistory, habits, entries),
    [tasks, focusHistory, habits, entries]
  );

  const { moodVsFocus, moodVsHabits, peakProductivity } = intel;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={15} className="text-accent" />
          <span className="text-[0.88em] font-semibold text-text">
            Intelligence & Personal Patterns
          </span>
        </div>
        <span className="text-[0.72em] font-medium text-faint uppercase tracking-wider">
          Local Analytics
        </span>
      </div>

      <div className={cn("grid gap-2.5", compact ? "grid-cols-1" : "[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]")}>
        {/* Pattern 1: Mood vs Focus Depth */}
        <div className="card card-hover relative flex flex-col justify-between p-3.5 border hairline rounded-xl bg-surface/50">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-muted">
                <Flame size={13} className="text-accent" />
                Mood vs. Focus Depth
              </span>
              {moodVsFocus.percentageLift !== null && moodVsFocus.percentageLift > 0 && (
                <span className="chip chip-success text-[0.7em] font-semibold">
                  +{moodVsFocus.percentageLift}% Mood
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[1.35em] font-bold text-text tabular">
                {moodVsFocus.avgMoodDeepFocus !== null
                  ? `${moodVsFocus.avgMoodDeepFocus} / 5`
                  : "—"}
              </span>
              <span className="text-[0.76em] text-faint">
                {moodVsFocus.deepFocusDaysCount} deep day{moodVsFocus.deepFocusDaysCount === 1 ? "" : "s"} (≥60m)
              </span>
            </div>

            <p className="mt-2 text-[0.8em] text-muted leading-relaxed">
              {moodVsFocus.explanation}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between text-[0.72em] text-faint pt-2 border-t hairline">
            <span>Light focus avg: {moodVsFocus.avgMoodLowFocus !== null ? `${moodVsFocus.avgMoodLowFocus} / 5` : "—"}</span>
            <span>Threshold: 60 min</span>
          </div>
        </div>

        {/* Pattern 2: Mood vs Habit Lift */}
        <div className="card card-hover relative flex flex-col justify-between p-3.5 border hairline rounded-xl bg-surface/50">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-muted">
                <Sparkles size={13} className="text-warning" />
                Mood vs. Habits
              </span>
              {moodVsHabits.bestHabit && moodVsHabits.bestHabit.moodLift > 0 && (
                <span className="chip chip-warning text-[0.7em] font-semibold">
                  +{moodVsHabits.bestHabit.moodLift} pts
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1">
              {moodVsHabits.bestHabit ? (
                <>
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-2"
                    style={{ color: moodVsHabits.bestHabit.habitColor }}
                  >
                    <HabitIcon name={moodVsHabits.bestHabit.habitIcon} size={13} />
                  </span>
                  <span className="text-[1.05em] font-semibold text-text truncate">
                    {moodVsHabits.bestHabit.habitName}
                  </span>
                </>
              ) : (
                <span className="text-[1.1em] font-medium text-muted">
                  Logging Habits…
                </span>
              )}
            </div>

            <p className="mt-2 text-[0.8em] text-muted leading-relaxed">
              {moodVsHabits.explanation}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between text-[0.72em] text-faint pt-2 border-t hairline">
            {moodVsHabits.bestHabit ? (
              <>
                <span>Done avg: {moodVsHabits.bestHabit.avgMoodWhenDone}</span>
                <span>Undone: {moodVsHabits.bestHabit.avgMoodWhenUndone}</span>
              </>
            ) : (
              <span>Requires habits & journal entries</span>
            )}
          </div>
        </div>

        {/* Pattern 3: Peak Productivity Hours */}
        <div className="card card-hover relative flex flex-col justify-between p-3.5 border hairline rounded-xl bg-surface/50">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-muted">
                <Clock size={13} className="text-accent" />
                Peak Productivity
              </span>
              {peakProductivity.percentageOfTotal > 0 && (
                <span className="chip chip-accent text-[0.7em] font-semibold">
                  {peakProductivity.percentageOfTotal}% Velocity
                </span>
              )}
            </div>

            <div className="mt-1">
              <span className="text-[1.25em] font-bold text-text tabular">
                {peakProductivity.hasSufficientData
                  ? peakProductivity.peakHourFormatted
                  : "Calibrating…"}
              </span>
            </div>

            <p className="mt-2 text-[0.8em] text-muted leading-relaxed">
              {peakProductivity.explanation}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between text-[0.72em] text-faint pt-2 border-t hairline">
            <span>{peakProductivity.totalCompletedTasks} tasks analyzed</span>
            <span>{peakProductivity.peakCount} tasks in peak hour</span>
          </div>
        </div>
      </div>
    </div>
  );
}
