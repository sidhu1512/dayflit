import { Check, Flame, Minus, Plus } from "lucide-react";
import type { Habit } from "@/lib/types";
import { isDoneOn, streak, useHabits } from "@/stores/habits";
import { dateKey } from "@/lib/dates";
import { uiSound } from "@/lib/audio";
import { cn } from "@/lib/ids";
import { HabitIcon } from "./icons";

export function HabitRow({ habit, day, onOpen, dense }: { habit: Habit; day?: Date; onOpen?: () => void; dense?: boolean }) {
  const key = dateKey(day ?? new Date());
  const increment = useHabits((s) => s.increment);
  const toggle = useHabits((s) => s.toggle);
  const count = habit.log[key] ?? 0;
  const done = isDoneOn(habit, key);
  const st = streak(habit);
  const multi = habit.target > 1;

  return (
    <div className={cn("group flex items-center gap-2.5 rounded-xl px-2.5 hover:bg-surface-2/60", dense ? "py-1.5" : "py-2")} onDoubleClick={onOpen}>
      <button
        className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[1.05em] transition", done ? "scale-105" : "opacity-90")}
        style={{ background: done ? habit.color : `color-mix(in srgb, ${habit.color} 22%, transparent)`, boxShadow: done ? `0 0 14px ${habit.color}66` : undefined }}
        onClick={() => {
          if (!done) uiSound("complete", 0.3);
          multi ? increment(habit.id, key, 1) : toggle(habit.id, key);
        }}
        aria-label={multi ? "Log one" : done ? "Undo" : "Done"} data-tip={multi ? "Log one" : done ? "Undo" : "Done"}
      >
        {done ? <Check size={16} strokeWidth={3} className="text-white drop-shadow" /> : <HabitIcon name={habit.icon} size={16} color={habit.color} />}
      </button>
      <div className="min-w-0 flex-1 cursor-default" onClick={onOpen}>
        <div className={cn("truncate text-[0.93em]", done && "text-muted")}>{habit.name}</div>
        <div className="flex items-center gap-2 text-[0.75em] text-faint">
          {multi && (
            <span className={cn(done && "text-success")}>
              {count}/{habit.target} {habit.unit}
            </span>
          )}
          {st > 0 && (
            <span className="inline-flex items-center gap-0.5 text-warning">
              <Flame size={11} /> {st}
            </span>
          )}
        </div>
        {multi && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3/70">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, (count / habit.target) * 100)}%`, background: habit.color }} />
          </div>
        )}
      </div>
      {multi && (
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => increment(habit.id, key, -1)} disabled={count === 0}>
            <Minus size={13} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => increment(habit.id, key, 1)}>
            <Plus size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
