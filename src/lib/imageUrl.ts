import { convertFileSrc } from "@tauri-apps/api/core";
import { ipc, isTauri } from "./ipc";
import { scheduleSave } from "./persist";

let imagesDir: string | null = null;
const listeners = new Set<() => void>();
const urlCache = new Map<string, string>();
let reconcileStarted = false;

export function prewarmImageUrls(names: string[]) {
  if (!imagesDir) return;
  const normalizedDir = imagesDir.replace(/[\\/]+$/, "");
  for (const name of names) {
    if (!name || /^(https?:\/\/|data:|blob:|asset:\/\/)/i.test(name)) continue;
    const clean = name.replace(/^dayflit-image:\/\//, "").replace(/^\/+/, "");
    if (!clean) continue;
    if (!urlCache.has(clean)) {
      const src = convertFileSrc(`${normalizedDir}\\${clean}`);
      urlCache.set(clean, src);
      urlCache.set(`dayflit-image://${clean}`, src);
    }
  }
}

export async function initImages() {
  if (!isTauri) return;
  try {
    const info = await ipc.storeInfo();
    imagesDir = info.imagesDir;

    // Pre-warm all image assets from disk into synchronous memory cache
    try {
      const diskImages = await ipc.listImages();
      const normalizedDir = imagesDir.replace(/[\\/]+$/, "");
      for (const name of diskImages) {
        if (!name || /^(https?:\/\/|data:|blob:|asset:\/\/)/i.test(name)) continue;
        const clean = name.replace(/^dayflit-image:\/\//, "").replace(/^\/+/, "");
        if (!clean) continue;
        const src = convertFileSrc(`${normalizedDir}\\${clean}`);
        urlCache.set(clean, src);
        urlCache.set(`dayflit-image://${clean}`, src);
      }
    } catch {
      /* ignore */
    }

    listeners.forEach((l) => l());

    // Run reconcile once silently in background after startup
    if (!reconcileStarted) {
      reconcileStarted = true;
      setTimeout(() => {
        void reconcileImages();
      }, 800);
    }
  } catch {
    /* ignore */
  }
}

export function onImagesReady(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function imageUrl(name: string): string {
  if (!name) return "";
  if (/^(https?:\/\/|data:|blob:|asset:\/\/)/i.test(name)) return name;
  const clean = name.replace(/^dayflit-?image:\/\//, "").replace(/^\/+/, "");
  if (!clean) return "";
  const cached = urlCache.get(clean) || urlCache.get(name);
  if (cached) return cached;
  if (!isTauri || !imagesDir) return "";
  const normalizedDir = imagesDir.replace(/[\\/]+$/, "");
  const resolved = convertFileSrc(`${normalizedDir}\\${clean}`);
  urlCache.set(clean, resolved);
  urlCache.set(`dayflit-image://${clean}`, resolved);
  urlCache.set(`dayflitimage://${clean}`, resolved);
  return resolved;
}

/** Read a File/Blob as base64 (without data: prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Persist an image blob into the data folder; returns the stored file name. */
export async function storeImageBlob(blob: Blob): Promise<string> {
  const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("gif") ? "gif" : blob.type.includes("webp") ? "webp" : "png";
  const b64 = await blobToBase64(blob);
  const name = await ipc.saveImage(b64, ext);
  if (name && imagesDir) {
    const clean = name.replace(/^dayflit-image:\/\//, "").replace(/^\/+/, "");
    const src = convertFileSrc(`${imagesDir}\\${clean}`);
    urlCache.set(clean, src);
    urlCache.set(`dayflit-image://${clean}`, src);
  }
  return name;
}

/** Extract image files from a paste/drop event. */
export function imagesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  if (!out.length) for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith("image/")) out.push(f);
  return out;
}

/** Check whether an image is still referenced anywhere across notes, journal, clips or tasks, and delete it from disk if orphaned. */
export async function deleteImageIfUnused(name: string): Promise<boolean> {
  if (!isTauri || !name) return false;
  const cleanName = name.replace(/^dayflit-image:\/\//, "").replace(/^\/+/, "");
  if (!cleanName) return false;
  try {
    const { useNotes } = await import("@/stores/notes");
    const { useJournal } = await import("@/stores/journal");
    const { useClips } = await import("@/stores/clips");
    const { useTasks } = await import("@/stores/tasks");
    const { useLife } = await import("@/stores/life");
    const notesState = useNotes.getState();
    const inNotes = notesState.notes.some((n) => n.images?.includes(cleanName) || n.body?.includes(cleanName))
      || (notesState.trash ?? []).some((n) => n.images?.includes(cleanName) || n.body?.includes(cleanName));
    const inJournal = useJournal.getState().entries.some((e) =>
      e.images?.includes(cleanName) || e.audio?.includes(cleanName) || e.body?.includes(cleanName)
    );
    const inClips = useClips.getState().clips.some((c) => c.image === cleanName);
    const inTasks = useTasks.getState().tasks.some((t) =>
      t.images?.includes(cleanName) || t.notes?.includes(cleanName)
    );
    const lifeData = useLife.getState().data;
    const inLife = (lifeData.domains ?? []).some((d) =>
      d.reflection?.includes(cleanName) ||
      (d.principles ?? []).some((p) => p.includes(cleanName)) ||
      (d.resources ?? []).some((r) => r.content?.includes(cleanName) || r.url?.includes(cleanName))
    );
    if (!inNotes && !inJournal && !inClips && !inTasks && !inLife) {
      await ipc.deleteImage(cleanName);
      urlCache.delete(cleanName);
      urlCache.delete(`dayflit-image://${cleanName}`);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Reconcile stores against existing disk images so phantom/deleted images are removed from notes, journal entries, and tasks. */
export async function reconcileImages(): Promise<void> {
  if (!isTauri) return;
  try {
    const existingList = await ipc.listImages();
    const existing = new Set(existingList);
    const { useNotes } = await import("@/stores/notes");
    const { useJournal } = await import("@/stores/journal");
    const { useTasks } = await import("@/stores/tasks");

    // Reconcile Notes
    const notesState = useNotes.getState();
    let notesChanged = false;
    const reconciledNotes = notesState.notes.map((n) => {
      if (!n.images || !n.images.length) return n;
      const validImages = n.images.filter((img) => existing.has(img));
      if (validImages.length !== n.images.length) {
        notesChanged = true;
        return { ...n, images: validImages };
      }
      return n;
    });
    if (notesChanged) {
      useNotes.setState({ notes: reconciledNotes });
      scheduleSave("notes", reconciledNotes);
    }

    // Reconcile Journal entries (images and audio)
    const journalState = useJournal.getState();
    let journalChanged = false;
    const reconciledEntries = journalState.entries.map((e) => {
      let entryChanged = false;
      let validImages = e.images;
      if (e.images?.length) {
        validImages = e.images.filter((img) => existing.has(img));
        if (validImages.length !== e.images.length) {
          entryChanged = true;
        }
      }
      let validAudio = e.audio;
      if (e.audio?.length) {
        validAudio = e.audio.filter((aud) => existing.has(aud));
        if (validAudio.length !== e.audio.length) {
          entryChanged = true;
        }
      }
      if (entryChanged) {
        journalChanged = true;
        return { ...e, images: validImages, audio: validAudio };
      }
      return e;
    });
    if (journalChanged) {
      useJournal.setState({ entries: reconciledEntries });
      scheduleSave("journal", {
        journals: journalState.journals,
        entries: reconciledEntries,
        templates: journalState.templates,
      });
    }

    // Reconcile Tasks
    const tasksState = useTasks.getState();
    let tasksChanged = false;
    const reconciledTasks = tasksState.tasks.map((t) => {
      if (!t.images || !t.images.length) return t;
      const validImages = t.images.filter((img) => existing.has(img));
      if (validImages.length !== t.images.length) {
        tasksChanged = true;
        return { ...t, images: validImages };
      }
      return t;
    });
    if (tasksChanged) {
      useTasks.setState({ tasks: reconciledTasks });
      scheduleSave("tasks", reconciledTasks);
    }
  } catch {
    /* ignore */
  }
}

