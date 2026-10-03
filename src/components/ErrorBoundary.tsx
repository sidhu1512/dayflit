import { Component, type ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { ipc, isTauri } from "@/lib/ipc";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    void ipc.log(`render error: ${error.message}\n${info.componentStack ?? ""}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell flex flex-col">
        <div className="flex h-11 items-center justify-end gap-1 px-2" onMouseDown={(e) => { if (isTauri && !(e.target as HTMLElement).closest("button")) void getCurrentWindow().startDragging().catch(() => {}); }}>
          <button className="btn btn-ghost btn-icon btn-sm text-muted" aria-label="Minimize" onClick={() => isTauri && void getCurrentWindow().minimize()}>
            <Minus size={15} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-muted hover:!bg-danger/80 hover:!text-white" aria-label="Close" onClick={() => (isTauri ? void ipc.quit() : window.close())}>
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
        <div className="glass max-w-sm p-5 text-center">
          <div className="font-semibold text-danger">Something went wrong</div>
          <div className="selectable mt-2 max-h-40 overflow-auto text-left text-[0.8em] text-muted">{this.state.error.message}</div>
          <div className="mt-4 flex justify-center gap-2">
            <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
          <div className="mt-3 text-[0.75em] text-faint">Your data is safe. Details were written to the log.</div>
        </div>
        </div>
      </div>
    );
  }
}
