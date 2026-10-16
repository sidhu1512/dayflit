import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMonths, format } from "date-fns";
import { Bold, BookOpen, Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, Heading, ImageOff, ImagePlus, Link2, List, Lock, Mic, Pencil, Plus, Search, Sparkles, Star, Trash2, X, LayoutTemplate, Frown, Meh, Smile, Laugh, Annoyed, Unlock, Volume2, Wand2, Activity } from "lucide-react";
import { useJournal, entriesOn, entryTitle, journalStreak, wordCount, daysWithEntries, monthGrid } from "@/stores/journal";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { useTasks } from "@/stores/tasks";
import { useFocus } from "@/stores/focus";
import { useHabits } from "@/stores/habits";
import { useNotes } from "@/stores/notes";
import { useClips } from "@/stores/clips";
import { JOURNAL_TEMPLATES, JOURNAL_PROMPTS, MOODS, JOURNAL_ICONS, promptForDay } from "@/lib/journalContent";
import { HabitIcon } from "@/components/icons";
import { Empty } from "@/components/Empty";
import { renderMarkdown, toggleChecklistLine, extractCleanTitleAndExcerpt, extractAllImages } from "@/lib/markdown";
import { imageUrl, imagesFromDataTransfer, storeImageBlob, prewarmImageUrls } from "@/lib/imageUrl";
import { openExternal } from "@/lib/open";
import { dateKey, parseKey, relativeDay, timeAgo } from "@/lib/dates";
import { cn, debounce } from "@/lib/ids";
import { useElementWidth } from "@/lib/useElementWidth";
import { sha256Hex } from "@/lib/crypto";
import { ipc } from "@/lib/ipc";
import { findResurfacedMemory, aggregateDayChronicle, formatChronicleMarkdown } from "@/lib/dailyChronicle";
import { DocumentCrossfade, HoldToDeleteButton, SlidingPillContainer } from "@/components/ui/MotionPrimitives";
import { HorizontalPillStrip, type PillStripItem } from "@/components/ui/HorizontalPillStrip";
import type { JournalEntry } from "@/lib/types";

const MOOD_ICONS = [Annoyed, Frown, Meh, Smile, Laugh];
const MOOD_COLORS = ["#ef5b6b", "#fb923c", "#9ca3af", "#34d399", "#60a5fa"];

export function MoodIcon({ mood, size = 14 }: { mood: number | null; size?: number }) {
  if (!mood) return null;
  const Icon = MOOD_ICONS[mood - 1] ?? Meh;
  return <Icon size={size} color={MOOD_COLORS[mood - 1]} />;
}

export function JournalView() {
  const { journals, entries, templates, addJournal, addEntry, unlockedUntil, setUnlocked, removeJournal, renameJournal, updateEntry } = useJournal();
  const settings = useSettings((s) => s.settings);
  const weekStartsOn = settings.calendar.weekStartsOn;
  const viewParam = useUi((s) => s.viewParam);
  const [openId, setOpenId] = useState<string | null>(null);
  const [journalId, setJournalId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [manageJournals, setManageJournals] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const twoPane = width >= 620;
  const locked = !!settings.journal.pinHash && Date.now() > unlockedUntil;

  useEffect(() => {
    if (viewParam === "new") {
      const e = addEntry({ journalId: settings.journal.defaultJournalId ?? "default" });
      setOpenId(e.id);
      useUi.getState().navigate("journal", null);
    } else if (viewParam?.startsWith("prompt:")) {
      const prompt = viewParam.slice(7);
      const e = addEntry({ journalId: settings.journal.defaultJournalId ?? "default", body: `## ${prompt}\n\n`, prompt, source: "prompt" });
      setOpenId(e.id);
      useUi.getState().navigate("journal", null);
    } else if (viewParam && entries.some((e) => e.id === viewParam)) {
      setOpenId(viewParam);
      useUi.getState().navigate("journal", null);
    }
  }, [viewParam]);

  // auto-relock
  useEffect(() => {
    if (!settings.journal.pinHash) return;
    const t = window.setInterval(() => {
      if (Date.now() > useJournal.getState().unlockedUntil && openId) setOpenId(null);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [settings.journal.pinHash, openId]);

  const tags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries]);
  const shown = useMemo(() => {
    let list = entries;
    if (journalId) list = list.filter((e) => e.journalId === journalId);
    if (favOnly) list = list.filter((e) => e.favorite);
    if (tag) list = list.filter((e) => e.tags.includes(tag));
    if (dayFilter) list = list.filter((e) => e.date === dayFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(s) || e.body.toLowerCase().includes(s) || e.tags.some((t) => t.includes(s)));
    }
    return [...list].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  }, [entries, journalId, favOnly, tag, dayFilter, q]);
  const groups = useMemo(() => {
    const m = new Map<string, JournalEntry[]>();
    for (const e of shown) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [shown]);
  const streak = journalStreak(entries);
  const todayKey = dateKey();
  const todayEntries = entriesOn(entries, todayKey);
  const resurfacedMemory = useMemo(() => findResurfacedMemory(entries), [entries]);
  const dayCounts = useMemo(() => daysWithEntries(entries, journalId), [entries, journalId]);
  const prompt = promptForDay(todayKey);

  const handleAddBook = async () => {
    const name = await useUi.getState().promptUser({
      title: "New Journal Book",
      body: "Enter a name for your new journal collection:",
      placeholder: "e.g. Work, Travel, Philosophy, Ideas…",
      confirmLabel: "Create Book",
    });
    if (name && name.trim()) {
      const j = addJournal({ name: name.trim() });
      setJournalId(j.id);
      setFavOnly(false);
      setTag(null);
    }
  };

  const handleDeleteBook = (id: string) => {
    if (id === "default" || id === "all" || id === "favorites") return;
    if (id.startsWith("tag:")) {
      const tagName = id.slice(4);
      for (const e of entries) {
        if (e.tags?.includes(tagName)) {
          updateEntry(e.id, { tags: e.tags.filter((t) => t !== tagName) });
        }
      }
      if (tag === tagName) setTag(null);
      return;
    }
    removeJournal(id);
    if (journalId === id) {
      setJournalId(null);
      setFavOnly(false);
      setTag(null);
    }
  };

  const handleRenameBook = (id: string, newName: string) => {
    if (id.startsWith("tag:")) {
      const oldTag = id.slice(4);
      const cleanNew = newName.replace(/^#/, "").trim();
      for (const e of entries) {
        if (e.tags?.includes(oldTag)) {
          updateEntry(e.id, { tags: e.tags.map((t) => (t === oldTag ? cleanNew : t)) });
        }
      }
      if (tag === oldTag) setTag(cleanNew);
      return;
    }
    renameJournal(id, newName);
  };

  const pillItems = useMemo<PillStripItem[]>(() => {
    const list: PillStripItem[] = [
      {
        id: "all",
        label: "All",
        active: !journalId && !favOnly && !tag,
        onSelect: () => {
          setJournalId(null);
          setFavOnly(false);
          setTag(null);
        },
      },
    ];
    for (const j of journals) {
      list.push({
        id: j.id,
        label: j.name,
        icon: <HabitIcon name={j.icon} size={11} />,
        color: j.color,
        active: journalId === j.id && !favOnly && !tag,
        onSelect: () => {
          setJournalId(j.id);
          setFavOnly(false);
          setTag(null);
        },
        ariaLabel: j.name,
      });
    }
    list.push({
      id: "favorites",
      label: "Favorites",
      icon: <Star size={11} />,
      active: favOnly,
      onSelect: () => {
        setFavOnly((v) => !v);
        setTag(null);
      },
      ariaLabel: "Favorites",
    });
    for (const t of tags) {
      list.push({
        id: `tag:${t}`,
        label: `#${t}`,
        active: tag === t && !favOnly,
        onSelect: () => {
          setTag(tag === t ? null : t);
          setFavOnly(false);
        },
        ariaLabel: `Tag ${t}`,
      });
    }
    return list;
  }, [journals, journalId, favOnly, tag, tags]);

  const create = (extra: Partial<JournalEntry> = {}) => {
    const e = addEntry({ journalId: journalId ?? settings.journal.defaultJournalId ?? "default", date: dayFilter ?? todayKey, ...extra });
    setOpenId(e.id);
    setShowTemplates(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "n" && !e.ctrlKey && !openId && !locked) {
        e.preventDefault();
        create();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, locked, journalId, dayFilter]);

  if (locked) return <LockScreen onUnlock={() => setUnlocked(Date.now() + settings.journal.lockAfterMin * 60_000)} />;

  // Synchronously prewarm all image attachments so Journal never flickers
  useEffect(() => {
    const allImages: string[] = [];
    for (const e of entries) {
      if (e.images?.length) allImages.push(...e.images);
    }
    if (allImages.length) prewarmImageUrls(allImages);
  }, [entries]);

  const list = (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[1.05em] font-semibold">
            Journal
            {streak > 1 && <span className="chip chip-warning">{streak} day streak</span>}
          </div>
          <div className="text-[0.76em] text-muted">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            {todayEntries.length ? ` · ${todayEntries.length} today` : " · nothing yet today"}
          </div>
        </div>
        <button className={cn("btn btn-ghost btn-icon btn-sm", showCalendar ? "text-accent" : "text-muted")} onClick={() => setShowCalendar((v) => !v)} aria-label="Browse by date">
          <CalendarIcon size={15} />
        </button>
        <button className={cn("btn btn-ghost btn-icon btn-sm", showTemplates ? "text-accent" : "text-muted")} onClick={() => setShowTemplates((v) => !v)} aria-label="Templates">
          <LayoutTemplate size={15} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => create()}>
          <Plus size={14} /> Write
        </button>
      </div>

      <HorizontalPillStrip
        activeKey={favOnly ? "favorites" : (tag ? `tag:${tag}` : (journalId ?? "all"))}
        className="px-3 py-1.5 min-h-[36px] shrink-0"
        items={pillItems}
        onAdd={handleAddBook}
        onDelete={handleDeleteBook}
        onRename={handleRenameBook}
        canModify={(id) => id !== "all" && id !== "favorites" && id !== "default"}
        addLabel="Add new journal book"
        addAriaLabel="Add Journal Book"
        quickSwitcherLabel={(n) => `All (${n}) ▾`}
        quickSwitcherThreshold={5}
        pillClassName="bg-accent/20 rounded-full"
      />

      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-2/50 px-2.5 py-1.5">
          <Search size={13} className="text-faint" />
          <input className="flex-1 bg-transparent text-[0.88em] outline-none placeholder:text-faint" placeholder="Search entries…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {dayFilter && (
          <button className="chip chip-accent cursor-pointer" onClick={() => setDayFilter(null)}>
            {relativeDay(parseKey(dayFilter))} <X size={10} />
          </button>
        )}
      </div>

      {showCalendar && (
        <div className="anim-fade mx-3 mt-2 rounded-xl bg-surface-2/50 p-2">
          <div className="mb-1 flex items-center justify-between">
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
              <ChevronLeft size={14} />
            </button>
            <span className="text-[0.85em] font-medium">{format(month, "MMMM yyyy")}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[0.7em]">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="py-0.5 text-faint">
                {["S", "M", "T", "W", "T", "F", "S"][(weekStartsOn + i) % 7]}
              </div>
            ))}
            {monthGrid(month.getFullYear(), month.getMonth(), weekStartsOn).map((d, i) => {
              if (!d) return <div key={i} />;
              const k = dateKey(d);
              const n = dayCounts.get(k) ?? 0;
              const isToday = k === todayKey;
              return (
                <button key={k} className={cn("relative rounded-md py-1 hover:bg-surface-3/60", dayFilter === k && "bg-accent/20 text-accent", isToday && "font-bold")} onClick={() => setDayFilter(dayFilter === k ? null : k)}>
                  {d.getDate()}
                  {n > 0 && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showTemplates && (
        <div className="anim-fade mx-3 mt-2 grid grid-cols-2 gap-1.5">
          {[...JOURNAL_TEMPLATES.map((t) => ({ id: t.id, name: t.name, body: t.body, description: t.description })), ...templates.map((t) => ({ id: t.id, name: t.name, body: t.body, description: "Your template" }))].map((t) => (
            <button key={t.id} className="card card-hover flex flex-col px-2.5 py-1.5 text-left" onClick={() => create({ body: t.body, source: "template" })}>
              <span className="text-[0.85em] font-medium">{t.name}</span>
              <span className="text-[0.72em] text-faint">{t.description}</span>
            </button>
          ))}
        </div>
      )}

      <div className="scroll flex-1 px-3 pb-3 pt-2">
        {!q && !dayFilter && !favOnly && !tag && todayEntries.length === 0 && (
          <button className="card card-hover mb-2 flex w-full items-start gap-2.5 px-3 py-2.5 text-left" onClick={() => create({ body: `## ${prompt}\n\n`, prompt, source: "prompt" })}>
            <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="text-[0.72em] uppercase tracking-wider text-faint">Today's prompt</div>
              <div className="text-[0.9em]">{prompt}</div>
            </div>
          </button>
        )}
        {!q && !dayFilter && !favOnly && !tag && resurfacedMemory && (
          <div
            className="card card-hover mb-2.5 overflow-hidden border border-accent/25 bg-gradient-to-br from-accent/10 via-surface/60 to-surface/40 p-3 shadow-sm rounded-xl cursor-pointer"
            onClick={() => setOpenId(resurfacedMemory.entry.id)}
          >
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="flex items-center gap-1.5 text-[0.72em] font-semibold uppercase tracking-wider text-accent">
                <Sparkles size={12} />
                {resurfacedMemory.label}
              </span>
              <span className="text-[0.72em] text-faint tabular">
                {resurfacedMemory.relativeTime}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MoodIcon mood={resurfacedMemory.entry.mood} size={15} />
              <span className="font-medium text-[0.92em] text-text truncate flex-1">
                {entryTitle(resurfacedMemory.entry)}
              </span>
              {resurfacedMemory.entry.favorite && (
                <Star size={11} className="fill-warning text-warning shrink-0" />
              )}
            </div>
            {resurfacedMemory.entry.body && (
              <p className="mt-1 text-[0.8em] text-muted line-clamp-2 leading-relaxed">
                {resurfacedMemory.entry.body
                  .replace(/^#+\s.*$/m, "")
                  .replace(/[#*_>`-]/g, "")
                  .trim()
                  .slice(0, 140)}
              </p>
            )}
            {resurfacedMemory.entry.images && resurfacedMemory.entry.images.length > 0 && (
              <div className="mt-2 flex gap-1 overflow-hidden">
                {resurfacedMemory.entry.images.slice(0, 3).map((im) => (
                  <img
                    key={im}
                    src={imageUrl(im)}
                    alt=""
                    className="h-8 w-12 rounded object-cover border hairline"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {groups.length === 0 ? (
          <Empty icon={<BookOpen size={28} />} title={q ? "No matching entries" : "Start your journal"} body="Capture what you experienced, thought about, or want to remember. Voice, prompts and templates make it quick." action={<button className="btn btn-sm" onClick={() => create()}>Write today's entry</button>} />
        ) : (
          groups.map(([day, list]) => (
            <div key={day} className="mb-3">
              <div className="section-title mb-1 px-1">
                {relativeDay(parseKey(day))} <span className="font-normal normal-case tracking-normal text-faint">· {format(parseKey(day), "d MMM yyyy")}</span>
              </div>
              <div className="flex flex-col gap-1">
                {list.map((e) => {
                  const j = journals.find((x) => x.id === e.journalId);
                  const entryImages = extractAllImages(e.body, e.images);
                  const { title: cleanTitle, excerpt: cleanExcerpt } = extractCleanTitleAndExcerpt(e.body, e.title, {
                    hasImages: entryImages.length > 0,
                    defaultImageTitle: "Photo Entry",
                    date: e.createdAt,
                  });
                  const thumb = entryImages.length > 0 ? entryImages[0] : null;

                  return (
                    <button
                      key={e.id}
                      data-entry-id={e.id}
                      className={cn(
                        "interactive-press flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        openId === e.id
                          ? "bg-accent/15 text-text ring-1 ring-accent/20"
                          : "hover:bg-surface-2/65 text-text active:scale-[0.99]"
                      )}
                      onClick={() => setOpenId(e.id)}
                    >
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {j && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border hairline shrink-0"
                              style={{
                                color: j.color,
                                borderColor: `${j.color}40`,
                                backgroundColor: `${j.color}15`,
                              }}
                            >
                              <BookOpen size={9} />
                              {j.name}
                            </span>
                          )}
                          <MoodIcon mood={e.mood} size={13} />
                          <span className="min-w-0 flex-1 truncate text-[0.93em] font-semibold text-text">
                            {cleanTitle}
                          </span>
                          {e.favorite && <Star size={11} className="fill-warning text-warning shrink-0" />}
                          {e.audio.length > 0 && <Volume2 size={11} className="text-faint shrink-0" />}
                          {e.source === "voice" && <Mic size={11} className="text-faint shrink-0" />}
                          <span className="text-[0.72em] text-faint tabular shrink-0">
                            {format(new Date(e.createdAt), "h:mm a")}
                          </span>
                        </div>
                        {cleanExcerpt && (
                          <div className="line-clamp-2 text-[0.8em] leading-snug text-muted">
                            {cleanExcerpt}
                          </div>
                        )}
                        {e.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-[0.7em] text-faint mt-0.5">
                            {e.tags.slice(0, 4).map((t) => (
                              <span key={t}>#{t}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {thumb && (
                        <div
                          className="relative shrink-0 self-start mt-0.5 group/thumb cursor-pointer"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            useUi.getState().openLightbox(entryImages, 0, cleanTitle);
                          }}
                          title="Inspect photo"
                        >
                          <img
                            src={imageUrl(thumb)}
                            alt=""
                            className="h-14 w-14 rounded-xl object-cover border hairline shadow-sm transition hover:scale-105"
                            onError={(ev) => {
                              (ev.currentTarget as HTMLElement).style.display = "none";
                            }}
                          />
                          {entryImages.length > 1 && (
                            <span className="absolute bottom-1 right-1 rounded-md bg-black/65 px-1 py-0.2 text-[9px] font-semibold text-white backdrop-blur-xs">
                              +{entryImages.length - 1}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative flex h-full w-full min-w-0 overflow-hidden">
      {twoPane ? (
        <>
          <div className="w-[310px] shrink-0 min-w-0 border-r hairline h-full flex flex-col">{list}</div>
          <div className="min-w-0 flex-1 h-full relative overflow-hidden">
            {openId && entries.some((e) => e.id === openId) ? (
              <JournalEditor entryId={openId} embedded onClose={() => setOpenId(null)} />
            ) : (
              <Empty icon={<BookOpen size={28} />} title="Select an entry" body="or press n to write a new one" />
            )}
          </div>
        </>
      ) : (
        <div className="relative w-full h-full min-w-0 overflow-hidden">
          {list}
          {openId && entries.some((e) => e.id === openId) && (
            <JournalEditor entryId={openId} onClose={() => setOpenId(null)} />
          )}
        </div>
      )}
      {manageJournals && <ManageJournals onClose={() => setManageJournals(false)} />}
    </div>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const pinHash = useSettings((s) => s.settings.journal.pinHash);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const submit = async () => {
    if ((await sha256Hex(pin)) === pinHash) onUnlock();
    else {
      setErr(true);
      setPin("");
    }
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center anim-fade">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Lock size={20} />
      </div>
      <div className="font-medium">Journal is locked</div>
      <input type="password" inputMode="numeric" autoFocus className={cn("input w-40 text-center tracking-[0.4em]", err && "!border-danger")} placeholder="PIN" value={pin} onChange={(e) => { setPin(e.target.value); setErr(false); }} onKeyDown={(e) => e.key === "Enter" && void submit()} />
      <button className="btn btn-primary btn-sm" onClick={() => void submit()}>
        <Unlock size={13} /> Unlock
      </button>
      {err && <div className="text-[0.8em] text-danger">Wrong PIN</div>}
    </div>
  );
}

function ManageJournals({ onClose }: { onClose: () => void }) {
  const { journals, addJournal, updateJournal, removeJournal } = useJournal();
  const ask = useUi((s) => s.ask);
  const [name, setName] = useState("");
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm anim-fade" onMouseDown={onClose}>
      <div className="glass anim-pop flex max-h-[85vh] w-full max-w-sm flex-col p-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <div className="font-semibold">Journals</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="scroll flex flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {journals.map((j) => (
            <div key={j.id} className="card flex items-center gap-2 px-2.5 py-1.5">
              <input type="color" className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0" value={j.color} onChange={(e) => updateJournal(j.id, { color: e.target.value })} />
              <select className="input !w-auto !py-0.5 text-[0.85em]" value={j.icon} onChange={(e) => updateJournal(j.id, { icon: e.target.value })}>
                {JOURNAL_ICONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <input className="min-w-0 flex-1 bg-transparent text-[0.9em] outline-none" value={j.name} onChange={(e) => updateJournal(j.id, { name: e.target.value })} />
              {j.id !== "default" && (
                <button className="btn btn-ghost btn-icon btn-sm text-danger" onClick={async () => (await ask({ title: `Remove ${j.name}?`, body: "Its entries move to the main journal.", confirmLabel: "Remove", danger: true })) && removeJournal(j.id)} aria-label="Remove journal">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex shrink-0 gap-2">
          <input className="input flex-1" placeholder="New journal (Work, Travel, Dreams…)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && (addJournal({ name }), setName(""))} />
          <button className="btn" disabled={!name.trim()} onClick={() => { addJournal({ name }); setName(""); }}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export function JournalEditor({ entryId, onClose, embedded }: { entryId: string; onClose?: () => void; embedded?: boolean }) {
  const entry = useJournal((s) => s.entries.find((e) => e.id === entryId));
  const journals = useJournal((s) => s.journals);
  const { setBody, updateEntry, removeEntry, toggleFavorite, addTemplate, removeAttachment } = useJournal();
  const toast = useUi((s) => s.toast);
  const ask = useUi((s) => s.ask);
  const promptUser = useUi((s) => s.promptUser);
  const [body, setBodyLocal] = useState(entry?.body ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(true);
  const ta = useRef<HTMLTextAreaElement>(null);
  const prevIdRef = useRef(entryId);
  const currentBodyRef = useRef(body);
  const currentSavedRef = useRef(saved);
  currentBodyRef.current = body;
  currentSavedRef.current = saved;

  useEffect(() => {
    if (prevIdRef.current !== entryId) {
      if (!currentSavedRef.current && prevIdRef.current) {
        setBody(prevIdRef.current, currentBodyRef.current);
      }
      prevIdRef.current = entryId;
      setBodyLocal(entry?.body ?? "");
      setTitle(entry?.title ?? "");
      setSaved(true);
      setPreview(false);
    }
  }, [entryId, entry?.body, entry?.title, setBody]);

  useEffect(() => () => {
    if (!currentSavedRef.current && prevIdRef.current) {
      setBody(prevIdRef.current, currentBodyRef.current);
    }
  }, [setBody]);

  const persist = useMemo(() => debounce((id: string, b: string) => { setBody(id, b); setSaved(true); }, 350), [setBody]);
  const onChange = (v: string) => {
    setBodyLocal(v);
    setSaved(false);
    persist(entryId, v);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !embedded) {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const el = ta.current;
    if (el) {
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const insert = useCallback((before: string, after = "", placeholder = "") => {
    const el = ta.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = body.slice(s, e) || placeholder;
    onChange(body.slice(0, s) + before + sel + after + body.slice(e));
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
    onChange(body.slice(0, lineStart) + prefix + body.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + prefix.length;
    });
  }, [body]);
  const addImages = async (files: File[]) => {
    for (const f of files) {
      try {
        const name = await storeImageBlob(f);
        insert(`\n![${f.name || "photo"}](dayflit-image://${name})\n`);
      } catch (e) {
        toast({ title: "Could not save image", body: String(e), kind: "error" });
      }
    }
  };

  if (!entry) return null;
  const html = renderMarkdown(body, imageUrl);
  const words = wordCount(body);

  return (
    <div className={cn("flex h-full flex-col min-w-0 overflow-hidden", !embedded && "absolute inset-0 z-50 bg-bg/95 backdrop-blur-sm anim-fade")} onDrop={(e) => { const imgs = imagesFromDataTransfer(e.dataTransfer); if (imgs.length) { e.preventDefault(); void addImages(imgs); } }} onDragOver={(e) => e.preventDefault()}>
      <DocumentCrossfade docKey={entryId} className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 pt-2.5 flex-nowrap min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar">
          {!embedded && onClose && (
            <button
              className="btn btn-ghost btn-sm gap-1 !px-2 text-muted hover:text-text shrink-0"
              onClick={onClose}
              aria-label="Back to entries"
              title="Back to entries"
            >
              <ChevronLeft size={16} />
              <span className="text-[12px] font-medium hidden sm:inline">Journal</span>
            </button>
          )}
          <input type="date" className="input !w-auto !py-1 text-[0.82em] shrink-0" value={entry.date} onChange={(e) => e.target.value && updateEntry(entry.id, { date: e.target.value })} />
          {journals.length > 1 && (
            <select className="input max-w-[120px] !w-auto !py-1 text-[0.82em] truncate shrink-0" value={entry.journalId} onChange={(e) => updateEntry(entry.id, { journalId: e.target.value })}>
              {journals.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex-1 min-w-2" />
          <button className={cn("btn btn-ghost btn-icon btn-sm shrink-0", entry.favorite ? "text-warning" : "text-muted")} onClick={() => toggleFavorite(entry.id)} aria-label="Favorite">
            <Star size={14} className={entry.favorite ? "fill-warning" : ""} />
          </button>
          <button className={cn("btn btn-ghost btn-icon btn-sm shrink-0 text-muted", preview && "text-accent")} onClick={() => setPreview((p) => !p)} aria-label={preview ? "Edit" : "Preview"}>
            {preview ? <Pencil size={14} /> : <Eye size={14} />}
          </button>
          {onClose && (
            <button className="btn btn-ghost btn-icon btn-sm shrink-0 text-muted" onClick={onClose} aria-label="Close">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-3 pt-1.5 flex-nowrap min-w-0">
          <input className="input min-w-0 flex-1 truncate !bg-transparent !border-transparent !px-1 text-[1.05em] font-semibold" placeholder={entryTitle(entry) === "Untitled entry" ? "Give it a title (optional)" : entryTitle(entry)} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== entry.title && updateEntry(entry.id, { title })} />
          <div className="flex shrink-0 items-center gap-0.5">
          {MOODS.map((m) => {
            const Icon = MOOD_ICONS[m.value - 1];
            const on = entry.mood === m.value;
            return (
              <button key={m.value} className={cn("btn btn-ghost btn-icon btn-sm", on ? "" : "text-faint")} style={on ? { color: MOOD_COLORS[m.value - 1] } : undefined} onClick={() => updateEntry(entry.id, { mood: on ? null : m.value })} aria-label={m.label}>
                <Icon size={15} />
              </button>
            );
          })}
        </div>
      </div>
      {!preview && (
        <div className="flex items-center gap-0.5 px-3 pt-1 flex-nowrap min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar">
          <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("**", "**", "bold")} aria-label="Bold">
            <Bold size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={() => linePrefix("## ")} aria-label="Heading">
            <Heading size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={() => linePrefix("- ")} aria-label="List">
            <List size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("[", "](https://)", "link")} aria-label="Link">
            <Link2 size={13} />
          </button>
          <label className="btn btn-ghost btn-icon btn-sm cursor-pointer text-muted shrink-0" aria-label="Add photo">
            <ImagePlus size={13} />
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && void addImages(Array.from(e.target.files))} />
          </label>
          <button className="btn btn-ghost btn-icon btn-sm text-muted shrink-0" onClick={() => void ipc.showVoice("toggle")} aria-label="Dictate">
            <Mic size={13} />
          </button>
          <div className="flex-1 min-w-[8px]" />
          <button className="btn btn-ghost btn-sm text-[0.8em] text-muted shrink-0" onClick={() => insert(`${JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)]}\n\n`)}>
            <Sparkles size={12} /> Prompt
          </button>
        </div>
      )}
      {entry.images && entry.images.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b hairline bg-surface-2/20">
          <span className="text-[0.7em] font-medium text-faint uppercase tracking-wider shrink-0">Attachments:</span>
          {entry.images.map((im) => (
            <div key={im} className="flex items-center gap-1.5 rounded-md bg-surface-2/70 px-2 py-0.5 text-[0.75em] text-muted border hairline">
              <img
                src={imageUrl(im)}
                alt=""
                className="h-4 w-4 rounded object-cover shrink-0 cursor-pointer hover:scale-110 transition"
                onClick={() => useUi.getState().openLightbox(entry.images, entry.images.indexOf(im), entry.title || "Journal Photo")}
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
              <span
                className="max-w-[100px] truncate cursor-pointer hover:underline"
                onClick={() => useUi.getState().openLightbox(entry.images, entry.images.indexOf(im), entry.title || "Journal Photo")}
              >
                {im}
              </span>
              <button
                className="btn btn-ghost btn-icon btn-sm !p-0.5 text-faint hover:text-danger"
                onClick={() => {
                  const safe = im.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                  const re = new RegExp(`!\\[[^\\]]*\\]\\(dayflit-image://${safe}\\)\\s*`, "g");
                  const next = body.replace(re, "").trim();
                  setBodyLocal(next);
                  setSaved(true);
                  removeAttachment(entry.id, im);
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
                const allImgs = entry.images.length > 0 ? entry.images : [t.src];
                const cleanSrc = decodeURIComponent(t.src);
                const clickedIdx = entry.images.findIndex((im) => cleanSrc.includes(im.replace(/^dayflit-?image:\/\//, "")));
                useUi.getState().openLightbox(allImgs, clickedIdx >= 0 ? clickedIdx : 0, entry.title || "Journal Photo");
              } else if (t instanceof HTMLInputElement && t.dataset.line) {
                onChange(toggleChecklistLine(body, parseInt(t.dataset.line, 10)));
              } else if (t instanceof HTMLAnchorElement && t.href) {
                e.preventDefault();
                void openExternal(t.href);
              }
            }}
          />
        ) : (
          <textarea ref={ta} className="input h-full min-h-[200px] w-full !bg-transparent !border-transparent !px-1 font-[inherit] text-[0.98em] leading-relaxed" placeholder="What happened? What did you think, learn, feel?" value={body} onChange={(e) => onChange(e.target.value)} onPaste={async (e) => { const imgs = imagesFromDataTransfer(e.clipboardData); if (imgs.length) { e.preventDefault(); await addImages(imgs); } }} onKeyDown={(e) => { if (e.ctrlKey && e.key === "b") { e.preventDefault(); insert("**", "**", "bold"); } }} spellCheck />
        )}
        {entry.audio.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {entry.audio.map((a) => (
              <div key={a} className="flex items-center gap-2 rounded-xl bg-surface-2/40 p-2 border hairline">
                <audio controls src={imageUrl(a)} className="h-9 min-w-0 flex-1" preload="none" />
                <button
                  className="btn btn-ghost btn-icon btn-sm text-faint hover:text-danger shrink-0"
                  onClick={() => {
                    removeAttachment(entry.id, a, "audio");
                  }}
                  title="Remove voice memo"
                  aria-label="Remove voice memo"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <DailyChronicleFootnote
          targetDate={entry.date}
          onWeave={(md) => insert("\n\n" + md + "\n")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t hairline px-3 py-1.5 text-[0.75em] text-faint">
        <span className="shrink-0">{saved ? `Saved · ${timeAgo(entry.updatedAt)}` : "Saving…"}</span>
        <span className="shrink-0">{words} words</span>
        {entry.prompt && <span className="max-w-[120px] truncate">prompt</span>}
        {entry.context?.app && <span className="max-w-[140px] truncate">captured in {entry.context.app}</span>}
        <div className="flex-1 min-w-[8px]" />
        <button
          className="btn btn-ghost btn-sm shrink-0"
          onClick={async () => {
            const name = await promptUser({
              title: "Save as template",
              body: "Use this entry as a reusable template for future journal entries.",
              placeholder: "Template name (e.g. Daily Reflection)",
              confirmLabel: "Save",
            });
            if (name && name.trim()) {
              addTemplate(name.trim(), body);
            }
          }}
          aria-label="Save as template"
        >
          <LayoutTemplate size={13} />
        </button>
        <HoldToDeleteButton
          ariaLabel="Delete entry"
          title="Hold to delete entry"
          confirmFallback={async () => {
            if (!(await ask({ title: "Delete this entry?", body: "Are you sure you want to delete this journal entry?", confirmLabel: "Delete", danger: true }))) return;
            removeEntry(entry.id);
            onClose?.();
            toast({ title: "Entry deleted", kind: "info" });
          }}
          onDelete={() => {
            removeEntry(entry.id);
            onClose?.();
            toast({ title: "Entry deleted", kind: "info" });
          }}
        />
      </div>
      </DocumentCrossfade>
    </div>
  );
}

function DailyChronicleFootnote({
  targetDate,
  onWeave,
}: {
  targetDate: string;
  onWeave: (md: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tasks = useTasks((s) => s.tasks);
  const focusHistory = useFocus((s) => s.history);
  const habits = useHabits((s) => s.habits);
  const notes = useNotes((s) => s.notes);
  const clips = useClips((s) => s.clips);
  const toast = useUi((s) => s.toast);

  const chronicle = useMemo(
    () => aggregateDayChronicle(targetDate, { tasks, focusHistory, habits, notes, clips }),
    [targetDate, tasks, focusHistory, habits, notes, clips]
  );

  return (
    <div className="mt-4 rounded-xl border hairline bg-surface-2/30 p-2.5 transition-all">
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-2 text-left cursor-pointer hover:opacity-85 flex-1 min-w-0"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <Activity size={13} className="text-accent shrink-0" />
          <span className="text-[0.78em] font-semibold text-text uppercase tracking-wider shrink-0">
            Day Chronicle
          </span>
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 overflow-hidden text-[0.72em] text-faint">
            {chronicle.totalFocusMinutes > 0 && (
              <span className="chip chip-accent !py-0 !text-[0.88em]">{chronicle.totalFocusMinutes}m focus</span>
            )}
            {chronicle.tasksCompletedCount > 0 && (
              <span className="chip chip-success !py-0 !text-[0.88em]">{chronicle.tasksCompletedCount} tasks</span>
            )}
            {chronicle.habitsDoneCount > 0 && (
              <span className="chip chip-warning !py-0 !text-[0.88em]">{chronicle.habitsDoneCount} habits</span>
            )}
            {chronicle.notesUpdatedCount > 0 && (
              <span className="chip !py-0 !text-[0.88em]">{chronicle.notesUpdatedCount} notes</span>
            )}
            {chronicle.clipsCount > 0 && (
              <span className="chip !py-0 !text-[0.88em]">{chronicle.clipsCount} clips</span>
            )}
            {!chronicle.hasActivity && <span>No activity tracked</span>}
          </div>
          {open ? <ChevronUp size={13} className="text-muted shrink-0 ml-auto" /> : <ChevronDown size={13} className="text-muted shrink-0 ml-auto" />}
        </button>

        {chronicle.hasActivity && (
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-1 text-accent hover:bg-accent/15 text-[0.78em] font-medium shrink-0"
            onClick={() => {
              onWeave(formatChronicleMarkdown(chronicle));
            }}
            title="Weave daily activity chronicle into journal entry body"
          >
            <Wand2 size={12} />
            <span>Weave into Entry</span>
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 pt-2.5 border-t hairline flex flex-col gap-1.5 anim-fade">
          {chronicle.timeline.length === 0 ? (
            <div className="text-[0.78em] text-faint py-1">No tracked activity recorded on this date.</div>
          ) : (
            chronicle.timeline.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-[0.78em] py-0.5">
                <span className="tabular text-faint text-[0.88em] w-14 shrink-0">{item.timeFormatted}</span>
                <span className="text-text font-medium truncate flex-1">{item.title}</span>
                {item.detail && <span className="text-muted text-[0.88em] truncate">{item.detail}</span>}
                {item.badge && <span className="chip !py-0 !text-[0.82em] uppercase font-semibold">{item.badge}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function JournalTodayCard() {
  const entries = useJournal((s) => s.entries);
  const navigate = useUi((s) => s.navigate);
  const show = useSettings((s) => s.settings.journal.showOnToday);
  const key = dateKey();
  const todays = entriesOn(entries, key);
  const prompt = promptForDay(key);
  const memory = findResurfacedMemory(entries);
  if (!show) return null;
  return (
    <div className="card mt-4 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="section-title">Journal</div>
        <button className="btn btn-ghost btn-sm text-muted" onClick={() => navigate("journal")}>
          Open
        </button>
      </div>
      {todays.length > 0 ? (
        <div className="mt-1 flex flex-col gap-1">
          {todays.slice(0, 2).map((e) => {
            const count = wordCount(e.body);
            const hasImgs = Array.isArray(e.images) && e.images.length > 0;
            return (
              <button key={e.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-2/60" onClick={() => navigate("journal", e.id)}>
                <MoodIcon mood={e.mood} />
                <span className="min-w-0 flex-1 truncate text-[0.9em]">{entryTitle(e)}</span>
                <span className="text-[0.72em] text-faint">{count > 0 ? `${count} words` : hasImgs ? "Photo" : "0 words"}</span>
              </button>
            );
          })}
          <button className="btn btn-ghost btn-sm self-start text-muted" onClick={() => navigate("journal", "new")}>
            <Plus size={12} /> Add another
          </button>
        </div>
      ) : (
        <button className="mt-1 flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-2/60" onClick={() => navigate("journal", `prompt:${prompt}`)}>
          <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-[0.88em] text-muted">{prompt}</span>
        </button>
      )}
      {memory && (
        <div className="mt-1 text-[0.75em] text-faint">
          {memory.label} · {entryTitle(memory.entry)}
        </div>
      )}
    </div>
  );
}

export { Check };
