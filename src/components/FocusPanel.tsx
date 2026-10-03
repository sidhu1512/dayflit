import { useState } from "react";
import { ChevronDown, Coffee, Pause, PictureInPicture2, Play, Plus, SkipForward, Square, Volume2, Zap } from "lucide-react";
import { useFocus } from "@/stores/focus";
import { useSettings } from "@/stores/settings";
import { useTasks, todayTasks, openTasks } from "@/stores/tasks";
import { ipc, isTauri } from "@/lib/ipc";
import { formatClock, formatDuration } from "@/lib/dates";
import { ProgressRing } from "./ProgressRing";
import { AMBIENT_OPTIONS, type AmbientKind } from "@/lib/audio";
import { cn } from "@/lib/ids";
import type { FocusConfig } from "@/lib/types";

const PRESETS: { id: FocusConfig["mode"]; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "pomodoro", label: "Pomodoro", icon: <Zap size={14} />, hint: "25 / 5 · long break every 4" },
  { id: "deep", label: "Deep work", icon: <Coffee size={14} />, hint: "One long uninterrupted block" },
  { id: "custom", label: "Custom", icon: <Plus size={14} />, hint: "Your own timings" },
  { id: "stopwatch", label: "Stopwatch", icon: <Play size={14} />, hint: "Count up, stop when done" },
];

export function FocusPanel({ size = 200 }: { size?: number }) {
  const snap = useFocus((s) => s.snap);
  const { start, pause, resume, skip, stop, extend, setAmbient, ambientOn } = useFocus();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const tasks = useTasks((s) => s.tasks);
  const [mode, setMode] = useState<FocusConfig["mode"]>(settings.focus.defaults.mode);
  const [taskId, setTaskId] = useState<string>("");
  const [work, setWork] = useState(Math.round(settings.focus.defaults.workSecs / 60));
  const [brk, setBrk] = useState(Math.round(settings.focus.defaults.shortBreakSecs / 60));
  const [phases, setPhases] = useState(settings.focus.defaults.targetWorkPhases);
  const [showOptions, setShowOptions] = useState(false);
  const s = snap.session;
  const active = s && s.status !== "finished";

  const candidates = [...todayTasks(tasks), ...openTasks(tasks).filter((t) => !todayTasks(tasks).includes(t))].slice(0, 40);

  const begin = () => {
    const t = tasks.find((x) => x.id === taskId);
    const cfg: Partial<FocusConfig> = { mode, taskId: t?.id ?? null, taskTitle: t?.title ?? null };
    if (mode === "deep") {
      cfg.workSecs = (t?.estimateMin && t.estimateMin >= 10 ? t.estimateMin : Math.max(work, 45)) * 60;
      cfg.targetWorkPhases = 1;
    } else if (mode === "custom") {
      cfg.workSecs = work * 60;
      cfg.shortBreakSecs = brk * 60;
      cfg.targetWorkPhases = phases;
    } else if (mode === "stopwatch") {
      cfg.workSecs = 0;
      cfg.targetWorkPhases = 1;
      cfg.autoStartBreaks = false;
    } else {
      cfg.workSecs = work * 60;
      cfg.shortBreakSecs = brk * 60;
      cfg.targetWorkPhases = phases;
    }
    void start(cfg);
  };

  if (!active) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} className={cn("card card-hover flex flex-col items-start gap-0.5 px-3 py-2 text-left", mode === p.id && "!border-accent/50 !bg-accent/10")} onClick={() => setMode(p.id)}>
              <span className="flex items-center gap-1.5 text-[0.9em] font-medium">
                {p.icon} {p.label}
              </span>
              <span className="text-[0.75em] text-faint">{p.hint}</span>
            </button>
          ))}
        </div>
        {mode !== "stopwatch" && (
          <div className="flex items-center gap-2 text-[0.85em]">
            <label className="flex flex-1 items-center gap-1.5">
              <span className="text-muted">Work</span>
              <input type="number" className="input !w-16 !py-1" min={1} max={480} value={work} onChange={(e) => setWork(Math.max(1, parseInt(e.target.value, 10) || 1))} />
              <span className="text-faint">min</span>
            </label>
            {mode !== "deep" && (
              <>
                <label className="flex flex-1 items-center gap-1.5">
                  <span className="text-muted">Break</span>
                  <input type="number" className="input !w-16 !py-1" min={0} max={120} value={brk} onChange={(e) => setBrk(Math.max(0, parseInt(e.target.value, 10) || 0))} />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted">×</span>
                  <input type="number" className="input !w-14 !py-1" min={0} max={20} value={phases} onChange={(e) => setPhases(Math.max(0, parseInt(e.target.value, 10) || 0))} aria-label="Work blocks (0 = unlimited)" data-tip="Work blocks (0 = unlimited)" />
                </label>
              </>
            )}
          </div>
        )}
        <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">No linked task</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.estimateMin ? ` (${t.estimateMin}m)` : ""}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm self-start text-muted" onClick={() => setShowOptions((v) => !v)}>
          <ChevronDown size={13} className={cn("transition", showOptions && "rotate-180")} /> Options
        </button>
        {showOptions && (
          <div className="card flex flex-col gap-2 p-3 text-[0.85em] anim-fade">
            <Row label="Auto-start breaks">
              <Toggle value={settings.focus.defaults.autoStartBreaks} onChange={(v) => update({ focus: { defaults: { ...settings.focus.defaults, autoStartBreaks: v } } })} />
            </Row>
            <Row label="Auto-start next work block">
              <Toggle value={settings.focus.defaults.autoStartWork} onChange={(v) => update({ focus: { defaults: { ...settings.focus.defaults, autoStartWork: v } } })} />
            </Row>
            <Row label="Play music when a block starts">
              <Toggle value={settings.focus.defaults.mediaOnStart === "play"} onChange={(v) => update({ focus: { defaults: { ...settings.focus.defaults, mediaOnStart: v ? "play" : "none" } } })} />
            </Row>
            <Row label="Pause music on breaks">
              <Toggle value={settings.focus.defaults.mediaOnBreak === "pause"} onChange={(v) => update({ focus: { defaults: { ...settings.focus.defaults, mediaOnBreak: v ? "pause" : "none" } } })} />
            </Row>
            <Row label="Pause music when the session ends">
              <Toggle value={settings.focus.defaults.mediaOnEnd === "pause"} onChange={(v) => update({ focus: { defaults: { ...settings.focus.defaults, mediaOnEnd: v ? "pause" : "none" } } })} />
            </Row>
            <Row label="Show floating timer">
              <Toggle value={settings.focus.pipAutoShow} onChange={(v) => update({ focus: { pipAutoShow: v } })} />
            </Row>
            <Row label="Ambient sound">
              <select className="input !w-auto !py-1" value={settings.focus.ambient.kind} onChange={(e) => update({ focus: { ambient: { ...settings.focus.ambient, kind: e.target.value, autoStart: e.target.value !== "none" } } })}>
                {AMBIENT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>
        )}
        <button className="btn btn-primary !py-2.5 text-[1em]" onClick={begin}>
          <Play size={16} /> Start {PRESETS.find((p) => p.id === mode)?.label.toLowerCase()}
        </button>
      </div>
    );
  }

  const phaseLabel = s.phase === "work" ? (s.config.taskTitle ?? s.config.label ?? "Focus") : s.phase === "shortBreak" ? "Short break" : "Long break";
  const isBreak = s.phase !== "work";
  const stopwatch = s.config.mode === "stopwatch" && s.phase === "work";
  const color = isBreak ? "#3ccf8e" : undefined;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn("text-[0.8em] font-medium uppercase tracking-widest", isBreak ? "text-success" : "text-accent")}>
        {isBreak ? "Break" : `Block ${s.workPhaseIndex}${s.config.targetWorkPhases ? ` of ${s.config.targetWorkPhases}` : ""}`}
      </div>
      <ProgressRing size={size} stroke={8} progress={stopwatch ? 0 : snap.progress} color={color}>
        <div className="flex flex-col items-center">
          <div className={cn("tabular font-semibold leading-none", size > 160 ? "text-[2.6em]" : "text-[1.9em]")}>{formatClock(stopwatch ? snap.elapsedSecs : snap.remainingSecs)}</div>
          <div className="mt-1.5 max-w-[140px] truncate text-center text-[0.8em] text-muted">{phaseLabel}</div>
          {s.status === "paused" && <div className="mt-1 text-[0.72em] text-warning">paused</div>}
          {s.status === "awaiting" && <div className="mt-1 text-[0.72em] text-accent">ready</div>}
        </div>
      </ProgressRing>
      <div className="flex items-center gap-1.5">
        <button className="btn btn-icon" onClick={() => void stop(false)} aria-label="Stop session" data-tip="Stop session">
          <Square size={16} />
        </button>
        <button className={cn("btn btn-icon !h-12 !w-12 !rounded-full", s.status === "running" ? "" : "btn-primary pulse")} style={s.status !== "running" ? { animation: "pulse-ring 1.6s infinite" } : undefined} onClick={() => void (s.status === "running" ? pause() : resume())} aria-label={s.status === "running" ? "Pause" : s.status === "awaiting" ? "Start next" : "Resume"} data-tip={s.status === "running" ? "Pause" : s.status === "awaiting" ? "Start next" : "Resume"}>
          {s.status === "running" ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>
        <button className="btn btn-icon" onClick={() => void skip()} aria-label={isBreak ? "Skip break" : "Skip to break"} data-tip={isBreak ? "Skip break" : "Skip to break"}>
          <SkipForward size={16} />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[0.82em]">
        {!stopwatch && (
          <>
            <button className="btn btn-sm" onClick={() => void extend(300)}>
              +5m
            </button>
            <button className="btn btn-sm" onClick={() => void extend(600)}>
              +10m
            </button>
          </>
        )}
        {isTauri && (
          <button className="btn btn-sm" onClick={() => void ipc.togglePip()} aria-label="Floating timer" data-tip="Floating timer">
            <PictureInPicture2 size={13} />
          </button>
        )}
        <button className={cn("btn btn-sm", ambientOn && "btn-primary")} onClick={() => setAmbient(!ambientOn)} aria-label="Ambient sound" data-tip="Ambient sound">
          <Volume2 size={13} /> {AMBIENT_OPTIONS.find((o) => o.id === settings.focus.ambient.kind)?.name ?? "Ambient"}
        </button>
        {ambientOn && (
          <select className="input !w-auto !py-0.5 text-[0.9em]" value={settings.focus.ambient.kind} onChange={(e) => { update({ focus: { ambient: { ...settings.focus.ambient, kind: e.target.value } } }); window.setTimeout(() => setAmbient(true), 10); }}>
            {AMBIENT_OPTIONS.filter((o) => o.id !== "none").map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="text-[0.75em] text-faint">
        {s.completedWorkPhases} block{s.completedWorkPhases === 1 ? "" : "s"} done · {formatDuration(s.totalWorkMs / 1000 + (s.phase === "work" ? snap.elapsedSecs : 0))} focused
      </div>
    </div>
  );
}

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {hint && <div className="text-[0.85em] text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <button role="switch" aria-checked={value} className="toggle" onClick={() => onChange(!value)} />;
}

export function AmbientKindSelect({ value, onChange }: { value: AmbientKind; onChange: (k: AmbientKind) => void }) {
  return (
    <select className="input !w-auto" value={value} onChange={(e) => onChange(e.target.value as AmbientKind)}>
      {AMBIENT_OPTIONS.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
