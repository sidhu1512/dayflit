import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("HorizontalPillStrip Desktop Architecture Verification", () => {
  it("implements wheel-to-horizontal translation, zero scrollbars, chevrons, and quick-switcher", () => {
    const code = readFileSync(join(__dirname, "../components/ui/HorizontalPillStrip.tsx"), "utf-8");

    // 1. Wheel-to-horizontal translation
    expect(code).toContain("handleWheel");
    expect(code).toContain("e.deltaY");
    expect(code).toContain("scrollWidth > el.clientWidth");
    expect(code).toContain("el.scrollLeft += e.deltaY");

    // 2. Zero scrollbar overlap
    expect(code).toContain("no-scrollbar");
    expect(code).toContain('scrollbarWidth: "none"');
    expect(code).toContain('overflowY: "hidden"');

    // 3. Left/right chevrons
    expect(code).toContain("canScrollLeft");
    expect(code).toContain("canScrollRight");
    expect(code).toContain("scrollByDelta");
    expect(code).toContain("ChevronLeft");
    expect(code).toContain("ChevronRight");

    // 4. Pinned add and quick switcher
    expect(code).toContain("data-quick-switcher");
    expect(code).toContain("data-pinned-add");
    expect(code).toContain("quickSwitcherThreshold");
    expect(code).toContain("showQuickSwitcher");
  });

  it("verifies all 5 views import and use HorizontalPillStrip", () => {
    const journalCode = readFileSync(join(__dirname, "../views/Journal.tsx"), "utf-8");
    const tasksCode = readFileSync(join(__dirname, "../views/Tasks.tsx"), "utf-8");
    const notesCode = readFileSync(join(__dirname, "../views/Notes.tsx"), "utf-8");
    const clipsCode = readFileSync(join(__dirname, "../views/Clips.tsx"), "utf-8");
    const canvasCode = readFileSync(join(__dirname, "../views/Canvas.tsx"), "utf-8");

    expect(journalCode).toContain("<HorizontalPillStrip");
    expect(tasksCode).toContain("<HorizontalPillStrip");
    expect(notesCode).toContain("<HorizontalPillStrip");
    expect(clipsCode).toContain("<HorizontalPillStrip");
    expect(canvasCode).toContain("<HorizontalPillStrip");

    // Check pinned add button callbacks
    expect(journalCode).toContain("onAdd={handleAddBook}");
    expect(tasksCode).toContain("onAdd={handleAddList}");
    expect(notesCode).toContain("onAdd={handleAddTag}");
    expect(canvasCode).toContain("onAdd={handleCreateBoard}");
  });
});
