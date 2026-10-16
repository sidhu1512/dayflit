import { format } from "date-fns";
import { dateKey, parseKey } from "./dates";
import { isDoneOn } from "@/stores/habits";
import type { Task, FocusHistoryEntry, Habit, Note, Clip, JournalEntry } from "./types";

export interface ChronicleTimelineItem {
  id: string;
  type: "task" | "focus" | "habit" | "note" | "clip";
  timestamp: number;
  timeFormatted: string;
  title: string;
  detail?: string;
  badge?: string;
}

export interface DayChronicle {
  date: string;
  totalFocusMinutes: number;
  focusSessionsCount: number;
  tasksCompletedCount: number;
  habitsDoneCount: number;
  notesUpdatedCount: number;
  clipsCount: number;
  hasActivity: boolean;
  timeline: ChronicleTimelineItem[];
  completedTasks: string[];
  doneHabits: string[];
  updatedNotes: string[];
}

/**
 * Aggregates all daily activity from tasks, focus sessions, habits, notes, and clips for a given dateKey (YYYY-MM-DD).
 */
export function aggregateDayChronicle(
  targetDate: string,
  data: {
    tasks?: Task[];
    focusHistory?: FocusHistoryEntry[];
    habits?: Habit[];
    notes?: Note[];
    clips?: Clip[];
  }
): DayChronicle {
  const {
    tasks = [],
    focusHistory = [],
    habits = [],
    notes = [],
    clips = [],
  } = data;

  const timeline: ChronicleTimelineItem[] = [];
  const completedTasks: string[] = [];
  const doneHabits: string[] = [];
  const updatedNotes: string[] = [];

  // 1. Tasks completed on target date
  for (const t of tasks) {
    if (t.status === "done" && t.completedAt) {
      const dKey = dateKey(new Date(t.completedAt));
      if (dKey === targetDate) {
        completedTasks.push(t.title);
        timeline.push({
          id: `task-${t.id}`,
          type: "task",
          timestamp: t.completedAt,
          timeFormatted: format(new Date(t.completedAt), "h:mm a"),
          title: t.title,
          badge: t.priority !== "none" ? t.priority : undefined,
        });
      }
    }
  }

  // 2. Focus work sessions on target date
  let totalFocusMinutes = 0;
  let focusSessionsCount = 0;
  for (const f of focusHistory) {
    if (f.phase === "work" && f.startedAt && f.endedAt) {
      const dKey = dateKey(new Date(f.startedAt));
      if (dKey === targetDate) {
        focusSessionsCount++;
        const durationMin = Math.max(1, Math.round((f.endedAt - f.startedAt) / 60000));
        totalFocusMinutes += durationMin;
        timeline.push({
          id: `focus-${f.id}`,
          type: "focus",
          timestamp: f.startedAt,
          timeFormatted: format(new Date(f.startedAt), "h:mm a"),
          title: f.taskTitle ? `Focus: ${f.taskTitle}` : "Deep Work Session",
          detail: `${durationMin} min${f.completed ? " · finished" : ""}`,
        });
      }
    }
  }

  // 3. Habits checked off on target date
  for (const h of habits) {
    if (h.log && isDoneOn(h, targetDate)) {
      doneHabits.push(h.name);
      timeline.push({
        id: `habit-${h.id}`,
        type: "habit",
        // Position habits near midday
        timestamp: parseKey(targetDate).setHours(12, 0, 0, 0),
        timeFormatted: "Today",
        title: h.name,
        badge: h.target > 1 ? `${h.target}x` : undefined,
      });
    }
  }

  // 4. Notes created or updated on target date
  for (const n of notes) {
    if (!n.archived) {
      const updatedKey = dateKey(new Date(n.updatedAt));
      const createdKey = dateKey(new Date(n.createdAt));
      if (updatedKey === targetDate || createdKey === targetDate) {
        const title = n.title.trim() || "Untitled Note";
        if (!updatedNotes.includes(title)) {
          updatedNotes.push(title);
          const timestamp = updatedKey === targetDate ? n.updatedAt : n.createdAt;
          timeline.push({
            id: `note-${n.id}`,
            type: "note",
            timestamp,
            timeFormatted: format(new Date(timestamp), "h:mm a"),
            title: `Note: ${title}`,
            detail: n.tags.length ? n.tags.map((t) => `#${t}`).join(" ") : undefined,
          });
        }
      }
    }
  }

  // 5. Clips captured on target date
  let clipsCount = 0;
  for (const c of clips) {
    const timestamp = c.at || (c as unknown as { capturedAt?: number }).capturedAt;
    if (timestamp) {
      const clipKey = dateKey(new Date(timestamp));
      if (clipKey === targetDate) {
        clipsCount++;
        timeline.push({
          id: `clip-${c.id}`,
          type: "clip",
          timestamp,
          timeFormatted: format(new Date(timestamp), "h:mm a"),
          title: `Captured from ${c.source?.app || "Clipboard"}`,
          detail: c.kind === "image" ? "Image clipping" : (c.text || "").slice(0, 50),
        });
      }
    }
  }

  // Sort timeline chronologically (earliest to latest)
  timeline.sort((a, b) => a.timestamp - b.timestamp);

  const hasActivity =
    completedTasks.length > 0 ||
    totalFocusMinutes > 0 ||
    doneHabits.length > 0 ||
    updatedNotes.length > 0 ||
    clipsCount > 0;

  return {
    date: targetDate,
    totalFocusMinutes,
    focusSessionsCount,
    tasksCompletedCount: completedTasks.length,
    habitsDoneCount: doneHabits.length,
    notesUpdatedCount: updatedNotes.length,
    clipsCount,
    hasActivity,
    timeline,
    completedTasks,
    doneHabits,
    updatedNotes,
  };
}

/**
 * Format a DayChronicle into clean, publication-grade markdown
 * that can be woven directly into the journal entry body.
 */
export function formatChronicleMarkdown(chronicle: DayChronicle): string {
  const lines: string[] = [];
  lines.push(`### Daily Activity Chronicle`);

  if (chronicle.totalFocusMinutes > 0) {
    lines.push(
      `- ⏱ **Deep Work:** ${chronicle.totalFocusMinutes} min logged across ${chronicle.focusSessionsCount} session${
        chronicle.focusSessionsCount === 1 ? "" : "s"
      }`
    );
  }

  if (chronicle.completedTasks.length > 0) {
    lines.push(
      `- ✅ **Tasks Completed (${chronicle.completedTasks.length}):**`
    );
    for (const t of chronicle.completedTasks) {
      lines.push(`  - ${t}`);
    }
  }

  if (chronicle.doneHabits.length > 0) {
    lines.push(`- 🔁 **Habits Checked:** ${chronicle.doneHabits.join(", ")}`);
  }

  if (chronicle.updatedNotes.length > 0) {
    lines.push(
      `- 📝 **Notes Documented:** ${chronicle.updatedNotes.join(", ")}`
    );
  }

  if (chronicle.clipsCount > 0) {
    lines.push(
      `- 📋 **Clipboard Clips:** ${chronicle.clipsCount} captured item${
        chronicle.clipsCount === 1 ? "" : "s"
      }`
    );
  }

  if (!chronicle.hasActivity) {
    lines.push(`- *Quiet day: zero tracked digital activity.*`);
  }

  return lines.join("\n");
}

/**
 * Memory Resurfacer:
 * Surface entries written 7 days ago, 30 days ago, 90 days ago, or 1 year ago.
 * If exact milestone dates don't exist, surfaces a high-mood highlight memory.
 */
export interface ResurfacedMemory {
  entry: JournalEntry;
  type: "milestone" | "highlight";
  label: string;
  relativeTime: string;
}

export function findResurfacedMemory(
  entries: JournalEntry[],
  today = new Date()
): ResurfacedMemory | null {
  if (!entries.length) return null;

  const todayKey = dateKey(today);

  // Milestone offsets (1 year uses calendar year subtraction for leap-year fidelity)
  const milestones: { days?: number; years?: number; label: string; relativeTime: string }[] = [
    { years: 1, label: "1 year ago today", relativeTime: "1 year ago" },
    { days: 90, label: "90 days ago", relativeTime: "90 days ago" },
    { days: 30, label: "30 days ago", relativeTime: "30 days ago" },
    { days: 7, label: "7 days ago", relativeTime: "7 days ago" },
  ];

  for (const m of milestones) {
    const targetDate = new Date(today);
    if (m.years) {
      targetDate.setFullYear(targetDate.getFullYear() - m.years);
    } else if (m.days) {
      targetDate.setDate(targetDate.getDate() - m.days);
    }
    const mKey = dateKey(targetDate);
    const matches = entries.filter((e) => e.date === mKey);
    if (matches.length > 0) {
      const match = matches[0];
      return {
        entry: match,
        type: "milestone",
        label: m.label,
        relativeTime: m.relativeTime,
      };
    }
  }

  // Fallback: surface highest mood or favorite past entry (not from today)
  const pastEntries = entries.filter((e) => e.date !== todayKey);
  if (!pastEntries.length) return null;

  // Prefer favorite with mood 5, then mood 5, then favorite, then mood 4
  const sorted = [...pastEntries].sort((a, b) => {
    const aScore = (a.favorite ? 10 : 0) + (a.mood ?? 0) * 2;
    const bScore = (b.favorite ? 10 : 0) + (b.mood ?? 0) * 2;
    return bScore - aScore;
  });

  const best = sorted[0];
  // Only surface if it is a genuine highlight memory (favorite or high mood >= 4)
  if (best && (best.favorite || (best.mood !== null && best.mood !== undefined && best.mood >= 4))) {
    const displayDate = best.createdAt ? new Date(best.createdAt) : parseKey(best.date);
    return {
      entry: best,
      type: "highlight",
      label: best.mood === 5 ? "Cherished 5-star memory" : "Highlight memory from your journey",
      relativeTime: format(displayDate, "MMMM d, yyyy"),
    };
  }

  return null;
}
