import { convertFileSrc } from "@tauri-apps/api/core";
import { ipc, isTauri } from "./ipc";

let imagesDir: string | null = null;
const listeners = new Set<() => void>();

export async function initImages() {
  if (!isTauri) return;
  try {
    const info = await ipc.storeInfo();
    imagesDir = info.imagesDir;
    listeners.forEach((l) => l());
  } catch {
    /* ignore */
  }
}

export function onImagesReady(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function imageUrl(name: string): string {
  if (!isTauri || !imagesDir) return "";
  return convertFileSrc(`${imagesDir}\\${name}`);
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
  return ipc.saveImage(b64, ext);
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
