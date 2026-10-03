import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Pause, Play, SkipForward, Square, X } from "lucide-react";
import "@/styles/app.css";
import { ipc, on } from "@/lib/ipc";
import type { FocusSnapshot, Settings } from "@/lib/types";
import { applyTheme } from "@/lib/themes";
import { loadCollection } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { formatClock } from "@/lib/dates";

function Pip() {
  const [snap, setSnap] = useState<FocusSnapshot | null>(null);
  useEffect(() => {
    const applyFromDisk = () =>
      loadCollection<Partial<Settings> | null>("settings", null).then(({ data }) => applyTheme({ ...defaultSettings().appearance, ...(data?.appearance ?? {}) }));
    void applyFromDisk();
    void ipc.focusGet().then(setSnap).catch(() => {});
    const uns: (() => void)[] = [];
    void on<FocusSnapshot>("sid://focus/state", setSnap).then((u) => uns.push(u));
    void on<FocusSnapshot>("sid://focus/tick", setSnap).then((u) => uns.push(u));
    void on<unknown>("sid://settings/changed", () => void applyFromDisk()).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  const s = snap?.session && snap.session.status !== "finished" ? snap.session : null;
  const isBreak = s?.phase !== "work";
  const stopwatch = s?.config.mode === "stopwatch" && s.phase === "work";
  const label = !s ? "No session" : s.phase === "work" ? (s.config.taskTitle ?? s.config.label ?? "Focus") : s.phase === "shortBreak" ? "Short break" : "Long break";
  const drag = async (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    try {
      await getCurrentWindow().startDragging();
      void ipc.rememberWindow("pip");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="h-full w-full p-1.5">
      <div className="glass relative flex h-full select-none items-center gap-3 !rounded-2xl px-3 shadow-xl" style={{ background: "rgb(var(--bg) / 0.9)" }} onMouseDown={drag}>
        <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl">
          <div className="h-full transition-[width] duration-1000 ease-linear" style={{ width: `${(snap?.progress ?? 0) * 100}%`, background: isBreak ? "#3ccf8e" : "rgb(var(--accent))" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="tabular text-[1.9em] font-semibold leading-none" style={{ color: s?.status === "paused" ? "rgb(var(--text-muted))" : "rgb(var(--text))" }}>
            {s ? formatClock(stopwatch ? snap!.elapsedSecs : snap!.remainingSecs) : "--:--"}
          </div>
          <div className="mt-1 truncate text-[0.75em] text-muted">
            {label}
            {s && s.status === "paused" && <span className="ml-1 text-warning">· paused</span>}
            {s && s.status === "awaiting" && <span className="ml-1 text-accent">· ready</span>}
            {s && s.phase === "work" && s.config.targetWorkPhases > 0 && (
              <span className="ml-1 text-faint">
                {s.workPhaseIndex}/{s.config.targetWorkPhases}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {s ? (
            <>
              <button className="btn btn-icon !rounded-full" style={s.status !== "running" ? { background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" } : undefined} onClick={() => void ipc.focusToggle()} aria-label={s.status === "running" ? "Pause" : "Resume"} data-tip={s.status === "running" ? "Pause" : "Resume"}>
                {s.status === "running" ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
              </button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void ipc.focusSkip()} aria-label="Skip" data-tip="Skip">
                <SkipForward size={14} />
              </button>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void ipc.focusStop(false)} aria-label="Stop" data-tip="Stop">
                <Square size={13} />
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => void ipc.focusStart({ ...defaultSettings().focus.defaults, taskId: null, taskTitle: null, label: null })}>
              <Play size={13} /> Start
            </button>
          )}
          <button className="btn btn-ghost btn-icon btn-sm text-faint" onClick={() => void ipc.showMain()} aria-label="Open Dayflit" data-tip="Open Dayflit">
            <Maximize2 size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-faint" onClick={() => void ipc.hidePip()} aria-label="Hide timer" data-tip="Hide timer">
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Pip />
  </StrictMode>,
);
