import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyActivity,
  normalizeCategory,
  categoryDisplayName,
  useActivity,
  type ActivitySession,
} from "@/stores/activity";
import { useTasks } from "@/stores/tasks";

describe("OS Activity Timeline Engine & Store", () => {
  beforeEach(() => {
    useActivity.getState().clearHistory();
    useTasks.setState({ tasks: [] });
  });

  describe("classifyActivity", () => {
    it("classifies dev and code editors as deep-work", () => {
      expect(classifyActivity("code.exe", "index.ts - DayFlit")).toBe("deep-work");
      expect(classifyActivity("cursor.exe", "app.tsx")).toBe("deep-work");
      expect(classifyActivity("windowsterminal.exe", "powershell")).toBe("deep-work");
      expect(classifyActivity("idea64.exe", "Project - IntelliJ IDEA")).toBe("deep-work");
    });

    it("classifies design applications as design", () => {
      expect(classifyActivity("figma.exe", "DayFlit Prototype")).toBe("design");
      expect(classifyActivity("photoshop.exe", "poster.psd")).toBe("design");
      expect(classifyActivity("blender.exe", "scene.blend")).toBe("design");
    });

    it("classifies communication tools as communication", () => {
      expect(classifyActivity("slack.exe", "general")).toBe("communication");
      expect(classifyActivity("teams.exe", "Daily Standup")).toBe("communication");
      expect(classifyActivity("zoom.exe", "Team Sync")).toBe("communication");
      expect(classifyActivity("telegram.exe", "Chat")).toBe("communication");
    });

    it("classifies standard browsers as browsing", () => {
      expect(classifyActivity("chrome.exe", "Wikipedia - Computer Science")).toBe("browsing");
      expect(classifyActivity("firefox.exe", "MDN Web Docs")).toBe("browsing");
      expect(classifyActivity("msedge.exe", "Documentation")).toBe("browsing");
    });

    it("classifies known distracting websites and games as distraction", () => {
      expect(classifyActivity("chrome.exe", "Relaxing Lo-Fi Beats - YouTube")).toBe("distraction");
      expect(classifyActivity("firefox.exe", "Trending on Reddit")).toBe("distraction");
      expect(classifyActivity("msedge.exe", "Twitter / X")).toBe("distraction");
      expect(classifyActivity("steam.exe", "Steam Community")).toBe("distraction");
    });
  });

  describe("normalizeCategory & categoryDisplayName", () => {
    it("handles both Rust display names and TypeScript slugs cleanly", () => {
      expect(normalizeCategory("Deep Work / Coding")).toBe("deep-work");
      expect(normalizeCategory("deep-work")).toBe("deep-work");
      expect(normalizeCategory("Design")).toBe("design");
      expect(normalizeCategory("design")).toBe("design");
      expect(normalizeCategory("Communication")).toBe("communication");
      expect(normalizeCategory("communication")).toBe("communication");
      expect(normalizeCategory("Browsing")).toBe("browsing");
      expect(normalizeCategory("browsing")).toBe("browsing");
      expect(normalizeCategory("Distraction")).toBe("distraction");
      expect(normalizeCategory("distraction")).toBe("distraction");
    });

    it("returns formatted display names", () => {
      expect(categoryDisplayName("deep-work")).toBe("Deep Work / Coding");
      expect(categoryDisplayName("design")).toBe("Design");
      expect(categoryDisplayName("communication")).toBe("Communication");
      expect(categoryDisplayName("browsing")).toBe("Browsing");
      expect(categoryDisplayName("distraction")).toBe("Distraction");
    });
  });

  describe("alignmentScore calculation", () => {
    it("returns 100 for an empty session list", () => {
      expect(useActivity.getState().alignmentScore([])).toBe(100);
    });

    it("returns 100 for purely deep work and design sessions", () => {
      const sessions: ActivitySession[] = [
        {
          id: "1",
          exe: "code.exe",
          processName: "code.exe",
          title: "VS Code",
          category: "deep-work",
          startTime: Date.now() - 3600000,
          endTime: Date.now() - 1800000,
          durationSecs: 1800,
        },
        {
          id: "2",
          exe: "figma.exe",
          processName: "figma.exe",
          title: "Figma",
          category: "design",
          startTime: Date.now() - 1800000,
          endTime: Date.now(),
          durationSecs: 1800,
        },
      ];
      expect(useActivity.getState().alignmentScore(sessions)).toBe(100);
    });

    it("correctly weights communication, browsing, and distraction", () => {
      const sessions: ActivitySession[] = [
        {
          id: "1",
          exe: "code.exe",
          processName: "code.exe",
          title: "VS Code",
          category: "deep-work",
          startTime: 1000,
          endTime: 1600,
          durationSecs: 600, // 600 * 1 = 600
        },
        {
          id: "2",
          exe: "slack.exe",
          processName: "slack.exe",
          title: "Slack",
          category: "communication",
          startTime: 2000,
          endTime: 2200,
          durationSecs: 200, // 200 * 0.7 = 140
        },
        {
          id: "3",
          exe: "steam.exe",
          processName: "steam.exe",
          title: "Steam",
          category: "distraction",
          startTime: 3000,
          endTime: 3200,
          durationSecs: 200, // 200 * 0 = 0
        },
      ];
      // total = 1000 secs. productive = 740 secs -> 74%
      expect(useActivity.getState().alignmentScore(sessions)).toBe(74);
    });

    it("works with Rust-formatted category strings", () => {
      const sessions: ActivitySession[] = [
        {
          id: "1",
          exe: "code.exe",
          processName: "code.exe",
          title: "VS Code",
          category: "Deep Work / Coding" as unknown as "deep-work",
          startTime: 1000,
          endTime: 2000,
          durationSecs: 1000,
        },
      ];
      expect(useActivity.getState().alignmentScore(sessions)).toBe(100);
    });
  });

  describe("logAsCompletedTask", () => {
    it("converts an activity session into a completed DayFlit task", () => {
      const session: ActivitySession = {
        id: "act_test_1",
        exe: "C:\\Program Files\\VSCode\\code.exe",
        processName: "code.exe",
        title: "DayFlit - pip.tsx",
        category: "deep-work",
        startTime: 1700000000000,
        endTime: 1700002700000,
        durationSecs: 2700, // 45 minutes
      };

      const task = useActivity.getState().logAsCompletedTask(session);

      expect(task).toBeDefined();
      expect(task.title).toContain("DayFlit - pip.tsx (Code)");
      expect(task.status).toBe("done");
      expect(task.estimateMin).toBe(45);
      expect(task.priority).toBe("medium");
      expect(task.tags).toContain("auto-logged");
      expect(task.tags).toContain("deep-work");

      // Verify task exists in useTasks store
      const inStore = useTasks.getState().tasks.find((t) => t.id === task.id);
      expect(inStore).toBeDefined();
      expect(inStore?.completedAt).toBe(session.endTime);
      expect(inStore?.focusSecs).toBe(2700);
    });
  });
});
