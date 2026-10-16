import { useEffect, useRef } from "react";
import { useUi } from "@/stores/ui";

export function ConfirmDialog() {
  const req = useUi((s) => s.confirm);
  const close = useUi((s) => s.closeConfirm);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!req) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [req, close]);
  if (!req) return null;
  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 p-6 anim-fade" onMouseDown={() => close(false)}>
      <div className="glass anim-pop w-full max-w-sm max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto p-5 shadow-2xl" role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-[1.05em] font-semibold">{req.title}</div>
        {req.body && <div className="mt-1.5 text-[0.9em] text-muted leading-snug">{req.body}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => close(false)}>
            Cancel
          </button>
          <button ref={okRef} className={`btn ${req.danger ? "btn-danger" : "btn-primary"}`} onClick={() => close(true)}>
            {req.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
