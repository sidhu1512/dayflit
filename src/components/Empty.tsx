import type { ReactNode } from "react";

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="anim-fade flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint opacity-70">{icon}</div>}
      <div className="font-medium">{title}</div>
      {body && <div className="mt-1 max-w-xs text-[0.88em] text-muted">{body}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
