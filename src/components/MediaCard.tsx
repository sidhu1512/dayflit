import { useEffect, useState } from "react";
import { Music2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useMedia } from "@/stores/media";
import { formatClock } from "@/lib/dates";
import { cn } from "@/lib/ids";

export function MediaCard({ compact }: { compact?: boolean }) {
  const media = useMedia((s) => s.media);
  const control = useMedia((s) => s.control);
  const setVolume = useMedia((s) => s.setVolume);
  const toggleMute = useMedia((s) => s.toggleMute);
  const [pos, setPos] = useState(0);
  const cur = media.current;

  // local progress interpolation between polls
  useEffect(() => {
    if (!cur) return;
    setPos(cur.positionMs);
    if (cur.status !== "playing") return;
    const started = Date.now();
    const base = cur.positionMs;
    const t = window.setInterval(() => setPos(Math.min(cur.durationMs || Infinity, base + (Date.now() - started))), 500);
    return () => window.clearInterval(t);
  }, [cur?.positionMs, cur?.status, cur?.title, cur?.durationMs]);

  if (!media.available || !cur) {
    if (compact) return null;
    return (
      <div className="card flex items-center gap-3 px-3 py-2.5 text-muted">
        <Music2 size={16} className="text-faint" />
        <div className="text-[0.85em]">Nothing playing. Start Spotify or any media app and controls appear here.</div>
      </div>
    );
  }
  const playing = cur.status === "playing";
  const progress = cur.durationMs > 0 ? Math.min(1, pos / cur.durationMs) : 0;

  return (
    <div className={cn("card relative overflow-hidden", compact ? "px-2.5 py-2" : "p-3")}>
      {media.thumbnail && !compact && (
        <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: `url(${media.thumbnail}) center/cover`, filter: "blur(28px) saturate(1.4)" }} />
      )}
      <div className="relative flex items-center gap-3">
        {media.thumbnail ? (
          <img src={media.thumbnail} alt="" className={cn("shrink-0 rounded-lg object-cover shadow-md", compact ? "h-9 w-9" : "h-14 w-14")} />
        ) : (
          <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-surface-3/60 text-faint", compact ? "h-9 w-9" : "h-14 w-14")}>
            <Music2 size={compact ? 16 : 22} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.92em] font-medium leading-tight">{cur.title || "Unknown"}</div>
          <div className="truncate text-[0.8em] text-muted">{cur.artist || cur.appName}</div>
          {!compact && (
            <div className="mt-1.5 flex items-center gap-2 text-[0.7em] tabular text-faint">
              <span>{formatClock(pos / 1000)}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3/70">
                <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
              </div>
              <span>{cur.durationMs ? formatClock(cur.durationMs / 1000) : "--:--"}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void control("prev", cur.appId)} aria-label="Previous">
            <SkipBack size={15} />
          </button>
          <button className="btn btn-icon !rounded-full bg-accent text-accent-fg hover:bg-accent/85" onClick={() => void control("toggle", cur.appId)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void control("next", cur.appId)} aria-label="Next">
            <SkipForward size={15} />
          </button>
        </div>
      </div>
      {!compact && (
        <div className="relative mt-2.5 flex items-center gap-2">
          <span className="chip text-[0.72em]">{cur.appName}</span>
          <div className="flex-1" />
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onClick={() => void toggleMute()} aria-label={media.muted ? "Unmute" : "Mute"}>
            {media.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input type="range" min={0} max={100} value={Math.round((media.muted ? 0 : media.volume) * 100)} onChange={(e) => void setVolume(parseInt(e.target.value, 10) / 100)} className="range w-24" aria-label="System volume" />
        </div>
      )}
    </div>
  );
}
