import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, CalendarDays, Calculator, CheckSquare, Clipboard, Command, Compass, Play, Repeat, Search, StickyNote, X, Zap } from "lucide-react";
import Fuse from "fuse.js";
import { commandList, type CommandDef, type PaletteAction, type PaletteData } from "@/lib/actions";
import { parseQuickAdd } from "@/lib/nlp";
import { formatDue } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { parseCalculatorQuery, type CalculatorResult } from "@/lib/calculator";
import { Kbd } from "./Kbd";
import { cn } from "@/lib/ids";
import { ipc, type RawClip } from "@/lib/ipc";
import { extractCleanTitleAndExcerpt } from "@/lib/markdown";

export type PaletteMode = "commands" | "search" | "task" | "note" | "capture" | "voice" | "journal";

interface Item {
  id: string;
  kind: "command" | "task" | "note" | "journal" | "habit" | "clip" | "event" | "life-domain" | "life-goal" | "life-project" | "create-task" | "create-note";
  label: string;
  hint?: string;
  section: string;
  icon: React.ReactNode;
  action: PaletteAction;
  shortcut?: string;
  done?: boolean;
}

export function PaletteCore({ mode: initialMode, data, clip, onAction, onClose, floating, refreshData }: {
  mode: PaletteMode;
  data: PaletteData | null;
  clip?: RawClip | null;
  onAction: (a: PaletteAction) => void;
  onClose: () => void;
  floating?: boolean;
  refreshData?: () => void;
}) {
  const [mode, setMode] = useState<PaletteMode>(initialMode);
  const [q, setQ] = useState(initialMode === "task" ? "+" : "");
  const [sel, setSel] = useState(0);
  const [noteText, setNoteText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(initialMode);
    setQ(initialMode === "task" ? "+" : "");
    setNoteText("");
    setSel(0);
    refreshData?.();
    const t = window.setTimeout(() => (initialMode === "note" ? noteRef.current : inputRef.current)?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [initialMode]);

  const commands = useMemo(() => commandList(data), [data]);
  const fuseCommands = useMemo(() => new Fuse(commands, { keys: ["label", "keywords", "hint"], threshold: 0.3, ignoreLocation: true, minMatchCharLength: 2 }), [commands]);
  const fuseData = useMemo(() => {
    const docs = [
      ...(data?.tasks ?? []).map((t) => ({ kind: "task" as const, id: t.id, title: t.title, body: t.notes ?? "", tags: t.tags, done: t.status === "done", sub: [t.list, t.due ? formatDue(t.due, t.hasTime) : ""].filter(Boolean).join(" · ") })),
      ...(data?.notes ?? []).map((n) => {
        const { title, excerpt } = extractCleanTitleAndExcerpt(n.body, n.title, { defaultImageTitle: "Image Note" });
        return { kind: "note" as const, id: n.id, title, body: n.body, tags: n.tags, done: false, sub: excerpt ? `Note · ${excerpt.slice(0, 50)}` : "Note" };
      }),
      ...(data?.events ?? []).map((e) => ({ kind: "event" as const, id: e.id, title: e.title, body: e.body, tags: [] as string[], done: false, sub: e.when, url: e.url })),
      ...(data?.journal ?? []).map((j) => {
        const { title, excerpt } = extractCleanTitleAndExcerpt(j.body, j.title, { defaultImageTitle: "Photo Entry" });
        return { kind: "journal" as const, id: j.id, title, body: j.body, tags: j.tags, done: false, sub: excerpt ? `Journal · ${j.date} · ${excerpt.slice(0, 40)}` : `Journal · ${j.date}` };
      }),
      ...(data?.habits ?? []).map((h) => ({ kind: "habit" as const, id: h.id, title: h.name, body: "", tags: [], done: h.doneToday, sub: "Habit" })),
      ...(data?.clips ?? []).map((c) => ({ kind: "clip" as const, id: c.id, title: c.text.slice(0, 80) || "Image clip", body: c.text.slice(0, 1500), tags: [], done: false, sub: `Clip · ${c.app}` })),
      ...(data?.domains ?? []).map((d) => ({ kind: "life-domain" as const, id: d.id, title: d.name, body: "", tags: [], done: false, sub: `Life Pillar · Score ${d.score}/10` })),
      ...(data?.goals ?? []).map((g) => {
        const domName = data?.domains?.find((d) => d.id === g.domainId)?.name;
        return { kind: "life-goal" as const, id: g.id, title: g.title, body: "", tags: [], done: false, sub: domName ? `${domName} · Goal` : "Life Goal" };
      }),
      ...(data?.projects ?? []).map((p) => {
        const domName = data?.domains?.find((d) => d.id === p.domainId)?.name;
        return { kind: "life-project" as const, id: p.id, title: p.title, body: "", tags: [], done: false, sub: domName ? `${domName} · Project` : "Life Project" };
      }),
    ];
    return new Fuse(docs, { keys: [{ name: "title", weight: 0.6 }, { name: "body", weight: 0.25 }, { name: "tags", weight: 0.15 }], threshold: 0.38, ignoreLocation: true, minMatchCharLength: 2 });
  }, [data]);

  const isTaskEntry = q.startsWith("+");
  const isCommandEntry = q.startsWith(">");
  const query = isTaskEntry || isCommandEntry ? q.slice(1).trim() : q.trim();
  const parsed = useMemo(() => (isTaskEntry && query ? parseQuickAdd(query, { knownLists: data?.lists }) : null), [isTaskEntry, query, data?.lists]);
  const calcResult = useMemo(() => parseCalculatorQuery(q.trim()), [q]);

  const items: Item[] = useMemo(() => {
    const cmdItem = (c: CommandDef): Item => ({ id: c.id, kind: "command", label: c.label, hint: c.hint, section: c.section, icon: c.id.includes("note") ? <StickyNote size={15} /> : c.id === "capture" ? <Clipboard size={15} /> : sectionIcon(c.section), action: c.action, shortcut: c.shortcut });
    if (isTaskEntry) {
      return query ? [{ id: "create-task", kind: "create-task", label: `Add task “${parsed?.title || query}”`, section: "Create", icon: <CheckSquare size={15} />, action: { type: "add-task", text: query } }] : [];
    }
    if (isCommandEntry || mode === "commands") {
      if (!query) return commands.map(cmdItem);
      return fuseCommands.search(query).map((r) => cmdItem(r.item));
    }
    // search mode: data results + commands + create options
    if (!query) {
      const recent = (data?.tasks ?? []).filter((t) => t.status === "open").slice(0, 6).map<Item>((t) => ({ id: t.id, kind: "task", label: t.title, hint: t.due ? formatDue(t.due, t.hasTime) : t.list, section: "Open tasks", icon: <CheckSquare size={15} />, action: { type: "open-task", id: t.id } }));
      return [...recent, ...commands.slice(0, 8).map(cmdItem)];
    }
    const calcItems: Item[] = calcResult
      ? [
          {
            id: "calculator-result",
            kind: "command",
            label: `= ${calcResult.result}`,
            hint: calcResult.detail || calcResult.query,
            section: "Calculator",
            icon: <Calculator size={15} className="text-accent" />,
            action: { type: "system-action", id: "copy-calc" } as unknown as PaletteAction,
            shortcut: "Enter to copy",
          },
        ]
      : [];
    const hits = fuseData.search(query, { limit: 14 }).map<Item>((r) => {
      const d = r.item;
      const icon = d.kind === "task" ? <CheckSquare size={15} /> : d.kind === "note" ? <StickyNote size={15} /> : d.kind === "journal" ? <BookOpen size={15} /> : d.kind === "habit" ? <Repeat size={15} /> : d.kind === "event" ? <CalendarDays size={15} /> : (d.kind === "life-domain" || d.kind === "life-goal" || d.kind === "life-project") ? <Compass size={15} /> : <Clipboard size={15} />;
      const action: PaletteAction = d.kind === "task" ? { type: "open-task", id: d.id } : d.kind === "note" ? { type: "open-note", id: d.id } : d.kind === "journal" ? { type: "open-journal", id: d.id } : d.kind === "habit" ? { type: "open-habit", id: d.id } : d.kind === "event" ? { type: "open-event", id: d.id, url: (d as { url?: string | null }).url ?? null } : d.kind === "life-domain" ? { type: "navigate", view: "life", param: d.id } : d.kind === "life-goal" ? { type: "navigate", view: "life", param: `goal:${d.id}` } : d.kind === "life-project" ? { type: "navigate", view: "life", param: `proj:${d.id}` } : { type: "open-clip", id: d.id };
      return { id: `${d.kind}-${d.id}`, kind: d.kind, label: d.title, hint: d.sub, section: "Results", icon, action, done: d.done };
    });
    const cmds = fuseCommands.search(query, { limit: 5 }).map((r) => cmdItem(r.item));
    const create: Item[] = [
      { id: "create-task", kind: "create-task", label: `Add task “${query}”`, section: "Create", icon: <CheckSquare size={15} />, action: { type: "add-task", text: query } },
      { id: "create-note", kind: "create-note", label: `New note “${query.slice(0, 40)}”`, section: "Create", icon: <StickyNote size={15} />, action: { type: "add-note", text: query } },
    ];
    return [...calcItems, ...hits, ...cmds, ...create];
  }, [mode, q, query, isTaskEntry, isCommandEntry, commands, fuseCommands, fuseData, data, parsed, calcResult]);

  useEffect(() => setSel(0), [q, mode]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = (it: Item) => {
    if (it.id === "calculator-result" && calcResult) {
      void ipc.clipboardWriteText(calcResult.result);
      onClose();
      return;
    }
    onAction(it.action);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[sel];
      if (it) run(it);
    } else if (e.key === "Tab" && mode !== "note") {
      e.preventDefault();
      setMode((m) => (m === "commands" ? "search" : "commands"));
    }
  };

  const title = mode === "note" ? "New note" : mode === "capture" ? "Capture" : isTaskEntry ? "Quick task" : isCommandEntry || mode === "commands" ? "Commands" : "Search";

  if (mode === "capture") {
    return (
      <Frame floating={floating} title={title} onClose={onClose}>
        {clip ? (
          <div className="flex flex-col gap-3 p-3">
            <div className="text-[0.8em] text-muted">
              From <span className="font-medium text-text">{clip.source.app}</span>
              {clip.source.title && <span className="text-faint"> · {clip.source.title}</span>}
            </div>
            {clip.kind === "image" ? <div className="text-[0.9em]">Image captured ({clip.width}×{clip.height})</div> : <div className="scroll selectable max-h-40 whitespace-pre-wrap rounded-lg bg-surface-2/70 p-2.5 text-[0.88em]">{clip.text}</div>}
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1" autoFocus onClick={() => { onAction({ type: "capture-clip", clip, as: "note" }); onClose(); }}>
                <StickyNote size={14} /> Save as note
              </button>
              <button className="btn flex-1" onClick={() => { onAction({ type: "capture-clip", clip, as: "task" }); onClose(); }}>
                <CheckSquare size={14} /> Save as task
              </button>
            </div>
            <div className="text-center text-[0.75em] text-faint">Clips are also kept in the Clips view.</div>
          </div>
        ) : (
          <div className="p-6 text-center text-muted">Nothing on the clipboard.</div>
        )}
      </Frame>
    );
  }

  if (mode === "note") {
    return (
      <Frame floating={floating} title={title} onClose={onClose}>
        <textarea
          ref={noteRef}
          className="input min-h-[150px] !rounded-none !border-0 !bg-transparent px-4 py-3 text-[0.95em]"
          placeholder="Jot something down… #tags work. Ctrl+Enter to save."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && noteText.trim()) {
              onAction({ type: "add-note", text: noteText, source: clip?.source ? { app: clip.source.app, title: clip.source.title } : null });
              onClose();
            }
          }}
        />
        <div className="flex items-center justify-between border-t hairline px-3 py-2 text-[0.78em] text-faint">
          <span>
            <Kbd>Ctrl+Enter</Kbd> save · <Kbd>Esc</Kbd> cancel
          </span>
          <button className="btn btn-primary btn-sm" disabled={!noteText.trim()} onClick={() => { onAction({ type: "add-note", text: noteText }); onClose(); }}>
            Save note
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame floating={floating} title={title} onClose={onClose}>
      <div className="flex items-center gap-2 border-b hairline px-3">
        {isTaskEntry ? <CheckSquare size={16} className="text-accent" /> : isCommandEntry || mode === "commands" ? <Command size={16} className="text-accent" /> : <Search size={16} className="text-faint" />}
        <input
          ref={inputRef}
          className="h-12 flex-1 bg-transparent text-[1.05em] outline-none placeholder:text-faint"
          placeholder={mode === "commands" ? "Type a command…" : "Search tasks, notes, habits, clips…  “+” adds a task, “>” runs a command"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
        />
        {mode !== "commands" && !isTaskEntry && !isCommandEntry && (
          <button className="chip cursor-pointer" onClick={() => setMode("commands")} aria-label="Tab">
            commands
          </button>
        )}
      </div>
      {parsed && (parsed.due || parsed.priority !== "none" || parsed.tags.length || parsed.recurrence || parsed.estimateMin || parsed.list) && (
        <div className="flex flex-wrap gap-1.5 border-b hairline px-3 py-2">
          {parsed.due && <span className="chip chip-accent">{formatDue(parsed.due, parsed.hasTime)}</span>}
          {parsed.priority !== "none" && <span className="chip">{parsed.priority}</span>}
          {parsed.recurrence && <span className="chip">{describeRecurrence(parsed.recurrence)}</span>}
          {parsed.estimateMin && <span className="chip">{parsed.estimateMin}m</span>}
          {parsed.list && <span className="chip">@{parsed.list}</span>}
          {parsed.tags.map((t) => (
            <span key={t} className="chip">
              #{t}
            </span>
          ))}
        </div>
      )}
      {calcResult && (
        <div
          className="mx-3 my-2 flex items-center justify-between rounded-xl bg-accent/10 border border-accent/25 p-3 cursor-pointer hover:bg-accent/15 transition-all shadow-sm"
          onClick={() => {
            void ipc.clipboardWriteText(calcResult.result);
            onClose();
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg font-bold shadow">
              <Calculator size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[0.76em] font-medium text-muted truncate">
                {calcResult.query}
              </div>
              <div className="text-[1.35em] font-bold text-text tabular-nums tracking-tight leading-snug">
                = {calcResult.result}
              </div>
              {calcResult.detail && (
                <div className="text-[0.72em] text-faint truncate">
                  {calcResult.detail}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2">
            <span className="text-[0.74em] text-muted font-medium">Press</span>
            <Kbd>Enter</Kbd>
            <span className="text-[0.74em] text-muted font-medium">to copy</span>
          </div>
        </div>
      )}
      <div ref={listRef} className="scroll max-h-[340px] py-1.5">
        {items.length === 0 && <div className="px-4 py-6 text-center text-[0.9em] text-faint">{isTaskEntry ? "Type your task, e.g. “Email Sam tomorrow 9am !high”" : "No matches"}</div>}
        {items.map((it, i) => {
          const showSection = i === 0 || items[i - 1].section !== it.section;
          return (
            <div key={it.id}>
              {showSection && <div className="px-4 pb-0.5 pt-1.5 text-[0.7em] font-semibold uppercase tracking-wider text-faint">{it.section}</div>}
              <button data-idx={i} className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", i === sel ? "bg-accent/15 text-text" : "hover:bg-surface-2/70")} onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
                <span className={cn("shrink-0", i === sel ? "text-accent" : "text-faint")}>{it.icon}</span>
                <span className={cn("min-w-0 flex-1 truncate text-[0.93em]", it.done && "text-faint line-through")}>{it.label}</span>
                {it.hint && <span className="shrink-0 truncate text-[0.78em] text-faint">{it.hint}</span>}
                {it.shortcut && <Kbd>{it.shortcut}</Kbd>}
                {i === sel && <ArrowRight size={13} className="shrink-0 text-accent" />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t hairline px-3 py-1.5 text-[0.74em] text-faint">
        <span>
          <kbd className="inline-flex items-center"><ArrowUp size={9} /><ArrowDown size={9} /></kbd> navigate
        </span>
        <span>
          <Kbd>Enter</Kbd> select
        </span>
        <span>
          <Kbd>Tab</Kbd> {mode === "commands" ? "search" : "commands"}
        </span>
        <span>
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </Frame>
  );
}

function sectionIcon(s: CommandDef["section"]) {
  switch (s) {
    case "Focus":
      return <Zap size={15} />;
    case "Media":
      return <Play size={15} />;
    case "Create":
      return <CheckSquare size={15} />;
    default:
      return <Command size={15} />;
  }
}

function Frame({ children, floating, title, onClose }: { children: React.ReactNode; floating?: boolean; title: string; onClose: () => void }) {
  const onDrag = async (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, textarea, a, select, [contenteditable]")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden w-full max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)]",
        floating
          ? "glass !rounded-2xl transition-shadow max-w-[672px]"
          : "glass max-w-xl shadow-2xl rounded-2xl",
      )}
      style={
        floating
          ? {
              background: "rgb(var(--bg) / 0.95)",
              boxShadow: "0 0 0 1px rgb(var(--border) / 0.12), 0 8px 24px -2px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)",
            }
          : undefined
      }
      role="dialog"
      aria-label={title}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {floating && (
        <div
          data-tauri-drag-region
          className="flex h-8 cursor-grab select-none items-center justify-between border-b hairline px-3.5 active:cursor-grabbing"
          style={{ background: "rgb(var(--surface) / 0.5)" }}
          onMouseDown={onDrag}
        >
          <div className="flex items-center gap-1.5 text-[0.76em] font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span>DayFlit {title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div data-tauri-drag-region className="h-1 w-8 rounded-full bg-border/20 cursor-grab" aria-label="Drag handle" />
            <button
              className="btn btn-ghost btn-icon btn-sm ml-1 !p-1 text-muted hover:text-text hover:bg-surface-2/60 transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
      {children}
      {!floating && (
        <button className="sr-only" onClick={onClose}>
          close
        </button>
      )}
    </div>
  );
}
