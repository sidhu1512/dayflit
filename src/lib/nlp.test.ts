import { describe, expect, it } from "vitest";
import { parseQuickAdd, parseRecurrence } from "./nlp";
import { nextOccurrence } from "./recurrence";

const now = new Date(2026, 8, 25, 10, 0, 0); // Fri 25 Sep 2026 10:00

describe("parseQuickAdd", () => {
  it("parses date, time, priority, tags and list", () => {
    const p = parseQuickAdd("Call mom tomorrow at 5pm #family !high @Personal", { now });
    expect(p.title).toBe("Call mom");
    expect(p.due).toBe("2026-09-26T17:00");
    expect(p.hasTime).toBe(true);
    expect(p.priority).toBe("high");
    expect(p.tags).toEqual(["family"]);
    expect(p.list).toBe("Personal");
  });

  it("parses recurrence with weekdays and estimate", () => {
    const p = parseQuickAdd("Team standup every mon, wed and fri for 15m", { now });
    expect(p.title).toBe("Team standup");
    expect(p.recurrence).toEqual({ freq: "weekly", interval: 1, mode: "schedule", byWeekday: [1, 3, 5] });
    expect(p.estimateMin).toBe(15);
    expect(p.due).toBe("2026-09-25"); // Friday today
  });

  it("parses monthly on a day", () => {
    const p = parseQuickAdd("Pay rent every 1st !urgent", { now });
    expect(p.recurrence?.freq).toBe("monthly");
    expect(p.recurrence?.byMonthDay).toBe(1);
    expect(p.due).toBe("2026-10-01");
    expect(p.priority).toBe("urgent");
  });

  it("handles date-only and next week", () => {
    const p = parseQuickAdd("Review budget next monday", { now });
    expect(p.due).toBe("2026-09-28");
    expect(p.hasTime).toBe(false);
    expect(p.title).toBe("Review budget");
  });

  it("does not treat plain text as a date", () => {
    const p = parseQuickAdd("Buy a new lamp", { now });
    expect(p.due).toBeNull();
    expect(p.title).toBe("Buy a new lamp");
  });

  it("parses someday and 2h estimate", () => {
    const p = parseQuickAdd("Learn Rust someday ~2h", { now });
    expect(p.backlog).toBe(true);
    expect(p.estimateMin).toBe(120);
    expect(p.title).toBe("Learn Rust");
  });

  it("parses 'in 2 hours' as a due time", () => {
    const p = parseQuickAdd("Check oven in 2 hours", { now });
    expect(p.due).toBe("2026-09-25T12:00");
    expect(p.title).toBe("Check oven");
  });

  it("parses every 2 weeks", () => {
    expect(parseRecurrence("sync every 2 weeks")[0]).toEqual({ freq: "weekly", interval: 2, mode: "schedule" });
    expect(parseRecurrence("every other day")[0]).toEqual({ freq: "daily", interval: 2, mode: "schedule" });
  });
});

describe("nextOccurrence", () => {
  it("weekly skips to next listed day", () => {
    const from = new Date(2026, 8, 25, 9, 0); // Fri
    const n = nextOccurrence({ freq: "weekly", interval: 1, mode: "schedule", byWeekday: [1, 5] }, from)!;
    expect(n.getDay()).toBe(1);
    expect(n.getDate()).toBe(28);
    expect(n.getHours()).toBe(9);
  });
  it("monthly clamps to month length and supports last day", () => {
    const from = new Date(2026, 0, 31);
    const n = nextOccurrence({ freq: "monthly", interval: 1, mode: "schedule", byMonthDay: 31 }, from)!;
    expect(n.getMonth()).toBe(1);
    expect(n.getDate()).toBe(28);
    const last = nextOccurrence({ freq: "monthly", interval: 1, mode: "schedule", byMonthDay: -1 }, new Date(2026, 3, 30))!;
    expect(last.getDate()).toBe(31);
    expect(last.getMonth()).toBe(4);
  });
  it("weekdays skips weekend", () => {
    const n = nextOccurrence({ freq: "weekdays", interval: 1, mode: "schedule" }, new Date(2026, 8, 25))!;
    expect(n.getDay()).toBe(1);
  });
  it("respects until", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1, mode: "schedule", until: "2026-09-25" }, new Date(2026, 8, 25))).toBeNull();
  });
});
