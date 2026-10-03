import { addDays, format, startOfDay } from "date-fns";
import type { CalEvent, Task } from "./types";
import { timeboxOf } from "@/components/Timeline";

export interface Slot {
  start: number;
  end: number;
}

/** Free slots within working hours on `day`, avoiding events and timeboxed tasks. */
export function freeSlots(day: Date, events: CalEvent[], tasks: Task[], workStart: number, workEnd: number, slotMin: number, now = Date.now()): Slot[] {
  const dayStart = startOfDay(day).getTime();
  const from = Math.max(dayStart + workStart * 3_600_000, now);
  const to = dayStart + workEnd * 3_600_000;
  const busy = [
    ...events.filter((e) => !e.allDay).map((e) => [e.start, e.end] as const),
    ...tasks.map((t) => timeboxOf(t)).filter((b): b is { start: number; end: number } => !!b).map((b) => [b.start, b.end] as const),
  ].sort((a, b) => a[0] - b[0]);
  const out: Slot[] = [];
  let cursor = Math.ceil(from / (slotMin * 60_000)) * slotMin * 60_000;
  while (cursor + slotMin * 60_000 <= to) {
    const end = cursor + slotMin * 60_000;
    const clash = busy.find(([s, e]) => s < end && e > cursor);
    if (clash) {
      cursor = Math.ceil(clash[1] / (slotMin * 60_000)) * slotMin * 60_000;
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.end === cursor) last.end = end;
    else out.push({ start: cursor, end });
    cursor = end;
  }
  return out;
}

export function formatSlots(days: { day: Date; slots: Slot[] }[]): string {
  const lines: string[] = [];
  for (const { day, slots } of days) {
    if (!slots.length) continue;
    lines.push(`${format(day, "EEEE d MMM")}: ${slots.map((s) => `${format(new Date(s.start), "h:mm a")} to ${format(new Date(s.end), "h:mm a")}`).join(", ")}`);
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return lines.length ? `${lines.join("\n")}\n(${tz})` : "No free slots in working hours.";
}

export function nextDays(from: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => addDays(startOfDay(from), i));
}
