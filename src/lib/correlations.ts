import { dateKey, parseKey } from "./dates";
import { isDoneOn, isScheduledOn } from "@/stores/habits";
import type { Task, FocusHistoryEntry, Habit, JournalEntry } from "./types";

export interface MoodFocusResult {
  hasSufficientData: boolean;
  deepFocusDaysCount: number;
  lowFocusDaysCount: number;
  avgMoodDeepFocus: number | null;
  avgMoodLowFocus: number | null;
  moodLift: number | null;
  percentageLift: number | null;
  explanation: string;
}

export interface HabitMoodItem {
  habitId: string;
  habitName: string;
  habitIcon: string;
  habitColor: string;
  doneDaysCount: number;
  undoneDaysCount: number;
  avgMoodWhenDone: number;
  avgMoodWhenUndone: number;
  moodLift: number;
}

export interface HabitMoodResult {
  hasSufficientData: boolean;
  bestHabit: HabitMoodItem | null;
  allHabits: HabitMoodItem[];
  explanation: string;
}

export interface PeakProductivityResult {
  hasSufficientData: boolean;
  peakHour: number; // 0 - 23
  peakHourFormatted: string; // e.g. "10:00 AM – 11:00 AM"
  peakCount: number;
  totalCompletedTasks: number;
  percentageOfTotal: number;
  hourlyDistribution: number[]; // 24 counts
  explanation: string;
}

export interface BehavioralIntelligence {
  moodVsFocus: MoodFocusResult;
  moodVsHabits: HabitMoodResult;
  peakProductivity: PeakProductivityResult;
  insights: string[];
}

function formatHourRange(hour: number): string {
  const formatH = (h: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const num = h % 12 === 0 ? 12 : h % 12;
    return `${num}:00 ${period}`;
  };
  return `${formatH(hour)} – ${formatH((hour + 1) % 24)}`;
}

/**
 * 1. Mood vs. Focus Depth
 * Calculates average mood on days with >= 60m focus vs days with < 60m focus.
 */
export function computeMoodVsFocus(
  entries: JournalEntry[],
  focusHistory: FocusHistoryEntry[],
  thresholdMinutes = 60
): MoodFocusResult {
  // Aggregate daily focus minutes
  const dailyFocusMin = new Map<string, number>();
  for (const f of focusHistory) {
    if (
      f.phase === "work" &&
      typeof f.startedAt === "number" &&
      !isNaN(f.startedAt) &&
      typeof f.endedAt === "number" &&
      !isNaN(f.endedAt) &&
      f.endedAt >= f.startedAt
    ) {
      const d = dateKey(new Date(f.startedAt));
      const min = Math.max(1, Math.round((f.endedAt - f.startedAt) / 60000));
      dailyFocusMin.set(d, (dailyFocusMin.get(d) ?? 0) + min);
    }
  }

  // Aggregate daily moods (only entries with valid 1-5 mood)
  const dailyMoods = new Map<string, number[]>();
  for (const e of entries) {
    if (e.mood && e.mood >= 1 && e.mood <= 5) {
      const list = dailyMoods.get(e.date) ?? [];
      list.push(e.mood);
      dailyMoods.set(e.date, list);
    }
  }

  const deepFocusMoods: number[] = [];
  const lowFocusMoods: number[] = [];

  dailyMoods.forEach((moods, date) => {
    const avgDayMood = moods.reduce((a, b) => a + b, 0) / moods.length;
    const focusMins = dailyFocusMin.get(date) ?? 0;
    if (focusMins >= thresholdMinutes) {
      deepFocusMoods.push(avgDayMood);
    } else {
      lowFocusMoods.push(avgDayMood);
    }
  });

  const deepCount = deepFocusMoods.length;
  const lowCount = lowFocusMoods.length;

  if (deepCount === 0 && lowCount === 0) {
    return {
      hasSufficientData: false,
      deepFocusDaysCount: 0,
      lowFocusDaysCount: 0,
      avgMoodDeepFocus: null,
      avgMoodLowFocus: null,
      moodLift: null,
      percentageLift: null,
      explanation:
        "Log journal moods and focus sessions to discover how deep work impacts your emotional state.",
    };
  }

  const avgDeep =
    deepCount > 0
      ? Number((deepFocusMoods.reduce((a, b) => a + b, 0) / deepCount).toFixed(1))
      : null;
  const avgLow =
    lowCount > 0
      ? Number((lowFocusMoods.reduce((a, b) => a + b, 0) / lowCount).toFixed(1))
      : null;

  let moodLift: number | null = null;
  let percentageLift: number | null = null;

  if (avgDeep !== null && avgLow !== null) {
    moodLift = Number((avgDeep - avgLow).toFixed(1));
    percentageLift = avgLow > 0 ? Math.round(((avgDeep - avgLow) / avgLow) * 100) : 0;
  }

  let explanation = "";
  if (avgDeep !== null && avgLow !== null) {
    if (moodLift! > 0) {
      explanation = `On days you log at least ${thresholdMinutes}m of deep focus, your average mood is ${avgDeep} vs ${avgLow} (${percentageLift! > 0 ? "+" : ""}${percentageLift}% mood lift).`;
    } else if (moodLift! === 0) {
      explanation = `Your average mood remains steady at ${avgDeep} regardless of focus session duration.`;
    } else {
      explanation = `On days with lighter focus (<${thresholdMinutes}m), your average mood is slightly higher (${avgLow} vs ${avgDeep}).`;
    }
  } else if (avgDeep !== null) {
    explanation = `Average mood during deep focus days (≥${thresholdMinutes}m) is ${avgDeep}. Log moods on light-focus days to compare.`;
  } else {
    explanation = `Average mood on light-focus days (<${thresholdMinutes}m) is ${avgLow}. Complete a ${thresholdMinutes}m+ focus session to unlock deep work comparisons.`;
  }

  return {
    hasSufficientData: deepCount > 0 && lowCount > 0,
    deepFocusDaysCount: deepCount,
    lowFocusDaysCount: lowCount,
    avgMoodDeepFocus: avgDeep,
    avgMoodLowFocus: avgLow,
    moodLift,
    percentageLift,
    explanation,
  };
}

/**
 * 2. Mood vs. Habit Completion
 * Discovers which specific habit correlates with the highest mood lift.
 */
export function computeMoodVsHabits(
  entries: JournalEntry[],
  habits: Habit[]
): HabitMoodResult {
  // Aggregate daily moods
  const dailyMoods = new Map<string, number[]>();
  for (const e of entries) {
    if (e.mood && e.mood >= 1 && e.mood <= 5) {
      const list = dailyMoods.get(e.date) ?? [];
      list.push(e.mood);
      dailyMoods.set(e.date, list);
    }
  }

  if (dailyMoods.size === 0 || habits.length === 0) {
    return {
      hasSufficientData: false,
      bestHabit: null,
      allHabits: [],
      explanation:
        "Check off habits and rate your mood in the journal to discover which habits elevate your day most.",
    };
  }

  const results: HabitMoodItem[] = [];

  for (const h of habits) {
    if (h.archived) continue;

    const doneMoods: number[] = [];
    const undoneMoods: number[] = [];
    const createdDateKey =
      typeof h.createdAt === "number" && !isNaN(h.createdAt) && h.createdAt > 86400000
        ? dateKey(new Date(h.createdAt))
        : null;

    dailyMoods.forEach((moods, date) => {
      // Don't evaluate dates before the habit existed
      if (createdDateKey && date < createdDateKey) return;

      // Don't evaluate days when the habit is not scheduled
      const dateObj = parseKey(date);
      const schedule = h.schedule ?? { type: "daily" };
      if (!isScheduledOn({ ...h, schedule }, dateObj)) return;

      const avgDayMood = moods.reduce((a, b) => a + b, 0) / moods.length;
      const done = h.log ? isDoneOn(h, date) : false;
      if (done) {
        doneMoods.push(avgDayMood);
      } else {
        undoneMoods.push(avgDayMood);
      }
    });

    if (doneMoods.length > 0 && undoneMoods.length > 0) {
      const avgDone = doneMoods.reduce((a, b) => a + b, 0) / doneMoods.length;
      const avgUndone = undoneMoods.reduce((a, b) => a + b, 0) / undoneMoods.length;
      const lift = Number((avgDone - avgUndone).toFixed(1));

      results.push({
        habitId: h.id,
        habitName: h.name,
        habitIcon: h.icon,
        habitColor: h.color,
        doneDaysCount: doneMoods.length,
        undoneDaysCount: undoneMoods.length,
        avgMoodWhenDone: Number(avgDone.toFixed(1)),
        avgMoodWhenUndone: Number(avgUndone.toFixed(1)),
        moodLift: lift,
      });
    }
  }

  results.sort((a, b) => b.moodLift - a.moodLift);

  const best = results[0] ?? null;
  let explanation = "";

  if (best) {
    if (best.moodLift > 0) {
      explanation = `"${best.habitName}" correlates with your highest mood lift (+${best.moodLift} pts, avg ${best.avgMoodWhenDone} vs ${best.avgMoodWhenUndone}).`;
    } else {
      explanation = `"${best.habitName}" shows the most stable mood consistency across your active days.`;
    }
  } else {
    explanation =
      "Keep logging both habits and daily journal entries to compute individual habit mood correlations.";
  }

  return {
    hasSufficientData: results.length > 0,
    bestHabit: best,
    allHabits: results,
    explanation,
  };
}

/**
 * 3. Peak Productivity Hours
 * Discovers which hour of the day sees the highest task completion velocity.
 */
export function computePeakProductivityHours(
  tasks: Task[]
): PeakProductivityResult {
  const hourly = new Array<number>(24).fill(0);
  let totalCompleted = 0;

  for (const t of tasks) {
    if (
      t.status === "done" &&
      typeof t.completedAt === "number" &&
      !isNaN(t.completedAt) &&
      t.completedAt > 0
    ) {
      const h = new Date(t.completedAt).getHours();
      if (!isNaN(h) && h >= 0 && h < 24) {
        hourly[h]++;
        totalCompleted++;
      }
    }
  }

  if (totalCompleted === 0) {
    return {
      hasSufficientData: false,
      peakHour: 10,
      peakHourFormatted: formatHourRange(10),
      peakCount: 0,
      totalCompletedTasks: 0,
      percentageOfTotal: 0,
      hourlyDistribution: hourly,
      explanation:
        "Complete tasks across the day to reveal your peak task completion velocity window.",
    };
  }

  let peakHour = 0;
  let peakCount = -1;
  for (let h = 0; h < 24; h++) {
    if (hourly[h] > peakCount) {
      peakCount = hourly[h];
      peakHour = h;
    }
  }

  const percentage = Math.round((peakCount / totalCompleted) * 100);
  const timeRange = formatHourRange(peakHour);
  const explanation = `Peak task completion velocity occurs between ${timeRange} (${percentage}% of all completed tasks finished in this window).`;

  return {
    hasSufficientData: true,
    peakHour,
    peakHourFormatted: timeRange,
    peakCount,
    totalCompletedTasks: totalCompleted,
    percentageOfTotal: percentage,
    hourlyDistribution: hourly,
    explanation,
  };
}

/**
 * Aggregates all behavioral intelligence into a single report.
 */
export function computeBehavioralIntelligence(
  tasks: Task[],
  focusHistory: FocusHistoryEntry[],
  habits: Habit[],
  entries: JournalEntry[]
): BehavioralIntelligence {
  const moodVsFocus = computeMoodVsFocus(entries, focusHistory);
  const moodVsHabits = computeMoodVsHabits(entries, habits);
  const peakProductivity = computePeakProductivityHours(tasks);

  const insights: string[] = [];
  if (moodVsFocus.hasSufficientData) insights.push(moodVsFocus.explanation);
  if (moodVsHabits.hasSufficientData) insights.push(moodVsHabits.explanation);
  if (peakProductivity.hasSufficientData) insights.push(peakProductivity.explanation);

  return {
    moodVsFocus,
    moodVsHabits,
    peakProductivity,
    insights,
  };
}
