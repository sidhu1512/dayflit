import { create } from "zustand";
import { uid } from "@/lib/ids";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { extractTags } from "@/lib/nlp";
import { firstLineTitle } from "@/lib/markdown";
import type { CaptureSource, Note } from "@/lib/types";

export type NoteInput = Partial<Omit<Note, "id" | "createdAt" | "updatedAt">>;

interface NotesState {
  notes: Note[];
  loaded: boolean;
  recoveredFrom: string | null;
  trash: Note[];
  load: () => Promise<void>;
  reload: () => Promise<void>;
  add: (input?: NoteInput) => Note;
  update: (id: string, patch: Partial<Note>) => void;
  setBody: (id: string, body: string) => void;
  remove: (id: string) => void;
  restoreLast: () => Note | null;
  togglePin: (id: string) => void;
  archive: (id: string, archived?: boolean) => void;
  addImage: (id: string, name: string) => void;
  byId: (id: string) => Note | undefined;
}

export function makeNote(input: NoteInput = {}): Note {
  const t = Date.now();
  const body = input.body ?? "";
  return {
    id: uid(),
    title: input.title ?? "",
    body,
    tags: input.tags ?? extractTags(body),
    pinned: input.pinned ?? false,
    archived: input.archived ?? false,
    color: input.color ?? null,
    createdAt: t,
    updatedAt: t,
    images: input.images ?? [],
    source: input.source ?? null,
  };
}

function normalize(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n) => n && typeof n === "object" && typeof (n as Note).body === "string").map((n) => ({ ...makeNote(), ...(n as Note) }));
}

export const useNotes = create<NotesState>((set, get) => {
  const persist = (notes: Note[]) => {
    set({ notes });
    scheduleSave("notes", notes);
  };
  return {
    notes: [],
    loaded: false,
    recoveredFrom: null,
    trash: [],
    load: async () => {
      const { data, recoveredFrom } = await loadCollection<unknown>("notes", []);
      set({ notes: normalize(data), loaded: true, recoveredFrom });
    },
    reload: async () => {
      const { data } = await loadCollection<unknown>("notes", []);
      set({ notes: normalize(data) });
    },
    add: (input = {}) => {
      const n = makeNote(input);
      persist([n, ...get().notes]);
      return n;
    },
    update: (id, patch) => persist(get().notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))),
    setBody: (id, body) => {
      const n = get().byId(id);
      if (!n || n.body === body) return;
      const tags = extractTags(body);
      const images = [...new Set([...n.images, ...[...body.matchAll(/(?:dayflit|sid)-image:\/\/([\w.-]+)/g)].map((m) => m[1])])];
      get().update(id, { body, tags, images, title: n.title || "" });
    },
    remove: (id) => {
      const n = get().byId(id);
      if (!n) return;
      set({ trash: [...get().trash.slice(-9), n] });
      persist(get().notes.filter((x) => x.id !== id));
    },
    restoreLast: () => {
      const t = get().trash;
      if (!t.length) return null;
      const n = t[t.length - 1];
      set({ trash: t.slice(0, -1) });
      persist([n, ...get().notes]);
      return n;
    },
    togglePin: (id) => {
      const n = get().byId(id);
      if (n) get().update(id, { pinned: !n.pinned });
    },
    archive: (id, archived = true) => get().update(id, { archived }),
    addImage: (id, name) => {
      const n = get().byId(id);
      if (n) get().update(id, { images: [...new Set([...n.images, name])] });
    },
    byId: (id) => get().notes.find((n) => n.id === id),
  };
});

export function noteTitle(n: Note): string {
  return n.title.trim() || firstLineTitle(n.body) || "Untitled";
}

export function sourceFromCapture(s: { app: string; title: string; exe?: string; url?: string }): CaptureSource {
  return { app: s.app, title: s.title, exe: s.exe, url: s.url };
}
