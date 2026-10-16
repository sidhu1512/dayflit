import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/ids";

export interface InfoHintProps {
  text: string;
  className?: string;
  side?: "top" | "bottom" | "right" | "left";
}

export function InfoHint({ text, className, side = "top" }: InfoHintProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) {
      setCoords(null);
      return;
    }
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const pop = popoverRef.current;
    const popWidth = pop.offsetWidth;
    const popHeight = pop.offsetHeight;

    let top = 0;
    let left = 0;

    if (side === "top") {
      top = triggerRect.top - popHeight - 6;
      left = triggerRect.left + (triggerRect.width - popWidth) / 2;
      // If overflow top, flip to bottom
      if (top < 8) top = triggerRect.bottom + 6;
    } else if (side === "bottom") {
      top = triggerRect.bottom + 6;
      left = triggerRect.left + (triggerRect.width - popWidth) / 2;
      if (top + popHeight > window.innerHeight - 8) top = triggerRect.top - popHeight - 6;
    } else if (side === "right") {
      top = triggerRect.top + (triggerRect.height - popHeight) / 2;
      left = triggerRect.right + 6;
      if (left + popWidth > window.innerWidth - 8) left = triggerRect.left - popWidth - 6;
    } else {
      top = triggerRect.top + (triggerRect.height - popHeight) / 2;
      left = triggerRect.left - popWidth - 6;
      if (left < 8) left = triggerRect.right + 6;
    }

    // Viewport clamping
    left = Math.max(10, Math.min(window.innerWidth - popWidth - 10, left));
    top = Math.max(10, Math.min(window.innerHeight - popHeight - 10, top));

    setCoords({ top, left });
  }, [isOpen, side, text]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-info-hint
        aria-label={text}
        className={cn(
          "inline-flex items-center justify-center text-muted/45 hover:text-text hover:text-main transition-colors cursor-help shrink-0 p-0.5 rounded focus:outline-none focus-visible:text-accent",
          className
        )}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        <Info size={13} strokeWidth={2} />
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            data-info-popover
            style={{
              position: "fixed",
              top: coords ? `${coords.top}px` : "0px",
              left: coords ? `${coords.left}px` : "0px",
              opacity: coords ? 1 : 0,
            }}
            className="pointer-events-none z-[9999] select-none rounded-xl border border-subtle hairline bg-surface-2/95 px-3 py-2 text-[11.5px] leading-relaxed text-main text-text shadow-xl backdrop-blur-md max-w-[240px] anim-pop transition-opacity duration-100"
            role="tooltip"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
