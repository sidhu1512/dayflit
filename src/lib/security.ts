export const RESERVED_DOS_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
  "CONIN$", "CONOUT$",
]);

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "wav", "webm", "mp3", "m4a", "ogg", "mp4", "pdf", "txt", "md",
]);

/**
 * Validates attachment filename against path traversal, NTFS alternate data streams,
 * Windows reserved DOS device names, trailing whitespace/dots, and unauthorized file extensions.
 */
export function isSafeAttachmentFilename(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  // Reject leading or trailing whitespace
  if (filename !== filename.trim()) return false;
  const trimmed = filename.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  // Windows auto-strips trailing dots and spaces, which causes truncation or ADS creation
  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) return false;

  // Reject path traversal, directory separators, NTFS ADS, and invalid Windows characters
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.includes(":") ||
    trimmed.includes("*") ||
    trimmed.includes("?") ||
    trimmed.includes('"') ||
    trimmed.includes("<") ||
    trimmed.includes(">") ||
    trimmed.includes("|") ||
    /[\x00-\x1f\x7f]/.test(trimmed)
  ) {
    return false;
  }

  // Reject URL-encoded path traversal sequences (%2e = ., %2f = /, %5c = \)
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("%2e") ||
    lower.includes("%2f") ||
    lower.includes("%5c") ||
    lower.includes("%00") ||
    lower.includes("%25")
  ) {
    return false;
  }

  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("..") || decoded.includes(":")) {
      return false;
    }
  } catch {
    return false;
  }

  // Windows auto-strips trailing dots and spaces, which causes truncation or ADS creation
  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) {
    return false;
  }

  // Extract stem and extension
  const parts = trimmed.split(".");
  if (parts.length < 2) return false; // Needs at least an extension
  const ext = parts.pop()!.toLowerCase();
  const stem = parts.join(".").toUpperCase();

  if (RESERVED_DOS_NAMES.has(stem)) {
    return false;
  }

  return ALLOWED_ATTACHMENT_EXTENSIONS.has(ext);
}
