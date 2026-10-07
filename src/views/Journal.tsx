import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMonths, format } from "date-fns";
import { Bold, BookOpen, Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, Eye, Heading, ImagePlus, Link2, List, Lock, Mic, Pencil, Plus, Search, Sparkles, Star, Trash2, X, LayoutTemplate, Frown, Meh, Smile, Laugh, Annoyed, Unlock, Volume2 } from "lucide-react";
import { useJournal, entriesOn, entryTitle, journalStreak, onThisDay, wordCount, daysWithEntries, monthGrid } from "@/stores/journal";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { JOURNAL_TEMPLATES, JOURNAL_PROMPTS, MOODS, JOURNAL_ICONS, promptForDay } from "@/lib/journalContent";
import { HabitIcon } from "@/components/icons";
import { Empty } from "@/components/Empty";
import { renderMarkdown, toggleChecklistLine } from "@/lib/markdown";
import { imageUrl, imagesFromDataTransfer, storeImageBlob } from "@/lib/imageUrl";
import { openExternal } from "@/lib/open";
import { dateKey, parseKey, relativeDay, timeAgo } from "@/lib/dates";
import { cn, debounce } from "@/lib/ids";
import { useElementWidth } from "@/lib/useElementWidth";
import { sha256Hex } from "@/lib/crypto";
import { ipc } from "@/lib/ipc";
import type { JournalEntry } from "@/lib/types";

const MOOD_ICONS = [Annoyed, Frown, Meh, Smile, Laugh];
const MOOD_COLORS = ["#ef5b6b", "#fb923c", "#9ca3af", "#34d399", "#60a5fa"];

export function MoodIcon({ mood, size = 14 }: { mood: number | null; size?: number }) {
  if (!mood) return null;
  const Icon = MOOD_ICONS[mood - 1] ?? Meh;
  return <Icon size={size} color={MOOD_COLORS[mood - 1]} />;
}

export function JournalView() {
  const { journals, entries, templates, addEntry, unlockedUntil, setUnlocked } = useJournal();
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
  const twoPane = width >= 640;
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
  const memories = useMemo(() => onThisDay(entries), [entries]);
  const dayCounts = useMemo(() => daysWithEntries(entries, journalId), [entries, journalId]);
  const prompt = promptForDay(todayKey);

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

  const list = (
    <div className="flex h-full min-w-0 flex-col">
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
        <button className={cn("btn btn-ghost btn-icon btn-sm", showCalendar ? "text-accent" : "text-muted")} onClick={() => setShowCalendar((v) => !v)} aria-label="Browse by date" data-tip="Browse by date">
          <CalendarIcon size={15} />
        </button>
        <button className={cn("btn btn-ghost btn-icon btn-sm", showTemplates ? "text-accent" : "text-muted")} onClick={() => setShowTemplates((v) => !v)} aria-label="Templates" data-tip="Templates">
          <LayoutTemplate size={15} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => create()}>
          <Plus size={14} /> Write
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2 max-h-[120px] overflow-y-auto overflow-x-hidden scroll">
        <button className={cn("chip shrink-0 cursor-pointer", !journalId && "chip-accent")} onClick={() => setJournalId(null)}>
          All
        </button>
        <button className="chip shrink-0 cursor-pointer" onClick={() => setManageJournals(true)} aria-label="Manage journals">
          <Plus size={10} />
        </button>
        {journals.map((j) => (
          <button
            key={j.id}
            className={cn("chip shrink-0 cursor-pointer gap-1", journalId === j.id && "chip-accent")}
            onClick={() => setJournalId(journalId === j.id ? null : j.id)}
            aria-label={j.name}
          >
            <span style={{ color: j.color }} className="shrink-0">
              <HabitIcon name={j.icon} size={10} />
            </span>
            <span className="max-w-[130px] truncate">{j.name}</span>
          </button>
        ))}
        <button
          className={cn("chip shrink-0 cursor-pointer gap-1", favOnly && "chip-warning")}
          onClick={() => setFavOnly((v) => !v)}
          aria-label="Favorites"
        >
          <Star size={10} /> Favorites
        </button>
        {tags.slice(0, 12).map((t) => (
          <button
            key={t}
            className={cn("chip shrink-0 cursor-pointer", tag === t && "chip-accent")}
            onClick={() => setTag(tag === t ? null : t)}
            aria-label={`Tag ${t}`}
          >
            #{t}
          </button>
        ))}
      </div>

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
        {!q && !dayFilter && !favOnly && !tag && memories.length > 0 && (
          <div className="card mb-2 px-3 py-2">
            <div className="mb-1 text-[0.72em] uppercase tracking-wider text-faint">On this day</div>
            {memories.slice(0, 3).map((m) => (
              <div key={m.label} className="py-0.5">
                <span className="text-[0.75em] text-muted">{m.label}</span>
                {m.entries.slice(0, 2).map((e) => (
                  <button key={e.id} className="block w-full truncate text-left text-[0.88em] hover:text-accent" onClick={() => setOpenId(e.id)}>
                    {entryTitle(e)}
                  </button>
                ))}
              </div>
            ))}
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
                  return (
                    <button key={e.id} className={cn("card card-hover flex flex-col gap-0.5 px-3 py-2 text-left", openId === e.id && "!border-accent/50 !bg-accent/10")} onClick={() => setOpenId(e.id)} style={j ? { borderLeft: `3px solid ${j.color}` } : undefined}>
                      <div className="flex items-center gap-1.5">
                        <MoodIcon mood={e.mood} />
                        <span className="min-w-0 flex-1 truncate text-[0.93em] font-medium">{entryTitle(e)}</span>
                        {e.favorite && <Star size={11} className="fill-warning text-warning" />}
                        {e.audio.length > 0 && <Volume2 size={11} className="text-faint" />}
                        {e.source === "voice" && <Mic size={11} className="text-faint" />}
                        <span className="text-[0.72em] text-faint">{format(new Date(e.createdAt), "h:mm a")}</span>
                      </div>
                      {e.body && <div className="line-clamp-2 text-[0.8em] leading-snug text-muted">{e.body.replace(/^#+\s.*$/m, "").replace(/[#*_>`-]/g, "").replace(/\s+/g, " ").trim().slice(0, 160)}</div>}
                      {(e.images.length > 0 || e.tags.length > 0 || j) && (
                        <div className="mt-0.5 flex items-center gap-2 text-[0.72em] text-faint">
                          {j && journals.length > 1 && <span>{j.name}</span>}
                          {e.images.length > 0 && (
                            <span className="flex gap-1">
                              {e.images.slice(0, 4).map((im) => (
                                <img
                                  key={im}
                                  src={imageUrl(im)}
                                  alt=""
                                  className="h-8 w-8 rounded object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = "none";
                                  }}
                                />
                              ))}
                            </span>
                          )}
                          {e.tags.slice(0, 4).map((t) => (
                            <span key={t}>#{t}</span>
                          ))}
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
    <div ref={ref} className="relative flex h-full">
      {twoPane ? (
        <>
          <div className="w-[300px] shrink-0 border-r hairline">{list}</div>
          <div className="min-w-0 flex-1">{openId && entries.some((e) => e.id === openId) ? <JournalEditor key={openId} entryId={openId} embedded onClose={() => setOpenId(null)} /> : <Empty icon={<BookOpen size={28} />} title="Select an entry" body="or press n to write a new one" />}</div>
        </>
      ) : (
        <>
          <div className="w-full">{list}</div>
          {openId && entries.some((e) => e.id === openId) && <JournalEditor key={openId} entryId={openId} onClose={() => setOpenId(null)} />}
        </>
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
      <div className="glass anim-pop w-full max-w-sm p-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Journals</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
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
        <div className="mt-2 flex gap-2">
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
  const { setBody, updateEntry, removeEntry, toggleFavorite, addTemplate } = useJournal();
  const toast = useUi((s) => s.toast);
  const ask = useUi((s) => s.ask);
  const [body, setBodyLocal] = useState(entry?.body ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(true);
  const ta = useRef<HTMLTextAreaElement>(null);
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
    // Focus with the caret at the end so prompts/templates are continued, not overwritten.
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
    <div className={cn("flex h-full flex-col", !embedded && "absolute inset-0 z-50 bg-bg/95 backdrop-blur-sm anim-fade")} onDrop={(e) => { const imgs = imagesFromDataTransfer(e.dataTransfer); if (imgs.length) { e.preventDefault(); void addImages(imgs); } }} onDragOver={(e) => e.preventDefault()}>
      <div className="flex items-center gap-1 px-3 pt-2.5">
        <input type="date" className="input !w-auto !py-1 text-[0.82em]" value={entry.date} onChange={(e) => e.target.value && updateEntry(entry.id, { date: e.target.value })} />
        {journals.length > 1 && (
          <select className="input !w-auto !py-1 text-[0.82em]" value={entry.journalId} onChange={(e) => updateEntry(entry.id, { journalId: e.target.value })}>
            {journals.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <button className={cn("btn btn-ghost btn-icon btn-sm", entry.favorite ? "text-warning" : "text-muted")} onClick={() => toggleFavorite(entry.id)} aria-label="Favorite" data-tip="Favorite">
          <Star size={14} className={entry.favorite ? "fill-warning" : ""} />
        </button>
        <button className={cn("btn btn-ghost btn-icon btn-sm text-muted", preview && "text-accent")} onClick={() => setPreview((p) => !p)} aria-label={preview ? "Edit" : "Preview"} data-tip={preview ? "Edit" : "Preview"}>
          {preview ? <Pencil size={14} /> : <Eye size={14} />}
        </button>
        {onClose && (
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 px-3 pt-1.5">
        <input className="input !bg-transparent !border-transparent !px-1 text-[1.05em] font-semibold" placeholder={entryTitle(entry) === "Untitled entry" ? "Give it a title (optional)" : entryTitle(entry)} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== entry.title && updateEntry(entry.id, { title })} />
        <div className="flex items-center gap-0.5">
          {MOODS.map((m) => {
            const Icon = MOOD_ICONS[m.value - 1];
            const on = entry.mood === m.value;
            return (
              <button key={m.value} className={cn("btn btn-ghost btn-icon btn-sm", on ? "" : "text-faint")} style={on ? { color: MOOD_COLORS[m.value - 1] } : undefined} onClick={() => updateEntry(entry.id, { mood: on ? null : m.value })} aria-label={m.label} data-tip={m.label}>
                <Icon size={15} />
              </button>
            );
          })}
        </div>
      </div>
      {!preview && (
        <div className="flex items-center gap-0.5 px-3 pt-1">
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("**", "**", "bold")} aria-label="Bold" data-tip="Bold">
            <Bold size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => linePrefix("## ")} aria-label="Heading" data-tip="Heading">
            <Heading size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => linePrefix("- ")} aria-label="List" data-tip="List">
            <List size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("[", "](https://)", "link")} aria-label="Link" data-tip="Link">
            <Link2 size={13} />
          </button>
          <label className="btn btn-ghost btn-icon btn-sm cursor-pointer text-muted" aria-label="Add photo" data-tip="Add photo">
            <ImagePlus size={13} />
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && void addImages(Array.from(e.target.files))} />
          </label>
          <button className="btn btn-ghost btn-icon btn-sm text-muted" onClick={() => void ipc.showVoice("toggle")} aria-label="Dictate" data-tip="Dictate">
            <Mic size={13} />
          </button>
          <div className="flex-1" />
          <button className="btn btn-ghost btn-sm text-[0.8em] text-muted" onClick={() => insert(`${JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)]}\n\n`)}>
            <Sparkles size={12} /> Prompt
          </button>
        </div>
      )}
      <div className="scroll flex-1 px-3 pb-3 pt-2">
        {preview ? (
          <div className="prose text-[0.95em]" dangerouslySetInnerHTML={{ __html: html || "<p class='text-faint'>Nothing here yet.</p>" }} onClick={(e) => { const t = e.target as HTMLElement; if (t instanceof HTMLInputElement && t.dataset.line) onChange(toggleChecklistLine(body, parseInt(t.dataset.line, 10))); else if (t instanceof HTMLAnchorElement && t.href) { e.preventDefault(); void openExternal(t.href); } }} />
        ) : (
          <textarea ref={ta} className="input h-full min-h-[200px] w-full !bg-transparent !border-transparent !px-1 font-[inherit] text-[0.98em] leading-relaxed" placeholder="What happened? What did you think, learn, feel?" value={body} onChange={(e) => onChange(e.target.value)} onPaste={async (e) => { const imgs = imagesFromDataTransfer(e.clipboardData); if (imgs.length) { e.preventDefault(); await addImages(imgs); } }} onKeyDown={(e) => { if (e.ctrlKey && e.key === "b") { e.preventDefault(); insert("**", "**", "bold"); } }} spellCheck />
        )}
        {entry.audio.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {entry.audio.map((a) => (
              <audio key={a} controls src={imageUrl(a)} className="h-9 w-full" preload="none" />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t hairline px-3 py-1.5 text-[0.75em] text-faint">
        <span>{saved ? `Saved · ${timeAgo(entry.updatedAt)}` : "Saving…"}</span>
        <span>{words} words</span>
        {entry.prompt && <span className="truncate">prompt</span>}
        {entry.context?.app && <span className="truncate">captured in {entry.context.app}</span>}
        <div className="flex-1" />
        <button className="btn btn-ghost btn-sm" onClick={async () => { const name = window.prompt?.("Template name") ?? ""; if (name) { addTemplate(name, body); toast({ title: "Template saved", kind: "success" }); } }} aria-label="Save as template" data-tip="Save as template">
          <LayoutTemplate size={13} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-danger" onClick={async () => { if (body.trim().length > 40 && !(await ask({ title: "Delete this entry?", confirmLabel: "Delete", danger: true }))) return; removeEntry(entry.id); onClose?.(); }} aria-label="Delete entry">
          <Trash2 size={13} />
        </button>
      </div>
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
  const memories = onThisDay(entries);
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
          {todays.slice(0, 2).map((e) => (
            <button key={e.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-2/60" onClick={() => navigate("journal", e.id)}>
              <MoodIcon mood={e.mood} />
              <span className="min-w-0 flex-1 truncate text-[0.9em]">{entryTitle(e)}</span>
              <span className="text-[0.72em] text-faint">{wordCount(e.body)} words</span>
            </button>
          ))}
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
      {memories.length > 0 && (
        <div className="mt-1 text-[0.75em] text-faint">
          On this day: {memories[0].label} · {entryTitle(memories[0].entries[0])}
        </div>
      )}
    </div>
  );
}

export { Check };
