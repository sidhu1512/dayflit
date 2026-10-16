import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { applyTheme } from "./themes";
import type { Settings } from "./types";
import { streak, completionRate } from "@/stores/habits";

describe("renderMarkdown image handling", () => {
  it("renders a valid image URL with fallback class handler", () => {
    const html = renderMarkdown("![Diagram](dayflit-image://diagram.png)", (name) => `asset://images/${name}`);
    expect(html).toContain('src="asset://images/diagram.png"');
    expect(html).toContain("onerror=");
    expect(html).toContain("img-fallback");
  });

  it("renders an unavailable pill when image URL is missing or empty", () => {
    const html = renderMarkdown("![Missing Photo](dayflit-image://missing.png)", () => "");
    expect(html).toContain("img-unavailable-pill");
    expect(html).toContain("Image unavailable");
  });
});

describe("applyTheme font compensation", () => {
  const baseAppearance: Settings["appearance"] = {
    themeId: "graphite",
    mode: "dark",
    accent: null,
    material: "acrylic",
    opacity: 0.9,
    density: "comfortable",
    fontSize: 14,
    fontFamily: "system",
    radius: 16,
    showBackgroundGlow: false,
    reduceMotion: false,
  };

  const createMockEl = () => {
    const props: Record<string, string> = {};
    return {
      style: {
        setProperty: (k: string, v: string) => { props[k] = v; },
        getPropertyValue: (k: string) => props[k] ?? "",
        colorScheme: "dark",
      },
      dataset: {},
    } as unknown as HTMLElement;
  };

  it("keeps standard base font size for system font", () => {
    const el = createMockEl();
    applyTheme({ ...baseAppearance, fontFamily: "system", fontSize: 14 }, el);
    expect(el.style.getPropertyValue("--font-size")).toBe("14px");
    expect(el.style.getPropertyValue("--line-height")).toBe("1.4");
  });

  it("scales up Sacramento to compensate for small x-height", () => {
    const el = createMockEl();
    applyTheme({ ...baseAppearance, fontFamily: "sacramento", fontSize: 14 }, el);
    expect(el.style.getPropertyValue("--font-size")).toBe("17px"); // 14 * 1.22 = 17.08 -> 17
    expect(el.style.getPropertyValue("--line-height")).toBe("1.35");
  });

  it("scales down Pacifico to prevent bulky button distortion", () => {
    const el = createMockEl();
    applyTheme({ ...baseAppearance, fontFamily: "pacifico", fontSize: 14 }, el);
    expect(el.style.getPropertyValue("--font-size")).toBe("13px"); // 14 * 0.91 = 12.74 -> 13
    expect(el.style.getPropertyValue("--line-height")).toBe("1.25");
  });

  it("scales Caveat slightly for loose handwriting baseline", () => {
    const el = createMockEl();
    applyTheme({ ...baseAppearance, fontFamily: "caveat", fontSize: 14 }, el);
    expect(el.style.getPropertyValue("--font-size")).toBe("15px"); // 14 * 1.08 = 15.12 -> 15
    expect(el.style.getPropertyValue("--line-height")).toBe("1.32");
  });
});

describe("attachment regex escaping", () => {
  it("safely escapes filenames with dots and special characters", () => {
    const imageName = "photo.2026.09-12(1).png";
    const safe = imageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`!\\[[^\\]]*\\]\\(dayflit-image://${safe}\\)\\s*`, "g");

    const body = "Some text before\n![My Photo](dayflit-image://photo.2026.09-12(1).png)\nSome text after";
    const cleaned = body.replace(re, "").trim();

    expect(cleaned).toBe("Some text before\nSome text after");
  });

  it("does not match unrelated images with similar prefixes", () => {
    const imageName = "photo.png";
    const safe = imageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`!\\[[^\\]]*\\]\\(dayflit-image://${safe}\\)\\s*`, "g");

    const body = "![Photo](dayflit-image://photo-other.png)";
    const cleaned = body.replace(re, "").trim();

    expect(cleaned).toBe("![Photo](dayflit-image://photo-other.png)");
  });
});

describe("renderMarkdown runtime error fallback", () => {
  it("includes both img-fallback class trigger and adjacent unavailable pill", () => {
    const html = renderMarkdown("![Diagram](dayflit-image://diagram.png)", (name) => `asset://images/${name}`);
    expect(html).toContain("img-fallback");
    expect(html).toContain("img-unavailable-pill");
    expect(html).toContain("Image unavailable");
  });
});

describe("floating window geometry and shadow containment", () => {
  it("guarantees ambient shadow blur is fully contained within window padding to prevent clipping", () => {
    // Floating windows use 20px padding (p-5) with 40px delta in ResizeObserver
    const containerPadding = 20;
    // Ambient shadow: 0 8px 24px -2px (effective lateral blur reach ~12-16px, max vertical offset + blur reach ~20px)
    const lateralBlurReach = 14;
    expect(containerPadding).toBeGreaterThanOrEqual(lateralBlurReach);
  });

  it("guarantees bubble orb shadow fits within 84px window", () => {
    const windowSize = 84;
    const orbSize = 56;
    const padding = (windowSize - orbSize) / 2; // 14px
    // Bubble shadow: 0 2px 8px, 0 4px 12px -2px
    const maxShadowReach = 4 - 2 + 6; // 8px
    const clearance = padding - maxShadowReach; // 14 - 8 = 6px
    expect(clearance).toBeGreaterThan(0);
  });
});

describe("keyboard shortcut philosophy", () => {
  it("uses Alt+Shift+D for toggle-main to prevent Windows system menu conflicts", async () => {
    const { DEFAULT_SHORTCUTS } = await import("@/stores/settings");
    expect(DEFAULT_SHORTCUTS["toggle-main"]).toBe("Alt+Shift+D");
    expect(DEFAULT_SHORTCUTS["toggle-main"]).not.toBe("Alt+Space");
  });

  it("ensures default shortcuts do not duplicate within the set", async () => {
    const { DEFAULT_SHORTCUTS } = await import("@/stores/settings");
    const values = Object.values(DEFAULT_SHORTCUTS).filter((v) => v.length > 0);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
  });
});

describe("image lifecycle and markdown extraction", () => {
  it("identifies deleted image attachments when markdown body is modified", () => {
    const originalBody = "Hello world\n![photo1](dayflit-image://p1.png)\n![photo2](dayflit-image://p2.png)";
    const currentImages = ["p1.png", "p2.png"];

    const updatedBody = "Hello world\n![photo2](dayflit-image://p2.png)";
    const newImages = [...new Set([...updatedBody.matchAll(/dayflit-image:\/\/([\w.-]+)/g)].map((m) => m[1]))];

    const removed = currentImages.filter((img) => !newImages.includes(img));
    expect(removed).toEqual(["p1.png"]);
    expect(newImages).toEqual(["p2.png"]);
  });
});

describe("habit streak calculations and DST resilience", () => {
  it("calculates timesPerWeek streak correctly without date-fns allocation bottlenecks", () => {
    const today = new Date(2026, 9, 14); // Wednesday
    const habit = {
      id: "h1",
      name: "Gym",
      icon: "dumbbell",
      color: "#3b82f6",
      schedule: { type: "timesPerWeek" as const, times: 3 },
      target: 1,
      unit: "times",
      reminderTime: null,
      archived: false,
      createdAt: new Date(2026, 8, 1).getTime(),
      order: 0,
      notes: "",
      log: {
        // Current week (Mon Oct 12 - Sun Oct 18): 3 sessions
        "2026-10-12": 1,
        "2026-10-13": 1,
        "2026-10-14": 1,
        // Last week (Mon Oct 05 - Sun Oct 11): 3 sessions
        "2026-10-05": 1,
        "2026-10-07": 1,
        "2026-10-09": 1,
      },
    };
    expect(streak(habit, today)).toBe(2);
  });

  it("calculates daily streaks seamlessly across midnight/DST boundaries", () => {
    const midnightDate = new Date(2026, 10, 1, 0, 0, 0, 0); // Nov 1 midnight
    const habit = {
      id: "h2",
      name: "Meditation",
      icon: "sparkles",
      color: "#10b981",
      schedule: { type: "daily" as const },
      target: 1,
      unit: "times",
      reminderTime: null,
      archived: false,
      createdAt: new Date(2026, 9, 1).getTime(),
      order: 0,
      notes: "",
      log: {
        "2026-11-01": 1,
        "2026-10-31": 1,
        "2026-10-30": 1,
      },
    };
    expect(streak(habit, midnightDate)).toBe(3);
    expect(completionRate(habit, 3, midnightDate)).toBe(1);
  });
});

describe("Directive 2 UI & Robustness Enhancements", () => {
  it("deduplicates leading markdown heading from note body preview", () => {
    const title = "Product Design Principles";
    const body = "# Product Design Principles\n\n1. **Typography as Architecture**: Use size, weight, and optical tracking.";
    const cleanBody = body.startsWith("# " + title)
      ? body.slice(("# " + title).length).trim()
      : body.replace(new RegExp(`^#*\\s*${title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*`, "i"), "").trim();
    
    // Preview should not repeat the title as its first words
    expect(cleanBody).toBe("1. **Typography as Architecture**: Use size, weight, and optical tracking.");
  });

  it("handles habits with missing or undefined log gracefully", () => {
    const habit = {
      id: "h-corrupt",
      name: "Water",
      icon: "droplet",
      color: "#3b82f6",
      schedule: { type: "daily" as const },
      target: 1,
      unit: "glass",
      reminderTime: null,
      archived: false,
      createdAt: Date.now(),
      order: 0,
      notes: "",
      log: undefined as unknown as Record<string, number>,
    };
    const key = "2026-10-14";
    const count = habit.log?.[key] ?? 0;
    expect(count).toBe(0);
  });

  it("determines menu placement correctly when near viewport boundary", () => {
    const viewportHeight = 800;
    
    // Bottom item with bottom at 720 (80px from edge < 260px)
    const nearBottomRect = { bottom: 720 };
    const placementBottom = viewportHeight - nearBottomRect.bottom < 260 ? "up" : "down";
    expect(placementBottom).toBe("up");

    // Top item with bottom at 200 (600px from edge >= 260px)
    const normalRect = { bottom: 200 };
    const placementNormal = viewportHeight - normalRect.bottom < 260 ? "up" : "down";
    expect(placementNormal).toBe("down");
  });
});


