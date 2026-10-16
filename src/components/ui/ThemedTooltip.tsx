import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/ids";

export interface ThemedTooltipProps {
  children: React.ReactNode;
  targetRect: DOMRect | null;
  visible: boolean;
  className?: string;
  side?: "top" | "bottom" | "right" | "left";
}

export function ThemedTooltip({
  children,
  targetRect,
  visible,
  className,
  side = "top",
}: ThemedTooltipProps) {
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!visible || !targetRect || !tooltipRef.current) {
      setCoords(null);
      return;
    }
    const tooltip = tooltipRef.current;
    const tipWidth = tooltip.offsetWidth;
    const tipHeight = tooltip.offsetHeight;

    let top = 0;
    let left = 0;

    if (side === "top") {
      top = targetRect.top - tipHeight - 6;
      left = targetRect.left + (targetRect.width - tipWidth) / 2;
      // If overflowing top edge, flip to bottom
      if (top < 8) top = targetRect.bottom + 6;
    } else if (side === "bottom") {
      top = targetRect.bottom + 6;
      left = targetRect.left + (targetRect.width - tipWidth) / 2;
      if (top + tipHeight > window.innerHeight - 8) top = targetRect.top - tipHeight - 6;
    } else if (side === "right") {
      top = targetRect.top + (targetRect.height - tipHeight) / 2;
      left = targetRect.right + 6;
      if (left + tipWidth > window.innerWidth - 8) left = targetRect.left - tipWidth - 6;
    } else {
      top = targetRect.top + (targetRect.height - tipHeight) / 2;
      left = targetRect.left - tipWidth - 6;
      if (left < 8) left = targetRect.right + 6;
    }

    // Viewport clamping
    left = Math.max(8, Math.min(window.innerWidth - tipWidth - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - tipHeight - 8, top));

    setCoords({ top, left });
  }, [visible, targetRect, side, children]);

  if (!mounted || !visible || !targetRect) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      data-themed-tooltip
      style={{
        position: "fixed",
        top: coords ? `${coords.top}px` : `${targetRect.top}px`,
        left: coords ? `${coords.left}px` : `${targetRect.left}px`,
        opacity: coords ? 1 : 0,
      }}
      className={cn(
        "pointer-events-none z-[9999] select-none rounded-lg border border-subtle hairline bg-surface-2/95 px-2.5 py-1 text-[11px] font-medium text-main text-text shadow-xl backdrop-blur-md anim-pop whitespace-nowrap max-w-[280px] truncate transition-opacity duration-100",
        className
      )}
      role="tooltip"
    >
      {children}
    </div>,
    document.body
  );
}

export interface TruncatedTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
  side?: "top" | "bottom" | "right" | "left";
  tooltipClassName?: string;
}

export function TruncatedText({
  text,
  side = "top",
  className,
  tooltipClassName,
  ...props
}: TruncatedTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const checkTruncation = () => {
    const el = textRef.current;
    if (!el) return;
    const truncated = el.scrollWidth > el.clientWidth;
    setIsTruncated(truncated);
    if (truncated) {
      setTargetRect(el.getBoundingClientRect());
    }
  };

  useLayoutEffect(() => {
    checkTruncation();
  }, [text]);

  return (
    <>
      <span
        ref={textRef}
        data-truncated={isTruncated ? "true" : undefined}
        className={cn("truncate block", className)}
        onMouseEnter={() => {
          checkTruncation();
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
        {...props}
      >
        {text}
      </span>
      <ThemedTooltip
        visible={isHovered && isTruncated}
        targetRect={targetRect}
        side={side}
        className={tooltipClassName}
      >
        {text}
      </ThemedTooltip>
    </>
  );
}
