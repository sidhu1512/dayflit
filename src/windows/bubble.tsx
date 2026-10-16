import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Pin } from "lucide-react";
import "@/styles/app.css";
import { ipc, on } from "@/lib/ipc";
import type { FocusSnapshot, Settings, StashPin } from "@/lib/types";
import { applyTheme } from "@/lib/themes";
import { flush, loadCollection, scheduleSave } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { formatClock } from "@/lib/dates";
import { uid } from "@/lib/ids";
import { PauseBars } from "@/components/icons";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function Bubble() {
  const [snap, setSnap] = useState<FocusSnapshot | null>(null);
  const [hover, setHover] = useState(false);
  const [showTimer, setShowTimer] = useState(true);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [justStashed, setJustStashed] = useState(false);
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragging = useRef(false);
  const dragCounterRef = useRef(0);
  const stashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void loadCollection<Partial<Settings> | null>("settings", null).then(({ data }) => {
      const s = { ...defaultSettings(), ...(data ?? {}) } as Settings;
      applyTheme({ ...defaultSettings().appearance, ...(data?.appearance ?? {}) });
      setShowTimer(s.window?.bubbleShowsTimer ?? true);
    });
    void ipc.focusGet().then(setSnap).catch(() => {});
    const uns: (() => void)[] = [];
    void on<FocusSnapshot>("sid://focus/state", setSnap).then((u) => uns.push(u));
    void on<FocusSnapshot>("sid://focus/tick", setSnap).then((u) => uns.push(u));
    void on<unknown>("sid://settings/changed", () => {
      void loadCollection<Partial<Settings> | null>("settings", null).then(({ data }) => {
        applyTheme({ ...defaultSettings().appearance, ...(data?.appearance ?? {}) });
        setShowTimer(data?.window?.bubbleShowsTimer ?? true);
      });
    }).then((u) => uns.push(u));
    return () => {
      uns.forEach((u) => u());
      if (stashTimerRef.current) window.clearTimeout(stashTimerRef.current);
    };
  }, []);

  // Dropover / Yoink paste listener for floating bubble
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        const newPin: StashPin = {
          id: uid(),
          type: /^https?:\/\//i.test(text) ? "url" : "text",
          title: text.slice(0, 36),
          content: text,
          createdAt: Date.now(),
        };
        try {
          const { data } = await loadCollection<StashPin[]>("stash", []);
          const prev = Array.isArray(data) ? data : [];
          scheduleSave("stash", [newPin, ...prev]);
          void flush("stash");
          setJustStashed(true);
          if (stashTimerRef.current) window.clearTimeout(stashTimerRef.current);
          stashTimerRef.current = window.setTimeout(() => setJustStashed(false), 1400);
        } catch {}
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const session = snap?.session && snap.session.status !== "finished" ? snap.session : null;
  const isBreak = session && session.phase !== "work";
  const progress = snap?.progress ?? 0;
  const stopwatch = session?.config.mode === "stopwatch" && session.phase === "work";
  const clock = snap ? formatClock(stopwatch ? snap.elapsedSecs : snap.remainingSecs) : "";
  const r = 25;
  const c = 2 * Math.PI * r;

  // Click restores; a real movement starts a native drag. Starting the drag on mousedown would
  // swallow mouseup inside the OS move loop, so the click would never register.
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return;
    down.current = { x: e.screenX, y: e.screenY, t: Date.now() };
    dragging.current = false;
  };
  const onMouseMove = async (e: React.MouseEvent) => {
    const d = down.current;
    if (!d || dragging.current) return;
    if (Math.hypot(e.screenX - d.x, e.screenY - d.y) >= 4) {
      dragging.current = true;
      try {
        await getCurrentWindow().startDragging();
      } catch {
        /* ignore */
      }
      down.current = null;
      void ipc.rememberWindow("bubble");
    }
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || dragging.current) return;
    if (e.button === 1 && session) void ipc.focusToggle();
    else void ipc.restoreFromBubble();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer && e.dataTransfer.types.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const dt = e.dataTransfer;
    if (!dt) return;

    const text = dt.getData("text/plain");
    const uri = dt.getData("text/uri-list");
    const files = Array.from(dt.files);

    const newPins: StashPin[] = [];
    if (files.length > 0) {
      files.forEach((f) => {
        newPins.push({
          id: uid(),
          type: f.type.startsWith("image/") ? "image" : "file",
          title: f.name,
          content: f.name,
          createdAt: Date.now(),
        });
      });
    } else if (uri || (text && /^https?:\/\//i.test(text))) {
      const targetUrl = uri || text;
      newPins.push({
        id: uid(),
        type: "url",
        title: targetUrl.replace(/^https?:\/\//, "").slice(0, 36),
        content: targetUrl,
        createdAt: Date.now(),
      });
    } else if (text) {
      newPins.push({
        id: uid(),
        type: "text",
        title: text.slice(0, 36),
        content: text,
        createdAt: Date.now(),
      });
    }

    if (newPins.length > 0) {
      try {
        const { data } = await loadCollection<StashPin[]>("stash", []);
        const prev = Array.isArray(data) ? data : [];
        const next = [...newPins, ...prev];
        scheduleSave("stash", next);
        void flush("stash");
      } catch {
        /* ignore */
      }

      setJustStashed(true);
      if (stashTimerRef.current) window.clearTimeout(stashTimerRef.current);
      stashTimerRef.current = window.setTimeout(() => {
        setJustStashed(false);
      }, 1400);
    }
  };

  return (
    <div
      className="flex h-full w-full select-none items-center justify-center bg-transparent p-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="relative flex h-[56px] w-[56px] cursor-pointer select-none items-center justify-center rounded-full transition-transform duration-200"
        style={{
          transform: isDraggingOver ? "scale(1.12)" : hover ? "scale(1.03)" : "scale(1)",
          filter: hover || isDraggingOver ? "brightness(1.08)" : "none",
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { if (!dragging.current) down.current = null; }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (session) void ipc.focusToggle();
        }}
      >
        <div
          className="absolute inset-0 rounded-full transition-all duration-200"
          style={{
            background: "rgb(var(--bg) / 0.94)",
            boxShadow: isDraggingOver
              ? "0 0 0 2px rgb(var(--accent)), 0 0 16px rgb(var(--accent) / 0.5), 0 4px 16px rgba(0, 0, 0, 0.4)"
              : justStashed
              ? "0 0 0 2px #10b981, 0 0 16px rgba(16, 185, 129, 0.4), 0 4px 16px rgba(0, 0, 0, 0.4)"
              : "0 0 0 1px rgb(var(--border) / 0.14), 0 2px 8px rgba(0, 0, 0, 0.3), 0 4px 12px -2px rgba(0, 0, 0, 0.4)",
          }}
        />
        <div
          className="absolute inset-[4px] rounded-full opacity-25 pointer-events-none"
          style={{
            background: isDraggingOver
              ? `linear-gradient(135deg, rgb(var(--accent) / 0.8), transparent 70%)`
              : justStashed
              ? `linear-gradient(135deg, rgba(16, 185, 129, 0.8), transparent 70%)`
              : `linear-gradient(135deg, rgb(var(--accent) / 0.5), transparent 70%)`,
          }}
        />
        {session && showTimer && !isDraggingOver && !justStashed && (
          <svg className="absolute inset-0 -rotate-90" width="100%" height="100%" viewBox="0 0 56 56">
            <circle cx={28} cy={28} r={r} fill="none" strokeWidth={3} stroke="rgb(var(--border) / 0.15)" />
            <circle
              cx={28}
              cy={28}
              r={r}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              stroke={isBreak ? "#3ccf8e" : "rgb(var(--accent))"}
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              style={{ transition: "stroke-dashoffset 900ms linear" }}
            />
          </svg>
        )}
        <div className="relative flex flex-col items-center">
          {justStashed ? (
            <Check className="h-4 w-4 text-emerald-400 animate-in zoom-in-75 duration-200" strokeWidth={2.5} />
          ) : isDraggingOver ? (
            <Pin className="h-4 w-4 text-accent animate-pulse" strokeWidth={2.2} />
          ) : session && showTimer ? (
            <span className="tabular text-[11px] font-semibold leading-none" style={{ color: "rgb(var(--text))" }}>
              {session.status === "paused" ? <PauseBars size={10} /> : clock.replace(/^0/, "")}
            </span>
          ) : (
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] transition-transform"
              style={{
                background: "rgb(var(--accent))",
                boxShadow: "0 1px 2px rgb(0 0 0 / 0.2)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Bubble Error">
      <Bubble />
    </ErrorBoundary>
  </StrictMode>,
);
