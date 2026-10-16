import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Plus, Search, Check, Trash2, Pencil, X } from "lucide-react";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/ids";

export interface PillStripItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  badge?: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
  ariaLabel?: string;
  canModify?: boolean;
}

interface PillBounds {
  top: number;
  left: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface HorizontalPillStripProps {
  /** Optional item descriptors for quick-switcher popover and/or automatic item rendering */
  items?: PillStripItem[];
  /** Active key for sliding highlight pill animation */
  activeKey?: string;
  /** Custom children (e.g. custom buttons/chips) */
  children?: React.ReactNode;
  /** Wrapper class */
  className?: string;
  /** Scroll track class */
  scrollClassName?: string;
  /** Custom class for the sliding highlight pill */
  pillClassName?: string;
  /** Callback when the pinned '+' button is clicked */
  onAdd?: () => void;
  /** Tooltip or aria-label for '+' button */
  addLabel?: string;
  addAriaLabel?: string;
  /** Label generator for quick switcher button. Defaults to "All ({count}) ▾" */
  quickSwitcherLabel?: (count: number) => string;
  /** Minimum number of items before rendering quick-switcher. Defaults to 5. */
  quickSwitcherThreshold?: number;
  /** Additional controls pinned to the left */
  pinnedLeft?: React.ReactNode;
  /** Additional controls pinned to the right */
  pinnedRight?: React.ReactNode;
  /** Delete callback for modifiable pills */
  onDelete?: (id: string) => void;
  /** Rename callback for modifiable pills */
  onRename?: (id: string, newLabel: string) => void;
  /** Filter to determine whether a pill can be renamed/deleted */
  canModify?: (id: string) => boolean;
}

export function HorizontalPillStrip({
  items,
  activeKey,
  children,
  className,
  scrollClassName,
  pillClassName,
  onAdd,
  addLabel = "Add new",
  addAriaLabel = "Add new",
  quickSwitcherLabel,
  quickSwitcherThreshold = 5,
  pinnedLeft,
  pinnedRight,
  onDelete,
  onRename,
  canModify,
}: HorizontalPillStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; label: string; x: number; y: number } | null>(null);

  const isItemModifiable = useCallback(
    (it: PillStripItem) => {
      if (it.canModify !== undefined) return it.canModify;
      if (canModify) return canModify(it.id);
      const system = ["all", "inbox", "today", "upcoming", "someday", "logbook", "default", "favorites", "archived"];
      return !system.includes(it.id.toLowerCase());
    },
    [canModify]
  );

  // Sliding pill highlight bounds
  const [bounds, setBounds] = useState<PillBounds>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    visible: false,
  });
  const [initialized, setInitialized] = useState(false);

  const measureHighlight = useCallback(() => {
    const container = scrollRef.current;
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

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth;
    setCanScrollLeft(hasOverflow && el.scrollLeft > 2);
    setCanScrollRight(hasOverflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    measureHighlight();
  }, [measureHighlight]);

  useLayoutEffect(() => {
    updateScrollState();
    const raf = requestAnimationFrame(updateScrollState);
    return () => cancelAnimationFrame(raf);
  }, [activeKey, items, children, updateScrollState]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(container);

    window.addEventListener("resize", updateScrollState);
    container.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScrollState);
      container.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState]);

  // Click outside to close quick-switcher popover or context menu
  useEffect(() => {
    if (!popoverOpen && !contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const isInsidePopover =
        (popoverRef.current && popoverRef.current.contains(target)) ||
        (typeof e.composedPath === "function" && e.composedPath().some((el) => el === popoverRef.current));
      if (popoverOpen && !isInsidePopover) {
        setPopoverOpen(false);
      }
      const isInsideContextMenu =
        (contextMenuRef.current && contextMenuRef.current.contains(target)) ||
        (typeof e.composedPath === "function" && e.composedPath().some((el) => el === contextMenuRef.current));
      if (contextMenu && !isInsideContextMenu) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopoverOpen(false);
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen, contextMenu]);

  // Mouse wheel to horizontal scroll translation
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
    }
  };

  const scrollByDelta = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  const prefersReduced =
    typeof window !== "undefined" &&
    (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce");

  const itemCount = items?.length ?? 0;
  // Keep quick switcher mounted while open so deleting items below threshold does not abruptly close it
  const showQuickSwitcher = itemCount > quickSwitcherThreshold || popoverOpen;
  const switcherLabelText = quickSwitcherLabel
    ? quickSwitcherLabel(itemCount)
    : `All (${itemCount}) ▾`;

  const filteredItems = items?.filter((it) =>
    filterQuery ? it.label.toLowerCase().includes(filterQuery.toLowerCase()) : true
  );

  return (
    <div
      className={cn(
        "relative flex items-center min-w-0 max-w-full gap-1 text-[0.85em] select-none",
        className
      )}
    >
      {pinnedLeft && <div className="shrink-0 flex items-center">{pinnedLeft}</div>}

      {/* Left Chevron Button */}
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll left"
          className="btn btn-ghost btn-icon !h-6 !w-6 shrink-0 rounded-full bg-surface-2/90 shadow-xs hover:bg-surface-3 transition-colors text-muted hover:text-text z-20"
          onClick={() => scrollByDelta(-180)}
        >
          <ChevronLeft size={13} />
        </button>
      )}

      {/* Main Horizontal Scrollable Track */}
      <div
        ref={scrollRef}
        data-pill-strip
        onWheel={handleWheel}
        className={cn(
          "relative flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden no-scrollbar flex-nowrap scroll-smooth",
          scrollClassName
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          overflowY: "hidden",
        }}
      >
        {/* Sliding Pill Highlight */}
        {activeKey !== undefined && (
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
        )}

        {children}

        {/* Automatic item rendering if children not provided */}
        {!children &&
          items?.map((it) => {
            const modifiable = isItemModifiable(it);
            return (
              <div
                key={it.id}
                data-active={it.active ? "true" : undefined}
                data-pill-id={it.id}
                className={cn(
                  "group/pill chip shrink-0 cursor-pointer gap-1 relative z-10 transition-colors pr-1.5 inline-flex items-center",
                  it.active && "text-accent font-semibold"
                )}
                onClick={it.onSelect}
                onContextMenu={(e) => {
                  if (!modifiable || (!onDelete && !onRename)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ id: it.id, label: it.label, x: e.clientX, y: e.clientY });
                }}
                onDoubleClick={async (e) => {
                  if (!modifiable || !onRename) return;
                  e.stopPropagation();
                  const newName = await useUi.getState().promptUser({
                    title: `Rename "${it.label}"`,
                    body: "Enter new name:",
                    initialValue: it.label,
                    placeholder: it.label,
                    confirmLabel: "Rename",
                  });
                  if (newName && newName.trim() && newName.trim() !== it.label) {
                    onRename(it.id, newName.trim());
                  }
                }}
                aria-label={it.ariaLabel || it.label}
                role="button"
                tabIndex={0}
              >
                {it.icon && (
                  <span style={it.color ? { color: it.color } : undefined} className="shrink-0">
                    {it.icon}
                  </span>
                )}
                <span className="max-w-[130px] truncate">{it.label}</span>
                {it.badge && <span className="shrink-0">{it.badge}</span>}

                {/* Direct Pill Actions on hover */}
                {modifiable && (onDelete || onRename) && (
                  <div className="flex items-center gap-0.5 ml-0.5 shrink-0">
                    {onRename && (
                      <button
                        type="button"
                        data-rename-pill={it.id}
                        aria-label={`Rename ${it.label}`}
                        title={`Rename ${it.label}`}
                        className="opacity-0 group-hover/pill:opacity-100 hover:text-accent hover:bg-surface-3 rounded-full p-0.5 transition-all text-faint shrink-0"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const newName = await useUi.getState().promptUser({
                            title: `Rename "${it.label}"`,
                            body: "Enter new name:",
                            initialValue: it.label,
                            placeholder: it.label,
                            confirmLabel: "Rename",
                          });
                          if (newName && newName.trim() && newName.trim() !== it.label) {
                            onRename(it.id, newName.trim());
                          }
                        }}
                      >
                        <Pencil size={10} strokeWidth={2} />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        data-delete-pill={it.id}
                        aria-label={`Delete ${it.label}`}
                        title={`Delete ${it.label}`}
                        className="opacity-0 group-hover/pill:opacity-100 hover:text-danger hover:bg-danger/20 rounded-full p-0.5 transition-all text-faint shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(it.id);
                        }}
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Right Chevron Button */}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll right"
          className="btn btn-ghost btn-icon !h-6 !w-6 shrink-0 rounded-full bg-surface-2/90 shadow-xs hover:bg-surface-3 transition-colors text-muted hover:text-text z-20"
          onClick={() => scrollByDelta(180)}
        >
          <ChevronRight size={13} />
        </button>
      )}

      {/* Pinned Right Controls: Quick Switcher & '+' Add Button */}
      <div className="flex items-center gap-1 shrink-0 ml-1 z-20 relative">
        {/* Quick Switcher Popover Button */}
        {showQuickSwitcher && (
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              data-quick-switcher
              className={cn(
                "chip shrink-0 cursor-pointer gap-1 transition-colors font-medium text-[0.8em] !px-2 !py-0.5",
                popoverOpen ? "bg-accent/20 text-accent font-semibold" : "hover:bg-surface-2"
              )}
              onClick={() => {
                setPopoverOpen((o) => !o);
                setFilterQuery("");
              }}
              title="Jump directly to any item"
              aria-label={`Jump to any item (${itemCount} items)`}
              aria-expanded={popoverOpen}
            >
              <span>{switcherLabelText}</span>
            </button>

            {popoverOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-50 flex w-60 flex-col gap-1 rounded-xl border hairline bg-surface/95 p-1.5 shadow-2xl backdrop-blur-xl anim-pop"
                role="dialog"
                aria-label="Item switcher"
              >
                {itemCount > 7 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-surface-2/70 px-2 py-1 mb-1">
                    <Search size={12} className="text-faint shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      className="flex-1 bg-transparent text-[0.82em] outline-none placeholder:text-faint"
                      placeholder="Filter..."
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                    />
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto space-y-0.5 scroll">
                  {filteredItems?.length === 0 ? (
                    <div className="px-2 py-2 text-center text-[0.78em] text-faint">
                      No matching items
                    </div>
                  ) : (
                    filteredItems?.map((it) => {
                      const modifiable = isItemModifiable(it);
                      return (
                        <div
                          key={it.id}
                          className={cn(
                            "group/pop w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-[0.82em] transition-colors",
                            it.active
                              ? "bg-accent/15 text-accent font-semibold"
                              : "hover:bg-surface-2/80 text-text"
                          )}
                        >
                          <button
                            type="button"
                            data-quick-item={it.id}
                            className="flex items-center gap-1.5 min-w-0 flex-1 truncate text-left cursor-pointer"
                            onClick={() => {
                              it.onSelect();
                              setPopoverOpen(false);
                              // Scroll active element into center of strip
                              setTimeout(() => {
                                const activeEl = scrollRef.current?.querySelector('[data-active="true"]');
                                activeEl?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                              }, 50);
                            }}
                          >
                            {it.icon && (
                              <span style={it.color ? { color: it.color } : undefined} className="shrink-0">
                                {it.icon}
                              </span>
                            )}
                            <span className="truncate">{it.label}</span>
                            {it.badge && <span className="shrink-0 ml-1">{it.badge}</span>}
                            {it.active && <Check size={12} className="shrink-0 ml-1 text-accent" />}
                          </button>

                          {/* Right-aligned Rename & Delete icons */}
                          {modifiable && (onDelete || onRename) && (
                            <div className="flex items-center gap-1 shrink-0 ml-1.5">
                              {onRename && (
                                <button
                                  type="button"
                                  data-rename-item={it.id}
                                  aria-label={`Rename ${it.label}`}
                                  title="Rename"
                                  className="p-1 rounded-md text-faint hover:text-accent hover:bg-surface-3 transition-colors cursor-pointer"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const newName = await useUi.getState().promptUser({
                                      title: `Rename "${it.label}"`,
                                      body: "Enter new name:",
                                      initialValue: it.label,
                                      placeholder: it.label,
                                      confirmLabel: "Rename",
                                    });
                                    if (newName && newName.trim() && newName.trim() !== it.label) {
                                      onRename(it.id, newName.trim());
                                    }
                                  }}
                                >
                                  <Pencil size={11} />
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  type="button"
                                  data-delete-item={it.id}
                                  aria-label={`Delete ${it.label}`}
                                  title="Delete"
                                  className="p-1 rounded-md text-faint hover:text-danger hover:bg-danger/20 transition-colors cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // CRITICAL: Do NOT close popover! Allows deleting 10 items in 5 seconds!
                                    onDelete(it.id);
                                  }}
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pinned Add Button */}
        {onAdd && (
          <button
            type="button"
            data-pinned-add
            className="chip shrink-0 cursor-pointer gap-0.5 hover:bg-surface-2 transition-colors !px-1.5 !py-0.5"
            onClick={onAdd}
            title={addLabel}
            aria-label={addAriaLabel}
          >
            <Plus size={12} />
          </button>
        )}

        {pinnedRight}
      </div>

      {/* Sleek Right-Click Context Menu */}
      {contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={contextMenuRef}
            data-pill-context-menu
            style={{
              position: "fixed",
              top: `${Math.min(window.innerHeight - 90, contextMenu.y)}px`,
              left: `${Math.min(window.innerWidth - 150, contextMenu.x)}px`,
            }}
            className="z-[9999] min-w-[130px] rounded-xl border hairline bg-surface/95 p-1 shadow-2xl backdrop-blur-xl anim-pop select-none"
            role="menu"
          >
            {onRename && (
              <button
                type="button"
                data-context-rename
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.8em] text-text hover:bg-surface-2 transition-colors cursor-pointer text-left"
                onClick={async (e) => {
                  e.stopPropagation();
                  const targetId = contextMenu.id;
                  const targetLabel = contextMenu.label;
                  setContextMenu(null);
                  const newName = await useUi.getState().promptUser({
                    title: `Rename "${targetLabel}"`,
                    body: "Enter new name:",
                    initialValue: targetLabel,
                    placeholder: targetLabel,
                    confirmLabel: "Rename",
                  });
                  if (newName && newName.trim() && newName.trim() !== targetLabel) {
                    onRename(targetId, newName.trim());
                  }
                }}
              >
                <Pencil size={12} className="text-muted" />
                <span>Rename</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                data-context-delete
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.8em] text-danger hover:bg-danger/15 transition-colors cursor-pointer text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  const targetId = contextMenu.id;
                  setContextMenu(null);
                  onDelete(targetId);
                }}
              >
                <Trash2 size={12} />
                <span>Delete</span>
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
