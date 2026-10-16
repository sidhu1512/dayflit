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
    <div className="flex h-11 shrink-0 select-none items-center justify-between gap-1 px-2.5 flex-nowrap min-w-0" onMouseDown={startDrag} onDoubleClick={() => isTauri && void ipc.snap("fill-height")}>
      <div className="flex items-center gap-1 min-w-0 shrink-0">
        <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-2/70 active:scale-[0.97] shrink-0" onClick={() => navigate("today")} aria-label="Today">
          <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-[6px] bg-accent/15 text-accent ring-1 ring-accent/25 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.5L2 20.5l10-4 10 4L12 2.5z" />
            </svg>
          </span>
          <span className="text-[0.95em] font-semibold tracking-tight text-text">DayFlit</span>
        </button>
        {running && (
          <button className="chip chip-accent tabular ml-1 cursor-pointer shrink-0" onClick={() => navigate("focus")} aria-label="Open focus">
            {snap.session?.status === "paused" ? <Pause size={10} /> : <Play size={10} />} {formatClock(snap.session?.config.mode === "stopwatch" && snap.session.phase === "work" ? snap.elapsedSecs : snap.remainingSecs)}
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0" />
      <div className="flex items-center gap-0.5 shrink-0">
        <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onClick={() => openPalette("search")} aria-label="Search (Ctrl+K)">
          <Search size={15} />
        </button>
        <button
          className={`btn btn-ghost btn-icon btn-sm shrink-0 ${alwaysOnTop ? "text-accent" : "text-muted"}`}
          onClick={() => update({ window: { alwaysOnTop: !alwaysOnTop } })}
          aria-label={alwaysOnTop ? "Always on top: on" : "Always on top: off"}
        >
          {alwaysOnTop ? <Pin size={15} /> : <PinOff size={15} />}
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onClick={() => isTauri && void ipc.minimizeToBubble()} aria-label="Collapse to bubble">
          <ChevronsDownUp size={15} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onClick={() => isTauri && void getCurrentWindow().minimize()} aria-label="Minimize">
          <Minus size={15} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-muted hover:!bg-danger/80 hover:!text-white shrink-0" onClick={() => isTauri && void getCurrentWindow().close()} aria-label="Close">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
