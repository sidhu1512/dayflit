import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  CheckSquare,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Layers,
  Link2,
  Pin,
  Quote,
  Sparkles,
  StickyNote,
  Trash2,
  Wand2,
} from "lucide-react";
import { isColorString, parseColor, parseQuoteString, type ColorAnalysis } from "@/lib/colorUtils";
import { ipc, isTauri } from "@/lib/ipc";
import { openExternal } from "@/lib/open";
import { useCanvas } from "@/stores/canvas";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/ids";
import type { Clip, LifeResource, LinkPreview } from "@/lib/types";

export type SmartObjectType = "auto" | "color" | "link" | "quote" | "code" | "text" | "image";

export interface SmartObjectCardProps {
  content?: string;
  url?: string;
  title?: string;
  author?: string;
  type?: SmartObjectType;
  clip?: Clip;
  resource?: LifeResource;
  onDelete?: () => void;
  onEdit?: () => void;
  onConvert?: (as: "task" | "note") => void;
  className?: string;
}

// In-memory cache for scraped link metadata to prevent redundant network calls
const linkMetadataCache = new Map<string, LinkPreview>();
const linkMetadataInflight = new Map<string, Promise<LinkPreview>>();

function isUrlString(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(t);
}

function isQuoteString(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return (
    (t.startsWith('"') && t.endsWith('"') && t.length > 3) ||
    (t.startsWith('“') && t.endsWith('”') && t.length > 3) ||
    (t.startsWith("'") && t.endsWith("'") && t.length > 5)
  );
}

function isCodeString(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  // Check for JSON
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      JSON.parse(t);
      return true;
    } catch {}
  }
  // Check for code signatures
  const codeKeywords = [
    "function",
    "const ",
    "let ",
    "var ",
    "import ",
    "export ",
    "interface ",
    "class ",
    "def ",
    "return ",
    "=>",
    "<div>",
    "</",
    "fn ",
    "pub ",
    "struct ",
    "impl ",
  ];
  const hasCodeKeywords = codeKeywords.some((kw) => t.includes(kw));
  const hasMultipleLines = t.includes("\n");
  const hasBraces = (t.includes("{") && t.includes("}")) || (t.includes("(") && t.includes(")"));
  return hasCodeKeywords || (hasMultipleLines && hasBraces && t.length > 20);
}

export function SmartObjectCard({
  content: rawContent,
  url: rawUrl,
  title: rawTitle,
  author: rawAuthor,
  type = "auto",
  clip,
  resource,
  onDelete,
  onEdit,
  onConvert,
  className,
}: SmartObjectCardProps) {
  const toast = useUi((s) => s.toast);
  const navigate = useUi((s) => s.navigate);

  const text = (rawContent ?? clip?.text ?? resource?.content ?? "").trim();
  const directUrl = (rawUrl ?? (resource?.type === "link" ? resource.url : undefined) ?? (isUrlString(text) ? text : undefined))?.trim();

  // Quote detection & extraction
  const parsedQuote = useMemo(() => {
    const fromText = parseQuoteString(text);
    if (fromText) return fromText;
    if (resource?.type === "quote" || isQuoteString(text)) {
      const cleanQuote = text.replace(/^["“']|["”']$/g, "").trim();
      return { quote: cleanQuote, author: rawAuthor || resource?.author };
    }
    return null;
  }, [text, resource, rawAuthor]);

  // Resolved Smart Object Kind
  const resolvedKind: SmartObjectType = useMemo(() => {
    if (type !== "auto") return type;
    if (clip?.kind === "image") return "image";
    if (directUrl || clip?.kind === "link" || isUrlString(text)) return "link";
    if (isColorString(text)) return "color";
    if (resource?.type === "quote" || parsedQuote !== null || isQuoteString(text)) return "quote";
    if (isCodeString(text)) return "code";
    return "text";
  }, [type, clip, resource, directUrl, text, parsedQuote]);

  // Color Analysis (if color)
  const colorAnalysis: ColorAnalysis | null = useMemo(() => {
    if (resolvedKind === "color" || isColorString(text)) {
      return parseColor(text);
    }
    return null;
  }, [resolvedKind, text]);

  // Link Scraper State
  const targetUrl = directUrl || (resolvedKind === "link" ? text : null);
  const [linkMeta, setLinkMeta] = useState<LinkPreview | null>(() => {
    if (targetUrl && linkMetadataCache.has(targetUrl)) {
      return linkMetadataCache.get(targetUrl)!;
    }
    return null;
  });
  const [linkLoading, setLinkLoading] = useState(false);

  useEffect(() => {
    if (!targetUrl) return;
    if (linkMetadataCache.has(targetUrl)) {
      setLinkMeta(linkMetadataCache.get(targetUrl)!);
      return;
    }

    setLinkLoading(true);
    let promise = linkMetadataInflight.get(targetUrl);
    if (!promise) {
      promise = ipc.scrapeLinkMetadata(targetUrl).catch(() => {
        // Fallback preview
        try {
          const u = new URL(targetUrl);
          return {
            url: targetUrl,
            finalUrl: targetUrl,
            title: u.hostname,
            description: "",
            siteName: u.hostname,
            kind: "page",
            fetchedAt: Date.now(),
          } as LinkPreview;
        } catch {
          return {
            url: targetUrl,
            finalUrl: targetUrl,
            title: targetUrl,
            description: "",
            siteName: targetUrl,
            kind: "page",
            fetchedAt: Date.now(),
          } as LinkPreview;
        }
      });
      linkMetadataInflight.set(targetUrl, promise);
    }

    promise.then((res) => {
      linkMetadataCache.set(targetUrl, res);
      linkMetadataInflight.delete(targetUrl);
      setLinkMeta(res);
      setLinkLoading(false);
    });
  }, [targetUrl]);

  // Copied state indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = async (val: string, key = "default") => {
    try {
      if (isTauri) await ipc.clipboardWriteText(val);
      else await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      toast({ title: "Copied to clipboard", kind: "success", ttl: 1500 });
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      toast({ title: "Failed to copy", kind: "error" });
    }
  };

  // Format JSON if code is JSON
  const [formattedCode, setFormattedCode] = useState<string | null>(null);
  const isJson = useMemo(() => {
    if (resolvedKind !== "code") return false;
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }, [resolvedKind, text]);

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(text);
      const pretty = JSON.stringify(parsed, null, 2);
      setFormattedCode(pretty);
    } catch {
      toast({ title: "Invalid JSON format", kind: "error" });
    }
  };

  // Send to Infinite Canvas action
  const handleSendToCanvas = () => {
    const canvasStore = useCanvas.getState();
    let board = canvasStore.boards.find((b) => b.id === canvasStore.activeBoardId) || canvasStore.boards[0];

    if (!board) {
      board = canvasStore.createBoard("Main Canvas");
    }

    const startX = 140 + Math.floor(Math.random() * 200);
    const startY = 120 + Math.floor(Math.random() * 200);

    if (resolvedKind === "color" && colorAnalysis) {
      canvasStore.addNode(board.id, {
        type: "text",
        x: startX,
        y: startY,
        width: 240,
        height: 180,
        color: "3", // amber / accent
        text: `🎨 Color Swatch\n\n${colorAnalysis.hex.toUpperCase()}\n${colorAnalysis.rgb}\n${colorAnalysis.hsl}\nContrast: ${colorAnalysis.contrastOnWhite}:1`,
        data: { subType: "sticky", stickyColor: "amber" },
      });
    } else if (resolvedKind === "link" && targetUrl) {
      canvasStore.addNode(board.id, {
        type: "link",
        x: startX,
        y: startY,
        width: 340,
        height: 220,
        url: targetUrl,
        label: linkMeta?.title || rawTitle || targetUrl,
      });
    } else if (resolvedKind === "quote") {
      const cleanQuote = parsedQuote?.quote || text.replace(/^["“']|["”']$/g, "").trim();
      const quoteAuthor = parsedQuote?.author || rawAuthor || resource?.author || "";
      canvasStore.addNode(board.id, {
        type: "text",
        x: startX,
        y: startY,
        width: 320,
        height: 180,
        color: "6", // violet
        text: `“${cleanQuote}”\n\n— ${quoteAuthor || "Anonymous"}`,
        data: { subType: "sticky", stickyColor: "violet" },
      });
    } else if (resolvedKind === "code") {
      canvasStore.addNode(board.id, {
        type: "text",
        x: startX,
        y: startY,
        width: 380,
        height: 260,
        color: "5", // sky
        text: `\`\`\`\n${formattedCode || text}\n\`\`\``,
      });
    } else {
      canvasStore.addNode(board.id, {
        type: "text",
        x: startX,
        y: startY,
        width: 260,
        height: 160,
        text: text,
      });
    }

    toast({
      title: "Sent to Infinite Canvas",
      body: `Added to ${board.name}`,
      kind: "success",
      action: {
        label: "Open Canvas",
        onClick: () => navigate("canvas", board.id),
      },
    });
  };

  // =========================================================================
  // CARD VARIANT 1: BESPOKE COLOR SWATCH CARD
  // =========================================================================
  if (resolvedKind === "color" && colorAnalysis) {
    return (
      <div
        className={cn(
          "card group relative flex flex-col overflow-hidden border hairline transition-all hover:border-accent/40 hover:shadow-md",
          className,
        )}
      >
        {/* Color Surface Top Block */}
        <div
          className="relative flex h-24 w-full items-end justify-between p-3.5 transition-transform group-hover:scale-[1.01]"
          style={{ background: colorAnalysis.hex }}
        >
          {/* Contrast Badges */}
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-md px-2 py-0.5 text-[0.68em] font-bold shadow-xs backdrop-blur-md"
              style={{
                background: "rgba(0,0,0,0.55)",
                color: "#ffffff",
              }}
            >
              On Dark: {colorAnalysis.contrastOnBlack}:1 ({colorAnalysis.wcagBlackRating})
            </span>
            <span
              className="rounded-md px-2 py-0.5 text-[0.68em] font-bold shadow-xs backdrop-blur-md"
              style={{
                background: "rgba(255,255,255,0.75)",
                color: "#000000",
              }}
            >
              On Light: {colorAnalysis.contrastOnWhite}:1 ({colorAnalysis.wcagWhiteRating})
            </span>
          </div>

          {/* Quick Copy Primary Button */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg shadow-sm backdrop-blur-md transition-transform active:scale-95"
            style={{
              background: "rgba(255,255,255,0.85)",
              color: "#000000",
            }}
            onClick={() => copyToClipboard(colorAnalysis.hex, "swatch")}
            aria-label="Copy Hex Color"
          >
            {copiedKey === "swatch" ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
          </button>
        </div>

        {/* Color Data & Harmony Strip */}
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[1.05em] font-bold text-text tabular tracking-tight">
                {colorAnalysis.hex.toUpperCase()}
              </div>
              <div className="text-[0.72em] text-muted font-mono">
                {colorAnalysis.rgb} · {colorAnalysis.hsl}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn btn-xs btn-ghost text-muted hover:text-text"
                onClick={() => copyToClipboard(colorAnalysis.rgb, "rgb")}
              >
                RGB
              </button>
              <button
                className="btn btn-xs btn-ghost text-muted hover:text-text"
                onClick={() => copyToClipboard(colorAnalysis.hsl, "hsl")}
              >
                HSL
              </button>
            </div>
          </div>

          {/* Auto-Generated Harmony Chips */}
          <div>
            <div className="mb-1 text-[0.68em] font-semibold uppercase tracking-wider text-faint">
              Color Harmonies & Chips
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scroll-none">
              {colorAnalysis.harmonies.map((h, i) => (
                <button
                  key={i}
                  className="group/chip flex items-center gap-1.5 rounded-lg border hairline bg-surface-2/60 px-2 py-1 text-[0.72em] transition hover:bg-surface-2"
                  onClick={() => copyToClipboard(h.hex, `harmony-${i}`)}
                  title={`${h.name} (${h.hex})`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full shadow-xs"
                    style={{ background: h.hex }}
                  />
                  <span className="font-mono text-text/90">{h.hex}</span>
                  {copiedKey === `harmony-${i}` && <Check size={10} className="text-accent" />}
                </button>
              ))}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between gap-1 border-t hairline pt-2 mt-0.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              <button
                className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
                onClick={handleSendToCanvas}
              >
                <Layers size={11} /> Send to Canvas
              </button>
              {onConvert && (
                <>
                  <button
                    className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
                    onClick={() => onConvert("note")}
                  >
                    <StickyNote size={11} /> Note
                  </button>
                  <button
                    className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
                    onClick={() => onConvert("task")}
                  >
                    <CheckSquare size={11} /> Task
                  </button>
                </>
              )}
            </div>

            {onDelete && (
              <button
                className="btn btn-xs btn-ghost text-faint hover:text-danger"
                onClick={onDelete}
                aria-label="Delete swatch"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CARD VARIANT 2: AUTO-SCRAPED RICH WEB BOOKMARK CARD (MyMind Style)
  // =========================================================================
  if (resolvedKind === "link" && targetUrl) {
    let domain = targetUrl;
    try {
      domain = new URL(targetUrl).hostname.replace(/^www\./, "");
    } catch {}

    const displayTitle = linkMeta?.title || rawTitle || domain;
    const displayDesc = linkMeta?.description || "";
    const coverImage = linkMeta?.image;

    return (
      <div
        className={cn(
          "card group relative flex flex-col overflow-hidden border hairline transition-all hover:border-accent/40 hover:shadow-md",
          className,
        )}
      >
        {/* Cover Image if available */}
        {coverImage ? (
          <div className="relative h-36 w-full overflow-hidden bg-surface-2/80">
            <img
              src={coverImage}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            {/* Domain pill overlaid on top-left of image */}
            <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-surface/85 px-2.5 py-0.5 text-[0.7em] font-medium text-text shadow-sm backdrop-blur-md">
              {linkMeta?.favicon ? (
                <img
                  src={linkMeta.favicon}
                  alt=""
                  className="h-3 w-3 rounded-xs"
                  onError={(e) => ((e.currentTarget as HTMLElement).style.display = "none")}
                />
              ) : (
                <Globe size={11} className="text-accent" />
              )}
              <span className="truncate max-w-[140px]">{linkMeta?.siteName || domain}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between border-b hairline bg-surface-2/40 px-3.5 py-2">
            <div className="flex items-center gap-2 text-[0.74em] font-medium text-muted">
              {linkMeta?.favicon ? (
                <img
                  src={linkMeta.favicon}
                  alt=""
                  className="h-3.5 w-3.5 rounded-xs"
                  onError={(e) => ((e.currentTarget as HTMLElement).style.display = "none")}
                />
              ) : (
                <Globe size={13} className="text-accent" />
              )}
              <span className="truncate">{linkMeta?.siteName || domain}</span>
            </div>
            {linkLoading && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />}
          </div>
        )}

        {/* Content body */}
        <div className="flex flex-1 flex-col justify-between p-3.5">
          <div>
            <h3 className="line-clamp-2 text-[0.92em] font-semibold text-text leading-snug">
              {displayTitle}
            </h3>
            {displayDesc && (
              <p className="mt-1 line-clamp-2 text-[0.78em] text-muted leading-relaxed">
                {displayDesc}
              </p>
            )}
          </div>

          {/* Action Bar */}
          <div className="mt-3 flex items-center justify-between gap-1 border-t hairline pt-2.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
              <button
                className="btn btn-xs btn-primary flex items-center gap-1 text-[0.74em]"
                onClick={handleSendToCanvas}
              >
                <Layers size={11} /> Send to Canvas
              </button>
              <button
                className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
                onClick={() => openExternal(targetUrl)}
              >
                <ExternalLink size={11} /> Open
              </button>
              <button
                className="btn btn-xs btn-ghost text-muted hover:text-text"
                onClick={() => copyToClipboard(targetUrl, "url")}
                title="Copy URL"
              >
                {copiedKey === "url" ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
              </button>
            </div>

            {onDelete && (
              <button
                className="btn btn-xs btn-ghost text-faint hover:text-danger"
                onClick={onDelete}
                aria-label="Delete bookmark"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CARD VARIANT 3: EDITORIAL QUOTE CARD
  // =========================================================================
  if (resolvedKind === "quote") {
    const cleanQuote = parsedQuote?.quote || text.replace(/^["“']|["”']$/g, "").trim();
    const displayAuthor = parsedQuote?.author || rawAuthor || resource?.author || "";

    return (
      <div
        className={cn(
          "card group relative flex flex-col justify-between overflow-hidden border hairline p-4 transition-all hover:border-accent/40 hover:shadow-md",
          className,
        )}
      >
        {/* Subtle decorative quotation mark in background */}
        <span
          className="absolute right-3 top-1 select-none font-serif text-6xl leading-none text-accent/10 pointer-events-none"
          aria-hidden="true"
        >
          “
        </span>

        <div className="relative z-10 mb-3">
          <div className="flex items-center gap-1.5 text-[0.7em] font-semibold uppercase tracking-wider text-accent mb-2">
            <Quote size={12} /> Wisdom & Reflection
          </div>
          <blockquote className="font-serif text-[1.02em] italic text-text/95 leading-relaxed">
            “{cleanQuote}”
          </blockquote>
          {displayAuthor && (
            <div className="mt-2 text-[0.76em] font-medium text-muted tracking-wide">
              — {displayAuthor}
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="relative z-10 flex items-center justify-between gap-1 border-t hairline pt-2 min-w-0">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
            <button
              className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
              onClick={handleSendToCanvas}
            >
              <Layers size={11} /> Send to Canvas
            </button>
            <button
              className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
              onClick={() => copyToClipboard(`“${cleanQuote}”${displayAuthor ? ` — ${displayAuthor}` : ""}`, "quote")}
            >
              {copiedKey === "quote" ? <Check size={11} className="text-accent" /> : <Copy size={11} />} Copy
            </button>
          </div>

          {onDelete && (
            <button
              className="btn btn-xs btn-ghost text-faint hover:text-danger"
              onClick={onDelete}
              aria-label="Delete quote"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // CARD VARIANT 4: CODE SNIPPET CARD
  // =========================================================================
  if (resolvedKind === "code") {
    const codeToShow = formattedCode || text;

    return (
      <div
        className={cn(
          "card group relative flex flex-col overflow-hidden border hairline transition-all hover:border-accent/40 hover:shadow-md",
          className,
        )}
      >
        {/* Code Header Bar */}
        <div className="flex items-center justify-between border-b hairline bg-surface-2/60 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Code2 size={13} className="text-accent" />
            <span className="text-[0.72em] font-mono font-semibold uppercase text-muted">
              {isJson ? "JSON Payload" : "Code Snippet"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isJson && (
              <button
                className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.72em] text-accent hover:bg-accent/10"
                onClick={handleFormatJson}
              >
                <Wand2 size={11} /> Format JSON
              </button>
            )}
            <button
              className="btn btn-xs btn-ghost text-muted hover:text-text"
              onClick={() => copyToClipboard(codeToShow, "code")}
              title="Copy Code"
            >
              {copiedKey === "code" ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
            </button>
          </div>
        </div>

        {/* Monospace Code Body */}
        <pre className="scroll max-h-48 overflow-auto p-3 font-mono text-[0.78em] text-text/90 leading-relaxed bg-surface/50">
          <code>{codeToShow}</code>
        </pre>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-1 border-t hairline p-2.5 min-w-0">
          <button
            className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text shrink-0"
            onClick={handleSendToCanvas}
          >
            <Layers size={11} /> Send to Canvas
          </button>

          {onDelete && (
            <button
              className="btn btn-xs btn-ghost text-faint hover:text-danger shrink-0"
              onClick={onDelete}
              aria-label="Delete code"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // CARD VARIANT 5: STANDARD TEXT / RESOURCE CARD
  // =========================================================================
  return (
    <div
      className={cn(
        "card group relative flex flex-col justify-between overflow-hidden border hairline p-3.5 transition-all hover:border-accent/40 hover:shadow-md",
        className,
      )}
    >
      <div>
        {rawTitle && (
          <h4 className="text-[0.9em] font-semibold text-text line-clamp-1 mb-1">{rawTitle}</h4>
        )}
        <p className="selectable whitespace-pre-wrap break-words text-[0.84em] text-text/90 leading-relaxed line-clamp-3">
          {text}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-1 border-t hairline pt-2 min-w-0">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
          <button
            className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
            onClick={handleSendToCanvas}
          >
            <Layers size={11} /> Canvas
          </button>
          {onConvert && (
            <>
              <button
                className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
                onClick={() => onConvert("task")}
              >
                <CheckSquare size={11} /> Task
              </button>
              <button
                className="btn btn-xs btn-ghost flex items-center gap-1 text-[0.74em] text-muted hover:text-text"
                onClick={() => onConvert("note")}
              >
                <StickyNote size={11} /> Note
              </button>
            </>
          )}
          <button
            className="btn btn-xs btn-ghost text-muted hover:text-text"
            onClick={() => copyToClipboard(text, "text")}
          >
            {copiedKey === "text" ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
          </button>
        </div>

        {onDelete && (
          <button
            className="btn btn-xs btn-ghost text-faint hover:text-danger shrink-0"
            onClick={onDelete}
            aria-label="Delete item"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
