import { describe, expect, it } from "vitest";
import {
  type CanvasBoard,
  type CanvasNode,
  type CanvasStroke,
  type JSONCanvasData,
  exportToJSONCanvas,
  importFromJSONCanvas,
  detectEmbedType,
  transformEmbedUrl,
  markdownToDocBlocks,
  docBlocksToMarkdown,
  syncNoteToCanvasBoard,
  isNodeInsideFrame,
  translateFrameWithChildren,
  getPortPosition,
  calculateEdgePath,
  recalculateReadingOrders,
  getFrameContainedChildren,
  STICKY_COLOR_TO_JSON_CANVAS,
  JSON_CANVAS_TO_STICKY_COLOR,
} from "./canvas";

describe("JSON Canvas 1.0 Interoperability", () => {
  it("exports a board to valid JSON Canvas 1.0 specification", () => {
    const board: CanvasBoard = {
      id: "board_test",
      name: "Engineering Architecture",
      nodes: [
        {
          id: "n_frame",
          type: "group",
          x: 100,
          y: 100,
          width: 500,
          height: 400,
          label: "Frontend Architecture",
          color: "4",
          data: { subType: "group", title: "Frontend Architecture" },
        },
        {
          id: "n_task",
          type: "text",
          x: 140,
          y: 160,
          width: 260,
          height: 100,
          text: "- [ ] Implement SQLite sync",
          data: { subType: "task", taskTitle: "Implement SQLite sync", taskStatus: "open" },
        },
        {
          id: "n_embed",
          type: "link",
          x: 140,
          y: 280,
          width: 320,
          height: 180,
          url: "https://www.figma.com/file/12345/Design-System",
          data: { subType: "embed", embedUrl: "https://www.figma.com/file/12345/Design-System" },
        },
        {
          id: "n_note",
          type: "file",
          x: 440,
          y: 160,
          width: 240,
          height: 140,
          file: "notes/Architecture.md",
          data: { subType: "note", title: "Architecture" },
        },
      ],
      edges: [
        {
          id: "e_1",
          fromNode: "n_task",
          fromSide: "right",
          fromEnd: "none",
          toNode: "n_note",
          toSide: "left",
          toEnd: "arrow",
          label: "documented in",
        },
      ],
      viewport: { panX: 0, panY: 0, zoom: 1 },
      createdAt: 1000,
      updatedAt: 2000,
    };

    const exportedJson = exportToJSONCanvas(board);
    const parsed: JSONCanvasData = JSON.parse(exportedJson);

    expect(parsed.nodes).toHaveLength(4);
    expect(parsed.edges).toHaveLength(1);

    // Group node check
    const groupNode = parsed.nodes.find((n) => n.id === "n_frame");
    expect(groupNode).toBeDefined();
    expect(groupNode?.type).toBe("group");
    expect((groupNode as any).label).toBe("Frontend Architecture");
    expect(groupNode?.color).toBe("4");

    // Text / Task node check
    const taskNode = parsed.nodes.find((n) => n.id === "n_task");
    expect(taskNode?.type).toBe("text");
    expect((taskNode as any).text).toContain("- [ ] Implement SQLite sync");

    // Link node check
    const linkNode = parsed.nodes.find((n) => n.id === "n_embed");
    expect(linkNode?.type).toBe("link");
    expect((linkNode as any).url).toBe("https://www.figma.com/file/12345/Design-System");

    // File node check
    const fileNode = parsed.nodes.find((n) => n.id === "n_note");
    expect(fileNode?.type).toBe("file");
    expect((fileNode as any).file).toBe("notes/Architecture.md");

    // Edge check
    const edge = parsed.edges[0];
    expect(edge.fromNode).toBe("n_task");
    expect(edge.fromSide).toBe("right");
    expect(edge.toNode).toBe("n_note");
    expect(edge.toSide).toBe("left");
    expect(edge.toEnd).toBe("arrow");
    expect(edge.label).toBe("documented in");
  });

  it("imports standard Obsidian JSON Canvas 1.0 files seamlessly", () => {
    const rawObsidianCanvas: JSONCanvasData = {
      nodes: [
        { id: "obs_1", type: "text", x: 50, y: 50, width: 250, height: 120, text: "- [x] Finished research" },
        { id: "obs_2", type: "link", x: 350, y: 50, width: 400, height: 300, url: "https://youtu.be/dQw4w9WgXcQ" },
        { id: "obs_3", type: "group", x: 20, y: 20, width: 780, height: 360, label: "Obsidian Frame" },
      ],
      edges: [
        { id: "edge_obs", fromNode: "obs_1", fromSide: "right", toNode: "obs_2", toSide: "left", label: "source" },
      ],
    };

    const importedBoard = importFromJSONCanvas(rawObsidianCanvas, "imported_1", "Imported Obsidian Vault");
    expect(importedBoard.id).toBe("imported_1");
    expect(importedBoard.name).toBe("Imported Obsidian Vault");
    expect(importedBoard.nodes).toHaveLength(3);
    expect(importedBoard.edges).toHaveLength(1);

    // Node 1 should be recognized as a completed task
    const taskNode = importedBoard.nodes.find((n) => n.id === "obs_1");
    expect(taskNode?.data.subType).toBe("task");
    expect(taskNode?.data.taskStatus).toBe("done");
    expect(taskNode?.data.taskTitle).toBe("Finished research");

    // Node 2 should be recognized as a YouTube embed
    const embedNode = importedBoard.nodes.find((n) => n.id === "obs_2");
    expect(embedNode?.data.subType).toBe("embed");
    expect(embedNode?.data.embedType).toBe("youtube");

    // Node 3 should be recognized as a group Frame
    const groupNode = importedBoard.nodes.find((n) => n.id === "obs_3");
    expect(groupNode?.type).toBe("group");
    expect(groupNode?.label).toBe("Obsidian Frame");
  });

  it("preserves round-trip fidelity between DayFlit and JSON Canvas 1.0", () => {
    const originalBoard: CanvasBoard = {
      id: "rt_board",
      name: "Roundtrip Board",
      nodes: [
        {
          id: "node_a",
          type: "text",
          x: 200,
          y: 300,
          width: 300,
          height: 150,
          text: "Idea A",
          data: { subType: "sticky", stickyColor: "emerald" },
        },
      ],
      edges: [],
      viewport: { panX: 10, panY: 20, zoom: 1.2 },
      createdAt: 12345,
      updatedAt: 67890,
    };

    const exported = exportToJSONCanvas(originalBoard);
    const reimported = importFromJSONCanvas(exported, "rt_board", "Roundtrip Board");

    expect(reimported.nodes).toHaveLength(1);
    expect(reimported.nodes[0].id).toBe("node_a");
    expect(reimported.nodes[0].text).toBe("Idea A");
    expect(reimported.nodes[0].x).toBe(200);
    expect(reimported.nodes[0].y).toBe(300);
  });
});

describe("Smart Embed URL Transformers", () => {
  it("detects embed types accurately", () => {
    expect(detectEmbedType("https://www.figma.com/file/abcd/design")).toBe("figma");
    expect(detectEmbedType("https://www.figma.com/design/xyz/flow")).toBe("figma");
    expect(detectEmbedType("https://excalidraw.com/#room=123")).toBe("excalidraw");
    expect(detectEmbedType("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(detectEmbedType("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(detectEmbedType("https://www.loom.com/share/987654321")).toBe("loom");
    expect(detectEmbedType("https://notion.so/myworkspace/doc-123")).toBe("notion");
    expect(detectEmbedType("https://github.com/dayflit")).toBe("generic");
  });

  it("transforms Figma URLs into embed iframes", () => {
    const figmaFile = "https://www.figma.com/file/LKjshd823/DayFlit-UI?node-id=0%3A1";
    const transformed = transformEmbedUrl(figmaFile);
    expect(transformed).toContain("https://www.figma.com/embed?embed_host=dayflit&url=");
    expect(transformed).toContain(encodeURIComponent(figmaFile));
  });

  it("transforms YouTube watch links and short links into embed players", () => {
    const ytWatch = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(transformEmbedUrl(ytWatch)).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&rel=0");

    const ytShort = "https://youtu.be/dQw4w9WgXcQ";
    expect(transformEmbedUrl(ytShort)).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&rel=0");
  });

  it("transforms Loom share links into embed players", () => {
    const loom = "https://www.loom.com/share/a1b2c3d4e5";
    expect(transformEmbedUrl(loom)).toBe("https://www.loom.com/embed/a1b2c3d4e5");
  });
});

describe("AFFiNE Edgeless Mode: Bidirectional Markdown Block Synchronization", () => {
  it("splits markdown into structured doc blocks with reading order", () => {
    const markdown = `# Architecture Overview

This is the system architecture for the infinite canvas.

- [ ] Support JSON Canvas 1.0
- [x] Unblock CSP in WebView2

\`\`\`typescript
const canvas = new Canvas();
\`\`\`

> Note: Frames contain children spatially.`;

    const blocks = markdownToDocBlocks(markdown);
    expect(blocks).toHaveLength(5);

    expect(blocks[0].type).toBe("heading");
    expect(blocks[0].content).toBe("# Architecture Overview");
    expect(blocks[0].order).toBe(1);

    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[1].content).toContain("This is the system architecture");
    expect(blocks[1].order).toBe(2);

    expect(blocks[2].type).toBe("checklist");
    expect(blocks[2].content).toContain("- [ ] Support JSON Canvas 1.0");
    expect(blocks[2].order).toBe(3);

    expect(blocks[3].type).toBe("code");
    expect(blocks[3].content).toContain("const canvas = new Canvas();");
    expect(blocks[3].order).toBe(4);

    expect(blocks[4].type).toBe("callout");
    expect(blocks[4].content).toContain("> Note: Frames contain children");
    expect(blocks[4].order).toBe(5);
  });

  it("reconstructs linear markdown from ordered canvas doc block cards", () => {
    const nodes: CanvasNode[] = [
      {
        id: "b2",
        type: "text",
        x: 100,
        y: 200,
        width: 300,
        height: 100,
        text: "Section 2 body paragraph.",
        data: { subType: "docBlock", order: 2, pinnedToDoc: true },
      },
      {
        id: "b1",
        type: "text",
        x: 100,
        y: 100,
        width: 300,
        height: 80,
        text: "# Section 1 Heading",
        data: { subType: "docBlock", order: 1, pinnedToDoc: true },
      },
      {
        id: "sticky_unpinned",
        type: "text",
        x: 500,
        y: 100,
        width: 200,
        height: 150,
        text: "Rough brainstorming note that shouldn't be in doc",
        data: { subType: "sticky", pinnedToDoc: false },
      },
      {
        id: "b3",
        type: "text",
        x: 100,
        y: 320,
        width: 300,
        height: 100,
        text: "- [ ] Step 3 item",
        data: { subType: "docBlock", order: 3, pinnedToDoc: true },
      },
    ];

    const markdown = docBlocksToMarkdown(nodes);

    // Reading order should be 1 -> 2 -> 3
    const expected = `# Section 1 Heading\n\nSection 2 body paragraph.\n\n- [ ] Step 3 item`;
    expect(markdown).toBe(expected);
    // Unpinned sticky note should not appear in doc
    expect(markdown).not.toContain("Rough brainstorming note");
  });

  it("syncNoteToCanvasBoard preserves positions of existing block cards", () => {
    const noteId = "note_123";
    const initialMarkdown = "# Title\n\nFirst paragraph.";
    const board1 = syncNoteToCanvasBoard(noteId, "My Note", initialMarkdown);

    // Move first paragraph to custom coordinate
    board1.nodes[1].x = 650;
    board1.nodes[1].y = 420;

    // Now update markdown with a new third block appended
    const updatedMarkdown = "# Title\n\nFirst paragraph.\n\n- [ ] Brand new checklist item";
    const board2 = syncNoteToCanvasBoard(noteId, "My Note", updatedMarkdown, board1);

    expect(board2.nodes).toHaveLength(3);
    // The existing paragraph node must retain its moved coordinates!
    const paraNode = board2.nodes.find((n) => n.text === "First paragraph.");
    expect(paraNode?.x).toBe(650);
    expect(paraNode?.y).toBe(420);

    // The new block should be added
    const newBlock = board2.nodes.find((n) => n.text === "- [ ] Brand new checklist item");
    expect(newBlock).toBeDefined();
    expect(newBlock?.data.order).toBe(3);
  });
});

describe("Spatial Frames & Containment Math", () => {
  const frame: CanvasNode = {
    id: "frame_1",
    type: "group",
    x: 100,
    y: 100,
    width: 600,
    height: 400,
    label: "Team Roadmap",
    data: { subType: "group" },
  };

  it("detects nodes contained inside a frame accurately", () => {
    const insideNode: CanvasNode = {
      id: "child_1",
      type: "text",
      x: 200,
      y: 200,
      width: 200,
      height: 100,
      text: "Inside Card",
      data: { subType: "text" },
    };

    const outsideNode: CanvasNode = {
      id: "outside_1",
      type: "text",
      x: 800,
      y: 600,
      width: 200,
      height: 100,
      text: "Outside Card",
      data: { subType: "text" },
    };

    expect(isNodeInsideFrame(insideNode, frame)).toBe(true);
    expect(isNodeInsideFrame(outsideNode, frame)).toBe(false);
    expect(isNodeInsideFrame(frame, frame)).toBe(false);
  });

  it("translates frame and all contained child nodes by delta (dx, dy)", () => {
    const childNode: CanvasNode = {
      id: "child_1",
      type: "text",
      x: 150,
      y: 150,
      width: 200,
      height: 100,
      text: "Grouped task",
      data: { subType: "task" },
    };

    const outsideNode: CanvasNode = {
      id: "outside_1",
      type: "text",
      x: 900,
      y: 900,
      width: 200,
      height: 100,
      text: "Independent card",
      data: { subType: "note" },
    };

    const strokeInside: CanvasStroke = {
      id: "stroke_1",
      tool: "pen",
      color: "#ff0000",
      width: 2,
      points: [{ x: 250, y: 250 }, { x: 260, y: 260 }],
    };

    const nodes = [frame, childNode, outsideNode];
    const strokes = [strokeInside];

    // Drag the frame by dx = +50, dy = +30
    const result = translateFrameWithChildren("frame_1", { dx: 50, dy: 30 }, nodes, strokes);

    // Frame position updated
    const updatedFrame = result.nodes.find((n) => n.id === "frame_1")!;
    expect(updatedFrame.x).toBe(150);
    expect(updatedFrame.y).toBe(130);

    // Child node inside frame moved by +50, +30
    const updatedChild = result.nodes.find((n) => n.id === "child_1")!;
    expect(updatedChild.x).toBe(200);
    expect(updatedChild.y).toBe(180);

    // Outside node untouched
    const updatedOutside = result.nodes.find((n) => n.id === "outside_1")!;
    expect(updatedOutside.x).toBe(900);
    expect(updatedOutside.y).toBe(900);

    // Stroke points inside moved by +50, +30
    const updatedStroke = result.strokes[0];
    expect(updatedStroke.points[0].x).toBe(300);
    expect(updatedStroke.points[0].y).toBe(280);
  });
});

describe("Magnetic Ports & Edge Path Geometry", () => {
  const nodeA = { x: 100, y: 100, width: 200, height: 100 };
  const nodeB = { x: 500, y: 300, width: 200, height: 100 };

  it("calculates exact magnetic 4-side port positions", () => {
    expect(getPortPosition(nodeA, "top")).toEqual({ x: 200, y: 100 });
    expect(getPortPosition(nodeA, "right")).toEqual({ x: 300, y: 150 });
    expect(getPortPosition(nodeA, "bottom")).toEqual({ x: 200, y: 200 });
    expect(getPortPosition(nodeA, "left")).toEqual({ x: 100, y: 150 });
  });

  it("generates valid SVG bezier, elbow, and straight paths", () => {
    const p1 = getPortPosition(nodeA, "right");
    const p2 = getPortPosition(nodeB, "left");

    // Bezier
    const bezier = calculateEdgePath(p1, "right", p2, "left", "bezier");
    expect(bezier.path).toContain("M 300 150 C");
    expect(bezier.labelPos.x).toBe(400);

    // Elbow
    const elbow = calculateEdgePath(p1, "right", p2, "left", "elbow");
    expect(elbow.path).toContain("M 300 150 L 400 150 L 400 350 L 500 350");

    // Straight
    const straight = calculateEdgePath(p1, "right", p2, "left", "straight");
    expect(straight.path).toBe("M 300 150 L 500 350");
  });
});

describe("AFFiNE Reading Order Recalculation & Spatial Geometry", () => {
  it("recalculates reading orders in spatial column-aware sequence", () => {
    const nodes: CanvasNode[] = [
      // Column 2 (x = 500)
      {
        id: "c2_top",
        type: "text",
        x: 500,
        y: 100,
        width: 300,
        height: 100,
        text: "Col 2 Top",
        data: { subType: "docBlock", order: 99, pinnedToDoc: true },
      },
      // Column 1 (x = 100) - bottom
      {
        id: "c1_bottom",
        type: "text",
        x: 100,
        y: 350,
        width: 300,
        height: 100,
        text: "Col 1 Bottom",
        data: { subType: "docBlock", order: 99, pinnedToDoc: true },
      },
      // Column 1 (x = 100) - top
      {
        id: "c1_top",
        type: "text",
        x: 100,
        y: 80,
        width: 300,
        height: 100,
        text: "Col 1 Top",
        data: { subType: "docBlock", order: 99, pinnedToDoc: true },
      },
      // Unpinned sticky note (should not receive order)
      {
        id: "sticky_free",
        type: "text",
        x: 200,
        y: 200,
        width: 200,
        height: 200,
        text: "Free Idea",
        data: { subType: "sticky", pinnedToDoc: false },
      },
    ];

    const result = recalculateReadingOrders(nodes);

    const c1Top = result.find((n) => n.id === "c1_top")!;
    const c1Bottom = result.find((n) => n.id === "c1_bottom")!;
    const c2Top = result.find((n) => n.id === "c2_top")!;
    const sticky = result.find((n) => n.id === "sticky_free")!;

    expect(c1Top.data.order).toBe(1);
    expect(c1Bottom.data.order).toBe(2);
    expect(c2Top.data.order).toBe(3);
    expect(sticky.data.order).toBeUndefined();
  });
});

describe("Frame Child Containment Capture", () => {
  it("captures contained child nodes and strokes without capturing bystander items", () => {
    const frame: CanvasNode = {
      id: "f_target",
      type: "group",
      x: 200,
      y: 200,
      width: 400,
      height: 300,
      data: { subType: "group" },
    };

    const insideNode: CanvasNode = {
      id: "in_card",
      type: "text",
      x: 250,
      y: 250,
      width: 150,
      height: 80,
      data: { subType: "task" },
    };

    const outsideNode: CanvasNode = {
      id: "out_card",
      type: "text",
      x: 700,
      y: 700,
      width: 150,
      height: 80,
      data: { subType: "task" },
    };

    const insideStroke: CanvasStroke = {
      id: "s_in",
      tool: "pen",
      color: "#000",
      width: 2,
      points: [{ x: 300, y: 300 }, { x: 310, y: 310 }],
    };

    const outsideStroke: CanvasStroke = {
      id: "s_out",
      tool: "pen",
      color: "#000",
      width: 2,
      points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    };

    const nodes = [frame, insideNode, outsideNode];
    const strokes = [insideStroke, outsideStroke];

    const captured = getFrameContainedChildren("f_target", nodes, strokes);

    expect(captured.childNodeIds.has("in_card")).toBe(true);
    expect(captured.childNodeIds.has("out_card")).toBe(false);
    expect(captured.childNodeIds.has("f_target")).toBe(false);

    expect(captured.childStrokeIds.has("s_in")).toBe(true);
    expect(captured.childStrokeIds.has("s_out")).toBe(false);
  });
});

describe("Sticky Colors & JSON Canvas 1.0 Spec Compatibility", () => {
  it("maps sticky note paper tints to JSON Canvas 1.0 preset colors and back", () => {
    expect(STICKY_COLOR_TO_JSON_CANVAS["amber"]).toBe("3");
    expect(STICKY_COLOR_TO_JSON_CANVAS["emerald"]).toBe("4");
    expect(STICKY_COLOR_TO_JSON_CANVAS["sky"]).toBe("5");
    expect(STICKY_COLOR_TO_JSON_CANVAS["violet"]).toBe("6");
    expect(STICKY_COLOR_TO_JSON_CANVAS["rose"]).toBe("1");

    expect(JSON_CANVAS_TO_STICKY_COLOR["3"]).toBe("amber");
    expect(JSON_CANVAS_TO_STICKY_COLOR["4"]).toBe("emerald");
    expect(JSON_CANVAS_TO_STICKY_COLOR["5"]).toBe("sky");
    expect(JSON_CANVAS_TO_STICKY_COLOR["6"]).toBe("violet");
    expect(JSON_CANVAS_TO_STICKY_COLOR["1"]).toBe("rose");

    const board: CanvasBoard = {
      id: "b_sticky",
      name: "Sticky Test",
      nodes: [
        {
          id: "s1",
          type: "text",
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          text: "Important Notice",
          color: "4",
          data: { subType: "sticky", stickyColor: "emerald" },
        },
      ],
      edges: [],
      viewport: { panX: 0, panY: 0, zoom: 1 },
      createdAt: 1000,
      updatedAt: 1000,
    };

    const jsonStr = exportToJSONCanvas(board);
    const parsed: JSONCanvasData = JSON.parse(jsonStr);
    expect(parsed.nodes[0].color).toBe("4");

    const reimported = importFromJSONCanvas(jsonStr, "b_reimp", "Reimported");
    expect(reimported.nodes[0].data.stickyColor).toBe("emerald");
  });
});

describe("Defensive JSON Canvas Import & Malformed Data", () => {
  it("handles missing or malformed node/edge schemas without crashing", () => {
    const malformed = {
      nodes: [
        {
          // missing id, x, y
          type: "text",
          text: "Incomplete node",
        },
        null,
        {
          id: "valid_group",
          type: "group",
          x: 50,
          y: 60,
          width: 200,
          height: 150,
          label: "Safety Frame",
        },
      ],
      edges: [
        {
          id: "e_bad",
          fromNode: "missing_1",
          toNode: "missing_2",
          // missing sides
        },
      ],
    };

    const board = importFromJSONCanvas(malformed as any, "safe_board", "Safe");
    expect(board.nodes.length).toBeGreaterThanOrEqual(1);
    const frame = board.nodes.find((n) => n.id === "valid_group");
    expect(frame).toBeDefined();
    expect(frame?.label).toBe("Safety Frame");
  });
});

describe("Bidirectional Note Synchronization Invariants", () => {
  it("guarantees 1-to-1 block matching without duplicate IDs or card stacking", () => {
    const noteId = "note_inv_1";
    const doc1 = "# Section A\n\nFirst paragraph content.\n\nSecond paragraph content.";
    const board1 = syncNoteToCanvasBoard(noteId, "Sync Doc", doc1);

    expect(board1.nodes).toHaveLength(3);
    const ids1 = board1.nodes.map((n) => n.id);
    const uniqueIds1 = new Set(ids1);
    expect(uniqueIds1.size).toBe(3);

    // Edit text in paragraph 1
    const doc2 = "# Section A\n\nFirst paragraph edited text.\n\nSecond paragraph content.";
    const board2 = syncNoteToCanvasBoard(noteId, "Sync Doc", doc2, board1);

    expect(board2.nodes).toHaveLength(3);
    const ids2 = board2.nodes.map((n) => n.id);
    const uniqueIds2 = new Set(ids2);
    expect(uniqueIds2.size).toBe(3);

    // Unchanged paragraph 2 should keep its exact ID and coordinates
    const p2_1 = board1.nodes.find((n) => n.text === "Second paragraph content.")!;
    const p2_2 = board2.nodes.find((n) => n.text === "Second paragraph content.")!;
    expect(p2_2.id).toBe(p2_1.id);
    expect(p2_2.x).toBe(p2_1.x);
    expect(p2_2.y).toBe(p2_1.y);
  });
});

