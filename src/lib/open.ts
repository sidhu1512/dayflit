import { isTauri } from "./ipc";

export function isSafeExternalUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim().replace(/[\x00-\x1f\x7f]/g, "");
  if (!/^https?:\/\//i.test(clean) && !/^mailto:/i.test(clean)) return false;
  // Guard against internal asset URLs (e.g. Tauri custom protocol for local audio/images)
  if (/^https?:\/\/asset\.localhost/i.test(clean) || /^asset:\/\//i.test(clean) || /^dayflit-image:\/\//i.test(clean)) {
    return false;
  }
  return true;
}

export async function openExternal(url: string) {
  if (!isSafeExternalUrl(url)) return;
  const clean = url.trim().replace(/[\x00-\x1f\x7f]/g, "");
  if (!isTauri) {
    if (typeof window !== "undefined") window.open(clean, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(clean);
  } catch {
    if (typeof window !== "undefined") window.open(clean, "_blank", "noopener,noreferrer");
  }
}

