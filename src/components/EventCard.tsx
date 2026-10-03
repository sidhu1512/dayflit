import { MapPin, Users, Video } from "lucide-react";
import type { CalEvent } from "@/lib/types";
import { formatTime } from "@/lib/dates";
import { openExternal } from "@/lib/open";
import { cn } from "@/lib/ids";

export function EventCard({ ev, now = Date.now(), dense, onClick }: { ev: CalEvent; now?: number; dense?: boolean; onClick?: () => void }) {
  const live = ev.start <= now && ev.end > now;
  const past = ev.end <= now;
  const soon = !live && ev.start > now && ev.start - now < 15 * 60_000;
  const mins = Math.round((ev.start - now) / 60_000);
  return (
    <div
      className={cn("card relative flex gap-2.5 overflow-hidden", dense ? "px-2.5 py-1.5" : "px-3 py-2", past && "opacity-55", onClick && "card-hover cursor-pointer")}
      onClick={onClick}
    >
      <div className="w-1 shrink-0 self-stretch rounded-full" style={{ background: ev.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={cn("min-w-0 flex-1 truncate text-[0.92em] font-medium", past && "line-through")}>{ev.title || "(untitled)"}</div>
          {live && <span className="chip chip-success">now</span>}
          {soon && <span className="chip chip-accent">in {mins}m</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.78em] text-muted">
          <span className="tabular">{ev.allDay ? "All day" : `${formatTime(new Date(ev.start))} – ${formatTime(new Date(ev.end))}`}</span>
          {ev.location && !ev.meeting?.url.includes(ev.location) && (
            <span className="inline-flex max-w-[180px] items-center gap-1 truncate">
              <MapPin size={11} /> {ev.location}
            </span>
          )}
          {ev.attendees.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users size={11} /> {ev.attendees.length}
            </span>
          )}
        </div>
      </div>
      {ev.meeting && !past && (
        <button
          className={cn("btn btn-sm shrink-0 self-center", (live || soon) && "btn-primary")}
          onClick={(e) => {
            e.stopPropagation();
            void openExternal(ev.meeting!.url);
          }}
          aria-label={`Join ${ev.meeting.provider}`}
        >
          <Video size={13} /> Join
        </button>
      )}
    </div>
  );
}
