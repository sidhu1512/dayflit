import { create } from "zustand";
import { uid } from "@/lib/ids";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { dateKey } from "@/lib/dates";
import { ipc, type ForegroundInfo } from "@/lib/ipc";
import { useTasks } from "./tasks";
import type { Task } from "@/lib/types";

export type ActivityCategory =
  | "deep-work"
  | "design"
  | "communication"
  | "browsing"
  | "distraction";

export function normalizeCategory(cat: string): ActivityCategory {
  const c = (cat || "").toLowerCase();
  if (c.includes("deep") || c.includes("coding") || c === "deep-work") return "deep-work";
  if (c.includes("design")) return "design";
  if (c.includes("comm") || c.includes("communication")) return "communication";
  if (c.includes("browse") || c.includes("browsing")) return "browsing";
  return "distraction";
}

export function categoryDisplayName(cat: string): string {
  const norm = normalizeCategory(cat);
  switch (norm) {
    case "deep-work":
      return "Deep Work / Coding";
    case "design":
      return "Design";
    case "communication":
      return "Communication";
    case "browsing":
      return "Browsing";
    case "distraction":
      return "Distraction";
  }
}

export interface ActivitySession {
  id: string;
  exe: string;
  processName: string;
  title: string;
  category: ActivityCategory;
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  durationSecs: number;
}

export interface ActivityStoreState {
  sessions: ActivitySession[];
  paused: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  refreshFromRust: () => Promise<void>;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  recordForeground: (info: ForegroundInfo) => void;
  clearHistory: () => void;
  logAsCompletedTask: (session: ActivitySession) => Task;
  todaySessions: (forDate?: Date) => ActivitySession[];
  alignmentScore: (sessions: ActivitySession[]) => number;
}

// Auto-classify process & window title
export function classifyActivity(processName: string, title: string): ActivityCategory {
  const p = (processName || "").toLowerCase();
  const t = (title || "").toLowerCase();

  // Distraction
  const distractionKeywords = [
    "youtube",
    "reddit",
    "twitter",
    "x.com",
    "instagram",
    "tiktok",
    "netflix",
    "twitch",
    "facebook",
    "steam",
    "epicgames",
  ];
  if (
    p.includes("steam.exe") ||
    p.includes("epicgames") ||
    p.includes("discord.exe") ||
    distractionKeywords.some((k) => t.includes(k))
  ) {
    return "distraction";
  }

  // Deep Work / Coding / Dev
  const codingApps = [
    "code.exe",
    "cursor.exe",
    "devenv.exe",
    "idea64.exe",
    "pycharm64.exe",
    "webstorm64.exe",
    "windowsterminal.exe",
    "powershell.exe",
    "cmd.exe",
    "sublime_text.exe",
    "rustrover64.exe",
    "clion64.exe",
    "bash.exe",
    "git",
  ];
  const codingTitles = [
    "visual studio",
    "cursor",
    "intellij",
    "pycharm",
    "webstorm",
    "terminal",
    "github",
    "gitlab",
    "stack overflow",
    ".rs",
    ".ts",
    ".tsx",
    ".py",
    ".go",
    ".java",
  ];
  if (codingApps.some((a) => p.includes(a)) || codingTitles.some((k) => t.includes(k))) {
    return "deep-work";
  }

  // Design
  const designApps = [
    "figma.exe",
    "photoshop.exe",
    "illustrator.exe",
    "blender.exe",
    "canva.exe",
    "afterfx.exe",
    "premiere.exe",
    "xd.exe",
  ];
  const designTitles = ["figma", "photoshop", "illustrator", "blender", "excalidraw", "dribbble", "behance"];
  if (designApps.some((a) => p.includes(a)) || designTitles.some((k) => t.includes(k))) {
    return "design";
  }

  // Communication
  const commApps = [
    "slack.exe",
    "teams.exe",
    "telegram.exe",
    "whatsapp.exe",
    "zoom.exe",
    "outlook.exe",
    "thunderbird.exe",
  ];
  const commTitles = ["slack", "microsoft teams", "telegram", "whatsapp", "zoom", "gmail", "outlook mail", "inbox"];
  if (commApps.some((a) => p.includes(a)) || commTitles.some((k) => t.includes(k))) {
    return "communication";
  }

  // Browsing
  const browsers = ["chrome.exe", "firefox.exe", "msedge.exe", "brave.exe", "arc.exe", "opera.exe", "safari.exe"];
  if (browsers.some((b) => p.includes(b))) {
    return "browsing";
  }

  // Default to deep-work for local productivity tools
  return "deep-work";
}

let activeSession: ActivitySession | null = null;
let lastSwitchTime = 0;
let transientSession: ActivitySession | null = null;

export const useActivity = create<ActivityStoreState>((set, get) => ({
  sessions: [],
  paused: false,
  loaded: false,

  load: async () => {
    try {
      const res = await loadCollection<{ sessions: ActivitySession[]; paused?: boolean }>("activity", {
        sessions: [],
        paused: false,
      });
      let initialSessions: ActivitySession[] = [];
      let isPaused = false;
      if (res.data) {
        initialSessions = (Array.isArray(res.data.sessions) ? res.data.sessions : []).map((s) => ({
          ...s,
          category: normalizeCategory(s.category),
        }));
        isPaused = Boolean(res.data.paused);
      }
      set({ sessions: initialSessions, paused: isPaused, loaded: true });
      await get().refreshFromRust();
    } catch {
      set({ loaded: true });
    }
  },

  refreshFromRust: async () => {
    try {
      const rustSessions = await ipc.activityGetSessions().catch(() => null);
      const isPaused = await ipc.activityIsPaused().catch(() => null);
      if (isPaused !== null) {
        set({ paused: isPaused });
      }
      if (rustSessions && Array.isArray(rustSessions) && rustSessions.length > 0) {
        const normalizedRust: ActivitySession[] = rustSessions.map((s) => ({
          ...s,
          category: normalizeCategory(s.category),
        }));

        const current = get().sessions;
        const mergedMap = new Map<string, ActivitySession>();
        for (const s of current) {
          mergedMap.set(s.id, { ...s, category: normalizeCategory(s.category) });
        }
        for (const s of normalizedRust) {
          mergedMap.set(s.id, s);
        }
        const merged = Array.from(mergedMap.values()).sort((a, b) => b.startTime - a.startTime);
        set({ sessions: merged });
        scheduleSave("activity", { sessions: merged, paused: get().paused });
      }
    } catch {
      /* ignore */
    }
  },

  setPaused: (paused: boolean) => {
    set({ paused });
    void ipc.activitySetPaused(paused).catch(() => {});
    scheduleSave("activity", { sessions: get().sessions, paused });
  },

  togglePaused: () => {
    const next = !get().paused;
    get().setPaused(next);
  },


  recordForeground: (info: ForegroundInfo) => {
    if (get().paused) return;
    if (!info.processName || info.processName === "dayflit.exe" || info.processName === "sid.exe") {
      return;
    }

    const now = Date.now();
    const category = classifyActivity(info.processName, info.title);

    // If we have an active session
    if (activeSession) {
      const isSameApp =
        activeSession.processName.toLowerCase() === info.processName.toLowerCase() &&
        activeSession.title === info.title;

      if (isSameApp) {
        // Continuous in same window
        activeSession.endTime = now;
        activeSession.durationSecs = Math.max(1, Math.round((now - activeSession.startTime) / 1000));
        transientSession = null;
      } else {
        // App switch
        const timeInTransient = transientSession ? (now - lastSwitchTime) / 1000 : 0;

        // If user quickly switched to a transient app and returned in < 15s, merge back
        if (
          transientSession &&
          timeInTransient < 15 &&
          transientSession.processName.toLowerCase() === info.processName.toLowerCase()
        ) {
          // Reverted back to the original session, swallow the transient blip
          activeSession.endTime = now;
          activeSession.durationSecs = Math.max(1, Math.round((now - activeSession.startTime) / 1000));
          transientSession = null;
        } else {
          // Switch to new app
          // Finalize current active session if it lasted at least 5 seconds
          if (activeSession.durationSecs >= 5) {
            const currentList = get().sessions;
            const updated = [activeSession, ...currentList.slice(0, 999)];
            set({ sessions: updated });
            scheduleSave("activity", { sessions: updated, paused: get().paused });
          }

          // Start new candidate session
          transientSession = activeSession;
          lastSwitchTime = now;
          activeSession = {
            id: uid(),
            exe: info.exe,
            processName: info.processName,
            title: info.title || info.processName,
            category,
            startTime: now,
            endTime: now + 1000,
            durationSecs: 1,
          };
        }
      }
    } else {
      // First session
      activeSession = {
        id: uid(),
        exe: info.exe,
        processName: info.processName,
        title: info.title || info.processName,
        category,
        startTime: now,
        endTime: now + 1000,
        durationSecs: 1,
      };
      lastSwitchTime = now;
    }
  },

  clearHistory: () => {
    activeSession = null;
    transientSession = null;
    set({ sessions: [] });
    void ipc.activityClear().catch(() => {});
    scheduleSave("activity", { sessions: [], paused: get().paused });
  },

  logAsCompletedTask: (session: ActivitySession): Task => {
    const mins = Math.max(5, Math.round(session.durationSecs / 60));
    const cleanApp = session.processName.replace(/\.exe$/i, "");
    const friendlyApp = cleanApp.charAt(0).toUpperCase() + cleanApp.slice(1);
    const title = session.title && session.title !== session.processName
      ? `${session.title} (${friendlyApp})`
      : `Worked in ${friendlyApp}`;
    const normCategory = normalizeCategory(session.category);
    const friendlyCategory = categoryDisplayName(normCategory);

    const task = useTasks.getState().add({
      title,
      notes: `Logged from Automatic OS Activity Timeline.\nApplication: ${session.processName}\nDuration: ${mins} minutes\nCategory: ${friendlyCategory}`,
      status: "done",
      priority: normCategory === "deep-work" ? "medium" : "none",
      due: dateKey(new Date(session.startTime)),
      hasTime: true,
      estimateMin: mins,
      tags: ["auto-logged", normCategory],
    });

    // Mark completed with start/end time
    useTasks.getState().update(task.id, {
      completedAt: session.endTime,
      focusSecs: session.durationSecs,
    });

    return task;
  },

  todaySessions: (forDate?: Date): ActivitySession[] => {
    const targetKey = dateKey(forDate || new Date());
    const list = [...get().sessions];
    if (activeSession && activeSession.durationSecs >= 5) {
      if (!list.some((s) => s.id === activeSession!.id)) {
        list.unshift(activeSession);
      }
    }
    return list.filter((s) => dateKey(new Date(s.startTime)) === targetKey);
  },

  alignmentScore: (sessions: ActivitySession[]): number => {
    if (!sessions.length) return 100;
    let productiveSecs = 0;
    let totalSecs = 0;

    for (const s of sessions) {
      totalSecs += s.durationSecs;
      const cat = normalizeCategory(s.category);
      if (cat === "deep-work" || cat === "design") {
        productiveSecs += s.durationSecs;
      } else if (cat === "communication") {
        productiveSecs += s.durationSecs * 0.7;
      } else if (cat === "browsing") {
        productiveSecs += s.durationSecs * 0.5;
      }
    }

    if (totalSecs === 0) return 100;
    return Math.round(Math.min(100, (productiveSecs / totalSecs) * 100));
  },
}));
