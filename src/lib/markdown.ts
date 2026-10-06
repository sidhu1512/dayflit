import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });


/** Convert `dayflit-image://name` references into asset URLs before rendering. */
export function renderMarkdown(md: string, imageUrl: (name: string) => string): string {
  let src = md;
  // task list items get data-line so clicks can toggle them
  const lines = src.split("\n");
  src = lines
    .map((line, i) => {
      const m = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s/);
      if (m) return line.replace(/^(\s*)([-*+])\s+\[( |x|X)\]\s/, `$1$2 [$3] <!--l${i}-->`);
      return line;
    })
    .join("\n");
  src = src.replace(/dayflit-image:\/\/([\w.-]+)/g, (_m, name) => imageUrl(name));
  let html = marked.parse(src) as string;
  html = html.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
  html = html.replace(/<li>\s*<input[^>]*type="checkbox"[^>]*(checked)?[^>]*>\s*<!--l(\d+)-->/g, (m, checked, line) => {
    const isChecked = /checked/.test(m);
    return `<li class="task-item" data-line="${line}"><input type="checkbox" ${isChecked ? "checked" : ""} data-line="${line}">`;
  });
  html = html.replace(/<!--l\d+-->/g, "");
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target", "data-line"], ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|asset|http:\/\/asset\.localhost|dayflit-image):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i });
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

export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstLineTitle(md: string): string {
  const first = md.split("\n").find((l) => l.trim().length > 0) ?? "";
  return plainText(first).slice(0, 80);
}
