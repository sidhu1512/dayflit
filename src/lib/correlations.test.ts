import { describe, expect, it } from "vitest";
import {
  computeMoodVsFocus,
  computeMoodVsHabits,
  computePeakProductivityHours,
  computeBehavioralIntelligence,
} from "./correlations";
import type { Task, FocusHistoryEntry, Habit, JournalEntry } from "./types";

describe("Behavioral Correlation Discovery Engine", () => {
  describe("1. Mood vs. Focus Depth", () => {
    it("handles zero entries gracefully", () => {
      const res = computeMoodVsFocus([], []);
      expect(res.hasSufficientData).toBe(false);
      expect(res.avgMoodDeepFocus).toBeNull();
      expect(res.avgMoodLowFocus).toBeNull();
      expect(res.moodLift).toBeNull();
      expect(res.explanation).toContain("Log journal moods and focus sessions");
    });

    it("correctly identifies mood lift when deep focus (>=60m) is logged", () => {
      // Day 1: 90 mins focus, mood 5
      // Day 2: 70 mins focus, mood 4 (deep avg = 4.5)
      // Day 3: 20 mins focus, mood 3
      // Day 4: 0 mins focus, mood 2 (low avg = 2.5)
      const focusHistory: FocusHistoryEntry[] = [
        {
          id: "f1",
          phase: "work",
          startedAt: new Date("2026-10-10T09:00:00Z").getTime(),
          endedAt: new Date("2026-10-10T10:30:00Z").getTime(), // 90 min
          taskTitle: "Refactor",
          completed: true,
        } as unknown as FocusHistoryEntry,
        {
          id: "f2",
          phase: "work",
          startedAt: new Date("2026-10-11T09:00:00Z").getTime(),
          endedAt: new Date("2026-10-11T10:10:00Z").getTime(), // 70 min
          taskTitle: "Testing",
          completed: true,
        } as unknown as FocusHistoryEntry,
        {
          id: "f3",
          phase: "work",
          startedAt: new Date("2026-10-12T09:00:00Z").getTime(),
          endedAt: new Date("2026-10-12T09:20:00Z").getTime(), // 20 min
          taskTitle: "Email",
          completed: true,
        } as unknown as FocusHistoryEntry,
      ];

      const entries: JournalEntry[] = [
        {
          id: "e1",
          journalId: "default",
          date: "2026-10-10",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Great day",
          body: "Flow state",
          tags: [],
          mood: 5,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
        {
          id: "e2",
          journalId: "default",
          date: "2026-10-11",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Solid work",
          body: "Good progress",
          tags: [],
          mood: 4,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
        {
          id: "e3",
          journalId: "default",
          date: "2026-10-12",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Distracted",
          body: "Too many interruptions",
          tags: [],
          mood: 3,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
        {
          id: "e4",
          journalId: "default",
          date: "2026-10-13",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Tough day",
          body: "No focus",
          tags: [],
          mood: 2,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
      ];

      const res = computeMoodVsFocus(entries, focusHistory, 60);
      expect(res.hasSufficientData).toBe(true);
      expect(res.deepFocusDaysCount).toBe(2);
      expect(res.lowFocusDaysCount).toBe(2);
      expect(res.avgMoodDeepFocus).toBe(4.5);
      expect(res.avgMoodLowFocus).toBe(2.5);
      expect(res.moodLift).toBe(2.0);
      expect(res.percentageLift).toBe(80);
      expect(res.explanation).toContain("4.5 vs 2.5");
      expect(res.explanation).toContain("+80% mood lift");
    });
  });

  describe("2. Mood vs. Habit Completion", () => {
    it("handles zero habits or moods gracefully", () => {
      const res = computeMoodVsHabits([], []);
      expect(res.hasSufficientData).toBe(false);
      expect(res.bestHabit).toBeNull();
      expect(res.allHabits).toHaveLength(0);
    });

    it("identifies the specific habit that correlates with the highest mood lift", () => {
      const habits: Habit[] = [
        {
          id: "h-meditation",
          name: "Morning Meditation",
          icon: "sun",
          color: "#fbbf24",
          target: 1,
          log: { "2026-10-10": 1, "2026-10-11": 1 },
          createdAt: 1000,
          archived: false,
        } as unknown as Habit,
        {
          id: "h-caffeine",
          name: "Late Coffee",
          icon: "coffee",
          color: "#9ca3af",
          target: 1,
          log: { "2026-10-12": 1, "2026-10-13": 1 },
          createdAt: 1000,
          archived: false,
        } as unknown as Habit,
      ];

      const entries: JournalEntry[] = [
        // Days meditation done: mood 5 and 5 (avg = 5.0)
        {
          id: "e1",
          journalId: "default",
          date: "2026-10-10",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Day 10",
          body: "",
          tags: [],
          mood: 5,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
        {
          id: "e2",
          journalId: "default",
          date: "2026-10-11",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Day 11",
          body: "",
          tags: [],
          mood: 5,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
        // Days meditation NOT done (caffeine done): mood 2 and 2 (avg = 2.0)
        {
          id: "e3",
          journalId: "default",
          date: "2026-10-12",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Day 12",
          body: "",
          tags: [],
          mood: 2,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
        {
          id: "e4",
          journalId: "default",
          date: "2026-10-13",
          createdAt: 1000,
          updatedAt: 1000,
          title: "Day 13",
          body: "",
          tags: [],
          mood: 2,
          favorite: false,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
      ];

      const res = computeMoodVsHabits(entries, habits);
      expect(res.hasSufficientData).toBe(true);
      expect(res.bestHabit).not.toBeNull();
      expect(res.bestHabit?.habitName).toBe("Morning Meditation");
      expect(res.bestHabit?.avgMoodWhenDone).toBe(5.0);
      expect(res.bestHabit?.avgMoodWhenUndone).toBe(2.0);
      expect(res.bestHabit?.moodLift).toBe(3.0);
      expect(res.explanation).toContain("Morning Meditation");
      expect(res.explanation).toContain("+3 pts");
    });
  });

  describe("3. Peak Productivity Hours", () => {
    it("handles no completed tasks", () => {
      const res = computePeakProductivityHours([]);
      expect(res.hasSufficientData).toBe(false);
      expect(res.totalCompletedTasks).toBe(0);
      expect(res.percentageOfTotal).toBe(0);
    });

    it("calculates peak task completion velocity window", () => {
      const baseDate = "2026-10-14";
      const tasks: Task[] = [
        // 3 tasks completed at 10 AM
        {
          id: "t1",
          title: "A",
          status: "done",
          completedAt: new Date(`${baseDate}T10:15:00`).getTime(),
        } as Task,
        {
          id: "t2",
          title: "B",
          status: "done",
          completedAt: new Date(`${baseDate}T10:45:00`).getTime(),
        } as Task,
        {
          id: "t3",
          title: "C",
          status: "done",
          completedAt: new Date(`${baseDate}T10:50:00`).getTime(),
        } as Task,
        // 1 task at 2 PM
        {
          id: "t4",
          title: "D",
          status: "done",
          completedAt: new Date(`${baseDate}T14:10:00`).getTime(),
        } as Task,
      ];

      const res = computePeakProductivityHours(tasks);
      expect(res.hasSufficientData).toBe(true);
      expect(res.peakHour).toBe(10);
      expect(res.peakCount).toBe(3);
      expect(res.totalCompletedTasks).toBe(4);
      expect(res.percentageOfTotal).toBe(75);
      expect(res.peakHourFormatted).toBe("10:00 AM – 11:00 AM");
      expect(res.explanation).toContain("10:00 AM – 11:00 AM");
      expect(res.explanation).toContain("75%");
    });
  });

  describe("4. Aggregated Behavioral Intelligence", () => {
    it("synthesizes all behavioral insights into a coherent report", () => {
      const report = computeBehavioralIntelligence([], [], [], []);
      expect(report.moodVsFocus).toBeDefined();
      expect(report.moodVsHabits).toBeDefined();
      expect(report.peakProductivity).toBeDefined();
      expect(Array.isArray(report.insights)).toBe(true);
    });
  });

  describe("5. Boundary & Extreme Edge Cases", () => {
    it("handles zero variance (identical moods across all days)", () => {
      const entries: JournalEntry[] = [
        { id: "e1", date: "2026-10-10", mood: 4 } as JournalEntry,
        { id: "e2", date: "2026-10-11", mood: 4 } as JournalEntry,
      ];
      const focus: FocusHistoryEntry[] = [
        {
          id: "f1",
          phase: "work",
          startedAt: new Date("2026-10-10T10:00:00Z").getTime(),
          endedAt: new Date("2026-10-10T11:30:00Z").getTime(), // 90 min
        } as unknown as FocusHistoryEntry,
      ];
      const res = computeMoodVsFocus(entries, focus, 60);
      expect(res.hasSufficientData).toBe(true);
      expect(res.moodLift).toBe(0);
      expect(res.percentageLift).toBe(0);
      expect(res.explanation).toContain("remains steady at 4");
    });

    it("handles habit done every single day (zero undone days)", () => {
      const habits: Habit[] = [
        {
          id: "h1",
          name: "Daily Walk",
          log: { "2026-10-10": 1, "2026-10-11": 1 },
          target: 1,
        } as unknown as Habit,
      ];
      const entries: JournalEntry[] = [
        { id: "e1", date: "2026-10-10", mood: 5 } as unknown as JournalEntry,
        { id: "e2", date: "2026-10-11", mood: 4 } as unknown as JournalEntry,
      ];
      const res = computeMoodVsHabits(entries, habits);
      expect(res.hasSufficientData).toBe(false);
      expect(res.bestHabit).toBeNull();
    });

    it("handles multiple journal entries on the same day with different moods", () => {
      const entries: JournalEntry[] = [
        { id: "e1", date: "2026-10-10", mood: 2 } as unknown as JournalEntry,
        { id: "e2", date: "2026-10-10", mood: 4 } as unknown as JournalEntry, // Day avg: 3.0
      ];
      const focus: FocusHistoryEntry[] = [
        {
          id: "f1",
          phase: "work",
          startedAt: new Date("2026-10-10T10:00:00Z").getTime(),
          endedAt: new Date("2026-10-10T11:10:00Z").getTime(), // 70 min
        } as unknown as FocusHistoryEntry,
      ];
      const res = computeMoodVsFocus(entries, focus, 60);
      expect(res.avgMoodDeepFocus).toBe(3.0);
    });

    it("does not count journal entries before habit creation date as undone days", () => {
      // Habit created on 2026-10-12
      const habitCreated = new Date("2026-10-12T00:00:00Z").getTime();
      const habit: Habit = {
        id: "h-new",
        name: "Read Paper",
        createdAt: habitCreated,
        target: 1,
        schedule: { type: "daily" },
        log: { "2026-10-12": 1 },
      } as unknown as Habit;

      const entries: JournalEntry[] = [
        // Entry from 2026-10-01 (before habit was created): should be ignored!
        { id: "e-old", date: "2026-10-01", mood: 1 } as unknown as JournalEntry,
        // Entry from 2026-10-12 (habit done): mood 5
        { id: "e-done", date: "2026-10-12", mood: 5 } as unknown as JournalEntry,
      ];

      const res = computeMoodVsHabits(entries, [habit]);
      // Since 2026-10-01 is ignored, there are zero undone days after creation
      expect(res.hasSufficientData).toBe(false);
      expect(res.bestHabit).toBeNull();
    });

    it("ignores days when habit is not scheduled (e.g. weekday-only habit on weekends)", () => {
      // Habit scheduled only on weekdays (Monday through Friday)
      const habit: Habit = {
        id: "h-weekdays",
        name: "Standup",
        createdAt: new Date("2026-10-01T00:00:00Z").getTime(),
        target: 1,
        schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] },
        log: { "2026-10-12": 1 }, // Monday: done
      } as unknown as Habit;

      const entries: JournalEntry[] = [
        // 2026-10-11 is Sunday: habit is not scheduled, must be ignored!
        { id: "e-sun", date: "2026-10-11", mood: 2 } as unknown as JournalEntry,
        // 2026-10-12 is Monday: habit is scheduled and done
        { id: "e-mon", date: "2026-10-12", mood: 5 } as unknown as JournalEntry,
      ];

      const res = computeMoodVsHabits(entries, [habit]);
      // Sunday is ignored, so there are 0 undone days on scheduled days
      expect(res.hasSufficientData).toBe(false);
    });

    it("safely ignores tasks and focus sessions with NaN or invalid timestamps", () => {
      const corruptTasks: Task[] = [
        { id: "t1", status: "done", completedAt: NaN } as unknown as Task,
        { id: "t2", status: "done", completedAt: -100 } as unknown as Task,
        { id: "t3", status: "open", completedAt: Date.now() } as unknown as Task,
      ];
      const prod = computePeakProductivityHours(corruptTasks);
      expect(prod.hasSufficientData).toBe(false);
      expect(prod.totalCompletedTasks).toBe(0);

      const corruptFocus: FocusHistoryEntry[] = [
        { phase: "work", startedAt: NaN, endedAt: Date.now() } as unknown as FocusHistoryEntry,
        { phase: "work", startedAt: Date.now(), endedAt: Date.now() - 5000 } as unknown as FocusHistoryEntry,
      ];
      const focusRes = computeMoodVsFocus([{ id: "e1", date: "2026-10-10", mood: 4 } as unknown as JournalEntry], corruptFocus);
      expect(focusRes.deepFocusDaysCount).toBe(0);
      expect(focusRes.lowFocusDaysCount).toBe(1);
    });
  });
});
