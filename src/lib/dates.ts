import { addDays, differenceInCalendarDays, format, isSameDay, parseISO, startOfDay } from "date-fns";

export function dateKey(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function parseKey(key: string): Date {
  // YYYY-MM-DD → local midnight
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function parseDue(due: string | null): Date | null {
  if (!due) return null;
  if (due.length <= 10) return parseKey(due);
  const d = parseISO(due);
  return isNaN(d.getTime()) ? null : d;
}

export function toDueString(d: Date, hasTime: boolean): string {
  return hasTime ? format(d, "yyyy-MM-dd'T'HH:mm") : dateKey(d);
}

export function relativeDay(d: Date, now = new Date()): string {
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return format(d, "EEEE");
  if (d.getFullYear() === now.getFullYear()) return format(d, "EEE d MMM");
  return format(d, "d MMM yyyy");
}

export function formatDue(due: string | null, hasTime: boolean, now = new Date()): string {
  const d = parseDue(due);
  if (!d) return "";
  const day = relativeDay(d, now);
  return hasTime ? `${day} · ${formatTime(d)}` : day;
}

export function formatTime(d: Date): string {
  return format(d, "h:mm a").replace(":00", "");
}

export function formatClock(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatDuration(secs: number): string {
  const m = Math.round(secs / 60);
  if (m < 1) return `${Math.round(secs)}s`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export function isOverdue(due: string | null, hasTime: boolean, now = new Date()): boolean {
  const d = parseDue(due);
  if (!d) return false;
  if (hasTime) return d.getTime() < now.getTime();
  return startOfDay(d).getTime() < startOfDay(now).getTime();
}

export function isDueToday(due: string | null, now = new Date()): boolean {
  const d = parseDue(due);
  return !!d && isSameDay(d, now);
}

export function daysFromNow(n: number, now = new Date()): Date {
  return startOfDay(addDays(now, n));
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return format(new Date(ts), "d MMM");
}

export function weekDays(anchor: Date, weekStartsOn: 0 | 1 | 6): Date[] {
  const day = anchor.getDay();
  const offset = (day - weekStartsOn + 7) % 7;
  const start = startOfDay(addDays(anchor, -offset));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
