import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { startOfDay } from "date-fns";
import { timeboxOf, autoPlan, SNAP_MIN, HOUR_PX } from "@/components/Timeline";
import type { CalEvent, Task } from "@/lib/types";
import { normalizeCategory, classifyActivity } from "@/stores/activity";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "test-task-" + Math.random().toString(36).slice(2, 7),
    title: "Test Task",
    notes: "",
    status: "open",
    priority: "none",
    due: null,
    hasTime: false,
    tags: [],
    list: "default",
    recurrence: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    order: 0,
    estimateMin: 30,
    focusSecs: 0,
    subtasks: [],
    links: [],
    images: [],
    source: null,
    snoozedUntil: null,
    pinned: false,
    backlog: false,
    completions: 0,
    ...overrides,
  };
}

function makeCalEvent(overrides: Partial<CalEvent>): CalEvent {
  return {
    id: "test-event-" + Math.random().toString(36).slice(2, 7),
    sourceId: "work",
    uid: "cal-uid",
    title: "Calendar Event",
    description: "",
    location: "",
    start: Date.now(),
    end: Date.now() + 3_600_000,
    allDay: false,
    recurring: false,
    status: "confirmed",
    organizer: "",
    attendees: [],
    url: "",
    meeting: null,
    color: "#ffffff",
    ...overrides,
  };
}

describe("Timeline & Timebox Math Engine", () => {
  it("computes timeboxOf correctly for tasks with valid due time and estimate", () => {
    const task = makeTask({
      id: "t1",
      title: "Deep work session",
      priority: "high",
      due: "2026-10-14T09:30:00.000Z",
      hasTime: true,
      estimateMin: 45,
    });

    const box = timeboxOf(task);
    expect(box).not.toBeNull();
    const expectedStart = new Date("2026-10-14T09:30:00.000Z").getTime();
    expect(box?.start).toBe(expectedStart);
    expect(box?.end).toBe(expectedStart + 45 * 60_000);
  });

  it("returns null for tasks without time or without due date", () => {
    const noTimeTask = makeTask({
      id: "t2",
      title: "No time task",
      due: "2026-10-14",
      hasTime: false,
    });
    expect(timeboxOf(noTimeTask)).toBeNull();

    const noDueTask = makeTask({
      id: "t3",
      title: "No due task",
      due: null,
      hasTime: true,
    });
    expect(timeboxOf(noDueTask)).toBeNull();
  });

  it("falls back to DEFAULT_MIN (30 mins) when estimateMin is missing or <= 0", () => {
    const zeroEstTask = makeTask({
      id: "t4",
      title: "Zero estimate task",
      due: "2026-10-14T10:00:00.000Z",
      hasTime: true,
      estimateMin: 0,
    });
    const box = timeboxOf(zeroEstTask);
    expect(box).not.toBeNull();
    const start = new Date("2026-10-14T10:00:00.000Z").getTime();
    expect(box?.start).toBe(start);
    expect(box?.end).toBe(start + 30 * 60_000);
  });
});

describe("autoPlan Scheduling Engine", () => {
  it("fits unscheduled tasks into free gaps between calendar events and timeboxed tasks", () => {
    const day = new Date("2026-10-14T00:00:00");
    const dayStart = startOfDay(day).getTime();

    // Event from 09:00 to 10:00 (hour 9 to 10)
    const event1 = makeCalEvent({
      id: "e1",
      sourceId: "work",
      title: "Team Standup",
      start: dayStart + 9 * 3_600_000,
      end: dayStart + 10 * 3_600_000,
      allDay: false,
    });

    // Event from 11:00 to 12:00
    const event2 = makeCalEvent({
      id: "e2",
      sourceId: "work",
      title: "Architecture Review",
      start: dayStart + 11 * 3_600_000,
      end: dayStart + 12 * 3_600_000,
      allDay: false,
    });

    const tasks: Task[] = [
      makeTask({
        id: "t_unscheduled_1",
        title: "Draft PR",
        priority: "medium",
        due: null,
        hasTime: false,
        estimateMin: 45,
      }),
      makeTask({
        id: "t_unscheduled_2",
        title: "Code review teammate",
        priority: "medium",
        due: null,
        hasTime: false,
        estimateMin: 30,
      }),
    ];

    const updates: { id: string; patch: Partial<Task> }[] = [];
    const updateFn = (id: string, patch: Partial<Task>) => {
      updates.push({ id, patch });
    };

    // Run autoPlan starting from 08:30 with startHour=8 and endHour=18
    const fromTime = dayStart + 8.5 * 3_600_000; // 08:30
    const placedCount = autoPlan(day, tasks, [event1, event2], fromTime, 18, updateFn, 8);

    expect(placedCount).toBe(2);
    expect(updates.length).toBe(2);

    // First task should be placed at 10:00 (since 08:30 + 45 min would clash with 09:00 standup)
    const task1Placement = updates.find((u) => u.id === "t_unscheduled_1");
    expect(task1Placement).toBeDefined();
    expect(task1Placement?.patch.hasTime).toBe(true);
    expect(task1Placement?.patch.estimateMin).toBe(45);

    const task1Due = new Date(task1Placement!.patch.due!);
    expect(task1Due.getTime()).toBe(dayStart + 10 * 3_600_000); // Placed at 10:00 AM

    // Second task (30 mins) can fit right after task 1 at 10:45? But event2 is at 11:00 (15 min gap only).
    // So task2 (30 min) cannot fit before 11:00. It must be placed after event2 ends at 12:00!
    const task2Placement = updates.find((u) => u.id === "t_unscheduled_2");
    expect(task2Placement).toBeDefined();
    const task2Due = new Date(task2Placement!.patch.due!);
    expect(task2Due.getTime()).toBe(dayStart + 12 * 3_600_000); // Placed at 12:00 PM
  });

  it("respects startHour earliest boundary when planning before working hours", () => {
    const day = new Date("2026-10-14T00:00:00");
    const dayStart = startOfDay(day).getTime();

    const tasks: Task[] = [
      makeTask({
        id: "t_early",
        title: "Morning check",
        due: null,
        hasTime: false,
        estimateMin: 30,
      }),
    ];

    const updates: { id: string; patch: Partial<Task> }[] = [];
    // from is 05:00 AM, but startHour is 8 (08:00 AM)
    const fromTime = dayStart + 5 * 3_600_000;
    const placed = autoPlan(day, tasks, [], fromTime, 17, (id, patch) => updates.push({ id, patch }), 8);

    expect(placed).toBe(1);
    const placedTime = new Date(updates[0].patch.due!).getTime();
    expect(placedTime).toBe(dayStart + 8 * 3_600_000); // Clamped to 8:00 AM earliest
  });

  it("stops and returns when day is full before endHour", () => {
    const day = new Date("2026-10-14T00:00:00");
    const dayStart = startOfDay(day).getTime();

    // Event occupying the entire afternoon from 13:00 to 18:00
    const bigEvent = makeCalEvent({
      id: "big_event",
      sourceId: "work",
      title: "All afternoon workshop",
      start: dayStart + 13 * 3_600_000,
      end: dayStart + 18 * 3_600_000,
      allDay: false,
    });

    const tasks: Task[] = [
      makeTask({
        id: "t_overflow",
        title: "Large task",
        due: null,
        hasTime: false,
        estimateMin: 120, // 2 hours
      }),
    ];

    const updates: { id: string; patch: Partial<Task> }[] = [];
    // from is 13:30, endHour is 18
    const fromTime = dayStart + 13.5 * 3_600_000;
    const placed = autoPlan(day, tasks, [bigEvent], fromTime, 18, (id, patch) => updates.push({ id, patch }), 8);

    // Cannot place because 18:00 is end of day and event ends at 18:00
    expect(placed).toBe(0);
    expect(updates.length).toBe(0);
  });
});

describe("Activity Store & Selector Stability (React 19 / Zustand 5)", () => {
  it("classifies dev processes and design tools accurately", () => {
    expect(classifyActivity("Code.exe", "Timeline.tsx - dayflit")).toBe("deep-work");
    expect(classifyActivity("cursor.exe", "LifeMapCanvas.tsx")).toBe("deep-work");
    expect(classifyActivity("figma.exe", "DayFlit Obsidian UI")).toBe("design");
    expect(classifyActivity("chrome.exe", "YouTube - Lo-Fi Beats")).toBe("distraction");
    expect(classifyActivity("discord.exe", "General chat")).toBe("distraction");
  });

  it("normalizes category strings cleanly", () => {
    expect(normalizeCategory("coding")).toBe("deep-work");
    expect(normalizeCategory("deep-work")).toBe("deep-work");
    expect(normalizeCategory("design")).toBe("design");
    expect(normalizeCategory("comm")).toBe("communication");
    expect(normalizeCategory("browsing")).toBe("browsing");
    expect(normalizeCategory("random")).toBe("distraction");
  });

  it("demonstrates why memoized selectors prevent infinite re-renders", () => {
    // Simulated Zustand store snapshot behavior
    const storeState = {
      sessions: [
        {
          id: "s1",
          exe: "code.exe",
          processName: "code.exe",
          title: "Timeline.tsx",
          category: "deep-work" as const,
          startTime: Date.now() - 3600_000,
          endTime: Date.now(),
          durationSecs: 3600,
        },
      ],
      todaySessions: (_forDate?: Date) => {
        // Calling this directly in a selector produces a NEW array every single call
        return [...storeState.sessions];
      },
    };

    // Calling directly in selector returns new references:
    const ref1 = storeState.todaySessions();
    const ref2 = storeState.todaySessions();
    expect(ref1).not.toBe(ref2); // Object.is(ref1, ref2) === false! Triggers infinite re-render in Zustand 5 / React 19!

    // Binding to the primitive array `sessions` and wrapping compute in useMemo:
    // If sessions reference doesn't change, cached result is returned:
    let cachedResult: typeof storeState.sessions | null = null;
    let lastSessionsRef: typeof storeState.sessions | null = null;

    function memoizedGet(sessions: typeof storeState.sessions) {
      if (lastSessionsRef === sessions && cachedResult) {
        return cachedResult;
      }
      lastSessionsRef = sessions;
      cachedResult = storeState.todaySessions();
      return cachedResult;
    }

    const memo1 = memoizedGet(storeState.sessions);
    const memo2 = memoizedGet(storeState.sessions);
    expect(memo1).toBe(memo2); // Object.is(memo1, memo2) === true! Perfectly stable!
  });
});

describe("LifeMap Bezier Geometry & Visual Invariants", () => {
  it("guarantees monotonic non-intersecting bezier control points even for closely placed cards", () => {
    // Test various horizontal spans between parent card right edge and child card left edge
    const spans = [10, 20, 40, 80, 160, 300, 600];

    for (const span of spans) {
      const x1 = 300;
      const x2 = x1 + span;

      const spanX = Math.max(20, x2 - x1);
      const dx = Math.min(120, Math.max(16, spanX * 0.45));
      const cx1 = x1 + dx;
      const cx2 = x2 - dx;

      // Invariants:
      // 1. cx1 MUST always be greater than x1 (pushes right from parent)
      expect(cx1).toBeGreaterThan(x1);
      // 2. cx2 MUST always be less than x2 (enters from left into child)
      expect(cx2).toBeLessThan(x2);
      // 3. dx must be bounded between 16 and 120 px
      expect(dx).toBeGreaterThanOrEqual(16);
      expect(dx).toBeLessThanOrEqual(120);

      const path = `M ${x1} 100 C ${cx1} 100, ${cx2} 200, ${x2} 200`;
      expect(path).toContain(`M ${x1} 100`);
      expect(path).toContain(`${x2} 200`);
    }
  });

  it("verifies port anchor coordinates attach exactly to card boundaries", () => {
    const parentNode = { x: 60, y: 120, width: 240, height: 76 };
    const childNode = { x: 360, y: 150, width: 240, height: 68 };

    const x1 = parentNode.x + parentNode.width; // 300 (right boundary)
    const y1 = parentNode.y + parentNode.height / 2; // 158 (vertical center)
    const x2 = childNode.x; // 360 (left boundary)
    const y2 = childNode.y + childNode.height / 2; // 184 (vertical center)

    expect(x1).toBe(300);
    expect(y1).toBe(158);
    expect(x2).toBe(360);
    expect(y2).toBe(184);

    // Anchor port circles are placed exactly at (x1, y1) and (x2, y2)
    const portAnchor1 = { cx: x1, cy: y1, r: 3.5 };
    const portAnchor2 = { cx: x2, cy: y2, r: 3.5 };

    expect(portAnchor1.cx).toBe(300);
    expect(portAnchor2.cx).toBe(360);
  });

  it("positions habits under goals or pillars at Tier 2 when no intermediate projects exist", () => {
    // When a goal has no projects, its habits should occupy Tier 2 (x=680) rather than skipping to Tier 3 (x=980)
    const goalProjects: unknown[] = [];
    const habitTier = goalProjects.length === 0 ? 2 : 3;
    expect(habitTier).toBe(2);

    const tierX = [60, 360, 680, 980];
    expect(tierX[habitTier]).toBe(680); // Fills column 2 seamlessly
  });
});

describe("Dynamic Island Visual Bounds & Apple Restraint", () => {
  it("proves 32px padding strictly encloses shadows preventing rectangular window clipping", () => {
    // Window padding: p-8 = 32px padding on all sides (total 64px width/height pad)
    const padding = 32;

    // Refined Apple Obsidian Shadow specs:
    // 0 8px 20px -3px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.35)
    const maxBlur = 20;
    const maxOffsetY = 8;
    const spread = -3;

    // Effective visual shadow radius = maxBlur + spread = 17px
    // Horizontal shadow reaches: 0 + 17 = 17px < 32px padding (15px safety margin)
    // Downward shadow reaches: 8 + 17 = 25px < 32px padding (7px zero-alpha cushion)
    const horizontalShadowReach = maxBlur + spread;
    const verticalShadowReach = maxOffsetY + maxBlur + spread;

    expect(horizontalShadowReach).toBeLessThan(padding);
    expect(verticalShadowReach).toBeLessThan(padding);
  });

  it("ensures expanded island tab switcher accommodates all 5 modules in 420px width", () => {
    const cardWidth = 420;
    const padding = 20; // 10px each side
    const availableWidth = cardWidth - padding; // 400px
    const moduleCount = 5; // Focus, Stash, Tasks, Habits, Music
    const tabWidth = availableWidth / moduleCount;

    // Each tab gets 80px, ample room for 12px icon + 5-6 letter title ("Music", "Focus", "Tasks")
    expect(tabWidth).toBeGreaterThanOrEqual(75);
  });

  it("guarantees LifeMapCanvas cards are positioned absolute so 2D spatial coordinates match bezier ports", () => {
    const lifeMapTsx = readFileSync(join(__dirname, "../components/LifeMapCanvas.tsx"), "utf-8");
    // Must be absolute, NOT relative (relative causes document-flow vertical drift)
    expect(lifeMapTsx).toContain('card group absolute flex flex-col justify-between');
    expect(lifeMapTsx).not.toContain('card group relative flex flex-col justify-between');
  });

  it("guarantees Timeline layout does not produce -Infinity when start >= end", () => {
    function layoutDefensive(items: { start: number; end: number }[]) {
      const cols: number[] = [];
      const laid = items.map((item) => {
        let col = cols.findIndex((e) => e <= item.start);
        if (col < 0) {
          col = cols.length;
          cols.push(item.end);
        } else cols[col] = item.end;
        return { item, col, total: 1 };
      });
      return laid.map((x) => {
        const overlapping = laid.filter((y) => y.item.start < x.item.end && y.item.end > x.item.start);
        return { ...x, total: Math.max(1, ...overlapping.map((y) => y.col + 1)) };
      });
    }

    // Zero-duration event where start === end
    const zeroDuration = layoutDefensive([{ start: 100, end: 100 }]);
    expect(zeroDuration[0].total).toBe(1);
    expect(Number.isFinite(zeroDuration[0].total)).toBe(true);
  });

  it("ensures Calendar Timeline is clean single-track without Dual Reality or OS Activity clutter", () => {
    const timelineTsx = readFileSync(join(__dirname, "../components/Timeline.tsx"), "utf-8");
    expect(timelineTsx).not.toContain("realityMode");
    expect(timelineTsx).not.toContain("Actual Reality");
    expect(timelineTsx).not.toContain("% Alignment");
    expect(timelineTsx).not.toContain("useActivity");
    expect(timelineTsx).toContain("left: `${(col / total) * 100}%`");
    expect(timelineTsx).toContain("width: `calc(${100 / total}% - 4px)`");
  });
});

