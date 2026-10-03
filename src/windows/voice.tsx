import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { BookOpen, CheckSquare, Copy, Mic, Square, StickyNote, X, AlertCircle, Loader2 } from "lucide-react";
import "@/styles/app.css";
import { ipc, on } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import { applyTheme } from "@/lib/themes";
import { loadCollection } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { formatClock } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { classifyVoice, type VoiceDestination } from "@/lib/voiceIntent";

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
      if (m === "toggle") void ipc.voiceStart().catch((e) => { setError(String(e)); setPhase("error"); });
    }).then((u) => uns.push(u));
    void on<{ level: number }>("sid://voice/level", ({ level }) => {
      setLevel(level);
      setLevels((l) => [...l.slice(1), Math.max(0.05, level)]);
    }).then((u) => uns.push(u));
    void on<string>("sid://voice/state", (s) => {
      if (s === "recording") setPhase("recording");
      else if (s === "transcribing") setPhase("transcribing");
    }).then((u) => uns.push(u));
    void on<Transcript>("sid://voice/transcript", (t) => void handleTranscript(t)).then((u) => uns.push(u));
    void on<string>("sid://voice/error", (e) => { setError(e); setPhase("error"); }).then((u) => uns.push(u));
    void on<unknown>("sid://settings/changed", () => void reloadSettings()).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => window.clearInterval(t);
  }, [phase]);

  // size window to content
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = Math.min(420, Math.max(90, Math.ceil(el.getBoundingClientRect().height) + 16));
      void getCurrentWindow().setSize(new LogicalSize(420, h)).catch(() => {});
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleTranscript = async (t: Transcript) => {
    const s = await reloadSettings();
    setEngine(t.engine);
    setAudio(t.audio);
    if (t.error && !t.text) {
      setError(t.error);
      setPhase("error");
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
    await getCurrentWindow().setFocus().catch(() => {});
    window.setTimeout(() => ta.current?.focus(), 50);
  };

  const commit = (d: VoiceDestination, t: string, a: string | null) => {
    const payload = { destination: d, text: t.trim(), audio: a, voice: true };
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
    }
  };
  const copy = async () => {
    await ipc.clipboardWriteText(text).catch(() => {});
    close();
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

  return (
    <div className="w-full p-2">
      <div ref={rootRef} className="glass !rounded-2xl px-4 py-3 shadow-2xl" style={{ background: "rgb(var(--bg) / 0.94)" }}>
        {phase === "recording" && (
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
              <span className="absolute inset-0 rounded-full bg-danger/30" style={{ transform: `scale(${1 + level * 0.6})`, transition: "transform 80ms" }} />
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
            <button className="btn btn-ghost btn-icon btn-sm text-faint" onClick={() => { void ipc.voiceCancel(); close(); }} aria-label="Cancel">
              <X size={14} />
            </button>
          </div>
        )}
        {phase === "transcribing" && (
          <div className="flex items-center gap-3 text-[0.9em]">
            <Loader2 size={18} className="spin text-accent" />
            <span>Transcribing…</span>
            <span className="text-faint">{settings.voice.engine === "windows" ? "Windows speech" : "offline"}</span>
          </div>
        )}
        {phase === "review" && (
          <div className="flex flex-col gap-2">
            <textarea ref={ta} className="input min-h-[64px] text-[0.95em]" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            <div className="flex items-center gap-1.5">
              {dests.map((d) => (
                <button key={d.id} className={cn("btn btn-sm", dest === d.id && "btn-primary")} onClick={() => commit(d.id, text, audio)} aria-label={`Save as ${d.label}`}>
                  {d.icon} {d.label}
                </button>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => void copy()} aria-label="Copy text">
                <Copy size={13} />
              </button>
              <div className="flex-1" />
              <span className="text-[0.7em] text-faint">
                Enter saves as {dest} · {engine === "whisper" ? "offline" : engine}
                {audio ? " · audio kept" : ""}
              </span>
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
            <button className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label="Close">
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
    <VoiceWindow />
  </StrictMode>,
);
