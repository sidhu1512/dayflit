import { describe, it, expect, beforeEach } from "vitest";
import {
  stripMediaAndMarkdown,
  extractCleanTitleAndExcerpt,
  extractAllImages,
  extractFirstImage,
} from "./markdown";
import { useClips } from "@/stores/clips";
import { useNotes } from "@/stores/notes";
import { useJournal } from "@/stores/journal";
import { useUi } from "@/stores/ui";
import { runAction } from "./runAction";
import { formatSmartDate } from "./dates";

describe("PHASE 6 — PART 1: Media Cleanups, Title/Excerpt Extraction & Clips Deduplication", () => {
  describe("1. stripMediaAndMarkdown", () => {
    it("strips dayflit-image and dayflitimage URIs completely without leaving artifacts", () => {
      const raw1 = "![ChatGPT Image Sep 6, 2026](dayflit-image://a251223f47cc4b1987ae39139d631e6b.png)\nSome text here";
      expect(stripMediaAndMarkdown(raw1)).toBe("Some text here");

      const raw2 = "(dayflitimage://a251223f47cc4b1987ae39139d631e6b.png)\nAnother clean line";
      expect(stripMediaAndMarkdown(raw2)).toBe("Another clean line");

      const raw3 = "![Photo](http://asset.localhost/image.png) and (https://asset.localhost/img2.jpg)";
      expect(stripMediaAndMarkdown(raw3)).toBe("and");
    });

    it("strips audio links, html audio, and wikilinks correctly", () => {
      const input = "[[note:123|Design Specs]] and [Voice memo](dayflit-image://voice.wav) <audio src='foo'></audio>";
      expect(stripMediaAndMarkdown(input)).toBe("Design Specs and");
    });

    it("preserves internal hyphens in words while removing markdown bold/italic/strike", () => {
      const input = "**Apple-style** user-facing *first-class* interaction";
      expect(stripMediaAndMarkdown(input)).toBe("Apple-style user-facing first-class interaction");
    });
  });

  describe("2. extractCleanTitleAndExcerpt", () => {
    it("never repeats the first line in both bold title and subtitle excerpt", () => {
      const body = "Quarterly product roadmap review with the executive team.\nWe finalized the timeline for Phase 6 release across Windows and mobile.";
      const res = extractCleanTitleAndExcerpt(body);

      expect(res.title).toBe("Quarterly product roadmap review with the…");
      // Subtitle excerpt must strictly come from the remaining text AFTER the title line!
      expect(res.excerpt).toBe("We finalized the timeline for Phase 6 release across Windows and mobile.");
      expect(res.excerpt).not.toContain("Quarterly product roadmap");
    });

    it("handles a single long paragraph without repeating the title in the excerpt", () => {
      const body = "The quick brown fox jumps over the lazy dog and runs across the open sunny meadow toward the riverbank to drink fresh cold water.";
      const res = extractCleanTitleAndExcerpt(body);

      expect(res.title.endsWith("…")).toBe(true);
      expect(res.title.length).toBeLessThanOrEqual(50);
      // Excerpt should only contain the trailing remainder of that paragraph, not the title prefix!
      expect(res.excerpt).not.toContain("The quick brown fox");
      expect(res.excerpt).toContain("open sunny meadow");
    });

    it("produces calm title for image-only entries instead of Untitled or raw URLs", () => {
      const imgOnlyBody = "![Screenshot](dayflit-image://a251223f47cc4b1987ae39139d631e6b.png)";
      const noteRes = extractCleanTitleAndExcerpt(imgOnlyBody, null, {
        defaultImageTitle: "Image Note",
        date: new Date("2026-10-15T12:15:00"),
      });
      expect(noteRes.title).toMatch(/^Image Note · 12:15/);
      expect(noteRes.excerpt).toBe("");
      expect(noteRes.title).not.toContain("dayflit");

      const journalRes = extractCleanTitleAndExcerpt(imgOnlyBody, null, {
        defaultImageTitle: "Photo Entry",
        date: new Date("2026-10-15T12:15:00"),
      });
      expect(journalRes.title).toMatch(/^Photo Entry · 12:15/);
      expect(journalRes.excerpt).toBe("");
    });

    it("extractAllImages finds all dayflit-image identifiers from markdown body and images array", () => {
      const body = "![One](dayflit-image://hash1.png)\nText\n![Two](dayflitimage://hash2.jpg)";
      const imgs = extractAllImages(body, ["hash0.webp"]);
      expect(imgs).toContain("hash0.webp");
      expect(imgs).toContain("hash1.png");
      expect(imgs).toContain("hash2.jpg");
    });
  });

  describe("3. formatSmartDate (Apple Notes / Things 3 timestamps)", () => {
    it("formats today as tabular time and yesterday as 'Yesterday'", () => {
      const now = new Date("2026-10-15T14:30:00");
      const todayEarlier = new Date("2026-10-15T09:15:00");
      expect(formatSmartDate(todayEarlier, now)).toBe("9:15 AM");

      const yesterday = new Date("2026-10-14T16:00:00");
      expect(formatSmartDate(yesterday, now)).toBe("Yesterday");

      const thisYear = new Date("2026-08-10T12:00:00");
      expect(formatSmartDate(thisYear, now)).toBe("10 Aug");

      const lastYear = new Date("2025-05-20T12:00:00");
      expect(formatSmartDate(lastYear, now)).toBe("20 May 2025");
    });
  });

  describe("4. Clips Deduplication & Single Source of Truth", () => {
    beforeEach(() => {
      useClips.setState({ clips: [], lastCaptured: null });
    });

    it("deduplicates identical captures within recent timeframe", () => {
      const clip1 = useClips.getState().addRaw({
        id: "clip-1",
        kind: "text",
        text: "Important design guidelines",
        image: null,
        source: { app: "Chrome", title: "Apple HIG", exe: "chrome.exe", processName: "chrome.exe" },
        at: Date.now(),
        width: 0,
        height: 0,
      });

      expect(useClips.getState().clips.length).toBe(1);

      // Second capture of identical content with different ID (e.g. from shortcut + watcher)
      const clip2 = useClips.getState().addRaw({
        id: "clip-2",
        kind: "text",
        text: "Important design guidelines",
        image: null,
        source: { app: "Chrome", title: "Apple HIG", exe: "chrome.exe", processName: "chrome.exe" },
        at: Date.now() + 500,
        width: 0,
        height: 0,
      });

      // Must return the existing clip without adding a duplicate row!
      expect(useClips.getState().clips.length).toBe(1);
      expect(clip2.id).toBe(clip1.id);
    });

    it("capture-clip action promotes existing clip without adding duplicate clip", async () => {
      const initialClip = useClips.getState().addRaw({
        id: "clip-alpha",
        kind: "text",
        text: "Research notes for next release",
        image: null,
        source: { app: "Slack", title: "General", exe: "slack.exe", processName: "slack.exe" },
        at: Date.now(),
        width: 0,
        height: 0,
      });

      expect(useClips.getState().clips.length).toBe(1);

      // Follow-up action: user clicks "Save as note"
      await runAction({
        type: "capture-clip",
        clip: initialClip,
        as: "note",
      });

      // Clips count must remain 1 (no duplicate row added!)
      expect(useClips.getState().clips.length).toBe(1);
      const updated = useClips.getState().clips[0];
      expect(updated.convertedTo?.type).toBe("note");
    });
  });

  describe("5. MediaLightbox State", () => {
    it("opens lightbox with multiple images and navigates safely", () => {
      useUi.getState().openLightbox(["img1.png", "img2.png", "img3.png"], 1, "Gallery");
      const lb = useUi.getState().lightbox;
      expect(lb).not.toBeNull();
      expect(lb?.images.length).toBe(3);
      expect(lb?.index).toBe(1);
      expect(lb?.title).toBe("Gallery");

      useUi.getState().closeLightbox();
      expect(useUi.getState().lightbox).toBeNull();
    });
  });

  describe("6. Windows CRLF & Image Protocol Deduplication", () => {
    beforeEach(() => {
      useClips.setState({ clips: [], lastCaptured: null });
    });

    it("deduplicates clips regardless of Windows \\r\\n vs Unix \\n line endings", () => {
      const clip1 = useClips.getState().addRaw({
        id: "clip-crlf-1",
        kind: "text",
        text: "Line 1\r\nLine 2\r\nLine 3",
        image: null,
        source: { app: "VSCode", title: "code.ts", exe: "code.exe", processName: "code.exe" },
        at: Date.now(),
        width: 0,
        height: 0,
      });

      expect(useClips.getState().clips.length).toBe(1);

      // Captured via another listener with Unix line endings
      const clip2 = useClips.getState().addRaw({
        id: "clip-crlf-2",
        kind: "text",
        text: "Line 1\nLine 2\nLine 3",
        image: null,
        source: { app: "VSCode", title: "code.ts", exe: "code.exe", processName: "code.exe" },
        at: Date.now() + 200,
        width: 0,
        height: 0,
      });

      expect(useClips.getState().clips.length).toBe(1);
      expect(clip2.id).toBe(clip1.id);
    });

    it("deduplicates image clips regardless of dayflit-image:// prefix", () => {
      const clip1 = useClips.getState().addRaw({
        id: "clip-img-1",
        kind: "image",
        text: "",
        image: "dayflit-image://screenshot123.png",
        source: { app: "DayFlit", title: "Screenshot", exe: "dayflit.exe", processName: "dayflit.exe" },
        at: Date.now(),
        width: 100,
        height: 100,
      });

      expect(useClips.getState().clips.length).toBe(1);

      const clip2 = useClips.getState().addRaw({
        id: "clip-img-2",
        kind: "image",
        text: "",
        image: "screenshot123.png",
        source: { app: "DayFlit", title: "Screenshot", exe: "dayflit.exe", processName: "dayflit.exe" },
        at: Date.now() + 300,
        width: 100,
        height: 100,
      });

      expect(useClips.getState().clips.length).toBe(1);
      expect(clip2.id).toBe(clip1.id);
    });
  });

  describe("7. Subtitle Title Redundancy Elimination & Journal wordCount", () => {
    it("strips redundant title text from subtitle when line 2 repeats line 1", () => {
      const body = "# Autumn Reflection\n\nAutumn Reflection is our annual retrospective event.\nWe review achievements.";
      const res = extractCleanTitleAndExcerpt(body);
      expect(res.title).toBe("Autumn Reflection");
      expect(res.excerpt).not.toMatch(/^Autumn Reflection/i);
      expect(res.excerpt).toBe("is our annual retrospective event. We review achievements.");
    });

    it("wordCount ignores raw markdown images and counts only text words", async () => {
      const { wordCount } = await import("@/stores/journal");
      const imgOnly = "![Photo](dayflit-image://12345.png)";
      expect(wordCount(imgOnly)).toBe(0);

      const mixed = "![Photo](dayflit-image://12345.png)\nThree actual words";
      expect(wordCount(mixed)).toBe(3);
    });
  });
});
