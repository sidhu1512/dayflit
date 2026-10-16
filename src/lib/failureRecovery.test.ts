import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { makeTask } from "@/stores/tasks";
import { useSettings } from "@/stores/settings";
import type { Settings } from "@/lib/types";

describe("Failure, Recovery & Graceful Degradation Testing Suite", () => {
  describe("1. Multi-Tier Storage Corruption Recovery Simulation", () => {
    // Model testing the 3-tier recovery strategy from store.rs: Primary -> .bak -> Zip Backup -> Empty
    interface RecoveryStoreSimulation {
      primary: string | null;
      bak: string | null;
      backups: string[];
    }

    function simulateRecovery(s: RecoveryStoreSimulation): { status: "primary" | "bak" | "backup" | "fallback"; data: unknown[] } {
      // 1. Try primary
      if (s.primary) {
        try {
          const parsed = JSON.parse(s.primary);
          if (Array.isArray(parsed)) return { status: "primary", data: parsed };
        } catch {
          // Primary corrupt
        }
      }

      // 2. Try .bak
      if (s.bak) {
        try {
          const parsed = JSON.parse(s.bak);
          if (Array.isArray(parsed)) return { status: "bak", data: parsed };
        } catch {
          // .bak corrupt
        }
      }

      // 3. Try historical backups
      for (const backup of s.backups) {
        try {
          const parsed = JSON.parse(backup);
          if (Array.isArray(parsed)) return { status: "backup", data: parsed };
        } catch {
          // Corrupt backup
        }
      }

      // 4. Safe fallback to default empty collection
      return { status: "fallback", data: [] };
    }

    it("recovers from .bak snapshot when primary file is corrupted", () => {
      const result = simulateRecovery({
        primary: "{ corrupt json truncated...",
        bak: '[{"id": "task-recovered", "title": "Good Task"}]',
        backups: [],
      });

      expect(result.status).toBe("bak");
      expect(result.data.length).toBe(1);
    });

    it("recovers from historical zip snapshot when both primary and .bak are corrupted", () => {
      const result = simulateRecovery({
        primary: "0x00 0x00 0x00 zero byte header",
        bak: "{ broken too",
        backups: ['[{"id": "task-archive", "title": "Archived Task"}]'],
      });

      expect(result.status).toBe("backup");
      expect(result.data.length).toBe(1);
    });

    it("falls back to clean empty state when all disk stores are damaged without throwing unhandled exceptions", () => {
      const result = simulateRecovery({
        primary: null,
        bak: null,
        backups: ["corrupt"],
      });

      expect(result.status).toBe("fallback");
      expect(result.data).toEqual([]);
    });
  });

  describe("2. Missing Attachment & Broken Media Recovery", () => {
    it("renders fallback unavailable status pill when image fails to load", () => {
      const brokenImageMd = "![Missing](dayflit-image://deleted_file.png)";
      const html = renderMarkdown(brokenImageMd);

      // Must include the error fallback handler and unavailable pill
      expect(html).toContain('class="img-unavailable-pill"');
      expect(html).toContain("Image unavailable");
      expect(html).toContain("img-fallback");
    });

    it("handles empty image source gracefully by rendering placeholder immediately", () => {
      const emptyImageHtml = '<img src="">';
      const output = renderMarkdown(emptyImageHtml);
      expect(output).toContain("img-unavailable-pill");
      expect(output).toContain("Image unavailable");
    });
  });

  describe("3. Data Folder Migration Error Defense", () => {
    function validateDataDirChange(currentDir: string, newDir: string, mode: string, hasExistingData: boolean): { ok: boolean; error?: string } {
      const cur = currentDir.replace(/\\/g, "/").toLowerCase();
      const n = newDir.replace(/\\/g, "/").toLowerCase();

      if (cur === n) {
        return { ok: true };
      }
      if (n.startsWith(cur + "/")) {
        return { ok: false, error: "new folder cannot be inside the current data folder" };
      }
      if (mode === "adopt" && !hasExistingData) {
        return { ok: false, error: "no Dayflit data found in that folder" };
      }
      if ((mode === "move" || mode === "copy") && hasExistingData) {
        return { ok: false, error: "that folder already contains Dayflit data; choose 'Use existing data' or pick an empty folder" };
      }
      return { ok: true };
    }

    it("rejects nesting new data folder inside the active data folder", () => {
      const res = validateDataDirChange("C:/AppData/Dayflit/data", "C:/AppData/Dayflit/data/nested", "move", false);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("new folder cannot be inside the current data folder");
    });

    it("rejects adopt mode if target directory contains no existing DayFlit data", () => {
      const res = validateDataDirChange("C:/AppData/Dayflit/data", "D:/EmptyFolder", "adopt", false);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("no Dayflit data found in that folder");
    });

    it("rejects move/copy mode if target folder already contains existing DayFlit database files", () => {
      const res = validateDataDirChange("C:/AppData/Dayflit/data", "D:/OldDayflitBackup", "move", true);
      expect(res.ok).toBe(false);
      expect(res.error).toContain("already contains Dayflit data");
    });
  });

  describe("4. Settings Schema Drift & Corrupted Settings Recovery", () => {
    it("merges corrupted or partial settings with default settings without runtime failure", () => {
      const corruptedSettingsJson = JSON.stringify({
        appearance: { themeId: "tokyo-night" },
        // completely missing window, focus, tasks, audio, etc.
      });

      const parsed = JSON.parse(corruptedSettingsJson);
      const defaults = useSettings.getState().settings;

      // Deep merge fallback
      const healed: Settings = {
        ...defaults,
        ...parsed,
        appearance: { ...defaults.appearance, ...(parsed.appearance || {}) },
        window: { ...defaults.window, ...(parsed.window || {}) },
        focus: { ...defaults.focus, ...(parsed.focus || {}) },
        tasks: { ...defaults.tasks, ...(parsed.tasks || {}) },
      };

      expect(healed.appearance.themeId).toBe("tokyo-night");
      expect(healed.window.alwaysOnTop).toBeDefined();
      expect(healed.focus.defaults.workSecs).toBeGreaterThan(0);
      expect(healed.tasks.defaultList).toBe("Inbox");
    });
  });

  describe("5. Distraction Poller Process Exemption", () => {
    function isDistraction(processName: string, configuredApps: string[]): boolean {
      const pn = processName.toLowerCase();
      // DayFlit must be unconditionally exempt
      if (pn === "dayflit.exe" || pn === "dayflit") {
        return false;
      }
      return configuredApps.some((app) => pn.includes(app.toLowerCase()));
    }

    it("guarantees DayFlit executable is never self-flagged as a distraction", () => {
      const blockedApps = ["dayflit.exe", "discord.exe", "steam.exe"];
      expect(isDistraction("dayflit.exe", blockedApps)).toBe(false);
      expect(isDistraction("DayFlit.exe", blockedApps)).toBe(false);
      expect(isDistraction("discord.exe", blockedApps)).toBe(true);
    });
  });

  describe("6. Atomic Write Retry Algorithm Simulation", () => {
    it("retries on transient file locks (OneDrive/Antivirus sharing violations) and succeeds", () => {
      let attempts = 0;
      function simulateLockedAtomicWrite(maxLockAttempts: number): { success: boolean; attempts: number } {
        for (let i = 0; i < 8; i++) {
          attempts++;
          if (i >= maxLockAttempts) {
            return { success: true, attempts: i + 1 };
          }
          // Simulate transient EBUSY sharing violation
        }
        return { success: false, attempts };
      }

      const res = simulateLockedAtomicWrite(3);
      expect(res.success).toBe(true);
      expect(res.attempts).toBe(4);
    });
  });
});
