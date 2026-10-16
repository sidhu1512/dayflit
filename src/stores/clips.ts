import { create } from "zustand";
import { loadCollection, scheduleSave } from "@/lib/persist";
import { ipc, on, type RawClip } from "@/lib/ipc";
import type { Clip } from "@/lib/types";
import { deleteImageIfUnused } from "@/lib/imageUrl";
import { useSettings } from "./settings";

interface ClipsState {
  clips: Clip[];
  loaded: boolean;
  recoveredFrom: string | null;
  lastCaptured: Clip | null;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  addRaw: (raw: RawClip) => Clip;
  add: (raw: RawClip) => Clip;
  update: (id: string, patch: Partial<Clip>) => void;
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
  const addClipImpl = (raw: RawClip): Clip => {
    const now = Date.now();
    const rawAt = raw.at || now;
    const currentClips = get().clips;

    const normText = (t?: string) => (t || "").replace(/\r\n/g, "\n").trim();
    const normImg = (im?: string | null) => (im || "").replace(/^dayflit-?image:\/\//, "").trim();

    // 1. Content + Timestamp deduplication: if identical content added within 30s OR matches most recent, return existing
    const duplicate = currentClips.find((c) => {
      if (c.id === raw.id) return true;
      if (c.kind !== raw.kind) return false;
      const isSameContent =
        raw.kind === "image"
          ? Boolean(normImg(raw.image) && normImg(c.image) && normImg(raw.image) === normImg(c.image))
          : normText(c.text) === normText(raw.text);
      const isRecent = Math.abs((c.at || 0) - rawAt) < 30000 || Math.abs(now - (c.at || 0)) < 30000;
      return isSameContent && isRecent;
    });

    if (duplicate) {
      set({ lastCaptured: duplicate });
      return duplicate;
    }

    // Also check if matches most recent clip regardless of timestamp (identical consecutive copy)
    const mostRecent = currentClips[0];
    if (mostRecent && mostRecent.kind === raw.kind) {
      const isSameAsRecent =
        raw.kind === "image"
          ? Boolean(normImg(raw.image) && normImg(mostRecent.image) && normImg(raw.image) === normImg(mostRecent.image))
          : normText(mostRecent.text) === normText(raw.text);
      if (isSameAsRecent) {
        set({ lastCaptured: mostRecent });
        return mostRecent;
      }
    }

    // 2. Filter out identical content (including identical image hashes)
    const existing = currentClips.filter((c) => {
      if (raw.kind === "image") {
        return !(c.kind === "image" && normImg(raw.image) && normImg(c.image) === normImg(raw.image));
      }
      return !(c.kind === raw.kind && normText(c.text) === normText(raw.text));
    });

    const clip: Clip = { ...raw, pinned: false, convertedTo: null, at: rawAt };
    const max = useSettings.getState().settings.clipboard.maxItems || 300;
    const pinned = existing.filter((c) => c.pinned);
    const rest = existing.filter((c) => !c.pinned);
    const dropped = rest.slice(Math.max(0, max - 1 - pinned.length));
    for (const d of dropped) if (d.image) void deleteImageIfUnused(d.image).catch(() => {});
    persist([clip, ...pinned, ...rest.slice(0, Math.max(0, max - 1 - pinned.length))].sort((a, b) => b.at - a.at));
    set({ lastCaptured: clip });
    return clip;
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
    addRaw: addClipImpl,
    add: addClipImpl,
    update: (id, patch) =>
      persist(get().clips.map((c) => (c.id === id ? { ...c, ...patch, at: c.at } : c))),
    remove: (id) => {
      const c = get().byId(id);
      persist(get().clips.filter((x) => x.id !== id));
      if (c?.image) void deleteImageIfUnused(c.image).catch(() => {});
    },
    clear: () => {
      const toRemove = get().clips.filter((c) => !c.pinned);
      persist(get().clips.filter((c) => c.pinned));
      for (const c of toRemove) if (c.image) void deleteImageIfUnused(c.image).catch(() => {});
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
