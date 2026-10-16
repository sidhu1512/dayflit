import { Component, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Copy, Check, Minus, RefreshCw, Power, X, ChevronDown, ChevronUp } from "lucide-react";
import { ipc, isTauri } from "@/lib/ipc";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUi } from "@/stores/ui";

interface State {
  error: Error | null;
  componentStack: string | null;
  showDiagnostics: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode; fallbackTitle?: string }, State> {
  state: State = { error: null, componentStack: null, showDiagnostics: false, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ componentStack: info.componentStack ?? null });
    void ipc.log(`[ErrorBoundary] ${error.name}: ${error.message}\n${info.componentStack ?? ""}`);
  }

  handleCopyDiagnostics = () => {
    const diag = [
      `DayFlit Diagnostics Report`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${this.state.error?.name || "Error"}: ${this.state.error?.message || "Unknown"}`,
      `Stack: ${this.state.error?.stack || "N/A"}`,
      `Component: ${this.state.componentStack || "N/A"}`,
    ].join("\n");
    navigator.clipboard.writeText(diag).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  handleReturnToSafeScreen = () => {
    try {
      useUi.getState().navigate("today");
    } catch {
      /* ignore */
    }
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-shell flex flex-col h-full w-full bg-bg text-text select-none">
        {/* Safe Window Header */}
        <div
          data-tauri-drag-region
          className="flex h-10 items-center justify-between border-b hairline px-3.5 bg-surface/60 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            if (isTauri && !(e.target as HTMLElement).closest("button")) {
              void getCurrentWindow().startDragging().catch(() => {});
            }
          }}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted">
            <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
            <span>DayFlit Recovery</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="btn btn-ghost btn-icon btn-sm text-muted hover:text-text"
              aria-label="Minimize"
              onClick={() => isTauri && void getCurrentWindow().minimize()}
            >
              <Minus size={14} />
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm text-muted hover:!bg-danger/80 hover:!text-white"
              aria-label="Close DayFlit"
              onClick={() => (isTauri ? void ipc.quit() : window.close())}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 items-center justify-center p-6 overflow-y-auto">
          <div className="glass max-w-md w-full p-6 text-center rounded-2xl shadow-xl border hairline">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/15 text-danger">
              <AlertTriangle size={24} />
            </div>

            <div className="text-[1.15em] font-semibold text-text">
              {this.props.fallbackTitle || "Something went wrong"}
            </div>
            <p className="mt-1.5 text-[0.82em] text-muted leading-relaxed">
              DayFlit encountered an unexpected error. Your saved files, notes, tasks, and journals are safe.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  onClick={this.handleReturnToSafeScreen}
                >
                  <ArrowLeft size={13} />
                  <span>Return to Today</span>
                </button>
                <button
                  className="btn btn-sm flex items-center gap-1.5"
                  onClick={() => this.setState({ error: null })}
                >
                  <RefreshCw size={13} />
                  <span>Try again</span>
                </button>
                <button
                  className="btn btn-sm flex items-center gap-1.5"
                  onClick={() => window.location.reload()}
                >
                  <span>Reload App</span>
                </button>
              </div>

              <div className="mt-1 flex items-center justify-center gap-2">
                <button
                  className="btn btn-ghost btn-sm text-faint hover:text-danger flex items-center gap-1"
                  onClick={() => (isTauri ? void ipc.quit() : window.close())}
                >
                  <Power size={12} />
                  <span>Close DayFlit</span>
                </button>
              </div>
            </div>

            {/* Diagnostic Drawer */}
            <div className="mt-4 border-t hairline pt-3 text-left">
              <button
                className="flex w-full items-center justify-between text-[0.75em] text-faint hover:text-muted py-1"
                onClick={() => this.setState((s) => ({ showDiagnostics: !s.showDiagnostics }))}
              >
                <span>Diagnostic information</span>
                {this.state.showDiagnostics ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {this.state.showDiagnostics && (
                <div className="mt-2 space-y-2">
                  <div className="selectable max-h-36 overflow-auto rounded-lg bg-surface-2/90 p-2.5 font-mono text-[0.72em] leading-normal text-muted border hairline">
                    <div className="font-semibold text-danger mb-1">
                      {this.state.error.name}: {this.state.error.message}
                    </div>
                    {this.state.error.stack && (
                      <div className="text-faint whitespace-pre-wrap">{this.state.error.stack.slice(0, 500)}</div>
                    )}
                  </div>
                  <button
                    className="btn btn-ghost btn-sm w-full text-[0.74em] flex items-center justify-center gap-1 text-muted"
                    onClick={this.handleCopyDiagnostics}
                  >
                    {this.state.copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                    <span>{this.state.copied ? "Copied diagnostic details" : "Copy diagnostic details"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

/** Contained view-level error boundary so a crash in an individual screen doesn't kill the whole app */
export class ViewErrorBoundary extends Component<
  { children: ReactNode; viewName: string; onReset?: () => void },
  { error: Error | null; copied: boolean }
> {
  state = { error: null as Error | null, copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void ipc.log(`[ViewErrorBoundary:${this.props.viewName}] ${error.message}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="glass max-w-sm w-full p-5 text-center rounded-xl border hairline">
          <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-danger/15 text-danger">
            <AlertTriangle size={20} />
          </div>
          <div className="text-[1.02em] font-semibold text-text">
            Unable to display {this.props.viewName}
          </div>
          <p className="mt-1 text-[0.78em] text-muted leading-relaxed">
            An issue occurred while rendering this view. Your data is unharmed.
          </p>

          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                this.props.onReset?.();
                this.setState({ error: null });
              }}
            >
              Try again
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                useUi.getState().navigate("today");
                this.setState({ error: null });
              }}
            >
              Go to Today
            </button>
          </div>
        </div>
      </div>
    );
  }
}
