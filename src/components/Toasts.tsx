import { X } from "lucide-react";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/ids";

const DOT_COLORS: Record<string, string> = {
  info: "bg-accent",
  success: "bg-emerald-500",
  error: "bg-rose-500",
  warning: "bg-amber-500",
};

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-1.5 select-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="group pointer-events-auto flex items-center gap-2 h-[30px] px-3 py-1 rounded-full text-[11.5px] font-medium bg-surface-2/95 backdrop-blur-md border hairline shadow-lg max-w-[320px] text-text anim-slide"
          role="status"
        >
          {/* Subtle 6px status dot */}
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0 shadow-xs",
              DOT_COLORS[t.kind] ?? "bg-accent"
            )}
          />

          {/* Toast Message */}
          <span className="truncate text-text font-medium leading-none">
            {t.title}
          </span>

          {/* Optional inline Action button (e.g. Undo) */}
          {t.action && (
            <button
              type="button"
              className="ml-0.5 text-[11px] font-semibold text-accent hover:underline shrink-0 cursor-pointer"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}

          {/* Sleek inline dismiss × button */}
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 text-faint hover:text-text rounded-full p-0.5 transition-opacity shrink-0 ml-0.5"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
