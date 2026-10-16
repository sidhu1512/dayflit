import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { emitTo } from "@tauri-apps/api/event";
import {
  BatteryCharging,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Music,
  Paperclip,
  Pause,
  Pin,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  RotateCw,
  Send,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  StickyNote,
  Timer,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import "@/styles/app.css";
import { ipc, on, type RawClip } from "@/lib/ipc";
import type { FocusSnapshot, Habit, MediaState, Note, Settings, StashPin, Task } from "@/lib/types";
import { applyTheme, resolveDark } from "@/lib/themes";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { dateKey, formatClock } from "@/lib/dates";
import { cn, uid } from "@/lib/ids";
import { makeTask } from "@/stores/tasks";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RollingDigits } from "@/components/RollingDigits";

export type { StashPin };

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = out[k];
    if (b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(b, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function loadInitialSettings(): Settings {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("dayflit:settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        return deepMerge(defaultSettings(), parsed);
      }
    }
  } catch {}
  return defaultSettings();
}

// Immediately apply theme in module scope to prevent flash of unstyled theme
const initialSettings = loadInitialSettings();
applyTheme(initialSettings.appearance);

type WidgetId = "focus" | "tasks" | "habits" | "media" | "clock" | "memo" | "stash";

const WIDGET_CONFIG: { id: WidgetId; label: string; icon: typeof Timer }[] = [
  { id: "focus", label: "Focus", icon: Timer },
  { id: "stash", label: "Stash", icon: Paperclip },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "habits", label: "Habits", icon: Repeat },
  { id: "media", label: "Music", icon: Music },
  { id: "clock", label: "Energy", icon: Clock },
  { id: "memo", label: "Memo", icon: StickyNote },
];

interface HudToast {
  id: number;
  title: string;
  subtitle?: string;
  icon: "check" | "clip" | "focus" | "stash";
}

function PipWidgetTray() {
  const [snap, setSnap] = useState<FocusSnapshot | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [isDark, setIsDark] = useState(() => resolveDark(initialSettings.appearance.mode));
  const [isExpanded, setIsExpanded] = useState(
    () => initialSettings.window?.widgetTrayMode === "expanded",
  );
  const [mode, setMode] = useState<"island" | "tray">(() =>
    initialSettings.window?.widgetTrayMode === "expanded" ? "tray" : "island",
  );
  const [activeWidget, setActiveWidget] = useState<WidgetId>(() =>
    (initialSettings.window?.activeWidget as WidgetId) || "focus",
  );
  const [enabledWidgets, setEnabledWidgets] = useState<WidgetId[]>(() =>
    (initialSettings.window?.enabledWidgets as WidgetId[]) || [
      "focus",
      "tasks",
      "habits",
      "media",
      "clock",
      "memo",
      "stash",
    ],
  );
  const [configOpen, setConfigOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [quickMemoText, setQuickMemoText] = useState("");
  const [memoSaved, setMemoSaved] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState("");
  const [showTaskAdd, setShowTaskAdd] = useState(false);

  // Stash shelf state
  const [stash, setStash] = useState<StashPin[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Alcove HUD and Hover Peek state
  const [hudToast, setHudToast] = useState<HudToast | null>(null);
  const [isHoveringPeek, setIsHoveringPeek] = useState(false);
  const isHoveringPeekRef = useRef(false);
  const peekTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const [isExpanding, setIsExpanding] = useState(false);

  const triggerHud = useCallback((title: string, subtitle?: string, icon: HudToast["icon"] = "stash") => {
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    setHudToast({ id: Date.now(), title, subtitle, icon });
    hudTimerRef.current = window.setTimeout(() => {
      setHudToast(null);
    }, 2200);
  }, []);

  const handleExpandToMain = useCallback(async () => {
    if (isExpanding) return;
    setIsExpanding(true);
    try {
      await ipc.showMain();
    } catch (err) {
      console.error("Failed to restore main window:", err);
      triggerHud("Main Window", "Could not restore main window", "focus");
    } finally {
      window.setTimeout(() => setIsExpanding(false), 500);
    }
  }, [isExpanding, triggerHud]);

  // Save tray settings helper
  const updateTraySettings = useCallback((patch: Partial<Settings["window"]>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        window: { ...prev.window, ...patch },
      };
      return next;
    });
    void emitTo("main", "sid://palette/action", { type: "update-settings", patch: { window: patch } });
  }, []);

  // Apple Fluid Morph Expansion: Pre-size transparent canvas so the spring unfurl NEVER clips or flickers
  const handleExpandToTray = useCallback(async () => {
    if (isExpanded) return;
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    // Step 1: Pre-size the transparent native window FIRST before the DOM expands
    await ipc.adjustPip(460, 360).catch(() => {});
    // Step 2: Switch to tray mode on the next frame so DOM begins smooth spring expansion
    requestAnimationFrame(() => {
      setIsExpanded(true);
      setMode("tray");
      updateTraySettings({ widgetTrayMode: "expanded" });
    });
  }, [isExpanded, updateTraySettings]);

  // Apple Fluid Morph Collapse: Spring back inside open canvas first, then shrink window hit-box
  const handleCollapseToIsland = useCallback(async () => {
    if (!isExpanded) return;
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
    }
    // Step 1: Trigger CSS spring contraction back to compact pill first
    setIsExpanded(false);
    setMode("island");
    updateTraySettings({ widgetTrayMode: "island" });

    // Step 2: Shrink native window bounds only after the visual spring motion completes
    collapseTimerRef.current = window.setTimeout(async () => {
      await ipc.adjustPip(460, 60).catch(() => {});
      collapseTimerRef.current = null;
    }, 300);
  }, [isExpanded, updateTraySettings]);

  // Load authoritative data
  const refreshData = useCallback(async () => {
    try {
      const [tRes, hRes, sRes, fSnap, stashRes] = await Promise.all([
        loadCollection<Task[]>("tasks", []),
        loadCollection<Habit[]>("habits", []),
        loadCollection<Partial<Settings> | null>("settings", null),
        ipc.focusGet().catch(() => null),
        loadCollection<StashPin[]>("stash", []),
      ]);

      if (tRes.data) setTasks(tRes.data);
      if (hRes.data) setHabits(hRes.data);
      if (fSnap) setSnap(fSnap);
      if (stashRes.data) setStash(stashRes.data);

      const s = deepMerge(defaultSettings(), sRes.data ?? {});
      setSettings(s);
      const dark = resolveDark(s.appearance.mode);
      setIsDark(dark);
      applyTheme(s.appearance);

      // Keep root canvas transparent for native DWM / WebView2, while syncing color-scheme to active theme
      document.documentElement.style.setProperty("background", "transparent", "important");
      document.documentElement.style.setProperty("background-color", "transparent", "important");
      document.documentElement.style.setProperty("color-scheme", dark ? "dark" : "light", "important");
      document.body.style.setProperty("background", "transparent", "important");
      document.body.style.setProperty("background-color", "transparent", "important");
      document.body.style.setProperty("color-scheme", dark ? "dark" : "light", "important");

      if (s.window?.widgetTrayMode === "expanded") {
        setIsExpanded(true);
        setMode("tray");
      } else {
        setIsExpanded(false);
        setMode("island");
      }
      if (s.window?.enabledWidgets && Array.isArray(s.window.enabledWidgets)) {
        setEnabledWidgets(s.window.enabledWidgets as WidgetId[]);
      }
      if (s.window?.activeWidget) {
        setActiveWidget(s.window.activeWidget as WidgetId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshData();

    // 1-second clock ticker
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);

    // Media poller
    const mediaTimer = window.setInterval(() => {
      void ipc.mediaState().then(setMedia).catch(() => {});
    }, 3000);
    void ipc.mediaState().then(setMedia).catch(() => {});

    const uns: (() => void)[] = [];
    void on<FocusSnapshot>("sid://focus/state", (next) => {
      setSnap((prev) => {
        if (prev?.session?.phase && next.session?.phase && prev.session.phase !== next.session.phase) {
          triggerHud(
            next.session.phase === "work" ? "Deep Focus Started" : "Break Started",
            next.session.config.taskTitle ?? undefined,
            "focus",
          );
        }
        return next;
      });
    }).then((u) => uns.push(u));

    void on<FocusSnapshot>("sid://focus/tick", setSnap).then((u) => uns.push(u));
    const onSettingsUpdate = (payload?: unknown) => {
      if (payload && typeof payload === "object" && "appearance" in payload) {
        const s = deepMerge(defaultSettings(), payload as Partial<Settings>);
        setSettings(s);
        const dark = resolveDark(s.appearance.mode);
        setIsDark(dark);
        applyTheme(s.appearance);
      } else {
        void refreshData();
      }
    };
    void on<unknown>("sid://settings/changed", onSettingsUpdate).then((u) => uns.push(u));
    void on<string[]>("sid://store/reload", (cols) => {
      const c = Array.isArray(cols) ? cols : [];
      if (!c.length || c.includes("tasks") || c.includes("habits") || c.includes("notes") || c.includes("settings") || c.includes("stash")) void refreshData();
    }).then((u) => uns.push(u));
    void on<string>("sid://store/saved", (col) => {
      if (col === "tasks" || col === "habits" || col === "notes" || col === "settings" || col === "stash") void refreshData();
    }).then((u) => uns.push(u));

    // Listen for clipboard captures & palette actions
    void on<RawClip>("sid://clipboard/clip", (clip) => {
      triggerHud("Clip Captured", clip.source?.app || "Clipboard", "clip");
    }).then((u) => uns.push(u));

    void on<{ type: string; id?: string }>("sid://palette/action", (act) => {
      if (act?.type === "complete-task") {
        triggerHud("Task Completed", undefined, "check");
      }
    }).then((u) => uns.push(u));

    return () => {
      window.clearInterval(timer);
      window.clearInterval(mediaTimer);
      if (peekTimerRef.current) window.clearTimeout(peekTimerRef.current);
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
      if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
      uns.forEach((u) => u());
    };
  }, [refreshData, triggerHud]);



  // Window dragging handler
  const drag = async (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, textarea, a, select, [data-interactive]")) return;
    try {
      await getCurrentWindow().startDragging();
      void ipc.rememberWindow("pip");
    } catch {
      /* ignore */
    }
  };

  // Escape key closes floating window immediately
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void ipc.hidePip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Dropover / Yoink Magnetic Floating Stash Shelf drag-and-drop listener
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer && e.dataTransfer.types.length > 0) {
        setIsDraggingOver(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);

      const dt = e.dataTransfer;
      if (!dt) return;

      const text = dt.getData("text/plain");
      const uri = dt.getData("text/uri-list");
      const files = Array.from(dt.files);

      if (files.length > 0) {
        const newPins: StashPin[] = files.map((f) => ({
          id: uid(),
          type: f.type.startsWith("image/") ? "image" : "file",
          title: f.name,
          content: f.name,
          createdAt: Date.now(),
        }));
        setStash((prev) => {
          const next = [...newPins, ...prev];
          scheduleSave("stash", next);
          return next;
        });
        triggerHud(`Stashed ${files.length} item${files.length > 1 ? "s" : ""}`, files[0].name, "stash");
      } else if (uri || (text && /^https?:\/\//i.test(text))) {
        const targetUrl = uri || text;
        const newPin: StashPin = {
          id: uid(),
          type: "url",
          title: targetUrl.replace(/^https?:\/\//, "").slice(0, 36),
          content: targetUrl,
          createdAt: Date.now(),
        };
        setStash((prev) => {
          const next = [newPin, ...prev];
          scheduleSave("stash", next);
          return next;
        });
        triggerHud("Stashed Link", newPin.title, "stash");
      } else if (text) {
        const newPin: StashPin = {
          id: uid(),
          type: "text",
          title: text.slice(0, 36),
          content: text,
          createdAt: Date.now(),
        };
        setStash((prev) => {
          const next = [newPin, ...prev];
          scheduleSave("stash", next);
          return next;
        });
        triggerHud("Stashed Note", newPin.title, "stash");
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        const newPin: StashPin = {
          id: uid(),
          type: /^https?:\/\//i.test(text) ? "url" : "text",
          title: text.slice(0, 36),
          content: text,
          createdAt: Date.now(),
        };
        setStash((prev) => {
          const next = [newPin, ...prev];
          scheduleSave("stash", next);
          return next;
        });
        triggerHud("Pasted to Stash", newPin.title, "stash");
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("paste", handlePaste);
    };
  }, [triggerHud]);



  // Focus calculations
  const s = snap?.session && snap.session.status !== "finished" ? snap.session : null;
  const isFocusRunning = s?.status === "running";
  const isBreak = s?.phase !== "work";
  const stopwatch = s?.config.mode === "stopwatch" && s.phase === "work";
  const focusTimeDisplay = s ? formatClock(stopwatch ? snap!.elapsedSecs : snap!.remainingSecs) : "--:--";
  const focusLabel = !s
    ? "No active session"
    : s.phase === "work"
      ? s.config.taskTitle ?? s.config.label ?? "Deep Focus"
      : s.phase === "shortBreak"
        ? "Short Break"
        : "Long Break";
  const progressRatio = Math.max(0, Math.min(1, snap?.progress ?? 0));

  // Task helpers
  const todayKey = dateKey();
  const openTasks = tasks.filter((t) => t.status === "open" && (!t.due || t.due <= todayKey));
  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: (t.status === "open" ? "done" : "open") as "open" | "done",
              completedAt: t.status === "open" ? Date.now() : null,
            }
          : t,
      ),
    );
    void emitTo("main", "sid://palette/action", { type: "complete-task", id: taskId });
    triggerHud("Task Completed", undefined, "check");
  };

  const createQuickTask = () => {
    const text = newTaskInput.trim();
    if (!text) return;
    setNewTaskInput("");
    setShowTaskAdd(false);
    const tempTask = makeTask({ title: text, due: todayKey });
    setTasks((prev) => [tempTask, ...prev]);
    void emitTo("main", "sid://palette/action", { type: "add-task", text });
  };

  // Habit helpers
  const todayHabits = habits.filter((h) => !h.archived);
  const toggleHabit = (habitId: string) => {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const count = h.log[todayKey] ?? 0;
        const nextCount = count >= (h.target || 1) ? 0 : (h.target || 1);
        return {
          ...h,
          log: { ...h.log, [todayKey]: nextCount },
        };
      }),
    );
    void emitTo("main", "sid://palette/action", { type: "habit-toggle", id: habitId });
  };

  // Media helpers
  const isMediaPlaying = media?.current?.status?.toLowerCase() === "playing";
  const mediaTrack = media?.current?.title || "";
  const mediaArtist = media?.current?.artist || "";

  const showSplitSatellite = isFocusRunning && (isMediaPlaying || stash.length > 0);

  // Apple Fluid Hover Peek handlers: Island width expands purely in CSS without resizing the OS window
  const handleMouseEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (peekTimerRef.current) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    if (!isHoveringPeekRef.current) {
      peekTimerRef.current = window.setTimeout(() => {
        isHoveringPeekRef.current = true;
        setIsHoveringPeek(true);
      }, 50);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (peekTimerRef.current) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      isHoveringPeekRef.current = false;
      setIsHoveringPeek(false);
    }, 150);
  }, []);

  // Synchronous initial window sizing via useLayoutEffect
  useLayoutEffect(() => {
    if (isExpanded) {
      void ipc.adjustPip(460, 360);
    } else {
      void ipc.adjustPip(460, 60);
    }
  }, [isExpanded]);

  // Day battery
  const dayMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const dayPercent = Math.min(100, Math.round((dayMinutes / 1440) * 100));

  // Quick memo helper
  const saveQuickMemo = () => {
    const text = quickMemoText.trim();
    if (!text) return;
    setQuickMemoText("");
    setMemoSaved(true);
    window.setTimeout(() => setMemoSaved(false), 2000);
    void emitTo("main", "sid://palette/action", { type: "add-note", text });
  };

  // Stash shelf operations
  const removePin = (pinId: string) => {
    setStash((prev) => {
      const next = prev.filter((p) => p.id !== pinId);
      scheduleSave("stash", next);
      return next;
    });
  };

  const copyPin = (pin: StashPin) => {
    void ipc.clipboardWriteText(pin.content);
    triggerHud("Copied to Clipboard", pin.title, "clip");
  };

  const bundleToNote = () => {
    if (stash.length === 0) return;
    const body = stash
      .map((p) => `- **${p.title}** (${p.type}):\n  ${p.content}`)
      .join("\n\n");
    const fullNote = `# Stashed Collection (${new Date().toLocaleDateString()})\n\n${body}`;
    void emitTo("main", "sid://palette/action", { type: "add-note", text: fullNote });
    triggerHud("Bundled to Note", `${stash.length} pins saved`, "stash");
    setStash([]);
    scheduleSave("stash", []);
  };

  const bundleToTask = () => {
    if (stash.length === 0) return;
    const title = `Process ${stash.length} stashed item${stash.length > 1 ? "s" : ""}`;
    void emitTo("main", "sid://palette/action", { type: "add-task", text: title });
    triggerHud("Created Task", title, "check");
    setStash([]);
    scheduleSave("stash", []);
  };

  const sendToCanvas = () => {
    if (stash.length === 0) return;
    // Emit canvas add nodes event to main window
    void emitTo("main", "sid://canvas/add-nodes", {
      pins: stash,
    });
    triggerHud("Sent to Canvas", `${stash.length} visual pins`, "stash");
  };

  // Dynamic Glass Styles matching active DayFlit theme & light/dark mode
  const islandGlass = {
    background: isDark
      ? "linear-gradient(180deg, rgba(var(--surface-2), 0.85) 0%, rgba(var(--surface), 0.94) 100%)"
      : "linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(var(--surface), 0.90) 100%)",
    backdropFilter: "blur(32px) saturate(190%)",
    WebkitBackdropFilter: "blur(32px) saturate(190%)",
    color: "rgb(var(--text))",
    border: isDark
      ? "1px solid rgba(var(--border), 0.14)"
      : "1px solid rgba(var(--border), 0.12)",
    borderTop: "none",
    boxShadow: isDark
      ? "inset 0 1px 0 0 rgba(255, 255, 255, 0.22), inset 0 0 0 1px rgba(var(--border), 0.10), 0 14px 40px -6px rgba(0, 0, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.3), 0 0 24px -4px rgba(var(--accent), 0.2)"
      : "inset 0 1px 0 0 rgba(255, 255, 255, 0.95), inset 0 0 0 1px rgba(var(--border), 0.10), 0 14px 32px -6px rgba(var(--text), 0.10), 0 3px 8px rgba(0, 0, 0, 0.06), 0 0 24px -4px rgba(var(--accent), 0.15)",
  };

  const satelliteGlass = {
    ...islandGlass,
    borderTop: isDark ? "1px solid rgba(var(--border), 0.14)" : "1px solid rgba(var(--border), 0.12)",
  };

  // ----------------------------------------------------
  // UNIFIED APPLE DYNAMIC ISLAND & WIDGET TRAY SURFACE
  // ----------------------------------------------------
  return (
    <div className="w-full flex items-start justify-center select-none pt-0 px-6 pb-6 bg-transparent overflow-hidden">
      <div ref={rootRef} className="relative flex items-start justify-center gap-2">
        {/* Main Unified Dynamic Island & Tray Morphing Surface */}
        <div
          ref={islandRef}
          data-tauri-drag-region
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseDown={drag}
          onDoubleClick={() => void ipc.snapPipTopCenter()}
          className={cn(
            "relative flex flex-col select-none overflow-hidden transition-all",
            isDraggingOver && "ring-2 ring-accent ring-offset-2 scale-102",
          )}
          style={{
            ...islandGlass,
            width: isExpanded ? 420 : (hudToast ? 340 : isHoveringPeek ? 390 : 280),
            height: isExpanded ? 336 : 40,
            borderRadius: isExpanded ? "0 0 24px 24px" : "0 0 20px 20px",
            transitionProperty: "width, height, border-radius, box-shadow, background",
            transitionDuration: "280ms",
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          title={isExpanded ? undefined : "Double-click to snap top-center"}
        >
          {/* Top Bar: In Island mode it shows compact pill status; in Tray mode it shows sleek tray header */}
          <div className="relative w-full h-10 shrink-0 flex items-center select-none overflow-hidden">
            {/* ISLAND COMPACT BAR CONTENT (visible when !isExpanded) */}
            <div
              className={cn(
                "absolute inset-0 px-3.5 flex items-center gap-2.5 transition-all duration-200 select-none",
                isExpanded ? "opacity-0 pointer-events-none -translate-y-1" : "opacity-100 pointer-events-auto translate-y-0",
              )}
            >
              {isDraggingOver ? (
                <div className="flex w-full items-center justify-center gap-2 text-[rgb(var(--accent))] font-semibold text-xs tracking-wide animate-pulse">
                  <Sparkles size={14} />
                  <span>Drop to Stash Shelf</span>
                </div>
              ) : hudToast ? (
                /* Alcove Live Event HUD Toast (Breathes open for 2.2s) */
                <div
                  key={hudToast.id}
                  className="flex w-full items-center justify-between gap-2.5 island-blur-enter"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[rgb(var(--accent-fg))] font-bold bg-[rgb(var(--accent))] shadow-xs"
                    >
                      {hudToast.icon === "check" ? (
                        <Check size={13} strokeWidth={3} />
                      ) : hudToast.icon === "clip" ? (
                        <Copy size={12} />
                      ) : hudToast.icon === "focus" ? (
                        <Timer size={12} />
                      ) : (
                        <Paperclip size={12} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="text-[0.82em] font-bold text-[rgb(var(--text))] truncate leading-tight">
                        {hudToast.title}
                      </div>
                      {hudToast.subtitle && (
                        <div className="text-[0.7em] text-[rgb(var(--text-muted))] truncate leading-tight">
                          {hudToast.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[0.68em] uppercase font-bold tracking-wider text-[rgb(var(--text-faint))] shrink-0">
                      Live
                    </span>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.1)] transition-colors active:scale-95"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHudToast(null);
                      }}
                      aria-label="Dismiss"
                      title="Dismiss notification"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Left Status Indicator / Pulse Beacon */}
                  <div className="flex shrink-0 items-center">
                    {s && s.status === "running" ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[rgb(var(--accent))] opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[rgb(var(--accent))]" />
                      </span>
                    ) : isMediaPlaying ? (
                      <span className="flex items-end gap-[2px] h-3.5">
                        <span className="w-[2.5px] h-3.5 bg-[rgb(var(--accent))] animate-pulse rounded-full" />
                        <span className="w-[2.5px] h-2 bg-[rgb(var(--accent))] animate-pulse delay-100 rounded-full" />
                        <span className="w-[2.5px] h-3.5 bg-[rgb(var(--accent))] animate-pulse delay-200 rounded-full" />
                      </span>
                    ) : stash.length > 0 ? (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-[rgb(var(--accent))]" />
                    ) : openTasks.length > 0 ? (
                      <span className="flex h-2 w-2 rounded-full bg-[rgb(var(--text)/0.8)]" />
                    ) : (
                      <span className="flex h-2 w-2 rounded-full bg-[rgb(var(--text)/0.3)]" />
                    )}
                  </div>

                  {/* Glancable Center Info - click to expand smoothly */}
                  <div
                    className="min-w-0 flex-1 cursor-pointer truncate text-left"
                    onClick={() => void handleExpandToTray()}
                    title="Click to expand Widget Tray"
                  >
                    {s ? (
                      <div className="flex items-center gap-2">
                        <RollingDigits
                          value={focusTimeDisplay}
                          height={18}
                          className="text-[0.95em] font-bold text-[rgb(var(--text))] tracking-tight"
                        />
                        <span className="truncate text-[0.76em] text-[rgb(var(--text-muted))] font-medium">
                          {focusLabel}
                        </span>
                      </div>
                    ) : isMediaPlaying && mediaTrack ? (
                      <div className="truncate text-[0.8em] font-medium text-[rgb(var(--text))] flex items-center gap-1.5">
                        <span className="truncate">{mediaTrack}</span>
                        {mediaArtist && <span className="text-[rgb(var(--text-muted))] text-[0.85em]">· {mediaArtist}</span>}
                      </div>
                    ) : stash.length > 0 ? (
                      <div className="flex items-center gap-1.5 truncate text-[0.8em]">
                        <Paperclip size={12} className="text-[rgb(var(--accent))]" />
                        <span className="font-semibold text-[rgb(var(--text))]">{stash.length} pinned:</span>
                        <span className="truncate text-[rgb(var(--text-muted))]">{stash[0].title}</span>
                      </div>
                    ) : openTasks.length > 0 ? (
                      <div className="flex items-center gap-1.5 truncate text-[0.8em]">
                        <span className="font-semibold text-[rgb(var(--text))]">{openTasks.length} tasks:</span>
                        <span className="truncate text-[rgb(var(--text-muted))]">{openTasks[0].title}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 tabular text-[0.85em] font-medium text-[rgb(var(--text))]">
                        <Clock size={12} className="text-[rgb(var(--text-muted))]" />
                        <span>{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="text-[0.78em] text-[rgb(var(--text-muted))]">· Day {dayPercent}%</span>
                      </div>
                    )}
                  </div>

                  {/* Hover Peek Strip (Exposes Time Scrubbers, 1-Click Task Complete) - PURE ICONS */}
                  {isHoveringPeek && (
                    <div className="flex items-center gap-1 shrink-0 island-blur-enter" data-interactive>
                      {s && (
                        <>
                          <button
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--text)/0.08)] text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.16)] transition-all active:scale-95"
                            onClick={(e) => {
                              e.stopPropagation();
                              void ipc.focusExtend(-300);
                            }}
                            title="Scrub -5 minutes"
                            aria-label="Scrub -5 minutes"
                          >
                            <RotateCcw size={11} />
                          </button>
                          <button
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--text)/0.08)] text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.16)] transition-all active:scale-95"
                            onClick={(e) => {
                              e.stopPropagation();
                              void ipc.focusExtend(300);
                            }}
                            title="Scrub +5 minutes"
                            aria-label="Scrub +5 minutes"
                          >
                            <RotateCw size={11} />
                          </button>
                          {s.config.taskId && (
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--accent)/0.2)] text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent)/0.35)] transition-all active:scale-95"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTask(s.config.taskId!);
                              }}
                              title="Complete Active Task"
                              aria-label="Complete Active Task"
                            >
                              <Check size={11} strokeWidth={2.5} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Quick Actions (Play/Pause, Expand to Main, Expand to Tray, Close) - PURE ICONS */}
                  <div className="flex items-center gap-1 shrink-0" data-interactive>
                    {s && (
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--text)/0.1)] text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.2)] transition-all active:scale-95"
                        onClick={(e) => {
                          e.stopPropagation();
                          void ipc.focusToggle();
                        }}
                        aria-label={s.status === "running" ? "Pause" : "Resume"}
                        title={s.status === "running" ? "Pause" : "Resume"}
                      >
                        {s.status === "running" ? <Pause size={11} /> : <Play size={11} className="ml-0.5" />}
                      </button>
                    )}
                    {isMediaPlaying && !s && (
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--text)/0.1)] text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.2)] transition-all active:scale-95"
                        onClick={(e) => {
                          e.stopPropagation();
                          void ipc.mediaControl("toggle");
                        }}
                        aria-label="Toggle playback"
                        title="Toggle playback"
                      >
                        <Pause size={11} />
                      </button>
                    )}
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.1)] transition-all active:scale-95"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleExpandToMain();
                      }}
                      aria-label="Open DayFlit"
                      title="Open DayFlit main window"
                      disabled={isExpanding}
                    >
                      <Maximize2 size={11} className={cn(isExpanding && "animate-spin opacity-60")} />
                    </button>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.1)] transition-all active:scale-95"
                      onClick={() => void handleExpandToTray()}
                      aria-label="Expand Widget Tray"
                      title="Expand Widget Tray"
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[rgb(var(--text-muted))] hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
                      onClick={() => void ipc.hidePip()}
                      aria-label="Close"
                      title="Close"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* EXPANDED TRAY HEADER BAR CONTENT (visible when isExpanded) */}
            <div
              className={cn(
                "absolute inset-0 px-3 flex items-center justify-between border-b border-[rgb(var(--border)/0.08)] bg-[rgb(var(--text)/0.02)] transition-all duration-200 select-none",
                isExpanded ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-1",
              )}
            >
              {/* Left Brand Badge */}
              <div className="flex items-center gap-1.5 text-[0.76em] font-semibold text-[rgb(var(--text-muted))]">
                <Sparkles size={12} className="text-[rgb(var(--accent))] shrink-0" />
                <span>DayFlit Island</span>
              </div>

              {/* Center iOS Drag Pill */}
              <div
                data-tauri-drag-region
                className="h-1 w-9 rounded-full bg-[rgb(var(--text)/0.2)] hover:bg-[rgb(var(--text)/0.4)] transition-colors cursor-grab"
                aria-label="Drag window"
                onDoubleClick={() => void ipc.snapPipTopCenter()}
                title="Double-click to snap top-center"
              />

              {/* Header Action Buttons - PURE ICONS */}
              <div className="flex items-center gap-1">
                <button
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full transition-all active:scale-95",
                    configOpen
                      ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] font-bold shadow-xs"
                      : "text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.1)]",
                  )}
                  onClick={() => setConfigOpen((v) => !v)}
                  aria-label="Configure widgets"
                  title="Configure widgets"
                >
                  <Settings2 size={12} />
                </button>
                <button
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.1)] transition-all active:scale-95"
                  onClick={() => void handleCollapseToIsland()}
                  aria-label="Collapse to Dynamic Island"
                  title="Collapse to Dynamic Island"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.1)] transition-all active:scale-95"
                  onClick={handleExpandToMain}
                  aria-label="Open DayFlit"
                  title="Open DayFlit main window"
                  disabled={isExpanding}
                >
                  <Maximize2 size={12} className={cn(isExpanding && "animate-spin opacity-60")} />
                </button>
                <button
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[rgb(var(--text-muted))] hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
                  onClick={() => void ipc.hidePip()}
                  aria-label="Close"
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* TRAY BODY (Switcher rail + Widget views) */}
          <div
            className={cn(
              "w-full flex flex-col transition-all duration-200 overflow-hidden",
              isExpanded ? "opacity-100 max-h-[300px] pointer-events-auto" : "opacity-0 max-h-0 pointer-events-none",
            )}
          >

        {/* ------------------------------------------- */}
        {/* iOS SEGMENTED WIDGET SWITCHER BAR (ICONS ONLY) */}
        {/* ------------------------------------------- */}
        {!configOpen && (
          <div className="border-b border-[rgb(var(--border)/0.08)] px-2.5 py-1.5 bg-[rgb(var(--text)/0.02)]">
            <div className="flex items-center gap-1 p-0.5 rounded-2xl bg-[rgb(var(--text)/0.04)] border border-[rgb(var(--border)/0.06)] overflow-x-auto overflow-y-hidden flex-nowrap no-scrollbar">
              {WIDGET_CONFIG.filter((w) => enabledWidgets.includes(w.id)).map((w) => {
                const IconComponent = w.icon;
                const isActive = activeWidget === w.id;
                const badge =
                  w.id === "stash" && stash.length > 0
                    ? stash.length
                    : w.id === "tasks" && openTasks.length > 0
                    ? openTasks.length
                    : null;
                return (
                  <button
                    key={w.id}
                    className={cn(
                      "relative flex-1 min-w-0 shrink-0 h-8 flex items-center justify-center rounded-xl transition-all duration-150 select-none",
                      isActive
                        ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] shadow-sm"
                        : "text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.06)]",
                    )}
                    onClick={() => {
                      setActiveWidget(w.id);
                      updateTraySettings({ activeWidget: w.id });
                    }}
                    title={w.label}
                    aria-label={w.label}
                  >
                    <IconComponent size={14} className="shrink-0" />
                    {badge !== null && (
                      <span
                        className={cn(
                          "absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[0.62em] font-bold tabular shadow-xs",
                          isActive
                            ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                            : "bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))]",
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* CONFIGURATION OVERLAY                       */}
        {/* ------------------------------------------- */}
        {configOpen && (
          <div className="flex flex-col gap-2.5 p-3.5 text-[0.82em] island-blur-enter">
            <div className="flex items-center justify-between text-[0.74em] font-semibold uppercase tracking-wider text-[rgb(var(--text-muted))]">
              <span>Configure Island Modules</span>
              <span className="text-[rgb(var(--text-faint))] font-normal normal-case">Toggle visible</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 p-1 rounded-2xl bg-[rgb(var(--text)/0.03)] border border-[rgb(var(--border)/0.08)]">
              {(
                [
                  ["focus", "Focus Timer", <Timer size={14} key="1" />],
                  ["stash", "Stash Shelf", <Paperclip size={14} key="7" />],
                  ["tasks", "Today's Tasks", <CheckSquare size={14} key="2" />],
                  ["habits", "Daily Habits", <Repeat size={14} key="3" />],
                  ["media", "Media Controls", <Music size={14} key="4" />],
                  ["clock", "Clock & Battery", <Clock size={14} key="5" />],
                  ["memo", "Quick Memo", <StickyNote size={14} key="6" />],
                ] as const
              ).map(([id, label, icon]) => {
                const on = enabledWidgets.includes(id as WidgetId);
                return (
                  <button
                    key={id}
                    className={cn(
                      "relative flex flex-col items-center justify-center h-11 rounded-xl transition-all duration-150 select-none active:scale-95",
                      on
                        ? "bg-[rgb(var(--accent)/0.18)] text-[rgb(var(--accent))] font-medium border border-[rgb(var(--accent)/0.35)] shadow-xs"
                        : "bg-transparent text-[rgb(var(--text-muted))] opacity-50 hover:opacity-90 hover:bg-[rgb(var(--text)/0.06)] border border-transparent",
                    )}
                    onClick={() => {
                      const next = on
                        ? enabledWidgets.filter((w) => w !== id)
                        : [...enabledWidgets, id as WidgetId];
                      if (next.length === 0) return;
                      setEnabledWidgets(next);
                      if (!next.includes(activeWidget)) setActiveWidget(next[0]);
                      updateTraySettings({ enabledWidgets: next });
                    }}
                    title={on ? `${label} (Visible)` : `${label} (Hidden)`}
                    aria-label={label}
                  >
                    <span className="shrink-0">{icon}</span>
                    <span
                      className={cn(
                        "mt-1 h-1 w-1 rounded-full transition-all duration-200",
                        on ? "bg-[rgb(var(--accent))] scale-100" : "bg-transparent scale-0",
                      )}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-[rgb(var(--border)/0.08)] pt-2.5">
              <span className="text-[0.75em] text-[rgb(var(--text-faint))]">Saves automatically</span>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] hover:brightness-110 active:scale-95 transition-all shadow-xs"
                onClick={() => setConfigOpen(false)}
                title="Done"
                aria-label="Done"
              >
                <Check size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* WIDGET CONTENT: DROPOVER STASH SHELF        */}
        {/* ------------------------------------------- */}
        {!configOpen && activeWidget === "stash" && (
          <div key="stash" className="island-blur-enter flex flex-col px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between text-[0.76em] text-[rgb(var(--text-muted))] font-medium">
              <span>Magnetic Stash Shelf ({stash.length})</span>
              {stash.length > 0 && (
                <button
                  className="flex h-5 w-5 items-center justify-center rounded-md text-[rgb(var(--text-muted))] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => {
                    setStash([]);
                    scheduleSave("stash", []);
                  }}
                  title="Clear all stashed items"
                  aria-label="Clear all"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {stash.length === 0 ? (
              <div className="flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border)/0.15)] bg-[rgb(var(--text)/0.02)] p-4 text-center text-[0.82em] text-[rgb(var(--text-muted))]">
                <Paperclip size={20} className="mb-1.5 text-[rgb(var(--accent))] opacity-80" />
                <span className="font-semibold text-[rgb(var(--text))]">Drop to Stash</span>
                <span className="text-[0.82em] text-[rgb(var(--text-faint))] mt-0.5">
                  Drag text, files, images or URLs here from anywhere
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto scroll pr-1">
                  {stash.map((pin) => (
                    <div
                      key={pin.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", pin.content);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className="group flex items-center gap-2 rounded-xl bg-[rgb(var(--text)/0.04)] hover:bg-[rgb(var(--text)/0.08)] px-2.5 py-1.5 text-[0.82em] transition-all cursor-grab active:cursor-grabbing border border-[rgb(var(--border)/0.06)]"
                    >
                      <span className="shrink-0 text-[rgb(var(--accent))]">
                        {pin.type === "url" ? (
                          <LinkIcon size={12} />
                        ) : pin.type === "image" ? (
                          <ImageIcon size={12} />
                        ) : pin.type === "file" ? (
                          <FileText size={12} />
                        ) : (
                          <StickyNote size={12} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[rgb(var(--text))]">
                        {pin.title}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-[rgb(var(--text)/0.12)] text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] transition-colors"
                          onClick={() => copyPin(pin)}
                          title="Copy to clipboard"
                          aria-label="Copy to clipboard"
                        >
                          <Copy size={11} />
                        </button>
                        <button
                          className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-red-500/20 text-[rgb(var(--text-muted))] hover:text-red-400 transition-colors"
                          onClick={() => removePin(pin.id)}
                          title="Remove pin"
                          aria-label="Remove pin"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Stash Shelf Bundle Actions - ICONS ONLY */}
                <div className="mt-1 flex items-center gap-1.5 border-t border-[rgb(var(--border)/0.08)] pt-2">
                  <button
                    className="flex-1 h-8 flex items-center justify-center rounded-xl bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] hover:brightness-110 active:scale-95 transition-all shadow-xs"
                    onClick={sendToCanvas}
                    title="Send pins onto the Infinite Canvas"
                    aria-label="Send to Canvas"
                  >
                    <Layers size={14} />
                  </button>
                  <button
                    className="flex-1 h-8 flex items-center justify-center rounded-xl bg-[rgb(var(--text)/0.08)] hover:bg-[rgb(var(--text)/0.15)] text-[rgb(var(--text))] active:scale-95 transition-all"
                    onClick={bundleToNote}
                    title="Bundle all pins into a new Note"
                    aria-label="Bundle into Note"
                  >
                    <StickyNote size={14} />
                  </button>
                  <button
                    className="flex-1 h-8 flex items-center justify-center rounded-xl bg-[rgb(var(--text)/0.08)] hover:bg-[rgb(var(--text)/0.15)] text-[rgb(var(--text))] active:scale-95 transition-all"
                    onClick={bundleToTask}
                    title="Bundle all pins into a new Task"
                    aria-label="Bundle into Task"
                  >
                    <CheckSquare size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* WIDGET CONTENT: FOCUS TIMER                 */}
        {/* ------------------------------------------- */}
        {!configOpen && activeWidget === "focus" && (
          <div key="focus" className="island-blur-enter flex flex-col px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <RollingDigits
                  value={focusTimeDisplay}
                  height={32}
                  className="text-[2.2em] font-bold leading-none tracking-tight text-[rgb(var(--text))]"
                />
                <div className="mt-1.5 flex items-center gap-1.5 truncate text-[0.78em] text-[rgb(var(--text-muted))] font-medium">
                  <span className="truncate">{focusLabel}</span>
                  {s && s.status === "paused" && (
                    <span className="rounded bg-[rgb(var(--text)/0.1)] px-1 text-[rgb(var(--text))]">paused</span>
                  )}
                  {s && s.phase === "work" && s.config.targetWorkPhases > 0 && (
                    <span className="text-[rgb(var(--text-faint))]">
                      · {s.workPhaseIndex}/{s.config.targetWorkPhases}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons - ICONS ONLY */}
              <div className="flex items-center gap-1.5">
                {s ? (
                  <>
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] hover:brightness-110 transition-transform active:scale-95 shadow-sm font-bold"
                      onClick={() => void ipc.focusToggle()}
                      aria-label={s.status === "running" ? "Pause" : "Resume"}
                      title={s.status === "running" ? "Pause" : "Resume"}
                    >
                      {s.status === "running" ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--text)/0.08)] text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.15)] transition-colors active:scale-95"
                      onClick={() => void ipc.focusSkip()}
                      aria-label="Skip phase"
                      title="Skip phase"
                    >
                      <SkipForward size={14} />
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--text)/0.08)] text-[rgb(var(--text-muted))] hover:text-red-400 hover:bg-red-500/15 transition-colors active:scale-95"
                      onClick={() => void ipc.focusStop(false)}
                      aria-label="Stop session"
                      title="Stop session"
                    >
                      <Square size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] hover:brightness-110 active:scale-95 transition-all shadow-md group"
                    onClick={() =>
                      void ipc.focusStart({
                        ...defaultSettings().focus.defaults,
                        taskId: null,
                        taskTitle: null,
                        label: null,
                      })
                    }
                    title="Start Deep Focus"
                    aria-label="Start Deep Focus"
                  >
                    <Play size={17} className="ml-0.5 group-hover:scale-110 transition-transform" />
                  </button>
                )}
              </div>
            </div>

            {/* Inset Rounded Progress Bar */}
            <div className="mt-3 relative w-full h-1.5 rounded-full bg-[rgb(var(--text)/0.08)] overflow-hidden box-border">
              <div
                className="h-full rounded-full bg-[rgb(var(--accent))] transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.round(Math.max(0, Math.min(1, isNaN(progressRatio) ? 0 : progressRatio)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* WIDGET CONTENT: TASKS CHECKLIST             */}
        {/* ------------------------------------------- */}
        {!configOpen && activeWidget === "tasks" && (
          <div key="tasks" className="island-blur-enter flex flex-col px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between text-[0.76em] text-[rgb(var(--text-muted))] font-medium">
              <span>Today's Tasks ({openTasks.length})</span>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.08)] transition-all"
                onClick={() => setShowTaskAdd((v) => !v)}
                title={showTaskAdd ? "Cancel" : "Add task"}
                aria-label={showTaskAdd ? "Cancel" : "Add task"}
              >
                <Plus size={14} className={cn("transition-transform duration-200", showTaskAdd && "rotate-45")} />
              </button>
            </div>

            {showTaskAdd && (
              <div className="mb-2 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Task title…"
                  className="flex-1 rounded-lg bg-[rgb(var(--text)/0.06)] px-2.5 py-1 text-xs text-[rgb(var(--text))] placeholder:text-[rgb(var(--text-faint))] outline-none border border-[rgb(var(--border)/0.12)] focus:border-[rgb(var(--accent)/0.6)]"
                  value={newTaskInput}
                  onChange={(e) => setNewTaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void createQuickTask()}
                  autoFocus
                />
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] hover:brightness-110 active:scale-95 transition-all shadow-xs"
                  onClick={() => void createQuickTask()}
                  title="Add Task"
                  aria-label="Add Task"
                >
                  <Check size={14} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {openTasks.length === 0 ? (
              <div className="flex h-20 flex-col items-center justify-center text-center text-[0.82em] text-[rgb(var(--text-muted))]">
                <Check size={18} className="mb-1 text-[rgb(var(--text-faint))]" />
                <span>All caught up for today!</span>
              </div>
            ) : (
              <div className="flex max-h-28 flex-col gap-1.5 overflow-y-auto scroll pr-1">
                {openTasks.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-xl bg-[rgb(var(--text)/0.04)] hover:bg-[rgb(var(--text)/0.08)] px-2.5 py-1.5 text-[0.82em] transition-colors"
                  >
                    <button
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--border)/0.25)] text-[rgb(var(--text))] hover:border-[rgb(var(--accent))] transition-colors"
                      onClick={() => void toggleTask(t.id)}
                      aria-label={t.status === "done" ? "Mark incomplete" : "Mark done"}
                      title={t.status === "done" ? "Mark incomplete" : "Mark done"}
                    >
                      {t.status === "done" && <Check size={10} className="text-[rgb(var(--text))]" />}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[rgb(var(--text))]">{t.title}</span>
                    {t.priority !== "none" && (
                      <span className="rounded bg-[rgb(var(--text)/0.08)] px-1 text-[0.7em] capitalize text-[rgb(var(--text-muted))]">
                        {t.priority}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* WIDGET CONTENT: HABITS                      */}
        {/* ------------------------------------------- */}
        {!configOpen && activeWidget === "habits" && (
          <div key="habits" className="island-blur-enter flex flex-col px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between text-[0.76em] text-[rgb(var(--text-muted))] font-medium">
              <span>Today's Habits</span>
              <span className="text-[rgb(var(--text))] font-semibold">
                {todayHabits.filter((h) => (h.log[todayKey] ?? 0) >= (h.target || 1)).length}/
                {todayHabits.length} completed
              </span>
            </div>
            {todayHabits.length === 0 ? (
              <div className="flex h-20 items-center justify-center text-center text-[0.82em] text-[rgb(var(--text-muted))]">
                No active habits. Create some in DayFlit!
              </div>
            ) : (
              <div className="flex max-h-28 flex-col gap-1.5 overflow-y-auto scroll pr-1">
                {todayHabits.slice(0, 4).map((h) => {
                  const done = (h.log[todayKey] ?? 0) >= (h.target || 1);
                  return (
                    <div
                      key={h.id}
                      className="flex items-center gap-2 rounded-xl bg-[rgb(var(--text)/0.04)] hover:bg-[rgb(var(--text)/0.08)] px-2.5 py-1.5 text-[0.82em] transition-colors"
                    >
                      <button
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                          done
                            ? "bg-[rgb(var(--accent))] border-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] font-bold"
                            : "border-[rgb(var(--border)/0.25)] hover:border-[rgb(var(--accent))] text-transparent",
                        )}
                        onClick={() => void toggleHabit(h.id)}
                        aria-label={done ? "Undo habit" : "Complete habit"}
                        title={done ? "Undo habit" : "Complete habit"}
                      >
                        {done && <Check size={11} strokeWidth={2.5} />}
                      </button>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[rgb(var(--text))]",
                          done && "line-through text-[rgb(var(--text-faint))]",
                        )}
                      >
                        {h.name}
                      </span>
                      <span className="text-[0.72em] text-[rgb(var(--text-faint))] font-mono">
                        {h.target > 1 ? `${h.log[todayKey] ?? 0}/${h.target}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* WIDGET CONTENT: MEDIA                       */}
        {/* ------------------------------------------- */}
        {!configOpen && activeWidget === "media" && (
          <div key="media" className="island-blur-enter flex flex-col px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.9em] font-semibold text-[rgb(var(--text))]">
                  {mediaTrack || "No media playing"}
                </div>
                <div className="truncate text-[0.76em] text-[rgb(var(--text-muted))] font-medium">
                  {mediaArtist || "Spotify or system audio"}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--text)/0.08)] text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.15)] transition-colors active:scale-95"
                  onClick={() => void ipc.mediaControl("previous")}
                  aria-label="Previous track"
                  title="Previous track"
                >
                  <SkipBack size={13} />
                </button>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] hover:brightness-110 transition-transform active:scale-95 shadow-sm font-bold"
                  onClick={() => void ipc.mediaControl("toggle")}
                  aria-label="Play/Pause"
                  title={isMediaPlaying ? "Pause" : "Play"}
                >
                  {isMediaPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--text)/0.08)] text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--text)/0.15)] transition-colors active:scale-95"
                  onClick={() => void ipc.mediaControl("next")}
                  aria-label="Next track"
                  title="Next track"
                >
                  <SkipForward size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* WIDGET CONTENT: CLOCK & DAY BATTERY         */}
        {/* ------------------------------------------- */}
        {!configOpen && activeWidget === "clock" && (
          <div key="clock" className="island-blur-enter flex flex-col px-3.5 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="tabular text-[1.65em] font-bold leading-none text-[rgb(var(--text))] tracking-tight">
                  {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <div className="mt-1 text-[0.76em] text-[rgb(var(--text-muted))] font-medium">
                  {currentTime.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-[1.15em] font-bold text-[rgb(var(--text))]">
                  <BatteryCharging size={16} className="text-[rgb(var(--accent))]" />
                  <span>{dayPercent}%</span>
                </div>
                <div className="text-[0.72em] text-[rgb(var(--text-faint))] font-medium">Day Elapsed</div>
              </div>
            </div>

            {/* Inset Day Battery Pill */}
            <div className="mt-3 relative w-full h-2 rounded-full bg-[rgb(var(--text)/0.08)] overflow-hidden box-border">
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full bg-[rgb(var(--accent))] transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round(Math.max(0, Math.min(100, dayPercent)))}%` }}
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* WIDGET CONTENT: QUICK MEMO                  */}
        {/* ------------------------------------------- */}
        {!configOpen && activeWidget === "memo" && (
          <div key="memo" className="island-blur-enter flex flex-col px-3.5 py-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[0.76em] text-[rgb(var(--text-muted))] font-medium">
              <span>Quick Thought Capture</span>
              {memoSaved && <span className="text-[rgb(var(--accent))] font-medium">Saved to Notes!</span>}
            </div>
            <textarea
              className="h-14 w-full resize-none rounded-xl bg-[rgb(var(--text)/0.06)] p-2 text-xs text-[rgb(var(--text))] placeholder:text-[rgb(var(--text-faint))] outline-none border border-[rgb(var(--border)/0.12)] focus:border-[rgb(var(--accent)/0.6)]"
              placeholder="Capture an instant thought or note…"
              value={quickMemoText}
              onChange={(e) => setQuickMemoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void saveQuickMemo();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[0.7em] text-[rgb(var(--text-faint))]">Ctrl+Enter to save</span>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] hover:brightness-110 active:scale-95 transition-all shadow-xs"
                onClick={() => void saveQuickMemo()}
                title="Save Note (Ctrl+Enter)"
                aria-label="Save Note"
              >
                <Send size={13} className="ml-0.5" />
              </button>
            </div>
          </div>
        )}
          </div>
        </div>

        {/* Detached Split-Island Satellite Bubble (Apple iOS Live Activity Split) */}
        {showSplitSatellite && !isExpanded && (
          <div
            className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-[20px] satellite-pop-enter cursor-pointer transition-transform active:scale-95"
            style={satelliteGlass}
            onClick={() => {
              if (stash.length > 0) {
                setActiveWidget("stash");
                void handleExpandToTray();
              } else if (isMediaPlaying) {
                setActiveWidget("media");
                void handleExpandToTray();
              }
            }}
            title={stash.length > 0 ? `${stash.length} Stashed items` : mediaTrack ? `${mediaTrack} - ${mediaArtist}` : "Media Playing"}
            aria-label="Satellite activity indicator"
          >
            {stash.length > 0 ? (
              <div className="relative flex items-center justify-center">
                <Paperclip size={13} className="text-[rgb(var(--accent))]" />
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[0.58em] font-bold text-[rgb(var(--accent-fg))]">
                  {stash.length}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-0.5">
                <span className="w-[2px] h-3 bg-[rgb(var(--accent))] animate-pulse rounded-full" />
                <span className="w-[2px] h-1.5 bg-[rgb(var(--accent))] animate-pulse delay-75 rounded-full" />
                <span className="w-[2px] h-2.5 bg-[rgb(var(--accent))] animate-pulse delay-150 rounded-full" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Dynamic Island Error">
      <PipWidgetTray />
    </ErrorBoundary>
  </StrictMode>,
);
