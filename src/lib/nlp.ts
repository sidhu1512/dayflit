import * as chrono from "chrono-node";
import type { Priority, Recurrence } from "./types";
import { toDueString } from "./dates";

export interface ParsedTask {
  title: string;
  due: string | null;
  hasTime: boolean;
  priority: Priority;
  tags: string[];
  list: string | null;
  recurrence: Recurrence | null;
  estimateMin: number | null;
  backlog: boolean;
  /** which parts of the input were consumed, for highlighting */
  chips: { kind: "date" | "priority" | "tag" | "list" | "recurrence" | "estimate" | "backlog"; text: string }[];
}

const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

const PRIORITY_MAP: Record<string, Priority> = {
  "!1": "urgent", "!2": "high", "!3": "medium", "!4": "low",
  "p1": "urgent", "p2": "high", "p3": "medium", "p4": "low",
  "!urgent": "urgent", "!high": "high", "!med": "medium", "!medium": "medium", "!low": "low",
  "!!!": "urgent", "!!": "high", "!": "medium",
};

function collapse(s: string) {
  return s.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

/** Parse recurrence phrases. Returns [rule, matchedText] */
export function parseRecurrence(text: string): [Recurrence | null, string] {
  const t = text.toLowerCase();
  let m: RegExpMatchArray | null;
  const base = (freq: Recurrence["freq"], extra: Partial<Recurrence> = {}): Recurrence => ({ freq, interval: 1, mode: "schedule", ...extra });

  if ((m = t.match(/\b(every\s*day|daily|each\s*day)\b/))) return [base("daily"), m[0]];
  if ((m = t.match(/\b(every\s*(week\s*day|weekday)s?|weekdays)\b/))) return [base("weekdays"), m[0]];
  if ((m = t.match(/\b(every\s*week|weekly|each\s*week)\b/))) return [base("weekly"), m[0]];
  if ((m = t.match(/\b(every\s*month|monthly|each\s*month)\b/))) return [base("monthly"), m[0]];
  if ((m = t.match(/\b(every\s*year|yearly|annually|each\s*year)\b/))) return [base("yearly"), m[0]];
  if ((m = t.match(/\bevery\s+(\d+)\s*(day|week|month|year)s?\b/))) {
    const n = parseInt(m[1], 10);
    const f = m[2] as "day" | "week" | "month" | "year";
    const freq = ({ day: "daily", week: "weekly", month: "monthly", year: "yearly" } as const)[f];
    return [base(freq, { interval: n }), m[0]];
  }
  if ((m = t.match(/\bevery\s+other\s+(day|week|month|year)\b/))) {
    const f = m[1] as "day" | "week" | "month" | "year";
    const freq = ({ day: "daily", week: "weekly", month: "monthly", year: "yearly" } as const)[f];
    return [base(freq, { interval: 2 }), m[0]];
  }
  // every mon, wed and fri / every monday
  if ((m = t.match(/\bevery\s+((?:(?:sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:[a-z]*)?)(?:\s*(?:,|and|&|\/)\s*(?:sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:[a-z]*)?)*)\b/))) {
    const days = m[1].split(/\s*(?:,|and|&|\/)\s*/).map((d) => DAY_MAP[d.trim()]).filter((d) => d !== undefined);
    if (days.length) return [base("weekly", { byWeekday: [...new Set(days)].sort() }), m[0]];
  }
  if ((m = t.match(/\bevery\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s+of\s+the\s+month)?/))) {
    const d = parseInt(m[1], 10);
    if (d >= 1 && d <= 31) return [base("monthly", { byMonthDay: d }), m[0]];
  }
  if ((m = t.match(/\bevery\s+last\s+day(?:\s+of\s+the\s+month)?\b/))) return [base("monthly", { byMonthDay: -1 }), m[0]];
  return [null, ""];
}

export function parseEstimate(text: string): [number | null, string] {
  const m = text.match(/(?:^|\s)(?:for\s+|~|est\s*)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?:\s*(\d+)\s*(m|min|mins|minutes?))?(?=\s|$)/i);
  if (m && (/(for\s+|~|est\s*)/i.test(m[0]) || /^\s*\d+\s*(h|hr)\b/.test(m[0]))) {
    const mins = Math.round(parseFloat(m[1]) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
    return [mins, m[0].trim()];
  }
  const m2 = text.match(/(?:^|\s)(?:for\s+|~|est\s*)?(\d+)\s*(m|min|mins|minutes?)(?=\s|$)/i);
  if (m2) return [parseInt(m2[1], 10), m2[0].trim()];
  return [null, ""];
}

// Warm up chrono parser lazily so regex compilation doesn't add latency during parsing
try {
  chrono.casual.parse("today", new Date());
} catch {
  // ignore
}

export function parseQuickAdd(input: string, opts: { now?: Date; knownLists?: string[]; forwardDate?: boolean } = {}): ParsedTask {
  const now = opts.now ?? new Date();
  let text = input.replace(/\s+/g, " ").trim();
  const chips: ParsedTask["chips"] = [];

  // tags
  const tags: string[] = [];
  text = text.replace(/(^|\s)#([\p{L}\p{N}_\-/]+)/gu, (_m, sp, tag) => {
    tags.push(tag.toLowerCase());
    chips.push({ kind: "tag", text: `#${tag}` });
    return sp;
  });

  // list  (@list)
  let list: string | null = null;
  text = text.replace(/(^|\s)@([\p{L}\p{N}_\-]+)/gu, (_m, sp, l) => {
    if (list) return _m;
    list = l;
    chips.push({ kind: "list", text: `@${l}` });
    return sp;
  });
  if (list && opts.knownLists) {
    const match = opts.knownLists.find((k) => k.toLowerCase() === (list as string).toLowerCase());
    if (match) list = match;
  }

  // priority
  let priority: Priority = "none";
  text = text.replace(/(^|\s)(!urgent|!high|!medium|!med|!low|![1-4]|p[1-4]|!!!|!!|!)(?=\s|$)/gi, (_m, sp, tok) => {
    const p = PRIORITY_MAP[tok.toLowerCase()];
    if (p) {
      priority = p;
      chips.push({ kind: "priority", text: tok });
      return sp;
    }
    return _m;
  });

  // backlog
  if (/\b(someday|backlog)\b/i.test(text)) {
    const m = text.match(/\s*\b(someday|backlog)\b/i)!;
    chips.push({ kind: "backlog", text: m[1] });
    text = text.replace(m[0], " ");
  }

  // recurrence
  const [recurrence, recText] = parseRecurrence(text);
  if (recurrence && recText) {
    const escaped = recText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ").replace(/\s+/g, " ");
    chips.push({ kind: "recurrence", text: recText });
  }

  // estimate (before dates so "for 30m" isn't eaten by chrono)
  const [estimateMin, estText] = parseEstimate(text);
  if (estimateMin) {
    text = text.replace(estText, " ");
    chips.push({ kind: "estimate", text: estText });
  }

  // date/time
  let due: string | null = null;
  let hasTime = false;
  const results = chrono.casual.parse(text, now, { forwardDate: opts.forwardDate ?? true });
  const r = results.find((x) => x.text.trim().length >= 3 || /^\d/.test(x.text)); // avoid stray "a" matches
  if (r) {
    const d = r.start.date();
    hasTime = r.start.isCertain("hour");
    if (!hasTime) d.setHours(0, 0, 0, 0);
    due = toDueString(d, hasTime);
    // strip the matched text plus a leading "on|at|by|due" preposition
    const before = text.slice(0, r.index).replace(/\s*(on|at|by|due|for)\s*$/i, " ");
    const after = text.slice(r.index + r.text.length);
    text = before + " " + after;
    chips.push({ kind: "date", text: r.text });
  }

  // recurring task with weekly days but no date: set due to next matching day
  if (recurrence && !due) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (recurrence.freq === "weekly" && recurrence.byWeekday?.length) {
      const today = start.getDay();
      const next = recurrence.byWeekday.find((d) => d >= today) ?? recurrence.byWeekday[0];
      const delta = (next - today + 7) % 7;
      start.setDate(start.getDate() + delta);
    } else if (recurrence.freq === "weekdays") {
      while (start.getDay() === 0 || start.getDay() === 6) start.setDate(start.getDate() + 1);
    } else if (recurrence.freq === "monthly" && recurrence.byMonthDay) {
      const dim = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const day = recurrence.byMonthDay === -1 ? dim : Math.min(recurrence.byMonthDay, dim);
      if (day < start.getDate()) start.setMonth(start.getMonth() + 1);
      const dim2 = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      start.setDate(recurrence.byMonthDay === -1 ? dim2 : Math.min(recurrence.byMonthDay, dim2));
    }
    due = toDueString(start, false);
  }

  const title = collapse(text).replace(/^[-–—:,.]+\s*/, "").replace(/\s*[-–—:,]+$/, "");
  return { title, due, hasTime, priority, tags, list, recurrence, estimateMin, backlog: chips.some((c) => c.kind === "backlog"), chips };
}

export function extractTags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_\-/]+)/gu)) out.add(m[2].toLowerCase());
  return [...out];
}

export function extractLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s<>)"'\]]+/g)) out.add(m[0].replace(/[.,;:!?]+$/, ""));
  return [...out];
}
