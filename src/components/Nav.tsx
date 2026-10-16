import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Clipboard,
  Compass,
  LayoutGrid,
  PanelLeft,
  PanelLeftClose,
  Repeat,
  Settings,
  StickyNote,
  Sun,
  Timer,
} from "lucide-react";
import { useUi, type View } from "@/stores/ui";
import { useTasks, todayTasks } from "@/stores/tasks";
import { useClips } from "@/stores/clips";
import { SlidingPillContainer } from "@/components/ui/MotionPrimitives";
import { TruncatedText } from "@/components/ui/ThemedTooltip";
import { cn } from "@/lib/ids";

const GROUPS: { title?: string; items: { id: View; label: string; icon: React.ReactNode; key: string }[] }[] = [
  {
    items: [
      { id: "today", label: "Today", icon: <Sun size={16} strokeWidth={2.2} />, key: "1" },
      { id: "tasks", label: "Tasks", icon: <CheckSquare size={16} strokeWidth={2.2} />, key: "2" },
      { id: "calendar", label: "Calendar", icon: <CalendarDays size={16} strokeWidth={2.2} />, key: "5" },
      { id: "focus", label: "Focus", icon: <Timer size={16} strokeWidth={2.2} />, key: "6" },
    ],
  },
  {
    title: "Capture",
    items: [
      { id: "notes", label: "Notes", icon: <StickyNote size={16} strokeWidth={2.2} />, key: "3" },
      { id: "canvas", label: "Canvas", icon: <LayoutGrid size={16} strokeWidth={2.2} />, key: "c" },
      { id: "journal", label: "Journal", icon: <BookOpen size={16} strokeWidth={2.2} />, key: "4" },
      { id: "habits", label: "Habits", icon: <Repeat size={16} strokeWidth={2.2} />, key: "7" },
      { id: "life", label: "Life", icon: <Compass size={16} strokeWidth={2.2} />, key: "8" },
    ],
  },
  {
    title: "Library",
    items: [
      { id: "clips", label: "Clips", icon: <Clipboard size={16} strokeWidth={2.2} />, key: "9" },
      { id: "stats", label: "Insights", icon: <BarChart3 size={16} strokeWidth={2.2} />, key: "0" },
    ],
  },
];

const ITEMS = GROUPS.flatMap((g) => g.items);

export function Nav({ rail }: { rail?: boolean }) {
  const view = useUi((s) => s.view);
  const navigate = useUi((s) => s.navigate);
  const toggleSidebarPinned = useUi((s) => s.toggleSidebarPinned);
  const tasks = useTasks((s) => s.tasks);
  const clipsNew = useClips((s) => s.lastCaptured);
  const todayCount = todayTasks(tasks).length;

  if (rail) {
    return (
      <nav
        className="flex w-[52px] shrink-0 flex-col items-center py-2 px-1 select-none h-full border-r hairline bg-surface/30 z-10 transition-all duration-200"
        aria-label="Navigation rail"
      >
        {/* Toggle Sidebar Pin Button */}
        <button
          className="btn btn-ghost btn-icon !h-8 !w-8 text-muted hover:text-text mb-2 shrink-0 rounded-xl"
          onClick={toggleSidebarPinned}
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeft size={16} strokeWidth={2} />
        </button>

        {/* Scrollable Rail Items */}
        <div className="flex-1 w-full flex flex-col items-center gap-1 overflow-y-auto no-scrollbar py-0.5">
          {ITEMS.map((it) => {
            const isActive = view === it.id;
            return (
              <button
                key={it.id}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-xl transition-all interactive-press shrink-0",
                  isActive
                    ? "bg-accent/15 text-accent font-semibold shadow-xs"
                    : "text-muted hover:bg-surface-2/70 hover:text-text"
                )}
                onClick={() => navigate(it.id)}
                title={it.label}
                aria-label={it.label}
                data-active={isActive ? "true" : undefined}
              >
                {it.icon}
                {it.id === "today" && todayCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-fg shadow-xs tabular">
                    {todayCount}
                  </span>
                )}
                {it.id === "clips" && clipsNew && view !== "clips" && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
                )}
              </button>
            );
          })}
        </div>

        {/* Settings button */}
        <button
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-xl transition-all interactive-press mt-auto shrink-0",
            view === "settings"
              ? "bg-accent/15 text-accent font-semibold shadow-xs"
              : "text-muted hover:bg-surface-2/70 hover:text-text"
          )}
          onClick={() => navigate("settings")}
          title="Settings"
          aria-label="Settings"
          data-active={view === "settings" ? "true" : undefined}
        >
          <Settings size={16} strokeWidth={2.2} />
        </button>
      </nav>
    );
  }

  return (
    <nav
      className="flex w-[160px] shrink-0 flex-col px-2 pb-2 pt-1.5 select-none h-full border-r hairline bg-surface/30 z-10 transition-all duration-200"
      aria-label="Main sidebar"
    >
      <div className="flex items-center justify-between px-1.5 pb-1 mb-1 border-b hairline">
        <span className="text-[10px] font-semibold text-muted/60 tracking-wider uppercase">DayFlit</span>
        <button
          className="btn btn-ghost btn-icon !h-6 !w-6 text-muted hover:text-text rounded-lg"
          onClick={toggleSidebarPinned}
          title="Collapse to rail"
          aria-label="Collapse to rail"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      <SlidingPillContainer activeKey={view} className="flex flex-1 flex-col overflow-y-auto no-scrollbar" pillClassName="bg-accent/15">
        <div className="flex flex-1 flex-col gap-0.5">
          {GROUPS.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {g.title && (
                <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted/50 select-none">
                  {g.title}
                </div>
              )}
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className="nav-item w-full"
                  data-active={view === it.id}
                  onClick={() => navigate(it.id)}
                  aria-label={it.label}
                >
                  {it.icon}
                  <TruncatedText text={it.label} side="right" className="flex-1 text-left truncate min-w-0" />
                  {it.id === "today" && todayCount > 0 && (
                    <span className="rounded-full bg-accent/20 px-1.5 py-0.2 text-[0.68em] font-semibold text-accent tabular">
                      {todayCount}
                    </span>
                  )}
                  {it.id === "clips" && clipsNew && view !== "clips" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="divider my-1.5 shrink-0" />
        <button
          className="nav-item w-full shrink-0"
          data-active={view === "settings"}
          onClick={() => navigate("settings")}
          aria-label="Settings"
        >
          <Settings size={16} strokeWidth={2.2} />
          <TruncatedText text="Settings" side="right" className="flex-1 text-left truncate min-w-0" />
        </button>
      </SlidingPillContainer>
    </nav>
  );
}

export const NAV_ITEMS = ITEMS;
