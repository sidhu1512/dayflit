import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckSquare, Clipboard, ClipboardPaste, Copy, Link2, Pin, Search, StickyNote, Trash2, ImageIcon } from "lucide-react";
import { useClips } from "@/stores/clips";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { Empty } from "@/components/Empty";
import { LinkCard } from "@/components/LinkCard";
import { Toggle } from "@/components/FocusPanel";
import { runAction } from "@/lib/runAction";
import { ipc, isTauri } from "@/lib/ipc";
import { imageUrl } from "@/lib/imageUrl";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/ids";
import type { Clip } from "@/lib/types";

export function ClipsView() {
  const clips = useClips((s) => s.clips);
  const captureNow = useClips((s) => s.captureNow);
  const remove = useClips((s) => s.remove);
  const clear = useClips((s) => s.clear);
  const togglePin = useClips((s) => s.togglePin);
  const enabled = useSettings((s) => s.settings.clipboard.enabled);
  const update = useSettings((s) => s.update);
  const toast = useUi((s) => s.toast);
  const ask = useUi((s) => s.ask);
  const viewParam = useUi((s) => s.viewParam);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "text" | "link" | "image">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (viewParam === "capture") {
      useUi.getState().navigate("clips", null);
      void captureNow().then((c) => {
        if (c) {
          setOpenId(c.id);
          toast({ title: "Captured", body: `from ${c.source.app}`, kind: "success" });
        } else toast({ title: "Clipboard is empty", kind: "info" });
      });
    } else if (viewParam && clips.some((c) => c.id === viewParam)) {
      setOpenId(viewParam);
      useUi.getState().navigate("clips", null);
    }
  }, [viewParam]);

  const shown = useMemo(() => {
    let list = clips;
    if (kind !== "all") list = list.filter((c) => c.kind === kind);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((c) => c.text.toLowerCase().includes(s) || c.source.app.toLowerCase().includes(s) || c.source.title.toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => (a.pinned === b.pinned ? b.at - a.at : a.pinned ? -1 : 1));
  }, [clips, q, kind]);

  const copy = async (c: Clip) => {
    if (c.kind === "image") return toast({ title: "Image clips can be saved to a note", kind: "info" });
    if (isTauri) await ipc.clipboardWriteText(c.text);
    else await navigator.clipboard.writeText(c.text);
    toast({ title: "Copied", kind: "success", ttl: 1500 });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-1">
        <div className="flex-1">
          <div className="text-[1.05em] font-semibold">Clips</div>
          <div className="text-[0.78em] text-muted">Everything you copy, with where it came from</div>
        </div>
        <label className="flex items-center gap-2 text-[0.8em] text-muted">
          Auto-capture
          <Toggle value={enabled} onChange={(v) => update({ clipboard: { enabled: v } })} />
        </label>
        <button className="btn btn-sm" onClick={() => void captureNow().then((c) => (c ? (setOpenId(c.id), toast({ title: "Captured", body: `from ${c.source.app}`, kind: "success" })) : toast({ title: "Clipboard is empty", kind: "info" })))} aria-label="Capture clipboard now">
          <ClipboardPaste size={14} /> Capture
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 px-4">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 py-1">
          <Search size={13} className="text-faint" />
          <input className="flex-1 bg-transparent text-[0.85em] outline-none placeholder:text-faint" placeholder="Search clips…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex rounded-lg bg-surface-2/60 p-0.5">
          {(["all", "text", "link", "image"] as const).map((k) => (
            <button key={k} className={cn("rounded-md px-2 py-0.5 text-[0.78em] capitalize", kind === k ? "bg-surface-3 text-text" : "text-muted")} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll flex-1 px-3 pb-3 pt-2">
        {shown.length === 0 ? (
          <Empty icon={<Clipboard size={28} />} title={clips.length ? "No matching clips" : "Nothing captured yet"} body={enabled ? "Copy something in any app and it shows up here." : "Turn on auto-capture, or press Alt+Shift+C to grab the clipboard on demand."} />
        ) : (
          <div className="flex flex-col gap-1.5">
            {shown.map((c) => {
              const open = openId === c.id;
              return (
                <div key={c.id} className={cn("card overflow-hidden transition", open && "!border-accent/40")}>
                  <button className="flex w-full items-start gap-2.5 px-3 py-2 text-left" onClick={() => setOpenId(open ? null : c.id)}>
                    <span className="mt-0.5 shrink-0 text-faint">{c.kind === "image" ? <ImageIcon size={14} /> : c.kind === "link" ? <Link2 size={14} /> : <Clipboard size={14} />}</span>
                    <div className="min-w-0 flex-1">
                      {c.kind === "image" ? (
                        <img src={imageUrl(c.image!)} alt="" className={cn("rounded-md object-cover", open ? "max-h-72" : "h-14")} />
                      ) : (
                        <div className={cn("selectable whitespace-pre-wrap break-words text-[0.88em] leading-snug", !open && "line-clamp-2")}>{c.text}</div>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[0.72em] text-faint">
                        <span className="font-medium text-muted">{c.source.app}</span>
                        {c.source.title && <span className="truncate">{c.source.title}</span>}
                        <span className="shrink-0">{timeAgo(c.at)}</span>
                        {c.pinned && <Pin size={10} className="text-accent" />}
                        {c.convertedTo && (
                          <span className="chip">
                            <ArrowRight size={9} /> {c.convertedTo.type}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="anim-fade border-t hairline px-3 py-2">
                      {c.kind === "link" && <div className="mb-2"><LinkCard url={c.text.trim()} /></div>}
                      <div className="flex flex-wrap gap-1.5">
                        <button className="btn btn-sm" onClick={() => void runAction({ type: "capture-clip", clip: c, as: "task" })}>
                          <CheckSquare size={13} /> To task
                        </button>
                        <button className="btn btn-sm" onClick={() => void runAction({ type: "capture-clip", clip: c, as: "note" })}>
                          <StickyNote size={13} /> To note
                        </button>
                        {c.kind !== "image" && (
                          <button className="btn btn-sm" onClick={() => void copy(c)}>
                            <Copy size={13} /> Copy
                          </button>
                        )}
                        <button className={cn("btn btn-sm", c.pinned && "btn-primary")} onClick={() => togglePin(c.id)}>
                          <Pin size={13} /> {c.pinned ? "Pinned" : "Pin"}
                        </button>
                        <div className="flex-1" />
                        <button className="btn btn-ghost btn-sm text-danger" onClick={() => { remove(c.id); setOpenId(null); }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {clips.length > 0 && (
        <div className="flex items-center justify-between border-t hairline px-4 py-1.5 text-[0.75em] text-faint">
          <span>{clips.length} clips{clips.some((c) => c.pinned) ? ` · ${clips.filter((c) => c.pinned).length} pinned` : ""}</span>
          <button className="hover:text-danger" onClick={async () => { if (await ask({ title: "Clear clip history?", body: "Pinned clips are kept.", confirmLabel: "Clear", danger: true })) clear(); }}>
            Clear unpinned
          </button>
        </div>
      )}
    </div>
  );
}
