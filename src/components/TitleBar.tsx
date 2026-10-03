import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronsDownUp, Minus, Pause, Pin, PinOff, Play, Search, X } from "lucide-react";
import { ipc, isTauri } from "@/lib/ipc";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { useFocus } from "@/stores/focus";
import { formatClock } from "@/lib/dates";

export function TitleBar() {
  const alwaysOnTop = useSettings((s) => s.settings.window.alwaysOnTop);
  const update = useSettings((s) => s.update);
  const openPalette = useUi((s) => s.openPalette);
  const navigate = useUi((s) => s.navigate);
  const snap = useFocus((s) => s.snap);
  const running = snap.session && snap.session.status !== "finished";

  const startDrag = async (e: React.MouseEvent) => {
    if (e.button !== 0 || !isTauri) return;
    if ((e.target as HTMLElement).closest("button,input")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-11 shrink-0 select-none items-center gap-1 px-2.5" onMouseDown={startDrag} onDoubleClick={() => isTauri && void ipc.snap("fill-height")}>
      <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2/70" onClick={() => navigate("today")} aria-label="Today" data-tip="Today">
        <span className="relative inline-flex h-5 w-5 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-accent/30 blur-[6px]" />
          <span className="relative h-3 w-3 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--accent)/0.8)]" />
        </span>
        <span className="text-[0.95em] font-semibold tracking-tight">Dayflit</span>
      </button>
      {running && (
        <button className="chip chip-accent tabular ml-1 cursor-pointer" onClick={() => navigate("focus")} aria-label="Open focus" data-tip="Open focus">
          {snap.session?.status === "paused" ? <Pause size={10} /> : <Play size={10} />} {formatClock(snap.session?.config.mode === "stopwatch" && snap.session.phase === "work" ? snap.elapsedSecs : snap.remainingSecs)}
        </button>
      )}
      <div className="flex-1" />
      <button className="btn btn-ghost btn-icon btn-sm text-muted" onClick={() => openPalette("search")} aria-label="Search (Ctrl+K)" data-tip="Search (Ctrl+K)">
        <Search size={15} />
      </button>
      <button
        className={`btn btn-ghost btn-icon btn-sm ${alwaysOnTop ? "text-accent" : "text-muted"}`}
        onClick={() => update({ window: { alwaysOnTop: !alwaysOnTop } })}
        aria-label={alwaysOnTop ? "Always on top: on" : "Always on top: off"} data-tip={alwaysOnTop ? "Always on top: on" : "Always on top: off"}
      >
        {alwaysOnTop ? <Pin size={15} /> : <PinOff size={15} />}
      </button>
      <button className="btn btn-ghost btn-icon btn-sm text-muted" onClick={() => isTauri && void ipc.minimizeToBubble()} aria-label="Collapse to bubble" data-tip="Collapse to bubble">
        <ChevronsDownUp size={15} />
      </button>
      <button className="btn btn-ghost btn-icon btn-sm text-muted" onClick={() => isTauri && void getCurrentWindow().minimize()} aria-label="Minimize" data-tip="Minimize">
        <Minus size={15} />
      </button>
      <button className="btn btn-ghost btn-icon btn-sm text-muted hover:!bg-danger/80 hover:!text-white" onClick={() => isTauri && void getCurrentWindow().close()} aria-label="Close" data-tip="Close">
        <X size={15} />
      </button>
    </div>
  );
}
