import { useEffect, useRef, useState } from "react";
import { useUi } from "@/stores/ui";

export function PromptDialog() {
  const req = useUi((s) => s.prompt);
  const close = useUi((s) => s.closePrompt);
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!req) return;
    setVal(req.defaultValue ?? req.initialValue ?? "");
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [req, close]);

  if (!req) return null;

  const submit = () => {
    close(val);
  };

  return (
    <div className="absolute inset-0 z-[75] flex items-center justify-center bg-black/40 p-6 anim-fade" onMouseDown={() => close(null)}>
      <div className="glass anim-pop w-full max-w-sm max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto p-5 shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-[1.05em] font-semibold">{req.title}</div>
        {req.body && <div className="mt-1.5 text-[0.9em] text-muted leading-snug">{req.body}</div>}
        <div className="mt-3">
          <input
            ref={inputRef}
            type="text"
            className="input w-full"
            placeholder={req.placeholder ?? ""}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => close(null)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            {req.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
