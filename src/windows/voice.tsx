import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { BookOpen, Check, CheckSquare, Copy, Mic, Square, StickyNote, X, AlertCircle, Loader2 } from "lucide-react";
import "@/styles/app.css";
import { ipc, on } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import { applyTheme } from "@/lib/themes";
import { loadCollection } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { formatClock } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { classifyVoice, type VoiceDestination } from "@/lib/voiceIntent";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface Transcript {
  text: string;
  engine: string;
  durationMs: number;
  audio: string | null;
  error: string | null;
}

type Phase = "idle" | "recording" | "transcribing" | "review" | "error";

function VoiceWindow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"hold" | "toggle">("hold");
  const [level, setLevel] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(24).fill(0.05));
  const [elapsed, setElapsed] = useState(0);
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState("");
  const [dest, setDest] = useState<VoiceDestination>("note");
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const startedAt = useRef(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const reloadSettings = async () => {
    const { data } = await loadCollection<Partial<Settings> | null>("settings", null);
    const s = { ...defaultSettings(), ...(data ?? {}) } as Settings;
    applyTheme({ ...defaultSettings().appearance, ...(data?.appearance ?? {}) });
    setSettings(s);
    return s;
  };

  const syncWindowSize = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 48px padding (24px on each side) to comfortably accommodate ambient Gaussian shadow
    // without boundary clipping, plus slight breathing room.
    const pad = 48;
    const h = Math.min(600, Math.max(90, Math.ceil(rect.height) + pad));
    const w = Math.min(650, Math.max(460, Math.ceil(rect.width) + pad));
    void ipc.resizeVoice(w, h).catch(() => {
      void getCurrentWindow().setSize(new LogicalSize(w, h)).catch(() => {});
    });
  }, []);

  // Synchronous and reactive size updates across all phase transitions and text modifications
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let rafId: number | null = null;
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const w = Math.ceil(rect.width);
      const h = Math.ceil(rect.height);
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      lastW = w;
      lastH = h;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        syncWindowSize();
      });
    });
    ro.observe(el);
    syncWindowSize();
    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [phase, syncWindowSize]);

  // Dynamic textarea expansion matching transcribed content
  const adjustTextareaHeight = useCallback(() => {
    if (!ta.current) return;
    ta.current.style.height = "auto";
    const nextH = Math.min(180, Math.max(72, ta.current.scrollHeight));
    ta.current.style.height = `${nextH}px`;
    syncWindowSize();
  }, [syncWindowSize]);

  useEffect(() => {
    if (phase === "review") {
      adjustTextareaHeight();
    }
  }, [text, phase, adjustTextareaHeight]);

  useEffect(() => {
    void reloadSettings();
    const uns: (() => void)[] = [];
    void on<string>("sid://voice/open", (m) => {
      setMode(m === "toggle" ? "toggle" : "hold");
      setPhase("recording");
      setText("");
      setAudio(null);
      setError(null);
      startedAt.current = Date.now();
      setLevels(Array(24).fill(0.05));
      requestAnimationFrame(() => syncWindowSize());
      if (m === "toggle") void ipc.voiceStart().catch((e) => { setError(String(e)); setPhase("error"); });
    }).then((u) => uns.push(u));
    void on<{ level: number }>("sid://voice/level", ({ level }) => {
      setLevel(level);
      setLevels((l) => [...l.slice(1), Math.max(0.05, level)]);
    }).then((u) => uns.push(u));
    void on<string>("sid://voice/state", (s) => {
      if (s === "recording") setPhase("recording");
      else if (s === "transcribing") setPhase("transcribing");
      requestAnimationFrame(() => syncWindowSize());
    }).then((u) => uns.push(u));
    void on<Transcript>("sid://voice/transcript", (t) => void handleTranscript(t)).then((u) => uns.push(u));
    void on<string>("sid://voice/error", (e) => { setError(e); setPhase("error"); requestAnimationFrame(() => syncWindowSize()); }).then((u) => uns.push(u));
    void on<unknown>("sid://settings/changed", () => void reloadSettings()).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => window.clearInterval(t);
  }, [phase]);

  const handleTranscript = async (t: Transcript) => {
    const s = await reloadSettings();
    setEngine(t.engine);
    setAudio(t.audio);
    if (t.error && !t.text) {
      setError(t.error);
      setPhase("error");
      requestAnimationFrame(() => syncWindowSize());
      return;
    }
    const intent = classifyVoice(t.text, s.voice.defaultDestination);
    setText(intent.text);
    setDest(intent.destination);
    if (s.voice.autoSave && s.voice.defaultDestination !== "ask") {
      commit(intent.destination, intent.text, t.audio);
      return;
    }
    setPhase("review");
    requestAnimationFrame(() => {
      syncWindowSize();
      void getCurrentWindow().setFocus().catch(() => {});
      window.setTimeout(() => {
        if (ta.current) {
          ta.current.focus();
          adjustTextareaHeight();
        }
      }, 50);
    });
  };

  const commit = (d: VoiceDestination, t: string, a: string | null) => {
    const trimmed = t.trim();
    if (!trimmed) {
      close();
      return;
    }
    const payload = { destination: d, text: trimmed, audio: a, voice: true };
    void emitTo("main", "sid://voice/commit", payload);
    close();
  };
  const close = () => {
    setPhase("idle");
    void ipc.hideVoice();
  };
  const stopToggle = async () => {
    try {
      const t = await ipc.voiceStop();
      await handleTranscript(t);
    } catch (e) {
      setError(String(e));
      setPhase("error");
      requestAnimationFrame(() => syncWindowSize());
    }
  };
  const copy = async () => {
    await ipc.clipboardWriteText(text).catch(() => {});
    setCopied(true);
    window.setTimeout(() => {
      close();
    }, 450);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "recording") void ipc.voiceCancel();
        close();
      } else if (e.key === "Enter" && !e.shiftKey && phase === "review") {
        e.preventDefault();
        commit(dest, text, audio);
      } else if (e.key === "Enter" && phase === "recording" && mode === "toggle") {
        e.preventDefault();
        void stopToggle();
      } else if (phase === "review" && e.ctrlKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        commit((["task", "note", "journal"] as VoiceDestination[])[parseInt(e.key, 10) - 1], text, audio);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, dest, text, audio, mode]);

  const dests: { id: VoiceDestination; label: string; icon: React.ReactNode; key: string }[] = [
    { id: "task", label: "Task", icon: <CheckSquare size={13} />, key: "Ctrl+1" },
    { id: "note", label: "Note", icon: <StickyNote size={13} />, key: "Ctrl+2" },
    { id: "journal", label: "Journal", icon: <BookOpen size={13} />, key: "Ctrl+3" },
  ];

  const drag = async (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, textarea, input")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="w-fit select-none flex justify-center p-6 bg-transparent">
      <div
        ref={rootRef}
        data-tauri-drag-region
        className="glass relative !rounded-2xl px-4 py-3.5 select-none w-[440px] transition-all duration-200"
        style={{
          background: "rgb(var(--bg) / 0.94)",
          boxShadow: "0 0 0 1px rgb(var(--border) / 0.12), 0 8px 24px -2px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)",
        }}
        onMouseDown={drag}
      >
        {phase === "recording" && (
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
              <span className="absolute inset-0 rounded-full bg-danger/30 animate-pulse" style={{ transform: `scale(${1 + level * 0.6})`, transition: "transform 80ms" }} />
              <Mic size={18} className="relative" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[0.85em] font-medium">
                {mode === "hold" ? "Listening… release to finish" : "Listening…"}
                <span className="tabular text-faint">{formatClock(elapsed / 1000)}</span>
              </div>
              <div className="mt-1 flex h-5 items-end gap-[2px]">
                {levels.map((v, i) => (
                  <span key={i} className="w-[6px] rounded-sm bg-accent" style={{ height: `${Math.max(8, v * 100)}%`, opacity: 0.4 + v * 0.6 }} />
                ))}
              </div>
            </div>
            {mode === "toggle" && (
              <button className="btn btn-primary btn-sm" onClick={() => void stopToggle()}>
                <Square size={12} /> Done
              </button>
            )}
            <button className="btn btn-ghost btn-icon btn-sm text-faint hover:text-text !p-1 !h-6 !w-6" onClick={() => { void ipc.voiceCancel(); close(); }} aria-label="Cancel">
              <X size={14} />
            </button>
          </div>
        )}
        {phase === "transcribing" && (
          <div className="flex items-center justify-between gap-3 text-[0.9em]">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="spin text-accent" />
              <span className="font-medium text-text">Transcribing audio…</span>
              <span className="text-[0.8em] text-faint capitalize">{settings.voice.engine === "windows" ? "Windows speech" : "offline model"}</span>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm text-faint hover:text-text !p-1 !h-6 !w-6" onClick={() => { void ipc.voiceCancel(); close(); }} aria-label="Cancel">
              <X size={14} />
            </button>
          </div>
        )}
        {phase === "review" && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[0.82em] text-muted">
              <span className="font-semibold text-text flex items-center gap-1.5">
                <Mic size={13} className="text-accent" /> Voice captured
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[0.72em] px-2 py-0.5 rounded-full bg-surface-2/60 border border-border/10 text-faint capitalize font-medium">
                  {engine === "whisper" ? "offline whisper" : engine || "transcribed"}
                  {audio ? " · memo saved" : ""}
                </span>
                <button
                  className="btn btn-ghost btn-icon btn-sm text-faint hover:text-text !p-1 !h-6 !w-6"
                  onClick={close}
                  aria-label="Close"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <textarea
              ref={ta}
              className="input text-[0.93em] leading-relaxed resize-none transition-all duration-150 overflow-y-auto rounded-xl bg-surface/50 border border-border/15 focus:border-accent/40 focus:bg-surface/80 px-3 py-2"
              style={{ minHeight: "72px", maxHeight: "180px" }}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                adjustTextareaHeight();
              }}
              rows={3}
              placeholder="Captured transcript..."
            />
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5 shrink-0">
                {dests.map((d) => (
                  <button
                    key={d.id}
                    className={cn(
                      "btn btn-sm !h-7 px-2.5 text-[0.8em] font-medium transition-all duration-150",
                      dest === d.id ? "btn-primary shadow-sm" : "hover:bg-surface-2"
                    )}
                    onClick={() => commit(d.id, text, audio)}
                    aria-label={`Save as ${d.label}`}
                    title={`Save as ${d.label} (${d.key})`}
                  >
                    {d.icon} {d.label}
                  </button>
                ))}
                <button
                  className={cn(
                    "btn btn-ghost btn-sm !h-7 px-2 flex items-center gap-1 text-muted hover:text-text transition-all",
                    copied && "!text-success"
                  )}
                  onClick={() => void copy()}
                  aria-label="Copy text"
                  title="Copy text to clipboard"
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-success" />
                      <span className="text-[0.72em] font-medium text-success">Copied</span>
                    </>
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
              <div className="text-[0.72em] text-faint truncate text-right">
                Enter saves as <span className="text-text font-medium capitalize">{dest}</span>
              </div>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="flex items-start gap-2 text-[0.88em]">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Couldn't transcribe</div>
              <div className="text-muted">{error}</div>
              {audio && <div className="mt-1 text-faint">The recording was kept; add it to a journal entry from Settings → Voice.</div>}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm !p-1 !h-6 !w-6" onClick={close} aria-label="Close">
              <X size={14} />
            </button>
          </div>
        )}
        {phase === "idle" && <div className="text-[0.85em] text-faint">Hold {settings.shortcuts["voice-capture"] || "the voice key"} and speak.</div>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Voice Capture Error">
      <VoiceWindow />
    </ErrorBoundary>
  </StrictMode>,
);
