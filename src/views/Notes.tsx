import { useEffect, useMemo, useState } from "react";
import { Archive, CheckSquare, ImageIcon, LayoutGrid, Pin, Plus, Search, StickyNote } from "lucide-react";
import { useNotes, noteTitle } from "@/stores/notes";
import { useCanvas } from "@/stores/canvas";
import { useUi } from "@/stores/ui";
import { NoteEditor } from "@/components/NoteEditor";
import { Empty } from "@/components/Empty";
import { extractCleanTitleAndExcerpt, extractAllImages, checklistProgress } from "@/lib/markdown";
import { imageUrl, prewarmImageUrls } from "@/lib/imageUrl";
import { SlidingPillContainer } from "@/components/ui/MotionPrimitives";
import { HorizontalPillStrip, type PillStripItem } from "@/components/ui/HorizontalPillStrip";
import { formatSmartDate } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { useElementWidth } from "@/lib/useElementWidth";

export function NotesView() {
  const notes = useNotes((s) => s.notes);
  const boards = useCanvas((s) => s.boards);
  const add = useNotes((s) => s.add);
  const update = useNotes((s) => s.update);
  const viewParam = useUi((s) => s.viewParam);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const twoPane = width >= 620;

  // Pre-warm all image attachments so note selection never flickers
  useEffect(() => {
    const allImages: string[] = [];
    for (const n of notes) {
      if (n.images?.length) allImages.push(...n.images);
    }
    if (allImages.length) prewarmImageUrls(allImages);
  }, [notes]);

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

  const notePillItems = useMemo<PillStripItem[]>(() => {
    const list: PillStripItem[] = [
      {
        id: "all",
        label: "all",
        active: !tag && !showArchived,
        onSelect: () => { setTag(null); setShowArchived(false); },
      },
    ];
    for (const t of tags) {
      list.push({
        id: t,
        label: `#${t}`,
        active: tag === t && !showArchived,
        onSelect: () => { setTag(tag === t ? null : t); setShowArchived(false); },
      });
    }
    if (notes.some((n) => n.archived)) {
      list.push({
        id: "archived",
        label: "archived",
        icon: <Archive size={10} />,
        active: showArchived,
        onSelect: () => setShowArchived((v) => !v),
      });
    }
    return list;
  }, [tags, tag, showArchived, notes]);

  const handleAddTag = async () => {
    const entered = await useUi.getState().promptUser({
      title: "New Note Tag",
      body: "Filter notes by entering a new tag:",
      placeholder: "e.g. ideas, project, reference…",
      confirmLabel: "Apply Tag",
    });
    if (entered && entered.trim()) {
      const clean = entered.trim().replace(/^#/, "");
      setTag(clean);
      setShowArchived(false);
    }
  };

  const handleDeleteTag = (tagName: string) => {
    const clean = tagName.replace(/^#/, "");
    for (const n of notes) {
      if (n.tags?.includes(clean)) {
        update(n.id, { tags: n.tags.filter((t) => t !== clean) });
      }
    }
    if (tag === clean) setTag(null);
  };

  const handleRenameTag = (oldTag: string, newTag: string) => {
    const cleanOld = oldTag.replace(/^#/, "");
    const cleanNew = newTag.replace(/^#/, "").trim();
    if (!cleanNew || cleanNew === cleanOld) return;
    for (const n of notes) {
      if (n.tags?.includes(cleanOld)) {
        update(n.id, { tags: n.tags.map((t) => (t === cleanOld ? cleanNew : t)) });
      }
    }
    if (tag === cleanOld) setTag(cleanNew);
  };

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
        <HorizontalPillStrip
          activeKey={showArchived ? "archived" : (tag ?? "all")}
          className="px-3 py-1.5 min-h-[36px] shrink-0"
          items={notePillItems}
          onAdd={handleAddTag}
          onDelete={handleDeleteTag}
          onRename={handleRenameTag}
          canModify={(id) => id !== "all" && id !== "archived"}
          addLabel="Add or filter by tag"
          addAriaLabel="Add Tag Filter"
          quickSwitcherLabel={(n) => `All (${n}) ▾`}
          quickSwitcherThreshold={5}
          pillClassName="bg-accent/20 rounded-full"
        />
      )}
      <div className="scroll flex-1 px-2 pb-3 pt-2">
        {shown.length === 0 ? (
          <Empty icon={<StickyNote size={28} />} title={q ? "No matching notes" : "No notes yet"} body="Markdown, checklists, #tags, links with previews and pasted images." action={<button className="btn btn-sm" onClick={createNote}>Write a note</button>} />
        ) : (
          <div className="flex flex-col gap-1">
            {shown.map((n) => {
              const progress = checklistProgress(n.body);
              const noteImages = extractAllImages(n.body, n.images);
              const { title, excerpt } = extractCleanTitleAndExcerpt(n.body, n.title, {
                hasImages: noteImages.length > 0,
                defaultImageTitle: "Image Note",
                date: n.createdAt,
              });
              const preview = excerpt.slice(0, 140);
              const thumb = noteImages.length > 0 ? noteImages[0] : null;

              return (
                <button
                  key={n.id}
                  className={cn(
                    "interactive-press flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    openId === n.id
                      ? "bg-accent/15 text-text ring-1 ring-accent/20"
                      : "hover:bg-surface-2/65 text-text"
                  )}
                  onClick={() => setOpenId(n.id)}
                  style={n.color ? { borderLeft: `3px solid ${n.color}` } : undefined}
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[0.93em] font-medium">{title}</span>
                      {n.pinned && <Pin size={11} className="text-accent shrink-0" />}
                      <span className="text-[0.72em] text-faint tabular shrink-0">{formatSmartDate(n.updatedAt)}</span>
                    </div>
                    {preview && <div className="line-clamp-2 text-[0.8em] leading-snug text-muted">{preview}</div>}
                    {(progress.total > 0 || n.tags.length > 0 || boards.some((b) => b.noteId === n.id)) && (
                      <div className="mt-0.5 flex items-center gap-2 text-[0.72em] text-faint">
                        {progress.total > 0 && (
                          <span className={cn("inline-flex items-center gap-1", progress.done === progress.total && "text-success")}>
                            <CheckSquare size={10} /> {progress.done}/{progress.total}
                          </span>
                        )}
                        {n.tags.slice(0, 4).map((t) => (
                          <span key={t}>#{t}</span>
                        ))}
                        {boards.some((b) => b.noteId === n.id) && (
                          <span className="inline-flex items-center gap-1 text-accent font-medium">
                            <LayoutGrid size={10} /> Canvas
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {thumb && (
                    <div
                      className="relative shrink-0 self-start mt-0.5 group/thumb"
                      onClick={(e) => {
                        e.stopPropagation();
                        useUi.getState().openLightbox(noteImages, 0, title);
                      }}
                      title="Inspect image"
                    >
                      <img
                        src={imageUrl(thumb)}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover border border-subtle shrink-0 shadow-xs transition hover:scale-105"
                        onError={(ev) => {
                          (ev.currentTarget as HTMLElement).style.display = "none";
                        }}
                      />
                      {noteImages.length > 1 && (
                        <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1 py-0.2 text-[9px] font-semibold text-white backdrop-blur-xs">
                          +{noteImages.length - 1}
                        </span>
                      )}
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
    <div ref={ref} className="relative flex h-full w-full min-w-0 overflow-hidden">
      {twoPane ? (
        <>
          <div className="w-[280px] shrink-0 min-w-0 border-r hairline h-full flex flex-col">{list}</div>
          <div className="min-w-0 flex-1 h-full relative overflow-hidden">
            {openId && notes.some((n) => n.id === openId) ? (
              <NoteEditor noteId={openId} embedded onClose={() => setOpenId(null)} />
            ) : (
              <Empty icon={<StickyNote size={28} />} title="Select a note" body="or press n to start a new one" />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="w-full h-full min-w-0 overflow-hidden">{list}</div>
          {openId && notes.some((n) => n.id === openId) && <NoteEditor noteId={openId} onClose={() => setOpenId(null)} />}
        </>
      )}
    </div>
  );
}
