/**
 * Visual Workspace & Infinite Canvas Core Types, JSON Canvas 1.0 Spec,
 * Smart Embed Transformers, Frame Math & Doc-Canvas Bidirectional Sync.
 */

// ============================================================================
// 1. JSON Canvas 1.0 Specification Types (http://jsoncanvas.org/spec/1.0/)
// ============================================================================

export type JSONCanvasSide = "top" | "right" | "bottom" | "left";
export type JSONCanvasEnd = "none" | "arrow";

export interface JSONCanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string; // "1" to "6" or hex string e.g. "#4a90e2"
}

export interface JSONCanvasTextNode extends JSONCanvasNodeBase {
  type: "text";
  text: string;
}

export interface JSONCanvasFileNode extends JSONCanvasNodeBase {
  type: "file";
  file: string;
  subpath?: string;
}

export interface JSONCanvasLinkNode extends JSONCanvasNodeBase {
  type: "link";
  url: string;
}

export interface JSONCanvasGroupNode extends JSONCanvasNodeBase {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export type JSONCanvasNode =
  | JSONCanvasTextNode
  | JSONCanvasFileNode
  | JSONCanvasLinkNode
  | JSONCanvasGroupNode;

export interface JSONCanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: JSONCanvasSide;
  fromEnd?: JSONCanvasEnd;
  toNode: string;
  toSide?: JSONCanvasSide;
  toEnd?: JSONCanvasEnd;
  color?: string;
  label?: string;
}

export interface JSONCanvasData {
  nodes: JSONCanvasNode[];
  edges: JSONCanvasEdge[];
}

// ============================================================================
// 2. DayFlit Canvas Engine Types & Extensions
// ============================================================================

export type CanvasCardType =
  | "text"
  | "sticky"
  | "task"
  | "note"
  | "journal"
  | "life"
  | "embed"
  | "image"
  | "group"
  | "docBlock";

export interface CanvasNodeData {
  subType?: CanvasCardType;
  // Two-way bound entity references
  taskId?: string;
  noteId?: string;
  journalId?: string;
  lifeDomainId?: string;
  lifeGoalId?: string;
  // Sticky styling
  stickyColor?: string;
  // Frame styling
  frameTint?: string;
  // AFFiNE Doc Block synchronization
  blockId?: string;
  blockType?: "heading" | "section" | "checklist" | "code" | "callout" | "image" | "paragraph";
  order?: number;
  pinnedToDoc?: boolean;
  // Live Embed
  embedUrl?: string;
  embedType?: "figma" | "excalidraw" | "notion" | "youtube" | "loom" | "generic";
  viewMode?: "live" | "preview";
  interact?: boolean;
  // Tasks override state if detached or previewed
  taskTitle?: string;
  taskStatus?: "open" | "done";
  taskPriority?: "none" | "low" | "medium" | "high" | "urgent";
  // Custom label / title
  title?: string;
}

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  background?: string;
  data: CanvasNodeData;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: JSONCanvasSide;
  fromEnd?: JSONCanvasEnd;
  toNode: string;
  toSide: JSONCanvasSide;
  toEnd?: JSONCanvasEnd;
  color?: string;
  label?: string;
  routing?: "bezier" | "elbow" | "straight";
  dashed?: boolean;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface CanvasStroke {
  id: string;
  tool: "pen" | "highlighter" | "laser";
  color: string;
  width: number;
  points: StrokePoint[];
  createdAt?: number;
}

export interface CanvasViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CanvasBoard {
  id: string;
  name: string;
  noteId?: string | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  strokes?: CanvasStroke[];
  viewport: CanvasViewport;
  createdAt: number;
  updatedAt: number;
}

// Preset color map for JSON Canvas 1.0: "1" to "6"
export const JSON_CANVAS_COLORS: Record<string, string> = {
  "1": "#ef4444", // Red
  "2": "#f97316", // Orange
  "3": "#eab308", // Yellow
  "4": "#10b981", // Green
  "5": "#06b6d4", // Cyan
  "6": "#8b5cf6", // Purple
};

export const STICKY_COLOR_TO_JSON_CANVAS: Record<string, string> = {
  amber: "3",
  emerald: "4",
  sky: "5",
  violet: "6",
  rose: "1",
  slate: "6",
};

export const JSON_CANVAS_TO_STICKY_COLOR: Record<string, string> = {
  "1": "rose",
  "2": "amber",
  "3": "amber",
  "4": "emerald",
  "5": "sky",
  "6": "violet",
};

export const STICKY_PALETTE = [
  { id: "amber", bg: "#fef3c7", border: "#f59e0b", fg: "#78350f", darkBg: "#451a03", darkBorder: "#b45309", darkFg: "#fef3c7" },
  { id: "emerald", bg: "#d1fae5", border: "#10b981", fg: "#064e3b", darkBg: "#064e3b", darkBorder: "#059669", darkFg: "#ecfdf5" },
  { id: "sky", bg: "#e0f2fe", border: "#0ea5e9", fg: "#0c4a6e", darkBg: "#082f49", darkBorder: "#0284c7", darkFg: "#f0f9ff" },
  { id: "violet", bg: "#ede9fe", border: "#8b5cf6", fg: "#4c1d95", darkBg: "#2e1065", darkBorder: "#7c3aed", darkFg: "#f5f3ff" },
  { id: "rose", bg: "#ffe4e6", border: "#f43f5e", fg: "#881337", darkBg: "#4c0519", darkBorder: "#e11d48", darkFg: "#fff1f2" },
  { id: "slate", bg: "#f1f5f9", border: "#64748b", fg: "#0f172a", darkBg: "#0f172a", darkBorder: "#475569", darkFg: "#f8fafc" },
];

// ============================================================================
// 3. JSON Canvas 1.0 Import & Export Serialization
// ============================================================================

/**
 * Converts a DayFlit CanvasBoard into a standard JSON Canvas 1.0 specification string.
 * Ensures 100% interoperability with Obsidian Canvas.
 */
export function exportToJSONCanvas(board: CanvasBoard): string {
  const jsonNodes: JSONCanvasNode[] = board.nodes.map((n) => {
    const stickyColor = n.data.stickyColor;
    const mappedColor = n.color || (stickyColor ? STICKY_COLOR_TO_JSON_CANVAS[stickyColor] : undefined);

    const base: JSONCanvasNodeBase = {
      id: n.id,
      x: Math.round(n.x),
      y: Math.round(n.y),
      width: Math.round(n.width),
      height: Math.round(n.height),
      ...(mappedColor ? { color: mappedColor } : {}),
    };

    // If it's a group / frame
    if (n.type === "group" || n.data.subType === "group") {
      const gNode: JSONCanvasGroupNode = {
        ...base,
        type: "group",
        label: n.label || n.data.title || undefined,
        background: n.background || undefined,
      };
      return gNode;
    }

    // If it's an external link or embed
    if (n.type === "link" || n.data.subType === "embed") {
      const lNode: JSONCanvasLinkNode = {
        ...base,
        type: "link",
        url: n.url || n.data.embedUrl || "",
      };
      return lNode;
    }

    // If it's a local file / note / image reference
    if (n.type === "file" || n.data.subType === "note" || n.data.subType === "image") {
      let filePath = n.file || "";
      if (!filePath && n.data.subType === "note") {
        filePath = `notes/${n.data.title || n.id}.md`;
      } else if (filePath.startsWith("dayflit-image://")) {
        filePath = `attachments/${filePath.replace("dayflit-image://", "")}`;
      }
      const fNode: JSONCanvasFileNode = {
        ...base,
        type: "file",
        file: filePath,
      };
      return fNode;
    }

    // Default: text node (tasks, sticky notes, plain text, doc blocks)
    let textContent = n.text || "";
    if (n.data.subType === "task") {
      const check = n.data.taskStatus === "done" ? "[x]" : "[ ]";
      textContent = `- ${check} ${n.data.taskTitle || textContent}`;
    }
    const tNode: JSONCanvasTextNode = {
      ...base,
      type: "text",
      text: textContent,
    };
    return tNode;
  });

  const jsonEdges: JSONCanvasEdge[] = board.edges.map((e) => ({
    id: e.id,
    fromNode: e.fromNode,
    fromSide: e.fromSide,
    fromEnd: e.fromEnd || "none",
    toNode: e.toNode,
    toSide: e.toSide,
    toEnd: e.toEnd || "arrow",
    ...(e.color ? { color: e.color } : {}),
    ...(e.label ? { label: e.label } : {}),
  }));

  const payload: JSONCanvasData = {
    nodes: jsonNodes,
    edges: jsonEdges,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and converts a JSON Canvas 1.0 object/string into a DayFlit CanvasBoard.
 */
export function importFromJSONCanvas(
  rawJson: string | JSONCanvasData,
  boardId?: string,
  boardName?: string
): CanvasBoard {
  const rawData: any =
    typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  const data: JSONCanvasData =
    rawData && typeof rawData === "object" ? rawData : { nodes: [], edges: [] };

  const validSides: JSONCanvasSide[] = ["top", "right", "bottom", "left"];

  const nodes: CanvasNode[] = (data.nodes || [])
    .filter((n): n is JSONCanvasNode => Boolean(n && typeof n === "object"))
    .map((n, idx) => {
      let subType: CanvasCardType = "text";
      let text = "";
      let file = "";
      let url = "";
      let label = "";
      const nodeData: CanvasNodeData = {};

      if (n.type === "group") {
        subType = "group";
        label = (n as JSONCanvasGroupNode).label || "Frame";
        nodeData.title = label;
      } else if (n.type === "link") {
        subType = "embed";
        url = (n as JSONCanvasLinkNode).url || "";
        nodeData.embedUrl = url;
        nodeData.embedType = detectEmbedType(url);
        nodeData.viewMode = "live";
      } else if (n.type === "file") {
        file = (n as JSONCanvasFileNode).file || "";
        if (
          file.endsWith(".png") ||
          file.endsWith(".jpg") ||
          file.endsWith(".jpeg") ||
          file.endsWith(".webp") ||
          file.endsWith(".gif") ||
          file.startsWith("dayflit-image://") ||
          file.startsWith("attachments/")
        ) {
          subType = "image";
          if (file.startsWith("attachments/")) {
            file = `dayflit-image://${file.replace("attachments/", "")}`;
          }
        } else {
          subType = "note";
        }
      } else if (n.type === "text") {
        text = (n as JSONCanvasTextNode).text || "";
        // Check if it's formatted as a markdown task
        const taskMatch = text.match(/^[-*+]\s+\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
          subType = "task";
          nodeData.taskStatus = taskMatch[1].toLowerCase() === "x" ? "done" : "open";
          nodeData.taskTitle = taskMatch[2];
        } else if (n.color && JSON_CANVAS_TO_STICKY_COLOR[n.color]) {
          subType = "sticky";
          nodeData.stickyColor = JSON_CANVAS_TO_STICKY_COLOR[n.color];
        } else {
          subType = "text";
        }
      }

      nodeData.subType = subType;

      const nodeId = n.id || `node_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
      const x = Number.isFinite(n.x) ? n.x : 0;
      const y = Number.isFinite(n.y) ? n.y : 0;
      const width = Number.isFinite(n.width) && n.width > 0 ? n.width : 280;
      const height = Number.isFinite(n.height) && n.height > 0 ? n.height : 160;

      return {
        id: nodeId,
        type: n.type || "text",
        x,
        y,
        width,
        height,
        color: n.color,
        text,
        file,
        url,
        label,
        background: (n as JSONCanvasGroupNode).background,
        data: nodeData,
      };
    });

  const edges: CanvasEdge[] = (data.edges || [])
    .filter((e) => Boolean(e && typeof e === "object" && e.fromNode && e.toNode))
    .map((e, idx) => ({
      id: e.id || `edge_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      fromNode: e.fromNode,
      fromSide: validSides.includes(e.fromSide as JSONCanvasSide) ? (e.fromSide as JSONCanvasSide) : "right",
      fromEnd: e.fromEnd || "none",
      toNode: e.toNode,
      toSide: validSides.includes(e.toSide as JSONCanvasSide) ? (e.toSide as JSONCanvasSide) : "left",
      toEnd: e.toEnd || "arrow",
      color: e.color,
      label: e.label,
      routing: "bezier",
    }));

  const now = Date.now();
  return {
    id: boardId || `board_${now}`,
    name: boardName || "Imported Board",
    nodes,
    edges,
    strokes: [],
    viewport: { panX: 0, panY: 0, zoom: 1.0 },
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// 4. Smart Embed URL Transformer
// ============================================================================

export function detectEmbedType(url: string): CanvasNodeData["embedType"] {
  if (!url) return "generic";
  const lower = url.toLowerCase();
  if (lower.includes("figma.com")) return "figma";
  if (lower.includes("excalidraw.com")) return "excalidraw";
  if (lower.includes("notion.site") || lower.includes("notion.so")) return "notion";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("loom.com")) return "loom";
  return "generic";
}

export function transformEmbedUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();

  // 1. Figma: Convert file or design links to embed
  // https://www.figma.com/file/... or https://www.figma.com/design/...
  if (trimmed.includes("figma.com")) {
    if (trimmed.includes("/embed?")) return trimmed;
    return `https://www.figma.com/embed?embed_host=dayflit&url=${encodeURIComponent(trimmed)}`;
  }

  // 2. YouTube: Convert watch links and short links to embed
  // https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`;
  }

  // 3. Loom: Convert share links to embed
  // https://www.loom.com/share/ID -> https://www.loom.com/embed/ID
  const loomMatch = trimmed.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loomMatch && loomMatch[1]) {
    return `https://www.loom.com/embed/${loomMatch[1]}`;
  }

  // 4. Excalidraw: Standard link works in iframe
  if (trimmed.includes("excalidraw.com")) {
    return trimmed;
  }

  return trimmed;
}

// ============================================================================
// 5. AFFiNE Edgeless Mode: Bidirectional Markdown Block Synchronization
// ============================================================================

export interface DocBlock {
  id: string;
  type: "heading" | "section" | "checklist" | "code" | "callout" | "image" | "paragraph";
  content: string;
  order: number;
  pinnedToDoc: boolean;
}

/**
 * Parses markdown body into top-level blocks for Edgeless Canvas cards.
 */
export function markdownToDocBlocks(markdown: string): DocBlock[] {
  if (!markdown || !markdown.trim()) return [];

  const rawBlocks = markdown.split(/\n{2,}/);
  const blocks: DocBlock[] = [];
  let order = 1;

  for (let i = 0; i < rawBlocks.length; i++) {
    const raw = rawBlocks[i].trim();
    if (!raw) continue;

    let type: DocBlock["type"] = "paragraph";
    if (/^#{1,6}\s+/.test(raw)) {
      type = "heading";
    } else if (/^[-*+]\s+\[( |x|X)\]/.test(raw)) {
      type = "checklist";
    } else if (raw.startsWith("```") && raw.endsWith("```")) {
      type = "code";
    } else if (raw.startsWith(">")) {
      type = "callout";
    } else if (/^!\[.*?\]\(.*?\)$/.test(raw)) {
      type = "image";
    }

    blocks.push({
      id: `block_${order}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      content: raw,
      order: order++,
      pinnedToDoc: true,
    });
  }

  return blocks;
}

/**
 * Spatially sorts all document block cards (and pinned cards) and recalculates their 1-indexed reading order.
 * Follows column-aware top-to-bottom reading sequence.
 */
export function recalculateReadingOrders(nodes: CanvasNode[]): CanvasNode[] {
  const docBlocks = nodes.filter((n) => {
    if (n.data.subType === "docBlock") {
      return n.data.pinnedToDoc !== false;
    }
    return n.data.pinnedToDoc === true;
  });

  if (docBlocks.length === 0) return nodes;

  // Spatial reading order: group into columns with ~380px grid width, then sort by Y
  const sorted = [...docBlocks].sort((a, b) => {
    const colA = Math.floor((a.x + a.width / 2) / 380);
    const colB = Math.floor((b.x + b.width / 2) / 380);
    if (colA !== colB) return colA - colB;
    if (Math.abs(a.y - b.y) > 15) return a.y - b.y;
    return a.x - b.x;
  });

  const orderMap = new Map<string, number>();
  sorted.forEach((n, idx) => {
    orderMap.set(n.id, idx + 1);
  });

  return nodes.map((n) => {
    if (orderMap.has(n.id)) {
      return {
        ...n,
        data: {
          ...n.data,
          order: orderMap.get(n.id),
        },
      };
    }
    return n;
  });
}

/**
 * Reconstructs a clean linear Markdown document from ordered doc blocks on the canvas.
 */
export function docBlocksToMarkdown(nodes: CanvasNode[]): string {
  // Filter for docBlock nodes that are pinnedToDoc (or default to true if unspecified)
  const docNodes = nodes.filter((n) => {
    if (n.data.subType !== "docBlock") {
      // Also allow text or task cards if explicitly tagged pinnedToDoc
      return n.data.pinnedToDoc === true;
    }
    return n.data.pinnedToDoc !== false;
  });

  // Sort primarily by explicit reading order, then by spatial top-to-bottom, left-to-right
  const sorted = [...docNodes].sort((a, b) => {
    const orderA = a.data.order ?? 9999;
    const orderB = b.data.order ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    if (Math.abs(a.y - b.y) > 20) return a.y - b.y;
    return a.x - b.x;
  });

  return sorted
    .map((n) => {
      if (n.data.subType === "task") {
        const check = n.data.taskStatus === "done" ? "[x]" : "[ ]";
        return `- ${check} ${n.data.taskTitle || n.text || ""}`;
      }
      return n.text || "";
    })
    .filter((txt) => txt.trim().length > 0)
    .join("\n\n");
}

/**
 * Synchronizes a Note's Markdown document with its Edgeless Canvas board.
 * Preserves user positions of existing block cards, adding any new blocks sequentially without collisions.
 */
export function syncNoteToCanvasBoard(
  noteId: string,
  noteTitle: string,
  noteBody: string,
  existingBoard?: CanvasBoard | null
): CanvasBoard {
  const blocks = markdownToDocBlocks(noteBody);
  const now = Date.now();

  const board: CanvasBoard = existingBoard
    ? { ...existingBoard, nodes: [...existingBoard.nodes], updatedAt: now }
    : {
        id: `note_canvas_${noteId}`,
        name: noteTitle || "Edgeless Note",
        noteId,
        nodes: [],
        edges: [],
        strokes: [],
        viewport: { panX: 80, panY: 60, zoom: 1.0 },
        createdAt: now,
        updatedAt: now,
      };

  // Keep non-docBlock nodes (sticky notes, freehand cards, external embeds) intact
  const otherNodes = board.nodes.filter((n) => n.data.subType !== "docBlock");
  const existingDocNodes = board.nodes.filter((n) => n.data.subType === "docBlock");

  const COL_WIDTH = 340;
  const GAP_X = 40;
  const GAP_Y = 30;
  const START_X = 120;
  const START_Y = 100;
  const MAX_COL_HEIGHT = 900;

  // Track max bounds of existing nodes so new nodes can be appended gracefully
  let maxExistingX = START_X;
  let maxExistingY = START_Y;
  for (const n of existingDocNodes) {
    if (n.x > maxExistingX) maxExistingX = n.x;
    if (n.y + n.height > maxExistingY) maxExistingY = n.y + n.height;
  }

  let nextNewX = existingDocNodes.length > 0 ? maxExistingX : START_X;
  let nextNewY = existingDocNodes.length > 0 ? maxExistingY + GAP_Y : START_Y;
  if (nextNewY > MAX_COL_HEIGHT) {
    nextNewY = START_Y;
    nextNewX += COL_WIDTH + GAP_X;
  }

  const matchedExistingIds = new Set<string>();

  // Pass 1: match by exact content first
  const blockToExistingMap = new Map<number, CanvasNode>();
  blocks.forEach((block, idx) => {
    const match = existingDocNodes.find(
      (n) => !matchedExistingIds.has(n.id) && n.text === block.content
    );
    if (match) {
      matchedExistingIds.add(match.id);
      blockToExistingMap.set(idx, match);
    }
  });

  // Pass 2: match remaining blocks by index if available and unused
  blocks.forEach((_block, idx) => {
    if (!blockToExistingMap.has(idx)) {
      const fallback = existingDocNodes[idx];
      if (fallback && !matchedExistingIds.has(fallback.id)) {
        matchedExistingIds.add(fallback.id);
        blockToExistingMap.set(idx, fallback);
      }
    }
  });

  const updatedDocNodes: CanvasNode[] = blocks.map((block, idx) => {
    const existing = blockToExistingMap.get(idx);

    let x: number;
    let y: number;
    let width = COL_WIDTH;
    let height = estimateCardHeight(block.content, block.type);

    if (existing) {
      x = existing.x;
      y = existing.y;
      width = existing.width;
      height = existing.height;
    } else {
      x = nextNewX;
      y = nextNewY;
      nextNewY += height + GAP_Y;
      if (nextNewY > MAX_COL_HEIGHT) {
        nextNewY = START_Y;
        nextNewX += COL_WIDTH + GAP_X;
      }
    }

    return {
      id: existing ? existing.id : block.id,
      type: "text",
      x,
      y,
      width,
      height,
      text: block.content,
      data: {
        subType: "docBlock",
        blockId: block.id,
        blockType: block.type,
        order: existing?.data.order ?? (idx + 1),
        pinnedToDoc: existing?.data.pinnedToDoc ?? true,
      },
    };
  });

  board.nodes = [...otherNodes, ...updatedDocNodes];
  return board;
}

function estimateCardHeight(content: string, type: DocBlock["type"]): number {
  if (type === "heading") return 90;
  if (type === "image") return 220;
  if (type === "code") return 180;
  const lines = content.split("\n").length;
  return Math.min(Math.max(120, 70 + lines * 22), 480);
}

// ============================================================================
// 6. Frame & Containment Math
// ============================================================================

/**
 * Checks whether a node is spatially contained within a Frame (Group node).
 * We consider a node contained if its center point is within the frame.
 */
export function isNodeInsideFrame(node: CanvasNode, frame: CanvasNode): boolean {
  if (node.id === frame.id || node.type === "group" || node.data.subType === "group") {
    return false;
  }

  const nodeCenterX = node.x + node.width / 2;
  const nodeCenterY = node.y + node.height / 2;

  return (
    nodeCenterX >= frame.x &&
    nodeCenterX <= frame.x + frame.width &&
    nodeCenterY >= frame.y &&
    nodeCenterY <= frame.y + frame.height
  );
}

/**
 * Captures all child node IDs and stroke IDs strictly contained within a frame's bounding box.
 */
export function getFrameContainedChildren(
  frameId: string,
  nodes: CanvasNode[],
  strokes: CanvasStroke[] = []
): { childNodeIds: Set<string>; childStrokeIds: Set<string> } {
  const targetFrame = nodes.find((n) => n.id === frameId);
  const childNodeIds = new Set<string>();
  const childStrokeIds = new Set<string>();
  if (!targetFrame) return { childNodeIds, childStrokeIds };

  for (const n of nodes) {
    if (isNodeInsideFrame(n, targetFrame)) {
      childNodeIds.add(n.id);
    }
  }

  for (const s of strokes) {
    if (s.points.length > 0) {
      const inside = s.points.some(
        (p) =>
          p.x >= targetFrame.x &&
          p.x <= targetFrame.x + targetFrame.width &&
          p.y >= targetFrame.y &&
          p.y <= targetFrame.y + targetFrame.height
      );
      if (inside) {
        childStrokeIds.add(s.id);
      }
    }
  }

  return { childNodeIds, childStrokeIds };
}

/**
 * Translates a Frame and all child nodes and strokes strictly contained within its bounding box
 * by the exact (dx, dy) delta.
 */
export function translateFrameWithChildren(
  frameId: string,
  delta: { dx: number; dy: number },
  nodes: CanvasNode[],
  strokes: CanvasStroke[] = [],
  capturedChildIds?: { childNodeIds: Set<string>; childStrokeIds: Set<string> }
): { nodes: CanvasNode[]; strokes: CanvasStroke[] } {
  const targetFrame = nodes.find((n) => n.id === frameId);
  if (!targetFrame) return { nodes, strokes };

  const { childNodeIds, childStrokeIds } =
    capturedChildIds || getFrameContainedChildren(frameId, nodes, strokes);

  const nextNodes = nodes.map((n) => {
    if (n.id === frameId || childNodeIds.has(n.id)) {
      return {
        ...n,
        x: n.x + delta.dx,
        y: n.y + delta.dy,
      };
    }
    return n;
  });

  const nextStrokes = strokes.map((s) => {
    if (childStrokeIds.has(s.id)) {
      return {
        ...s,
        points: s.points.map((p) => ({
          ...p,
          x: p.x + delta.dx,
          y: p.y + delta.dy,
        })),
      };
    }
    return s;
  });

  return { nodes: nextNodes, strokes: nextStrokes };
}

// ============================================================================
// 7. Connector Geometry & Path Calculation
// ============================================================================

export function getPortPosition(
  node: { x: number; y: number; width: number; height: number },
  side: JSONCanvasSide
): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "right":
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
  }
}

/**
 * Calculates SVG path for curved bezier, orthogonal elbow, or straight connector line.
 */
export function calculateEdgePath(
  p1: { x: number; y: number },
  side1: JSONCanvasSide,
  p2: { x: number; y: number },
  side2: JSONCanvasSide,
  routing: "bezier" | "elbow" | "straight" = "bezier"
): { path: string; labelPos: { x: number; y: number } } {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  if (routing === "straight") {
    return {
      path: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
      labelPos: { x: midX, y: midY },
    };
  }

  if (routing === "elbow") {
    // Orthogonal step routing
    let path = "";
    if (side1 === "right" || side1 === "left") {
      path = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
    } else {
      path = `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    }
    return { path, labelPos: { x: midX, y: midY } };
  }

  // Default: Curved Cubic-Bezier
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const curvature = Math.max(40, Math.min(Math.max(dx, dy) * 0.45, 180));

  let cp1 = { ...p1 };
  let cp2 = { ...p2 };

  switch (side1) {
    case "top":
      cp1.y -= curvature;
      break;
    case "bottom":
      cp1.y += curvature;
      break;
    case "left":
      cp1.x -= curvature;
      break;
    case "right":
      cp1.x += curvature;
      break;
  }

  switch (side2) {
    case "top":
      cp2.y -= curvature;
      break;
    case "bottom":
      cp2.y += curvature;
      break;
    case "left":
      cp2.x -= curvature;
      break;
    case "right":
      cp2.x += curvature;
      break;
  }

  const path = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
  return { path, labelPos: { x: midX, y: midY } };
}
