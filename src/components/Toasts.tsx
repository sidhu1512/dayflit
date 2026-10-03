import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useUi } from "@/stores/ui";

const ICONS = {
  info: <Info size={16} className="text-accent" />,
  success: <CheckCircle2 size={16} className="text-success" />,
  error: <XCircle size={16} className="text-danger" />,
  warning: <AlertTriangle size={16} className="text-warning" />,
};

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="glass anim-slide pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 shadow-lg" role="status">
          <div className="mt-0.5 shrink-0">{ICONS[t.kind]}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.92em] font-medium leading-tight">{t.title}</div>
            {t.body && <div className="mt-0.5 text-[0.82em] text-muted leading-snug">{t.body}</div>}
            {t.action && (
              <button
                className="mt-1.5 text-[0.82em] font-semibold text-accent hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm -mr-1 -mt-1 text-faint" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
