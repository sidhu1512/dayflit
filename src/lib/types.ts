export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type RecurrenceFreq = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
  /** 0 = Sunday … 6 = Saturday (weekly) */
  byWeekday?: number[];
  /** day of month (monthly). -1 = last day */
  byMonthDay?: number;
  /** ISO date; stop after */
  until?: string | null;
  /** "schedule": next from due date; "completion": next from completion date */
  mode: "schedule" | "completion";
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface CaptureSource {
  app: string;
  title: string;
  exe?: string;
  url?: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: "open" | "done";
  priority: Priority;
  /** ISO date (YYYY-MM-DD) or ISO datetime when hasTime */
  due: string | null;
  hasTime: boolean;
  tags: string[];
  list: string;
  recurrence: Recurrence | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  order: number;
  estimateMin: number | null;
  focusSecs: number;
  subtasks: Subtask[];
  links: string[];
  images: string[];
  source: CaptureSource | null;
  snoozedUntil: number | null;
  pinned: boolean;
  backlog: boolean;
  /** number of times a recurring task was completed */
  completions: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  color: string | null;
  createdAt: number;
  updatedAt: number;
  images: string[];
  source: CaptureSource | null;
}

export type HabitSchedule = { type: "daily" } | { type: "weekdays"; days: number[] } | { type: "timesPerWeek"; times: number };

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  /** completions needed per day */
  target: number;
  unit: string;
  /** dateKey (YYYY-MM-DD) -> count */
  log: Record<string, number>;
  createdAt: number;
  archived: boolean;
  reminderTime: string | null;
  order: number;
  notes: string;
}

export interface Clip {
  id: string;
  kind: "text" | "image" | "link";
  text: string;
  image: string | null;
  source: { app: string; title: string; exe: string; processName: string };
  at: number;
  pinned: boolean;
  width: number;
  height: number;
  convertedTo: { type: "task" | "note"; id: string } | null;
}

export interface Journal {
  id: string;
  name: string;
  color: string;
  /** lucide icon name from the habit/journal icon set */
  icon: string;
  createdAt: number;
  order: number;
}

export interface JournalEntry {
  id: string;
  journalId: string;
  /** YYYY-MM-DD the entry is about (not necessarily when it was written) */
  date: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  body: string;
  tags: string[];
  /** 1 (rough) … 5 (great) */
  mood: number | null;
  favorite: boolean;
  images: string[];
  /** attachment file names (wav/webm) */
  audio: string[];
  source: "manual" | "voice" | "clip" | "prompt" | "template";
  prompt: string | null;
  location: string | null;
  /** capture context, e.g. the app that was in front during a voice capture */
  context: CaptureSource | null;
}

export interface JournalTemplate {
  id: string;
  name: string;
  body: string;
}

export interface JournalData {
  journals: Journal[];
  entries: JournalEntry[];
  templates: JournalTemplate[];
}

export interface CalendarSource {
  id: string;
  name: string;
  /** ICS: http(s)/webcal/file path. Synced calendars: empty. */
  url: string;
  color: string;
  enabled: boolean;
  refreshMinutes: number;
  /** "ics" (default) | "google" | "outlook" */
  kind?: "ics" | "google" | "outlook";
  /** remote calendar id for synced calendars */
  externalId?: string;
  canEdit?: boolean;
}

export interface MeetingLink {
  provider: string;
  url: string;
}

export interface CalEvent {
  id: string;
  sourceId: string;
  uid: string;
  title: string;
  description: string;
  location: string;
  start: number;
  end: number;
  allDay: boolean;
  recurring: boolean;
  status: string;
  organizer: string;
  attendees: string[];
  url: string;
  meeting: MeetingLink | null;
  color: string;
}

export interface FocusConfig {
  mode: "pomodoro" | "deep" | "custom" | "stopwatch";
  workSecs: number;
  shortBreakSecs: number;
  longBreakSecs: number;
  cyclesBeforeLong: number;
  targetWorkPhases: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  taskId: string | null;
  taskTitle: string | null;
  mediaOnStart: "none" | "play";
  mediaOnBreak: "none" | "pause";
  mediaOnEnd: "none" | "pause";
  notify: boolean;
  sound: string;
  soundVolume: number;
  label: string | null;
}

export type FocusPhase = "work" | "shortBreak" | "longBreak";
export type FocusStatus = "running" | "paused" | "awaiting" | "finished";

export interface FocusSession {
  id: string;
  config: FocusConfig;
  phase: FocusPhase;
  status: FocusStatus;
  workPhaseIndex: number;
  completedWorkPhases: number;
  durationSecs: number;
  sessionStartedAt: number;
  phaseStartedAt: number;
  accumulatedMs: number;
  runningSince: number | null;
  pausedAt: number | null;
  totalWorkMs: number;
  extendedSecs: number;
  pauseCount: number;
}

export interface FocusSnapshot {
  session: FocusSession | null;
  remainingSecs: number;
  elapsedSecs: number;
  endsAt: number | null;
  progress: number;
  now: number;
}

export interface FocusHistoryEntry {
  id: string;
  sessionId: string;
  taskId: string | null;
  taskTitle: string | null;
  label: string | null;
  mode: string;
  phase: FocusPhase;
  plannedSecs: number;
  actualSecs: number;
  startedAt: number;
  endedAt: number;
  completed: boolean;
  workPhaseIndex: number;
  pauseCount: number;
}

export interface MediaSession {
  appId: string;
  appName: string;
  title: string;
  artist: string;
  album: string;
  status: string;
  positionMs: number;
  durationMs: number;
  isCurrent: boolean;
}

export interface MediaState {
  available: boolean;
  current: MediaSession | null;
  sessions: MediaSession[];
  thumbnail: string | null;
  volume: number;
  muted: boolean;
}

export interface LinkPreview {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  favicon: string | null;
  kind: string;
  fetchedAt: number;
  error: string | null;
}

export interface SpotifyStatus {
  connected: boolean;
  clientId: string;
  displayName: string;
  premium: boolean;
  redirectUri: string;
}

export type ThemeMode = "system" | "light" | "dark";
export type Density = "compact" | "comfortable" | "spacious";
export type Material = "none" | "acrylic" | "mica" | "tabbed" | "blur";

export interface Settings {
  appearance: {
    themeId: string;
    mode: ThemeMode;
    accent: string | null;
    /** 0..1 how opaque the glass surface is */
    opacity: number;
    material: Material;
    density: Density;
    fontSize: number;
    radius: number;
    reduceMotion: boolean;
    fontFamily: "system" | "inter" | "serif" | "mono";
    showBackgroundGlow: boolean;
  };
  window: {
    alwaysOnTop: boolean;
    closeBehavior: "bubble" | "tray" | "quit";
    startInBubble: boolean;
    adaptiveOpacity: boolean;
    inactiveOpacity: number;
    smartDock: boolean;
    autostart: boolean;
    bubbleShowsTimer: boolean;
  };
  focus: {
    defaults: Omit<FocusConfig, "taskId" | "taskTitle" | "label">;
    pauseOnLock: boolean;
    resumeOnUnlock: boolean;
    pipAutoShow: boolean;
    minimalUiDuringFocus: boolean;
    ambient: { kind: string; volume: number; autoStart: boolean };
    dailyGoalMin: number;
  };
  media: {
    preferredApp: string;
    spotifyClientId: string;
    showCard: boolean;
  };
  clipboard: {
    enabled: boolean;
    captureImages: boolean;
    ignoredApps: string[];
    maxItems: number;
    notifyOnCapture: boolean;
  };
  calendar: {
    weekStartsOn: 0 | 1 | 6;
    dayStartHour: number;
    dayEndHour: number;
    joinReminderMin: number;
    showDeclined: boolean;
    autoJoin: boolean;
    workStartHour: number;
    workEndHour: number;
    slotMinutes: number;
    googleClientId?: string;
    googleClientSecret?: string;
    outlookClientId?: string;
  };
  tasks: {
    defaultList: string;
    lists: string[];
    autoArchiveDoneDays: number;
    showCompletedInToday: boolean;
    carryOverOverdue: boolean;
    defaultEstimateMin: number | null;
  };
  notifications: {
    enabled: boolean;
    dueReminders: boolean;
    reminderMinutesBefore: number;
    respectQuietHours: boolean;
    habitReminders: boolean;
  };
  journal: {
    reminderTime: string | null;
    defaultJournalId: string | null;
    /** sha-256 hex of the PIN, or null when the journal is not locked */
    pinHash: string | null;
    lockAfterMin: number;
    showOnToday: boolean;
  };
  voice: {
    engine: "windows" | "whisper" | "auto";
    whisperModel: "tiny.en" | "base.en" | "small.en" | "tiny" | "base";
    language: string;
    keepAudio: boolean;
    defaultDestination: "ask" | "task" | "note" | "journal";
    autoSave: boolean;
    inputDevice: string | null;
  };
  distraction: {
    enabled: boolean;
    apps: string[];
    keywords: string[];
    cooldownMin: number;
    sound: boolean;
    detectFullscreen: boolean;
  };
  updates: {
    autoCheck: boolean;
    channel: "stable" | "beta";
  };
  shortcuts: Record<string, string>;
  onboardingDone: boolean;
  version: number;
}

export interface WindowStateInfo {
  mode: string;
  alwaysOnTop: boolean;
  material: string;
  dark: boolean;
  pipVisible: boolean;
}
