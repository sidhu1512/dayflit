import type { View } from "@/stores/ui";
import type { CaptureSource, Settings, Task } from "./types";
import type { RawClip } from "./ipc";

/** Actions the command palette can request. Executed in the main window (see runAction). */
export type PaletteAction =
  | { type: "navigate"; view: View; param?: string | null }
  | { type: "add-task"; text: string; source?: CaptureSource | null; notes?: string }
  | { type: "add-note"; text: string; source?: CaptureSource | null; title?: string }
  | { type: "add-journal"; text: string; source?: CaptureSource | null; audio?: string | null; voice?: boolean }
  | { type: "open-journal"; id: string }
  | { type: "open-task"; id: string }
  | { type: "open-note"; id: string }
  | { type: "open-habit"; id: string }
  | { type: "open-clip"; id: string }
  | { type: "complete-task"; id: string }
  | { type: "focus-task"; id: string }
  | { type: "focus"; op: "start" | "deep" | "toggle" | "stop" | "skip" | "stopwatch" }
  | { type: "media"; op: "toggle" | "next" | "prev" }
  | { type: "window"; op: "bubble" | "pip" | "snap" | "next-monitor" | "show" | "hide"; arg?: string }
  | { type: "capture-clip"; clip: RawClip; as: "task" | "note" }
  | { type: "backup" }
  | { type: "settings"; section?: string }
  | { type: "quit" }
  | { type: "voice" }
  | { type: "export" }
  | { type: "update-check" }
  | { type: "availability"; days: number }
  | { type: "join-next-meeting" }
  | { type: "open-event"; id: string; url: string | null }
  | { type: "habit-toggle"; id: string }
  | { type: "update-settings"; patch: { [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K] } };

export interface PaletteData {
  tasks: Pick<Task, "id" | "title" | "status" | "due" | "hasTime" | "priority" | "tags" | "list" | "notes">[];
  notes: { id: string; title: string; body: string; tags: string[] }[];
  journal: { id: string; title: string; body: string; tags: string[]; date: string }[];
  events: { id: string; title: string; when: string; url: string | null; body: string }[];
  habits: { id: string; name: string; icon: string; doneToday: boolean }[];
  clips: { id: string; text: string; kind: string; app: string }[];
  domains?: { id: string; name: string; color: string; score: number }[];
  goals?: { id: string; title: string; domainId: string }[];
  projects?: { id: string; title: string; domainId: string }[];
  focusRunning: boolean;
  focusPaused: boolean;
  lists: string[];
}

export interface CommandDef {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  section: "Navigate" | "Create" | "Focus" | "Media" | "Window" | "App";
  action: PaletteAction;
  shortcut?: string;
}

export function commandList(data: PaletteData | null): CommandDef[] {
  const running = data?.focusRunning;
  const paused = data?.focusPaused;
  return [
    { id: "nav-today", label: "Go to Today", section: "Navigate", action: { type: "navigate", view: "today" }, shortcut: "Ctrl+1" },
    { id: "nav-tasks", label: "Go to Tasks", section: "Navigate", action: { type: "navigate", view: "tasks" }, shortcut: "Ctrl+2" },
    { id: "nav-notes", label: "Go to Notes", section: "Navigate", action: { type: "navigate", view: "notes" }, shortcut: "Ctrl+3" },
    { id: "nav-canvas", label: "Go to Visual Canvas", hint: "Infinite spatial workspace & Obsidian Canvas", section: "Navigate", action: { type: "navigate", view: "canvas" }, keywords: "infinite canvas edgeless visual whiteboard obsidian affine mindmap" },
    { id: "nav-journal", label: "Go to Journal", section: "Navigate", action: { type: "navigate", view: "journal" }, shortcut: "Ctrl+4" },
    { id: "nav-calendar", label: "Go to Calendar", section: "Navigate", action: { type: "navigate", view: "calendar" }, shortcut: "Ctrl+5" },
    { id: "nav-focus", label: "Go to Focus", section: "Navigate", action: { type: "navigate", view: "focus" }, shortcut: "Ctrl+6" },
    { id: "nav-habits", label: "Go to Habits", section: "Navigate", action: { type: "navigate", view: "habits" }, shortcut: "Ctrl+7" },
    { id: "nav-life", label: "Go to Life Vision & Map", hint: "Life Library, Wheel of Life, and Life Map", section: "Navigate", action: { type: "navigate", view: "life" }, shortcut: "Ctrl+8", keywords: "domains pillars wheel balance library" },
    { id: "nav-life-wheel", label: "Wheel of Life", hint: "Life balance assessment and satisfaction radar", section: "Navigate", action: { type: "navigate", view: "life", param: "wheel" }, keywords: "wheel radar balance satisfaction assessment" },
    { id: "nav-life-map", label: "Life Map", hint: "Alignment from Life Vision to Daily Momentum", section: "Navigate", action: { type: "navigate", view: "life", param: "map" }, keywords: "life map alignment cascade flow" },
    { id: "nav-clips", label: "Go to Clips", section: "Navigate", action: { type: "navigate", view: "clips" }, keywords: "clipboard history" },
    { id: "nav-stats", label: "Go to Insights", section: "Navigate", action: { type: "navigate", view: "stats" }, shortcut: "Ctrl+9" },
    { id: "nav-review", label: "Weekly review", hint: "This week versus last, and what to carry forward", section: "Navigate", action: { type: "navigate", view: "stats", param: "review" }, keywords: "digest summary week" },
    { id: "nav-heatmap", label: "Consistency heatmap", section: "Navigate", action: { type: "navigate", view: "stats", param: "consistency" }, keywords: "activity streak github" },
    { id: "nav-settings", label: "Open Settings", section: "Navigate", action: { type: "settings" }, shortcut: "Ctrl+," },
    { id: "new-task", label: "New task…", hint: "Type + then your task", section: "Create", action: { type: "navigate", view: "tasks", param: "new" }, keywords: "add create todo" },
    { id: "new-canvas", label: "New Canvas Board…", section: "Create", action: { type: "navigate", view: "canvas", param: "new" }, keywords: "canvas board edgeless whiteboard diagram" },
    { id: "new-note", label: "New note…", section: "Create", action: { type: "add-note", text: "" }, keywords: "add create scratch" },
    { id: "new-journal", label: "New journal entry", hint: "Capture what happened, thought or learned", section: "Create", action: { type: "navigate", view: "journal", param: "new" }, keywords: "diary write reflect" },
    { id: "voice", label: "Voice capture", hint: "Speak a task, note or journal entry", section: "Create", action: { type: "voice" }, keywords: "dictate record microphone speak", shortcut: "Alt+Shift+V" },
    { id: "capture", label: "Capture clipboard", hint: "Save what's on the clipboard with its source", section: "Create", action: { type: "navigate", view: "clips", param: "capture" }, keywords: "clip paste" },
    running
      ? { id: "focus-toggle", label: paused ? "Resume focus" : "Pause focus", section: "Focus", action: { type: "focus", op: "toggle" } }
      : { id: "focus-start", label: "Start Pomodoro", hint: "25 minutes", section: "Focus", action: { type: "focus", op: "start" }, keywords: "timer" },
    ...(running
      ? [
          { id: "focus-skip", label: "Skip phase", section: "Focus" as const, action: { type: "focus", op: "skip" } as PaletteAction },
          { id: "focus-stop", label: "Stop focus session", section: "Focus" as const, action: { type: "focus", op: "stop" } as PaletteAction },
        ]
      : [
          { id: "focus-deep", label: "Start deep work", hint: "90 minutes", section: "Focus" as const, action: { type: "focus", op: "deep" } as PaletteAction },
          { id: "focus-stopwatch", label: "Start stopwatch", section: "Focus" as const, action: { type: "focus", op: "stopwatch" } as PaletteAction },
        ]),
    { id: "media-toggle", label: "Play / pause music", section: "Media", action: { type: "media", op: "toggle" }, keywords: "spotify" },
    { id: "media-next", label: "Next track", section: "Media", action: { type: "media", op: "next" }, keywords: "spotify skip" },
    { id: "media-prev", label: "Previous track", section: "Media", action: { type: "media", op: "prev" }, keywords: "spotify" },
    { id: "avail-tomorrow", label: "Copy available slots for tomorrow", hint: "Free time in working hours, ready to paste", section: "Create", action: { type: "availability", days: 1 }, keywords: "availability free time calendly schedule" },
    { id: "avail-week", label: "Copy available slots for the next 5 days", section: "Create", action: { type: "availability", days: 5 }, keywords: "availability free time calendly schedule" },
    { id: "join-next", label: "Join next meeting", hint: "Opens the meeting link", section: "Navigate", action: { type: "join-next-meeting" }, keywords: "zoom meet teams call" },
    { id: "win-bubble", label: "Collapse to bubble", section: "Window", action: { type: "window", op: "bubble" }, keywords: "minimize orb" },
    { id: "win-pip", label: "Toggle floating timer", section: "Window", action: { type: "window", op: "pip" }, keywords: "picture in picture" },
    { id: "win-left", label: "Snap to left edge", section: "Window", action: { type: "window", op: "snap", arg: "sidebar-left" }, keywords: "dock" },
    { id: "win-right", label: "Snap to right edge", section: "Window", action: { type: "window", op: "snap", arg: "sidebar-right" }, keywords: "dock" },
    { id: "win-center", label: "Center window", section: "Window", action: { type: "window", op: "snap", arg: "center" } },
    { id: "win-tr", label: "Snap to top-right corner", section: "Window", action: { type: "window", op: "snap", arg: "top-right" } },
    { id: "win-monitor", label: "Move to next monitor", section: "Window", action: { type: "window", op: "next-monitor" }, keywords: "display screen" },
    { id: "backup", label: "Back up data now", section: "App", action: { type: "backup" } },
    { id: "export", label: "Export to Markdown (Obsidian)", hint: "Notes, journal, tasks, habits and attachments as plain files", section: "App", action: { type: "export" }, keywords: "obsidian markdown vault" },
    { id: "update", label: "Check for updates", section: "App", action: { type: "update-check" }, keywords: "upgrade version release" },
    { id: "quit", label: "Quit DayFlit", section: "App", action: { type: "quit" }, keywords: "exit close" },
  ];
}
