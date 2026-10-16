import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Compass,
  CornerDownRight,
  Eraser,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Globe,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  MousePointer,
  Palette,
  Pen,
  PenTool,
  Pin,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Tv,
  Type,
  X,
  Zap,
} from "lucide-react";
import {
  type CanvasBoard as CanvasBoardType,
  type CanvasNode,
  type CanvasEdge,
  type CanvasStroke,
  type CanvasViewport,
  type JSONCanvasSide,
  type StrokePoint,
  STICKY_PALETTE,
  JSON_CANVAS_COLORS,
  getPortPosition,
  calculateEdgePath,
  translateFrameWithChildren,
  isNodeInsideFrame,
  recalculateReadingOrders,
  getFrameContainedChildren,
} from "@/lib/canvas";
import { useTasks } from "@/stores/tasks";
import { useNotes } from "@/stores/notes";
import { useJournal } from "@/stores/journal";
import { useLife } from "@/stores/life";
import { useClips } from "@/stores/clips";
import { useUi } from "@/stores/ui";
import { imageUrl, imagesFromDataTransfer, storeImageBlob } from "@/lib/imageUrl";
import { openExternal } from "@/lib/open";
import { LiveEmbedNode } from "./LiveEmbedNode";

interface CanvasBoardProps {
  board: CanvasBoardType;
  onUpdateBoard?: (patch: Partial<CanvasBoardType>) => void;
  onAddNode?: (node: Partial<CanvasNode>) => CanvasNode;
  onUpdateNode?: (nodeId: string, patch: Partial<CanvasNode>) => void;
  onRemoveNode?: (nodeId: string) => void;
  onAddEdge?: (edge: Omit<CanvasEdge, "id">) => CanvasEdge;
  onUpdateEdge?: (edgeId: string, patch: Partial<CanvasEdge>) => void;
  onRemoveEdge?: (edgeId: string) => void;
  onAddStroke?: (stroke: CanvasStroke) => void;
  onClearStrokes?: () => void;
  onUpdateViewport?: (viewport: Partial<CanvasViewport>) => void;
  // Callback when a docBlock is updated (for AFFiNE Edgeless mode)
  onDocBlockChanged?: () => void;
  readOnly?: boolean;
}

type ActiveTool =
  | "select"
  | "hand"
  | "sticky"
  | "pen"
  | "highlighter"
  | "eraser"
  | "laser"
  | "frame"
  | "connector";

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const FRAME_TINTS = [
  { id: "default", label: "Default", bg: "var(--surface-2, rgba(255,255,255,0.03))", border: "var(--border)", fg: "var(--fg)" },
  { id: "indigo", label: "Indigo", bg: "rgba(99, 102, 241, 0.08)", border: "rgba(99, 102, 241, 0.4)", fg: "#818cf8" },
  { id: "emerald", label: "Emerald", bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.4)", fg: "#34d399" },
  { id: "amber", label: "Amber", bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.4)", fg: "#fbbf24" },
  { id: "rose", label: "Rose", bg: "rgba(244, 63, 94, 0.08)", border: "rgba(244, 63, 94, 0.4)", fg: "#fb7185" },
  { id: "violet", label: "Violet", bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.4)", fg: "#a78bfa" },
];

export function CanvasBoard({
  board,
  onUpdateBoard,
  onAddNode,
  onUpdateNode,
  onRemoveNode,
  onAddEdge,
  onUpdateEdge,
  onRemoveEdge,
  onAddStroke,
  onClearStrokes,
  onUpdateViewport,
  onDocBlockChanged,
  readOnly = false,
}: CanvasBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toast = useUi((s) => s.toast);

  // External live stores for two-way binding
  const tasks = useTasks((s) => s.tasks);
  const updateTask = useTasks((s) => s.update);
  const toggleTask = useTasks((s) => s.toggle);
  const addTask = useTasks((s) => s.add);

  const notes = useNotes((s) => s.notes);
  const updateNote = useNotes((s) => s.update);
  const setNoteBody = useNotes((s) => s.setBody);
  const addNote = useNotes((s) => s.add);

  const journalEntries = useJournal((s) => s.entries);
  const domains = useLife((s) => s.data?.domains || []);
  const clips = useClips((s) => s.clips);

  // Canvas Viewport & Tooling State
  const [viewport, setViewport] = useState<CanvasViewport>(
    board.viewport || { panX: 0, panY: 0, zoom: 1 }
  );
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [stickyColor, setStickyColor] = useState<string>("amber");
  const [penColor, setPenColor] = useState<string>("#3b82f6");
  const [penWidth, setPenWidth] = useState<number>(3);
  const [zenMode, setZenMode] = useState(false);

  // Space key tracking for Space+Drag panning
  const [spacePressed, setSpacePressed] = useState(false);
  const spacePressedRef = useRef(false);

  // Snap to Grid (16px) alignment
  const GRID_SIZE = 16;
  const [snapToGrid, setSnapToGrid] = useState(true);

  // Marquee selection
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Workspace Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"tasks" | "notes" | "journal" | "life" | "clips" | "images">("tasks");
  const [drawerSearch, setDrawerSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slash & [[ Quick-Insert Menu
  const [quickMenu, setQuickMenu] = useState<{
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
    filter: string;
  } | null>(null);

  // Wire Connector draft & Radial Quick Create
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    side: JSONCanvasSide;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const [radialMenu, setRadialMenu] = useState<{
    fromNodeId: string;
    fromSide: JSONCanvasSide;
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  // Wire inline text editing
  const [editingEdgeLabel, setEditingEdgeLabel] = useState<string | null>(null);
  const [edgeLabelText, setEdgeLabelText] = useState("");

  // Presentation Mode
  const [presenting, setPresenting] = useState(false);
  const [presentationIndex, setPresentationIndex] = useState(0);

  // Laser Pointer temporary trails
  const [laserTrail, setLaserTrail] = useState<{ x: number; y: number; time: number }[]>([]);

  // Dragging & Resizing References
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const isDraggingNodeRef = useRef(false);
  const capturedFrameChildrenRef = useRef<{
    childNodeIds: Set<string>;
    childStrokeIds: Set<string>;
  }>({ childNodeIds: new Set(), childStrokeIds: new Set() });
  const dragNodeStartRef = useRef<{
    startX: number;
    startY: number;
    initialNodes: Map<string, { x: number; y: number }>;
    isFrameDrag: boolean;
    frameId?: string;
  }>({ startX: 0, startY: 0, initialNodes: new Map(), isFrameDrag: false });

  const isResizingRef = useRef(false);
  const resizeStateRef = useRef<{
    nodeId: string;
    dir: ResizeDirection;
    startX: number;
    startY: number;
    initialBox: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<CanvasStroke | null>(null);

  // Sync internal viewport with board prop if external board changes
  useEffect(() => {
    if (board.viewport) {
      setViewport(board.viewport);
    }
  }, [board.id]);

  // Keep laser trail clean
  useEffect(() => {
    if (laserTrail.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setLaserTrail((prev) => prev.filter((p) => now - p.time < 1200));
    }, 100);
    return () => clearInterval(interval);
  }, [laserTrail.length]);

  // Handle Presentation Mode Framing
  const frames = useMemo(() => {
    return board.nodes
      .filter((n) => n.type === "group" || n.data.subType === "group")
      .sort((a, b) => a.x - b.x);
  }, [board.nodes]);

  const fitToFrame = useCallback(
    (frame: CanvasNode) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const padding = 60;
      const scaleX = (rect.width - padding * 2) / frame.width;
      const scaleY = (rect.height - padding * 2) / frame.height;
      const targetZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 2.0);
      const targetPanX = rect.width / 2 - (frame.x + frame.width / 2) * targetZoom;
      const targetPanY = rect.height / 2 - (frame.y + frame.height / 2) * targetZoom;

      const nextViewport = { panX: targetPanX, panY: targetPanY, zoom: targetZoom };
      setViewport(nextViewport);
      onUpdateViewport?.(nextViewport);
    },
    [onUpdateViewport]
  );

  const startPresentation = () => {
    if (frames.length === 0) {
      toast({ title: "No Frames to Present", body: "Create a Frame container first using the Frame tool (F).", kind: "info" });
      return;
    }
    setPresentationIndex(0);
    setPresenting(true);
    fitToFrame(frames[0]);
  };

  const nextFrame = () => {
    if (presentationIndex < frames.length - 1) {
      const nextIdx = presentationIndex + 1;
      setPresentationIndex(nextIdx);
      fitToFrame(frames[nextIdx]);
    }
  };

  const prevFrame = () => {
    if (presentationIndex > 0) {
      const prevIdx = presentationIndex - 1;
      setPresentationIndex(prevIdx);
      fitToFrame(frames[prevIdx]);
    }
  };

  const exitPresentation = () => {
    setPresenting(false);
  };

  // Convert Screen Coordinates -> Canvas World Coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const localX = screenX - rect.left;
      const localY = screenY - rect.top;
      return {
        x: (localX - viewport.panX) / viewport.zoom,
        y: (localY - viewport.panY) / viewport.zoom,
      };
    },
    [viewport]
  );

  // Fit to all nodes on canvas
  const fitToScreen = useCallback(() => {
    if (!containerRef.current || board.nodes.length === 0) {
      setViewport({ panX: 0, panY: 0, zoom: 1.0 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of board.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const width = maxX - minX || 800;
    const height = maxY - minY || 600;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 80;
    const scaleX = (rect.width - padding * 2) / width;
    const scaleY = (rect.height - padding * 2) / height;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.8);
    const newPanX = rect.width / 2 - (minX + width / 2) * newZoom;
    const newPanY = rect.height / 2 - (minY + height / 2) * newZoom;

    const nextV = { panX: newPanX, panY: newPanY, zoom: newZoom };
    setViewport(nextV);
    onUpdateViewport?.(nextV);
  }, [board.nodes, onUpdateViewport]);

  // ==========================================================================
  // Pointer Events: Pan, Zoom, Drag, Marquee & Freehand Ink Drawing
  // ==========================================================================

  const onWheel = (e: React.WheelEvent) => {
    // Zoom centered on cursor
    if (e.ctrlKey || e.metaKey || activeTool !== "hand") {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
      const newZoom = Math.min(3.0, Math.max(0.15, viewport.zoom * zoomFactor));
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const newPanX = cursorX - (cursorX - viewport.panX) * (newZoom / viewport.zoom);
      const newPanY = cursorY - (cursorY - viewport.panY) * (newZoom / viewport.zoom);

      const nextV = { panX: newPanX, panY: newPanY, zoom: newZoom };
      setViewport(nextV);
      onUpdateViewport?.(nextV);
    } else {
      // Pan with trackpad wheel
      const nextV = {
        panX: viewport.panX - e.deltaX,
        panY: viewport.panY - e.deltaY,
        zoom: viewport.zoom,
      };
      setViewport(nextV);
      onUpdateViewport?.(nextV);
    }
  };

  const eraseStrokesNear = (screenX: number, screenY: number) => {
    const world = screenToWorld(screenX, screenY);
    const radius = 24 / viewport.zoom;
    const strokes = board.strokes || [];
    const remaining = strokes.filter((s) => {
      return !s.points.some(
        (p) => Math.hypot(p.x - world.x, p.y - world.y) <= Math.max(radius, s.width / 2)
      );
    });
    if (remaining.length !== strokes.length) {
      onUpdateBoard?.({ strokes: remaining });
    }
  };

  const onPointerDownCanvas = (e: React.PointerEvent) => {
    // Dismiss open radial or quick menus on background click
    if (radialMenu) setRadialMenu(null);
    if (quickMenu) setQuickMenu(null);
    if (editingEdgeLabel) setEditingEdgeLabel(null);

    const isMiddleClick = e.button === 1;
    const isSpace = spacePressedRef.current || (e as any).spaceKey || false;

    // Freehand drawing tools: Pen, Highlighter, Laser, Eraser
    if (activeTool === "pen" || activeTool === "highlighter" || activeTool === "laser") {
      isDrawingRef.current = true;
      const world = screenToWorld(e.clientX, e.clientY);
      const stroke: CanvasStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tool: activeTool,
        color: activeTool === "highlighter" ? "#fef08a" : activeTool === "laser" ? "#ef4444" : penColor,
        width: activeTool === "highlighter" ? 14 : activeTool === "laser" ? 6 : penWidth,
        points: [{ x: world.x, y: world.y, pressure: e.pressure || 0.5 }],
        createdAt: Date.now(),
      };
      currentStrokeRef.current = stroke;
      if (activeTool === "laser") {
        setLaserTrail([{ x: world.x, y: world.y, time: Date.now() }]);
      }
      return;
    }

    if (activeTool === "eraser") {
      isDrawingRef.current = true;
      eraseStrokesNear(e.clientX, e.clientY);
      return;
    }

    // Panning canvas via middle-click, Space+drag, or Hand tool
    if (isMiddleClick || isSpace || activeTool === "hand") {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0 && activeTool === "select") {
      // Marquee selection if clicking canvas background (not inside a card)
      const targetEl = e.target as HTMLElement;
      const isCard = targetEl.closest(".canvas-node-card") !== null;
      if (!isCard) {
        setSelectedNodeIds(new Set());
        setSelectedEdgeId(null);
        const world = screenToWorld(e.clientX, e.clientY);
        setMarquee({
          startX: world.x,
          startY: world.y,
          currentX: world.x,
          currentY: world.y,
        });
      }
    }
  };

  const onPointerMoveCanvas = (e: React.PointerEvent) => {
    // 1. Panning canvas
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setViewport({
        panX: panStartRef.current.panX + dx,
        panY: panStartRef.current.panY + dy,
        zoom: viewport.zoom,
      });
      return;
    }

    // 2. Eraser active drag
    if (activeTool === "eraser" && isDrawingRef.current) {
      eraseStrokesNear(e.clientX, e.clientY);
      return;
    }

    // 3. Freehand Ink Drawing
    if (isDrawingRef.current && currentStrokeRef.current) {
      const world = screenToWorld(e.clientX, e.clientY);
      currentStrokeRef.current.points.push({
        x: world.x,
        y: world.y,
        pressure: e.pressure || 0.5,
      });
      if (activeTool === "laser") {
        setLaserTrail((prev) => [...prev, { x: world.x, y: world.y, time: Date.now() }]);
      } else {
        setViewport((v) => ({ ...v }));
      }
      return;
    }

    // 4. Node dragging (single, multi-selected, or Frame with captured children)
    if (isDraggingNodeRef.current) {
      const world = screenToWorld(e.clientX, e.clientY);
      let dx = world.x - dragNodeStartRef.current.startX;
      let dy = world.y - dragNodeStartRef.current.startY;

      if (snapToGrid) {
        dx = Math.round(dx / GRID_SIZE) * GRID_SIZE;
        dy = Math.round(dy / GRID_SIZE) * GRID_SIZE;
      }

      // If dragging a Frame, translate frame and all captured children
      if (dragNodeStartRef.current.isFrameDrag && dragNodeStartRef.current.frameId) {
        const frameId = dragNodeStartRef.current.frameId;
        const initialMap = dragNodeStartRef.current.initialNodes;
        const initialFramePos = initialMap.get(frameId);
        if (initialFramePos) {
          const updatedNodes = board.nodes.map((n) => {
            const initial = initialMap.get(n.id);
            if (initial) {
              return { ...n, x: initial.x + dx, y: initial.y + dy };
            }
            return n;
          });

          const capturedStrokes = capturedFrameChildrenRef.current.childStrokeIds;
          const updatedStrokes = (board.strokes || []).map((s) => {
            if (capturedStrokes.has(s.id)) {
              return {
                ...s,
                points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
              };
            }
            return s;
          });

          onUpdateBoard?.({ nodes: updatedNodes, strokes: updatedStrokes });
        }
      } else {
        // Move all selected nodes
        for (const [id, initialPos] of dragNodeStartRef.current.initialNodes.entries()) {
          onUpdateNode?.(id, {
            x: initialPos.x + dx,
            y: initialPos.y + dy,
          });
        }
      }
      return;
    }

    // 5. Node resizing (8 directions with 16px snap-to-grid)
    if (isResizingRef.current && resizeStateRef.current) {
      const { nodeId, dir, startX, startY, initialBox } = resizeStateRef.current;
      const world = screenToWorld(e.clientX, e.clientY);
      let dx = world.x - startX;
      let dy = world.y - startY;

      if (snapToGrid) {
        dx = Math.round(dx / GRID_SIZE) * GRID_SIZE;
        dy = Math.round(dy / GRID_SIZE) * GRID_SIZE;
      }

      let newX = initialBox.x;
      let newY = initialBox.y;
      let newW = initialBox.width;
      let newH = initialBox.height;

      if (dir.includes("e")) newW = Math.max(140, initialBox.width + dx);
      if (dir.includes("s")) newH = Math.max(80, initialBox.height + dy);
      if (dir.includes("w")) {
        const proposedW = initialBox.width - dx;
        if (proposedW >= 140) {
          newW = proposedW;
          newX = initialBox.x + dx;
        }
      }
      if (dir.includes("n")) {
        const proposedH = initialBox.height - dy;
        if (proposedH >= 80) {
          newH = proposedH;
          newY = initialBox.y + dy;
        }
      }

      onUpdateNode?.(nodeId, {
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      });
      return;
    }

    // 6. Marquee selection
    if (marquee) {
      const world = screenToWorld(e.clientX, e.clientY);
      setMarquee({ ...marquee, currentX: world.x, currentY: world.y });

      const x1 = Math.min(marquee.startX, world.x);
      const y1 = Math.min(marquee.startY, world.y);
      const x2 = Math.max(marquee.startX, world.x);
      const y2 = Math.max(marquee.startY, world.y);

      const enclosed = new Set<string>();
      for (const n of board.nodes) {
        if (n.x < x2 && n.x + n.width > x1 && n.y < y2 && n.y + n.height > y1) {
          enclosed.add(n.id);
        }
      }
      setSelectedNodeIds(enclosed);
      return;
    }

    // 7. Active wire connector dragging
    if (connectingFrom) {
      const world = screenToWorld(e.clientX, e.clientY);
      setConnectingFrom({
        ...connectingFrom,
        currentX: world.x,
        currentY: world.y,
      });
    }
  };

  const onPointerUpCanvas = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      onUpdateViewport?.(viewport);
    }

    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (currentStrokeRef.current && activeTool !== "laser") {
        onAddStroke?.(currentStrokeRef.current);
      }
      currentStrokeRef.current = null;
    }

    if (isDraggingNodeRef.current) {
      isDraggingNodeRef.current = false;
      // Recalculate reading orders for Edgeless note blocks
      const hasDoc = board.nodes.some((n) => n.data.subType === "docBlock" || n.data.pinnedToDoc === true);
      if (hasDoc) {
        const reordered = recalculateReadingOrders(board.nodes);
        onUpdateBoard?.({ nodes: reordered });
      }
      onDocBlockChanged?.();
    }

    if (isResizingRef.current) {
      isResizingRef.current = false;
      resizeStateRef.current = null;
      onDocBlockChanged?.();
    }

    if (marquee) {
      setMarquee(null);
    }

    // If a connector was released in empty canvas space, open the Instant Radial Quick-Create Menu!
    if (connectingFrom) {
      const world = screenToWorld(e.clientX, e.clientY);
      const targetNode = board.nodes.find(
        (n) =>
          n.id !== connectingFrom.nodeId &&
          world.x >= n.x &&
          world.x <= n.x + n.width &&
          world.y >= n.y &&
          world.y <= n.y + n.height
      );

      if (targetNode) {
        // Connect to target node's nearest magnetic side
        const sides: JSONCanvasSide[] = ["top", "right", "bottom", "left"];
        let bestSide: JSONCanvasSide = "left";
        let bestDist = Infinity;
        for (const s of sides) {
          const pos = getPortPosition(targetNode, s);
          const d = Math.hypot(world.x - pos.x, world.y - pos.y);
          if (d < bestDist) {
            bestDist = d;
            bestSide = s;
          }
        }
        onAddEdge?.({
          fromNode: connectingFrom.nodeId,
          fromSide: connectingFrom.side,
          fromEnd: "none",
          toNode: targetNode.id,
          toSide: bestSide,
          toEnd: "arrow",
          routing: "bezier",
        });
      } else {
        // Empty space: open radial quick-create menu!
        setRadialMenu({
          fromNodeId: connectingFrom.nodeId,
          fromSide: connectingFrom.side,
          x: e.clientX,
          y: e.clientY,
          canvasX: world.x,
          canvasY: world.y,
        });
      }
      setConnectingFrom(null);
    }
  };

  // Node Grab Drag Start
  const startDragNode = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (spacePressedRef.current || activeTool === "hand" || activeTool === "pen" || activeTool === "highlighter" || activeTool === "eraser" || activeTool === "laser") {
      return;
    }

    // If node is not currently selected, select it (unless shift-clicking)
    if (!selectedNodeIds.has(node.id)) {
      if (e.shiftKey) {
        setSelectedNodeIds((prev) => new Set([...prev, node.id]));
      } else {
        setSelectedNodeIds(new Set([node.id]));
      }
    }

    const world = screenToWorld(e.clientX, e.clientY);
    const initialMap = new Map<string, { x: number; y: number }>();

    const isFrame = node.type === "group" || node.data.subType === "group";
    if (isFrame) {
      initialMap.set(node.id, { x: node.x, y: node.y });
      // Capture contained child nodes and strokes ONCE at drag start
      const captured = getFrameContainedChildren(node.id, board.nodes, board.strokes || []);
      capturedFrameChildrenRef.current = captured;
      for (const cid of captured.childNodeIds) {
        const cNode = board.nodes.find((n) => n.id === cid);
        if (cNode) {
          initialMap.set(cNode.id, { x: cNode.x, y: cNode.y });
        }
      }
    } else {
      const activeIds = selectedNodeIds.has(node.id) ? selectedNodeIds : new Set([node.id]);
      for (const id of activeIds) {
        const target = board.nodes.find((n) => n.id === id);
        if (target) initialMap.set(target.id, { x: target.x, y: target.y });
      }
    }

    isDraggingNodeRef.current = true;
    dragNodeStartRef.current = {
      startX: world.x,
      startY: world.y,
      initialNodes: initialMap,
      isFrameDrag: isFrame,
      frameId: isFrame ? node.id : undefined,
    };
  };

  // Node 8-Direction Resize Handle Grab
  const startResize = (e: React.PointerEvent, node: CanvasNode, dir: ResizeDirection) => {
    e.stopPropagation();
    const handleEl = e.currentTarget as HTMLElement;
    handleEl.setPointerCapture(e.pointerId);

    const world = screenToWorld(e.clientX, e.clientY);
    isResizingRef.current = true;
    resizeStateRef.current = {
      nodeId: node.id,
      dir,
      startX: world.x,
      startY: world.y,
      initialBox: { x: node.x, y: node.y, width: node.width, height: node.height },
    };
  };

  // Magnetic Port Connector Start
  const startConnectorDrag = (e: React.PointerEvent, node: CanvasNode, side: JSONCanvasSide) => {
    e.stopPropagation();
    const pos = getPortPosition(node, side);
    setConnectingFrom({
      nodeId: node.id,
      side,
      startX: pos.x,
      startY: pos.y,
      currentX: pos.x,
      currentY: pos.y,
    });
  };

  // Quick Insertion Helpers
  const insertTaskCard = (canvasX: number, canvasY: number, title = "New Visual Task") => {
    const t = addTask({ title, priority: "none" });
    const n = onAddNode?.({
      type: "text",
      x: canvasX,
      y: canvasY,
      width: 280,
      height: 120,
      data: { subType: "task", taskId: t.id, taskTitle: t.title, taskStatus: "open", taskPriority: "none" },
    });
    return n;
  };

  const insertStickyCard = (canvasX: number, canvasY: number, text = "New Sticky Note", color = stickyColor) => {
    return onAddNode?.({
      type: "text",
      x: canvasX,
      y: canvasY,
      width: 240,
      height: 200,
      text,
      data: { subType: "sticky", stickyColor: color },
    });
  };

  const insertNoteCard = (canvasX: number, canvasY: number, title = "New Visual Note") => {
    const note = addNote({ title, body: `# ${title}\n\nStart writing notes here...` });
    return onAddNode?.({
      type: "text",
      x: canvasX,
      y: canvasY,
      width: 320,
      height: 220,
      text: note.body,
      data: { subType: "note", noteId: note.id, title: note.title },
    });
  };

  const insertEmbedCard = (canvasX: number, canvasY: number, url = "https://excalidraw.com") => {
    return onAddNode?.({
      type: "link",
      x: canvasX,
      y: canvasY,
      width: 440,
      height: 320,
      url,
      data: { subType: "embed", embedUrl: url, viewMode: "live", interact: false },
    });
  };

  const insertFrameCard = (canvasX: number, canvasY: number, label = "New Frame") => {
    return onAddNode?.({
      type: "group",
      x: canvasX,
      y: canvasY,
      width: 520,
      height: 380,
      label,
      color: "5",
      data: { subType: "group", title: label },
    });
  };

  // Convert Sticky -> Task or Note
  const convertStickyToTask = (node: CanvasNode) => {
    const title = node.text?.split("\n")[0] || "Converted Task";
    const notes = node.text || "";
    const task = addTask({ title, notes });
    onUpdateNode?.(node.id, {
      data: {
        ...node.data,
        subType: "task",
        taskId: task.id,
        taskTitle: task.title,
        taskStatus: "open",
      },
    });
  };

  const convertStickyToNote = (node: CanvasNode) => {
    const title = node.text?.split("\n")[0] || "Converted Note";
    const note = addNote({ title, body: node.text || "" });
    onUpdateNode?.(node.id, {
      data: {
        ...node.data,
        subType: "note",
        noteId: note.id,
        title: note.title,
      },
    });
  };

  // Hotkey listener on window for Space+drag panning and tools
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (e.code === "Space" && !isInput) {
        e.preventDefault();
        spacePressedRef.current = true;
        setSpacePressed(true);
        return;
      }

      if (isInput) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          for (const id of selectedNodeIds) {
            onRemoveNode?.(id);
          }
          setSelectedNodeIds(new Set());
          onDocBlockChanged?.();
        } else if (selectedEdgeId) {
          e.preventDefault();
          onRemoveEdge?.(selectedEdgeId);
          setSelectedEdgeId(null);
        }
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "h" || e.key === "H") {
        setActiveTool("hand");
      } else if (e.key === "s" || e.key === "S") {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        insertStickyCard(center.x - 120, center.y - 100);
      } else if (e.key === "p" || e.key === "P") {
        setActiveTool("pen");
      } else if (e.key === "e" || e.key === "E") {
        setActiveTool("eraser");
      } else if (e.key === "l" || e.key === "L") {
        setActiveTool("laser");
      } else if (e.key === "f" || e.key === "F") {
        setActiveTool("frame");
      } else if (e.key === "c" || e.key === "C") {
        setActiveTool("connector");
      } else if (e.key === "/" || e.key === "[" || (e.ctrlKey && e.key === "/")) {
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        setQuickMenu({
          x: rect.width / 2,
          y: rect.height / 2,
          canvasX: center.x,
          canvasY: center.y,
          filter: "",
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spacePressedRef.current = false;
        setSpacePressed(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedNodeIds, selectedEdgeId, onRemoveNode, onRemoveEdge, screenToWorld]);

  // Minimap Geometry
  const minimapNodes = useMemo(() => {
    if (board.nodes.length === 0) return { nodes: [], bounds: { minX: 0, minY: 0, width: 1, height: 1 } };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of board.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const width = Math.max(maxX - minX + 200, 1000);
    const height = Math.max(maxY - minY + 200, 800);
    return {
      nodes: board.nodes,
      bounds: { minX: minX - 100, minY: minY - 100, width, height },
    };
  }, [board.nodes]);

  const onCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const imgs = imagesFromDataTransfer(e.dataTransfer);
    if (imgs.length > 0) {
      const world = screenToWorld(e.clientX, e.clientY);
      for (let i = 0; i < imgs.length; i++) {
        const file = imgs[i];
        try {
          const name = await storeImageBlob(file);
          onAddNode?.({
            type: "file",
            file: `dayflit-image://${name}`,
            x: Math.round(world.x + i * 30),
            y: Math.round(world.y + i * 30),
            width: 360,
            height: 240,
            data: {
              subType: "image",
              title: file.name,
              pinnedToDoc: false,
            },
          });
        } catch (err) {
          toast({ title: "Failed to save image", body: String(err), kind: "error" });
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden bg-bg outline-none"
      tabIndex={0}
      onWheel={onWheel}
      onPointerDown={onPointerDownCanvas}
      onPointerMove={onPointerMoveCanvas}
      onPointerUp={onPointerUpCanvas}
      onDrop={onCanvasDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{
        cursor:
          spacePressed || activeTool === "hand" || isPanningRef.current
            ? isPanningRef.current
              ? "grabbing"
              : "grab"
            : activeTool === "pen" || activeTool === "highlighter" || activeTool === "laser"
            ? "crosshair"
            : activeTool === "eraser"
            ? "crosshair"
            : "default",
      }}
    >
      {/* 1. Theme-Native Infinite Dot Grid Surface */}
      <div
        id="canvas-grid"
        className="pointer-events-none absolute inset-0 transition-opacity"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: `${28 * viewport.zoom}px ${28 * viewport.zoom}px`,
          backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
          color: "var(--border, rgba(120, 120, 120, 0.22))",
        }}
      />

      {/* 2. Scaled Canvas World Container */}
      <div
        className="canvas-world absolute inset-0 origin-top-left"
        style={{
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          transition: presenting ? "transform 650ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
        }}
      >
        {/* SVG Layer: Connectors, Arrowheads & Vector Drawings */}
        <svg className="pointer-events-none absolute inset-0 h-[20000px] w-[20000px] overflow-visible">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--accent, #6366f1)" />
            </marker>
            <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--muted, #94a3b8)" />
            </marker>
          </defs>

          {/* Persistent Freehand Vector Strokes */}
          {(board.strokes || []).map((stroke) => {
            if (stroke.points.length < 2) return null;
            const d = stroke.points.reduce((acc, pt, idx) => {
              return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
            }, "");
            return (
              <path
                key={stroke.id}
                d={d}
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={stroke.tool === "highlighter" ? 0.38 : 0.9}
                style={{
                  mixBlendMode: stroke.tool === "highlighter" ? "multiply" : "normal",
                }}
              />
            );
          })}

          {/* Current In-Flight Stroke */}
          {currentStrokeRef.current && currentStrokeRef.current.points.length > 1 && (
            <path
              d={currentStrokeRef.current.points.reduce((acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), "")}
              stroke={currentStrokeRef.current.color}
              strokeWidth={currentStrokeRef.current.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={currentStrokeRef.current.tool === "highlighter" ? 0.38 : 0.9}
            />
          )}

          {/* Laser Pointer Trail */}
          {laserTrail.length > 1 && (
            <path
              d={laserTrail.reduce((acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), "")}
              stroke="#ef4444"
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]"
            />
          )}

          {/* Relationship Connector Edges */}
          {board.edges.map((edge) => {
            const fromNode = board.nodes.find((n) => n.id === edge.fromNode);
            const toNode = board.nodes.find((n) => n.id === edge.toNode);
            if (!fromNode || !toNode) return null;

            const p1 = getPortPosition(fromNode, edge.fromSide);
            const p2 = getPortPosition(toNode, edge.toSide);
            const { path, labelPos } = calculateEdgePath(p1, edge.fromSide, p2, edge.toSide, edge.routing || "bezier");
            const isSelected = selectedEdgeId === edge.id;

            return (
              <g key={edge.id} className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edge.id); }} onDoubleClick={(e) => { e.stopPropagation(); setEditingEdgeLabel(edge.id); setEdgeLabelText(edge.label || ""); }}>
                {/* Invisible hit testing wider stroke */}
                <path d={path} stroke="transparent" strokeWidth={16} fill="none" />
                {/* Visible connector wire */}
                <path
                  d={path}
                  stroke={isSelected ? "var(--accent)" : edge.color || "var(--muted)"}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeDasharray={edge.dashed ? "6 4" : undefined}
                  markerEnd={edge.toEnd === "none" ? undefined : isSelected ? "url(#arrow)" : "url(#arrow-muted)"}
                  fill="none"
                  className="transition-all hover:stroke-accent"
                />
                {/* Inline Wire Label */}
                {edge.label && (
                  <foreignObject x={labelPos.x - 60} y={labelPos.y - 12} width={120} height={24} className="overflow-visible pointer-events-auto">
                    <div className="flex items-center justify-center">
                      <span className="rounded-full bg-surface-1/90 px-2 py-0.5 text-[10px] font-medium text-fg shadow-sm border hairline backdrop-blur-sm select-none">
                        {edge.label}
                      </span>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Active Connector Wire being dragged */}
          {connectingFrom && (
            <path
              d={`M ${connectingFrom.startX} ${connectingFrom.startY} L ${connectingFrom.currentX} ${connectingFrom.currentY}`}
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeDasharray="4 4"
              markerEnd="url(#arrow)"
              fill="none"
            />
          )}
        </svg>

        {/* 3. Canvas Nodes (Cards, Frames, Sticky Notes, Blocks & Embeds) */}
        {board.nodes.map((node) => {
          const isSelected = selectedNodeIds.has(node.id);
          const isFrame = node.type === "group" || node.data.subType === "group";

          // If it's a spatial Frame container:
          if (isFrame) {
            const currentTint =
              FRAME_TINTS.find((t) => t.id === node.color || t.id === node.data?.frameTint) ||
              FRAME_TINTS[0];
            return (
              <div
                key={node.id}
                className={`canvas-node-card absolute rounded-2xl border-2 transition-shadow ${
                  isSelected ? "border-accent shadow-xl ring-2 ring-accent/30" : "shadow-sm"
                }`}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  width: node.width,
                  height: node.height,
                  backgroundColor: currentTint.bg,
                  borderColor: isSelected ? "var(--accent)" : currentTint.border,
                  backdropFilter: "blur(2px)",
                }}
                onPointerDown={(e) => startDragNode(e, node)}
              >
                {/* Frame Header Bar */}
                <div className="flex h-9 items-center justify-between px-3 border-b hairline bg-surface-3/30 text-[12px] font-semibold text-fg/90 cursor-move">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Layers size={13} className="text-accent shrink-0" />
                    <input
                      className="bg-transparent border-0 outline-none font-semibold text-[12px] text-fg truncate"
                      value={node.label || node.data.title || "Frame"}
                      onChange={(e) => onUpdateNode?.(node.id, { label: e.target.value, data: { ...node.data, title: e.target.value } })}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Frame Tint Selector */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                      {FRAME_TINTS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`h-2.5 w-2.5 rounded-full border hairline transition-transform hover:scale-125 ${
                            currentTint.id === t.id ? "scale-125 ring-1 ring-accent" : ""
                          }`}
                          style={{ backgroundColor: t.border }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateNode?.(node.id, { color: t.id, data: { ...node.data, frameTint: t.id } });
                          }}
                          title={`Frame Tint: ${t.label}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-fg"
                      onClick={(e) => { e.stopPropagation(); fitToFrame(node); }}
                      title="Focus this frame"
                    >
                      <Maximize2 size={11} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-danger"
                      onClick={(e) => { e.stopPropagation(); onRemoveNode?.(node.id); }}
                      title="Delete Frame"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* 8-Direction Resize Handles */}
                {isSelected && (
                  <ResizeHandles node={node} onStartResize={(e, dir) => startResize(e, node, dir)} />
                )}
              </div>
            );
          }

          // If it's a Live Interactive Embed Node:
          if (node.type === "link" || node.data.subType === "embed") {
            return (
              <div
                key={node.id}
                className={`canvas-node-card group absolute select-none transition-shadow ${
                  isSelected ? "ring-2 ring-accent shadow-2xl" : ""
                }`}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  width: node.width,
                  height: node.height,
                }}
                onPointerDown={(e) => startDragNode(e, node)}
              >
                <LiveEmbedNode node={node} onUpdate={(patch) => onUpdateNode?.(node.id, patch)} />
                <MagneticPorts node={node} onStartConnector={startConnectorDrag} />
                {isSelected && <ResizeHandles node={node} onStartResize={(e, dir) => startResize(e, node, dir)} />}
              </div>
            );
          }

          // If it's an Image Node:
          if (
            node.data.subType === "image" ||
            (node.type === "file" &&
              node.file &&
              (node.file.endsWith(".png") ||
                node.file.endsWith(".jpg") ||
                node.file.endsWith(".jpeg") ||
                node.file.endsWith(".webp") ||
                node.file.endsWith(".gif") ||
                node.file.endsWith(".svg") ||
                node.file.startsWith("dayflit-image://") ||
                node.file.startsWith("dayflitimage://") ||
                node.file.startsWith("http://") ||
                node.file.startsWith("https://") ||
                node.file.startsWith("data:")))
          ) {
            const imgSrc = node.file ? imageUrl(node.file) : "";
            const isPinned = node.data.pinnedToDoc === true;
            return (
              <div
                key={node.id}
                className={`canvas-node-card group absolute select-none rounded-xl border hairline bg-surface/95 overflow-hidden shadow-sm backdrop-blur-md transition-all hover:shadow-lg ${
                  isSelected ? "ring-2 ring-accent shadow-xl" : ""
                }`}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  width: node.width,
                  height: node.height,
                }}
                onPointerDown={(e) => startDragNode(e, node)}
              >
                {/* Header bar */}
                <div className="flex h-7 items-center justify-between px-2 bg-surface-2/60 border-b hairline text-[11px] text-muted">
                  <div className="flex items-center gap-1.5 truncate">
                    <ImageIcon size={11} className="text-accent shrink-0" />
                    <span className="truncate text-[10px] font-medium text-fg">{node.data.title || "Image"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {board.noteId && (
                      <button
                        type="button"
                        className={`btn btn-sm !h-4 px-1 text-[9px] font-medium rounded-full ${
                          isPinned ? "bg-accent/15 text-accent border border-accent/30" : "text-muted hover:text-fg"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNode?.(node.id, { data: { ...node.data, pinnedToDoc: !isPinned } });
                          onDocBlockChanged?.();
                        }}
                        title={isPinned ? "Included in Doc" : "Canvas only"}
                      >
                        <Pin size={8} className={isPinned ? "rotate-45" : ""} />
                        <span>{isPinned ? "In Doc" : "Canvas"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-5 !w-5 opacity-0 group-hover:opacity-100 text-muted hover:text-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveNode?.(node.id);
                        onDocBlockChanged?.();
                      }}
                      title="Delete Image"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                <div className="relative h-[calc(100%-28px)] w-full overflow-hidden bg-black/10 flex items-center justify-center">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={node.data.title || "Canvas Image"}
                      className="h-full w-full object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted text-xs">
                      <ImageIcon size={24} />
                      <span>No image preview</span>
                    </div>
                  )}
                </div>

                <MagneticPorts node={node} onStartConnector={startConnectorDrag} />
                {isSelected && <ResizeHandles node={node} onStartResize={(e, dir) => startResize(e, node, dir)} />}
              </div>
            );
          }

          // If it's a Tactile Sticky Note:
          if (node.data.subType === "sticky") {
            const paletteItem = STICKY_PALETTE.find((p) => p.id === (node.data.stickyColor || "amber")) || STICKY_PALETTE[0];
            const textLen = (node.text || "").length;
            const stickyFontClass = textLen < 35 ? "text-[16px] leading-snug" : "text-[13px] leading-relaxed";

            return (
              <div
                key={node.id}
                className={`canvas-node-card group absolute select-none rounded-xl p-3 shadow-md transition-all hover:shadow-xl ${
                  isSelected ? "ring-2 ring-accent shadow-2xl scale-[1.01]" : ""
                }`}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  width: node.width,
                  height: node.height,
                  backgroundColor: paletteItem.bg,
                  borderColor: paletteItem.border,
                  color: paletteItem.fg,
                  borderWidth: "1px",
                }}
                onPointerDown={(e) => startDragNode(e, node)}
              >
                <div className="flex items-center justify-between pb-1.5 text-[10px] opacity-75">
                  <div className="flex items-center gap-1">
                    <StickyNote size={12} />
                    <span className="font-semibold uppercase tracking-wider">Sticky</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Palette picker dots */}
                    <div className="flex items-center gap-1 mr-1">
                      {STICKY_PALETTE.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`h-2.5 w-2.5 rounded-full border hairline transition-transform hover:scale-125 ${
                            paletteItem.id === p.id ? "scale-125 ring-1 ring-fg" : ""
                          }`}
                          style={{ backgroundColor: p.border }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateNode?.(node.id, {
                              color: p.id,
                              data: { ...node.data, stickyColor: p.id },
                            });
                          }}
                          title={`Color: ${p.id}`}
                        />
                      ))}
                    </div>

                    {board.noteId && (
                      <button
                        type="button"
                        className={`btn btn-sm !h-4 px-1 text-[9px] font-medium rounded-full ${
                          node.data.pinnedToDoc ? "bg-accent/15 text-accent border border-accent/30" : "text-muted hover:text-fg"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNode?.(node.id, { data: { ...node.data, pinnedToDoc: !node.data.pinnedToDoc } });
                          onDocBlockChanged?.();
                        }}
                        title={node.data.pinnedToDoc ? "Included in Doc" : "Canvas only"}
                      >
                        <Pin size={8} className={node.data.pinnedToDoc ? "rotate-45" : ""} />
                        <span>{node.data.pinnedToDoc ? "In Doc" : "Canvas"}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-5 !w-5"
                      onClick={(e) => { e.stopPropagation(); convertStickyToTask(node); }}
                      title="Convert Sticky to Task"
                    >
                      <CheckSquare size={11} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-5 !w-5"
                      onClick={(e) => { e.stopPropagation(); convertStickyToNote(node); }}
                      title="Convert Sticky to Note"
                    >
                      <FileText size={11} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-5 !w-5 hover:text-red-700"
                      onClick={(e) => { e.stopPropagation(); onRemoveNode?.(node.id); }}
                      title="Delete Sticky"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                <textarea
                  className={`h-[calc(100%-28px)] w-full resize-none bg-transparent font-medium ${stickyFontClass} outline-none`}
                  style={{ color: paletteItem.fg }}
                  placeholder="Type a thought, brainstorm, or note..."
                  value={node.text || ""}
                  onChange={(e) => onUpdateNode?.(node.id, { text: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                />

                <MagneticPorts node={node} onStartConnector={startConnectorDrag} />
                {isSelected && <ResizeHandles node={node} onStartResize={(e, dir) => startResize(e, node, dir)} />}
              </div>
            );
          }

          // If it's a Two-Way Bound Task Card:
          if (node.data.subType === "task") {
            const liveTask = tasks.find((t) => t.id === node.data.taskId);
            const taskTitle = liveTask?.title || node.data.taskTitle || node.text || "Task";
            const isDone = liveTask ? liveTask.status === "done" : node.data.taskStatus === "done";
            const priority = liveTask?.priority || node.data.taskPriority || "none";
            const nextPriorityMap: Record<string, "none" | "low" | "medium" | "high" | "urgent"> = {
              none: "low",
              low: "medium",
              medium: "high",
              high: "urgent",
              urgent: "none",
            };

            return (
              <div
                key={node.id}
                className={`canvas-node-card group absolute select-none rounded-xl border hairline bg-surface/95 p-3.5 shadow-sm backdrop-blur-md transition-all hover:shadow-lg ${
                  isSelected ? "ring-2 ring-accent shadow-xl" : ""
                } ${isDone ? "opacity-70 bg-surface/60" : ""}`}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  width: node.width,
                  height: node.height,
                }}
                onPointerDown={(e) => startDragNode(e, node)}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isDone ? "bg-accent border-accent text-accent-fg" : "border-border hover:border-accent"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (liveTask) {
                        toggleTask(liveTask.id);
                      } else {
                        const nextStatus = isDone ? "open" : "done";
                        onUpdateNode?.(node.id, { data: { ...node.data, taskStatus: nextStatus } });
                      }
                    }}
                  >
                    {isDone && <Check size={11} strokeWidth={3} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <input
                      className={`w-full bg-transparent text-[13px] font-medium outline-none truncate ${
                        isDone ? "line-through text-muted" : "text-fg"
                      }`}
                      value={taskTitle}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (liveTask) updateTask(liveTask.id, { title: val });
                        onUpdateNode?.(node.id, { text: val, data: { ...node.data, taskTitle: val } });
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />

                    <div className="flex items-center gap-1.5 pt-2 text-[10px] text-muted">
                      {/* Clickable Priority Pill */}
                      <button
                        type="button"
                        className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider text-[9px] transition-colors cursor-pointer ${
                          priority === "urgent"
                            ? "bg-red-500/20 text-red-500"
                            : priority === "high"
                            ? "bg-amber-500/20 text-amber-500"
                            : priority === "medium"
                            ? "bg-blue-500/20 text-blue-500"
                            : priority === "low"
                            ? "bg-emerald-500/20 text-emerald-500"
                            : "bg-surface-2 text-muted hover:text-fg"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextPri = nextPriorityMap[priority] || "none";
                          if (liveTask) updateTask(liveTask.id, { priority: nextPri });
                          onUpdateNode?.(node.id, { data: { ...node.data, taskPriority: nextPri } });
                        }}
                        title="Click to cycle priority"
                      >
                        {priority}
                      </button>

                      {liveTask?.due && (
                        <span className="text-faint">{liveTask.due}</span>
                      )}

                      {board.noteId && (
                        <button
                          type="button"
                          className={`btn btn-sm !h-4 px-1 text-[9px] font-medium rounded-full ml-auto ${
                            node.data.pinnedToDoc ? "bg-accent/15 text-accent border border-accent/30" : "text-muted hover:text-fg"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateNode?.(node.id, { data: { ...node.data, pinnedToDoc: !node.data.pinnedToDoc } });
                            onDocBlockChanged?.();
                          }}
                          title={node.data.pinnedToDoc ? "Included in Doc" : "Canvas only"}
                        >
                          <Pin size={8} className={node.data.pinnedToDoc ? "rotate-45" : ""} />
                          <span>{node.data.pinnedToDoc ? "In Doc" : "Canvas"}</span>
                        </button>
                      )}
                    </div>

                    {/* Subtasks Checklist */}
                    {liveTask?.subtasks && liveTask.subtasks.length > 0 && (
                      <div className="mt-2 space-y-1 border-t hairline pt-1.5 max-h-24 overflow-y-auto">
                        {liveTask.subtasks.map((st) => (
                          <div
                            key={st.id}
                            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-fg cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextSubtasks = liveTask.subtasks!.map((s) =>
                                s.id === st.id ? { ...s, done: !s.done } : s
                              );
                              updateTask(liveTask.id, { subtasks: nextSubtasks });
                            }}
                          >
                            <div
                              className={`flex h-3 w-3 shrink-0 items-center justify-center rounded border ${
                                st.done ? "bg-accent border-accent text-accent-fg" : "border-border"
                              }`}
                            >
                              {st.done && <Check size={8} strokeWidth={3} />}
                            </div>
                            <span className={`truncate ${st.done ? "line-through opacity-60" : ""}`}>{st.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-icon !h-5 !w-5 opacity-0 group-hover:opacity-100 text-muted hover:text-danger"
                    onClick={(e) => { e.stopPropagation(); onRemoveNode?.(node.id); }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                <MagneticPorts node={node} onStartConnector={startConnectorDrag} />
                {isSelected && <ResizeHandles node={node} onStartResize={(e, dir) => startResize(e, node, dir)} />}
              </div>
            );
          }

          // If it's an AFFiNE Edgeless Doc Block Card:
          if (node.data.subType === "docBlock") {
            const isPinned = node.data.pinnedToDoc !== false;
            const orderBadge = node.data.order ?? 1;

            return (
              <div
                key={node.id}
                className={`canvas-node-card group absolute select-none rounded-xl border hairline bg-surface/95 p-3.5 shadow-sm backdrop-blur-md transition-all hover:shadow-lg ${
                  isSelected ? "ring-2 ring-accent shadow-xl" : ""
                }`}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  width: node.width,
                  height: node.height,
                }}
                onPointerDown={(e) => startDragNode(e, node)}
              >
                {/* Header with AFFiNE Reading Order Badge */}
                <div className="flex items-center justify-between pb-2 border-b hairline text-[11px] text-muted">
                  <div className="flex items-center gap-1.5">
                    {/* AFFiNE Reading Order Badge */}
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg shadow-sm">
                      {orderBadge}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                      {node.data.blockType || "Block"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* 1-Click "Include in Doc / Pin to Page" Toggle */}
                    <button
                      type="button"
                      className={`btn btn-sm !h-5 px-1.5 text-[9px] font-medium gap-1 rounded-full transition-colors ${
                        isPinned
                          ? "bg-accent/15 text-accent border border-accent/30"
                          : "bg-surface-2 text-muted hover:text-fg"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextPinned = !isPinned;
                        onUpdateNode?.(node.id, { data: { ...node.data, pinnedToDoc: nextPinned } });
                        onDocBlockChanged?.();
                      }}
                      title={isPinned ? "Included in linear Markdown document" : "Canvas-only scratch card (excluded from doc)"}
                    >
                      <Pin size={9} className={isPinned ? "rotate-45" : ""} />
                      <span>{isPinned ? "In Doc" : "Canvas only"}</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-5 !w-5 opacity-0 group-hover:opacity-100 text-muted hover:text-danger"
                      onClick={(e) => { e.stopPropagation(); onRemoveNode?.(node.id); onDocBlockChanged?.(); }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Block Content Editor */}
                <textarea
                  className="mt-2 h-[calc(100%-42px)] w-full resize-none bg-transparent text-[13px] leading-relaxed text-fg outline-none font-mono"
                  value={node.text || ""}
                  onChange={(e) => {
                    onUpdateNode?.(node.id, { text: e.target.value });
                    onDocBlockChanged?.();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                />

                <MagneticPorts node={node} onStartConnector={startConnectorDrag} />
                {isSelected && <ResizeHandles node={node} onStartResize={(e, dir) => startResize(e, node, dir)} />}
              </div>
            );
          }

          // Default / Generic Text or Note Card:
          const liveNote = node.data.noteId ? notes.find((n) => n.id === node.data.noteId) : null;
          const displayTitle = liveNote?.title || node.data.title || "Note";
          const displayText = liveNote?.body || node.text || "";

          return (
            <div
              key={node.id}
              className={`canvas-node-card group absolute select-none rounded-xl border hairline bg-surface/95 p-3.5 shadow-sm backdrop-blur-md transition-all hover:shadow-lg ${
                isSelected ? "ring-2 ring-accent shadow-xl" : ""
              }`}
              style={{
                transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                width: node.width,
                height: node.height,
              }}
              onPointerDown={(e) => startDragNode(e, node)}
            >
              <div className="flex items-center justify-between pb-1.5 border-b hairline text-[11px] text-muted">
                <div className="flex items-center gap-1.5 font-semibold text-fg/90 truncate">
                  <FileText size={12} className="text-accent shrink-0" />
                  <span className="truncate">{displayTitle}</span>
                </div>
                <div className="flex items-center gap-1">
                  {board.noteId && (
                    <button
                      type="button"
                      className={`btn btn-sm !h-4 px-1 text-[9px] font-medium rounded-full ${
                        node.data.pinnedToDoc ? "bg-accent/15 text-accent border border-accent/30" : "text-muted hover:text-fg"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateNode?.(node.id, { data: { ...node.data, pinnedToDoc: !node.data.pinnedToDoc } });
                        onDocBlockChanged?.();
                      }}
                      title={node.data.pinnedToDoc ? "Included in Doc" : "Canvas only"}
                    >
                      <Pin size={8} className={node.data.pinnedToDoc ? "rotate-45" : ""} />
                      <span>{node.data.pinnedToDoc ? "In Doc" : "Canvas"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon !h-5 !w-5 opacity-0 group-hover:opacity-100 text-muted hover:text-danger"
                    onClick={(e) => { e.stopPropagation(); onRemoveNode?.(node.id); }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              <textarea
                className="mt-1.5 h-[calc(100%-36px)] w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-fg/90 outline-none"
                value={displayText}
                onChange={(e) => {
                  const val = e.target.value;
                  if (liveNote) setNoteBody(liveNote.id, val);
                  onUpdateNode?.(node.id, { text: val });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />

              <MagneticPorts node={node} onStartConnector={startConnectorDrag} />
              {isSelected && <ResizeHandles node={node} onStartResize={(e, dir) => startResize(e, node, dir)} />}
            </div>
          );
        })}

        {/* 4. Marquee Selection Rectangle */}
        {marquee && (
          <div
            className="pointer-events-none absolute border-2 border-accent/60 bg-accent/10 rounded-sm"
            style={{
              transform: `translate3d(${Math.min(marquee.startX, marquee.currentX)}px, ${Math.min(
                marquee.startY,
                marquee.currentY
              )}px, 0)`,
              width: Math.abs(marquee.currentX - marquee.startX),
              height: Math.abs(marquee.currentY - marquee.startY),
            }}
          />
        )}
      </div>

      {/* =====================================================================
          5. Floating Brainstorming Dock (Apple Freeform / AFFiNE Style)
          ===================================================================== */}
      {!zenMode && (
        <>
          {/* Secondary Stroke Options Micro-Dock (when pen/highlighter is active) */}
          {(activeTool === "pen" || activeTool === "highlighter") && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-xl border hairline bg-surface/95 px-2.5 py-1.5 shadow-xl backdrop-blur-xl text-[11px] max-w-[calc(100%-24px)] overflow-x-auto no-scrollbar flex-nowrap">
              <div className="flex items-center gap-1 pr-1.5 border-r hairline">
                {["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ffffff", "#1e293b"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-4 w-4 rounded-full border hairline transition-transform ${
                      penColor === c ? "scale-125 ring-2 ring-accent" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setPenColor(c)}
                    title={`Pen color: ${c}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 pr-1.5 border-r hairline">
                {[2, 4, 8].map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      penWidth === w ? "bg-accent/20 text-accent font-bold" : "text-muted hover:text-fg"
                    }`}
                    onClick={() => setPenWidth(w)}
                    title={`Stroke width: ${w}px`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost !h-6 px-1.5 text-[10px] text-muted hover:text-danger"
                onClick={() => {
                  onClearStrokes?.();
                }}
                title="Clear all ink drawings"
              >
                Clear ink
              </button>
            </div>
          )}

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-2xl border hairline bg-surface/90 px-3 py-2 shadow-2xl backdrop-blur-xl transition-all max-w-[calc(100%-24px)] overflow-x-auto no-scrollbar flex-nowrap">
            {/* Select (V) */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 ${activeTool === "select" ? "bg-accent/20 text-accent font-bold" : "text-muted"}`}
              onClick={() => setActiveTool("select")}
              title="Select tool (V)"
            >
              <MousePointer size={15} />
            </button>

            {/* Hand Pan (H) */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 ${activeTool === "hand" ? "bg-accent/20 text-accent font-bold" : "text-muted"}`}
              onClick={() => setActiveTool("hand")}
              title="Hand pan tool (H)"
            >
              <Hand size={15} />
            </button>

            <div className="mx-1 h-5 w-[1px] bg-border/60" />

            {/* Sticky Note (S) */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 text-amber-500`}
              onClick={() => {
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
                insertStickyCard(center.x - 120, center.y - 100);
              }}
              title="Add Sticky Note (S)"
            >
              <StickyNote size={15} />
            </button>

            {/* Pen Tool (P) */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 ${activeTool === "pen" ? "bg-accent/20 text-accent font-bold" : "text-muted"}`}
              onClick={() => setActiveTool("pen")}
              title="Pen drawing tool (P)"
            >
              <Pen size={15} />
            </button>

            {/* Highlighter Tool */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 ${activeTool === "highlighter" ? "bg-accent/20 text-accent font-bold" : "text-muted"}`}
              onClick={() => setActiveTool("highlighter")}
              title="Highlighter tool"
            >
              <Highlighter size={15} />
            </button>

            {/* Eraser Tool (E) */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 ${activeTool === "eraser" ? "bg-accent/20 text-accent font-bold" : "text-muted"}`}
              onClick={() => setActiveTool("eraser")}
              title="Eraser tool (E) - drag over strokes to erase"
            >
              <Eraser size={15} />
            </button>

            {/* Laser Pointer Tool (L) */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 ${activeTool === "laser" ? "bg-red-500/20 text-red-500 font-bold" : "text-muted"}`}
              onClick={() => setActiveTool("laser")}
              title="Laser pointer tool (L)"
            >
              <Sparkles size={15} />
            </button>

            <div className="mx-1 h-5 w-[1px] bg-border/60" />

            {/* Frame Container (F) */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 text-muted hover:text-fg`}
              onClick={() => {
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
                insertFrameCard(center.x - 260, center.y - 190);
              }}
              title="Add Frame Container (F)"
            >
              <Layers size={15} />
            </button>

            {/* Embed Node */}
            <button
              type="button"
              className={`btn btn-ghost btn-icon !h-8 !w-8 text-muted hover:text-fg`}
              onClick={() => {
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
                insertEmbedCard(center.x - 220, center.y - 160);
              }}
              title="Add Live Web Embed (Figma, Excalidraw, YouTube)"
            >
              <Globe size={15} />
            </button>

            <div className="mx-1 h-5 w-[1px] bg-border/60" />

            {/* Slide-out Workspace Drawer Toggle */}
            <button
              type="button"
              className={`btn btn-sm !h-8 gap-1.5 px-2.5 font-medium ${
                drawerOpen ? "btn-primary !bg-accent text-accent-fg" : "btn-ghost text-muted hover:text-fg"
              }`}
              onClick={() => setDrawerOpen((o) => !o)}
              title="Toggle Workspace Library Drawer"
            >
              <LayoutGrid size={14} />
              <span className="text-[11px]">Workspace</span>
            </button>
          </div>
        </>
      )}

      {/* =====================================================================
          6. Interactive Minimap & Zoom Pill (Bottom Right)
          ===================================================================== */}
      <div className="absolute bottom-20 right-4 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        {/* Interactive Minimap */}
        {!zenMode && board.nodes.length > 0 && (
          <div
            className="h-28 w-40 overflow-hidden rounded-xl border hairline bg-surface/85 shadow-xl backdrop-blur-md p-1.5 cursor-crosshair transition-all hover:ring-1 hover:ring-accent/40"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const clickY = e.clientY - rect.top;
              const normX = Math.max(0, Math.min(1, clickX / rect.width));
              const normY = Math.max(0, Math.min(1, clickY / rect.height));

              const bounds = minimapNodes.bounds;
              const worldX = bounds.minX + normX * bounds.width;
              const worldY = bounds.minY + normY * bounds.height;

              if (containerRef.current) {
                const cRect = containerRef.current.getBoundingClientRect();
                const nextPanX = cRect.width / 2 - worldX * viewport.zoom;
                const nextPanY = cRect.height / 2 - worldY * viewport.zoom;
                const next = { ...viewport, panX: nextPanX, panY: nextPanY };
                setViewport(next);
                onUpdateViewport?.(next);
              }
            }}
            title="Click minimap to jump camera"
          >
            <svg
              className="h-full w-full"
              viewBox={`${minimapNodes.bounds.minX} ${minimapNodes.bounds.minY} ${minimapNodes.bounds.width} ${minimapNodes.bounds.height}`}
            >
              {minimapNodes.nodes.map((n) => (
                <rect
                  key={n.id}
                  x={n.x}
                  y={n.y}
                  width={n.width}
                  height={n.height}
                  rx={4}
                  fill={n.type === "group" ? "var(--border)" : "var(--accent)"}
                  opacity={n.type === "group" ? 0.25 : 0.7}
                />
              ))}
              {/* Viewport Camera Box */}
              {containerRef.current && (
                <rect
                  x={-viewport.panX / viewport.zoom}
                  y={-viewport.panY / viewport.zoom}
                  width={containerRef.current.clientWidth / viewport.zoom}
                  height={containerRef.current.clientHeight / viewport.zoom}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={Math.max(2, minimapNodes.bounds.width / 80)}
                  opacity={0.8}
                  rx={3}
                />
              )}
            </svg>
          </div>
        )}

        {/* Zoom & Screen Controls Pill */}
        <div className="flex items-center gap-1 rounded-xl border hairline bg-surface/90 px-2 py-1 shadow-lg backdrop-blur-md text-[11px] text-muted">
          <button
            type="button"
            className="btn btn-ghost btn-icon !h-6 !w-6 hover:text-fg"
            onClick={() => {
              const newZoom = Math.max(0.15, viewport.zoom - 0.15);
              const next = { ...viewport, zoom: newZoom };
              setViewport(next);
              onUpdateViewport?.(next);
            }}
            title="Zoom out"
          >
            <Minus size={12} />
          </button>

          <button
            type="button"
            className="w-11 text-center font-mono font-medium text-fg hover:text-accent transition-colors"
            onClick={() => {
              const next = { ...viewport, zoom: 1 };
              setViewport(next);
              onUpdateViewport?.(next);
            }}
            title="Click to reset zoom to 100%"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-icon !h-6 !w-6 hover:text-fg"
            onClick={() => {
              const newZoom = Math.min(3.0, viewport.zoom + 0.15);
              const next = { ...viewport, zoom: newZoom };
              setViewport(next);
              onUpdateViewport?.(next);
            }}
            title="Zoom in"
          >
            <Plus size={12} />
          </button>

          <div className="mx-0.5 h-3.5 w-[1px] bg-border/60" />

          {/* Fit to Screen */}
          <button
            type="button"
            className="btn btn-ghost btn-icon !h-6 !w-6 hover:text-fg"
            onClick={fitToScreen}
            title="Fit to Screen"
          >
            <Maximize2 size={11} />
          </button>

          {/* Presentation Mode */}
          {frames.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-6 !w-6 hover:text-accent"
              onClick={startPresentation}
              title="Present Frames"
            >
              <Tv size={12} />
            </button>
          )}

          {/* Zen Fullscreen */}
          <button
            type="button"
            className={`btn btn-ghost btn-icon !h-6 !w-6 ${zenMode ? "text-accent" : "hover:text-fg"}`}
            onClick={() => setZenMode((z) => !z)}
            title="Toggle Zen Fullscreen Mode"
          >
            <Minimize2 size={11} />
          </button>
        </div>
      </div>

      {/* =====================================================================
          7. Slide-Out Workspace Drawer
          ===================================================================== */}
      {drawerOpen && (
        <div className="absolute top-12 left-4 bottom-20 z-40 flex w-80 max-w-[calc(100%-32px)] flex-col rounded-2xl border hairline bg-surface/95 shadow-2xl backdrop-blur-xl overflow-hidden">
          {/* Drawer Header */}
          <div className="flex h-11 items-center justify-between border-b hairline px-3.5 bg-surface-2/40">
            <div className="flex items-center gap-1.5 font-semibold text-[13px] text-fg">
              <LayoutGrid size={14} className="text-accent" />
              <span>Workspace Items</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-fg"
              onClick={() => setDrawerOpen(false)}
            >
              <X size={13} />
            </button>
          </div>

          {/* Drawer Search & Tabs */}
          <div className="p-2.5 border-b hairline bg-surface-2/20 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-surface-3/40 px-2 py-1 text-[12px]">
              <Search size={12} className="text-muted" />
              <input
                className="w-full bg-transparent outline-none text-fg placeholder:text-faint"
                placeholder="Search items to insert..."
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-muted">
              {(["tasks", "notes", "journal", "life", "clips", "images"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`capitalize px-2 py-0.5 rounded-md transition-colors ${
                    drawerTab === tab ? "bg-accent/15 text-accent font-semibold" : "hover:text-fg"
                  }`}
                  onClick={() => setDrawerTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Drawer Content List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {drawerTab === "images" && (
              <div className="p-3 space-y-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const name = await storeImageBlob(file);
                        const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                        onAddNode?.({
                          type: "file",
                          file: `dayflit-image://${name}`,
                          x: Math.round(center.x - 180),
                          y: Math.round(center.y - 120),
                          width: 360,
                          height: 240,
                          data: { subType: "image", title: file.name, pinnedToDoc: false },
                        });
                        setDrawerOpen(false);
                      } catch (err) {
                        toast({ title: "Failed to upload image", body: String(err), kind: "error" });
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary w-full gap-2 text-xs py-2.5 font-medium shadow-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon size={14} />
                  <span>Upload Local Image</span>
                </button>
                <div className="rounded-xl border hairline bg-surface-2/40 p-3 text-[11px] leading-relaxed text-muted">
                  💡 <span className="font-semibold text-fg">Tip:</span> You can also directly drag & drop image files (<code className="font-mono text-[10px]">.png</code>, <code className="font-mono text-[10px]">.jpg</code>, <code className="font-mono text-[10px]">.webp</code>) anywhere onto the canvas workspace.
                </div>
              </div>
            )}
            {drawerTab === "tasks" && (
              <>
                {tasks
                  .filter((t) => !drawerSearch || t.title.toLowerCase().includes(drawerSearch.toLowerCase()))
                  .slice(0, 30)
                  .map((task) => (
                    <div
                      key={task.id}
                      className="card card-hover flex items-center justify-between p-2 text-left text-[12px]"
                    >
                      <span className="truncate flex-1 font-medium">{task.title}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon !h-6 !w-6 text-accent shrink-0"
                        onClick={() => {
                          const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                          onAddNode?.({
                            type: "text",
                            x: center.x - 140,
                            y: center.y - 60,
                            width: 280,
                            height: 120,
                            data: {
                              subType: "task",
                              taskId: task.id,
                              taskTitle: task.title,
                              taskStatus: task.status,
                              taskPriority: task.priority,
                            },
                          });
                        }}
                        title="Add to canvas"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  ))}
              </>
            )}

            {drawerTab === "notes" && (
              <>
                {notes
                  .filter((n) => !drawerSearch || n.title.toLowerCase().includes(drawerSearch.toLowerCase()))
                  .slice(0, 30)
                  .map((note) => (
                    <div
                      key={note.id}
                      className="card card-hover flex items-center justify-between p-2 text-left text-[12px]"
                    >
                      <span className="truncate flex-1 font-medium">{note.title || "Untitled Note"}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon !h-6 !w-6 text-accent shrink-0"
                        onClick={() => {
                          const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                          onAddNode?.({
                            type: "text",
                            x: center.x - 160,
                            y: center.y - 110,
                            width: 320,
                            height: 220,
                            text: note.body,
                            data: {
                              subType: "note",
                              noteId: note.id,
                              title: note.title,
                            },
                          });
                        }}
                        title="Add to canvas"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  ))}
              </>
            )}

            {drawerTab === "journal" && (
              <>
                {journalEntries.slice(0, 20).map((entry) => (
                  <div key={entry.id} className="card card-hover flex items-center justify-between p-2 text-left text-[12px]">
                    <span className="truncate flex-1 font-medium">{entry.date} - {entry.title || "Reflection"}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-6 !w-6 text-accent shrink-0"
                      onClick={() => {
                        const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                        onAddNode?.({
                          type: "text",
                          x: center.x - 150,
                          y: center.y - 100,
                          width: 300,
                          height: 200,
                          text: entry.body,
                          data: { subType: "journal", journalId: entry.id, title: `${entry.date} Reflection` },
                        });
                      }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {drawerTab === "life" && (
              <>
                {(domains as any[]).map((dom) => (
                  <div key={dom.id} className="card card-hover flex items-center justify-between p-2 text-left text-[12px]">
                    <span className="truncate flex-1 font-medium">{dom.name}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-6 !w-6 text-accent shrink-0"
                      onClick={() => {
                        const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                        onAddNode?.({
                          type: "text",
                          x: center.x - 140,
                          y: center.y - 90,
                          width: 280,
                          height: 180,
                          text: `### Life Pillar: ${dom.name}\n\nSatisfaction: ${dom.score}/10\nVision & Goals aligned here.`,
                          data: { subType: "life", lifeDomainId: dom.id, title: dom.name },
                        });
                      }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {drawerTab === "clips" && (
              <>
                {clips.slice(0, 20).map((clip) => (
                  <div key={clip.id} className="card card-hover flex items-center justify-between p-2 text-left text-[12px]">
                    <span className="truncate flex-1 font-medium">{clip.text}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon !h-6 !w-6 text-accent shrink-0"
                      onClick={() => {
                        const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                        onAddNode?.({
                          type: "text",
                          x: center.x - 140,
                          y: center.y - 70,
                          width: 280,
                          height: 140,
                          text: clip.text,
                          data: { subType: "text", title: "Captured Clip" },
                        });
                      }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          8. Instant Radial Quick-Create Menu (Dropped Connector Wire)
          ===================================================================== */}
      {radialMenu && (
        <div
          className="absolute z-50 flex flex-col gap-1 rounded-2xl border hairline bg-surface/95 p-2 shadow-2xl backdrop-blur-xl"
          style={{ left: radialMenu.x, top: radialMenu.y }}
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Connect New Node
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-2 text-fg text-left"
            onClick={() => {
              const node = insertTaskCard(radialMenu.canvasX, radialMenu.canvasY, "Connected Task");
              if (node) {
                onAddEdge?.({
                  fromNode: radialMenu.fromNodeId,
                  fromSide: radialMenu.fromSide,
                  fromEnd: "none",
                  toNode: node.id,
                  toSide: "left",
                  toEnd: "arrow",
                });
              }
              setRadialMenu(null);
            }}
          >
            <CheckSquare size={13} className="text-accent" />
            <span>Task Card</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-2 text-fg text-left"
            onClick={() => {
              const node = insertStickyCard(radialMenu.canvasX, radialMenu.canvasY, "Connected Idea");
              if (node) {
                onAddEdge?.({
                  fromNode: radialMenu.fromNodeId,
                  fromSide: radialMenu.fromSide,
                  fromEnd: "none",
                  toNode: node.id,
                  toSide: "left",
                  toEnd: "arrow",
                });
              }
              setRadialMenu(null);
            }}
          >
            <StickyNote size={13} className="text-amber-500" />
            <span>Sticky Note</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-2 text-fg text-left"
            onClick={() => {
              const node = insertNoteCard(radialMenu.canvasX, radialMenu.canvasY, "Connected Note");
              if (node) {
                onAddEdge?.({
                  fromNode: radialMenu.fromNodeId,
                  fromSide: radialMenu.fromSide,
                  fromEnd: "none",
                  toNode: node.id,
                  toSide: "left",
                  toEnd: "arrow",
                });
              }
              setRadialMenu(null);
            }}
          >
            <FileText size={13} className="text-blue-500" />
            <span>Note Card</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium hover:bg-surface-2 text-fg text-left"
            onClick={() => {
              const node = insertEmbedCard(radialMenu.canvasX, radialMenu.canvasY);
              if (node) {
                onAddEdge?.({
                  fromNode: radialMenu.fromNodeId,
                  fromSide: radialMenu.fromSide,
                  fromEnd: "none",
                  toNode: node.id,
                  toSide: "left",
                  toEnd: "arrow",
                });
              }
              setRadialMenu(null);
            }}
          >
            <Globe size={13} className="text-emerald-500" />
            <span>Live Embed</span>
          </button>
        </div>
      )}

      {/* =====================================================================
          9. Frame Presentation Mode Overlay
          ===================================================================== */}
      {presenting && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border hairline bg-surface/95 px-4 py-2 shadow-2xl backdrop-blur-xl max-w-[calc(100%-24px)] overflow-x-auto no-scrollbar flex-nowrap">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <Tv size={15} className="text-accent" />
            <span>
              Frame {presentationIndex + 1} of {frames.length}: {frames[presentationIndex]?.label || "Frame"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-7 !w-7"
              onClick={prevFrame}
              disabled={presentationIndex === 0}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-7 !w-7"
              onClick={nextFrame}
              disabled={presentationIndex === frames.length - 1}
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-7 !w-7 text-muted hover:text-fg ml-2"
              onClick={exitPresentation}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          10. Inline Wire Label Editing Dialog
          ===================================================================== */}
      {editingEdgeLabel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="flex w-80 flex-col gap-2 rounded-xl border hairline bg-surface p-4 shadow-2xl">
            <h4 className="text-[13px] font-semibold text-fg">Edit Relationship Label</h4>
            <input
              autoFocus
              className="input text-[13px]"
              placeholder="e.g. leads to, depends on, references..."
              value={edgeLabelText}
              onChange={(e) => setEdgeLabelText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onUpdateEdge?.(editingEdgeLabel, { label: edgeLabelText });
                  setEditingEdgeLabel(null);
                } else if (e.key === "Escape") {
                  setEditingEdgeLabel(null);
                }
              }}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingEdgeLabel(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onUpdateEdge?.(editingEdgeLabel, { label: edgeLabelText });
                  setEditingEdgeLabel(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          11. Floating Edge Inspector (when an edge is selected)
          ===================================================================== */}
      {selectedEdgeId && (() => {
        const edge = board.edges.find((e) => e.id === selectedEdgeId);
        if (!edge) return null;
        return (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-2xl border hairline bg-surface/95 px-3 py-1.5 shadow-2xl backdrop-blur-xl text-[12px] max-w-[calc(100%-24px)] overflow-x-auto no-scrollbar flex-nowrap">
            <span className="font-semibold text-fg/80 pr-1">Edge:</span>
            <button
              type="button"
              className={`btn btn-sm !h-7 px-2 rounded-lg ${
                edge.routing === "bezier" || !edge.routing ? "btn-primary !bg-accent text-accent-fg" : "btn-ghost text-muted"
              }`}
              onClick={() => onUpdateEdge?.(edge.id, { routing: "bezier" })}
            >
              Curved
            </button>
            <button
              type="button"
              className={`btn btn-sm !h-7 px-2 rounded-lg ${
                edge.routing === "elbow" ? "btn-primary !bg-accent text-accent-fg" : "btn-ghost text-muted"
              }`}
              onClick={() => onUpdateEdge?.(edge.id, { routing: "elbow" })}
            >
              Elbow
            </button>
            <button
              type="button"
              className={`btn btn-sm !h-7 px-2 rounded-lg ${
                edge.routing === "straight" ? "btn-primary !bg-accent text-accent-fg" : "btn-ghost text-muted"
              }`}
              onClick={() => onUpdateEdge?.(edge.id, { routing: "straight" })}
            >
              Straight
            </button>
            <div className="mx-1 h-4 w-[1px] bg-border/60" />
            <button
              type="button"
              className={`btn btn-sm !h-7 px-2 rounded-lg ${
                edge.dashed ? "bg-accent/20 text-accent font-semibold" : "btn-ghost text-muted"
              }`}
              onClick={() => onUpdateEdge?.(edge.id, { dashed: !edge.dashed })}
            >
              {edge.dashed ? "Dashed" : "Solid"}
            </button>
            <button
              type="button"
              className="btn btn-sm !h-7 px-2 rounded-lg btn-ghost text-muted hover:text-fg"
              onClick={() => {
                setEditingEdgeLabel(edge.id);
                setEdgeLabelText(edge.label || "");
              }}
            >
              Label
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-7 !w-7 text-muted hover:text-danger ml-1"
              onClick={() => {
                onRemoveEdge?.(edge.id);
                setSelectedEdgeId(null);
              }}
              title="Delete Edge"
            >
              <Trash2 size={13} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-7 !w-7 text-muted hover:text-fg"
              onClick={() => setSelectedEdgeId(null)}
              title="Close Inspector"
            >
              <X size={13} />
            </button>
          </div>
        );
      })()}

      {/* =====================================================================
          12. Quick-Insert Spotlight Palette (/ and [[)
          ===================================================================== */}
      {quickMenu && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs"
          onClick={() => setQuickMenu(null)}
        >
          <div
            className="flex w-96 max-h-[460px] flex-col rounded-2xl border hairline bg-surface/95 shadow-2xl backdrop-blur-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b hairline px-3.5 py-2.5 bg-surface-2/30">
              <Search size={14} className="text-muted" />
              <input
                autoFocus
                className="w-full bg-transparent text-[13px] outline-none text-fg placeholder:text-muted"
                placeholder="Insert Card, Note, Sticky, or Embed... (Esc to close)"
                value={quickMenu.filter}
                onChange={(e) => setQuickMenu({ ...quickMenu, filter: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuickMenu(null);
                }}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {[
                {
                  id: "task",
                  label: "Task Card",
                  desc: "Live two-way bound task item",
                  icon: <CheckSquare size={14} className="text-accent" />,
                  action: () => insertTaskCard(quickMenu.canvasX, quickMenu.canvasY),
                },
                {
                  id: "sticky",
                  label: "Sticky Note",
                  desc: "Tactile square brainstorming note",
                  icon: <StickyNote size={14} className="text-amber-500" />,
                  action: () => insertStickyCard(quickMenu.canvasX, quickMenu.canvasY),
                },
                {
                  id: "note",
                  label: "Note Card",
                  desc: "Rich markdown document card",
                  icon: <FileText size={14} className="text-blue-500" />,
                  action: () => insertNoteCard(quickMenu.canvasX, quickMenu.canvasY),
                },
                {
                  id: "frame",
                  label: "Frame Container",
                  desc: "Spatial group boundary with presentation walkthrough",
                  icon: <Layers size={14} className="text-purple-500" />,
                  action: () => insertFrameCard(quickMenu.canvasX, quickMenu.canvasY),
                },
                {
                  id: "embed",
                  label: "Live Web Embed",
                  desc: "Interactive Figma, Excalidraw, or Web Preview",
                  icon: <Globe size={14} className="text-emerald-500" />,
                  action: () => insertEmbedCard(quickMenu.canvasX, quickMenu.canvasY),
                },
              ]
                .filter(
                  (item) =>
                    !quickMenu.filter ||
                    item.label.toLowerCase().includes(quickMenu.filter.toLowerCase()) ||
                    item.desc.toLowerCase().includes(quickMenu.filter.toLowerCase())
                )
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => {
                      item.action();
                      setQuickMenu(null);
                    }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3/50 shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-fg">{item.label}</div>
                      <div className="text-[10.5px] text-muted truncate">{item.desc}</div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Magnetic 4-Side Port Handles
// ============================================================================

function MagneticPorts({
  node,
  onStartConnector,
}: {
  node: CanvasNode;
  onStartConnector: (e: React.PointerEvent, node: CanvasNode, side: JSONCanvasSide) => void;
}) {
  const sides: JSONCanvasSide[] = ["top", "right", "bottom", "left"];

  return (
    <>
      {sides.map((side) => {
        const style =
          side === "top"
            ? { top: -6, left: "50%", transform: "translateX(-50%)" }
            : side === "right"
            ? { right: -6, top: "50%", transform: "translateY(-50%)" }
            : side === "bottom"
            ? { bottom: -6, left: "50%", transform: "translateX(-50%)" }
            : { left: -6, top: "50%", transform: "translateY(-50%)" };

        return (
          <div
            key={side}
            className="absolute z-20 h-3 w-3 cursor-crosshair rounded-full border-2 border-surface bg-accent opacity-0 shadow transition-opacity group-hover:opacity-100 hover:scale-125"
            style={style}
            onPointerDown={(e) => onStartConnector(e, node, side)}
            title={`Connect from ${side}`}
          />
        );
      })}
    </>
  );
}

// ============================================================================
// 8-Direction Resize Handles
// ============================================================================

function ResizeHandles({
  node,
  onStartResize,
}: {
  node: CanvasNode;
  onStartResize: (e: React.PointerEvent, dir: ResizeDirection) => void;
}) {
  const dirs: ResizeDirection[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  return (
    <>
      {dirs.map((dir) => {
        const style: React.CSSProperties = {
          position: "absolute",
          width: 8,
          height: 8,
          backgroundColor: "var(--accent)",
          border: "1.5px solid var(--surface)",
          borderRadius: 2,
          zIndex: 30,
        };

        if (dir.includes("n")) style.top = -4;
        if (dir.includes("s")) style.bottom = -4;
        if (dir.includes("w")) style.left = -4;
        if (dir.includes("e")) style.right = -4;
        if (dir === "n" || dir === "s") {
          style.left = "50%";
          style.transform = "translateX(-50%)";
        }
        if (dir === "w" || dir === "e") {
          style.top = "50%";
          style.transform = "translateY(-50%)";
        }

        const cursorMap: Record<ResizeDirection, string> = {
          nw: "nwse-resize",
          se: "nwse-resize",
          ne: "nesw-resize",
          sw: "nesw-resize",
          n: "ns-resize",
          s: "ns-resize",
          w: "ew-resize",
          e: "ew-resize",
        };

        style.cursor = cursorMap[dir];

        return (
          <div
            key={dir}
            style={style}
            onPointerDown={(e) => onStartResize(e, dir)}
          />
        );
      })}
    </>
  );
}
