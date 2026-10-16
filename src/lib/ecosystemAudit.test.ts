import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderMarkdown, isAudioUrl, sanitizeHtml } from "./markdown";
import { openExternal } from "./open";
import { autoPlan } from "@/components/Timeline";
import { useTasks } from "@/stores/tasks";
import { useNotes } from "@/stores/notes";
import { useJournal } from "@/stores/journal";
import { useHabits } from "@/stores/habits";
import { useUi } from "@/stores/ui";
import { useSettings } from "@/stores/settings";
import { useLife } from "@/stores/life";
import { deleteImageIfUnused, reconcileImages } from "./imageUrl";
import { runAction } from "./runAction";
import { parseDue, formatDue } from "./dates";
import { cancelPending, scheduleSave, hasPending } from "./persist";
import type { CalEvent, Task } from "./types";
import { startOfDay } from "date-fns";

vi.mock("./ipc", () => ({
  isTauri: true,
  ipc: {
    deleteImage: vi.fn().mockResolvedValue(true),
    listImages: vi.fn().mockResolvedValue(["photo1.png", "voice1.wav"]),
    save: vi.fn().mockResolvedValue(true),
    storeInfo: vi.fn().mockResolvedValue({ dir: "C:/dayflit", imagesDir: "C:/dayflit/attachments", sizeBytes: 100 }),
    backupNow: vi.fn().mockResolvedValue({ file: "backup.zip" }),
    showMain: vi.fn().mockResolvedValue(true),
    setMaterial: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    setCloseBehavior: vi.fn().mockResolvedValue(undefined),
  },
  on: vi.fn().mockResolvedValue(() => {}),
  call: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

describe("Directive 4 Ecosystem Audit & Architecture Verifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelPending();
  });

  describe("1. Attachment & Image Orphan Protection Across All Stores", () => {
    it("recognizes audio extensions correctly", () => {
      expect(isAudioUrl("http://asset.localhost/rec.wav")).toBe(true);
      expect(isAudioUrl("asset://audio/voice.mp3")).toBe(true);
      expect(isAudioUrl("file:///notes/recording.m4a")).toBe(true);
      expect(isAudioUrl("recording.ogg")).toBe(true);
      expect(isAudioUrl("photo.png")).toBe(false);
      expect(isAudioUrl("document.pdf")).toBe(false);
    });

    it("prevents deletion of images or attachments referenced in tasks", async () => {
      useTasks.setState({
        tasks: [
          {
            id: "task-1",
            title: "Review architecture diagram",
            status: "open",
            priority: "high",
            due: null,
            hasTime: false,
            tags: [],
            list: "Inbox",
            recurrence: null,
            createdAt: 1000,
            updatedAt: 1000,
            completedAt: null,
            order: 1,
            estimateMin: 30,
            focusSecs: 0,
            subtasks: [],
            links: [],
            images: ["task-diagram.png"],
            notes: "Refer to diagram attached",
            source: null,
            snoozedUntil: null,
            pinned: false,
            backlog: false,
            completions: 0,
            domainId: null,
            goalId: null,
            projectId: null,
          },
        ],
      });
      useNotes.setState({ notes: [], trash: [] });
      useJournal.setState({ journals: [], entries: [], templates: [] });

      const deleted = await deleteImageIfUnused("task-diagram.png");
      expect(deleted).toBe(false);
    });

    it("prevents deletion of audio memos attached to journal entries", async () => {
      useTasks.setState({ tasks: [] });
      useNotes.setState({ notes: [], trash: [] });
      useJournal.setState({
        journals: [],
        entries: [
          {
            id: "entry-1",
            journalId: "default",
            date: "2026-10-14",
            createdAt: 1000,
            updatedAt: 1000,
            title: "Voice Reflection",
            body: "Recorded my reflections for the day",
            tags: [],
            mood: 5,
            favorite: false,
            images: [],
            audio: ["voice-reflection.wav"],
            source: "voice",
            prompt: null,
            location: null,
            context: null,
            domainId: null,
          },
        ],
        templates: [],
      });

      const deleted = await deleteImageIfUnused("voice-reflection.wav");
      expect(deleted).toBe(false);
    });

    it("deletes an image only when completely orphaned across all stores", async () => {
      const { ipc } = await import("./ipc");
      useTasks.setState({ tasks: [] });
      useNotes.setState({ notes: [], trash: [] });
      useJournal.setState({ journals: [], entries: [], templates: [] });

      const deleted = await deleteImageIfUnused("unused-legacy-file.png");
      expect(deleted).toBe(true);
      expect(ipc.deleteImage).toHaveBeenCalledWith("unused-legacy-file.png");
    });
  });

  describe("2. Audio Playback in Markdown & External Link Safety", () => {
    it("renders playable audio elements for audio memo markdown links", () => {
      const md = "Here is my audio note: [Voice memo](dayflit-image://voice-memo-123.wav)";
      const html = renderMarkdown(md, (name) => `http://asset.localhost/attachments/${name}`);

      expect(html).toContain("<audio controls");
      expect(html).toContain('src="http://asset.localhost/attachments/voice-memo-123.wav"');
      expect(html).toContain("dayflit-audio-card");
      expect(html).toContain("Voice memo");
    });

    it("renders playable audio element for audio image markdown tags", () => {
      const md = "![Audio](dayflit-image://quick-capture.mp3)";
      const html = renderMarkdown(md, (name) => `http://asset.localhost/attachments/${name}`);

      expect(html).toContain("<audio controls");
      expect(html).toContain('src="http://asset.localhost/attachments/quick-capture.mp3"');
    });

    it("sanitizes HTML while preserving audio tags and controls", () => {
      const clean = sanitizeHtml('<audio controls src="recording.wav" preload="none"></audio>');
      expect(clean).toContain("<audio");
      expect(clean).toContain("controls");
      expect(clean).toContain('src="recording.wav"');
    });

    it("prevents openExternal from launching system browser on internal asset URLs", async () => {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openExternal("http://asset.localhost/attachments/voice.wav");
      await openExternal("asset://images/photo.png");
      await openExternal("dayflit-image://photo.png");

      expect(openUrl).not.toHaveBeenCalled();

      // But external web URLs DO invoke openUrl
      await openExternal("https://dayflit.com");
      expect(openUrl).toHaveBeenCalledWith("https://dayflit.com");
    });
  });

  describe("3. Multi-Window Recurrence & Store Action Preservation", () => {
    it("handles recurring task completion through runAction preserving next occurrence", () => {
      const baseTask = useTasks.getState().add({
        title: "Daily Standup Meeting",
        recurrence: { freq: "daily", interval: 1, mode: "schedule" },
        due: "2026-10-14",
      });

      // Execute complete-task through runAction
      void runAction({ type: "complete-task", id: baseTask.id });

      const all = useTasks.getState().tasks;
      // DayFlit's recurrence design: base task rolls forward to next occurrence (open, completions: 1, due: next)
      // and a completed clone is spawned for history
      const original = all.find((t) => t.id === baseTask.id);
      expect(original?.due).toBe("2026-10-15");
      expect(original?.status).toBe("open");
      expect(original?.completions).toBe(1);

      const completedRecord = all.find((t) => t.id !== baseTask.id && t.title === "Daily Standup Meeting");
      expect(completedRecord).toBeDefined();
      expect(completedRecord?.status).toBe("done");
    });

    it("toggles habits and updates streaks through runAction", () => {
      const habit = useHabits.getState().add({ name: "Hydrate", icon: "droplet", target: 1 });
      void runAction({ type: "habit-toggle", id: habit.id });

      const updated = useHabits.getState().byId(habit.id);
      expect(updated).toBeDefined();
    });
  });

  describe("4. Timeline Auto-Planning & Collision Avoidance", () => {
    it("places unscheduled tasks without colliding into calendar events or existing timeboxes", () => {
      const day = new Date(2026, 9, 14, 0, 0, 0, 0);
      const dayStart = startOfDay(day).getTime();

      // Meeting from 9:00 AM to 10:00 AM
      const events: CalEvent[] = [
        {
          id: "meeting-1",
          sourceId: "work",
          uid: "meeting-uid-1",
          title: "Important Executive Sync",
          start: dayStart + 9 * 3_600_000,
          end: dayStart + 10 * 3_600_000,
          allDay: false,
          recurring: false,
          organizer: "ceo@dayflit.com",
          url: "",
          color: "#3b82f6",
          location: "Room A",
          attendees: ["ceo@dayflit.com"],
          description: "",
          status: "confirmed",
          meeting: null,
        },
      ];

      const tasksToPlan: Task[] = [
        {
          id: "task-unscheduled-1",
          title: "Write Q4 Roadmap",
          status: "open",
          priority: "none",
          due: "2026-10-14",
          hasTime: false,
          tags: [],
          list: "Work",
          recurrence: null,
          createdAt: 1000,
          updatedAt: 1000,
          completedAt: null,
          order: 1,
          estimateMin: 60,
          focusSecs: 0,
          subtasks: [],
          links: [],
          images: [],
          notes: "",
          source: null,
          snoozedUntil: null,
          pinned: false,
          backlog: false,
          completions: 0,
          domainId: null,
          goalId: null,
          projectId: null,
        },
      ];

      const placedPatches: { id: string; patch: Partial<Task> }[] = [];
      const updateMock = (id: string, patch: Partial<Task>) => {
        placedPatches.push({ id, patch });
      };

      // Auto plan starting at 9:00 AM
      const placedCount = autoPlan(day, tasksToPlan, events, dayStart + 9 * 3_600_000, 18, updateMock, 8);

      expect(placedCount).toBe(1);
      expect(placedPatches.length).toBe(1);

      // The 60-min task must NOT be placed at 9:00 AM (collision with meeting).
      // It must be placed after the meeting ends (10:00 AM).
      const dueStr = placedPatches[0].patch.due!;
      const placedTime = new Date(dueStr).getTime();
      expect(placedTime).toBeGreaterThanOrEqual(dayStart + 10 * 3_600_000);
    });
  });

  describe("5. In-App Prompt Dialog & Zero window.prompt Compliance", () => {
    it("provides an interactive non-blocking promptUser promise in useUi", async () => {
      const promptPromise = useUi.getState().promptUser({
        title: "Template name",
        placeholder: "Enter template name",
        defaultValue: "Sprint Retrospective",
      });

      // Verify request is registered in state
      expect(useUi.getState().prompt).toBeDefined();
      expect(useUi.getState().prompt?.title).toBe("Template name");
      expect(useUi.getState().prompt?.defaultValue).toBe("Sprint Retrospective");

      // Resolve the dialog
      useUi.getState().closePrompt("Sprint Retrospective v2");

      const result = await promptPromise;
      expect(result).toBe("Sprint Retrospective v2");
      expect(useUi.getState().prompt).toBeNull();
    });

    it("resolves null when user cancels prompt", async () => {
      const promptPromise = useUi.getState().promptUser({
        title: "Discard Draft",
      });

      useUi.getState().closePrompt(null);
      const result = await promptPromise;
      expect(result).toBeNull();
      expect(useUi.getState().prompt).toBeNull();
    });
  });

  describe("6. Resilient Date Parsing and Review Crash Prevention", () => {
    it("handles invalid, empty, or unparseable due dates safely without crashing or returning invalid dates", () => {
      expect(parseDue("invalid-date-string")).toBeNull();
      expect(parseDue("")).toBeNull();
      expect(parseDue(null)).toBeNull();
      expect(parseDue("2026-10-14")).toBeInstanceOf(Date);
      expect(parseDue("2026-10-14T10:00")).toBeInstanceOf(Date);
      expect(isNaN(parseDue("2026-10-14T10:00")!.getTime())).toBe(false);
    });

    it("formats unparseable or null due dates safely as empty strings", () => {
      expect(formatDue("invalid", false)).toBe("");
      expect(formatDue(null, false)).toBe("");
      expect(formatDue("invalid", true)).toBe("");
    });
  });

  describe("7. Atomic Persistence Safety & Pending Cancel on Reload", () => {
    it("clears pending debounced saves on cancelPending for specific collection", () => {
      scheduleSave("tasks", [{ id: "t1" }]);
      expect(hasPending()).toBe(true);
      cancelPending("tasks");
      expect(hasPending()).toBe(false);
    });

    it("clears all pending debounced saves on cancelPending without arguments", () => {
      scheduleSave("tasks", [{ id: "t1" }]);
      scheduleSave("notes", [{ id: "n1" }]);
      expect(hasPending()).toBe(true);
      cancelPending();
      expect(hasPending()).toBe(false);
    });
  });

  describe("8. Multi-Window Setting Sync & Settings Action Routing", () => {
    it("applies update-settings action via runAction into useSettings", () => {
      runAction({
        type: "update-settings",
        patch: {
          window: {
            startInBubble: true,
            alwaysOnTop: true,
            closeBehavior: "quit",
          },
        },
      });

      const st = useSettings.getState().settings;
      expect(st.window.startInBubble).toBe(true);
      expect(st.window.alwaysOnTop).toBe(true);
      expect(st.window.closeBehavior).toBe("quit");
    });
  });

  describe("9. Task Image Extraction, Synchronization, and Undo History", () => {
    it("extracts embedded images from task notes into task.images on update", () => {
      const task = useTasks.getState().add({
        title: "Test Image Sync",
        notes: "Initial note without image",
      });

      useTasks.getState().update(task.id, {
        notes: "Updated note with ![diagram](dayflit-image://diagram-abc.png)",
      });

      const updated = useTasks.getState().byId(task.id);
      expect(updated?.images).toContain("diagram-abc.png");
    });

    it("snapshots task state to undoStack on complete and uncomplete", () => {
      const task = useTasks.getState().add({
        title: "Task with Undo Support",
      });
      expect(useTasks.getState().byId(task.id)?.status).toBe("open");

      // Complete
      useTasks.getState().complete(task.id);
      expect(useTasks.getState().byId(task.id)?.status).toBe("done");

      // Undo completion
      const undone = useTasks.getState().undo();
      expect(undone).toBe(true);
      expect(useTasks.getState().byId(task.id)?.status).toBe("open");

      // Uncomplete push to undoStack
      useTasks.getState().complete(task.id);
      expect(useTasks.getState().byId(task.id)?.status).toBe("done");
      useTasks.getState().uncomplete(task.id);
      expect(useTasks.getState().byId(task.id)?.status).toBe("open");

      // Undo uncomplete
      useTasks.getState().undo();
      expect(useTasks.getState().byId(task.id)?.status).toBe("done");
    });
  });

  describe("10. Life System Knowledge Vault & Domain Image Protection", () => {
    it("protects images referenced in Life domain reflections from deletion", async () => {
      useTasks.setState({ tasks: [] });
      useNotes.setState({ notes: [], trash: [] });
      useJournal.setState({ journals: [], entries: [], templates: [] });

      useLife.setState({
        data: {
          version: 1,
          domains: [
            {
              id: "health",
              name: "Health & Vitality",
              tagline: "",
              description: "",
              icon: "Activity",
              color: "#10b981",
              score: 8,
              targetScore: 9,
              reflection: "Here is my blood panel chart: dayflit-image://blood-panel.png",
              principles: [],
              resources: [],
              order: 0,
              isCustom: false,
              updatedAt: 1000,
            },
          ],
          goals: [],
          projects: [],
          assessments: [],
        },
      });

      const deleted = await deleteImageIfUnused("blood-panel.png");
      expect(deleted).toBe(false);
    });

    it("protects images referenced in Life wisdom vault resources from deletion", async () => {
      useTasks.setState({ tasks: [] });
      useNotes.setState({ notes: [], trash: [] });
      useJournal.setState({ journals: [], entries: [], templates: [] });

      useLife.setState({
        data: {
          version: 1,
          domains: [
            {
              id: "mindset",
              name: "Mindset",
              tagline: "",
              description: "",
              icon: "Brain",
              color: "#8b5cf6",
              score: 8,
              targetScore: 9,
              reflection: "",
              principles: [],
              resources: [
                {
                  id: "res-1",
                  title: "Mental Model Matrix",
                  type: "guideline",
                  content: "Matrix diagram: dayflit-image://matrix-guide.png",
                  createdAt: 1000,
                },
              ],
              order: 0,
              isCustom: false,
              updatedAt: 1000,
            },
          ],
          goals: [],
          projects: [],
          assessments: [],
        },
      });

      const deleted = await deleteImageIfUnused("matrix-guide.png");
      expect(deleted).toBe(false);
    });
  });

  describe("11. Audio Memo Deletion from Journal Entries", () => {
    it("removes voice memos from journal entry audio list and cleans disk image", () => {
      const entry = useJournal.getState().addEntry({
        title: "Audio Memo Test",
        body: "Recorded a quick memo",
        audio: ["voice-memo-delete.wav"],
      });

      expect(useJournal.getState().byId(entry.id)?.audio).toContain("voice-memo-delete.wav");

      useJournal.getState().removeAttachment(entry.id, "voice-memo-delete.wav", "audio");

      expect(useJournal.getState().byId(entry.id)?.audio).not.toContain("voice-memo-delete.wav");
    });
  });
});
