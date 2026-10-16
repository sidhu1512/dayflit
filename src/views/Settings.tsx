import { useEffect, useState } from "react";
import { BookOpen, Check, Database, Mic, Download, EyeOff, FileDown, FolderOpen, HardDriveDownload, Keyboard, Link2, Music, Palette, Plus, RefreshCw, RotateCcw, Trash2, X, AppWindow, Timer, Bell, CalendarDays, Clipboard as ClipboardIcon, Info } from "lucide-react";
import { useSettings, SHORTCUT_ACTIONS, DEFAULT_SHORTCUTS, SYSTEM_RESERVED_SHORTCUTS } from "@/stores/settings";
import { useCalendar } from "@/stores/calendar";
import { useMedia } from "@/stores/media";
import { useJournal } from "@/stores/journal";
import { exportToMarkdown } from "@/lib/runAction";
import { useUpdater } from "@/lib/updater";
import { sha256Hex } from "@/lib/crypto";
import { useUi } from "@/stores/ui";
import { THEMES, ACCENT_PRESETS } from "@/lib/themes";
import { ipc, isTauri, on, type BackupInfo, type DataDirInfo, type VoiceStatus, type SyncStatus, type RemoteCalendar } from "@/lib/ipc";
import { acceleratorOf } from "@/lib/hotkeys";
import { AMBIENT_OPTIONS } from "@/lib/audio";
import { Toggle } from "@/components/FocusPanel";
import { Kbd } from "@/components/Kbd";
import { openExternal } from "@/lib/open";
import { cn } from "@/lib/ids";
import { useElementWidth } from "@/lib/useElementWidth";
import { InfoHint } from "@/components/ui/InfoHint";
import { TruncatedText } from "@/components/ui/ThemedTooltip";
import type { Settings } from "@/lib/types";

type SectionId = "appearance" | "window" | "focus" | "distraction" | "journal" | "voice" | "media" | "updates" | "clipboard" | "calendar" | "tasks" | "notifications" | "shortcuts" | "data" | "about";
const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={14} /> },
  { id: "window", label: "Window", icon: <AppWindow size={14} /> },
  { id: "focus", label: "Focus", icon: <Timer size={14} /> },
  { id: "distraction", label: "Distractions", icon: <EyeOff size={14} /> },
  { id: "journal", label: "Journal", icon: <BookOpen size={14} /> },
  { id: "voice", label: "Voice", icon: <Mic size={14} /> },
  { id: "media", label: "Media & Spotify", icon: <Music size={14} /> },
  { id: "clipboard", label: "Clipboard", icon: <ClipboardIcon size={14} /> },
  { id: "calendar", label: "Calendars", icon: <CalendarDays size={14} /> },
  { id: "tasks", label: "Tasks", icon: <Check size={14} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={14} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={14} /> },
  { id: "data", label: "Data & backups", icon: <Database size={14} /> },
  { id: "updates", label: "Updates", icon: <RefreshCw size={14} /> },
  { id: "about", label: "About", icon: <Info size={14} /> },
];

export function SettingsView() {
  const viewParam = useUi((s) => s.viewParam);
  const [section, setSection] = useState<SectionId>("appearance");
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const iconOnly = width > 0 && width < 520;
  useEffect(() => {
    if (viewParam && SECTIONS.some((s) => s.id === viewParam)) {
      setSection(viewParam as SectionId);
      useUi.getState().navigate("settings", null);
    }
  }, [viewParam]);
  return (
    <div ref={ref} className="flex h-full">
      <div className={cn("scroll shrink-0 border-r hairline px-1.5 py-1", iconOnly ? "w-[44px]" : "w-[136px]")}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={cn(
              "w-full text-left flex items-center gap-2.5 px-2.5 h-8 rounded-lg min-w-0 whitespace-nowrap overflow-hidden transition-colors relative z-1",
              iconOnly && "justify-center !px-0",
              section === s.id ? "bg-accent/15 text-accent font-semibold" : "text-muted hover:bg-surface-2/70 hover:text-text"
            )}
            data-active={section === s.id}
            onClick={() => setSection(s.id)}
            aria-label={s.label}
          >
            <span className="shrink-0">{s.icon}</span>
            {!iconOnly && <TruncatedText text={s.label} side="right" className="truncate flex-1 min-w-0 text-left text-[0.84em]" />}
          </button>
        ))}
      </div>
      <div className="scroll flex-1 px-4 pb-4 pt-1">
        {section === "appearance" && <Appearance />}
        {section === "window" && <WindowSection />}
        {section === "focus" && <FocusSection />}
        {section === "distraction" && <DistractionSection />}
        {section === "journal" && <JournalSection />}
        {section === "voice" && <VoiceSection />}
        {section === "media" && <MediaSection />}
        {section === "clipboard" && <ClipboardSection />}
        {section === "calendar" && <CalendarSection />}
        {section === "tasks" && <TasksSection />}
        {section === "notifications" && <NotificationsSection />}
        {section === "shortcuts" && <ShortcutsSection />}
        {section === "data" && <DataSection />}
        {section === "updates" && <UpdatesSection />}
        {section === "about" && <About />}
      </div>
    </div>
  );
}

function H({ children, sub }: { children: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="text-[1.05em] font-semibold">{children}</div>
      {sub && <InfoHint text={sub} />}
    </div>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 h-9 min-w-0 py-1">
      <div className="flex items-center gap-1.5 min-w-0 truncate">
        <TruncatedText text={label} side="top" className="text-[0.9em] font-medium text-text truncate flex-1 min-w-0" />
        {hint && <InfoHint text={hint} />}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap rounded-lg bg-surface-2/60 p-0.5">
      {options.map((o) => (
        <button key={o.id} className={cn("rounded-md px-2 py-0.5 text-[0.8em] transition-colors", value === o.id ? "bg-surface-3 text-text font-medium" : "text-muted hover:text-text")} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
function Slider({ value, min, max, step, onChange, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="flex w-40 items-center gap-2">
      <input type="range" className="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="w-10 text-right text-[0.78em] tabular text-muted">{format ? format(value) : value}</span>
    </div>
  );
}

function useS() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  return { s: settings, u: update };
}

function Appearance() {
  const { s, u } = useS();
  const a = s.appearance;
  return (
    <div>
      <H sub="Themes, materials and density. Everything applies instantly.">Appearance</H>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(90px,1fr))]">
        {THEMES.map((t) => (
          <button key={t.id} className={cn("card card-hover flex flex-col gap-1.5 p-2 text-left", a.themeId === t.id && "!border-accent !bg-accent/10")} onClick={() => u({ appearance: { themeId: t.id } })} aria-label={`${t.name} theme`}>
            <div className="flex h-7 w-full overflow-hidden rounded-md">
              <div className="flex-1" style={{ background: `rgb(${(a.mode === "light" ? t.light : t.dark).bg})` }} />
              <div className="flex-1" style={{ background: `rgb(${(a.mode === "light" ? t.light : t.dark).surface2})` }} />
              <div className="w-2.5" style={{ background: `rgb(${(a.mode === "light" ? t.light : t.dark).accent})` }} />
            </div>
            <span className="text-[0.78em]">{t.name}</span>
          </button>
        ))}
      </div>
      <Row label="Mode">
        <Seg value={a.mode} options={[{ id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} onChange={(v) => u({ appearance: { mode: v } })} />
      </Row>
      <Row label="Accent" hint="Overrides the theme accent">
        <div className="flex items-center gap-1">
          <button className={cn("flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-faint", !a.accent && "ring-2 ring-text/60")} onClick={() => u({ appearance: { accent: null } })} aria-label="Theme default accent">
            <X size={10} />
          </button>
          {ACCENT_PRESETS.map((c) => (
            <button key={c} className={cn("h-5 w-5 rounded-full", a.accent === c && "ring-2 ring-text/60 ring-offset-1 ring-offset-bg")} style={{ background: c }} onClick={() => u({ appearance: { accent: c } })} />
          ))}
          <input type="color" className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0" value={a.accent ?? "#6096ff"} onChange={(e) => u({ appearance: { accent: e.target.value } })} />
        </div>
      </Row>
      <Row label="Window material" hint="Native Windows blur behind the window">
        <Seg value={a.material} options={[{ id: "acrylic", label: "Acrylic" }, { id: "mica", label: "Mica" }, { id: "tabbed", label: "Tabbed" }, { id: "blur", label: "Blur" }, { id: "none", label: "None" }]} onChange={(v) => u({ appearance: { material: v } })} />
      </Row>
      <Row label="Surface opacity" hint="Lower = more of your desktop shows through">
        <Slider value={a.opacity} min={0.35} max={1} step={0.01} onChange={(v) => u({ appearance: { opacity: v } })} format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="Density">
        <Seg value={a.density} options={[{ id: "compact", label: "Compact" }, { id: "comfortable", label: "Comfortable" }, { id: "spacious", label: "Spacious" }]} onChange={(v) => u({ appearance: { density: v } })} />
      </Row>
      <Row label="Font size">
        <Slider value={a.fontSize} min={12} max={18} step={1} onChange={(v) => u({ appearance: { fontSize: v } })} format={(v) => `${v}px`} />
      </Row>
      <Row label="Font">
        <Seg
          value={a.fontFamily}
          options={[
            { id: "system", label: "System" },
            { id: "inter", label: "Inter" },
            { id: "sacramento", label: "Sacramento" },
            { id: "pacifico", label: "Pacifico" },
            { id: "caveat", label: "Caveat" },
          ]}
          onChange={(v) => u({ appearance: { fontFamily: v } })}
        />
      </Row>
      <Row label="Corner radius">
        <Slider value={a.radius} min={0} max={28} step={1} onChange={(v) => u({ appearance: { radius: v } })} format={(v) => `${v}px`} />
      </Row>
      <Row label="Background glow" hint="Soft accent light in the corners">
        <Toggle value={a.showBackgroundGlow} onChange={(v) => u({ appearance: { showBackgroundGlow: v } })} />
      </Row>
      <Row label="Reduce motion">
        <Toggle value={a.reduceMotion} onChange={(v) => u({ appearance: { reduceMotion: v } })} />
      </Row>
    </div>
  );
}

function WindowSection() {
  const { s, u } = useS();
  const w = s.window;
  return (
    <div>
      <H sub="How DayFlit floats on your desktop.">Window</H>
      <Row label="Always on top">
        <Toggle value={w.alwaysOnTop} onChange={(v) => u({ window: { alwaysOnTop: v } })} />
      </Row>
      <Row label="Close button" hint="What the × button does">
        <Seg value={w.closeBehavior} options={[{ id: "bubble", label: "Bubble" }, { id: "tray", label: "Tray" }, { id: "quit", label: "Quit" }]} onChange={(v) => u({ window: { closeBehavior: v } })} />
      </Row>
      <Row label="Start with Windows" hint="Launches into the bubble">
        <Toggle value={w.autostart} onChange={(v) => u({ window: { autostart: v } })} />
      </Row>
      <Row label="Fade when inactive" hint="Dims the window while you work elsewhere">
        <Toggle value={w.adaptiveOpacity} onChange={(v) => u({ window: { adaptiveOpacity: v } })} />
      </Row>
      {w.adaptiveOpacity && (
        <Row label="Inactive opacity">
          <Slider value={w.inactiveOpacity} min={0.2} max={1} step={0.05} onChange={(v) => u({ window: { inactiveOpacity: v } })} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
      )}
      <Row label="Snap to screen edges" hint="Docks flush when dragged near an edge">
        <Toggle value={w.smartDock} onChange={(v) => u({ window: { smartDock: v } })} />
      </Row>
      <Row label="Bubble shows timer" hint="Focus progress ring on the bubble">
        <Toggle value={w.bubbleShowsTimer} onChange={(v) => u({ window: { bubbleShowsTimer: v } })} />
      </Row>
      <div className="section-title mt-3 mb-1">Floating Island & Widgets</div>
      <Row label="Widget tray mode" hint="Choose between compact iOS Dynamic Island pill or modular tray">
        <Seg
          value={w.widgetTrayMode ?? "island"}
          options={[
            { id: "island", label: "Dynamic Island" },
            { id: "expanded", label: "Expanded Tray" },
          ]}
          onChange={(v) => u({ window: { widgetTrayMode: v as "island" | "expanded" } })}
        />
      </Row>
      <Row label="Floating tray action">
        <button
          className="btn btn-sm btn-primary"
          onClick={() => void ipc.showPip()}
        >
          Open Floating Tray
        </button>
      </Row>
      {isTauri && (
        <>
          <div className="section-title mt-3 mb-1">Position</div>
          <div className="flex flex-wrap gap-1.5">
            {[["sidebar-left", "Left sidebar"], ["sidebar-right", "Right sidebar"], ["top-right", "Top right"], ["bottom-right", "Bottom right"], ["center", "Center"], ["fill-height", "Full height"]].map(([id, label]) => (
              <button key={id} className="btn btn-sm" onClick={() => void ipc.snap(id)}>
                {label}
              </button>
            ))}
            <button className="btn btn-sm" onClick={() => void ipc.nextMonitor()}>
              Next monitor
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FocusSection() {
  const { s, u } = useS();
  const f = s.focus;
  const d = f.defaults;
  const setD = (patch: Partial<typeof d>) => u({ focus: { defaults: { ...d, ...patch } } });
  return (
    <div>
      <H sub="Defaults for new sessions. Change per session from the Focus view.">Focus</H>
      <Row label="Work block">
        <Slider value={d.workSecs / 60} min={5} max={120} step={5} onChange={(v) => setD({ workSecs: v * 60 })} format={(v) => `${v}m`} />
      </Row>
      <Row label="Short break">
        <Slider value={d.shortBreakSecs / 60} min={1} max={30} step={1} onChange={(v) => setD({ shortBreakSecs: v * 60 })} format={(v) => `${v}m`} />
      </Row>
      <Row label="Long break">
        <Slider value={d.longBreakSecs / 60} min={5} max={60} step={5} onChange={(v) => setD({ longBreakSecs: v * 60 })} format={(v) => `${v}m`} />
      </Row>
      <Row label="Long break every">
        <Slider value={d.cyclesBeforeLong} min={2} max={8} step={1} onChange={(v) => setD({ cyclesBeforeLong: v })} format={(v) => `${v} blocks`} />
      </Row>
      <Row label="Blocks per session" hint="0 = keep going until stopped">
        <Slider value={d.targetWorkPhases} min={0} max={12} step={1} onChange={(v) => setD({ targetWorkPhases: v })} />
      </Row>
      <Row label="Daily goal">
        <Slider value={f.dailyGoalMin} min={15} max={480} step={15} onChange={(v) => u({ focus: { dailyGoalMin: v } })} format={(v) => `${v}m`} />
      </Row>
      <Row label="Auto-start breaks">
        <Toggle value={d.autoStartBreaks} onChange={(v) => setD({ autoStartBreaks: v })} />
      </Row>
      <Row label="Auto-start next block">
        <Toggle value={d.autoStartWork} onChange={(v) => setD({ autoStartWork: v })} />
      </Row>
      <Row label="Completion sound">
        <div className="flex items-center gap-2">
          <select className="input !w-auto !py-1" value={d.sound} onChange={(e) => setD({ sound: e.target.value })}>
            {["chime", "bell", "soft", "digital", "ping", "gong", "none"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => isTauri && void ipc.soundPlay(d.sound, d.soundVolume)}>
            Test
          </button>
        </div>
      </Row>
      <Row label="Sound volume">
        <Slider value={d.soundVolume} min={0} max={1} step={0.05} onChange={(v) => setD({ soundVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="Desktop notification on phase change">
        <Toggle value={d.notify} onChange={(v) => setD({ notify: v })} />
      </Row>
      <Row label="Ambient sound" hint="Synthesized soundscapes, no downloads">
        <select className="input !w-auto !py-1" value={f.ambient.kind} onChange={(e) => u({ focus: { ambient: { ...f.ambient, kind: e.target.value } } })}>
          {AMBIENT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Ambient volume">
        <Slider value={f.ambient.volume} min={0} max={1} step={0.05} onChange={(v) => u({ focus: { ambient: { ...f.ambient, volume: v } } })} format={(v) => `${Math.round(v * 100)}%`} />
      </Row>
      <Row label="Start ambient with sessions">
        <Toggle value={f.ambient.autoStart} onChange={(v) => u({ focus: { ambient: { ...f.ambient, autoStart: v } } })} />
      </Row>
      <Row label="Show floating timer during sessions">
        <Toggle value={f.pipAutoShow} onChange={(v) => u({ focus: { pipAutoShow: v } })} />
      </Row>
      <Row label="Minimal UI while focusing" hint="Hides hints and secondary chrome">
        <Toggle value={f.minimalUiDuringFocus} onChange={(v) => u({ focus: { minimalUiDuringFocus: v } })} />
      </Row>
      <Row label="Pause when Windows locks">
        <Toggle value={f.pauseOnLock} onChange={(v) => u({ focus: { pauseOnLock: v } })} />
      </Row>
      <Row label="Resume when unlocked">
        <Toggle value={f.resumeOnUnlock} onChange={(v) => u({ focus: { resumeOnUnlock: v } })} />
      </Row>
      <div className="section-title mt-3 mb-1">Music</div>
      <Row label="Play music when a block starts">
        <Toggle value={d.mediaOnStart === "play"} onChange={(v) => setD({ mediaOnStart: v ? "play" : "none" })} />
      </Row>
      <Row label="Pause music during breaks">
        <Toggle value={d.mediaOnBreak === "pause"} onChange={(v) => setD({ mediaOnBreak: v ? "pause" : "none" })} />
      </Row>
      <Row label="Pause music when the session ends">
        <Toggle value={d.mediaOnEnd === "pause"} onChange={(v) => setD({ mediaOnEnd: v ? "pause" : "none" })} />
      </Row>
    </div>
  );
}

function DistractionSection() {
  const { s, u } = useS();
  const d = s.distraction;
  return (
    <div>
      <H sub="During a focus block, a quiet reminder appears when a distracting app or page comes to the front. Nothing is blocked.">Distractions</H>
      <Row label="Remind me during focus blocks">
        <Toggle value={d.enabled} onChange={(v) => u({ distraction: { enabled: v } })} />
      </Row>
      <Row label="Treat full-screen apps as distractions" hint="Games and video players usually run full screen">
        <Toggle value={d.detectFullscreen} onChange={(v) => u({ distraction: { detectFullscreen: v } })} />
      </Row>
      <Row label="Remind again after">
        <Slider value={d.cooldownMin} min={1} max={30} step={1} onChange={(v) => u({ distraction: { cooldownMin: v } })} format={(v) => `${v}m`} />
      </Row>
      <Row label="Soft sound with the reminder">
        <Toggle value={d.sound} onChange={(v) => u({ distraction: { sound: v } })} />
      </Row>
      <div className="section-title mt-3 mb-1">Apps (process names)</div>
      <textarea className="input font-mono text-[0.85em]" rows={3} defaultValue={d.apps.join("\n")} onBlur={(e) => u({ distraction: { apps: e.target.value.split("\n").map((x) => x.trim().toLowerCase()).filter(Boolean) } })} placeholder="steam.exe" />
      <div className="section-title mt-3 mb-1">Window title keywords</div>
      <div className="text-[0.76em] text-faint">Browser pages are recognised by their window title, e.g. “YouTube”. DayFlit cannot read URLs.</div>
      <textarea className="input mt-1 font-mono text-[0.85em]" rows={3} defaultValue={d.keywords.join("\n")} onBlur={(e) => u({ distraction: { keywords: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } })} placeholder="YouTube" />
    </div>
  );
}

function JournalSection() {
  const { s, u } = useS();
  const j = s.journal;
  const journals = useJournal((x) => x.journals);
  const [pin, setPin] = useState("");
  const toast = useUi((x) => x.toast);
  return (
    <div>
      <H sub="Reminders, privacy and where new entries go.">Journal</H>
      <Row label="Daily reminder" hint="Only if you haven't written that day">
        <input type="time" className="input !w-auto !py-1" value={j.reminderTime ?? ""} onChange={(e) => u({ journal: { reminderTime: e.target.value || null } })} />
      </Row>
      <Row label="Default journal">
        <select className="input !w-auto !py-1" value={j.defaultJournalId ?? "default"} onChange={(e) => u({ journal: { defaultJournalId: e.target.value } })}>
          {journals.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Show journal card on Today">
        <Toggle value={j.showOnToday} onChange={(v) => u({ journal: { showOnToday: v } })} />
      </Row>
      <div className="section-title mt-3 mb-1">Privacy</div>
      <Row label="PIN lock" hint={j.pinHash ? "The journal asks for a PIN before opening" : "Protect the journal with a PIN"}>
        {j.pinHash ? (
          <button className="btn btn-sm" onClick={() => u({ journal: { pinHash: null } })}>
            Remove PIN
          </button>
        ) : (
          <div className="flex gap-1">
            <input type="password" inputMode="numeric" className="input !w-28 !py-1 text-center tracking-widest" placeholder="4-8 digits" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            <button className="btn btn-sm" disabled={pin.length < 4} onClick={async () => { u({ journal: { pinHash: await sha256Hex(pin) } }); setPin(""); toast({ title: "Journal locked", body: "You'll be asked for the PIN when opening it.", kind: "success" }); }}>
              Set
            </button>
          </div>
        )}
      </Row>
      {j.pinHash && (
        <Row label="Lock again after">
          <Slider value={j.lockAfterMin} min={1} max={120} step={1} onChange={(v) => u({ journal: { lockAfterMin: v } })} format={(v) => `${v}m`} />
        </Row>
      )}
    </div>
  );
}

const WHISPER_MODELS: { id: Settings["voice"]["whisperModel"]; label: string; size: string; hint: string }[] = [
  { id: "tiny.en", label: "Tiny (English)", size: "75 MB", hint: "Fastest, good for short phrases" },
  { id: "base.en", label: "Base (English)", size: "142 MB", hint: "Recommended balance" },
  { id: "small.en", label: "Small (English)", size: "466 MB", hint: "Most accurate, slower" },
  { id: "tiny", label: "Tiny (multilingual)", size: "75 MB", hint: "Any language, fast" },
  { id: "base", label: "Base (multilingual)", size: "142 MB", hint: "Any language" },
];

function VoiceSection() {
  const { s, u } = useS();
  const v = s.voice;
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [progress, setProgress] = useState<{ model: string; done: number; total: number } | null>(null);
  const toast = useUi((x) => x.toast);
  const refresh = () => isTauri && void ipc.voiceStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
    let un: (() => void) | undefined;
    void on<{ model: string; done: number; total: number; finished?: boolean }>("sid://voice/download", (p) => {
      setProgress(p.finished ? null : p);
      if (p.finished) {
        refresh();
        toast({ title: "Model ready", body: "Offline transcription is enabled.", kind: "success" });
      }
    }).then((f) => (un = f));
    return () => un?.();
  }, [v.whisperModel]);
  const fmt = (b: number) => `${(b / 1e6).toFixed(0)} MB`;
  return (
    <div>
      <H sub="Hold a key, speak, release. DayFlit turns it into a task, note or journal entry.">Voice capture</H>
      <div className="card p-3 text-[0.85em]">
        <div className="flex items-center gap-2">
          <Kbd>{s.shortcuts["voice-capture"] || "none"}</Kbd>
          <span className="text-muted">hold to record · release to transcribe</span>
          <div className="flex-1" />
          <button className="btn btn-sm" onClick={() => void ipc.showVoice("toggle")}>
            <Mic size={13} /> Try it
          </button>
        </div>
        <div className="mt-1 text-faint">Change the key under Shortcuts. In the app, click the microphone in any editor.</div>
      </div>
      <Row label="Engine" hint="Offline Whisper runs on this PC; Windows speech uses the built-in recognizer">
        <Seg value={v.engine} options={[{ id: "auto", label: "Auto" }, { id: "whisper", label: "Whisper (offline)" }, { id: "windows", label: "Windows" }]} onChange={(x) => u({ voice: { engine: x } })} />
      </Row>
      <div className="section-title mt-3 mb-1">Offline model</div>
      <div className="flex flex-col gap-1.5">
        {WHISPER_MODELS.map((m) => {
          const selected = v.whisperModel === m.id;
          return (
            <div key={m.id} className={cn("card flex items-center gap-2 px-3 py-2", selected && "!border-accent/40")}>
              <button className={cn("checkbox", selected && "!bg-accent !border-accent")} data-checked={selected} onClick={() => u({ voice: { whisperModel: m.id } })} aria-label={`Use ${m.label}`}>
                {selected && <Check size={12} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[0.9em]">
                  {m.label} <span className="text-faint">· {m.size}</span>
                </div>
                <div className="text-[0.75em] text-faint">{m.hint}</div>
              </div>
              {selected && status?.whisperReady ? (
                <>
                  <span className="chip chip-success">downloaded</span>
                  <button className="btn btn-ghost btn-sm text-muted" onClick={() => void ipc.voiceDeleteModel(m.id).then(refresh)}>
                    Remove
                  </button>
                </>
              ) : progress?.model === m.id ? (
                <span className="chip">
                  {fmt(progress.done)}
                  {progress.total ? ` / ${fmt(progress.total)}` : ""}
                </span>
              ) : (
                <button className="btn btn-sm" disabled={!!progress} onClick={() => { u({ voice: { whisperModel: m.id } }); void ipc.voiceDownloadModel(m.id).catch((e) => toast({ title: "Download failed", body: String(e), kind: "error" })); }}>
                  <Download size={13} /> Download
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-[0.75em] text-faint">Models are stored in {status?.modelsDir ?? "the app data folder"} and never leave this PC.</div>
      <Row label="Language" hint="Whisper .en models are English only">
        <select className="input !w-auto !py-1" value={v.language} onChange={(e) => u({ voice: { language: e.target.value } })}>
          {["en", "de", "fr", "es", "it", "pt", "nl", "hi", "ja", "zh", "ko", "ru", "ar"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Microphone">
        <select className="input !w-auto max-w-[200px] !py-1" value={v.inputDevice ?? ""} onChange={(e) => u({ voice: { inputDevice: e.target.value || null } })}>
          <option value="">System default</option>
          {(status?.devices ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Default destination" hint="Where a transcript goes when DayFlit can't tell">
        <Seg value={v.defaultDestination} options={[{ id: "ask", label: "Ask" }, { id: "task", label: "Task" }, { id: "note", label: "Note" }, { id: "journal", label: "Journal" }]} onChange={(x) => u({ voice: { defaultDestination: x } })} />
      </Row>
      <Row label="Save without reviewing" hint="Skips the edit step when a destination is set">
        <Toggle value={v.autoSave} onChange={(x) => u({ voice: { autoSave: x } })} />
      </Row>
      <Row label="Keep the original audio" hint="Attached to journal entries and notes as a voice memo">
        <Toggle value={v.keepAudio} onChange={(x) => u({ voice: { keepAudio: x } })} />
      </Row>
      <div className="mt-2 text-[0.75em] text-faint">Say "remind me to…", "note to self…" or "journal…" to pick the destination by voice.</div>
    </div>
  );
}

function MediaSection() {
  const { s, u } = useS();
  const m = s.media;
  const { spotify, playback, playlists, busy, error, spotifyConnect, spotifyDisconnect, spotifyControl, loadPlaylists, spotifyRefresh, media } = useMedia();
  const [clientId, setClientId] = useState(m.spotifyClientId);
  const toast = useUi((s) => s.toast);
  useEffect(() => {
    if (spotify?.connected) void loadPlaylists();
  }, [spotify?.connected]);
  return (
    <div>
      <H sub="DayFlit controls whatever is playing through Windows media controls. Spotify's API adds playlists and remote devices.">Media & Spotify</H>
      <Row label="Show now-playing card" hint="On Today and Focus">
        <Toggle value={m.showCard} onChange={(v) => u({ media: { showCard: v } })} />
      </Row>
      <Row label="Preferred app for focus music" hint="Which player DayFlit plays/pauses">
        <select className="input !w-auto !py-1" value={m.preferredApp} onChange={(e) => u({ media: { preferredApp: e.target.value } })}>
          <option value="spotify">Spotify</option>
          <option value="">Whatever is active</option>
          {media.sessions.filter((x) => !x.appId.toLowerCase().includes("spotify")).map((x) => (
            <option key={x.appId} value={x.appId.toLowerCase()}>
              {x.appName}
            </option>
          ))}
        </select>
      </Row>
      <div className="mt-2 text-[0.78em] text-faint">Detected players: {media.sessions.length ? media.sessions.map((x) => x.appName).join(", ") : "none right now"}</div>

      <div className="section-title mt-5 mb-1">Spotify Web API (optional)</div>
      {!spotify?.connected ? (
        <div className="card p-3 text-[0.85em]">
          <p className="text-muted">
            Create a free app at{" "}
            <button className="text-accent underline" onClick={() => void openExternal("https://developer.spotify.com/dashboard")}>
              developer.spotify.com/dashboard
            </button>
            , add <span className="selectable font-mono text-text">{spotify?.redirectUri ?? "http://127.0.0.1:8912/callback"}</span> as a Redirect URI, then paste the Client ID here.
          </p>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1 font-mono text-[0.9em]" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <button
              className="btn btn-primary"
              disabled={busy || clientId.trim().length < 10}
              onClick={async () => {
                u({ media: { spotifyClientId: clientId.trim() } });
                try {
                  await spotifyConnect(clientId.trim());
                  toast({ title: "Spotify connected", kind: "success" });
                } catch (e) {
                  toast({ title: "Spotify connection failed", body: String(e), kind: "error" });
                }
              }}
            >
              {busy ? <RefreshCw size={14} className="spin" /> : <Link2 size={14} />} Connect
            </button>
          </div>
          {busy && <div className="mt-2 text-faint">Waiting for you to approve in the browser…</div>}
          {error && <div className="mt-2 text-danger">{error}</div>}
        </div>
      ) : (
        <div className="card p-3 text-[0.85em]">
          <div className="flex items-center gap-2">
            <span className="chip chip-success">Connected</span>
            <span>{spotify.displayName || "Spotify"}</span>
            {!spotify.premium && <span className="chip chip-warning">Free account: playback control needs Premium</span>}
            <div className="flex-1" />
            <button className="btn btn-ghost btn-sm" onClick={() => void spotifyRefresh()}>
              <RefreshCw size={13} />
            </button>
            <button className="btn btn-ghost btn-sm text-danger" onClick={() => void spotifyDisconnect()}>
              Disconnect
            </button>
          </div>
          {playback && (
            <div className="mt-2 flex items-center gap-3">
              {playback.image && <img src={playback.image} className="h-10 w-10 rounded" alt="" />}
              <div className="min-w-0 flex-1">
                <div className="truncate">{playback.track}</div>
                <div className="truncate text-faint">
                  {playback.artist}
                  {playback.device ? ` · ${playback.device}` : ""}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => void spotifyControl("toggle")}>
                {playback.isPlaying ? "Pause" : "Play"}
              </button>
            </div>
          )}
          {playlists.length > 0 && (
            <div className="mt-3">
              <div className="section-title mb-1">Play a playlist</div>
              <div className="scroll grid max-h-44 gap-1 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                {playlists.map((p) => (
                  <button key={p.id} className="card card-hover flex items-center gap-2 px-2 py-1 text-left" onClick={() => void spotifyControl("play", p.uri).catch((e) => toast({ title: "Could not play", body: String(e), kind: "error" }))}>
                    {p.image ? <img src={p.image} className="h-7 w-7 rounded" alt="" /> : <Music size={14} className="text-faint" />}
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClipboardSection() {
  const { s, u } = useS();
  const c = s.clipboard;
  const [defaults, setDefaults] = useState<string[]>([]);
  useEffect(() => {
    if (isTauri) void ipc.clipboardDefaultIgnored().then(setDefaults);
  }, []);
  return (
    <div>
      <H sub="DayFlit listens for clipboard changes and records the source app and window.">Clipboard capture</H>
      <Row label="Capture automatically">
        <Toggle value={c.enabled} onChange={(v) => u({ clipboard: { enabled: v } })} />
      </Row>
      <Row label="Capture images" hint="Screenshots and copied images are stored in your data folder">
        <Toggle value={c.captureImages} onChange={(v) => u({ clipboard: { captureImages: v } })} />
      </Row>
      <Row label="Notify on capture">
        <Toggle value={c.notifyOnCapture} onChange={(v) => u({ clipboard: { notifyOnCapture: v } })} />
      </Row>
      <Row label="Keep at most">
        <Slider value={c.maxItems} min={50} max={2000} step={50} onChange={(v) => u({ clipboard: { maxItems: v } })} />
      </Row>
      <div className="section-title mt-3 mb-1">Ignored apps</div>
      <div className="text-[0.78em] text-faint">Always ignored: {defaults.join(", ") || "password managers"}</div>
      <textarea className="input mt-2 font-mono text-[0.85em]" rows={3} placeholder="One process name per line, e.g. keepass.exe" defaultValue={c.ignoredApps.join("\n")} onBlur={(e) => u({ clipboard: { ignoredApps: [...new Set([...defaults, ...e.target.value.split("\n").map((x) => x.trim().toLowerCase()).filter(Boolean)])] } })} />
    </div>
  );
}

function ConnectedCalendars() {
  const { sources, addSource, removeSource } = useCalendar();
  const { s, u } = useS();
  const toast = useUi((x) => x.toast);
  const [status, setStatus] = useState<Record<string, SyncStatus | null>>({ google: null, outlook: null });
  const [remote, setRemote] = useState<Record<string, RemoteCalendar[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [ids, setIds] = useState<Record<string, { id: string; secret: string }>>({ google: { id: s.calendar.googleClientId ?? "", secret: s.calendar.googleClientSecret ?? "" }, outlook: { id: s.calendar.outlookClientId ?? "", secret: "" } });
  const refresh = async (p: string) => {
    try {
      const st = await ipc.syncStatus(p);
      setStatus((x) => ({ ...x, [p]: st }));
      if (st.connected) setRemote((x) => ({ ...x, [p]: [] }));
      if (st.connected) setRemote((x) => ({ ...x, [p]: x[p] ?? [] }));
      if (st.connected) {
        const cals = await ipc.syncCalendars(p);
        setRemote((x) => ({ ...x, [p]: cals }));
      }
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (!isTauri) return;
    void refresh("google");
    void refresh("outlook");
  }, []);
  const connect = async (p: string) => {
    setBusy(p);
    try {
      if (p === "google") u({ calendar: { googleClientId: ids.google.id.trim(), googleClientSecret: ids.google.secret.trim() } });
      else u({ calendar: { outlookClientId: ids.outlook.id.trim() } });
      await ipc.syncConnect(p, ids[p].id, ids[p].secret);
      toast({ title: `${p === "google" ? "Google" : "Microsoft"} connected`, kind: "success" });
      await refresh(p);
    } catch (e) {
      toast({ title: "Connection failed", body: String(e), kind: "error" });
    } finally {
      setBusy(null);
    }
  };
  const toggleCalendar = (p: "google" | "outlook", cal: RemoteCalendar, on: boolean) => {
    const existing = sources.find((x) => x.kind === p && x.externalId === cal.id);
    if (on && !existing) addSource({ name: cal.name, url: "", color: cal.color, kind: p, externalId: cal.id, canEdit: cal.canEdit });
    if (!on && existing) removeSource(existing.id);
  };
  const block = (p: "google" | "outlook", label: string, help: React.ReactNode) => {
    const st = status[p];
    return (
      <div className="card mt-2 p-3 text-[0.85em]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{label}</div>
            <div className="truncate text-faint">{st?.connected ? st.account || "connected" : "Two-way sync: events you move or create in DayFlit are written back."}</div>
          </div>
          {st?.connected ? (
            <button className="btn btn-ghost btn-sm text-danger" onClick={() => void ipc.syncDisconnect(p).then(() => refresh(p))}>
              Disconnect
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={busy === p || ids[p].id.trim().length < 8} onClick={() => void connect(p)}>
              {busy === p ? <RefreshCw size={13} className="spin" /> : <Link2 size={13} />} Connect
            </button>
          )}
        </div>
        {!st?.connected && (
          <div className="mt-2 flex flex-col gap-1.5">
            <input className="input font-mono text-[0.9em]" placeholder="OAuth client ID" value={ids[p].id} onChange={(e) => setIds({ ...ids, [p]: { ...ids[p], id: e.target.value } })} />
            {p === "google" && <input className="input font-mono text-[0.9em]" placeholder="OAuth client secret (desktop apps have one)" value={ids.google.secret} onChange={(e) => setIds({ ...ids, google: { ...ids.google, secret: e.target.value } })} />}
            <div className="text-faint">{help}</div>
          </div>
        )}
        {st?.connected && (
          <div className="mt-2 flex flex-col gap-1">
            {(remote[p] ?? []).length === 0 && <div className="text-faint">Loading calendars…</div>}
            {(remote[p] ?? []).map((cal) => {
              const on = sources.some((x) => x.kind === p && x.externalId === cal.id);
              return (
                <label key={cal.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-surface-2/60">
                  <button className="checkbox" data-checked={on} onClick={() => toggleCalendar(p, cal, !on)} aria-label={`Sync ${cal.name}`}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </button>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: cal.color }} />
                  <span className="min-w-0 flex-1 truncate">{cal.name}</span>
                  {cal.primary && <span className="chip">primary</span>}
                  {!cal.canEdit && <span className="chip">read-only</span>}
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="mt-4">
      <div className="section-title mb-1">Connected accounts</div>
      {block("google", "Google Calendar", <>Create an OAuth client (type: Desktop app) in Google Cloud → APIs & Services → Credentials, enable the Calendar API, and paste the client ID and secret. Redirect: <span className="selectable font-mono">{status.google?.redirectUri ?? "http://127.0.0.1:8913/callback"}</span></>)}
      {block("outlook", "Microsoft 365 / Outlook", <>Register an app in Entra ID (Azure) with platform "Mobile and desktop applications", redirect <span className="selectable font-mono">{status.outlook?.redirectUri ?? "http://127.0.0.1:8914/callback"}</span>, and allow public client flows. Paste the Application (client) ID.</>)}
    </div>
  );
}

function CalendarSection() {
  const { s, u } = useS();
  const c = s.calendar;
  const { sources, cache, addSource, updateSource, removeSource, refresh, refreshing } = useCalendar();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const ask = useUi((x) => x.ask);
  return (
    <div>
      <H sub="Subscribe to any iCalendar (.ics) feed: Google, Outlook, iCloud, Fastmail, Notion…">Calendars</H>
      <div className="card p-3">
        <div className="flex flex-col gap-2">
          <input className="input" placeholder="https://…/basic.ics  or  webcal://…  or  C:\path\to\file.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary" disabled={!url.trim()} onClick={() => { addSource({ name: name || "Calendar", url }); setUrl(""); setName(""); }}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
        <div className="mt-2 text-[0.75em] text-faint">
          Google: Calendar settings → your calendar → “Secret address in iCal format”. Outlook: Settings → Calendar → Shared calendars → Publish (ICS). iCloud: share calendar → public link (webcal://).
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {sources.map((src) => {
          const entry = cache[src.id];
          return (
            <div key={src.id} className="card flex items-center gap-2 px-3 py-2">
              <input type="color" className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0" value={src.color} onChange={(e) => updateSource(src.id, { color: e.target.value })} />
              <div className="min-w-0 flex-1">
                <input className="w-full bg-transparent text-[0.9em] font-medium outline-none" value={src.name} onChange={(e) => updateSource(src.id, { name: e.target.value })} />
                <div className="truncate text-[0.72em] text-faint">
                  {src.kind && src.kind !== "ics" && <span className="mr-1 uppercase">{src.kind}</span>}
                  {entry?.error ? <span className="text-danger">{entry.error}</span> : entry ? `${entry.events.length} events · updated ${new Date(entry.fetchedAt).toLocaleTimeString()}` : "not fetched yet"}
                </div>
              </div>
              <Toggle value={src.enabled} onChange={(v) => updateSource(src.id, { enabled: v })} />
              <button className={cn("btn btn-ghost btn-icon btn-sm", refreshing[src.id] && "spin")} onClick={() => void refresh(src.id, true)}>
                <RefreshCw size={13} />
              </button>
              <button className="btn btn-ghost btn-icon btn-sm text-danger" onClick={async () => (await ask({ title: `Remove ${src.name}?`, confirmLabel: "Remove", danger: true })) && removeSource(src.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <ConnectedCalendars />
      <div className="section-title mt-5 mb-1">Display</div>
      <Row label="Week starts on">
        <Seg value={String(c.weekStartsOn) as "0" | "1" | "6"} options={[{ id: "1", label: "Monday" }, { id: "0", label: "Sunday" }, { id: "6", label: "Saturday" }]} onChange={(v) => u({ calendar: { weekStartsOn: parseInt(v, 10) as 0 | 1 | 6 } })} />
      </Row>
      <Row label="Day view hours">
        <div className="flex items-center gap-1 text-[0.85em]">
          <input type="number" className="input w-16 !py-1" min={0} max={12} value={c.dayStartHour} onChange={(e) => u({ calendar: { dayStartHour: parseInt(e.target.value, 10) || 0 } })} />
          <span className="text-faint">to</span>
          <input type="number" className="input w-16 !py-1" min={12} max={24} value={c.dayEndHour} onChange={(e) => u({ calendar: { dayEndHour: parseInt(e.target.value, 10) || 24 } })} />
        </div>
      </Row>
      <Row label="Auto-join meetings" hint="Open the meeting link when it starts (only while DayFlit is running)">
        <Toggle value={c.autoJoin} onChange={(v) => u({ calendar: { autoJoin: v } })} />
      </Row>
      <Row label="Working hours" hint="Used for availability slots and planning">
        <div className="flex items-center gap-1 text-[0.85em]">
          <input type="number" className="input w-16 !py-1" min={0} max={23} value={c.workStartHour} onChange={(e) => u({ calendar: { workStartHour: parseInt(e.target.value, 10) || 0 } })} />
          <span className="text-faint">to</span>
          <input type="number" className="input w-16 !py-1" min={1} max={24} value={c.workEndHour} onChange={(e) => u({ calendar: { workEndHour: parseInt(e.target.value, 10) || 24 } })} />
        </div>
      </Row>
      <Row label="Availability slot length">
        <Seg value={String(c.slotMinutes) as "30"} options={[{ id: "15", label: "15m" }, { id: "30", label: "30m" }, { id: "60", label: "60m" }]} onChange={(v) => u({ calendar: { slotMinutes: parseInt(v, 10) } })} />
      </Row>
      <Row label="Meeting reminder" hint="Notification with a Join button">
        <Slider value={c.joinReminderMin} min={0} max={15} step={1} onChange={(v) => u({ calendar: { joinReminderMin: v } })} format={(v) => (v ? `${v}m` : "off")} />
      </Row>
    </div>
  );
}

function TasksSection() {
  const { s, u } = useS();
  const t = s.tasks;
  const [newList, setNewList] = useState("");
  return (
    <div>
      <H sub="Lists, defaults and housekeeping.">Tasks</H>
      <div className="section-title mb-1">Lists</div>
      <div className="flex flex-wrap gap-1.5">
        {t.lists.map((l) => (
          <span key={l} className="chip !py-1 text-[0.85em]">
            {l}
            {l !== t.defaultList && (
              <button className="ml-1 text-faint hover:text-danger" onClick={() => u({ tasks: { lists: t.lists.filter((x) => x !== l) } })}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="input flex-1" placeholder="New list" value={newList} onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newList.trim() && (u({ tasks: { lists: [...new Set([...t.lists, newList.trim()])] } }), setNewList(""))} />
        <button className="btn" disabled={!newList.trim()} onClick={() => { u({ tasks: { lists: [...new Set([...t.lists, newList.trim()])] } }); setNewList(""); }}>
          Add
        </button>
      </div>
      <Row label="Default list">
        <select className="input !w-auto !py-1" value={t.defaultList} onChange={(e) => u({ tasks: { defaultList: e.target.value } })}>
          {t.lists.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </Row>
      <Row label="Show completed tasks on Today">
        <Toggle value={t.showCompletedInToday} onChange={(v) => u({ tasks: { showCompletedInToday: v } })} />
      </Row>
      <Row label="Remove completed tasks after" hint="Keeps the data file lean; stats keep their counts">
        <Slider value={t.autoArchiveDoneDays} min={0} max={365} step={5} onChange={(v) => u({ tasks: { autoArchiveDoneDays: v } })} format={(v) => (v ? `${v}d` : "never")} />
      </Row>
    </div>
  );
}

function NotificationsSection() {
  const { s, u } = useS();
  const n = s.notifications;
  return (
    <div>
      <H sub="Windows toast notifications.">Notifications</H>
      <Row label="Enable notifications">
        <Toggle value={n.enabled} onChange={(v) => u({ notifications: { enabled: v } })} />
      </Row>
      <Row label="Respect Focus Assist / quiet hours" hint="Stay silent while Windows says do-not-disturb, presenting or gaming">
        <Toggle value={n.respectQuietHours} onChange={(v) => u({ notifications: { respectQuietHours: v } })} />
      </Row>
      <Row label="Task due reminders" hint="For tasks with a time">
        <Toggle value={n.dueReminders} onChange={(v) => u({ notifications: { dueReminders: v } })} />
      </Row>
      <Row label="Remind me before">
        <Slider value={n.reminderMinutesBefore} min={0} max={60} step={5} onChange={(v) => u({ notifications: { reminderMinutesBefore: v } })} format={(v) => `${v}m`} />
      </Row>
      <Row label="Habit reminders">
        <Toggle value={n.habitReminders} onChange={(v) => u({ notifications: { habitReminders: v } })} />
      </Row>
    </div>
  );
}



function ShortcutsSection() {
  const { s, u } = useS();
  const failures = useSettings((x) => x.shortcutFailures);
  const [recording, setRecording] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(null);
      if (e.key === "Backspace" || e.key === "Delete") {
        u({ shortcuts: { ...s.shortcuts, [recording]: "" } });
        return setRecording(null);
      }
      const acc = acceleratorOf(e);
      if (acc) {
        if (SYSTEM_RESERVED_SHORTCUTS[acc]) {
          useUi.getState().toast({
            title: "Cannot assign shortcut",
            body: `${acc} is reserved by ${SYSTEM_RESERVED_SHORTCUTS[acc]}.`,
            kind: "error",
          });
          setRecording(null);
          return;
        }
        u({ shortcuts: { ...s.shortcuts, [recording]: acc } });
        setRecording(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, s.shortcuts]);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <H sub="System-wide hotkeys that work from any app or game even when DayFlit is in the background.">Global Shortcuts</H>
        <button
          className="btn btn-ghost btn-sm text-muted text-[0.8em] gap-1"
          onClick={() => u({ shortcuts: { ...DEFAULT_SHORTCUTS } })}
          aria-label="Reset all shortcuts to defaults"
        >
          <RotateCcw size={13} /> Reset all
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {SHORTCUT_ACTIONS.map((a) => {
          const v = s.shortcuts[a.id] ?? "";
          const failed = failures.includes(a.id);
          const isCustomized = v !== (DEFAULT_SHORTCUTS[a.id] ?? "");
          const reservedConflict = v ? SYSTEM_RESERVED_SHORTCUTS[v] : null;
          const duplicateAction = v
            ? SHORTCUT_ACTIONS.find((other) => other.id !== a.id && (s.shortcuts[other.id] ?? DEFAULT_SHORTCUTS[other.id]) === v)
            : null;

          return (
            <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[0.9em] font-medium">{a.label}</span>
                  {reservedConflict && (
                    <span className="chip chip-danger text-[0.72em]" title={reservedConflict}>
                      Windows reserved
                    </span>
                  )}
                  {duplicateAction && (
                    <span className="chip chip-warning text-[0.72em]" title={`Conflicts with ${duplicateAction.label}`}>
                      duplicate: {duplicateAction.label}
                    </span>
                  )}
                </div>
                <div className="text-[0.74em] text-faint">{a.hint}</div>
              </div>
              {failed && <span className="chip chip-danger text-[0.72em]">in use by another app (inactive)</span>}
              <div className="flex items-center gap-1.5">
                <button
                  className={cn(
                    "btn btn-sm min-w-[125px] justify-center font-mono text-[0.85em]",
                    recording === a.id && "!border-accent !bg-accent/10",
                    failed && "!border-danger/40 !bg-danger/10 text-danger"
                  )}
                  onClick={() => setRecording(recording === a.id ? null : a.id)}
                  aria-label={`Shortcut for ${a.label}: ${v || "none"}${failed ? " (inactive - registration failed)" : ""}`}
                >
                  {recording === a.id ? (
                    "Press keys…"
                  ) : v ? (
                    failed ? (
                      <span className="flex items-center gap-1 line-through opacity-60">
                        <Kbd>{v}</Kbd>
                      </span>
                    ) : (
                      <Kbd>{v}</Kbd>
                    )
                  ) : (
                    <span className="text-faint">none</span>
                  )}
                </button>
                {isCustomized && (
                  <button
                    className="btn btn-ghost btn-xs p-1 text-muted hover:text-text"
                    onClick={() => u({ shortcuts: { ...s.shortcuts, [a.id]: DEFAULT_SHORTCUTS[a.id] ?? "" } })}
                    aria-label={`Reset ${a.label} to default`}
                    title="Reset to default"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 mb-2">
        <H sub="Active only when the DayFlit window is focused.">In-App Shortcuts</H>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.82em] text-muted">
        {[
          ["Ctrl+K", "Search & commands"],
          ["Ctrl+N", "New task"],
          ["Ctrl+Shift+N", "New note"],
          ["Ctrl+1…8", "Switch views"],
          ["Ctrl+,", "Settings"],
          ["Ctrl+B", "Collapse to bubble"],
          ["Ctrl+Z", "Undo task delete"],
          ["Esc", "Close / deselect"],
          ["j / k", "Move selection"],
          ["x", "Complete task"],
          ["e", "Edit task"],
          ["f", "Focus on task"],
        ].map(([k, l]) => (
          <div key={k} className="flex items-center justify-between py-1 border-b border-surface-2/30">
            <span>{l}</span>
            <Kbd>{k}</Kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataSection() {
  const [info, setInfo] = useState<DataDirInfo | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useUi((x) => x.toast);
  const ask = useUi((x) => x.ask);
  const load = async () => {
    if (!isTauri) return;
    setInfo(await ipc.storeInfo());
    setBackups(await ipc.listBackups());
  };
  useEffect(() => {
    void load();
  }, []);
  const changeDir = async (mode: "move" | "copy" | "adopt") => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, title: mode === "adopt" ? "Choose a folder that already contains DayFlit data" : "Choose a new data folder" });
    if (typeof dir !== "string") return;
    setBusy(true);
    try {
      const p = await ipc.changeDataDir(dir, mode);
      toast({ title: mode === "adopt" ? "Switched to existing data" : "Data folder changed", body: p, kind: "success" });
      if (mode === "adopt") window.location.reload();
      await load();
    } catch (e) {
      toast({ title: "Could not change folder", body: String(e), kind: "error" });
    } finally {
      setBusy(false);
    }
  };
  const fmt = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  return (
    <div>
      <H sub="Local-first. Plain JSON files with checksums, atomic writes and rolling backups.">Data & backups</H>
      <div className="card p-3 text-[0.85em]">
        <div className="flex items-center gap-2">
          <FolderOpen size={15} className="text-accent" />
          <span className="selectable min-w-0 flex-1 truncate font-mono text-[0.9em]">
            {info?.path ?? "…"}
          </span>
          {isTauri && (
            <button className="btn btn-sm" onClick={() => void ipc.openFolder("data")}>
              Open
            </button>
          )}
        </div>
        {info && (
          <div className="mt-1.5 text-faint">
            {fmt(info.totalBytes)} · {info.collections.length} collections · {info.imageCount} images
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button className="btn btn-sm" disabled={busy} onClick={() => void changeDir("move")}>
            <HardDriveDownload size={13} /> Move to folder…
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => void changeDir("copy")}>
            Copy to folder…
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={() => void changeDir("adopt")}>
            Use existing data…
          </button>
        </div>
        <div className="mt-2 text-[0.9em] text-faint">Pick a OneDrive / Dropbox / Google Drive folder to sync between machines. On another PC choose “Use existing data” and point at the same folder.</div>
      </div>

      <div className="section-title mt-5 mb-1">Export</div>
      <div className="card p-3 text-[0.85em]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div>Markdown export</div>
            <div className="text-faint">Notes, journal, tasks, habits, focus history, clips and attachments as plain Markdown files. Drop the folder into Obsidian as a vault.</div>
          </div>
          <button className="btn btn-sm shrink-0" onClick={() => void exportToMarkdown()}>
            <FileDown size={13} /> Export…
          </button>
        </div>
      </div>

      <div className="section-title mt-5 mb-1 flex items-center gap-1.5">
        <span>Backups</span>
        <InfoHint text="Automatic backups run daily (kept for 30 days). Manual backups are kept until you delete them." />
      </div>
      <div className="flex gap-1.5">
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const b = await ipc.backupNow(true, "manual");
              toast({ title: "Backup created", body: b.file, kind: "success" });
              await load();
            } catch (e) {
              toast({ title: "Backup failed", body: String(e), kind: "error" });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Database size={13} /> Back up now
        </button>
        <button className="btn btn-sm" onClick={() => void ipc.openFolder("backups")}>
          Open backups folder
        </button>
        <button className="btn btn-sm" onClick={() => void ipc.openFolder("logs")}>
          Logs
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {backups.slice(0, 12).map((b) => (
          <div key={b.path} className="card flex items-center gap-2 px-3 py-1.5 text-[0.82em]">
            <span className="min-w-0 flex-1 truncate font-mono">{b.file}</span>
            <span className="text-faint">{fmt(b.size)}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                if (!(await ask({ title: "Restore this backup?", body: "Current data is backed up first, then replaced.", confirmLabel: "Restore", danger: true }))) return;
                try {
                  const r = await ipc.restoreBackup(b.path);
                  toast({ title: "Restored", body: r.join(", "), kind: "success" });
                } catch (e) {
                  toast({ title: "Restore failed", body: String(e), kind: "error" });
                }
              }}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpdatesSection() {
  const { s, u } = useS();
  const up = useUpdater();
  const [info, setInfo] = useState<{ version: string } | null>(null);
  useEffect(() => {
    if (isTauri) void ipc.appInfo().then(setInfo);
  }, []);
  const pct = up.progress && up.progress.total ? Math.round((up.progress.done / up.progress.total) * 100) : null;
  return (
    <div>
      <H sub="DayFlit checks for signed releases and installs them in place. Your data and settings are never touched.">Updates</H>
      <div className="card p-3 text-[0.85em]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div>
              Version <span className="font-mono">{info?.version ?? "dev"}</span>
              {up.available && <span className="chip chip-accent ml-2">{up.available.version} available</span>}
            </div>
            <div className="text-faint">{up.lastChecked ? `Last checked ${new Date(up.lastChecked).toLocaleTimeString()}` : "Not checked yet this session"}</div>
          </div>
          {!up.available && (
            <button className="btn btn-sm" disabled={up.checking} onClick={() => void up.check(false)}>
              <RefreshCw size={13} className={up.checking ? "spin" : ""} /> Check now
            </button>
          )}
        </div>
        {up.available && (
          <div className="mt-3 rounded-lg bg-surface-2/60 p-2.5">
            <div className="font-medium">DayFlit {up.available.version}</div>
            {up.available.notes && <div className="selectable mt-1 whitespace-pre-wrap text-muted">{up.available.notes}</div>}
            <div className="mt-2 flex items-center gap-2">
              {up.ready ? (
                <button className="btn btn-primary btn-sm" onClick={() => void up.relaunch()}>
                  Restart to finish
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={up.downloading} onClick={() => void up.install()}>
                  <Download size={13} /> {up.downloading ? (pct !== null ? `Downloading ${pct}%` : "Downloading…") : "Download and install"}
                </button>
              )}
              {up.downloading && up.progress?.total && (
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${pct ?? 0}%` }} />
                </div>
              )}
            </div>
          </div>
        )}
        {up.error && <div className="mt-2 text-warning">{up.error}</div>}
      </div>
      <Row label="Check automatically on startup" hint="Updates are verified against the public key built into DayFlit before anything is installed. The installer runs quietly and restarts the app.">
        <Toggle value={s.updates.autoCheck} onChange={(v) => u({ updates: { autoCheck: v } })} />
      </Row>
    </div>
  );
}

function About() {
  const [info, setInfo] = useState<{ version: string } | null>(null);
  const reset = useSettings((s) => s.reset);
  const ask = useUi((x) => x.ask);
  useEffect(() => {
    if (isTauri) void ipc.appInfo().then(setInfo);
  }, []);
  return (
    <div>
      <H>About DayFlit</H>
      <div className="text-[0.9em] text-muted">
        Version {info?.version ?? "dev"} · Built with Tauri, Rust and React.
        <br />
        Your data never leaves your machine unless you put it in a synced folder.
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-sm" onClick={async () => (await ask({ title: "Reset all settings?", body: "Tasks, notes and history are kept.", confirmLabel: "Reset", danger: true })) && reset()}>
          <RotateCcw size={13} /> Reset settings
        </button>
        {isTauri && (
          <button className="btn btn-sm" onClick={() => void ipc.relaunch()}>
            Restart DayFlit
          </button>
        )}
      </div>
    </div>
  );
}

export type { Settings };
