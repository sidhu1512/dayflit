import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { BellOff, Timer, X } from "lucide-react";
import "@/styles/app.css";
import { ipc, on } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import { applyTheme } from "@/lib/themes";
import { loadCollection } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface Nudge {
  app: string;
  title: string;
  remainingSecs: number;
  taskTitle: string | null;
  reason: "app" | "keyword" | "fullscreen";
}

/** Subtle focus reminder shown when a distracting app/window comes to the front during a focus block. */
function NudgeWindow() {
  const [n, setN] = useState<Nudge | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const applyFromDisk = () => loadCollection<Partial<Settings> | null>("settings", null).then(({ data }) => applyTheme({ ...defaultSettings().appearance, ...(data?.appearance ?? {}) }));
    void applyFromDisk();
    const uns: (() => void)[] = [];
    void on<Nudge>("sid://nudge/show", (p) => {
      setN(p);
      setLeft(p.remainingSecs);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void ipc.hideNudge(), 7000);
    }).then((u) => uns.push(u));
    void on<unknown>("sid://settings/changed", () => void applyFromDisk()).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = Math.max(54, Math.ceil(el.getBoundingClientRect().height) + 40);
      void getCurrentWindow().setSize(new LogicalSize(516, h)).catch(() => {});
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape to close nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void ipc.hideNudge();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const drag = async (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* ignore */
    }
  };

  const mins = Math.max(1, Math.round(left / 60));
  return (
    <div className="w-fit select-none flex justify-center p-5 bg-transparent">
      <div
        ref={rootRef}
        data-tauri-drag-region
        className="glass flex items-center gap-3 !rounded-2xl px-3.5 py-2.5 anim-slide select-none w-[476px]"
        style={{
          background: "rgb(var(--bg) / 0.95)",
          boxShadow: "0 0 0 1px rgb(var(--border) / 0.12), 0 8px 24px -2px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)",
        }}
        onMouseDown={drag}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Timer size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.88em] font-medium">Focus session in progress · {mins} min remaining</div>
          <div className="truncate text-[0.76em] text-muted">
            {n?.taskTitle ? `Working on: ${n.taskTitle}` : n?.reason === "fullscreen" ? "A full-screen app just took over" : n?.app ? `${n.app} opened` : ""}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm text-[0.8em] text-muted" onClick={() => { void ipc.showMain(); void ipc.hideNudge(); }}>
          Back to DayFlit
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-faint" onClick={() => void ipc.nudgeSnooze()} aria-label="Snooze reminders for this session">
          <BellOff size={14} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-faint" onClick={() => void ipc.hideNudge()} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Nudge Error">
      <NudgeWindow />
    </ErrorBoundary>
  </StrictMode>,
);
