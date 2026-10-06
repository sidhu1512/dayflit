import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo, emit } from "@tauri-apps/api/event";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { useTasks } from "@/stores/tasks";
import { useNotes } from "@/stores/notes";
import { useHabits, isDoneOn, isScheduledOn } from "@/stores/habits";
import { useClips } from "@/stores/clips";
import { useCalendar } from "@/stores/calendar";
import { useFocus } from "@/stores/focus";
import { useMedia } from "@/stores/media";
import { ipc, isTauri, on, type RawClip } from "@/lib/ipc";
import { onSaveError } from "@/lib/persist";
import { initImages } from "@/lib/imageUrl";
import { notify, setQuietState } from "@/lib/notify";
import { runAction, collectPaletteData } from "@/lib/runAction";
import type { PaletteAction } from "@/lib/actions";
import { dateKey, parseDue } from "@/lib/dates";
import { isEditable } from "@/lib/hotkeys";
import { TitleBar } from "@/components/TitleBar";
import { Nav } from "@/components/Nav";
import { Toasts } from "@/components/Toasts";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaletteCore } from "@/components/CommandPalette";
import { TaskEditor } from "@/components/TaskEditor";
import { Onboarding } from "@/components/Onboarding";
import { TodayView } from "@/views/Today";
import { TasksView } from "@/views/Tasks";
import { NotesView } from "@/views/Notes";
import { CalendarView } from "@/views/Calendar";
import { FocusView } from "@/views/Focus";
import { HabitsView } from "@/views/Habits";
import { StatsView } from "@/views/Stats";
import { ClipsView } from "@/views/Clips";
import { SettingsView } from "@/views/Settings";
import { JournalView } from "@/views/Journal";
import { useJournal, entriesOn } from "@/stores/journal";
import { useUpdater } from "@/lib/updater";
import { useElementWidth } from "@/lib/useElementWidth";
import { cn } from "@/lib/ids";
import type { View } from "@/stores/ui";
import { openExternal } from "@/lib/open";

const VIEW_KEYS: Record<string, View> = { "1": "today", "2": "tasks", "3": "notes", "4": "journal", "5": "calendar", "6": "focus", "7": "habits", "8": "clips", "9": "stats" };

export default function App() {
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const settings = useSettings((s) => s.settings);
  const view = useUi((s) => s.view);
  const navigate = useUi((s) => s.navigate);
  const paletteOpen = useUi((s) => s.paletteOpen);
  const paletteMode = useUi((s) => s.paletteMode);
  const closePalette = useUi((s) => s.closePalette);
  const editingTaskId = useUi((s) => s.editingTaskId);
  const focused = useUi((s) => s.focused);
  const snap = useFocus((s) => s.snap);
  const [shellRef, width] = useElementWidth<HTMLDivElement>();
  const compactNav = width > 0 && width < 560;
  const [clipForPalette, setClipForPalette] = useState<RawClip | null>(null);
  const notified = useRef(new Set<string>());

  // ---------- boot ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await useSettings.getState().load();
        await Promise.all([useTasks.getState().load(), useNotes.getState().load(), useHabits.getState().load(), useClips.getState().load(), useCalendar.getState().load(), useFocus.getState().load(), useJournal.getState().load(), initImages()]);
        await useMedia.getState().init();
        if (cancelled) return;
        setBooted(true);
        const recovered = [useTasks.getState(), useNotes.getState(), useHabits.getState(), useClips.getState(), useSettings.getState()].map((s) => s.recoveredFrom).filter(Boolean);
        if (recovered.length) useUi.getState().toast({ title: "Recovered data from backup", body: `Some files were damaged and restored from: ${[...new Set(recovered)].join(", ")}`, kind: "warning", ttl: 12000 });
        void useCalendar.getState().refresh();
        if (useSettings.getState().settings.updates.autoCheck && isTauri) {
          window.setTimeout(() => {
            void useUpdater.getState().check(true).then((u) => {
              if (u) useUi.getState().toast({ title: `Dayflit ${u.version} is available`, body: "Install it from Settings → Updates.", kind: "info", ttl: 20_000, action: { label: "Open", onClick: () => useUi.getState().navigate("settings", "updates") } });
            });
          }, 30_000);
        }
        const archived = useTasks.getState().archiveOld(useSettings.getState().settings.tasks.autoArchiveDoneDays);
        if (archived) void ipc.log(`archived ${archived} old completed tasks`);
      } catch (e) {
        setBootError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- native events ----------
  useEffect(() => {
    if (!booted || !isTauri) return;
    const uns: (() => void)[] = [];
    const add = (p: Promise<() => void>) => void p.then((u) => uns.push(u));
    add(useFocus.getState().attach());
    add(useMedia.getState().attach());
    add(useClips.getState().startListening());
    add(on<string>("sid://navigate", (v) => navigate(v as View)));
    add(on<string>("sid://shortcut", (action) => {
      if (action === "focus-start") void useFocus.getState().start({});
    }));
    add(on<string[]>("sid://store/reload", async () => {
      await Promise.all([useTasks.getState().reload(), useNotes.getState().reload(), useHabits.getState().reload(), useClips.getState().reload(), useCalendar.getState().load(), useFocus.getState().reloadHistory(), useJournal.getState().reload(), useSettings.getState().load(), initImages()]);
      useUi.getState().toast({ title: "Data reloaded", kind: "success" });
    }));
    add(on<RawClip | null>("sid://clipboard/capture", (c) => {
      setClipForPalette(c);
      if (c) useClips.getState().addRaw(c);
    }));
    add(on<RawClip>("sid://clipboard/item", (c) => {
      if (useSettings.getState().settings.clipboard.notifyOnCapture) useUi.getState().toast({ title: `Captured from ${c.source.app}`, body: c.kind === "image" ? "Image" : c.text.slice(0, 80), kind: "info", ttl: 2500 });
    }));
    add(on<string>("sid://system/session", (s) => {
      if (s === "unlock") {
        void useCalendar.getState().refresh();
        void useMedia.getState().refresh();
      }
    }));
    add(on<string>("sid://system/power", (s) => {
      if (s === "resume") {
        void useCalendar.getState().refresh(undefined, true);
        void useMedia.getState().refresh();
        void ipc.focusGet().then((sn) => useFocus.setState({ snap: sn }));
      }
    }));
    add(on<string>("sid://system/notification-state", setQuietState));
    add(on<string>("sid://focus/auto-paused", () => useUi.getState().toast({ title: "Focus paused", body: "Windows was locked.", kind: "info" })));
    add(on<string>("sid://window/mode", () => {}));
    // Palette window bridge
    add(on<null>("sid://palette/request", () => void emitTo("palette", "sid://palette/data", collectPaletteData())));
    add(on<PaletteAction>("sid://palette/action", (a) => void runAction(a)));
    add(on<{ destination: "task" | "note" | "journal"; text: string; audio: string | null; voice: boolean }>("sid://voice/commit", (p) => {
      const source = { app: "Voice", title: "" };
      if (p.destination === "task") void runAction({ type: "add-task", text: p.text, source, notes: p.audio ? `Voice memo: dayflit-image://${p.audio}` : "" });
      else if (p.destination === "note") void runAction({ type: "add-note", text: p.audio ? `${p.text}\n\n<!-- voice memo -->\n[Voice memo](dayflit-image://${p.audio})` : p.text, source });
      else void runAction({ type: "add-journal", text: p.text, source, audio: p.audio, voice: true });
    }));
    void ipc.notificationState().then(setQuietState).catch(() => {});
    return () => uns.forEach((u) => u());
  }, [booted]);

  // Broadcast settings changes to helper windows (they re-read settings from disk).
  useEffect(() => {
    if (!booted || !isTauri) return;
    const t = window.setTimeout(() => void emit("sid://settings/changed", null), 600);
    return () => window.clearTimeout(t);
  }, [settings, booted]);

  // ---------- window focus / adaptive opacity / smart docking ----------
  useEffect(() => {
    if (!isTauri) return;
    const w = getCurrentWindow();
    const uns: (() => void)[] = [];
    void w.onFocusChanged(({ payload }) => useUi.getState().setFocused(payload)).then((u) => uns.push(u));
    let moveTimer: number | undefined;
    void w.onMoved(() => {
      if (moveTimer) window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => {
        if (useSettings.getState().settings.window.smartDock) void ipc.smartDock().catch(() => {});
      }, 260);
    }).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const w = settings.window;
    root.style.setProperty("--inactive-opacity", !focused && w.adaptiveOpacity ? String(w.inactiveOpacity) : "1");
  }, [focused, settings.window.adaptiveOpacity, settings.window.inactiveOpacity]);

  // ---------- save errors ----------
  useEffect(() => {
    const off = onSaveError(({ name, error }) => useUi.getState().toast({ title: `Could not save ${name}`, body: error, kind: "error" }));
    return () => void off();
  }, []);

  // ---------- reminders scheduler ----------
  useEffect(() => {
    if (!booted) return;
    const tick = () => {
      const s = useSettings.getState().settings;
      const now = Date.now();
      if (s.notifications.dueReminders) {
        const lead = s.notifications.reminderMinutesBefore * 60_000;
        for (const t of useTasks.getState().tasks) {
          if (t.status !== "open" || !t.hasTime || !t.due) continue;
          const d = parseDue(t.due);
          if (!d) continue;
          const at = d.getTime() - lead;
          const key = `task:${t.id}:${t.due}`;
          if (now >= at && now < at + 120_000 && !notified.current.has(key)) {
            notified.current.add(key);
            void notify(lead ? `Due in ${s.notifications.reminderMinutesBefore} min` : "Due now", t.title);
          }
        }
      }
      if (s.calendar.joinReminderMin > 0) {
        const lead = s.calendar.joinReminderMin * 60_000;
        for (const e of useCalendar.getState().eventsBetween(now - 3_600_000, now + 3_600_000)) {
          const key = `ev:${e.id}`;
          if (e.start - lead <= now && e.start > now - 60_000 && !notified.current.has(key)) {
            notified.current.add(key);
            void notify(e.meeting ? `${e.meeting.provider} in ${s.calendar.joinReminderMin} min` : `Starting in ${s.calendar.joinReminderMin} min`, e.title);
            if (e.meeting) useUi.getState().toast({ title: e.title, body: `Starts in ${s.calendar.joinReminderMin} min`, kind: "info", ttl: 60_000, action: { label: "Join", onClick: () => void openExternal(e.meeting!.url) } });
          }
          const jkey = `join:${e.id}`;
          if (s.calendar.autoJoin && e.meeting && e.start <= now && e.start > now - 90_000 && !notified.current.has(jkey)) {
            notified.current.add(jkey);
            void openExternal(e.meeting.url);
            useUi.getState().toast({ title: `Joined ${e.meeting.provider}`, body: e.title, kind: "info" });
          }
        }
      }
      if (s.journal.reminderTime) {
        const d = new Date(now);
        const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const key = `journal:${dateKey(d)}`;
        if (hhmm === s.journal.reminderTime && !notified.current.has(key) && entriesOn(useJournal.getState().entries, dateKey(d)).length === 0) {
          notified.current.add(key);
          void notify("Journal", "A minute to capture today?");
        }
      }
      {
        const d = new Date(now);
        const key = `digest:${dateKey(d)}`;
        if (d.getDay() === 1 && d.getHours() === 9 && d.getMinutes() < 2 && !notified.current.has(key)) {
          notified.current.add(key);
          void notify("Weekly review is ready", "See how last week went and what to carry forward.");
          useUi.getState().toast({ title: "Weekly review is ready", kind: "info", ttl: 30_000, action: { label: "Open", onClick: () => useUi.getState().navigate("stats", "review") } });
        }
      }
      if (s.notifications.habitReminders) {
        const d = new Date(now);
        const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        for (const h of useHabits.getState().habits) {
          if (h.archived || !h.reminderTime || h.reminderTime !== hhmm || !isScheduledOn(h, d) || isDoneOn(h, dateKey(d))) continue;
          const key = `habit:${h.id}:${dateKey(d)}`;
          if (!notified.current.has(key)) {
            notified.current.add(key);
            void notify(`${h.icon} ${h.name}`, "Time for your habit");
          }
        }
      }
    };
    const t = window.setInterval(tick, 30_000);
    tick();
    return () => window.clearInterval(t);
  }, [booted]);

  // ---------- in-app hotkeys ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "k" || (k === "p" && e.shiftKey)) {
          e.preventDefault();
          ui.paletteOpen ? ui.closePalette() : ui.openPalette("search");
          return;
        }
        if (k === "n" && !e.shiftKey) {
          e.preventDefault();
          ui.openPalette("task");
          return;
        }
        if (k === "n" && e.shiftKey) {
          e.preventDefault();
          ui.openPalette("note");
          return;
        }
        if (k === ",") {
          e.preventDefault();
          ui.navigate("settings");
          return;
        }
        if (k === "b" && !isEditable(e.target)) {
          e.preventDefault();
          if (isTauri) void ipc.minimizeToBubble();
          return;
        }
        if (k === "z" && !isEditable(e.target)) {
          if (useTasks.getState().undo()) {
            e.preventDefault();
            ui.toast({ title: "Undone", kind: "info", ttl: 1500 });
          }
          return;
        }
        if (VIEW_KEYS[e.key] && !e.shiftKey) {
          e.preventDefault();
          ui.navigate(VIEW_KEYS[e.key]);
          return;
        }
      }
      if (e.key === "Escape" && !isEditable(e.target)) {
        if (ui.paletteOpen) ui.closePalette();
        else if (ui.editingTaskId) ui.setEditingTask(null);
        else if (ui.selectedTaskId) ui.setSelectedTask(null);
      }
      if (e.key === "?" && !isEditable(e.target) && !ui.paletteOpen) {
        e.preventDefault();
        ui.navigate("settings", "shortcuts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- focus mode chrome ----------
  const focusMode = settings.focus.minimalUiDuringFocus && !!snap.session && snap.session.status === "running" && snap.session.phase === "work";

  if (bootError) {
    return (
      <div className="app-shell flex items-center justify-center p-6">
        <div className="glass max-w-sm p-5 text-center">
          <div className="font-semibold text-danger">Dayflit could not start</div>
          <div className="selectable mt-2 text-[0.85em] text-muted">{bootError}</div>
          <button className="btn mt-4" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={shellRef} className={cn("app-shell flex flex-col", focusMode && "focus-mode")}>
      <TitleBar />
      {!booted ? (
        <div className="flex flex-1 items-center justify-center text-muted">
          <span className="h-5 w-5 animate-pulse rounded-full bg-accent/70" />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          {!compactNav && <Nav compact={false} />}
          <div className={cn("relative min-w-0 flex-1", !compactNav && "border-l hairline")}>
            <div className="h-full">
              {view === "today" && <TodayView />}
              {view === "tasks" && <TasksView />}
              {view === "notes" && <NotesView />}
              {view === "journal" && <JournalView />}
              {view === "calendar" && <CalendarView />}
              {view === "focus" && <FocusView />}
              {view === "habits" && <HabitsView />}
              {view === "stats" && <StatsView />}
              {view === "clips" && <ClipsView />}
              {view === "settings" && <SettingsView />}
            </div>
            {editingTaskId && <TaskEditor key={editingTaskId} taskId={editingTaskId} />}
          </div>
        </div>
      )}
      {booted && compactNav && <Nav compact />}
      {paletteOpen && (
        <div className="absolute inset-0 z-[65] flex items-start justify-center bg-black/30 px-4 pt-10 anim-fade" onMouseDown={closePalette}>
          <PaletteCore mode={paletteMode as "search"} data={collectPaletteData()} clip={clipForPalette} onAction={(a) => void runAction(a)} onClose={closePalette} refreshData={() => {}} />
        </div>
      )}
      <Toasts />
      <ConfirmDialog />
      {booted && !settings.onboardingDone && <Onboarding />}
    </div>
  );
}
