import { create } from "zustand";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { ipc, on, type RawClip } from "@/lib/ipc";
import type { Clip } from "@/lib/types";
import { useSettings } from "./settings";

interface ClipsState {
  clips: Clip[];
  loaded: boolean;
  recoveredFrom: string | null;
  lastCaptured: Clip | null;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  addRaw: (raw: RawClip) => Clip;
  remove: (id: string) => void;
  clear: () => void;
  togglePin: (id: string) => void;
  markConverted: (id: string, to: Clip["convertedTo"]) => void;
  captureNow: () => Promise<Clip | null>;
  startListening: () => Promise<() => void>;
  byId: (id: string) => Clip | undefined;
}

function normalize(raw: unknown): Clip[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === "object" && typeof (c as Clip).id === "string").map((c) => ({ ...(c as Clip), pinned: (c as Clip).pinned ?? false, convertedTo: (c as Clip).convertedTo ?? null }));
}

export const useClips = create<ClipsState>((set, get) => {
  const persist = (clips: Clip[]) => {
    set({ clips });
    scheduleSave("clips", clips);
  };
  return {
    clips: [],
    loaded: false,
    recoveredFrom: null,
    lastCaptured: null,
    load: async () => {
      const { data, recoveredFrom } = await loadCollection<unknown>("clips", []);
      set({ clips: normalize(data), loaded: true, recoveredFrom });
    },
    reload: async () => {
      const { data } = await loadCollection<unknown>("clips", []);
      set({ clips: normalize(data) });
    },
    addRaw: (raw) => {
      const clip: Clip = { ...raw, pinned: false, convertedTo: null };
      const max = useSettings.getState().settings.clipboard.maxItems || 300;
      const existing = get().clips.filter((c) => !(c.kind === raw.kind && c.text === raw.text && c.image === raw.image && raw.kind !== "image"));
      const pinned = existing.filter((c) => c.pinned);
      const rest = existing.filter((c) => !c.pinned);
      const dropped = rest.slice(Math.max(0, max - 1 - pinned.length));
      for (const d of dropped) if (d.image) void ipc.deleteImage(d.image).catch(() => {});
      persist([clip, ...pinned, ...rest.slice(0, Math.max(0, max - 1 - pinned.length))].sort((a, b) => b.at - a.at));
      set({ lastCaptured: clip });
      return clip;
    },
    remove: (id) => {
      const c = get().byId(id);
      if (c?.image) void ipc.deleteImage(c.image).catch(() => {});
      persist(get().clips.filter((x) => x.id !== id));
    },
    clear: () => {
      for (const c of get().clips) if (!c.pinned && c.image) void ipc.deleteImage(c.image).catch(() => {});
      persist(get().clips.filter((c) => c.pinned));
    },
    togglePin: (id) => persist(get().clips.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))),
    markConverted: (id, to) => persist(get().clips.map((c) => (c.id === id ? { ...c, convertedTo: to } : c))),
    captureNow: async () => {
      const raw = await ipc.clipboardReadNow();
      if (!raw) return null;
      return get().addRaw(raw);
    },
    startListening: async () => {
      const un = await on<RawClip>("sid://clipboard/item", (raw) => {
        get().addRaw(raw);
      });
      return un;
    },
    byId: (id) => get().clips.find((c) => c.id === id),
  };
});
