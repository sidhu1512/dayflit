import { ipc, isTauri } from "./ipc";

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, unknown>();
const listeners = new Set<(err: { name: string; error: string }) => void>();

export const SAVE_DEBOUNCE_MS = 400;

export function onSaveError(fn: (err: { name: string; error: string }) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function scheduleSave(name: string, data: unknown) {
  pending.set(name, data);
  const t = timers.get(name);
  if (t) clearTimeout(t);
  timers.set(
    name,
    setTimeout(() => void flush(name), SAVE_DEBOUNCE_MS),
  );
}

export async function flush(name: string) {
  const t = timers.get(name);
  if (t) {
    clearTimeout(t);
    timers.delete(name);
  }
  if (!pending.has(name)) return;
  const data = pending.get(name);
  pending.delete(name);
  try {
    if (isTauri) {
      await ipc.save(name, data);
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("sid://store/saved", name);
      } catch {
        /* ignore event emit failure */
      }
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(`dayflit:${name}`, JSON.stringify(data));
    }
  } catch (e) {
    const error = String(e);
    for (const l of listeners) l({ name, error });
    // keep for retry
    if (!pending.has(name)) pending.set(name, data);
    timers.set(
      name,
      setTimeout(() => void flush(name), 3000),
    );
  }
}

export async function flushAll() {
  await Promise.all([...new Set([...pending.keys(), ...timers.keys()])].map((n) => flush(n)));
}

export function hasPending(name?: string) {
  return name ? pending.has(name) : pending.size > 0;
}

export function cancelPending(name?: string) {
  if (name) {
    const t = timers.get(name);
    if (t) {
      clearTimeout(t);
      timers.delete(name);
    }
    pending.delete(name);
  } else {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    pending.clear();
  }
}

export async function loadCollection<T>(name: string, fallback: T): Promise<{ data: T; recoveredFrom: string | null }> {
  cancelPending(name);
  if (!isTauri) {
    try {
      const raw = localStorage.getItem(`dayflit:${name}`);
      return { data: raw ? (JSON.parse(raw) as T) : fallback, recoveredFrom: null };
    } catch {
      return { data: fallback, recoveredFrom: null };
    }
  }
  const r = await ipc.load<T>(name);
  // Heal the primary file right away when it had to be recovered from a backup.
  if (r.recoveredFrom && r.data !== null) scheduleSave(name, r.data);
  return { data: (r.data ?? fallback) as T, recoveredFrom: r.recoveredFrom };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    void flushAll();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushAll();
  });
}
