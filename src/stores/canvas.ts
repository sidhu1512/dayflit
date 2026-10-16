import { create } from "zustand";
import { uid } from "@/lib/ids";
import { loadCollection, scheduleSave } from "@/lib/persist";
import {
  type CanvasBoard,
  type CanvasNode,
  type CanvasEdge,
  type CanvasStroke,
  type CanvasViewport,
  type JSONCanvasData,
  exportToJSONCanvas,
  importFromJSONCanvas,
} from "@/lib/canvas";

interface CanvasState {
  boards: CanvasBoard[];
  activeBoardId: string | null;
  loaded: boolean;
  recoveredFrom: string | null;

  load: () => Promise<void>;
  createBoard: (name?: string, noteId?: string | null) => CanvasBoard;
  setActiveBoard: (id: string | null) => void;
  getBoard: (id: string) => CanvasBoard | undefined;
  getBoardByNoteId: (noteId: string) => CanvasBoard | undefined;
  updateBoard: (id: string, patch: Partial<CanvasBoard>) => void;
  deleteBoard: (id: string) => void;

  addNode: (boardId: string, node: Partial<CanvasNode>) => CanvasNode;
  updateNode: (boardId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
  removeNode: (boardId: string, nodeId: string) => void;

  addEdge: (boardId: string, edge: Omit<CanvasEdge, "id">) => CanvasEdge;
  updateEdge: (boardId: string, edgeId: string, patch: Partial<CanvasEdge>) => void;
  removeEdge: (boardId: string, edgeId: string) => void;

  addStroke: (boardId: string, stroke: CanvasStroke) => void;
  clearStrokes: (boardId: string) => void;
  updateViewport: (boardId: string, viewport: Partial<CanvasViewport>) => void;

  exportBoardAsJSONCanvas: (boardId: string) => string;
  importBoardFromJSONCanvas: (data: string | JSONCanvasData, name?: string) => CanvasBoard;
}

function makeDefaultBoard(name = "Visual Canvas", noteId: string | null = null): CanvasBoard {
  const now = Date.now();
  const id = noteId ? `note_canvas_${noteId}` : `board_${uid()}`;
  return {
    id,
    name,
    noteId: noteId ?? null,
    nodes: [],
    edges: [],
    strokes: [],
    viewport: { panX: 0, panY: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeBoards(raw: unknown): CanvasBoard[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b && typeof b === "object" && typeof (b as CanvasBoard).id === "string")
    .map((b) => {
      const board = b as CanvasBoard;
      return {
        ...makeDefaultBoard(board.name || "Untitled Canvas", board.noteId),
        ...board,
        nodes: Array.isArray(board.nodes) ? board.nodes : [],
        edges: Array.isArray(board.edges) ? board.edges : [],
        strokes: Array.isArray(board.strokes) ? board.strokes : [],
        viewport: board.viewport || { panX: 0, panY: 0, zoom: 1 },
      };
    });
}

export const useCanvas = create<CanvasState>((set, get) => {
  const persist = (boards: CanvasBoard[]) => {
    set({ boards });
    scheduleSave("canvas", boards);
  };

  return {
    boards: [],
    activeBoardId: null,
    loaded: false,
    recoveredFrom: null,

    load: async () => {
      if (get().loaded) return;
      const res = await loadCollection<CanvasBoard[]>("canvas", []);
      let boards = normalizeBoards(res.data);
      if (boards.length === 0) {
        const defaultBoard = makeDefaultBoard("Main Canvas");
        // Add sample welcome nodes to guide first-time visual exploration
        defaultBoard.nodes = [
          {
            id: "welcome_frame",
            type: "group",
            x: 80,
            y: 60,
            width: 720,
            height: 480,
            label: "DayFlit Infinite Canvas",
            color: "5",
            data: { subType: "group", title: "DayFlit Infinite Canvas" },
          },
          {
            id: "welcome_sticky",
            type: "text",
            x: 120,
            y: 130,
            width: 240,
            height: 180,
            text: "Welcome to DayFlit Canvas!\n\n• Pan: Middle-Click or Space+Drag\n• Zoom: Mouse wheel or pinch\n• Press S for Sticky Notes\n• Drop tasks, notes & embeds",
            color: "3",
            data: { subType: "sticky", stickyColor: "amber" },
          },
          {
            id: "welcome_task",
            type: "text",
            x: 420,
            y: 130,
            width: 320,
            height: 120,
            text: "- [ ] Explore two-way task binding",
            data: { subType: "task", taskTitle: "Explore two-way task binding", taskStatus: "open", taskPriority: "urgent" },
          },
        ];
        defaultBoard.edges = [
          {
            id: "welcome_edge",
            fromNode: "welcome_sticky",
            fromSide: "right",
            fromEnd: "none",
            toNode: "welcome_task",
            toSide: "left",
            toEnd: "arrow",
            label: "next step",
            routing: "bezier",
          },
        ];
        boards = [defaultBoard];
      }
      set({
        boards,
        activeBoardId: boards[0]?.id || null,
        loaded: true,
        recoveredFrom: res.recoveredFrom,
      });
    },

    createBoard: (name = "Visual Canvas", noteId = null) => {
      const board = makeDefaultBoard(name, noteId);
      const next = [board, ...get().boards];
      persist(next);
      set({ activeBoardId: board.id });
      return board;
    },

    setActiveBoard: (id) => set({ activeBoardId: id }),

    getBoard: (id) => get().boards.find((b) => b.id === id),

    getBoardByNoteId: (noteId) => get().boards.find((b) => b.noteId === noteId),

    updateBoard: (id, patch) => {
      const boards = get().boards.map((b) =>
        b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b
      );
      persist(boards);
    },

    deleteBoard: (id) => {
      const next = get().boards.filter((b) => b.id !== id);
      persist(next);
      if (get().activeBoardId === id) {
        set({ activeBoardId: next[0]?.id || null });
      }
    },

    addNode: (boardId, nodeData) => {
      const now = Date.now();
      const node: CanvasNode = {
        id: nodeData.id || `node_${uid()}`,
        type: nodeData.type || "text",
        x: nodeData.x ?? 100,
        y: nodeData.y ?? 100,
        width: nodeData.width ?? 280,
        height: nodeData.height ?? 160,
        color: nodeData.color,
        text: nodeData.text,
        file: nodeData.file,
        url: nodeData.url,
        label: nodeData.label,
        background: nodeData.background,
        data: nodeData.data || {},
      };

      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          nodes: [...b.nodes, node],
          updatedAt: now,
        };
      });
      persist(boards);
      return node;
    },

    updateNode: (boardId, nodeId, patch) => {
      const now = Date.now();
      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          nodes: b.nodes.map((n) =>
            n.id === nodeId ? { ...n, ...patch, data: { ...n.data, ...(patch.data || {}) } } : n
          ),
          updatedAt: now,
        };
      });
      persist(boards);
    },

    removeNode: (boardId, nodeId) => {
      const now = Date.now();
      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          nodes: b.nodes.filter((n) => n.id !== nodeId),
          edges: b.edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId),
          updatedAt: now,
        };
      });
      persist(boards);
    },

    addEdge: (boardId, edgeData) => {
      const now = Date.now();
      const edge: CanvasEdge = {
        ...edgeData,
        id: `edge_${uid()}`,
        routing: edgeData.routing || "bezier",
        fromEnd: edgeData.fromEnd || "none",
        toEnd: edgeData.toEnd || "arrow",
      };

      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          edges: [...b.edges, edge],
          updatedAt: now,
        };
      });
      persist(boards);
      return edge;
    },

    updateEdge: (boardId, edgeId, patch) => {
      const now = Date.now();
      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          edges: b.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
          updatedAt: now,
        };
      });
      persist(boards);
    },

    removeEdge: (boardId, edgeId) => {
      const now = Date.now();
      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          edges: b.edges.filter((e) => e.id !== edgeId),
          updatedAt: now,
        };
      });
      persist(boards);
    },

    addStroke: (boardId, stroke) => {
      const now = Date.now();
      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          strokes: [...(b.strokes || []), stroke],
          updatedAt: now,
        };
      });
      persist(boards);
    },

    clearStrokes: (boardId) => {
      const now = Date.now();
      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          strokes: [],
          updatedAt: now,
        };
      });
      persist(boards);
    },

    updateViewport: (boardId, viewport) => {
      const boards = get().boards.map((b) => {
        if (b.id !== boardId) return b;
        return {
          ...b,
          viewport: { ...b.viewport, ...viewport },
        };
      });
      persist(boards);
    },

    exportBoardAsJSONCanvas: (boardId) => {
      const b = get().boards.find((bd) => bd.id === boardId);
      if (!b) return JSON.stringify({ nodes: [], edges: [] });
      return exportToJSONCanvas(b);
    },

    importBoardFromJSONCanvas: (data, name) => {
      const board = importFromJSONCanvas(data, undefined, name);
      const next = [board, ...get().boards];
      persist(next);
      set({ activeBoardId: board.id });
      return board;
    },
  };
});
