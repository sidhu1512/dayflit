import { useState, useRef } from "react";
import { ExternalLink, Lock, Unlock, RotateCw, Globe, PlayCircle, Eye, Monitor, ChevronLeft, ChevronRight } from "lucide-react";
import { type CanvasNode, transformEmbedUrl, detectEmbedType } from "@/lib/canvas";
import { openExternal } from "@/lib/open";
import { usePreview } from "./LinkCard";

export function LiveEmbedNode({
  node,
  onUpdate,
}: {
  node: CanvasNode;
  onUpdate: (patch: Partial<CanvasNode>) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [interact, setInteract] = useState(node.data.interact ?? false);
  const [iframeKey, setIframeKey] = useState(0);
  const rawUrl = node.url || node.data.embedUrl || "";
  const embedUrl = transformEmbedUrl(rawUrl);
  const embedType = node.data.embedType || detectEmbedType(rawUrl);
  const viewMode = node.data.viewMode || "live";
  const preview = usePreview(rawUrl);

  const toggleInteract = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !interact;
    setInteract(next);
    onUpdate({ data: { ...node.data, interact: next } });
  };

  const toggleViewMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMode = viewMode === "live" ? "preview" : "live";
    onUpdate({ data: { ...node.data, viewMode: nextMode } });
  };

  const reloadIframe = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIframeKey((k) => k + 1);
  };

  const goBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {
      // Cross-origin restriction fallback
    }
  };

  const goForward = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {
      // Cross-origin restriction fallback
    }
  };

  const openInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (rawUrl) openExternal(rawUrl);
  };

  const domain = (() => {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./, "");
    } catch {
      return rawUrl || "Live Embed";
    }
  })();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border hairline bg-surface/90 shadow-lg backdrop-blur-md transition-shadow hover:shadow-2xl">
      {/* Header Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b hairline bg-surface-2/60 px-2.5 text-[11px] text-muted select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          {preview?.favicon ? (
            <img src={preview.favicon} alt="" className="h-3.5 w-3.5 rounded-sm shrink-0" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          ) : embedType === "youtube" ? (
            <PlayCircle size={13} className="text-red-500 shrink-0" />
          ) : (
            <Globe size={13} className="text-accent shrink-0" />
          )}
          <span className="truncate font-medium text-fg/90">{preview?.title || domain}</span>
          <span className="rounded bg-accent/15 px-1 py-0.2 text-[9px] uppercase tracking-wider text-accent font-semibold">
            {embedType}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Back & Forward Controls */}
          {viewMode === "live" && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-fg"
                onClick={goBack}
                title="Go Back"
                aria-label="Back"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-fg"
                onClick={goForward}
                title="Go Forward"
                aria-label="Forward"
              >
                <ChevronRight size={12} />
              </button>
            </>
          )}

          {/* View Mode Toggle (Live vs Rich Preview) */}
          <button
            type="button"
            className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-fg"
            onClick={toggleViewMode}
            title={viewMode === "live" ? "Switch to Rich Card Preview" : "Switch to Live Interactive View"}
            aria-label="Toggle live or card preview"
          >
            {viewMode === "live" ? <Eye size={12} /> : <Monitor size={12} />}
          </button>

          {/* Reload control */}
          {viewMode === "live" && (
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-fg"
              onClick={reloadIframe}
              title="Reload Embed"
              aria-label="Reload embed"
            >
              <RotateCw size={11} />
            </button>
          )}

          {/* Interact / Lock Scroll Toggle */}
          {viewMode === "live" && (
            <button
              type="button"
              className={`btn btn-sm !h-6 px-1.5 text-[10px] font-medium gap-1 transition-colors ${
                interact ? "btn-primary !bg-accent text-accent-fg" : "btn-ghost text-muted hover:text-fg"
              }`}
              onClick={toggleInteract}
              title={interact ? "Lock canvas interactions" : "Enable scrolling & clicking inside embed"}
              aria-label="Toggle interact mode"
            >
              {interact ? <Unlock size={11} /> : <Lock size={11} />}
              <span>{interact ? "Interact" : "Locked"}</span>
            </button>
          )}

          {/* External Link */}
          <button
            type="button"
            className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-fg"
            onClick={openInBrowser}
            title="Open in default browser"
            aria-label="Open externally"
          >
            <ExternalLink size={11} />
          </button>
        </div>
      </div>

      {/* Embed Content Body */}
      <div className="relative flex-1 w-full h-full min-h-0 bg-black/5 overflow-hidden">
        {viewMode === "live" && embedUrl ? (
          <>
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={embedUrl}
              title={node.label || "Live Embed"}
              className="h-full w-full border-0 bg-transparent"
              style={{
                pointerEvents: interact ? "auto" : "none",
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            />
            {/* Click-to-interact overlay reminder when locked */}
            {!interact && (
              <div
                className="absolute inset-0 z-10 flex items-end justify-center p-3 opacity-0 hover:opacity-100 transition-opacity bg-black/10 cursor-pointer"
                onClick={toggleInteract}
              >
                <div className="rounded-full bg-surface-1/90 px-3 py-1 text-[11px] font-medium text-fg shadow-md backdrop-blur-sm border hairline flex items-center gap-1.5">
                  <Lock size={12} className="text-accent" />
                  Click to Interact with Embed
                </div>
              </div>
            )}
          </>
        ) : (
          /* Anti-X-Frame Fallback / Rich Card Preview */
          <div
            className="flex h-full w-full flex-col justify-between p-4 cursor-pointer hover:bg-surface-2/40 transition-colors"
            onClick={openInBrowser}
          >
            <div className="flex flex-col gap-2">
              {preview?.image && (
                <div className="h-32 w-full overflow-hidden rounded-lg bg-surface-3">
                  <img src={preview.image} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <h4 className="text-[14px] font-semibold text-fg line-clamp-2">
                {preview?.title || domain}
              </h4>
              <p className="text-[12px] text-muted line-clamp-3 leading-relaxed">
                {preview?.description || "Click to open this link in your external browser."}
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t hairline text-[11px] text-faint">
              <span>{domain}</span>
              <span className="flex items-center gap-1 text-accent">
                Open <ExternalLink size={10} />
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
