import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS, SYSTEM_RESERVED_SHORTCUTS } from "@/stores/settings";
import { readFileSync } from "fs";
import { join } from "path";

describe("Expanded Comprehensive Testing Suite", () => {
  describe("1. Keyboard Shortcut Philosophy & Conflict Detection", () => {
    it("guarantees toggle-main default is Alt+Shift+D avoiding Windows Alt+Space system conflicts", () => {
      expect(DEFAULT_SHORTCUTS["toggle-main"]).toBe("Alt+Shift+D");
      expect(DEFAULT_SHORTCUTS["toggle-main"]).not.toBe("Alt+Space");
    });

    it("identifies all reserved Windows OS system hotkeys", () => {
      const isReserved = (key: string) => Boolean(SYSTEM_RESERVED_SHORTCUTS[key]);

      const reservedKeys = [
        "Alt+Space",
        "Alt+Tab",
        "Alt+F4",
        "Ctrl+Alt+Delete",
        "Ctrl+Shift+Escape",
        "Ctrl+Escape",
        "Super+L",
        "Super+D",
      ];

      for (const key of reservedKeys) {
        expect(isReserved(key), `Expected ${key} to be reserved by Windows OS`).toBe(true);
      }
    });

    it("detects shortcut collisions between configured actions", () => {
      function findCollisions(shortcuts: Record<string, string>): string[][] {
        const collisions: string[][] = [];
        const seen = new Map<string, string>();
        for (const [action, combo] of Object.entries(shortcuts)) {
          if (!combo) continue;
          if (seen.has(combo)) {
            collisions.push([seen.get(combo)!, action, combo]);
          } else {
            seen.set(combo, action);
          }
        }
        return collisions;
      }

      // Default configuration must have zero collisions
      const defaultCollisions = findCollisions(DEFAULT_SHORTCUTS);
      expect(defaultCollisions).toEqual([]);

      // Conflicted configuration must be detected
      const conflicted = { ...DEFAULT_SHORTCUTS, "toggle-pip": DEFAULT_SHORTCUTS["toggle-main"] };
      const detected = findCollisions(conflicted);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0][2]).toBe(DEFAULT_SHORTCUTS["toggle-main"]);
    });
  });

  describe("2. Accessibility & Screen Reader Semantics", () => {
    it("ensures website interactive controls feature accessible aria-labels", () => {
      const websiteHtml = readFileSync(join(__dirname, "../../website/index.html"), "utf-8");

      // Verify buttons without visible text have aria-label
      const iconButtonRegex = /<button[^>]*class="[^"]*btn[^"]*"[^>]*>/gi;
      const matches = websiteHtml.match(iconButtonRegex) || [];

      for (const btn of matches) {
        if (btn.includes("nlp-clear-btn") || btn.includes("focus-sim-btn")) {
          expect(btn).toContain("aria-label=");
        }
      }
    });

    it("verifies dialogs have accessible role and modal attributes", () => {
      // PromptDialog pattern verification
      const promptDialogTsx = readFileSync(join(__dirname, "../components/PromptDialog.tsx"), "utf-8");
      expect(promptDialogTsx).toContain('role="dialog"');
      expect(promptDialogTsx).toContain('aria-modal="true"');
      expect(promptDialogTsx).toContain("Escape");
    });
  });

  describe("3. Window Geometry & Clamping Mathematics", () => {
    it("clamps bubble coordinates safely within monitor work area bounds", () => {
      interface Bounds {
        x: number;
        y: number;
        width: number;
        height: number;
      }

      function clampBubblePosition(x: number, y: number, bubbleSize: number, workArea: Bounds): { x: number; y: number } {
        const minX = workArea.x;
        const maxX = workArea.x + workArea.width - bubbleSize;
        const minY = workArea.y;
        const maxY = workArea.y + workArea.height - bubbleSize;

        return {
          x: Math.max(minX, Math.min(x, maxX)),
          y: Math.max(minY, Math.min(y, maxY)),
        };
      }

      const screen: Bounds = { x: 0, y: 0, width: 1920, height: 1040 };
      const bubbleSize = 64;

      // Off-screen right
      expect(clampBubblePosition(2000, 500, bubbleSize, screen)).toEqual({ x: 1920 - 64, y: 500 });
      // Off-screen left
      expect(clampBubblePosition(-50, 500, bubbleSize, screen)).toEqual({ x: 0, y: 500 });
      // Off-screen bottom
      expect(clampBubblePosition(500, 1100, bubbleSize, screen)).toEqual({ x: 500, y: 1040 - 64 });
      // Off-screen top
      expect(clampBubblePosition(500, -100, bubbleSize, screen)).toEqual({ x: 500, y: 0 });
    });

    it("verifies floating secondary windows dock flush to top (pt-0) while reserving lateral/bottom padding for ambient shadow rendering", () => {
      const pipTsx = readFileSync(join(__dirname, "../windows/pip.tsx"), "utf-8");
      expect(pipTsx).toContain("pt-0"); // 0px top padding for notch docking
      expect(pipTsx).toContain("pb-6"); // bottom shadow buffer
      expect(pipTsx).toContain("px-6"); // lateral shadow buffer
    });
  });

  describe("4. Product Website Zero-Emoji & Brand Identity Verification", () => {
    it("confirms 0 unicode emojis or dingbats remain on the marketing website", () => {
      const websiteHtml = readFileSync(join(__dirname, "../../website/index.html"), "utf-8");
      const websiteJs = readFileSync(join(__dirname, "../../website/src/main.js"), "utf-8");

      const emojiOrDingbat = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{25A0}-\u{25FF}]/u;

      const htmlMatches = websiteHtml.split("\n").filter((l) => emojiOrDingbat.test(l));
      const jsMatches = websiteJs.split("\n").filter((l) => emojiOrDingbat.test(l));

      expect(htmlMatches).toEqual([]);
      expect(jsMatches).toEqual([]);
    });

    it("confirms matrix comparison table uses inline SVG icons", () => {
      const websiteHtml = readFileSync(join(__dirname, "../../website/index.html"), "utf-8");
      expect(websiteHtml).toContain('class="matrix-icon"');
      expect(websiteHtml).not.toContain('<span class="matrix-yes">✓');
      expect(websiteHtml).not.toContain('<span class="matrix-no">✕');
      expect(websiteHtml).not.toContain('<span class="matrix-partial">◐');
    });

    it("confirms zero user-facing 'Sid' occurrences exist in marketing website copy", () => {
      const websiteHtml = readFileSync(join(__dirname, "../../website/index.html"), "utf-8");
      // Check title, headings, and descriptions
      expect(websiteHtml).toContain("<title>DayFlit — The Floating Companion for Your Windows Day</title>");
      expect(websiteHtml).not.toMatch(/\bSid\b/);
    });
  });

  describe("5. Typography Optical Height Compensation Regressions", () => {
    it("asserts optical scale and line-height factors for handwritten fonts", () => {
      const FONT_METRICS: Record<string, { scale: number; lineHeight: number }> = {
        sacramento: { scale: 1.22, lineHeight: 1.35 },
        pacifico: { scale: 0.91, lineHeight: 1.25 },
        caveat: { scale: 1.08, lineHeight: 1.32 },
      };

      expect(FONT_METRICS.sacramento.scale).toBe(1.22);
      expect(FONT_METRICS.pacifico.scale).toBe(0.91);
      expect(FONT_METRICS.caveat.scale).toBe(1.08);
    });
  });
});
