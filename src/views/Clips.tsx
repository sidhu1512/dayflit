import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckSquare,
  Clipboard,
  ClipboardPaste,
  Copy,
  ImageIcon,
  LayoutGrid,
  Link2,
  List,
  Maximize2,
  Pin,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useClips } from "@/stores/clips";
import { useSettings } from "@/stores/settings";
import { useCanvas } from "@/stores/canvas";
import { useUi } from "@/stores/ui";
import { Empty } from "@/components/Empty";
import { LinkCard } from "@/components/LinkCard";
import { SmartObjectCard } from "@/components/SmartObjectCard";
import { Toggle } from "@/components/FocusPanel";
import { runAction } from "@/lib/runAction";
import { ipc, isTauri } from "@/lib/ipc";
import { imageUrl, prewarmImageUrls } from "@/lib/imageUrl";
import { isColorString, parseColor } from "@/lib/colorUtils";
import { SlidingPillContainer } from "@/components/ui/MotionPrimitives";
import { HorizontalPillStrip, type PillStripItem } from "@/components/ui/HorizontalPillStrip";
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
  const [appFilter, setAppFilter] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"smart" | "list">("smart");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inspectingClip, setInspectingClip] = useState<Clip | null>(null);

  useEffect(() => {
    if (viewParam === "capture") {
      useUi.getState().navigate("clips", null);
      void captureNow().then((c) => {
        if (c) {
          setInspectingClip(c);
        } else toast({ title: "Clipboard is empty", kind: "info" });
      });
    } else if (viewParam && clips.some((c) => c.id === viewParam)) {
      const target = clips.find((c) => c.id === viewParam);
      if (target) setInspectingClip(target);
      useUi.getState().navigate("clips", null);
    }
  }, [viewParam]);

  // Prewarm image clips synchronously
  useEffect(() => {
    const images = clips.filter((c) => c.kind === "image" && c.image).map((c) => c.image!);
    if (images.length) prewarmImageUrls(images);
  }, [clips]);

  const sourceApps = useMemo(() => [...new Set(clips.map((c) => c.source.app).filter(Boolean))].sort(), [clips]);

  const clipPillItems = useMemo<PillStripItem[]>(() => {
    const items: PillStripItem[] = (["all", "text", "link", "image"] as const).map((k) => ({
      id: k,
      label: k,
      active: !appFilter && kind === k,
      onSelect: () => { setKind(k); setAppFilter(null); },
    }));

    for (const app of sourceApps) {
      items.push({
        id: `app:${app}`,
        label: app,
        active: appFilter === app,
        onSelect: () => setAppFilter(app),
      });
    }

    return items;
  }, [kind, appFilter, sourceApps]);

  const shown = useMemo(() => {
    let list = clips;
    if (kind !== "all") list = list.filter((c) => c.kind === kind);
    if (appFilter) list = list.filter((c) => c.source.app.toLowerCase() === appFilter.toLowerCase());
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((c) => {
        if (
          c.text.toLowerCase().includes(s) ||
          c.source.app.toLowerCase().includes(s) ||
          c.source.title.toLowerCase().includes(s)
        ) {
          return true;
        }
        if (isColorString(c.text)) {
          const ca = parseColor(c.text);
          if (ca && (ca.hex.includes(s) || ca.rgb.includes(s) || ca.hsl.includes(s))) {
            return true;
          }
        }
        return false;
      });
    }
    return [...list].sort((a, b) => (a.pinned === b.pinned ? b.at - a.at : a.pinned ? -1 : 1));
  }, [clips, q, kind, appFilter]);

  const copy = async (c: Clip) => {
    if (c.kind === "image") return toast({ title: "Image clips can be saved to a note", kind: "info" });
    if (isTauri) await ipc.clipboardWriteText(c.text);
    else await navigator.clipboard.writeText(c.text);
    toast({ title: "Copied", kind: "success", ttl: 1500 });
  };

  return (
    <div className="flex h-full flex-col select-none">
      {/* Top Header Bar */}
      <div className="flex flex-nowrap items-center gap-2 px-4 pt-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="text-[1.05em] font-semibold tracking-tight truncate">Clips</div>
          <div className="text-[0.78em] text-muted truncate">
            Clipboard history, screenshots & saved items
          </div>
        </div>

        {/* View Mode Toggle: Smart Cards vs Compact List */}
        <SlidingPillContainer
          activeKey={displayMode}
          className="flex shrink-0 items-center rounded-lg bg-surface-2/60 p-0.5 border hairline"
          pillClassName="bg-surface shadow-xs rounded-md"
        >
          <button
            data-active={displayMode === "smart"}
            className={cn(
              "relative z-1 flex items-center gap-1 rounded-md px-2 py-1 text-[0.76em] font-medium transition-colors",
              displayMode === "smart"
                ? "text-text"
                : "text-muted hover:text-text",
            )}
            onClick={() => setDisplayMode("smart")}
            title="Smart Object Cards"
          >
            <LayoutGrid size={12} />
            <span>Cards</span>
          </button>
          <button
            data-active={displayMode === "list"}
            className={cn(
              "relative z-1 flex items-center gap-1 rounded-md px-2 py-1 text-[0.76em] font-medium transition-colors",
              displayMode === "list"
                ? "text-text"
                : "text-muted hover:text-text",
            )}
            onClick={() => setDisplayMode("list")}
            title="Compact Stream"
          >
            <List size={12} />
            <span>List</span>
          </button>
        </SlidingPillContainer>

        <label className="flex shrink-0 items-center gap-2 text-[0.8em] text-muted">
          Auto-capture
          <Toggle value={enabled} onChange={(v) => update({ clipboard: { enabled: v } })} />
        </label>
        <button
          className="btn btn-sm shrink-0 whitespace-nowrap"
          onClick={() =>
            void captureNow().then((c) =>
              c
                ? setOpenId(c.id)
                : toast({ title: "Clipboard is empty", kind: "info" }),
            )
          }
          aria-label="Capture clipboard now"
        >
          <ClipboardPaste size={14} /> Capture
        </button>
      </div>

      {/* Search and Filters */}
      <div className="mt-2 flex items-center gap-2 px-4 min-w-0">
        <div className="flex flex-1 min-w-0 items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 py-1">
          <Search size={13} className="text-faint shrink-0" />
          <input
            className="flex-1 min-w-0 bg-transparent text-[0.85em] outline-none placeholder:text-faint"
            placeholder="Search clips, colors, URLs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <HorizontalPillStrip
        activeKey={appFilter ? `app:${appFilter}` : kind}
        className="px-4 mt-2 shrink-0 min-h-[30px]"
        items={clipPillItems}
        quickSwitcherLabel={(n) => `All (${n}) ▾`}
        quickSwitcherThreshold={5}
        pillClassName="bg-surface-3 shadow-xs rounded-md"
      >
        {(["all", "text", "link", "image"] as const).map((k) => (
          <button
            key={k}
            data-active={!appFilter && kind === k ? "true" : undefined}
            className={cn(
              "relative z-10 rounded-md px-2 py-0.5 text-[0.78em] capitalize transition-colors shrink-0",
              !appFilter && kind === k ? "text-text font-medium" : "text-muted hover:text-text",
            )}
            onClick={() => { setKind(k); setAppFilter(null); }}
          >
            {k}
          </button>
        ))}
        {sourceApps.length > 0 && <span className="mx-1 h-3.5 w-px bg-surface-3 shrink-0" />}
        {sourceApps.map((app) => (
          <button
            key={app}
            data-active={appFilter === app ? "true" : undefined}
            className={cn(
              "relative z-10 rounded-md px-2 py-0.5 text-[0.78em] transition-colors shrink-0 max-w-[120px] truncate",
              appFilter === app ? "text-accent font-semibold" : "text-muted hover:text-text",
            )}
            onClick={() => setAppFilter(appFilter === app ? null : app)}
          >
            {app}
          </button>
        ))}
      </HorizontalPillStrip>

      {/* Main Stream Area */}
      <div className="scroll flex-1 px-3 pb-3 pt-2 overflow-y-auto">
        {shown.length === 0 ? (
          <Empty
            icon={<Clipboard size={28} />}
            title={clips.length ? "No matching clips" : "Nothing captured yet"}
            body={
              enabled
                ? "Copy something in any app and it shows up here."
                : "Turn on auto-capture, or press Alt+Shift+C to grab the clipboard on demand."
            }
          />
        ) : displayMode === "smart" ? (
          /* SMART OBJECT CARDS GRID VIEW */
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] anim-fade">
            {shown.map((c) => {
              if (c.kind === "image" && c.image) {
                return (
                  <div
                    key={c.id}
                    data-clip-id={c.id}
                    className="card group relative flex flex-col overflow-hidden border hairline transition-all hover:border-accent/40 hover:shadow-md cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button, a")) return;
                      setInspectingClip(c);
                    }}
                  >
                    <div className="relative h-44 w-full overflow-hidden bg-surface-2/80">
                      <img
                        src={imageUrl(c.image)}
                        alt=""
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border-t hairline bg-surface/60">
                      <div className="flex items-center gap-1.5 text-[0.72em] text-faint">
                        <span className="font-medium text-muted">{c.source.app}</span>
                        <span>·</span>
                        <span>{timeAgo(c.at)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn btn-xs btn-ghost text-muted hover:text-text cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            void runAction({ type: "capture-clip", clip: c, as: "note" });
                          }}
                          title="Save to Note"
                        >
                          <StickyNote size={12} />
                        </button>
                        <button
                          className="btn btn-xs btn-ghost text-faint hover:text-danger cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(c.id);
                          }}
                          title="Delete clip"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={c.id}
                  data-clip-id={c.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
                    setInspectingClip(c);
                  }}
                >
                  <SmartObjectCard
                    clip={c}
                    content={c.text}
                    onConvert={(as) => void runAction({ type: "capture-clip", clip: c, as })}
                    onDelete={() => remove(c.id)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          /* COMPACT LIST VIEW */
          <div className="flex flex-col gap-1.5">
            {shown.map((c) => {
              const isColor = isColorString(c.text);

              return (
                <div
                  key={c.id}
                  data-clip-id={c.id}
                  className="card overflow-hidden transition hover:border-accent/40 cursor-pointer"
                  onClick={() => setInspectingClip(c)}
                >
                  <div className="flex w-full items-start gap-2.5 px-3 py-2 text-left">
                    <span className="mt-0.5 shrink-0 text-faint">
                      {isColor ? (
                        <span
                          className="inline-block h-3.5 w-3.5 rounded-full border hairline shadow-xs"
                          style={{ background: c.text.trim() }}
                        />
                      ) : c.kind === "image" ? (
                        <ImageIcon size={14} />
                      ) : c.kind === "link" ? (
                        <Link2 size={14} />
                      ) : (
                        <Clipboard size={14} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      {c.kind === "image" ? (
                        <div className="relative inline-block">
                          <img
                            src={imageUrl(c.image!)}
                            alt=""
                            className="h-14 rounded-md object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none";
                              if (e.currentTarget.nextElementSibling) {
                                (e.currentTarget.nextElementSibling as HTMLElement).style.display =
                                  "inline-flex";
                              }
                            }}
                          />
                          <span
                            className="img-unavailable-pill"
                            style={{ display: "none" }}
                            role="status"
                          >
                            Image unavailable
                          </span>
                        </div>
                      ) : (
                        <div className="selectable whitespace-pre-wrap break-words text-[0.88em] leading-snug line-clamp-2">
                          {c.text}
                        </div>
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Footer Info */}
      {clips.length > 0 && (
        <div className="flex items-center justify-between border-t hairline px-4 py-1.5 text-[0.75em] text-faint">
          <span>
            {clips.length} clips
            {clips.some((c) => c.pinned)
              ? ` · ${clips.filter((c) => c.pinned).length} pinned`
              : ""}
          </span>
          <button
            className="hover:text-danger cursor-pointer"
            onClick={async () => {
              if (
                await ask({
                  title: "Clear clip history?",
                  body: "Pinned clips are kept.",
                  confirmLabel: "Clear",
                  danger: true,
                })
              )
                clear();
            }}
          >
            Clear unpinned
          </button>
        </div>
      )}

      {/* Full Clip Detail View / Lightbox Inspector */}
      {inspectingClip && (
        <ClipInspectorModal
          clip={inspectingClip}
          onClose={() => setInspectingClip(null)}
          onDelete={() => {
            remove(inspectingClip.id);
            setInspectingClip(null);
          }}
          onCopy={() => copy(inspectingClip)}
        />
      )}
    </div>
  );
}

function ClipInspectorModal({
  clip,
  onClose,
  onDelete,
  onCopy,
}: {
  clip: Clip;
  onClose: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(clip.text);
  const toast = useUi((s) => s.toast);
  const updateClip = useClips((s) => s.update);
  const togglePin = useClips((s) => s.togglePin);

  useEffect(() => {
    setEditText(clip.text);
    setEditing(false);
  }, [clip.id, clip.text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const handleSaveEdit = () => {
    updateClip(clip.id, { text: editText });
    setEditing(false);
  };

  const isColor = isColorString(clip.text);
  const colorData = isColor ? parseColor(clip.text) : null;
  const isImage = clip.kind === "image" && Boolean(clip.image);
  const isLink = clip.kind === "link" || /^https?:\/\//i.test(clip.text.trim());

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6 anim-fade"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Clip Inspector"
    >
      <div
        className="glass anim-pop relative flex flex-col w-full max-w-2xl max-h-[88vh] rounded-2xl border hairline bg-surface/95 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-13 items-center justify-between px-4 border-b hairline bg-surface-2/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isImage ? (
              <ImageIcon size={15} className="text-accent shrink-0" />
            ) : isColor ? (
              <span
                className="h-3.5 w-3.5 rounded-full border hairline shrink-0 shadow-xs"
                style={{ background: clip.text.trim() }}
              />
            ) : isLink ? (
              <Link2 size={15} className="text-accent shrink-0" />
            ) : (
              <Clipboard size={15} className="text-accent shrink-0" />
            )}
            <span className="font-semibold text-sm truncate text-text">
              {clip.source.app || "Clip Inspector"}
            </span>
            {clip.source.title && (
              <span className="text-xs text-faint truncate hidden sm:inline max-w-[200px]">
                · {clip.source.title}
              </span>
            )}
            <span className="text-xs text-faint tabular shrink-0">
              · {timeAgo(clip.at)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={cn("btn btn-xs btn-ghost gap-1 cursor-pointer", clip.pinned && "text-accent font-semibold")}
              onClick={() => togglePin(clip.id)}
              title={clip.pinned ? "Unpin clip" : "Pin clip"}
            >
              <Pin size={12} />
              <span className="hidden sm:inline">{clip.pinned ? "Pinned" : "Pin"}</span>
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm text-muted hover:text-text cursor-pointer"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="scroll flex-1 overflow-y-auto p-4 min-h-[160px]">
          {isImage ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <div
                className="relative group cursor-pointer overflow-hidden rounded-xl border hairline bg-surface-2/50 max-h-[55vh] flex items-center justify-center"
                onClick={() => useUi.getState().openLightbox([clip.image!], 0, `Clip from ${clip.source.app}`)}
                title="Click to open Fullscreen Lightbox"
              >
                <img
                  src={imageUrl(clip.image!)}
                  alt=""
                  className="max-h-[52vh] max-w-full rounded-xl object-contain transition-transform group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-medium backdrop-blur-xs">
                  <Maximize2 size={15} /> Fullscreen Lightbox
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-faint">
                {clip.width > 0 && clip.height > 0 && (
                  <span>{clip.width} × {clip.height} px</span>
                )}
                <span>Click image to zoom and pan</span>
              </div>
            </div>
          ) : isColor && colorData ? (
            <div className="flex flex-col gap-4">
              <div
                className="h-28 w-full rounded-xl border hairline shadow-inner flex items-center justify-center"
                style={{ backgroundColor: colorData.hex }}
              >
                <span
                  className="text-lg font-bold font-mono px-3 py-1 rounded-lg backdrop-blur-md shadow-sm"
                  style={{
                    color: colorData.bestTextColor,
                    backgroundColor: colorData.bestTextColor === "#000000" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.4)",
                  }}
                >
                  {colorData.hex.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-surface-2/60 p-2.5 border hairline">
                  <div className="text-[10px] text-faint uppercase font-mono">HEX</div>
                  <div className="text-sm font-semibold font-mono mt-0.5">{colorData.hex.toUpperCase()}</div>
                </div>
                <div className="rounded-lg bg-surface-2/60 p-2.5 border hairline">
                  <div className="text-[10px] text-faint uppercase font-mono">RGB</div>
                  <div className="text-sm font-semibold font-mono mt-0.5">{colorData.rgb}</div>
                </div>
                <div className="rounded-lg bg-surface-2/60 p-2.5 border hairline">
                  <div className="text-[10px] text-faint uppercase font-mono">HSL</div>
                  <div className="text-sm font-semibold font-mono mt-0.5">{colorData.hsl}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-faint">
                <span>
                  {clip.text.length} characters · {clip.text.trim().split(/\s+/).filter(Boolean).length} words
                </span>
                {!editing ? (
                  <button
                    className="btn btn-xs btn-ghost text-accent hover:underline cursor-pointer"
                    onClick={() => setEditing(true)}
                  >
                    Edit text
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      className="btn btn-xs btn-ghost text-muted cursor-pointer"
                      onClick={() => {
                        setEditText(clip.text);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-xs btn-primary cursor-pointer"
                      onClick={handleSaveEdit}
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>

              {editing ? (
                <textarea
                  className="input w-full min-h-[220px] font-mono text-[0.88em] leading-relaxed p-3 rounded-xl border hairline bg-surface-2/50 outline-none"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                />
              ) : (
                <div className="selectable whitespace-pre-wrap break-words rounded-xl bg-surface-2/40 p-3.5 text-[0.92em] leading-relaxed font-sans border hairline max-h-[55vh] overflow-y-auto">
                  {clip.text}
                </div>
              )}

              {isLink && (
                <div className="mt-2">
                  <LinkCard url={clip.text.trim()} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t hairline px-4 py-2.5 bg-surface-2/30 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              className="btn btn-sm btn-primary gap-1.5 cursor-pointer"
              onClick={onCopy}
              title="Copy clip content"
            >
              <Copy size={13} />
              <span>Copy</span>
            </button>
            <button
              className="btn btn-sm btn-ghost gap-1.5 text-muted hover:text-text cursor-pointer"
              onClick={() => void runAction({ type: "capture-clip", clip, as: "note" })}
              title="Open / Save into Note"
            >
              <StickyNote size={13} />
              <span className="hidden sm:inline">Open in Note</span>
            </button>
            <button
              className="btn btn-sm btn-ghost gap-1.5 text-muted hover:text-text cursor-pointer"
              onClick={() => void runAction({ type: "capture-clip", clip, as: "task" })}
              title="Create Task from clip"
            >
              <CheckSquare size={13} />
              <span className="hidden sm:inline">Create Task</span>
            </button>
            <button
              className="btn btn-sm btn-ghost gap-1.5 text-muted hover:text-text cursor-pointer"
              onClick={() => {
                const boards = useCanvas.getState().boards;
                const activeId = useCanvas.getState().activeBoardId || boards[0]?.id;
                let targetId = activeId;
                if (!targetId) {
                  targetId = useCanvas.getState().createBoard("Clip Board").id;
                }
                if (isImage) {
                  const imgRef = clip.image!.startsWith("dayflit-image://") ? clip.image! : `dayflit-image://${clip.image}`;
                  useCanvas.getState().addNode(targetId, {
                    type: "file",
                    file: imgRef,
                    x: 140,
                    y: 140,
                    width: 340,
                    height: 240,
                  });
                } else {
                  useCanvas.getState().addNode(targetId, {
                    type: "text",
                    text: clip.text,
                    x: 140,
                    y: 140,
                    width: 320,
                    height: 180,
                  });
                }
                onClose();
                useUi.getState().navigate("canvas");
              }}
              title="Send to Canvas"
            >
              <LayoutGrid size={13} />
              <span className="hidden sm:inline">Canvas</span>
            </button>
          </div>

          <button
            className="btn btn-sm btn-ghost text-danger hover:bg-danger/10 gap-1 cursor-pointer"
            onClick={onDelete}
            title="Delete this clip"
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
