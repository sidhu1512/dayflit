import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "@/styles/app.css";
import { ipc, on, type RawClip } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import type { PaletteAction, PaletteData } from "@/lib/actions";
import { applyTheme } from "@/lib/themes";
import { loadCollection } from "@/lib/persist";
import { defaultSettings } from "@/stores/settings";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PaletteCore, type PaletteMode } from "@/components/CommandPalette";

function PaletteWindow() {
  const [mode, setMode] = useState<PaletteMode>("commands");
  const [data, setData] = useState<PaletteData | null>(null);
  const [clip, setClip] = useState<RawClip | null>(null);
  const [gen, setGen] = useState(0);

  const requestData = useCallback(() => {
    void emitTo("main", "sid://palette/request", null);
  }, []);

  useEffect(() => {
    const applyFromDisk = () =>
      loadCollection<Partial<Settings> | null>("settings", null).then(({ data }) => applyTheme({ ...defaultSettings().appearance, ...(data?.appearance ?? {}) }));
    void applyFromDisk();
    const uns: (() => void)[] = [];
    void on<string>("sid://palette/open", (m) => {
      const mm = (m === "commands" || m === "search" || m === "task" || m === "note" || m === "capture" ? m : "commands") as PaletteMode;
      setMode(mm);
      setGen((g) => g + 1);
      requestData();
      if (mm === "capture") {
        setClip((prev) => {
          if (prev && Date.now() - (prev.at || 0) < 5000) return prev;
          void ipc.clipboardReadNow().then(setClip).catch(() => setClip(null));
          return prev;
        });
      }
    }).then((u) => uns.push(u));
    void on<PaletteData>("sid://palette/data", setData).then((u) => uns.push(u));
    void on<RawClip | null>("sid://clipboard/capture", (c) => {
      if (c) setClip(c);
    }).then((u) => uns.push(u));
    void on<unknown>("sid://settings/changed", () => void applyFromDisk()).then((u) => uns.push(u));
    requestData();
    return () => uns.forEach((u) => u());
  }, [requestData]);

  const rootRef = useRef<HTMLDivElement>(null);
  // Size the window to its content with ample padding for multi-sided ambient shadows
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let last = 0;
    const ro = new ResizeObserver(() => {
      const h = Math.min(720, Math.max(140, Math.ceil(el.getBoundingClientRect().height) + 40));
      if (Math.abs(h - last) < 2) return;
      last = h;
      void getCurrentWindow().setSize(new LogicalSize(712, h)).catch(() => {});
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const close = () => void ipc.hidePalette();
  const act = (a: PaletteAction) => void emitTo("main", "sid://palette/action", a);

  return (
    <div className="w-fit select-none flex justify-center p-5 bg-transparent">
      <div ref={rootRef} className="w-[672px]">
        <PaletteCore key={gen} mode={mode} data={data} clip={clip} onAction={act} onClose={close} floating refreshData={requestData} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Palette Error">
      <PaletteWindow />
    </ErrorBoundary>
  </StrictMode>,
);
