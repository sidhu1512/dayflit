import { create } from "zustand";
import { ipc, isTauri, on } from "@/lib/ipc";
import type { MediaState, SpotifyStatus } from "@/lib/types";

export interface SpotifyPlayback {
  isPlaying: boolean;
  track: string;
  artist: string;
  album: string;
  image: string | null;
  progressMs: number;
  durationMs: number;
  volume: number;
  shuffle: boolean;
  repeat: string;
  device: string | null;
  contextUri: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  image: string | null;
  tracks: number;
}

interface MediaStoreState {
  media: MediaState;
  spotify: SpotifyStatus | null;
  playback: SpotifyPlayback | null;
  playlists: SpotifyPlaylist[];
  busy: boolean;
  error: string | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  control: (action: string, appId?: string) => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  spotifyRefresh: () => Promise<void>;
  spotifyConnect: (clientId: string) => Promise<void>;
  spotifyDisconnect: () => Promise<void>;
  spotifyControl: (action: string, contextUri?: string) => Promise<void>;
  loadPlaylists: () => Promise<void>;
  attach: () => Promise<() => void>;
}

const emptyMedia: MediaState = { available: false, current: null, sessions: [], thumbnail: null, volume: 0, muted: false };

function parsePlayback(v: unknown): SpotifyPlayback | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const item = (o.item ?? null) as Record<string, unknown> | null;
  const album = (item?.album ?? null) as Record<string, unknown> | null;
  const images = (album?.images ?? []) as { url: string }[];
  const artists = (item?.artists ?? []) as { name: string }[];
  const device = (o.device ?? null) as Record<string, unknown> | null;
  const context = (o.context ?? null) as Record<string, unknown> | null;
  return {
    isPlaying: !!o.is_playing,
    track: (item?.name as string) ?? "",
    artist: artists.map((a) => a.name).join(", "),
    album: (album?.name as string) ?? "",
    image: images[1]?.url ?? images[0]?.url ?? null,
    progressMs: (o.progress_ms as number) ?? 0,
    durationMs: (item?.duration_ms as number) ?? 0,
    volume: (device?.volume_percent as number) ?? 0,
    shuffle: !!o.shuffle_state,
    repeat: (o.repeat_state as string) ?? "off",
    device: (device?.name as string) ?? null,
    contextUri: (context?.uri as string) ?? null,
  };
}

export const useMedia = create<MediaStoreState>((set, get) => ({
  media: emptyMedia,
  spotify: null,
  playback: null,
  playlists: [],
  busy: false,
  error: null,
  init: async () => {
    if (!isTauri) return;
    await Promise.all([get().refresh(), get().spotifyRefresh()]);
  },
  refresh: async () => {
    try {
      set({ media: await ipc.mediaState() });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  control: async (action, appId) => {
    try {
      await ipc.mediaControl(action, appId);
      window.setTimeout(() => void get().refresh(), 350);
    } catch (e) {
      set({ error: String(e) });
    }
  },
  setVolume: async (v) => {
    set((s) => ({ media: { ...s.media, volume: v } }));
    await ipc.mediaSetVolume(v).catch(() => {});
  },
  toggleMute: async () => {
    const m = !get().media.muted;
    set((s) => ({ media: { ...s.media, muted: m } }));
    await ipc.mediaSetMute(m).catch(() => {});
  },
  spotifyRefresh: async () => {
    try {
      const st = await ipc.spotifyStatus();
      set({ spotify: st });
      if (st.connected) {
        const pb = await ipc.spotifyApi<unknown>("GET", "/me/player").catch(() => null);
        set({ playback: parsePlayback(pb) });
      } else set({ playback: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  spotifyConnect: async (clientId) => {
    set({ busy: true, error: null });
    try {
      const st = await ipc.spotifyConnect(clientId);
      set({ spotify: st });
      await get().spotifyRefresh();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ busy: false });
    }
  },
  spotifyDisconnect: async () => {
    set({ spotify: await ipc.spotifyDisconnect(), playback: null, playlists: [] });
  },
  spotifyControl: async (action, contextUri) => {
    try {
      await ipc.spotifyControl(action, contextUri);
      window.setTimeout(() => void get().spotifyRefresh(), 500);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
  loadPlaylists: async () => {
    try {
      const r = await ipc.spotifyApi<{ items: Record<string, unknown>[] }>("GET", "/me/playlists?limit=50");
      const items = (r?.items ?? []).filter(Boolean).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        uri: p.uri as string,
        image: ((p.images as { url: string }[] | null) ?? [])[0]?.url ?? null,
        tracks: ((p.tracks as { total: number } | null) ?? { total: 0 }).total,
      }));
      set({ playlists: items });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  attach: async () => {
    const uns: (() => void)[] = [];
    uns.push(await on<MediaState>("sid://media/state", (m) => set({ media: m })));
    uns.push(await on<SpotifyStatus>("sid://spotify/status", (s) => set({ spotify: s })));
    return () => uns.forEach((u) => u());
  },
}));
