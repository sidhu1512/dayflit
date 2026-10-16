import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/ids";
import { useUi } from "@/stores/ui";

/**
 * 1. Hardware-Accelerated WAAPI View Stage
 * Glides incoming view in with:
 *   opacity: 0 -> 1
 *   transform: translateY(6px) scale(0.994) -> translateY(0) scale(1)
 *   filter: blur(3px) -> blur(0px)
 * over 190ms cubic-bezier(0.16, 1, 0.3, 1).
 */
export function ViewStage({
  viewKey,
  children,
  className,
}: {
  viewKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    // Check prefers-reduced-motion or data-motion="reduce"
    const prefersReduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";

    if (prefersReduced) return;

    if (typeof el.animate === "function") {
      const animation = el.animate(
        [
          {
            opacity: 0,
            transform: "translateY(6px) scale(0.994)",
            filter: "blur(3px)",
          },
          {
            opacity: 1,
            transform: "translateY(0px) scale(1)",
            filter: "blur(0px)",
          },
        ],
        {
          duration: 190,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        }
      );
      // Clean up WAAPI overrides once animation finishes to restore natural CSS stacking context
      animation.onfinish = () => {
        try {
          animation.cancel();
        } catch {
          /* ignore */
        }
      };
      return () => {
        try {
          animation.cancel();
        } catch {
          /* ignore */
        }
      };
    }
  }, [viewKey]);

  return (
    <div
      ref={stageRef}
      className={cn("h-full w-full min-w-0 flex-1 overflow-hidden relative", className)}
      data-view-stage={viewKey}
      style={{ willChange: "transform, opacity, filter" }}
    >
      {children}
    </div>
  );
}

/**
 * 2. Sliding Active Pill Geometry
 * Physical sliding highlight pill using useLayoutEffect bounding-box interpolation.
 * Automatically finds the active child (`[data-active="true"]`) and glides the pill behind it.
 */
interface PillBounds {
  top: number;
  left: number;
  width: number;
  height: number;
  visible: boolean;
}

export function SlidingPillContainer({
  activeKey,
  children,
  className,
  pillClassName,
}: {
  activeKey: string;
  children: React.ReactNode;
  className?: string;
  pillClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<PillBounds>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    visible: false,
  });
  const [initialized, setInitialized] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeEl = container.querySelector(
      '[data-active="true"]'
    ) as HTMLElement | null;

    if (activeEl) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();

      setBounds({
        top: activeRect.top - containerRect.top + container.scrollTop,
        left: activeRect.left - containerRect.left + container.scrollLeft,
        width: activeRect.width,
        height: activeRect.height,
        visible: true,
      });
      setInitialized(true);
    } else {
      setBounds((prev) => ({ ...prev, visible: false }));
    }
  }, []);

  useLayoutEffect(() => {
    measure();
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [activeKey, measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => measure());
    ro.observe(container);

    window.addEventListener("resize", measure);
    container.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      container.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const prefersReduced =
    typeof window !== "undefined" &&
    (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce");

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
    }
  };

  return (
    <div ref={containerRef} onWheel={handleWheel} className={cn("relative", className)}>
      <div
        className={cn(
          "absolute pointer-events-none rounded-[9px] bg-accent/15 z-0",
          initialized && !prefersReduced
            ? "transition-[transform,width,height,opacity] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            : "transition-none",
          pillClassName
        )}
        style={{
          transform: `translate3d(${bounds.left}px, ${bounds.top}px, 0)`,
          width: bounds.width ? `${bounds.width}px` : 0,
          height: bounds.height ? `${bounds.height}px` : 0,
          opacity: bounds.visible ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}

/**
 * 3. Emil Kowalski Hold-to-Delete Button
 * Progressive danger red fill animation (clip-path: inset(0 100% 0 0) -> inset(0 0 0 0))
 * over 680ms with asymmetric spring release so accidental clicks never destroy data.
 */
export function HoldToDeleteButton({
  onDelete,
  onCancel,
  confirmFallback,
  className,
  title = "Hold to delete",
  size = 14,
  children,
  ariaLabel = "Delete",
}: {
  onDelete: () => void | Promise<void>;
  onCancel?: () => void;
  confirmFallback?: () => void;
  className?: string;
  title?: string;
  size?: number;
  children?: React.ReactNode;
  ariaLabel?: string;
}) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const startTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const HOLD_DURATION_MS = 680;

  const cancelHold = useCallback(
    () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      if (pointerIdRef.current !== null && btnRef.current) {
        try {
          btnRef.current.releasePointerCapture(pointerIdRef.current);
        } catch {
          /* ignore */
        }
        pointerIdRef.current = null;
      }

      const wasTriggered = triggeredRef.current;
      startTimeRef.current = null;
      setHolding(false);
      setProgress(0);

      // Do not trigger cancel if deletion already fired
      if (wasTriggered) {
        return;
      }

      onCancel?.();
    },
    [onCancel]
  );

  const startHold = useCallback(
    (e: React.PointerEvent | React.KeyboardEvent) => {
      // Ignore right clicks
      if ("button" in e && e.button !== 0) return;

      // Ignore repeating keydown events so hold timer isn't repeatedly reset
      if ("repeat" in e && e.repeat) return;
      if (startTimeRef.current !== null) return;

      triggeredRef.current = false;
      startTimeRef.current = Date.now();
      setHolding(true);

      if ("pointerId" in e && btnRef.current) {
        try {
          btnRef.current.setPointerCapture(e.pointerId);
          pointerIdRef.current = e.pointerId;
        } catch {
          /* ignore */
        }
      }

      const tick = () => {
        if (!startTimeRef.current) return;
        const elapsed = Date.now() - startTimeRef.current;
        const p = Math.min(1, elapsed / HOLD_DURATION_MS);
        setProgress(p);

        if (p >= 1) {
          triggeredRef.current = true;
          setHolding(false);
          setProgress(0);
          startTimeRef.current = null;
          if (pointerIdRef.current !== null && btnRef.current) {
            try {
              btnRef.current.releasePointerCapture(pointerIdRef.current);
            } catch {
              /* ignore */
            }
            pointerIdRef.current = null;
          }
          void onDelete();
        } else {
          rafIdRef.current = requestAnimationFrame(tick);
        }
      };

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [onDelete]
  );

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // Global window release listener so button never stays stuck if pointer leaves window or app loses focus
  useEffect(() => {
    if (!holding) return;
    const onWindowRelease = () => {
      cancelHold();
    };
    window.addEventListener("pointerup", onWindowRelease);
    window.addEventListener("pointercancel", onWindowRelease);
    window.addEventListener("blur", onWindowRelease);
    return () => {
      window.removeEventListener("pointerup", onWindowRelease);
      window.removeEventListener("pointercancel", onWindowRelease);
      window.removeEventListener("blur", onWindowRelease);
    };
  }, [holding, cancelHold]);

  return (
    <button
      ref={btnRef}
      type="button"
      className={cn(
        "btn btn-ghost btn-icon btn-sm relative overflow-hidden text-muted hover:text-danger select-none cursor-pointer",
        holding && "scale-[0.96] text-white",
        className
      )}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          startHold(e);
        }
      }}
      onKeyUp={cancelHold}
      onClick={(e) => {
        e.preventDefault();
        // If hold was triggered and completed, deletion already ran
        if (triggeredRef.current) {
          triggeredRef.current = false;
          return;
        }
        // User clicked without holding for 680ms
        if (confirmFallback) {
          confirmFallback();
        } else {
          useUi.getState().toast({
            title: "Hold to delete",
            body: "Press and hold for a moment to delete this item",
            kind: "info",
          });
        }
      }}
      data-testid="hold-delete-btn"
      title={title}
      aria-label={ariaLabel}
      style={{
        transition: holding
          ? "transform 75ms cubic-bezier(0.2, 0, 0.38, 0.9)"
          : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Progressive Red Fill */}
      <span
        className="absolute inset-0 bg-danger pointer-events-none rounded-[inherit]"
        style={{
          clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
          transition: holding
            ? "none"
            : "clip-path 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
      <span className="relative z-10 flex items-center justify-center">
        {children ?? <Trash2 size={size} />}
      </span>
    </button>
  );
}

/**
 * 4. Document Surface Crossfade Stage
 * Crossfades the document editor surface over 150ms cubic-bezier(0.16, 1, 0.3, 1)
 * when switching between notes or entries without unmounting outer shell.
 */
export function DocumentCrossfade({
  docKey,
  children,
  className,
}: {
  docKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;

    const anim = el.animate(
      [
        { opacity: 0.3, transform: "translateY(2px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 150,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "both",
      }
    );
    anim.onfinish = () => {
      try {
        anim.cancel();
      } catch {
        /* ignore */
      }
    };

    return () => {
      try {
        anim.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [docKey]);

  return (
    <div
      ref={ref}
      className={cn("flex flex-1 flex-col min-w-0 h-full", className)}
      style={{ willChange: "opacity, transform" }}
    >
      {children}
    </div>
  );
}

export { HorizontalPillStrip, type PillStripItem, type HorizontalPillStripProps } from "./HorizontalPillStrip";
export { ThemedTooltip, TruncatedText, type ThemedTooltipProps, type TruncatedTextProps } from "./ThemedTooltip";
export { InfoHint, type InfoHintProps } from "./InfoHint";
