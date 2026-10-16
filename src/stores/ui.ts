import { create } from "zustand";
import { uid } from "@/lib/ids";

export type View = "today" | "tasks" | "notes" | "canvas" | "journal" | "calendar" | "focus" | "habits" | "life" | "stats" | "clips" | "settings";

export interface Toast {
  id: string;
  title: string;
  body?: string;
  kind: "info" | "success" | "error" | "warning";
  action?: { label: string; onClick: () => void };
  ttl: number;
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export interface PromptRequest {
  title: string;
  body?: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  confirmLabel?: string;
  resolve: (val: string | null) => void;
}

export interface LightboxState {
  images: string[];
  index: number;
  title?: string;
  onDelete?: (image: string, index: number) => void;
}

interface UiState {
  view: View;
  viewParam: string | null;
  focused: boolean;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
  paletteOpen: boolean;
  paletteMode: string;
  lightbox: LightboxState | null;
  editingTaskId: string | null;
  editingNoteId: string | null;
  selectedTaskId: string | null;
  tasksFilter: "today" | "upcoming" | "inbox" | "all" | "backlog" | "done" | string;
  sidebarCollapsed: boolean;
  sidebarPinned: boolean;
  compactFocus: boolean;
  navigate: (view: View, param?: string | null) => void;
  toast: (t: Omit<Toast, "id" | "ttl" | "kind"> & { kind?: Toast["kind"]; ttl?: number }) => string;
  dismissToast: (id: string) => void;
  ask: (req: Omit<ConfirmRequest, "resolve">) => Promise<boolean>;
  closeConfirm: (ok: boolean) => void;
  promptUser: (req: Omit<PromptRequest, "resolve">) => Promise<string | null>;
  closePrompt: (val: string | null) => void;
  openPalette: (mode?: string) => void;
  closePalette: () => void;
  openLightbox: (
    images: string[] | string,
    index?: number,
    title?: string,
    onDelete?: (image: string, index: number) => void
  ) => void;
  closeLightbox: () => void;
  setEditingTask: (id: string | null) => void;
  setEditingNote: (id: string | null) => void;
  setSelectedTask: (id: string | null) => void;
  setTasksFilter: (f: UiState["tasksFilter"]) => void;
  setFocused: (f: boolean) => void;
  toggleSidebar: () => void;
  setSidebarPinned: (pinned: boolean) => void;
  toggleSidebarPinned: () => void;
  setCompactFocus: (v: boolean) => void;
}

const initialView: View = (() => {
  if (typeof window !== "undefined" && window.location.search) {
    const p = new URLSearchParams(window.location.search).get("view");
    if (p && ["today", "tasks", "notes", "canvas", "journal", "calendar", "focus", "habits", "life", "stats", "clips", "settings"].includes(p)) {
      return p as View;
    }
  }
  return "today";
})();

const initialParam: string | null = (() => {
  if (typeof window !== "undefined" && window.location.search) {
    return new URLSearchParams(window.location.search).get("param");
  }
  return null;
})();

export const useUi = create<UiState>((set, get) => ({
  view: initialView,
  viewParam: initialParam,
  focused: true,
  toasts: [],
  confirm: null,
  prompt: null,
  paletteOpen: false,
  paletteMode: "commands",
  lightbox: null,
  editingTaskId: null,
  editingNoteId: null,
  selectedTaskId: null,
  tasksFilter: "today",
  sidebarCollapsed: false,
  sidebarPinned: false,
  compactFocus: false,
  navigate: (view, param = null) => set({ view, viewParam: param }),
  toast: (t) => {
    const id = uid();
    const kind = t.kind ?? "info";
    const ttl = t.ttl ?? (kind === "error" ? 4000 : 2000);
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, kind, id, ttl }] }));
    if (ttl > 0) setTimeout(() => get().dismissToast(id), ttl);
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  ask: (req) =>
    new Promise<boolean>((resolve) => {
      set({ confirm: { ...req, resolve } });
    }),
  closeConfirm: (ok) => {
    const c = get().confirm;
    set({ confirm: null });
    c?.resolve(ok);
  },
  promptUser: (req) =>
    new Promise<string | null>((resolve) => {
      set({ prompt: { ...req, resolve } });
    }),
  closePrompt: (val) => {
    const p = get().prompt;
    set({ prompt: null });
    p?.resolve(val);
  },
  openPalette: (mode = "commands") => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),
  openLightbox: (images, index = 0, title, onDelete) => {
    const list = Array.isArray(images) ? images : [images];
    if (list.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, list.length - 1));
    set({ lightbox: { images: list, index: safeIndex, title, onDelete } });
  },
  closeLightbox: () => set({ lightbox: null }),
  setEditingTask: (id) => set({ editingTaskId: id }),
  setEditingNote: (id) => set({ editingNoteId: id }),
  setSelectedTask: (id) => set({ selectedTaskId: id }),
  setTasksFilter: (f) => set({ tasksFilter: f }),
  setFocused: (focused) => set({ focused }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarPinned: (sidebarPinned) => set({ sidebarPinned }),
  toggleSidebarPinned: () => set((s) => ({ sidebarPinned: !s.sidebarPinned })),
  setCompactFocus: (compactFocus) => set({ compactFocus }),
}));

export const toast = (title: string, opts: Partial<Omit<Toast, "id" | "title">> = {}) => useUi.getState().toast({ title, kind: "info", ...opts });
