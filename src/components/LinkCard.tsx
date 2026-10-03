import { useEffect, useState } from "react";
import { ExternalLink, Globe, ImageIcon, FileText, PlayCircle } from "lucide-react";
import { ipc, isTauri } from "@/lib/ipc";
import type { LinkPreview } from "@/lib/types";
import { openExternal } from "@/lib/open";

const cache = new Map<string, LinkPreview>();
const inflight = new Map<string, Promise<LinkPreview>>();

export function usePreview(url: string): LinkPreview | null {
  const [p, setP] = useState<LinkPreview | null>(cache.get(url) ?? null);
  useEffect(() => {
    if (!isTauri || cache.has(url)) return;
    let alive = true;
    let pr = inflight.get(url);
    if (!pr) {
      pr = ipc.linkPreview(url).then((r) => {
        cache.set(url, r);
        inflight.delete(url);
        return r;
      });
      inflight.set(url, pr);
    }
    pr.then((r) => alive && setP(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return p;
}

export function LinkCard({ url, compact }: { url: string; compact?: boolean }) {
  const p = usePreview(url);
  const host = (() => {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();
  const icon = p?.kind === "image" ? <ImageIcon size={14} /> : p?.kind === "video" ? <PlayCircle size={14} /> : p?.kind === "pdf" ? <FileText size={14} /> : <Globe size={14} />;
  if (compact) {
    return (
      <button className="card card-hover flex w-full items-center gap-2 px-2.5 py-1.5 text-left" onClick={() => openExternal(url)}>
        {p?.favicon ? <img src={p.favicon} alt="" className="h-4 w-4 rounded-sm" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : <span className="text-faint">{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-[0.85em]">{p?.title || host}</span>
        <span className="shrink-0 text-[0.75em] text-faint">{host}</span>
        <ExternalLink size={12} className="shrink-0 text-faint" />
      </button>
    );
  }
  return (
    <button className="card card-hover flex w-full gap-3 overflow-hidden p-0 text-left" onClick={() => openExternal(url)}>
      {p?.image ? (
        <img src={p.image} alt="" className="h-[84px] w-[110px] shrink-0 object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
      ) : (
        <div className="flex h-[84px] w-[64px] shrink-0 items-center justify-center bg-surface-3/50 text-faint">{icon}</div>
      )}
      <div className="min-w-0 flex-1 py-2 pr-3">
        <div className="truncate text-[0.9em] font-medium">{p?.title || host}</div>
        {p?.description && <div className="mt-0.5 line-clamp-2 text-[0.8em] leading-snug text-muted">{p.description}</div>}
        <div className="mt-1 flex items-center gap-1.5 text-[0.75em] text-faint">
          {p?.favicon && <img src={p.favicon} alt="" className="h-3 w-3 rounded-sm" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
          <span className="truncate">{p?.siteName || host}</span>
        </div>
      </div>
    </button>
  );
}
