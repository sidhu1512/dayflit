import { useEffect, useState } from "react";
import { ArrowRight, Check, FolderOpen, Sparkles } from "lucide-react";
import { useSettings } from "@/stores/settings";
import { THEMES } from "@/lib/themes";
import { ipc, isTauri } from "@/lib/ipc";
import { useUi } from "@/stores/ui";
import { Kbd } from "./Kbd";
import { cn } from "@/lib/ids";
import { Toggle } from "./FocusPanel";

export function Onboarding() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [step, setStep] = useState(0);
  const [dataDir, setDataDir] = useState("");
  useEffect(() => {
    if (isTauri) void ipc.storeInfo().then((i) => setDataDir(i.path)).catch(() => {});
  }, []);

  const pickFolder = async () => {
    if (!isTauri) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, title: "Choose where Dayflit keeps your data" });
    if (typeof dir === "string") {
      try {
        const p = await ipc.changeDataDir(dir, "move");
        setDataDir(p);
        toast({ title: "Data folder set", body: p, kind: "success" });
      } catch (e) {
        // maybe folder has existing data → adopt
        if (String(e).includes("already contains")) {
          const p = await ipc.changeDataDir(dir, "adopt");
          setDataDir(p);
          toast({ title: "Using existing Dayflit data", body: p, kind: "success" });
          window.location.reload();
        } else toast({ title: "Could not change folder", body: String(e), kind: "error" });
      }
    }
  };

  const steps = [
    <div key="w" className="flex flex-col items-center text-center">
      <div className="relative mb-4 h-16 w-16">
        <div className="absolute inset-0 rounded-full bg-accent/40 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg">
          <Sparkles size={28} />
        </div>
      </div>
      <h1 className="text-[1.5em] font-semibold">Welcome to Dayflit</h1>
      <p className="mt-2 max-w-sm text-muted">A floating companion for tasks, notes, focus sessions, habits and your calendar. Always a keystroke away.</p>
      <div className="mt-5 grid w-full max-w-sm grid-cols-1 gap-1.5 text-left text-[0.88em]">
        <Hint k="Alt+Space">Show or hide Dayflit from anywhere</Hint>
        <Hint k="Alt+Shift+Space">Global command palette</Hint>
        <Hint k="Alt+Shift+T">Capture a task instantly</Hint>
        <Hint k="Alt+Shift+C">Grab the clipboard with its source app</Hint>
      </div>
    </div>,
    <div key="a" className="flex flex-col">
      <h2 className="text-[1.25em] font-semibold">Make it yours</h2>
      <p className="mt-1 text-[0.9em] text-muted">Pick a look. You can fine-tune everything later in Settings.</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {THEMES.map((t) => (
          <button key={t.id} className={cn("card card-hover flex flex-col items-center gap-1.5 p-2", settings.appearance.themeId === t.id && "!border-accent !bg-accent/10")} onClick={() => update({ appearance: { themeId: t.id } })}>
            <div className="flex h-8 w-full overflow-hidden rounded-md">
              <div className="flex-1" style={{ background: `rgb(${t.dark.bg})` }} />
              <div className="flex-1" style={{ background: `rgb(${t.dark.surface2})` }} />
              <div className="w-3" style={{ background: `rgb(${t.dark.accent})` }} />
            </div>
            <span className="text-[0.78em]">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-1.5">
        {(["system", "light", "dark"] as const).map((m) => (
          <button key={m} className={cn("btn btn-sm flex-1 capitalize", settings.appearance.mode === m && "btn-primary")} onClick={() => update({ appearance: { mode: m } })}>
            {m}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-1.5">
        {(["acrylic", "mica", "none"] as const).map((m) => (
          <button key={m} className={cn("btn btn-sm flex-1 capitalize", settings.appearance.material === m && "btn-primary")} onClick={() => update({ appearance: { material: m } })}>
            {m === "none" ? "Solid" : m}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[0.78em] text-faint">Acrylic and Mica use Windows' native blur. Solid is best on older machines.</p>
    </div>,
    <div key="d" className="flex flex-col">
      <h2 className="text-[1.25em] font-semibold">Your data, your folder</h2>
      <p className="mt-1 text-[0.9em] text-muted">Everything is stored locally as plain files with automatic backups. Put it in a synced folder (OneDrive, Dropbox…) to carry it across machines.</p>
      <div className="card mt-3 flex items-center gap-2 px-3 py-2.5 text-[0.85em]">
        <FolderOpen size={16} className="shrink-0 text-accent" />
        <span className="selectable min-w-0 flex-1 truncate">
          {dataDir || "Default location"}
        </span>
        {isTauri && (
          <button className="btn btn-sm" onClick={pickFolder}>
            Change…
          </button>
        )}
      </div>
    </div>,
    <div key="i" className="flex flex-col gap-3">
      <h2 className="text-[1.25em] font-semibold">Integrations</h2>
      <Row label="Capture clipboard automatically" hint="Keeps a history of what you copy, with the source app. Password managers are ignored.">
        <Toggle value={settings.clipboard.enabled} onChange={(v) => update({ clipboard: { enabled: v } })} />
      </Row>
      <Row label="Start with Windows" hint="Launches quietly into the bubble.">
        <Toggle value={settings.window.autostart} onChange={(v) => update({ window: { autostart: v } })} />
      </Row>
      <Row label="Pause focus when Windows locks" hint="Resumes where you left off.">
        <Toggle value={settings.focus.pauseOnLock} onChange={(v) => update({ focus: { pauseOnLock: v } })} />
      </Row>
      <p className="text-[0.8em] text-faint">Spotify, calendars (.ics) and more live in Settings.</p>
    </div>,
  ];

  const last = step === steps.length - 1;
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-bg/90 p-5 backdrop-blur-md anim-fade">
      <div className="glass anim-pop flex w-full max-w-md flex-col p-6 shadow-2xl">
        <div className="min-h-[300px]">{steps[step]}</div>
        <div className="mt-5 flex items-center gap-2">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === step ? "bg-accent" : "bg-surface-3")} />
            ))}
          </div>
          <div className="flex-1" />
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          <button className="btn btn-primary" onClick={() => (last ? update({ onboardingDone: true }) : setStep((s) => s + 1))} autoFocus>
            {last ? (
              <>
                <Check size={15} /> Let's go
              </>
            ) : (
              <>
                Next <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Hint({ k, children }: { k: string; children: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2/60 px-3 py-1.5">
      <span className="text-muted">{children}</span>
      <Kbd>{k}</Kbd>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[0.92em]">{label}</div>
        {hint && <div className="text-[0.78em] text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
