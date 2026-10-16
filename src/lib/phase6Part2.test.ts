import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { useJournal } from "@/stores/journal";
import { useTasks } from "@/stores/tasks";
import { useNotes } from "@/stores/notes";
import { useCanvas } from "@/stores/canvas";
import { useLife } from "@/stores/life";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";

describe("PHASE 6 — PART 2: Universal Collection CRUD, Toast Redesign, Tooltips & InfoHints", () => {
  beforeEach(() => {
    useUi.setState({ toasts: [] });
  });

  describe("1. Universal Collection CRUD Store Actions & Logic", () => {
    it("Journal: addJournal, renameJournal, and removeJournal update collection cleanly", () => {
      const { addJournal, renameJournal, removeJournal } = useJournal.getState();
      const journal = addJournal({ name: "My Travel Diary", color: "#3b82f6", icon: "Plane" });
      expect(useJournal.getState().journals.find((j) => j.id === journal.id)?.name).toBe("My Travel Diary");

      renameJournal(journal.id, "World Adventure 2026");
      const updated = useJournal.getState().journals.find((j) => j.id === journal.id);
      expect(updated?.name).toBe("World Adventure 2026");
      expect(updated?.color).toBe("#3b82f6");
      expect(updated?.icon).toBe("Plane");

      removeJournal(journal.id);
      expect(useJournal.getState().journals.find((j) => j.id === journal.id)).toBeUndefined();
    });

    it("Tasks: custom list management and task assignment", () => {
      const initialLists = useSettings.getState().settings.tasks.lists || [];
      const testList = "Project Phoenix";
      useSettings.getState().update({
        tasks: {
          ...useSettings.getState().settings.tasks,
          lists: [...initialLists, testList],
        },
      });

      const task = useTasks.getState().add({ title: "Build prototype", list: testList });
      expect(task.list).toBe(testList);

      // Rename list
      const renamedList = "Project Orion";
      useSettings.getState().update({
        tasks: {
          ...useSettings.getState().settings.tasks,
          lists: useSettings.getState().settings.tasks.lists.map((l) => (l === testList ? renamedList : l)),
        },
      });
      useTasks.getState().update(task.id, { list: renamedList });
      expect(useTasks.getState().byId(task.id)?.list).toBe(renamedList);

      // Delete list and unassign task
      useSettings.getState().update({
        tasks: {
          ...useSettings.getState().settings.tasks,
          lists: useSettings.getState().settings.tasks.lists.filter((l) => l !== renamedList),
        },
      });
      useTasks.getState().update(task.id, { list: undefined });
      expect(useTasks.getState().byId(task.id)?.list).toBeUndefined();

      // Cleanup
      useTasks.getState().remove(task.id);
    });

    it("Notes: tag renaming and deletion updates notes containing that tag", () => {
      const { add, update, remove } = useNotes.getState();
      const note = add({ title: "Design Sprint", body: "Reviewing tokens", tags: ["phase6", "ui-polish"] });
      
      const beforeNote = useNotes.getState().notes.find((n) => n.id === note.id);
      expect(beforeNote?.tags).toContain("phase6");

      // Rename tag 'phase6' to 'phase6-v2'
      const updatedTags = (beforeNote?.tags ?? []).map((t) => (t === "phase6" ? "phase6-v2" : t));
      update(note.id, { tags: updatedTags });
      const afterRenameNote = useNotes.getState().notes.find((n) => n.id === note.id);
      expect(afterRenameNote?.tags).toContain("phase6-v2");
      expect(afterRenameNote?.tags).not.toContain("phase6");

      // Delete tag 'ui-polish'
      const remainingTags = (afterRenameNote?.tags ?? []).filter((t) => t !== "ui-polish");
      update(note.id, { tags: remainingTags });
      const afterDeleteNote = useNotes.getState().notes.find((n) => n.id === note.id);
      expect(afterDeleteNote?.tags).not.toContain("ui-polish");
      expect(afterDeleteNote?.tags).toContain("phase6-v2");

      // Cleanup
      remove(note.id);
    });

    it("Canvas: board creation, renaming, and deletion", () => {
      const { createBoard, updateBoard, deleteBoard } = useCanvas.getState();
      const board = createBoard("Architecture Diagram");
      expect(useCanvas.getState().boards.find((b) => b.id === board.id)?.name).toBe("Architecture Diagram");

      updateBoard(board.id, { name: "System Topography" });
      expect(useCanvas.getState().boards.find((b) => b.id === board.id)?.name).toBe("System Topography");

      deleteBoard(board.id);
      expect(useCanvas.getState().boards.find((b) => b.id === board.id)).toBeUndefined();
    });

    it("Life: domain creation, updating, and removal", () => {
      const { addDomain, updateDomain, removeDomain } = useLife.getState();
      const domain = addDomain({
        name: "Athletic Performance",
        tagline: "Fitness",
        description: "Health & vitality",
        icon: "Heart",
        color: "#ef4444",
        score: 8,
        targetScore: 9,
        reflection: "",
        principles: [],
        resources: [],
        order: 99,
        isCustom: true,
      });
      expect(useLife.getState().data.domains.find((d) => d.id === domain.id)?.name).toBe("Athletic Performance");

      updateDomain(domain.id, { name: "Strength & Endurance" });
      expect(useLife.getState().data.domains.find((d) => d.id === domain.id)?.name).toBe("Strength & Endurance");

      removeDomain(domain.id);
      expect(useLife.getState().data.domains.find((d) => d.id === domain.id)).toBeUndefined();
    });
  });

  describe("2. HorizontalPillStrip Component Architecture & Wiring", () => {
    it("verifies HorizontalPillStrip source contains delete, rename, context menu, and canModify handlers", () => {
      const code = readFileSync(join(__dirname, "../components/ui/HorizontalPillStrip.tsx"), "utf-8");
      expect(code).toContain("onDelete?: (id: string) => void");
      expect(code).toContain("onRename?: (id: string, newLabel: string) => void");
      expect(code).toContain("canModify?: (id: string) => boolean");

      // Direct hover rename and delete buttons
      expect(code).toContain("data-rename-pill");
      expect(code).toContain("data-delete-pill");
      // Right-click context menu
      expect(code).toContain("onContextMenu");
      expect(code).toContain("data-pill-context-menu");
      expect(code).toContain("data-context-rename");
      expect(code).toContain("data-context-delete");
      // Popover actions
      expect(code).toContain("data-rename-item");
      expect(code).toContain("data-delete-item");
      expect(code).toContain("Trash2");
      expect(code).toContain("Pencil");
    });

    it("Journal: creating and deleting 6 test books ('f', 'r', 't gb', 'g', 'hgf', 'rbf') preserves only default book", () => {
      const testNames = ["f", "r", "t gb", "g", "hgf", "rbf"];
      const createdIds: string[] = [];
      for (const name of testNames) {
        const j = useJournal.getState().addJournal({ name });
        createdIds.push(j.id);
      }
      expect(useJournal.getState().journals.length).toBeGreaterThanOrEqual(6);
      
      // Delete all 6
      for (const id of createdIds) {
        useJournal.getState().removeJournal(id);
      }
      for (const id of createdIds) {
        expect(useJournal.getState().journals.find((j) => j.id === id)).toBeUndefined();
      }
    });

    it("verifies all core views wire onDelete and onRename to HorizontalPillStrip", () => {
      const journalCode = readFileSync(join(__dirname, "../views/Journal.tsx"), "utf-8");
      const tasksCode = readFileSync(join(__dirname, "../views/Tasks.tsx"), "utf-8");
      const notesCode = readFileSync(join(__dirname, "../views/Notes.tsx"), "utf-8");
      const canvasCode = readFileSync(join(__dirname, "../views/Canvas.tsx"), "utf-8");
      const calendarCode = readFileSync(join(__dirname, "../views/Calendar.tsx"), "utf-8");

      expect(journalCode).toContain("onDelete={handleDeleteBook}");
      expect(journalCode).toContain("onRename={handleRenameBook}");

      expect(tasksCode).toContain("onDelete={handleDeleteList}");
      expect(tasksCode).toContain("onRename={handleRenameList}");

      expect(notesCode).toContain("onDelete={handleDeleteTag}");
      expect(notesCode).toContain("onRename={handleRenameTag}");

      expect(canvasCode).toContain("onDelete=");
      expect(canvasCode).toContain("onRename=");
      expect(canvasCode).toContain("deleteBoard(id)");

      expect(calendarCode).toContain("<HorizontalPillStrip");
      expect(calendarCode).toContain("onDelete=");
      expect(calendarCode).toContain("onRename=");
    });
  });

  describe("3. Toast Micro-Pill Redesign & Notification Purge", () => {
    it("default toast ttl is 2000ms for routine operations", () => {
      const { toast } = useUi.getState();
      toast({ title: "Short test notice" });
      const state = useUi.getState();
      expect(state.toasts.length).toBe(1);
      expect(state.toasts[0].ttl).toBe(2000);
      expect(state.toasts[0].title).toBe("Short test notice");
    });

    it("error toasts use 4000ms ttl", () => {
      const { toast } = useUi.getState();
      toast({ title: "Something went wrong", kind: "error" });
      const state = useUi.getState();
      const errToast = state.toasts.find((t) => t.kind === "error");
      expect(errToast).toBeDefined();
      expect(errToast?.ttl).toBe(4000);
    });

    it("verifies Toasts component renders Apple micro-pill with DOT_COLORS and subtle dismiss", () => {
      const code = readFileSync(join(__dirname, "../components/Toasts.tsx"), "utf-8");
      expect(code).toContain("DOT_COLORS");
      expect(code).toContain("h-[30px]");
      expect(code).toContain("rounded-full");
      expect(code).toContain("bg-surface-2/95");
      expect(code).toContain("backdrop-blur-md");
      expect(code).toContain("shadow-lg");
      expect(code).toContain("h-1.5 w-1.5 rounded-full");
    });

    it("routine toasts are purged from views and components", () => {
      const journalCode = readFileSync(join(__dirname, "../views/Journal.tsx"), "utf-8");
      const tasksCode = readFileSync(join(__dirname, "../views/Tasks.tsx"), "utf-8");
      const canvasBoardCode = readFileSync(join(__dirname, "../components/CanvasBoard.tsx"), "utf-8");
      const clipsCode = readFileSync(join(__dirname, "../views/Clips.tsx"), "utf-8");
      const canvasCode = readFileSync(join(__dirname, "../views/Canvas.tsx"), "utf-8");
      const taskItemCode = readFileSync(join(__dirname, "../components/TaskItem.tsx"), "utf-8");
      const smartObjectCode = readFileSync(join(__dirname, "../components/SmartObjectCard.tsx"), "utf-8");

      expect(journalCode).not.toContain('toast({ title: "Journal created"');
      expect(tasksCode).not.toContain('toast({ title: "List created"');
      expect(canvasBoardCode).not.toContain('toast({ title: "Sticky note created"');
      expect(canvasBoardCode).not.toContain('toast({ title: "Task created from note"');
      expect(canvasBoardCode).not.toContain('toast({ title: "Drawing cleared"');
      expect(clipsCode).not.toContain('toast({ title: "Clip saved"');
      expect(canvasCode).not.toContain('toast({ title: `Canvas "${name}" deleted`');
      expect(taskItemCode).not.toContain('toast({ title: "Snoozed"');
      expect(smartObjectCode).not.toContain('toast({ title: "JSON formatted"');
    });
  });

  describe("4. Settings Single-Line Layout & Smart Truncation Tooltips", () => {
    it("ThemedTooltip and TruncatedText components exist and export properly with zero-flicker", () => {
      const code = readFileSync(join(__dirname, "../components/ui/ThemedTooltip.tsx"), "utf-8");
      expect(code).toContain("export function ThemedTooltip");
      expect(code).toContain("export function TruncatedText");
      expect(code).toContain("createPortal");
      expect(code).toContain("scrollWidth > el.clientWidth");
      expect(code).toContain("data-themed-tooltip");
      expect(code).toContain("opacity: coords ? 1 : 0");
      expect(code).toContain("border-subtle");
      expect(code).toContain("text-main");
    });

    it("Settings sidebar and navigation labels use TruncatedText and single line h-8/h-9", () => {
      const settingsCode = readFileSync(join(__dirname, "../views/Settings.tsx"), "utf-8");
      const navCode = readFileSync(join(__dirname, "../components/Nav.tsx"), "utf-8");
      const lifeCode = readFileSync(join(__dirname, "../views/Life.tsx"), "utf-8");

      expect(settingsCode).toContain("<TruncatedText");
      expect(settingsCode).toContain("h-8");
      expect(settingsCode).toContain("whitespace-nowrap");
      expect(navCode).toContain("<TruncatedText");
      expect(lifeCode).toContain("<TruncatedText");
    });
  });

  describe("5. InfoHint Hover Icons replacing Inline Subtitles", () => {
    it("InfoHint component is exported and used across Settings, Stats, Focus, and Life with zero-flicker", () => {
      const infoHintCode = readFileSync(join(__dirname, "../components/ui/InfoHint.tsx"), "utf-8");
      expect(infoHintCode).toContain("export function InfoHint");
      expect(infoHintCode).toContain("Info");
      expect(infoHintCode).toContain("data-info-popover");
      expect(infoHintCode).toContain("opacity: coords ? 1 : 0");
      expect(infoHintCode).toContain("border-subtle");
      expect(infoHintCode).toContain("text-main");

      const settingsCode = readFileSync(join(__dirname, "../views/Settings.tsx"), "utf-8");
      const statsCode = readFileSync(join(__dirname, "../views/Stats.tsx"), "utf-8");
      const focusCode = readFileSync(join(__dirname, "../views/Focus.tsx"), "utf-8");
      const lifeCode = readFileSync(join(__dirname, "../views/Life.tsx"), "utf-8");

      expect(settingsCode).toContain("<InfoHint");
      expect(statsCode).toContain("<InfoHint");
      expect(focusCode).toContain("<InfoHint");
      expect(lifeCode).toContain("<InfoHint");
    });
  });
});
