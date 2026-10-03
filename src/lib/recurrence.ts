import { addDays, addMonths, addWeeks, addYears, getDaysInMonth, lastDayOfMonth, setDate, startOfDay } from "date-fns";
import type { Recurrence } from "./types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return "";
  const n = r.interval > 1 ? `${r.interval} ` : "";
  let s = "";
  switch (r.freq) {
    case "daily":
      s = r.interval > 1 ? `Every ${n}days` : "Daily";
      break;
    case "weekdays":
      s = "Every weekday";
      break;
    case "weekly": {
      const days = (r.byWeekday ?? []).map((d) => DAY_NAMES[d]).join(", ");
      s = r.interval > 1 ? `Every ${n}weeks${days ? " on " + days : ""}` : `Weekly${days ? " on " + days : ""}`;
      break;
    }
    case "monthly": {
      const dom = r.byMonthDay === -1 ? "last day" : r.byMonthDay ? ordinal(r.byMonthDay) : "";
      s = r.interval > 1 ? `Every ${n}months${dom ? " on the " + dom : ""}` : `Monthly${dom ? " on the " + dom : ""}`;
      break;
    }
    case "yearly":
      s = r.interval > 1 ? `Every ${n}years` : "Yearly";
      break;
  }
  if (r.mode === "completion") s += " after completion";
  if (r.until) s += ` until ${r.until}`;
  return s;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Next occurrence strictly after `from`, preserving the time-of-day of `from`. */
export function nextOccurrence(r: Recurrence, from: Date): Date | null {
  const interval = Math.max(1, r.interval || 1);
  let next: Date;
  switch (r.freq) {
    case "daily":
      next = addDays(from, interval);
      break;
    case "weekdays": {
      next = addDays(from, 1);
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
      break;
    }
    case "weekly": {
      const days = (r.byWeekday && r.byWeekday.length ? r.byWeekday : [from.getDay()]).slice().sort((a, b) => a - b);
      // find next day in this week after from.getDay()
      const today = from.getDay();
      const later = days.find((d) => d > today);
      if (later !== undefined) {
        next = addDays(from, later - today);
      } else {
        // first day in the week `interval` weeks ahead
        const first = days[0];
        const base = addWeeks(from, interval);
        next = addDays(base, first - base.getDay());
      }
      break;
    }
    case "monthly": {
      const dom = r.byMonthDay ?? from.getDate();
      let m = addMonths(startOfDay(from), interval);
      // guard when from.getDate() > days in target month (addMonths clamps already)
      for (let i = 0; i < 24; i++) {
        const dim = getDaysInMonth(m);
        const day = dom === -1 ? dim : Math.min(dom, dim);
        const candidate = setDate(m, day);
        candidate.setHours(from.getHours(), from.getMinutes(), 0, 0);
        if (candidate.getTime() > from.getTime()) {
          next = candidate;
          break;
        }
        m = addMonths(m, interval);
      }
      next ??= addMonths(from, interval);
      break;
    }
    case "yearly":
      next = addYears(from, interval);
      break;
    default:
      return null;
  }
  if (r.until) {
    const until = new Date(r.until + (r.until.length <= 10 ? "T23:59:59" : ""));
    if (next.getTime() > until.getTime()) return null;
  }
  return next;
}

/** Returns the same rule with the byMonthDay set to the last day if the date is month-end. */
export function normalizeMonthly(r: Recurrence, date: Date): Recurrence {
  if (r.freq !== "monthly" || r.byMonthDay) return r;
  const last = lastDayOfMonth(date).getDate();
  return { ...r, byMonthDay: date.getDate() === last && last >= 28 ? -1 : date.getDate() };
}
