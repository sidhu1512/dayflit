import { create } from "zustand";
import { addDays, subMonths, subYears } from "date-fns";
import { uid } from "@/lib/ids";
import { dateKey, parseKey } from "@/lib/dates";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { extractTags } from "@/lib/nlp";
import type { CaptureSource, Journal, JournalData, JournalEntry, JournalTemplate } from "@/lib/types";

export type EntryInput = Partial<Omit<JournalEntry, "id" | "createdAt" | "updatedAt">>;

interface JournalState {
  journals: Journal[];
  entries: JournalEntry[];
  templates: JournalTemplate[];
  loaded: boolean;
  recoveredFrom: string | null;
  unlockedUntil: number;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  addJournal: (input: Partial<Journal> & { name: string }) => Journal;
  updateJournal: (id: string, patch: Partial<Journal>) => void;
  removeJournal: (id: string) => void;
  addEntry: (input?: EntryInput) => JournalEntry;
  updateEntry: (id: string, patch: Partial<JournalEntry>) => void;
  setBody: (id: string, body: string) => void;
  removeEntry: (id: string) => void;
  toggleFavorite: (id: string) => void;
  addTemplate: (name: string, body: string) => JournalTemplate;
  removeTemplate: (id: string) => void;
  setUnlocked: (ms: number) => void;
  byId: (id: string) => JournalEntry | undefined;
}

const DEFAULT_JOURNAL: Journal = { id: "default", name: "Journal", color: "#a78bfa", icon: "book-open", createdAt: 0, order: 0 };

function normalize(raw: unknown): JournalData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<JournalData>;
  const journals = Array.isArray(d.journals) && d.journals.length ? d.journals : [DEFAULT_JOURNAL];
  const entries = (Array.isArray(d.entries) ? d.entries : []).filter((e) => e && typeof e.body === "string").map((e) => ({ ...makeEntry({}), ...e }));
  const templates = Array.isArray(d.templates) ? d.templates : [];
  return { journals, entries, templates };
}

export function makeEntry(input: EntryInput): JournalEntry {
  const t = Date.now();
  const body = input.body ?? "";
  return {
    id: uid(),
    journalId: input.journalId ?? "default",
    date: input.date ?? dateKey(),
    createdAt: t,
    updatedAt: t,
    title: input.title ?? "",
    body,
    tags: input.tags ?? extractTags(body),
    mood: input.mood ?? null,
    favorite: input.favorite ?? false,
    images: input.images ?? [],
    audio: input.audio ?? [],
    source: input.source ?? "manual",
    prompt: input.prompt ?? null,
    location: input.location ?? null,
    context: input.context ?? null,
  };
}

export const useJournal = create<JournalState>((set, get) => {
  const persist = (patch: Partial<JournalData>) => {
    set(patch);
    const s = get();
    scheduleSave("journal", { journals: s.journals, entries: s.entries, templates: s.templates });
  };
  return {
    journals: [DEFAULT_JOURNAL],
    entries: [],
    templates: [],
    loaded: false,
    recoveredFrom: null,
    unlockedUntil: 0,
    load: async () => {
      const { data, recoveredFrom } = await loadCollection<unknown>("journal", null);
      set({ ...normalize(data), loaded: true, recoveredFrom });
    },
    reload: async () => {
      const { data } = await loadCollection<unknown>("journal", null);
      set(normalize(data));
    },
    addJournal: (input) => {
      const j: Journal = { id: uid(), name: input.name.trim() || "Journal", color: input.color ?? "#60a5fa", icon: input.icon ?? "book-open", createdAt: Date.now(), order: get().journals.length };
      persist({ journals: [...get().journals, j] });
      return j;
    },
    updateJournal: (id, patch) => persist({ journals: get().journals.map((j) => (j.id === id ? { ...j, ...patch } : j)) }),
    removeJournal: (id) => {
      if (id === "default") return;
      persist({ journals: get().journals.filter((j) => j.id !== id), entries: get().entries.map((e) => (e.journalId === id ? { ...e, journalId: "default" } : e)) });
    },
    addEntry: (input = {}) => {
      const e = makeEntry(input);
      persist({ entries: [e, ...get().entries] });
      return e;
    },
    updateEntry: (id, patch) => persist({ entries: get().entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)) }),
    setBody: (id, body) => {
      const e = get().byId(id);
      if (!e || e.body === body) return;
      const images = [...new Set([...e.images, ...[...body.matchAll(/(?:dayflit|sid)-image:\/\/([\w.-]+)/g)].map((m) => m[1])])];
      get().updateEntry(id, { body, tags: extractTags(body), images });
    },
    removeEntry: (id) => persist({ entries: get().entries.filter((e) => e.id !== id) }),
    toggleFavorite: (id) => {
      const e = get().byId(id);
      if (e) get().updateEntry(id, { favorite: !e.favorite });
    },
    addTemplate: (name, body) => {
      const t: JournalTemplate = { id: uid(), name: name.trim() || "Template", body };
      persist({ templates: [...get().templates, t] });
      return t;
    },
    removeTemplate: (id) => persist({ templates: get().templates.filter((t) => t.id !== id) }),
    setUnlocked: (ms) => set({ unlockedUntil: ms }),
    byId: (id) => get().entries.find((e) => e.id === id),
  };
});

// ---------- helpers ----------

export function entriesOn(entries: JournalEntry[], key: string) {
  return entries.filter((e) => e.date === key).sort((a, b) => b.createdAt - a.createdAt);
}

export function journalStreak(entries: JournalEntry[], today = new Date()): number {
  const days = new Set(entries.map((e) => e.date));
  let n = 0;
  let d = new Date(today);
  if (!days.has(dateKey(d))) d = addDays(d, -1);
  while (days.has(dateKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function wordCount(body: string): number {
  return body.trim() ? body.trim().split(/\s+/).length : 0;
}

/** "On this day": same calendar day in earlier years, plus one month and one week ago. */
export function onThisDay(entries: JournalEntry[], today = new Date()): { label: string; entries: JournalEntry[] }[] {
  const out: { label: string; entries: JournalEntry[] }[] = [];
  const push = (label: string, key: string) => {
    const list = entriesOn(entries, key);
    if (list.length) out.push({ label, entries: list });
  };
  for (let y = 1; y <= 10; y++) push(`${y} year${y > 1 ? "s" : ""} ago`, dateKey(subYears(today, y)));
  push("1 month ago", dateKey(subMonths(today, 1)));
  push("1 week ago", dateKey(addDays(today, -7)));
  return out;
}

export function entryTitle(e: JournalEntry): string {
  if (e.title.trim()) return e.title.trim();
  const first = e.body
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim())
    .find((l) => l.length > 0);
  return first ? first.slice(0, 80) : "Untitled entry";
}

export function contextFrom(s: { app: string; title: string; exe?: string }): CaptureSource {
  return { app: s.app, title: s.title, exe: s.exe };
}

export function daysWithEntries(entries: JournalEntry[], journalId: string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) if (!journalId || e.journalId === journalId) m.set(e.date, (m.get(e.date) ?? 0) + 1);
  return m;
}

export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1 | 6): (Date | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export { parseKey };
