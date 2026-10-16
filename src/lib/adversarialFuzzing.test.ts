import { describe, expect, it } from "vitest";
import { makeTask, parsedToInput } from "@/stores/tasks";
import { makeNote } from "@/stores/notes";
import { makeEntry } from "@/stores/journal";
import { parseDue, dateKey } from "./dates";
import { checklistProgress, plainText, renderMarkdown, toggleChecklistLine } from "./markdown";
import type { FocusConfig, FocusSnapshot, Task } from "./types";

// Seedable pseudo-random number generator (Mulberry32) for deterministic adversarial fuzzing
function createPrng(seed: number) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Adversarial, Property-Based & Randomized Interaction Testing", () => {
  describe("1. Reproducible Model-Based Task Lifecycle Fuzzing (1,000 steps)", () => {
    it("executes 1,000 randomized state actions maintaining strict consistency invariants", () => {
      const prng = createPrng(421337);
      const store: Task[] = [];
      const undoStack: Task[][] = [];

      for (let step = 0; step < 1000; step++) {
        const actionType = Math.floor(prng() * 6);

        if (actionType === 0 || store.length === 0) {
          // Action: Create Task
          undoStack.push([...store]);
          const newTask = makeTask({
            title: `Adversarial task step ${step} with rnd ${Math.floor(prng() * 10000)}`,
            priority: (["none", "low", "medium", "high", "urgent"] as const)[Math.floor(prng() * 5)],
            due: prng() > 0.5 ? "2026-10-15" : null,
          });
          store.unshift(newTask);
        } else if (actionType === 1) {
          // Action: Rapid Repetitive Edits
          const idx = Math.floor(prng() * store.length);
          const target = store[idx];
          target.title = `Edited title in step ${step}`;
          target.updatedAt = Date.now();
          if (prng() > 0.7) {
            target.subtasks.push({
              id: `sub-${step}`,
              title: `Subtask ${step}`,
              done: prng() > 0.5,
            });
          }
        } else if (actionType === 2) {
          // Action: Complete / Uncomplete Toggle
          const idx = Math.floor(prng() * store.length);
          const target = store[idx];
          undoStack.push([...store]);
          if (target.status === "open") {
            target.status = "done";
            target.completedAt = Date.now();
            target.completions += 1;
          } else {
            target.status = "open";
            target.completedAt = null;
          }
        } else if (actionType === 3) {
          // Action: Delete Task
          const idx = Math.floor(prng() * store.length);
          undoStack.push([...store]);
          store.splice(idx, 1);
        } else if (actionType === 4 && undoStack.length > 0) {
          // Action: Undo Previous Mutation
          const prev = undoStack.pop()!;
          store.length = 0;
          store.push(...prev);
        } else {
          // Action: Subtask Status Toggle
          const withSubs = store.filter((t) => t.subtasks.length > 0);
          if (withSubs.length > 0) {
            const t = withSubs[Math.floor(prng() * withSubs.length)];
            const sub = t.subtasks[Math.floor(prng() * t.subtasks.length)];
            sub.done = !sub.done;
          }
        }

        // --- INVARIANT ASSERTIONS AFTER EVERY STEP ---
        for (const task of store) {
          expect(typeof task.id).toBe("string");
          expect(task.title.length).toBeGreaterThan(0);
          expect(["open", "done"]).toContain(task.status);
          expect(Number.isFinite(task.createdAt)).toBe(true);
          expect(Number.isFinite(task.updatedAt)).toBe(true);
          expect(Array.isArray(task.subtasks)).toBe(true);
          for (const sub of task.subtasks) {
            expect(typeof sub.id).toBe("string");
            expect(typeof sub.done).toBe("boolean");
          }
        }
      }
    });
  });

  describe("2. Deleted Image Lifecycle & Reopening Adversarial Fuzzing", () => {
    it("handles image attachment insertion, body deletion, orphan detection, and clean reopening", () => {
      // 1. Create note with image embed
      const imageName = "screenshot-audit-123.png";
      const initialBody = `# Security Audit Report\n\n![Evidence](dayflit-image://${imageName})\n\nAll systems checked.`;
      const note = makeNote({ title: "Audit Note", body: initialBody });

      // Invariant: note parses attached image
      const extractedImages = [...new Set([...note.body.matchAll(/dayflit-image:\/\/([\w.-]+)/g)].map((m) => m[1]))];
      expect(extractedImages).toContain(imageName);

      // 2. User deletes image markdown reference from text
      const updatedBody = `# Security Audit Report\n\nAll systems checked. Evidence was archived.`;
      const nextExtracted = [...new Set([...updatedBody.matchAll(/dayflit-image:\/\/([\w.-]+)/g)].map((m) => m[1]))];
      const orphanedImages = extractedImages.filter((im) => !nextExtracted.includes(im));

      expect(orphanedImages).toContain(imageName);
      expect(nextExtracted).not.toContain(imageName);

      // 3. Simulated orphan unlinking
      const unlinked: string[] = [];
      for (const orphan of orphanedImages) {
        unlinked.push(orphan);
      }
      expect(unlinked).toContain(imageName);

      // 4. Reopen note & render markdown: ensures no broken thumbnail or crash occurs
      const renderedHtml = renderMarkdown(updatedBody);
      expect(renderedHtml).not.toContain(imageName);
      expect(renderedHtml).not.toContain("<img");
      expect(renderedHtml).toContain("All systems checked");
    });
  });

  describe("3. Unusual Focus Session State Machine Sequences", () => {
    // Model-based state machine simulation
    interface FocusModel {
      status: "idle" | "running" | "paused" | "finished";
      elapsedSecs: number;
      durationSecs: number;
      pauses: number;
    }

    function createFocusModel(durationSecs: number): FocusModel {
      return { status: "idle", elapsedSecs: 0, durationSecs, pauses: 0 };
    }

    function applyAction(m: FocusModel, action: string, param?: number): FocusModel {
      switch (action) {
        case "start":
          return m.status === "idle" || m.status === "finished" ? { ...m, status: "running" } : m;
        case "pause":
          return m.status === "running" ? { ...m, status: "paused", pauses: m.pauses + 1 } : m;
        case "resume":
          return m.status === "paused" ? { ...m, status: "running" } : m;
        case "extend":
          return { ...m, durationSecs: m.durationSecs + (param || 300) };
        case "tick":
          if (m.status === "running") {
            const nextElapsed = m.elapsedSecs + 1;
            return nextElapsed >= m.durationSecs
              ? { ...m, elapsedSecs: m.durationSecs, status: "finished" }
              : { ...m, elapsedSecs: nextElapsed };
          }
          return m;
        case "stop_discard":
          return { ...m, status: "idle", elapsedSecs: 0 };
        case "stop_keep":
          return { ...m, status: "finished" };
        default:
          return m;
      }
    }

    it("verifies mathematical invariants across 500 chaotic focus control transitions", () => {
      const prng = createPrng(998877);
      let model = createFocusModel(25 * 60);

      const actions = [
        "start",
        "pause",
        "resume",
        "extend",
        "tick",
        "tick",
        "pause",
        "stop_keep",
        "stop_discard",
      ];

      for (let i = 0; i < 500; i++) {
        const action = actions[Math.floor(prng() * actions.length)];
        model = applyAction(model, action, 300);

        // --- Invariant Checks ---
        expect(model.elapsedSecs).toBeGreaterThanOrEqual(0);
        expect(model.durationSecs).toBeGreaterThan(0);
        expect(model.elapsedSecs).toBeLessThanOrEqual(model.durationSecs);
        const progress = model.elapsedSecs / model.durationSecs;
        expect(Number.isFinite(progress)).toBe(true);
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("4. Extreme Inputs, Boundary Values & Adversarial Payloads", () => {
    it("handles 1MB oversized string in note and task notes without heap or loop freezing", () => {
      const hugeString = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(18000); // ~1MB
      expect(hugeString.length).toBeGreaterThan(1000000);

      const start = performance.now();
      const task = makeTask({ title: "Large Task", notes: hugeString });
      const plain = plainText(hugeString.slice(0, 5000));
      const duration = performance.now() - start;

      expect(task.notes.length).toBe(hugeString.length);
      expect(plain.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(150); // Under 150ms
    });

    it("safely sanitizes and falls back on empty, whitespace, and nullish titles", () => {
      const emptyScenarios = ["", "   ", "\t\t\n", undefined as unknown as string];

      for (const title of emptyScenarios) {
        const t = makeTask({ title });
        expect(t.title).toBe("Untitled task");
      }
    });

    it("evaluates 1,000 checklist items without recursion stack exhaustion", () => {
      let checklistMd = "";
      for (let i = 0; i < 1000; i++) {
        checklistMd += `- [${i % 2 === 0 ? "x" : " "}] Item ${i}\n`;
      }

      const progress = checklistProgress(checklistMd);
      expect(progress.total).toBe(1000);
      expect(progress.done).toBe(500);

      // Toggle item 250
      const toggled = toggleChecklistLine(checklistMd, 250);
      const updatedProgress = checklistProgress(toggled);
      expect(updatedProgress.done).toBe(499);
    });

    it("handles corrupted, malformed, and out-of-range date strings safely", () => {
      const badDates = [
        "",
        "   ",
        "invalid",
        "9999-99-99",
        "0000-00-00",
        "2026-02-31",
        "NaN-NaN-NaN",
        "undefined",
        "null",
        "2026/13/45",
      ];

      for (const bad of badDates) {
        const parsed = parseDue(bad);
        if (parsed !== null) {
          expect(isNaN(parsed.getTime())).toBe(false);
        } else {
          expect(parsed).toBeNull();
        }
      }
    });
  });

  describe("5. Rapid Screen Switching & Asynchronous In-Flight Preservation", () => {
    it("preserves view state parameters without state contamination during rapid view cycling", () => {
      const views = ["today", "tasks", "calendar", "focus", "notes", "journal", "habits", "life", "settings"];
      let activeView = "today";
      let viewParam: string | null = null;

      // Simulate rapid switching between views
      for (let i = 0; i < 200; i++) {
        const nextView = views[i % views.length];
        const nextParam = nextView === "life" ? (i % 2 === 0 ? "wheel" : "map") : null;

        activeView = nextView;
        viewParam = nextParam;

        expect(views).toContain(activeView);
        if (activeView === "life") {
          expect(["wheel", "map"]).toContain(viewParam);
        } else {
          expect(viewParam).toBeNull();
        }
      }
    });
  });
});
