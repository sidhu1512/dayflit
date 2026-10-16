import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileCode,
  FolderOpen,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Tv,
  Upload,
  Layers,
  Trash2,
  Edit2,
  Check,
} from "lucide-react";
import { useCanvas } from "@/stores/canvas";
import { useUi } from "@/stores/ui";
import { CanvasBoard } from "@/components/CanvasBoard";
import { SlidingPillContainer } from "@/components/ui/MotionPrimitives";
import { HorizontalPillStrip, type PillStripItem } from "@/components/ui/HorizontalPillStrip";
import { cn } from "@/lib/ids";

export function CanvasView() {
  const boards = useCanvas((s) => s.boards);
  const activeBoardId = useCanvas((s) => s.activeBoardId);
  const setActiveBoard = useCanvas((s) => s.setActiveBoard);
  const createBoard = useCanvas((s) => s.createBoard);
  const updateBoard = useCanvas((s) => s.updateBoard);
  const deleteBoard = useCanvas((s) => s.deleteBoard);
  const addNode = useCanvas((s) => s.addNode);
  const updateNode = useCanvas((s) => s.updateNode);
  const removeNode = useCanvas((s) => s.removeNode);
  const addEdge = useCanvas((s) => s.addEdge);
  const updateEdge = useCanvas((s) => s.updateEdge);
  const removeEdge = useCanvas((s) => s.removeEdge);
  const addStroke = useCanvas((s) => s.addStroke);
  const clearStrokes = useCanvas((s) => s.clearStrokes);
  const updateViewport = useCanvas((s) => s.updateViewport);
  const exportBoardAsJSONCanvas = useCanvas((s) => s.exportBoardAsJSONCanvas);
  const importBoardFromJSONCanvas = useCanvas((s) => s.importBoardFromJSONCanvas);

  const toast = useUi((s) => s.toast);
  const ask = useUi((s) => s.ask);
  const viewParam = useUi((s) => s.viewParam);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState("");

  // Handle URL navigation params (e.g. param === "new")
  useEffect(() => {
    if (viewParam === "new") {
      const b = createBoard("New Canvas Board");
      useUi.getState().navigate("canvas", null);
    }
  }, [viewParam, createBoard]);

  // Ensure an active board is selected
  useEffect(() => {
    if (!activeBoardId && boards.length > 0) {
      setActiveBoard(boards[0].id);
    }
  }, [activeBoardId, boards, setActiveBoard]);

  const activeBoard = boards.find((b) => b.id === activeBoardId) || boards[0];

  useEffect(() => {
    if (activeBoard) {
      setTitleText(activeBoard.name);
    }
  }, [activeBoard?.id, activeBoard?.name]);

  // 1-Click Export to JSON Canvas 1.0 (.canvas)
  const handleExport = () => {
    if (!activeBoard) return;
    const jsonString = exportBoardAsJSONCanvas(activeBoard.id);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const sanitizedName = activeBoard.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "canvas";
    link.href = url;
    link.download = `${sanitizedName}.canvas`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({
      title: "Exported to Obsidian Canvas (.canvas)",
      body: `"${sanitizedName}.canvas" is ready for Obsidian or DayFlit.`,
      kind: "success",
    });
  };

  // 1-Click Import from JSON Canvas 1.0 (.canvas or .json)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const baseName = file.name.replace(/\.(canvas|json)$/i, "");
        const newBoard = importBoardFromJSONCanvas(text, baseName || "Imported Board");
        toast({
          title: "Canvas Imported Successfully",
          body: `Loaded ${newBoard.nodes.length} nodes and ${newBoard.edges.length} edges.`,
          kind: "success",
        });
      } catch (err) {
        toast({
          title: "Failed to Import Canvas",
          body: String(err),
          kind: "error",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCreateBoard = () => {
    const b = createBoard(`Canvas ${boards.length + 1}`);
    setBoardMenuOpen(false);
  };

  const handleDeleteBoard = async (id: string, name: string) => {
    if (boards.length <= 1) {
      toast({ title: "Cannot delete only canvas", kind: "warning" });
      return;
    }
    const confirmed = await ask({
      title: `Delete Canvas "${name}"?`,
      body: "This visual board and its arrangement will be permanently removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (confirmed) {
      deleteBoard(id);
    }
  };

  if (!activeBoard) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center text-muted">
        <div className="flex flex-col items-center gap-3">
          <LayoutGrid size={32} className="text-accent" />
          <h3 className="text-lg font-semibold text-fg">No Visual Canvases</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateBoard}>
            <Plus size={14} /> Create Board
          </button>
        </div>
      </div>
    );
  }

  const boardPillItems = useMemo<PillStripItem[]>(() => {
    return boards.map((b) => ({
      id: b.id,
      label: b.name,
      active: b.id === activeBoard.id,
      onSelect: () => setActiveBoard(b.id),
    }));
  }, [boards, activeBoard?.id, setActiveBoard]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg">
      {/* Standalone Canvas Top Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b hairline bg-surface/80 px-3.5 backdrop-blur-md z-20 flex-nowrap min-w-0 gap-2">
        {/* Left: Board Selector & Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <LayoutGrid size={16} className="text-accent shrink-0" />
          {editingTitle ? (
            <input
              autoFocus
              className="input !h-7 !py-0 !px-1.5 text-[13px] font-semibold max-w-[200px]"
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              onBlur={() => {
                updateBoard(activeBoard.id, { name: titleText });
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateBoard(activeBoard.id, { name: titleText });
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <HorizontalPillStrip
              activeKey={activeBoard.id}
              className="flex-1 min-w-0 min-h-[36px]"
              items={boardPillItems}
              onAdd={handleCreateBoard}
              onDelete={(id) => {
                if (boards.length > 1) {
                  deleteBoard(id);
                }
              }}
              onRename={(id, newName) => updateBoard(id, { name: newName })}
              canModify={() => boards.length > 1}
              addLabel="Create new canvas board"
              addAriaLabel="Add Board"
              quickSwitcherLabel={(n) => `All (${n}) ▾`}
              quickSwitcherThreshold={4}
              pillClassName="bg-accent/20 rounded-lg"
            />
          )}
        </div>

        {/* Right: 1-Click Import & Export JSON Canvas 1.0 */}
        <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".canvas,.json"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* 1-Click Import */}
          <button
            type="button"
            className="btn btn-ghost btn-sm !h-7 gap-1 px-2 text-[11px] font-medium text-muted hover:text-fg shrink-0 whitespace-nowrap"
            onClick={() => fileInputRef.current?.click()}
            title="Import Obsidian Canvas (.canvas) or JSON"
          >
            <Upload size={12} />
            <span className="hidden sm:inline">Import .canvas</span>
          </button>

          {/* 1-Click Export */}
          <button
            type="button"
            className="btn btn-ghost btn-sm !h-7 gap-1 px-2 text-[11px] font-medium text-accent hover:bg-accent/10 shrink-0 whitespace-nowrap"
            onClick={handleExport}
            title="Export as JSON Canvas 1.0 (.canvas) for Obsidian"
          >
            <Download size={12} />
            <span className="hidden sm:inline">Export .canvas</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm !h-7 gap-1 px-2.5 text-[11px] font-medium ml-1 shrink-0 whitespace-nowrap"
            onClick={handleCreateBoard}
          >
            <Plus size={12} />
            <span>New Board</span>
          </button>
        </div>
      </div>

      {/* Main Infinite Canvas Engine */}
      <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden">
        <CanvasBoard
          board={activeBoard}
          onUpdateBoard={(patch) => updateBoard(activeBoard.id, patch)}
          onAddNode={(n) => addNode(activeBoard.id, n)}
          onUpdateNode={(nodeId, patch) => updateNode(activeBoard.id, nodeId, patch)}
          onRemoveNode={(nodeId) => removeNode(activeBoard.id, nodeId)}
          onAddEdge={(edge) => addEdge(activeBoard.id, edge)}
          onUpdateEdge={(edgeId, patch) => updateEdge(activeBoard.id, edgeId, patch)}
          onRemoveEdge={(edgeId) => removeEdge(activeBoard.id, edgeId)}
          onAddStroke={(s) => addStroke(activeBoard.id, s)}
          onClearStrokes={() => clearStrokes(activeBoard.id)}
          onUpdateViewport={(vp) => updateViewport(activeBoard.id, vp)}
        />
      </div>
    </div>
  );
}
