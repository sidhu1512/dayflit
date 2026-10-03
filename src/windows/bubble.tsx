import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@/styles/app.css";
import { ipc, on } from "@/lib/ipc";
import type { FocusSnapshot, Settings } from "@/lib/types";
import { applyTheme } from "@/lib/themes";
import { loadCollection } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { formatClock } from "@/lib/dates";
import { PauseBars } from "@/components/icons";

function Bubble() {
  const [snap, setSnap] = useState<FocusSnapshot | null>(null);
  const [hover, setHover] = useState(false);
  const [showTimer, setShowTimer] = useState(true);
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragging = useRef(false);

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
    return () => uns.forEach((u) => u());
  }, []);

  const session = snap?.session && snap.session.status !== "finished" ? snap.session : null;
  const isBreak = session && session.phase !== "work";
  const progress = snap?.progress ?? 0;
  const stopwatch = session?.config.mode === "stopwatch" && session.phase === "work";
  const clock = snap ? formatClock(stopwatch ? snap.elapsedSecs : snap.remainingSecs) : "";
  const r = 26;
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

  return (
    <div className="flex h-full w-full items-center justify-center bg-transparent" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div
        className="relative flex h-full w-full cursor-pointer select-none items-center justify-center rounded-full"
        style={{ filter: hover ? "brightness(1.08)" : "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { if (!dragging.current) down.current = null; }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (session) void ipc.focusToggle();
        }}
      >
        <div className="absolute inset-0 rounded-full" style={{ background: "rgb(var(--bg) / 0.92)", boxShadow: "0 6px 24px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(var(--border) / 0.12)" }} />
        <div className="absolute inset-[6px] rounded-full opacity-70" style={{ background: `radial-gradient(circle at 35% 30%, rgb(var(--accent) / 0.9), rgb(var(--accent) / 0.25) 60%, transparent 75%)`, filter: "blur(2px)" }} />
        {session && showTimer && (
          <svg className="absolute inset-0 -rotate-90" width="100%" height="100%" viewBox="0 0 58 58">
            <circle cx={29} cy={29} r={r} fill="none" strokeWidth={3} stroke="rgb(var(--border) / 0.15)" />
            <circle cx={29} cy={29} r={r} fill="none" strokeWidth={3} strokeLinecap="round" stroke={isBreak ? "#3ccf8e" : "rgb(var(--accent))"} strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: "stroke-dashoffset 900ms linear" }} />
          </svg>
        )}
        <div className="relative flex flex-col items-center">
          {session && showTimer ? (
            <span className="tabular text-[11px] font-semibold leading-none" style={{ color: "rgb(var(--text))" }}>
              {session.status === "paused" ? <PauseBars size={10} /> : clock.replace(/^0/, "")}
            </span>
          ) : (
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: "rgb(var(--accent))", boxShadow: "0 0 12px rgb(var(--accent) / 0.9)" }} />
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Bubble />
  </StrictMode>,
);
