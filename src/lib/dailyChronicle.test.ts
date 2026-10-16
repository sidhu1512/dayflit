import { describe, expect, it } from "vitest";
import { aggregateDayChronicle, formatChronicleMarkdown, findResurfacedMemory } from "./dailyChronicle";
import { dateKey } from "./dates";
import type { Task, FocusHistoryEntry, Note, Clip, JournalEntry, Habit } from "./types";

describe("Daily Chronicle Aggregator & Memory Resurfacer", () => {
  const targetDate = "2026-10-14";
  const now = new Date(`${targetDate}T15:30:00Z`).getTime();

  it("aggregates an empty day correctly", () => {
    const chronicle = aggregateDayChronicle(targetDate, {});
    expect(chronicle.date).toBe(targetDate);
    expect(chronicle.hasActivity).toBe(false);
    expect(chronicle.tasksCompletedCount).toBe(0);
    expect(chronicle.totalFocusMinutes).toBe(0);
    expect(chronicle.timeline).toHaveLength(0);

    const md = formatChronicleMarkdown(chronicle);
    expect(md).toContain("Quiet day: zero tracked digital activity");
  });

  it("aggregates tasks, focus sessions, habits, notes, and clips chronologically", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Build WAAPI ViewStage",
        status: "done",
        completedAt: new Date(`${targetDate}T10:00:00Z`).getTime(),
        createdAt: now - 3600000,
        updatedAt: now,
        priority: "high",
        tags: [],
        listId: "inbox",
        subtasks: [],
      } as unknown as Task,
      {
        id: "t2",
        title: "Yesterday task",
        status: "done",
        completedAt: new Date("2026-10-13T10:00:00Z").getTime(),
        createdAt: now - 86400000,
        updatedAt: now - 86400000,
        priority: "none",
        tags: [],
        listId: "inbox",
        subtasks: [],
      } as unknown as Task,
    ];

    const focusHistory: FocusHistoryEntry[] = [
      {
        id: "f1",
        phase: "work",
        startedAt: new Date(`${targetDate}T09:00:00Z`).getTime(),
        endedAt: new Date(`${targetDate}T09:45:00Z`).getTime(),
        taskTitle: "Design Engineering",
        completed: true,
      } as unknown as FocusHistoryEntry,
    ];

    const habits: Habit[] = [
      {
        id: "h1",
        name: "Morning Cold Shower",
        icon: "droplet",
        color: "#60a5fa",
        target: 1,
        frequency: "daily",
        log: { [targetDate]: 1 },
        createdAt: now - 10000000,
        archived: false,
      } as unknown as Habit,
    ];

    const notes: Note[] = [
      {
        id: "n1",
        title: "Architecture Decisions",
        body: "# Architecture\nNotes on DayFlit.",
        tags: ["design", "motion"],
        createdAt: new Date(`${targetDate}T11:00:00Z`).getTime(),
        updatedAt: new Date(`${targetDate}T11:30:00Z`).getTime(),
        pinned: false,
        archived: false,
        images: [],
      } as unknown as Note,
    ];

    const clips: Clip[] = [
      {
        id: "c1",
        kind: "text",
        text: "https://github.com/emilkowalski/skills",
        source: { app: "Firefox", title: "GitHub" },
        at: new Date(`${targetDate}T09:15:00Z`).getTime(),
      } as unknown as Clip,
    ];

    const chronicle = aggregateDayChronicle(targetDate, {
      tasks,
      focusHistory,
      habits,
      notes,
      clips,
    });

    expect(chronicle.hasActivity).toBe(true);
    expect(chronicle.tasksCompletedCount).toBe(1);
    expect(chronicle.completedTasks).toContain("Build WAAPI ViewStage");
    expect(chronicle.totalFocusMinutes).toBe(45);
    expect(chronicle.habitsDoneCount).toBe(1);
    expect(chronicle.doneHabits).toContain("Morning Cold Shower");
    expect(chronicle.notesUpdatedCount).toBe(1);
    expect(chronicle.updatedNotes).toContain("Architecture Decisions");
    expect(chronicle.clipsCount).toBe(1);

    // Timeline should be sorted by timestamp
    expect(chronicle.timeline.length).toBe(5);
    for (let i = 1; i < chronicle.timeline.length; i++) {
      expect(chronicle.timeline[i].timestamp).toBeGreaterThanOrEqual(
        chronicle.timeline[i - 1].timestamp
      );
    }

    const md = formatChronicleMarkdown(chronicle);
    expect(md).toContain("### Daily Activity Chronicle");
    expect(md).toContain("45 min logged across 1 session");
    expect(md).toContain("Build WAAPI ViewStage");
    expect(md).toContain("Morning Cold Shower");
    expect(md).toContain("Architecture Decisions");
    expect(md).toContain("1 captured item");
  });

  describe("Memory Resurfacer", () => {
    const today = new Date("2026-10-14T12:00:00Z");

    it("surfaces milestone past entries: 7 days, 30 days, 90 days, or 1 year", () => {
      const entries: JournalEntry[] = [
        {
          id: "m-30",
          journalId: "default",
          date: "2026-09-14", // 30 days ago
          createdAt: new Date("2026-09-14T10:00:00Z").getTime(),
          updatedAt: new Date("2026-09-14T10:00:00Z").getTime(),
          title: "A Month Ago Today",
          body: "Reflecting on autumn start.",
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
      ];

      const memory = findResurfacedMemory(entries, today);
      expect(memory).not.toBeNull();
      expect(memory?.type).toBe("milestone");
      expect(memory?.label).toBe("30 days ago");
      expect(memory?.entry.title).toBe("A Month Ago Today");
    });

    it("falls back to high-mood highlight memory when exact milestone does not exist", () => {
      const entries: JournalEntry[] = [
        {
          id: "m-12",
          journalId: "default",
          date: "2026-10-02", // 12 days ago (not a milestone date)
          createdAt: new Date("2026-10-02T10:00:00Z").getTime(),
          updatedAt: new Date("2026-10-02T10:00:00Z").getTime(),
          title: "Breakthrough moment",
          body: "We shipped the core engine!",
          tags: [],
          mood: 5,
          favorite: true,
          images: [],
          audio: [],
          source: "manual",
          prompt: null,
          location: null,
          context: null,
          domainId: null,
        },
      ];

      const memory = findResurfacedMemory(entries, today);
      expect(memory).not.toBeNull();
      expect(memory?.type).toBe("highlight");
      expect(memory?.entry.title).toBe("Breakthrough moment");
      expect(memory?.entry.mood).toBe(5);
    });

    it("surfaces exact 1-year calendar milestone even across leap years", () => {
      // 2024 is a leap year (366 days). On 2024-03-01, exactly 1 year ago was 2023-03-01.
      const leapDayNow = new Date("2024-03-01T12:00:00Z");
      const entries: JournalEntry[] = [
        {
          id: "year-ago",
          journalId: "default",
          date: "2023-03-01",
          createdAt: new Date("2023-03-01T10:00:00Z").getTime(),
          updatedAt: new Date("2023-03-01T10:00:00Z").getTime(),
          title: "One Year Anniversary",
          body: "A year ago today.",
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
      ];

      const memory = findResurfacedMemory(entries, leapDayNow);
      expect(memory).not.toBeNull();
      expect(memory?.type).toBe("milestone");
      expect(memory?.label).toBe("1 year ago today");
      expect(memory?.relativeTime).toBe("1 year ago");
      expect(memory?.entry.title).toBe("One Year Anniversary");
    });

    it("rejects low-mood entries (<4) without favorite status from fallback highlight", () => {
      const entries: JournalEntry[] = [
        {
          id: "low-mood",
          journalId: "default",
          date: "2026-10-02", // not a milestone
          createdAt: new Date("2026-10-02T10:00:00Z").getTime(),
          updatedAt: new Date("2026-10-02T10:00:00Z").getTime(),
          title: "Terrible morning",
          body: "Feeling sick and down.",
          tags: [],
          mood: 1,
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

      // A mood of 1 without favorite should NEVER be surfaced as a highlight memory
      const memory = findResurfacedMemory(entries, today);
      expect(memory).toBeNull();
    });

    it("uses createdAt timestamp when note was created today but updatedAt is later", () => {
      const notes: Note[] = [
        {
          id: "n-created-today",
          title: "Today Created Note",
          body: "Created today, touched tomorrow",
          tags: ["planning"],
          createdAt: new Date(`${targetDate}T08:15:00Z`).getTime(),
          updatedAt: new Date("2026-10-15T10:00:00Z").getTime(),
          pinned: false,
          archived: false,
          images: [],
        } as unknown as Note,
      ];

      const chronicle = aggregateDayChronicle(targetDate, { notes });
      expect(chronicle.notesUpdatedCount).toBe(1);
      expect(chronicle.timeline[0].timestamp).toBe(new Date(`${targetDate}T08:15:00Z`).getTime());
    });

    it("returns null when no past entries exist", () => {
      expect(findResurfacedMemory([], today)).toBeNull();
      expect(
        findResurfacedMemory(
          [
            {
              id: "today-1",
              date: "2026-10-14",
            } as unknown as JournalEntry,
          ],
          today
        )
      ).toBeNull();
    });
  });
});
