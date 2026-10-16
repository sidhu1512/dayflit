import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Bold, CheckSquare, ChevronLeft, Code, Eye, FileText, Heading, ImageOff, ImagePlus, LayoutGrid, Link2, List, Pencil, Pin, Trash2, X } from "lucide-react";
import { useNotes, noteTitle } from "@/stores/notes";
import { useCanvas } from "@/stores/canvas";
import { useUi } from "@/stores/ui";
import { renderMarkdown, toggleChecklistLine, checklistProgress } from "@/lib/markdown";
import { imageUrl, imagesFromDataTransfer, storeImageBlob } from "@/lib/imageUrl";
import { extractLinks } from "@/lib/nlp";
import { openExternal } from "@/lib/open";
import { LinkCard } from "./LinkCard";
import { CanvasBoard } from "./CanvasBoard";
import { syncNoteToCanvasBoard, docBlocksToMarkdown } from "@/lib/canvas";
import { cn, debounce } from "@/lib/ids";
import { timeAgo } from "@/lib/dates";

import { DocumentCrossfade } from "@/components/ui/MotionPrimitives";

const NOTE_COLORS = [null, "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];

export function NoteEditor({ noteId, onClose, embedded }: { noteId: string; onClose?: () => void; embedded?: boolean }) {
  const note = useNotes((s) => s.notes.find((n) => n.id === noteId));
  const setBody = useNotes((s) => s.setBody);
  const update = useNotes((s) => s.update);
  const remove = useNotes((s) => s.remove);
  const removeAttachment = useNotes((s) => s.removeAttachment);
  const toast = useUi((s) => s.toast);
  const ask = useUi((s) => s.ask);

  // Canvas store bindings for Edgeless mode
  const noteBoard = useCanvas((s) => s.boards.find((b) => b.noteId === noteId));
  const updateBoard = useCanvas((s) => s.updateBoard);
  const addNode = useCanvas((s) => s.addNode);
  const updateNode = useCanvas((s) => s.updateNode);
  const removeNode = useCanvas((s) => s.removeNode);
  const addEdge = useCanvas((s) => s.addEdge);
  const updateEdge = useCanvas((s) => s.updateEdge);
  const removeEdge = useCanvas((s) => s.removeEdge);
  const addStroke = useCanvas((s) => s.addStroke);
  const clearStrokes = useCanvas((s) => s.clearStrokes);
  const updateViewport = useCanvas((s) => s.updateViewport);

  const initialMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("noteMode") === "edgeless" ? "edgeless" : "doc";
  const [mode, setMode] = useState<"doc" | "edgeless">(initialMode);
  const [body, setBodyLocal] = useState(note?.body ?? "");
  const [title, setTitle] = useState(note?.title ?? "");
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(true);

  // Auto-sync canvas board when in edgeless mode
  useEffect(() => {
    if (mode === "edgeless" && noteId) {
      const existing = useCanvas.getState().getBoardByNoteId(noteId);
      const synced = syncNoteToCanvasBoard(noteId, title || note?.title || "Untitled Note", body, existing);
      if (!existing) {
        useCanvas.getState().createBoard(note?.title || "Edgeless Note", noteId);
      }
      useCanvas.getState().updateBoard(synced.id, synced);
    }
  }, [mode, noteId]);
  const ta = useRef<HTMLTextAreaElement>(null);
  const prevIdRef = useRef(noteId);
  const currentBodyRef = useRef(body);
  const currentSavedRef = useRef(saved);
  currentBodyRef.current = body;
  currentSavedRef.current = saved;

  useEffect(() => {
    if (prevIdRef.current !== noteId) {
      if (!currentSavedRef.current && prevIdRef.current) {
        setBody(prevIdRef.current, currentBodyRef.current);
      }
      prevIdRef.current = noteId;
      setBodyLocal(note?.body ?? "");
      setTitle(note?.title ?? "");
      setSaved(true);
      setPreview(false);
    }
  }, [noteId, note?.body, note?.title, setBody]);

  const persist = useMemo(() => debounce((id: string, b: string) => { setBody(id, b); setSaved(true); }, 350), [setBody]);
  const onChange = (v: string) => {
    setBodyLocal(v);
    setSaved(false);
    persist(noteId, v);
  };
  useEffect(() => () => {
    if (!currentSavedRef.current && prevIdRef.current) {
      setBody(prevIdRef.current, currentBodyRef.current);
    }
  }, [setBody]);

  const insert = useCallback((before: string, after = "", placeholder = "") => {
    const el = ta.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + before + sel + after + body.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = s + before.length;
      el.selectionEnd = s + before.length + sel.length;
    });
  }, [body]);

  const linePrefix = useCallback((prefix: string) => {
    const el = ta.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = body.lastIndexOf("\n", s - 1) + 1;
    const next = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + prefix.length;
    });
  }, [body]);

  const addImages = async (files: File[]) => {
    for (const f of files) {
      try {
        const name = await storeImageBlob(f);
        insert(`\n![${f.name || "image"}](dayflit-image://${name})\n`);
        useNotes.getState().addImage(noteId, name);
      } catch (e) {
        toast({ title: "Could not save image", body: String(e), kind: "error" });
      }
    }
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const imgs = imagesFromDataTransfer(e.clipboardData);
    if (imgs.length) {
      e.preventDefault();
      await addImages(imgs);
    }
  };
  const onDrop = async (e: React.DragEvent) => {
    const imgs = imagesFromDataTransfer(e.dataTransfer);
    if (imgs.length) {
      e.preventDefault();
      await addImages(imgs);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === "b") { e.preventDefault(); insert("**", "**", "bold"); }
    else if (e.ctrlKey && e.key === "i") { e.preventDefault(); insert("_", "_", "italic"); }
    else if (e.ctrlKey && e.key === "k") { e.preventDefault(); insert("[", "](https://)", "link"); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") { e.preventDefault(); linePrefix("- [ ] "); }
    else if (e.key === "Enter" && !e.shiftKey) {
      // continue lists / checklists
      const el = e.currentTarget;
      const s = el.selectionStart;
      const lineStart = body.lastIndexOf("\n", s - 1) + 1;
      const line = body.slice(lineStart, s);
      const m = line.match(/^(\s*)([-*+]\s+\[( |x|X)\]\s+|[-*+]\s+|\d+\.\s+)(.*)$/);
      if (m) {
        e.preventDefault();
        if (!m[4].trim()) {
          // empty item → end list
          onChange(body.slice(0, lineStart) + body.slice(s));
          requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = lineStart; });
          return;
        }
        let marker = m[2];
        if (/\[( |x|X)\]/.test(marker)) marker = marker.replace(/\[( |x|X)\]/, "[ ]");
        const num = marker.match(/^(\d+)\.\s+$/);
        if (num) marker = `${parseInt(num[1], 10) + 1}. `;
        const ins = "\n" + m[1] + marker;
        onChange(body.slice(0, s) + ins + body.slice(s));
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + ins.length; });
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      insert("  ");
    }
  };

  const handleSwitchMode = (nextMode: "doc" | "edgeless") => {
    if (nextMode === "edgeless") {
      const existing = useCanvas.getState().getBoardByNoteId(noteId);
      const synced = syncNoteToCanvasBoard(noteId, title || note?.title || "Untitled Note", body, existing);
      if (!existing) {
        useCanvas.getState().createBoard(note?.title || "Edgeless Note", noteId);
      }
      useCanvas.getState().updateBoard(synced.id, synced);
      setMode("edgeless");
    } else {
      const existing = useCanvas.getState().getBoardByNoteId(noteId);
      if (existing) {
        const nextDoc = docBlocksToMarkdown(existing.nodes);
        if (nextDoc !== body) {
          setBodyLocal(nextDoc);
          setBody(noteId, nextDoc);
          setSaved(true);
        }
      }
      setMode("doc");
    }
  };

  const onDocBlockChanged = useCallback(() => {
    const existing = useCanvas.getState().getBoardByNoteId(noteId);
    if (existing) {
      const nextDoc = docBlocksToMarkdown(existing.nodes);
      setBodyLocal(nextDoc);
      setBody(noteId, nextDoc);
      setSaved(true);
    }
  }, [noteId, setBody]);

  const handleDelete = () => {
    if (!note) return;
    remove(note.id);
    onClose?.();
    toast({
      title: "Note deleted",
      kind: "info",
      action: {
        label: "Undo",
        onClick: () => {
          useNotes.getState().restoreLast();
        },
      },
    });
  };

  if (!note) return null;
  const html = renderMarkdown(body, imageUrl);
  const links = extractLinks(body);
  const progress = checklistProgress(body);

  return (
    <div className={cn("flex h-full flex-col min-w-0 overflow-hidden", !embedded && "absolute inset-0 z-50 bg-bg/95 backdrop-blur-sm anim-fade")} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <DocumentCrossfade docKey={noteId} className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 pt-2.5 flex-nowrap min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar">
          {!embedded && onClose && (
            <button
              className="btn btn-ghost btn-sm gap-1 !px-2 text-muted hover:text-text shrink-0"
              onClick={onClose}
              aria-label="Back to notes list"
              title="Back to notes list"
            >
              <ChevronLeft size={16} />
              <span className="text-[12px] font-medium hidden sm:inline">Notes</span>
            </button>
          )}
          <input className="input !bg-transparent !border-transparent !px-1 text-[1.05em] font-semibold min-w-0 flex-1 truncate" placeholder={noteTitle(note) === "Untitled" ? "Untitled note" : noteTitle(note)} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== note.title && update(note.id, { title })} />

          {/* AFFiNE Gliding Segmented Toggle: Doc Mode | Edgeless Canvas */}
          <div className="flex items-center rounded-lg bg-surface-2/70 p-0.5 border hairline shrink-0">
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
                mode === "doc" ? "bg-surface text-fg shadow-sm font-semibold" : "text-muted hover:text-fg"
              )}
              onClick={() => handleSwitchMode("doc")}
              title="Doc Mode (Linear Markdown Document)"
            >
              <FileText size={12} />
              <span className="hidden sm:inline">Doc Mode</span>
            </button>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
                mode === "edgeless" ? "bg-accent text-accent-fg shadow-sm font-semibold" : "text-muted hover:text-fg"
              )}
              onClick={() => handleSwitchMode("edgeless")}
              title="Edgeless Canvas (Spatial Blocks)"
            >
              <LayoutGrid size={12} />
              <span className="hidden sm:inline">Canvas</span>
            </button>
          </div>

          <button className={cn("btn btn-ghost btn-icon btn-sm shrink-0", note.pinned ? "text-accent" : "text-muted")} onClick={() => update(note.id, { pinned: !note.pinned })} aria-label="Pin" title={note.pinned ? "Unpin note" : "Pin note"}>
            <Pin size={14} />
          </button>
          {mode === "doc" && (
            <button className={cn("btn btn-ghost btn-icon btn-sm shrink-0 text-muted", preview && "text-accent")} onClick={() => setPreview((p) => !p)} aria-label={preview ? "Edit" : "Preview"} title={preview ? "Edit note" : "Preview markdown"}>
              {preview ? <Pencil size={14} /> : <Eye size={14} />}
            </button>
          )}
          <button
            className="btn btn-ghost btn-icon btn-sm shrink-0 text-faint hover:text-danger hover:bg-danger/10 transition-colors"
            onClick={handleDelete}
            aria-label="Delete note"
            title="Delete note"
          >
            <Trash2 size={14} />
          </button>
          {onClose && (
            <button className="btn btn-ghost btn-icon btn-sm shrink-0 text-muted hover:text-text" onClick={onClose} aria-label="Close" title="Close editor">
              <X size={15} />
            </button>
          )}
        </div>

        {mode === "edgeless" ? (
          <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden">
            {noteBoard ? (
              <CanvasBoard
                board={noteBoard}
                onUpdateBoard={(patch) => updateBoard(noteBoard.id, patch)}
                onAddNode={(n) => addNode(noteBoard.id, n)}
                onUpdateNode={(nodeId, patch) => updateNode(noteBoard.id, nodeId, patch)}
                onRemoveNode={(nodeId) => removeNode(noteBoard.id, nodeId)}
                onAddEdge={(edge) => addEdge(noteBoard.id, edge)}
                onUpdateEdge={(edgeId, patch) => updateEdge(noteBoard.id, edgeId, patch)}
                onRemoveEdge={(edgeId) => removeEdge(noteBoard.id, edgeId)}
                onAddStroke={(s) => addStroke(noteBoard.id, s)}
                onClearStrokes={() => clearStrokes(noteBoard.id)}
                onUpdateViewport={(vp) => updateViewport(noteBoard.id, vp)}
                onDocBlockChanged={onDocBlockChanged}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted">
                Initialising Edgeless Canvas...
              </div>
            )}
          </div>
        ) : (
          <>
            {!preview && (
              <div className="flex items-center gap-0.5 px-3 pt-1">
                <Tool icon={<Bold size={13} />} tip="Bold (Ctrl+B)" onClick={() => insert("**", "**", "bold")} />
                <Tool icon={<Heading size={13} />} tip="Heading" onClick={() => linePrefix("## ")} />
                <Tool icon={<List size={13} />} tip="List" onClick={() => linePrefix("- ")} />
                <Tool icon={<CheckSquare size={13} />} tip="Checklist (Ctrl+Shift+C)" onClick={() => linePrefix("- [ ] ")} />
                <Tool icon={<Code size={13} />} tip="Code" onClick={() => insert("`", "`", "code")} />
                <Tool icon={<Link2 size={13} />} tip="Link (Ctrl+K)" onClick={() => insert("[", "](https://)", "link")} />
                <label className="btn btn-ghost btn-icon btn-sm cursor-pointer text-muted" aria-label="Insert image">
                  <ImagePlus size={13} />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && void addImages(Array.from(e.target.files))} />
                </label>
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  {NOTE_COLORS.map((c) => (
                    <button key={c ?? "none"} className={cn("h-4 w-4 rounded-full border border-white/10", note.color === c && "ring-2 ring-accent ring-offset-1 ring-offset-bg")} style={{ background: c ?? "transparent" }} onClick={() => update(note.id, { color: c })} aria-label={c ? "Colour" : "No colour"} />
                  ))}
                </div>
              </div>
            )}
            {note.images.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b hairline bg-surface-2/20">
                <span className="text-[0.7em] font-medium text-faint uppercase tracking-wider">Attachments:</span>
                {note.images.map((im) => (
                  <div key={im} className="flex items-center gap-1.5 rounded-md bg-surface-2/70 px-2 py-0.5 text-[0.75em] text-muted border hairline">
                    <img
                      src={imageUrl(im)}
                      alt=""
                      className="h-4 w-4 rounded object-cover cursor-pointer hover:scale-110 transition shrink-0"
                      onClick={() => useUi.getState().openLightbox(note.images, note.images.indexOf(im), title || note.title)}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                        if (e.currentTarget.nextElementSibling) {
                          (e.currentTarget.nextElementSibling as HTMLElement).style.display = "inline-flex";
                        }
                      }}
                    />
                    <span style={{ display: "none" }} className="text-muted shrink-0" title="Image unavailable">
                      <ImageOff size={11} />
                    </span>
                    <span className="max-w-[100px] truncate cursor-pointer hover:underline" onClick={() => useUi.getState().openLightbox(note.images, note.images.indexOf(im), title || note.title)}>{im}</span>
                    <button
                      className="btn btn-ghost btn-icon btn-sm !p-0.5 text-faint hover:text-danger"
                      onClick={() => {
                        const safe = im.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                        const re = new RegExp(`!\\[[^\\]]*\\]\\(dayflit-image://${safe}\\)\\s*`, "g");
                        const next = body.replace(re, "").trim();
                        setBodyLocal(next);
                        setSaved(true);
                        removeAttachment(note.id, im);
                      }}
                      title="Remove attachment"
                      aria-label="Remove attachment"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="scroll flex-1 px-3 pb-3 pt-2">
              {preview ? (
                <div
                  className="prose text-[0.95em]"
                  dangerouslySetInnerHTML={{ __html: html || "<p class='text-faint'>Nothing here yet.</p>" }}
                  onErrorCapture={(e) => {
                    const target = e.target;
                    if (target instanceof HTMLImageElement) {
                      target.classList.add("img-fallback");
                      target.style.display = "none";
                      const next = target.nextElementSibling;
                      if (next && next.classList.contains("img-unavailable-pill")) {
                        (next as HTMLElement).style.display = "inline-flex";
                      }
                    }
                  }}
                  onClick={(e) => {
                    const t = e.target as HTMLElement;
                    if (t instanceof HTMLImageElement && t.src) {
                      const allImgs = note.images.length > 0 ? note.images : [t.src];
                      const cleanSrc = decodeURIComponent(t.src);
                      const clickedIdx = note.images.findIndex((im) => cleanSrc.includes(im.replace(/^dayflit-?image:\/\//, "")));
                      useUi.getState().openLightbox(allImgs, clickedIdx >= 0 ? clickedIdx : 0, title || note.title);
                    } else if (t instanceof HTMLInputElement && t.dataset.line) {
                      onChange(toggleChecklistLine(body, parseInt(t.dataset.line, 10)));
                    } else if (t instanceof HTMLAnchorElement && t.href) {
                      e.preventDefault();
                      void openExternal(t.href);
                    }
                  }}
                />
              ) : (
                <textarea
                  ref={ta}
                  className="input h-full min-h-[160px] w-full !bg-transparent !border-transparent !px-1 font-[inherit] text-[0.95em]"
                  placeholder="Write anything… Markdown, - [ ] checklists, #tags, links, paste images"
                  value={body}
                  onChange={(e) => onChange(e.target.value)}
                  onPaste={onPaste}
                  onKeyDown={onKeyDown}
                  spellCheck
                />
              )}
              {links.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {links.slice(0, 6).map((l) => (
                    <LinkCard key={l} url={l} compact={links.length > 2} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      <div className="flex items-center gap-2 border-t hairline px-3 py-1.5 text-[0.75em] text-faint">
        <span>{saved ? `Saved · ${timeAgo(note.updatedAt)}` : "Saving…"}</span>
        {progress.total > 0 && (
          <span className={cn("inline-flex items-center gap-1", progress.done === progress.total && "text-success")}>
            <CheckSquare size={11} /> {progress.done}/{progress.total}
          </span>
        )}
        {note.tags.length > 0 && <span className="truncate">{note.tags.map((t) => `#${t}`).join(" ")}</span>}
        {note.source && <span className="truncate">from {note.source.app}</span>}
        <div className="flex-1" />
        <button className="btn btn-ghost btn-icon btn-sm" aria-label={note.archived ? "Unarchive" : "Archive"} onClick={() => { update(note.id, { archived: !note.archived }); onClose?.(); }}>
          <Archive size={13} />
        </button>
        <button
          className="btn btn-ghost btn-sm text-faint hover:text-danger hover:bg-danger/10 transition-colors gap-1"
          aria-label="Delete note"
          title="Delete note"
          onClick={handleDelete}
        >
          <Trash2 size={13} />
          <span>Delete</span>
        </button>
      </div>
      </DocumentCrossfade>
    </div>
  );
}

function Tool({ icon, tip, onClick }: { icon: React.ReactNode; tip: string; onClick: () => void }) {
  return (
    <button className="btn btn-ghost btn-icon btn-sm text-muted" aria-label={tip} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon}
    </button>
  );
}
