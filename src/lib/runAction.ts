import type { PaletteAction, PaletteData } from "./actions";
import { ipc, isTauri } from "./ipc";
import { dateKey } from "./dates";
import { useTasks } from "@/stores/tasks";
import { useNotes } from "@/stores/notes";
import { useJournal } from "@/stores/journal";
import { useHabits, isDoneOn } from "@/stores/habits";
import { useClips } from "@/stores/clips";
import { useFocus } from "@/stores/focus";
import { useMedia } from "@/stores/media";
import { useUi } from "@/stores/ui";
import { useSettings } from "@/stores/settings";
import { useCalendar, nextMeeting } from "@/stores/calendar";
import { freeSlots, formatSlots, nextDays } from "./availability";
import { openExternal } from "./open";
import { addDays, startOfDay } from "date-fns";
import { plainText } from "./markdown";

export function collectPaletteData(): PaletteData {
  const tasks = useTasks.getState().tasks;
  const notes = useNotes.getState().notes;
  const habits = useHabits.getState().habits;
  const clips = useClips.getState().clips;
  const snap = useFocus.getState().snap;
  const today = dateKey();
  return {
    tasks: tasks.filter((t) => t.status === "open").concat(tasks.filter((t) => t.status === "done").slice(0, 200)).map((t) => ({ id: t.id, title: t.title, status: t.status, due: t.due, hasTime: t.hasTime, priority: t.priority, tags: t.tags, list: t.list, notes: t.notes.slice(0, 300) })),
    notes: notes.filter((n) => !n.archived).map((n) => ({ id: n.id, title: n.title || plainText(n.body).slice(0, 60) || "Untitled", body: plainText(n.body).slice(0, 2000), tags: n.tags })),
    events: useCalendar
      .getState()
      .eventsBetween(Date.now() - 7 * 86_400_000, Date.now() + 60 * 86_400_000)
      .slice(0, 300)
      .map((e) => ({ id: e.id, title: e.title, when: new Date(e.start).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }), url: e.meeting?.url ?? null, body: [e.location, e.attendees.join(" "), e.description.slice(0, 300)].join(" ") })),
    journal: useJournal.getState().entries.slice(0, 500).map((e) => ({ id: e.id, title: e.title || plainText(e.body).slice(0, 60) || "Journal entry", body: plainText(e.body).slice(0, 2000), tags: e.tags, date: e.date })),
    habits: habits.filter((h) => !h.archived).map((h) => ({ id: h.id, name: h.name, icon: h.icon, doneToday: isDoneOn(h, today) })),
    clips: clips.slice(0, 200).map((c) => ({ id: c.id, text: c.text, kind: c.kind, app: c.source.app })),
    focusRunning: !!snap.session && snap.session.status !== "finished",
    focusPaused: snap.session?.status === "paused" || snap.session?.status === "awaiting",
    lists: useSettings.getState().settings.tasks.lists,
  };
}

export async function exportToMarkdown() {
  if (!isTauri) return;
  const toast = useUi.getState().toast;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, title: "Export to a folder (an Obsidian vault works)" });
  if (typeof dir !== "string") return;
  try {
    const r = await ipc.exportMarkdown(dir);
    toast({ title: "Export complete", body: `${r.notes} notes, ${r.journal} journal entries, ${r.tasks} tasks, ${r.attachments} attachments`, kind: "success", ttl: 8000, action: { label: "Open folder", onClick: () => void import("@tauri-apps/plugin-opener").then((m) => m.openPath(dir)) } });
  } catch (e) {
    toast({ title: "Export failed", body: String(e), kind: "error" });
  }
}

/** Execute a palette action inside the main window. */
export async function runAction(a: PaletteAction) {
  const ui = useUi.getState();
  const toast = ui.toast;
  switch (a.type) {
    case "navigate":
      ui.navigate(a.view, a.param ?? null);
      if (isTauri) void ipc.showMain();
      break;
    case "add-task": {
      const t = useTasks.getState().quickAdd(a.text, { source: a.source ?? undefined, notes: a.notes ?? "" });
      if (t) toast({ title: "Task added", body: t.title, kind: "success", action: { label: "Open", onClick: () => { ui.navigate("tasks"); ui.setEditingTask(t.id); } } });
      break;
    }
    case "add-note": {
      const n = useNotes.getState().add({ body: a.text, title: a.title ?? "", source: a.source ?? null });
      if (!a.text.trim()) {
        ui.navigate("notes", n.id);
        if (isTauri) void ipc.showMain();
      } else toast({ title: "Note saved", body: a.text.slice(0, 60), kind: "success", action: { label: "Open", onClick: () => ui.navigate("notes", n.id) } });
      break;
    }
    case "open-task":
      ui.navigate("tasks");
      ui.setEditingTask(a.id);
      if (isTauri) void ipc.showMain();
      break;
    case "open-note":
      ui.navigate("notes", a.id);
      if (isTauri) void ipc.showMain();
      break;
    case "open-journal":
      ui.navigate("journal", a.id);
      if (isTauri) void ipc.showMain();
      break;
    case "add-journal": {
      const e = useJournal.getState().addEntry({ body: a.text, source: a.voice ? "voice" : "manual", audio: a.audio ? [a.audio] : [], context: a.source ?? null });
      if (!a.text.trim()) {
        ui.navigate("journal", e.id);
        if (isTauri) void ipc.showMain();
      } else toast({ title: "Journal entry saved", body: a.text.slice(0, 60), kind: "success", action: { label: "Open", onClick: () => ui.navigate("journal", e.id) } });
      break;
    }
    case "open-habit":
      ui.navigate("habits", a.id);
      if (isTauri) void ipc.showMain();
      break;
    case "open-clip":
      ui.navigate("clips", a.id);
      if (isTauri) void ipc.showMain();
      break;
    case "complete-task":
      useTasks.getState().complete(a.id);
      break;
    case "focus-task":
      await useFocus.getState().startForTask(a.id);
      break;
    case "habit-toggle":
      useHabits.getState().toggle(a.id);
      break;
    case "focus": {
      const f = useFocus.getState();
      if (a.op === "start") await f.start({ mode: "pomodoro" });
      else if (a.op === "deep") await f.start({ mode: "deep", workSecs: 90 * 60, targetWorkPhases: 1 });
      else if (a.op === "stopwatch") await f.start({ mode: "stopwatch", workSecs: 0, targetWorkPhases: 1, autoStartBreaks: false });
      else if (a.op === "toggle") await f.toggle();
      else if (a.op === "stop") await f.stop(false);
      else if (a.op === "skip") await f.skip();
      break;
    }
    case "media":
      await useMedia.getState().control(a.op);
      break;
    case "window":
      if (!isTauri) break;
      if (a.op === "bubble") await ipc.minimizeToBubble();
      else if (a.op === "pip") await ipc.togglePip();
      else if (a.op === "snap") await ipc.snap(a.arg ?? "center");
      else if (a.op === "next-monitor") await ipc.nextMonitor();
      else if (a.op === "show") await ipc.showMain();
      else if (a.op === "hide") await ipc.hideMain();
      break;
    case "capture-clip": {
      const clips = useClips.getState();
      let clip = clips.clips.find((c) => c.id === a.clip.id) ?? clips.addRaw(a.clip);
      const src = { app: clip.source.app, title: clip.source.title, exe: clip.source.exe };
      if (a.as === "note") {
        const body = clip.kind === "image" && clip.image ? `![clipboard image](dayflit-image://${clip.image})` : clip.text;
        const n = useNotes.getState().add({ body, source: src, images: clip.image ? [clip.image] : [] });
        clips.markConverted(clip.id, { type: "note", id: n.id });
        toast({ title: "Saved as note", body: `from ${clip.source.app}`, kind: "success", action: { label: "Open", onClick: () => ui.navigate("notes", n.id) } });
      } else {
        const title = clip.kind === "image" ? `Image from ${clip.source.app}` : clip.text.split("\n")[0].slice(0, 120);
        const t = useTasks.getState().add({ title, notes: clip.kind === "image" ? "" : clip.text.length > 120 ? clip.text : "", source: src, images: clip.image ? [clip.image] : [], links: clip.kind === "link" ? [clip.text.trim()] : [] });
        clips.markConverted(clip.id, { type: "task", id: t.id });
        toast({ title: "Saved as task", body: t.title, kind: "success", action: { label: "Open", onClick: () => { ui.navigate("tasks"); ui.setEditingTask(t.id); } } });
      }
      clip = clips.clips.find((c) => c.id === clip.id) ?? clip;
      break;
    }
    case "backup":
      if (isTauri) {
        try {
          const b = await ipc.backupNow(true, "manual");
          toast({ title: "Backup created", body: b.file, kind: "success" });
        } catch (e) {
          toast({ title: "Backup failed", body: String(e), kind: "error" });
        }
      }
      break;
    case "settings":
      ui.navigate("settings", a.section ?? null);
      if (isTauri) void ipc.showMain();
      break;
    case "quit":
      if (isTauri) await ipc.quit();
      break;
    case "voice":
      if (isTauri) await ipc.showVoice("toggle");
      break;
    case "export":
      await exportToMarkdown();
      break;
    case "availability": {
      const s = useSettings.getState().settings.calendar;
      const from = a.days === 1 ? addDays(new Date(), 1) : new Date();
      const days = nextDays(from, a.days).map((day) => {
        const events = useCalendar.getState().eventsBetween(startOfDay(day).getTime(), startOfDay(addDays(day, 1)).getTime());
        const tasks = useTasks.getState().tasks.filter((t) => t.status === "open" && t.due?.slice(0, 10) === dateKey(day));
        return { day, slots: freeSlots(day, events, tasks, s.workStartHour, s.workEndHour, s.slotMinutes) };
      });
      const text = formatSlots(days);
      if (isTauri) await ipc.clipboardWriteText(text);
      else await navigator.clipboard.writeText(text);
      toast({ title: "Availability copied", body: text.split("\n")[0], kind: "success" });
      break;
    }
    case "join-next-meeting": {
      const now = Date.now();
      const m = nextMeeting(useCalendar.getState().eventsBetween(now - 3_600_000, now + 12 * 3_600_000), now, 12 * 60);
      if (m?.meeting) await openExternal(m.meeting.url);
      else toast({ title: "No upcoming meeting with a link", kind: "info" });
      break;
    }
    case "open-event": {
      if (a.url) await openExternal(a.url);
      else ui.navigate("calendar");
      break;
    }
    case "update-check": {
      const { useUpdater } = await import("./updater");
      ui.navigate("settings", "updates");
      const u = await useUpdater.getState().check(false);
      if (!u && !useUpdater.getState().error) toast({ title: "You're up to date", kind: "success" });
      break;
    }
  }
}
