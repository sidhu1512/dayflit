import { useEffect, useState, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useUi } from "@/stores/ui";
import { useNotes } from "@/stores/notes";
import { useCanvas } from "@/stores/canvas";
import { imageUrl } from "@/lib/imageUrl";

export function MediaLightbox() {
  const lightbox = useUi((s) => s.lightbox);
  const closeLightbox = useUi((s) => s.closeLightbox);
  const toast = useUi((s) => s.toast);

  const images = lightbox?.images ?? [];
  const [currIndex, setCurrIndex] = useState(lightbox?.index ?? 0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  // Sync index when lightbox opens or changes
  useEffect(() => {
    if (lightbox) {
      setCurrIndex(Math.max(0, Math.min(lightbox.index, (lightbox.images.length || 1) - 1)));
      setScale(1);
      setPan({ x: 0, y: 0 });
    }
  }, [lightbox]);

  const currentRaw = images[currIndex] ?? "";
  const currentSrc = currentRaw ? imageUrl(currentRaw) : "";

  const handlePrev = useCallback(() => {
    setCurrIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [images.length]);

  const zoomIn = () => setScale((s) => Math.min(5, Math.round((s + 0.25) * 100) / 100));
  const zoomOut = () => setScale((s) => Math.max(0.25, Math.round((s - 0.25) * 100) / 100));
  const zoomFit = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };
  const zoomActual = () => {
    setScale((s) => (s === 1 ? 2 : 1));
    setPan({ x: 0, y: 0 });
  };

  // Keyboard navigation
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        zoomFit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox, handlePrev, handleNext, closeLightbox]);

  // Mouse wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setScale((s) => Math.max(0.25, Math.min(5, Math.round((s + delta) * 100) / 100)));
  };

  // Pointer drag pan
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // 1-Click Action Bar
  const handleCopyImage = async () => {
    try {
      if (currentSrc.startsWith("data:") || currentSrc.startsWith("http")) {
        const resp = await fetch(currentSrc);
        const blob = await resp.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast({ title: "Image copied to clipboard", kind: "success" });
      } else {
        await navigator.clipboard.writeText(currentSrc);
        toast({ title: "Image path copied", kind: "success" });
      }
    } catch {
      await navigator.clipboard.writeText(currentSrc);
      toast({ title: "Image link copied", kind: "info" });
    }
  };

  const handleInsertIntoNote = () => {
    const rawName = currentRaw.replace(/^dayflit-?image:\/\//, "");
    const n = useNotes.getState().add({
      title: "Image Note",
      body: `![Captured Image](dayflit-image://${rawName})\n\n`,
      images: [rawName],
    });
    toast({
      title: "Inserted into new note",
      kind: "success",
      action: {
        label: "Open Note",
        onClick: () => {
          closeLightbox();
          useUi.getState().navigate("notes", n.id);
        },
      },
    });
  };

  const handleSendToCanvas = () => {
    const boards = useCanvas.getState().boards;
    const activeBoardId = useCanvas.getState().activeBoardId || boards[0]?.id;
    let targetBoardId = activeBoardId;
    if (!targetBoardId) {
      const nb = useCanvas.getState().createBoard("Image Board");
      targetBoardId = nb.id;
    }
    const fileRef = currentRaw.startsWith("dayflit-image://")
      ? currentRaw
      : currentRaw.startsWith("http") || currentRaw.startsWith("data:")
      ? currentRaw
      : `dayflit-image://${currentRaw}`;
    useCanvas.getState().addNode(targetBoardId, {
      type: "file",
      file: fileRef,
      data: { subType: "image" },
      x: 120,
      y: 120,
      width: 320,
      height: 240,
    });
    closeLightbox();
    useUi.getState().navigate("canvas");
    toast({ title: "Sent image to Canvas", kind: "success" });
  };

  const handleDeleteImage = () => {
    if (lightbox?.onDelete) {
      lightbox.onDelete(currentRaw, currIndex);
    }
    if (images.length <= 1) {
      closeLightbox();
    } else {
      setCurrIndex((prev) => Math.max(0, prev - 1));
    }
    toast({ title: "Image removed", kind: "info" });
  };

  if (!lightbox || images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-xl select-none anim-fade transition-opacity"
      onClick={(e) => {
        // If clicking outside controls, close
        if (e.target === e.currentTarget) closeLightbox();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Media Lightbox"
      data-testid="media-lightbox"
    >
      {/* Top Action Bar */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-white/10 bg-black/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-white/90 font-medium text-sm">
            <ImageIcon size={16} className="text-accent" />
            <span className="truncate max-w-[240px]">
              {lightbox.title || `Image ${currIndex + 1}`}
            </span>
          </div>
          {images.length > 1 && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/70 font-mono">
              {currIndex + 1} / {images.length}
            </span>
          )}
          <span className="text-xs text-white/50 font-mono">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1 border border-white/10">
          <button
            className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
            onClick={zoomOut}
            title="Zoom Out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            className="rounded px-2 py-0.5 text-xs font-mono text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
            onClick={zoomFit}
            title="Fit to Screen (0)"
          >
            Fit
          </button>
          <button
            className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
            onClick={zoomIn}
            title="Zoom In (+)"
            aria-label="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
          <button
            className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white transition cursor-pointer"
            onClick={zoomActual}
            title="100% Size"
            aria-label="Actual size"
          >
            <Maximize2 size={15} />
          </button>
        </div>

        {/* Right Action Icons & Close */}
        <div className="flex items-center gap-1.5">
          <button
            className="btn btn-sm btn-ghost gap-1.5 text-white/80 hover:bg-white/15 hover:text-white cursor-pointer"
            onClick={handleCopyImage}
            title="Copy Image to Clipboard"
          >
            <Copy size={14} />
            <span className="hidden sm:inline text-xs">Copy</span>
          </button>
          <button
            className="btn btn-sm btn-ghost gap-1.5 text-white/80 hover:bg-white/15 hover:text-white cursor-pointer"
            onClick={handleInsertIntoNote}
            title="Insert into Note"
          >
            <FileText size={14} />
            <span className="hidden sm:inline text-xs">Note</span>
          </button>
          <button
            className="btn btn-sm btn-ghost gap-1.5 text-white/80 hover:bg-white/15 hover:text-white cursor-pointer"
            onClick={handleSendToCanvas}
            title="Send to Canvas"
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline text-xs">Canvas</span>
          </button>
          {lightbox.onDelete && (
            <button
              className="btn btn-sm btn-ghost gap-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300 cursor-pointer"
              onClick={handleDeleteImage}
              title="Delete Image"
            >
              <Trash2 size={14} />
            </button>
          )}
          <div className="mx-1 h-5 w-px bg-white/15" />
          <button
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition cursor-pointer"
            onClick={closeLightbox}
            title="Close (Esc)"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Image Viewport Area with Pan & Zoom */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              className="absolute left-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-md border border-white/15 hover:bg-black/90 hover:text-white hover:scale-105 transition cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              title="Previous Image (ArrowLeft)"
              aria-label="Previous image"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              className="absolute right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-md border border-white/15 hover:bg-black/90 hover:text-white hover:scale-105 transition cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              title="Next Image (ArrowRight)"
              aria-label="Next image"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}

        {/* Center Scaled Image */}
        <div
          className="transition-transform duration-75 ease-out max-h-full max-w-full flex items-center justify-center p-6"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${scale})`,
          }}
        >
          <img
            ref={imgRef}
            src={currentSrc}
            alt=""
            className="max-h-[82vh] max-w-[88vw] rounded-xl object-contain shadow-2xl pointer-events-none select-none border border-white/10"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
