import { useMemo } from "react";
import { FileText, Plus, Users } from "lucide-react";
import type { CalEvent } from "@/lib/types";
import { useNotes, noteTitle } from "@/stores/notes";
import { useTasks } from "@/stores/tasks";
import { useUi } from "@/stores/ui";
import { formatTime } from "@/lib/dates";

/** Context for an imminent meeting: attendees, related notes/tasks and a one-click meeting note. */
export function MeetingPrep({ ev }: { ev: CalEvent }) {
  const notes = useNotes((s) => s.notes);
  const tasks = useTasks((s) => s.tasks);
  const navigate = useUi((s) => s.navigate);
  const words = useMemo(() => ev.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3), [ev.title]);
  const related = useMemo(() => {
    if (!words.length) return { notes: [], tasks: [] };
    const hit = (t: string) => words.some((w) => t.toLowerCase().includes(w));
    return {
      notes: notes.filter((n) => !n.archived && (hit(n.title) || hit(n.body.slice(0, 2000)))).slice(0, 3),
      tasks: tasks.filter((t) => t.status === "open" && hit(t.title)).slice(0, 3),
    };
  }, [notes, tasks, words]);
  const createNote = () => {
    const attendees = ev.attendees.length ? "Attendees: " + ev.attendees.join(", ") + "\n\n" : "";
    const n = useNotes.getState().add({ title: `${ev.title} - ${formatTime(new Date(ev.start))}`, body: `## ${ev.title}\n\n${attendees}### Notes\n\n- \n\n### Actions\n\n- [ ] \n`, tags: ["meeting"] });
    navigate("notes", n.id);
  };
  return (
    <div className="card mt-2 px-3 py-2 text-[0.82em]">
      <div className="flex items-center gap-2">
        <span className="section-title">Prep</span>
        {ev.attendees.length > 0 && (
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-muted">
            <Users size={11} /> {ev.attendees.slice(0, 4).join(", ")}
            {ev.attendees.length > 4 ? ` +${ev.attendees.length - 4}` : ""}
          </span>
        )}
        <div className="flex-1" />
        <button className="btn btn-ghost btn-sm" onClick={createNote}>
          <Plus size={12} /> Meeting note
        </button>
      </div>
      {(related.notes.length > 0 || related.tasks.length > 0) && (
        <div className="mt-1 flex flex-col gap-0.5">
          {related.notes.map((n) => (
            <button key={n.id} className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-surface-2/60" onClick={() => navigate("notes", n.id)}>
              <FileText size={11} className="text-faint" /> <span className="truncate">{noteTitle(n)}</span>
            </button>
          ))}
          {related.tasks.map((t) => (
            <button key={t.id} className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-surface-2/60" onClick={() => { navigate("tasks"); useUi.getState().setEditingTask(t.id); }}>
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>
      )}
      {ev.description && <div className="mt-1 line-clamp-2 text-faint">{ev.description.replace(/https?:\S+/g, "").trim()}</div>}
    </div>
  );
}
