import { BarChart3, BookOpen, CalendarDays, CheckSquare, Clipboard, Repeat, Settings, StickyNote, Sun, Timer } from "lucide-react";
import { useUi, type View } from "@/stores/ui";
import { useTasks, todayTasks } from "@/stores/tasks";
import { useClips } from "@/stores/clips";

const ITEMS: { id: View; label: string; icon: React.ReactNode; key: string }[] = [
  { id: "today", label: "Today", icon: <Sun size={17} />, key: "1" },
  { id: "tasks", label: "Tasks", icon: <CheckSquare size={17} />, key: "2" },
  { id: "notes", label: "Notes", icon: <StickyNote size={17} />, key: "3" },
  { id: "journal", label: "Journal", icon: <BookOpen size={17} />, key: "4" },
  { id: "calendar", label: "Calendar", icon: <CalendarDays size={17} />, key: "5" },
  { id: "focus", label: "Focus", icon: <Timer size={17} />, key: "6" },
  { id: "habits", label: "Habits", icon: <Repeat size={17} />, key: "7" },
  { id: "clips", label: "Clips", icon: <Clipboard size={17} />, key: "8" },
  { id: "stats", label: "Insights", icon: <BarChart3 size={17} />, key: "9" },
];

export function Nav({ compact }: { compact: boolean }) {
  const view = useUi((s) => s.view);
  const navigate = useUi((s) => s.navigate);
  const tasks = useTasks((s) => s.tasks);
  const clipsNew = useClips((s) => s.lastCaptured);
  const todayCount = todayTasks(tasks).length;

  if (compact) {
    return (
      <nav className="flex shrink-0 items-center justify-around gap-0 px-1 pb-1.5 pt-1">
        {ITEMS.map((it) => (
          <button key={it.id} className="nav-item relative !px-2 !py-1.5" data-active={view === it.id} onClick={() => navigate(it.id)} aria-label={it.label} data-tip={it.label} data-tip-pos="top">
            {it.icon}
            {it.id === "today" && todayCount > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-accent px-1 text-[0.62em] font-bold text-accent-fg">{todayCount}</span>}
            {it.id === "clips" && clipsNew && view !== "clips" && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>
        ))}
        <button className="nav-item !px-2 !py-1.5" data-active={view === "settings"} onClick={() => navigate("settings")} aria-label="Settings" data-tip="Settings" data-tip-pos="top">
          <Settings size={17} />
        </button>
      </nav>
    );
  }

  return (
    <nav className="flex w-[148px] shrink-0 flex-col gap-0.5 px-2 pb-2">
      {ITEMS.map((it) => (
        <button key={it.id} className="nav-item" data-active={view === it.id} onClick={() => navigate(it.id)}>
          {it.icon}
          <span className="flex-1 text-left">{it.label}</span>
          {it.id === "today" && todayCount > 0 && <span className="rounded-full bg-accent/20 px-1.5 text-[0.7em] font-semibold text-accent">{todayCount}</span>}
          {it.id === "clips" && clipsNew && view !== "clips" && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </button>
      ))}
      <div className="flex-1" />
      <button className="nav-item" data-active={view === "settings"} onClick={() => navigate("settings")}>
        <Settings size={17} />
        <span>Settings</span>
      </button>
    </nav>
  );
}

export const NAV_ITEMS = ITEMS;
