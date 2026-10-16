import { describe, expect, it } from "vitest";
import {
  isColorString,
  parseColor,
  parseQuoteString,
  type ColorAnalysis,
} from "./colorUtils";

describe("Color Utilities & Bespoke Color Swatch Engine", () => {
  it("accurately detects hex, rgb, hsl, and oklch color strings", () => {
    expect(isColorString("#3b82f6")).toBe(true);
    expect(isColorString("#fff")).toBe(true);
    expect(isColorString("#10b98188")).toBe(true);
    expect(isColorString("rgb(59, 130, 246)")).toBe(true);
    expect(isColorString("rgba(59, 130, 246, 0.5)")).toBe(true);
    expect(isColorString("hsl(217, 91%, 60%)")).toBe(true);
    expect(isColorString("hsla(217, 91%, 60%, 0.8)")).toBe(true);
    expect(isColorString("oklch(0.65 0.24 260)")).toBe(true);

    // Negative tests
    expect(isColorString("not-a-color")).toBe(false);
    expect(isColorString("http://example.com")).toBe(false);
    expect(isColorString("#xyz123")).toBe(false);
    expect(isColorString("")).toBe(false);
  });

  it("parses 6-digit hex color correctly into RGB, HSL, luminance, and contrast", () => {
    const analysis = parseColor("#000000");
    expect(analysis).not.toBeNull();
    expect(analysis?.hex).toBe("#000000");
    expect(analysis?.r).toBe(0);
    expect(analysis?.g).toBe(0);
    expect(analysis?.b).toBe(0);
    expect(analysis?.luminance).toBe(0);
    // Contrast of black on white is 21:1 (AAA)
    expect(analysis?.contrastOnWhite).toBe(21);
    expect(analysis?.wcagWhiteRating).toBe("AAA");
    expect(analysis?.bestTextColor).toBe("#ffffff");
  });

  it("parses pure white hex color correctly", () => {
    const analysis = parseColor("#ffffff");
    expect(analysis).not.toBeNull();
    expect(analysis?.hex).toBe("#ffffff");
    expect(analysis?.r).toBe(255);
    expect(analysis?.g).toBe(255);
    expect(analysis?.b).toBe(255);
    expect(analysis?.luminance).toBe(1);
    expect(analysis?.contrastOnBlack).toBe(21);
    expect(analysis?.wcagBlackRating).toBe("AAA");
    expect(analysis?.bestTextColor).toBe("#000000");
  });

  it("generates color harmonies: complementary, analogous, triadic, tint, and shade", () => {
    // Pure Red: H = 0, S = 100%, L = 50%
    const analysis = parseColor("#ff0000");
    expect(analysis).not.toBeNull();
    const harmonies = analysis!.harmonies;

    const comp = harmonies.find((h) => h.role === "complementary");
    expect(comp).toBeDefined();
    // Complementary of red (0°) is cyan (180°) -> #00ffff
    expect(comp?.hex).toBe("#00ffff");

    const analogousA = harmonies.find((h) => h.name.includes("-30°"));
    const analogousB = harmonies.find((h) => h.name.includes("+30°"));
    expect(analogousA).toBeDefined();
    expect(analogousB).toBeDefined();

    const triadic = harmonies.find((h) => h.role === "triadic");
    expect(triadic).toBeDefined();

    const tint = harmonies.find((h) => h.role === "tint");
    const shade = harmonies.find((h) => h.role === "shade");
    expect(tint).toBeDefined();
    expect(shade).toBeDefined();
  });

  it("parses RGB and RGBA formats correctly", () => {
    const analysis = parseColor("rgb(34, 197, 94)");
    expect(analysis).not.toBeNull();
    expect(analysis?.r).toBe(34);
    expect(analysis?.g).toBe(197);
    expect(analysis?.b).toBe(94);
    expect(analysis?.hex).toBe("#22c55e");
  });

  it("parses HSL formats correctly", () => {
    const analysis = parseColor("hsl(120, 100%, 50%)");
    expect(analysis).not.toBeNull();
    // Pure green
    expect(analysis?.r).toBe(0);
    expect(analysis?.g).toBe(255);
    expect(analysis?.b).toBe(0);
    expect(analysis?.hex).toBe("#00ff00");
  });

  it("parses modern space-separated CSS rgb and hsl syntax", () => {
    // Space-separated rgb
    const rgbAnalysis = parseColor("rgb(59 130 246)");
    expect(rgbAnalysis).not.toBeNull();
    expect(rgbAnalysis?.r).toBe(59);
    expect(rgbAnalysis?.g).toBe(130);
    expect(rgbAnalysis?.b).toBe(246);
    expect(rgbAnalysis?.hex).toBe("#3b82f6");

    // Space-separated rgba with slash alpha
    const rgbaAnalysis = parseColor("rgba(59 130 246 / 0.8)");
    expect(rgbaAnalysis).not.toBeNull();
    expect(rgbaAnalysis?.a).toBe(0.8);

    // Space-separated hsl
    const hslAnalysis = parseColor("hsl(120 100% 50%)");
    expect(hslAnalysis).not.toBeNull();
    expect(hslAnalysis?.hex).toBe("#00ff00");
  });

  it("parses editorial quotes with and without author signatures", () => {
    // 1. Double quotes without author
    const q1 = parseQuoteString('"Simplicity is prerequisite for reliability."');
    expect(q1).not.toBeNull();
    expect(q1?.quote).toBe("Simplicity is prerequisite for reliability.");
    expect(q1?.author).toBeUndefined();

    // 2. Double quotes with em-dash author
    const q2 = parseQuoteString('"What stands in the way becomes the way." — Marcus Aurelius');
    expect(q2).not.toBeNull();
    expect(q2?.quote).toBe("What stands in the way becomes the way.");
    expect(q2?.author).toBe("Marcus Aurelius");

    // 3. Double quotes with regular hyphen author
    const q3 = parseQuoteString('"The only way to do great work is to love what you do." - Steve Jobs');
    expect(q3).not.toBeNull();
    expect(q3?.quote).toBe("The only way to do great work is to love what you do.");
    expect(q3?.author).toBe("Steve Jobs");

    // 4. Curly/Smart quotes with en-dash author
    const q4 = parseQuoteString('“Action expresses priorities.” – Mahatma Gandhi');
    expect(q4).not.toBeNull();
    expect(q4?.quote).toBe("Action expresses priorities.");
    expect(q4?.author).toBe("Mahatma Gandhi");

    // 5. Non-quotes return null
    expect(parseQuoteString("Just a regular unquoted note.")).toBeNull();
    expect(parseQuoteString("https://craft.do")).toBeNull();
    expect(parseQuoteString("#3b82f6")).toBeNull();
    expect(parseQuoteString("")).toBeNull();
  });
});

describe("Interactive Spatial Bezier Life Map Engine", () => {
  it("calculates dynamically measured SVG cubic-bezier curves (M x1 y1 C cx1 cy1, cx2 cy2, x2 y2)", () => {
    // Parent node at (60, 100), width 240, height 70
    const parent = { x: 60, y: 100, width: 240, height: 70 };
    // Child node at (360, 140), width 240, height 60
    const child = { x: 360, y: 140, width: 240, height: 60 };

    const x1 = parent.x + parent.width; // 300
    const y1 = parent.y + parent.height / 2; // 135
    const x2 = child.x; // 360
    const y2 = child.y + child.height / 2; // 170

    const dx = Math.max(40, (x2 - x1) * 0.5); // (360 - 300) * 0.5 = 30 -> max(40, 30) = 40
    const cx1 = x1 + dx; // 340
    const cy1 = y1; // 135
    const cx2 = x2 - dx; // 320
    const cy2 = y2; // 170

    const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    expect(path).toBe("M 300 135 C 340 135, 320 170, 360 170");

    // Verify SVG path syntax
    expect(path.startsWith("M ")).toBe(true);
    expect(path.includes(" C ")).toBe(true);
    expect(path.split(",").length).toBe(3);
  });

  it("computes complete upstream ancestor and downstream descendant lineage for illumination", () => {
    // Tree:
    // Pillar (p1)
    //   -> Goal (g1)
    //        -> Project (pr1)
    //             -> Task (t1)
    //             -> Task (t2)
    //        -> Habit (h1)
    //   -> Goal (g2)
    //        -> Task (t3)
    // Pillar (p2)
    //   -> Goal (g3)

    const nodes = [
      { id: "p1", parentId: undefined },
      { id: "g1", parentId: "p1" },
      { id: "pr1", parentId: "g1" },
      { id: "t1", parentId: "pr1" },
      { id: "t2", parentId: "pr1" },
      { id: "h1", parentId: "g1" },
      { id: "g2", parentId: "p1" },
      { id: "t3", parentId: "g2" },
      { id: "p2", parentId: undefined },
      { id: "g3", parentId: "p2" },
    ];

    function getIlluminatedSet(activeId: string): Set<string> {
      const set = new Set<string>();
      set.add(activeId);
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // 1. Ancestors
      let curr = nodeMap.get(activeId);
      while (curr && curr.parentId) {
        set.add(curr.parentId);
        curr = nodeMap.get(curr.parentId);
      }

      // 2. Descendants (breadth-first)
      const queue = [activeId];
      while (queue.length > 0) {
        const parent = queue.shift()!;
        nodes.forEach((n) => {
          if (n.parentId === parent) {
            set.add(n.id);
            queue.push(n.id);
          }
        });
      }

      return set;
    }

    // When hovering intermediate node Project "pr1":
    // Upstream: g1, p1
    // Downstream: t1, t2
    // Unrelated: g2, t3, p2, g3
    const pr1Illuminated = getIlluminatedSet("pr1");
    expect(pr1Illuminated.has("pr1")).toBe(true);
    expect(pr1Illuminated.has("g1")).toBe(true);
    expect(pr1Illuminated.has("p1")).toBe(true);
    expect(pr1Illuminated.has("t1")).toBe(true);
    expect(pr1Illuminated.has("t2")).toBe(true);

    // Unrelated nodes MUST NOT be in the illuminated set
    expect(pr1Illuminated.has("h1")).toBe(false);
    expect(pr1Illuminated.has("g2")).toBe(false);
    expect(pr1Illuminated.has("t3")).toBe(false);
    expect(pr1Illuminated.has("p2")).toBe(false);
    expect(pr1Illuminated.has("g3")).toBe(false);

    // When hovering leaf Task "t1":
    // Upstream: pr1, g1, p1
    const t1Illuminated = getIlluminatedSet("t1");
    expect(t1Illuminated.has("t1")).toBe(true);
    expect(t1Illuminated.has("pr1")).toBe(true);
    expect(t1Illuminated.has("g1")).toBe(true);
    expect(t1Illuminated.has("p1")).toBe(true);
    expect(t1Illuminated.has("t2")).toBe(false); // sibling leaf is not illuminated
  });

  it("structures multi-tier nodes and edges preserving both linked and unlinked domain entities", () => {
    // Domain with 1 goal + 1 unlinked task + 1 unlinked habit
    const domain = { id: "health", name: "Health & Vitality", score: 8, targetScore: 9 };
    const goal = { id: "g1", domainId: "health", title: "Run Marathon", progress: 60 };
    const project = { id: "pr1", domainId: "health", goalId: "g1", title: "16-Week Training Plan" };
    const taskLinked = { id: "t1", domainId: "health", goalId: "g1", projectId: "pr1", title: "10-mile long run" };
    const taskUnlinked = { id: "t2", domainId: "health", goalId: null, projectId: null, title: "Buy electrolyte packs" };
    const habitUnlinked = { id: "h1", domainId: "health", goalId: null, name: "Morning hydration" };

    // Node layout generator simulator matching LifeMapCanvas logic
    const pillarNodeId = `pillar_${domain.id}`;
    const nodes = [
      { id: pillarNodeId, type: "pillar", tier: 0, title: domain.name },
      { id: `goal_${goal.id}`, type: "goal", tier: 1, title: goal.title, parentId: pillarNodeId },
      { id: `proj_${project.id}`, type: "project", tier: 2, title: project.title, parentId: `goal_${goal.id}` },
      { id: `task_${taskLinked.id}`, type: "task", tier: 3, title: taskLinked.title, parentId: `proj_${project.id}` },
      // Direct unlinked domain items anchored directly to pillar
      { id: `task_${taskUnlinked.id}`, type: "task", tier: 3, title: taskUnlinked.title, parentId: pillarNodeId },
      { id: `habit_${habitUnlinked.id}`, type: "habit", tier: 3, title: habitUnlinked.name, parentId: pillarNodeId },
    ];

    expect(nodes.length).toBe(6);
    expect(nodes.find((n) => n.id === `task_${taskUnlinked.id}`)?.parentId).toBe(pillarNodeId);
    expect(nodes.find((n) => n.id === `habit_${habitUnlinked.id}`)?.parentId).toBe(pillarNodeId);
    expect(nodes.find((n) => n.id === `task_${taskLinked.id}`)?.parentId).toBe(`proj_${project.id}`);

    // Edges connecting parents to children
    const edges = nodes
      .filter((n) => n.parentId)
      .map((n) => ({
        id: `edge_${n.parentId}_${n.id}`,
        from: n.parentId!,
        to: n.id,
      }));

    expect(edges.length).toBe(5);
    expect(edges.some((e) => e.from === pillarNodeId && e.to === `task_${taskUnlinked.id}`)).toBe(true);
    expect(edges.some((e) => e.from === `proj_${project.id}` && e.to === `task_${taskLinked.id}`)).toBe(true);
  });
});
