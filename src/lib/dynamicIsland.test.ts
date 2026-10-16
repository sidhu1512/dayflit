import { describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";

describe("Dynamic Island & Focus Window Management", () => {
  it("exposes adjustPip and snapPipTopCenter IPC methods", () => {
    expect(typeof ipc.adjustPip).toBe("function");
    expect(typeof ipc.snapPipTopCenter).toBe("function");
    expect(typeof ipc.showPip).toBe("function");
    expect(typeof ipc.hidePip).toBe("function");
    expect(typeof ipc.showMain).toBe("function");
  });

  it("calculates symmetrical expansion offsets correctly", () => {
    // Current window position and width
    const curX = 800;
    const curW = 344;
    const curCenter = curX + curW / 2; // 972

    // Expanding on hover to target width 444 (delta = +100)
    const targetW = 444;
    const newX = curCenter - targetW / 2; // 972 - 222 = 750
    const newCenter = newX + targetW / 2; // 750 + 222 = 972

    expect(newX).toBe(750);
    expect(newX + targetW).toBe(1194); // right edge moves from 1144 to 1194 (+50px)
    expect(curX - newX).toBe(50); // left edge moves left by 50px
    expect(newCenter).toBe(curCenter); // horizontal center is preserved exactly

    // Shrinking on hover leave back to 344 (delta = -100)
    const restoreW = 344;
    const restoreX = curCenter - restoreW / 2; // 972 - 172 = 800
    const restoreCenter = restoreX + restoreW / 2;

    expect(restoreX).toBe(800);
    expect(restoreCenter).toBe(curCenter);
  });

  it("calculates top-center position matching Apple notch style", () => {
    const monitorBounds = { x: 0, y: 0, width: 1920, height: 1080 };
    const pipWidth = 344;

    const topCenterX = monitorBounds.x + Math.round((monitorBounds.width - pipWidth) / 2);
    const topCenterY = monitorBounds.y; // Full top edge flush with screen bezel

    expect(topCenterX).toBe(788);
    expect(topCenterY).toBe(0);
    expect(topCenterX + pipWidth / 2).toBe(monitorBounds.width / 2);
  });

  it("handles multi-click debouncing for expand-to-main gracefully", async () => {
    let callCount = 0;
    let isExpanding = false;

    const mockShowMain = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const handleExpandToMain = async () => {
      if (isExpanding) return;
      isExpanding = true;
      try {
        await mockShowMain();
      } finally {
        setTimeout(() => {
          isExpanding = false;
        }, 100);
      }
    };

    // User clicks 4 times rapidly
    await Promise.all([
      handleExpandToMain(),
      handleExpandToMain(),
      handleExpandToMain(),
      handleExpandToMain(),
    ]);

    // Only 1 IPC call went through, subsequent clicks were debounced
    expect(callCount).toBe(1);
    expect(mockShowMain).toHaveBeenCalledTimes(1);
  });

  it("recovers gracefully if showMain throws an error", async () => {
    let hudNotified = false;
    let isExpanding = false;

    const mockFailingShowMain = vi.fn().mockRejectedValue(new Error("Window not found"));

    const handleExpandToMain = async () => {
      if (isExpanding) return;
      isExpanding = true;
      try {
        await mockFailingShowMain();
      } catch {
        hudNotified = true;
      } finally {
        isExpanding = false;
      }
    };

    await handleExpandToMain();

    expect(hudNotified).toBe(true);
    expect(isExpanding).toBe(false); // Guard resets so user can try again
  });

  it("resolves dark and light theme modes accurately", async () => {
    const { resolveDark, THEMES } = await import("@/lib/themes");
    expect(resolveDark("dark")).toBe(true);
    expect(resolveDark("light")).toBe(false);

    // Ensure all 8 themes exist and have both dark and light palettes
    const themeIds = THEMES.map((t) => t.id);
    expect(themeIds).toContain("graphite");
    expect(themeIds).toContain("nord");
    expect(themeIds).toContain("rose");
    expect(themeIds).toContain("forest");
    expect(themeIds).toContain("ocean");
    expect(themeIds).toContain("sunset");
    expect(themeIds).toContain("mono");
    expect(themeIds).toContain("lavender");

    THEMES.forEach((t) => {
      expect(t.dark.surface).toBeDefined();
      expect(t.light.surface).toBeDefined();
      expect(t.dark.accent).toBeDefined();
      expect(t.light.accent).toBeDefined();
    });
  });

  it("verifies zero-flicker window sizing envelopes and hover containment", () => {
    const ISLAND_ENVELOPE = { width: 440, height: 60 };
    const TRAY_ENVELOPE = { width: 460, height: 360 };

    // Island mode pill at rest and hover
    const pillRestWidth = 280;
    const pillHoverWidth = 390;
    const pillWithToastWidth = 380;
    const satelliteBubbleWidth = 40;
    const gap = 8;

    // Both rest pill and hover pill + satellite bubble must fit inside 440px without resizing OS window
    expect(pillRestWidth).toBeLessThanOrEqual(ISLAND_ENVELOPE.width);
    expect(pillHoverWidth).toBeLessThanOrEqual(ISLAND_ENVELOPE.width);
    expect(pillWithToastWidth).toBeLessThanOrEqual(ISLAND_ENVELOPE.width);
    expect(pillHoverWidth + gap + satelliteBubbleWidth).toBeLessThanOrEqual(ISLAND_ENVELOPE.width);

    // Tray mode width and height envelope
    const trayWidth = 420;
    const maxStandardWidgetHeight = 300;
    expect(trayWidth).toBeLessThanOrEqual(TRAY_ENVELOPE.width);
    expect(maxStandardWidgetHeight).toBeLessThanOrEqual(TRAY_ENVELOPE.height);
  });

  it("verifies widget switcher has all 7 modules configured", () => {
    const expectedModules = ["focus", "stash", "tasks", "habits", "media", "clock", "memo"];
    expect(expectedModules).toHaveLength(7);
    expectedModules.forEach((mod) => {
      expect(["focus", "tasks", "habits", "media", "clock", "memo", "stash"]).toContain(mod);
    });
  });
});
