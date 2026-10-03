import { useEffect, useMemo, useState } from "react";
import { Archive, CheckSquare, ImageIcon, Pin, Plus, Search, StickyNote } from "lucide-react";
import { useNotes, noteTitle } from "@/stores/notes";
import { useUi } from "@/stores/ui";
import { NoteEditor } from "@/components/NoteEditor";
import { Empty } from "@/components/Empty";
import { plainText, checklistProgress } from "@/lib/markdown";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { useElementWidth } from "@/lib/useElementWidth";

export function NotesView() {
  const notes = useNotes((s) => s.notes);
  const add = useNotes((s) => s.add);
  const viewParam = useUi((s) => s.viewParam);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const twoPane = width >= 620;

  useEffect(() => {
    if (viewParam && notes.some((n) => n.id === viewParam)) {
      setOpenId(viewParam);
      useUi.getState().navigate("notes", null);
    }
  }, [viewParam, notes]);

  const tags = useMemo(() => [...new Set(notes.filter((n) => !n.archived).flatMap((n) => n.tags))].sort(), [notes]);
  const shown = useMemo(() => {
    let list = notes.filter((n) => n.archived === showArchived);
    if (tag) list = list.filter((n) => n.tags.includes(tag));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(s) || n.body.toLowerCase().includes(s) || n.tags.some((t) => t.includes(s)));
    }
    return list.sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1));
  }, [notes, q, tag, showArchived]);

  const createNote = () => {
    const n = add({ tags: tag ? [tag] : [] });
    setOpenId(n.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "n" && !e.ctrlKey && !openId) {
        e.preventDefault();
        createNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, tag]);

  const list = (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-1">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 py-1.5">
          <Search size={13} className="text-faint" />
          <input className="flex-1 bg-transparent text-[0.88em] outline-none placeholder:text-faint" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={createNote} aria-label="New note">
          <Plus size={14} /> New
        </button>
      </div>
      {(tags.length > 0 || notes.some((n) => n.archived)) && (
        <div className="scroll flex items-center gap-1 px-3 pt-2" style={{ scrollbarWidth: "none" }}>
          <button className={cn("chip cursor-pointer", !tag && !showArchived && "chip-accent")} onClick={() => { setTag(null); setShowArchived(false); }}>
            all
          </button>
          {tags.map((t) => (
            <button key={t} className={cn("chip cursor-pointer", tag === t && "chip-accent")} onClick={() => { setTag(tag === t ? null : t); setShowArchived(false); }}>
              #{t}
            </button>
          ))}
          {notes.some((n) => n.archived) && (
            <button className={cn("chip cursor-pointer", showArchived && "chip-accent")} onClick={() => setShowArchived((v) => !v)}>
              <Archive size={10} /> archived
            </button>
          )}
        </div>
      )}
      <div className="scroll flex-1 px-2 pb-3 pt-2">
        {shown.length === 0 ? (
          <Empty icon={<StickyNote size={28} />} title={q ? "No matching notes" : "No notes yet"} body="Markdown, checklists, #tags, links with previews and pasted images." action={<button className="btn btn-sm" onClick={createNote}>Write a note</button>} />
        ) : (
          <div className="flex flex-col gap-1">
            {shown.map((n) => {
              const progress = checklistProgress(n.body);
              const preview = plainText(n.body).slice(0, 140);
              return (
                <button key={n.id} className={cn("card card-hover flex flex-col gap-0.5 px-3 py-2 text-left", openId === n.id && "!border-accent/50 !bg-accent/10")} onClick={() => setOpenId(n.id)} style={n.color ? { borderLeft: `3px solid ${n.color}` } : undefined}>
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[0.93em] font-medium">{noteTitle(n)}</span>
                    {n.pinned && <Pin size={11} className="text-accent" />}
                    <span className="text-[0.72em] text-faint">{timeAgo(n.updatedAt)}</span>
                  </div>
                  {preview && preview !== noteTitle(n) && <div className="line-clamp-2 text-[0.8em] leading-snug text-muted">{preview}</div>}
                  {(progress.total > 0 || n.tags.length > 0 || n.images.length > 0) && (
                    <div className="mt-0.5 flex items-center gap-2 text-[0.72em] text-faint">
                      {progress.total > 0 && (
                        <span className={cn("inline-flex items-center gap-1", progress.done === progress.total && "text-success")}>
                          <CheckSquare size={10} /> {progress.done}/{progress.total}
                        </span>
                      )}
                      {n.images.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon size={10} /> {n.images.length}
                        </span>
                      )}
                      {n.tags.slice(0, 4).map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative flex h-full">
      {twoPane ? (
        <>
          <div className="w-[280px] shrink-0 border-r hairline">{list}</div>
          <div className="min-w-0 flex-1">
            {openId && notes.some((n) => n.id === openId) ? <NoteEditor key={openId} noteId={openId} embedded onClose={() => setOpenId(null)} /> : <Empty icon={<StickyNote size={28} />} title="Select a note" body="or press n to start a new one" />}
          </div>
        </>
      ) : (
        <>
          <div className="w-full">{list}</div>
          {openId && notes.some((n) => n.id === openId) && <NoteEditor key={openId} noteId={openId} onClose={() => setOpenId(null)} />}
        </>
      )}
    </div>
  );
}
