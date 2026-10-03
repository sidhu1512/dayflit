import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Bold, CheckSquare, Code, Eye, Heading, ImagePlus, Link2, List, Pencil, Pin, Trash2, X } from "lucide-react";
import { useNotes, noteTitle } from "@/stores/notes";
import { useUi } from "@/stores/ui";
import { renderMarkdown, toggleChecklistLine, checklistProgress } from "@/lib/markdown";
import { imageUrl, imagesFromDataTransfer, storeImageBlob } from "@/lib/imageUrl";
import { extractLinks } from "@/lib/nlp";
import { openExternal } from "@/lib/open";
import { LinkCard } from "./LinkCard";
import { cn, debounce } from "@/lib/ids";
import { timeAgo } from "@/lib/dates";

const NOTE_COLORS = [null, "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];

export function NoteEditor({ noteId, onClose, embedded }: { noteId: string; onClose?: () => void; embedded?: boolean }) {
  const note = useNotes((s) => s.notes.find((n) => n.id === noteId));
  const setBody = useNotes((s) => s.setBody);
  const update = useNotes((s) => s.update);
  const remove = useNotes((s) => s.remove);
  const toast = useUi((s) => s.toast);
  const ask = useUi((s) => s.ask);
  const [body, setBodyLocal] = useState(note?.body ?? "");
  const [title, setTitle] = useState(note?.title ?? "");
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(true);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBodyLocal(note?.body ?? "");
    setTitle(note?.title ?? "");
    setPreview(!!note?.body && note.body.length > 0 && !embedded ? false : false);
  }, [note?.id]);

  const persist = useMemo(() => debounce((id: string, b: string) => { setBody(id, b); setSaved(true); }, 350), [setBody]);
  const onChange = (v: string) => {
    setBodyLocal(v);
    setSaved(false);
    persist(noteId, v);
  };
  useEffect(() => () => { if (!saved && note) setBody(note.id, body); }, []);

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

  if (!note) return null;
  const html = renderMarkdown(body, imageUrl);
  const links = extractLinks(body);
  const progress = checklistProgress(body);

  return (
    <div className={cn("flex h-full flex-col", !embedded && "absolute inset-0 z-50 bg-bg/95 backdrop-blur-sm anim-fade")} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <div className="flex items-center gap-1 px-3 pt-2.5">
        <input className="input !bg-transparent !border-transparent !px-1 text-[1.05em] font-semibold" placeholder={noteTitle(note) === "Untitled" ? "Untitled note" : noteTitle(note)} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== note.title && update(note.id, { title })} />
        <button className={cn("btn btn-ghost btn-icon btn-sm", note.pinned ? "text-accent" : "text-muted")} onClick={() => update(note.id, { pinned: !note.pinned })} aria-label="Pin" data-tip="Pin">
          <Pin size={14} />
        </button>
        <button className={cn("btn btn-ghost btn-icon btn-sm text-muted", preview && "text-accent")} onClick={() => setPreview((p) => !p)} aria-label={preview ? "Edit" : "Preview"} data-tip={preview ? "Edit" : "Preview"}>
          {preview ? <Pencil size={14} /> : <Eye size={14} />}
        </button>
        {onClose && (
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onClick={onClose} aria-label="Close" data-tip="Close">
            <X size={15} />
          </button>
        )}
      </div>
      {!preview && (
        <div className="flex items-center gap-0.5 px-3 pt-1">
          <Tool icon={<Bold size={13} />} tip="Bold (Ctrl+B)" onClick={() => insert("**", "**", "bold")} />
          <Tool icon={<Heading size={13} />} tip="Heading" onClick={() => linePrefix("## ")} />
          <Tool icon={<List size={13} />} tip="List" onClick={() => linePrefix("- ")} />
          <Tool icon={<CheckSquare size={13} />} tip="Checklist (Ctrl+Shift+C)" onClick={() => linePrefix("- [ ] ")} />
          <Tool icon={<Code size={13} />} tip="Code" onClick={() => insert("`", "`", "code")} />
          <Tool icon={<Link2 size={13} />} tip="Link (Ctrl+K)" onClick={() => insert("[", "](https://)", "link")} />
          <label className="btn btn-ghost btn-icon btn-sm cursor-pointer text-muted" aria-label="Insert image" data-tip="Insert image">
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
      <div className="scroll flex-1 px-3 pb-3 pt-2">
        {preview ? (
          <div
            className="prose text-[0.95em]"
            dangerouslySetInnerHTML={{ __html: html || "<p class='text-faint'>Nothing here yet.</p>" }}
            onClick={(e) => {
              const t = e.target as HTMLElement;
              if (t instanceof HTMLInputElement && t.dataset.line) {
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
        <button className="btn btn-ghost btn-icon btn-sm" aria-label={note.archived ? "Unarchive" : "Archive"} data-tip={note.archived ? "Unarchive" : "Archive"} onClick={() => { update(note.id, { archived: !note.archived }); onClose?.(); }}>
          <Archive size={13} />
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm text-danger"
          aria-label="Delete" data-tip="Delete"
          onClick={async () => {
            if (body.trim().length > 40 && !(await ask({ title: "Delete this note?", body: "You can undo from the toast for a short while.", confirmLabel: "Delete", danger: true }))) return;
            remove(note.id);
            onClose?.();
            toast({ title: "Note deleted", kind: "info", action: { label: "Undo", onClick: () => useNotes.getState().restoreLast() } });
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function Tool({ icon, tip, onClick }: { icon: React.ReactNode; tip: string; onClick: () => void }) {
  return (
    <button className="btn btn-ghost btn-icon btn-sm text-muted" aria-label={tip} data-tip={tip} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon}
    </button>
  );
}
