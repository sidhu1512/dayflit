import DOMPurify from "dompurify";
import { marked } from "marked";
import { format } from "date-fns";

marked.setOptions({ gfm: true, breaks: true });


export const AUDIO_EXT_RE = /\.(wav|mp3|m4a|ogg|webm|aac|flac)(?:\?[^"'\s]*)?$/i;

export function isAudioUrl(url: string): boolean {
  if (!url) return false;
  return AUDIO_EXT_RE.test(url);
}

/** Sanitize HTML string to prevent XSS, script injection, and javascript: links */
export function sanitizeHtml(html: string): string {
  if (typeof window !== "undefined" && typeof DOMPurify?.sanitize === "function") {
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ["audio", "source"],
      ADD_ATTR: ["target", "data-line", "role", "style", "controls", "preload", "src", "type"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|asset|https?:\/\/asset\.localhost|dayflit-image):|#|\/)/i,
    });
  }
  // Hardened server/Node/fallback sanitizer
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/\s+on(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, "")
    .replace(/href\s*=\s*["']?\s*(javascript|vbscript|data|file):[^"'>\s]*/gi, 'href="#"')
    .replace(/src\s*=\s*["']?\s*(javascript|vbscript|file):[^"'>\s]*/gi, 'src=""')
    .replace(/url\s*\(\s*["']?\s*(javascript|vbscript):[^"')]*\)/gi, "none");
}

/** Convert `dayflit-image://name` references into asset URLs before rendering. */
export function renderMarkdown(md: string, imageUrl: (name: string) => string = (n) => n): string {
  let src = md || "";
  // task list items get data-line so clicks can toggle them
  const lines = src.split("\n");
  src = lines
    .map((line, i) => {
      const m = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s/);
      if (m) return line.replace(/^(\s*)([-*+])\s+\[( |x|X)\]\s/, `$1$2 [$3] <!--l${i}-->`);
      return line;
    })
    .join("\n");
  src = src.replace(/dayflit-image:\/\/([\w.-]+)/g, (_m, name) => (typeof imageUrl === "function" ? imageUrl(name) : name));
  let html = marked.parse(src) as string;
  html = sanitizeHtml(html);
  html = html.replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/a>/gi, (_match, pre, href, post, label) => {
    if (isAudioUrl(href)) {
      const cleanLabel = (label || "Voice memo").replace(/<[^>]*>/g, "").trim();
      return `<span class="dayflit-audio-card my-2 flex flex-col gap-1 rounded-lg border border-border/40 bg-muted/20 p-2 max-w-md"><span class="text-xs font-medium text-muted-foreground">${cleanLabel || "Voice memo"}</span><audio controls src="${href}" preload="none" class="h-8 w-full"></audio></span>`;
    }
    return `<a target="_blank" rel="noopener noreferrer" ${pre}href="${href}"${post}>${label}</a>`;
  });
  html = html.replace(/<li>\s*<input[^>]*type="checkbox"[^>]*(checked)?[^>]*>\s*<!--l(\d+)-->/g, (m, checked, line) => {
    const isChecked = /checked/.test(m);
    return `<li class="task-item" data-line="${line}"><input type="checkbox" ${isChecked ? "checked" : ""} data-line="${line}">`;
  });
  html = html.replace(/<!--l\d+-->/g, "");
  html = html.replace(/<img\s+([^>]*?)src=["']([^"']*)["']([^>]*?)>/g, (_m, pre, src, post) => {
    if (!src || src.trim() === "") {
      return `<span class="img-unavailable-pill" role="status"><span>Image unavailable</span></span>`;
    }
    if (isAudioUrl(src)) {
      return `<audio controls src="${src}" preload="none" class="my-2 h-9 w-full max-w-md block"></audio>`;
    }
    return `<img ${pre}src="${src}" onerror="this.onerror=null;this.classList.add('img-fallback');if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex';" ${post}><span class="img-unavailable-pill" style="display:none;" role="status"><span>Image unavailable</span></span>`;
  });
  return html;
}

/** Toggle the checkbox on a given source line of markdown. */
export function toggleChecklistLine(md: string, line: number): string {
  const lines = md.split("\n");
  const l = lines[line];
  if (!l) return md;
  if (/\[ \]/.test(l)) lines[line] = l.replace("[ ]", "[x]");
  else lines[line] = l.replace(/\[(x|X)\]/, "[ ]");
  return lines.join("\n");
}

export function checklistProgress(md: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of md.split("\n")) {
    if (/^\s*[-*+]\s+\[( |x|X)\]/.test(line)) {
      total++;
      if (/\[(x|X)\]/.test(line)) done++;
    }
  }
  return { done, total };
}

/** Strip all media (dayflit-image, audio), URLs, HTML, wikilinks, and markdown syntax cleanly. */
export function stripMediaAndMarkdown(text: string): string {
  if (!text) return "";
  let s = text;
  // Replace [[type:id|Label]] with Label, and [[Label]] with Label
  s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");
  // Remove markdown images: ![alt](url)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Remove audio links / voice memo links: [Voice memo](url)
  s = s.replace(/\[(?:Voice memo|Voice|Audio)[^\]]*\]\([^)]*\)/gi, "");
  // Remove HTML audio tags
  s = s.replace(/<audio\b[^>]*>[\s\S]*?<\/audio>/gi, "");
  // Remove all HTML tags
  s = s.replace(/<[^>]+>/g, "");
  // Remove dayflit-image:// or dayflitimage:// URIs (with or without surrounding parens)
  s = s.replace(/\(?dayflit-?image:\/\/[^\s)\]]+\)?/gi, "");
  // Remove asset.localhost and asset:// URLs
  s = s.replace(/\(?https?:\/\/asset\.localhost\/[^\s)]+\)?/gi, "");
  s = s.replace(/\(?asset:\/\/[^\s)]+\)?/gi, "");
  // Remove standalone URLs
  s = s.replace(/https?:\/\/[^\s)]+/gi, "");
  // Replace remaining markdown links [label](url) with label
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Remove heading markers (only at start of lines)
  s = s.replace(/^#+\s+/gm, "");
  // Remove task list markers
  s = s.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "");
  // Remove bullet points / numbered lists
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  // Remove blockquote markers
  s = s.replace(/^\s*>\s*/gm, "");
  // Remove code blocks and inline code backticks
  s = s.replace(/```[a-z]*[\s\S]*?```/gi, "");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/`/g, "");
  // Remove bold, italic, strikethrough markdown symbols (*, _, ~) but preserve internal hyphens/words!
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_|~)(.*?)\1/g, "$2");
  s = s.replace(/[*_~]/g, "");
  // Clean empty parens left over from stripped URLs
  s = s.replace(/\(\s*\)/g, "");
  // Normalize whitespace
  s = s.replace(/[ \t]+/g, " ");
  return s.trim();
}

/** Extract all image identifiers/URLs from markdown body and image array. */
export function extractAllImages(body: string, images?: string[]): string[] {
  const result: string[] = [];
  if (Array.isArray(images) && images.length > 0) {
    for (const im of images) {
      if (im && typeof im === "string" && !result.includes(im)) {
        result.push(im);
      }
    }
  }
  if (body) {
    const matches = body.matchAll(/dayflit-?image:\/\/([^\s)\]]+)/g);
    for (const m of matches) {
      if (m[1] && !result.includes(m[1])) {
        result.push(m[1]);
      }
    }
    const imgMatches = body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g);
    for (const m of imgMatches) {
      const url = m[1]?.trim();
      if (url && !url.startsWith("dayflit-image://") && !url.startsWith("dayflitimage://") && !result.includes(url)) {
        result.push(url);
      }
    }
  }
  return result;
}

/** Extract first image identifier/URL from markdown body or image array. */
export function extractFirstImage(body: string, images?: string[]): string | null {
  const all = extractAllImages(body, images);
  return all.length > 0 ? all[0] : null;
}

export interface CleanTitleAndExcerpt {
  title: string;
  excerpt: string;
  hasExplicitTitle: boolean;
}

/**
 * Shared utility for Journal, Notes, Today, and CommandPalette cards.
 * Strips all media/link syntax, truncates derived titles at word boundaries (<=48 chars),
 * prevents paragraph-as-heading repetition by deriving excerpt strictly from lines after title line,
 * and handles image-only entries with calm titles.
 */
export function extractCleanTitleAndExcerpt(
  markdownBody: string,
  fallbackTitle?: string | null,
  options?: {
    hasImages?: boolean;
    defaultImageTitle?: string;
    date?: number | string | Date;
  }
): CleanTitleAndExcerpt {
  const rawBody = markdownBody || "";
  const explicit = (fallbackTitle || "").trim();
  const allImgs = extractAllImages(rawBody);
  const hasMedia = Boolean((options?.hasImages && options.hasImages) || allImgs.length > 0);

  // Split body into lines and clean each line
  const lines = rawBody.split("\n");
  const cleanLines: string[] = [];
  for (const line of lines) {
    const stripped = stripMediaAndMarkdown(line);
    if (stripped.length > 0) {
      cleanLines.push(stripped);
    }
  }

  const formatTimeFallback = (date?: number | string | Date) => {
    if (!date) return "";
    try {
      const d = typeof date === "number" || typeof date === "string" ? new Date(date) : date;
      if (isNaN(d.getTime())) return "";
      return format(d, "h:mm a");
    } catch {
      return "";
    }
  };

  const defaultImageLabel = options?.defaultImageTitle || "Photo Entry";

  // Case 1: User explicitly provided a title
  if (
    explicit &&
    explicit.toLowerCase() !== "untitled" &&
    explicit.toLowerCase() !== "untitled note" &&
    explicit.toLowerCase() !== "untitled entry"
  ) {
    const cleanExplicit = stripMediaAndMarkdown(explicit);
    const tLower = cleanExplicit.toLowerCase();
    // Excerpt comes strictly from cleanLines that don't just restate the explicit title
    const remainingLines = cleanLines.map((l) => {
      const lTrim = l.trim();
      const lLower = lTrim.toLowerCase();
      if (lLower === tLower) return "";
      if (lLower.startsWith(tLower)) {
        return lTrim.slice(tLower.length).replace(/^[\s:–—-]+/, "").trim();
      }
      return lTrim;
    }).filter(Boolean);
    const excerpt = remainingLines.join(" ").slice(0, 160).trim();
    return {
      title: cleanExplicit,
      excerpt,
      hasExplicitTitle: true,
    };
  }

  // Case 2: No explicit title, but clean text lines exist
  if (cleanLines.length > 0) {
    const firstLine = cleanLines[0];
    let title = "";
    if (firstLine.length <= 48) {
      title = firstLine;
    } else {
      const cut = firstLine.slice(0, 48);
      const lastSpace = cut.lastIndexOf(" ");
      title = (lastSpace > 24 ? cut.slice(0, lastSpace) : cut.slice(0, 45)).trim() + "…";
    }

    // Subtitle excerpt is strictly from the remaining text AFTER the title line!
    // Never repeat the exact same first line in both the bold title and the gray subtitle below it!
    const titleClean = title.replace(/…$/, "").trim().toLowerCase();
    const afterTitleLines = cleanLines.slice(1).map((l) => {
      const lTrim = l.trim();
      const lLower = lTrim.toLowerCase();
      if (lLower === titleClean) return "";
      if (lLower.startsWith(titleClean)) {
        return lTrim.slice(titleClean.length).replace(/^[\s:–—-]+/, "").trim();
      }
      return lTrim;
    }).filter(Boolean);

    let excerpt = afterTitleLines.join(" ").slice(0, 160).trim();
    if (!excerpt && cleanLines.length === 1 && firstLine.length > 55) {
      const cutClean = title.replace(/…$/, "").trim();
      const remainder = firstLine.slice(cutClean.length).trim();
      if (remainder.length > 5) {
        excerpt = remainder.slice(0, 160).trim();
      }
    }

    return {
      title,
      excerpt,
      hasExplicitTitle: false,
    };
  }

  // Case 3: Zero text lines, but media/image exists
  if (hasMedia) {
    const timeStr = formatTimeFallback(options?.date);
    const title = timeStr ? `${defaultImageLabel} · ${timeStr}` : defaultImageLabel;
    return {
      title,
      excerpt: "",
      hasExplicitTitle: false,
    };
  }

  // Case 4: Zero text, zero media
  const fallback = options?.defaultImageTitle === "Image Note" ? "Untitled Note" : "Untitled";
  return {
    title: fallback,
    excerpt: "",
    hasExplicitTitle: false,
  };
}

export function plainText(md: string): string {
  return stripMediaAndMarkdown(md);
}

export function firstLineTitle(md: string): string {
  const { title } = extractCleanTitleAndExcerpt(md, null, { defaultImageTitle: "Image Note" });
  return title;
}

