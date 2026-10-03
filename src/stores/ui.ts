import { create } from "zustand";
import { uid } from "@/lib/ids";

export type View = "today" | "tasks" | "notes" | "journal" | "calendar" | "focus" | "habits" | "stats" | "clips" | "settings";

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

interface UiState {
  view: View;
  viewParam: string | null;
  focused: boolean;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  paletteOpen: boolean;
  paletteMode: string;
  editingTaskId: string | null;
  editingNoteId: string | null;
  selectedTaskId: string | null;
  tasksFilter: "today" | "upcoming" | "inbox" | "all" | "backlog" | "done" | string;
  sidebarCollapsed: boolean;
  compactFocus: boolean;
  navigate: (view: View, param?: string | null) => void;
  toast: (t: Omit<Toast, "id" | "ttl"> & { ttl?: number }) => string;
  dismissToast: (id: string) => void;
  ask: (req: Omit<ConfirmRequest, "resolve">) => Promise<boolean>;
  closeConfirm: (ok: boolean) => void;
  openPalette: (mode?: string) => void;
  closePalette: () => void;
  setEditingTask: (id: string | null) => void;
  setEditingNote: (id: string | null) => void;
  setSelectedTask: (id: string | null) => void;
  setTasksFilter: (f: UiState["tasksFilter"]) => void;
  setFocused: (f: boolean) => void;
  toggleSidebar: () => void;
  setCompactFocus: (v: boolean) => void;
}

export const useUi = create<UiState>((set, get) => ({
  view: "today",
  viewParam: null,
  focused: true,
  toasts: [],
  confirm: null,
  paletteOpen: false,
  paletteMode: "commands",
  editingTaskId: null,
  editingNoteId: null,
  selectedTaskId: null,
  tasksFilter: "today",
  sidebarCollapsed: false,
  compactFocus: false,
  navigate: (view, param = null) => set({ view, viewParam: param }),
  toast: (t) => {
    const id = uid();
    const ttl = t.ttl ?? (t.kind === "error" ? 8000 : 4000);
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id, ttl }] }));
    if (ttl > 0) window.setTimeout(() => get().dismissToast(id), ttl);
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
  openPalette: (mode = "commands") => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),
  setEditingTask: (id) => set({ editingTaskId: id }),
  setEditingNote: (id) => set({ editingNoteId: id }),
  setSelectedTask: (id) => set({ selectedTaskId: id }),
  setTasksFilter: (f) => set({ tasksFilter: f }),
  setFocused: (focused) => set({ focused }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCompactFocus: (compactFocus) => set({ compactFocus }),
}));

export const toast = (title: string, opts: Partial<Omit<Toast, "id" | "title">> = {}) => useUi.getState().toast({ title, kind: "info", ...opts });
