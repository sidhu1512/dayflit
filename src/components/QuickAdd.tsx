import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Flag, Hash, Plus, Repeat, Timer } from "lucide-react";
import { parseQuickAdd } from "@/lib/nlp";
import { formatDue } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { useTasks } from "@/stores/tasks";
import { useSettings } from "@/stores/settings";
import { uiSound } from "@/lib/audio";
import type { Task } from "@/lib/types";

export function QuickAdd({ autoFocus, placeholder = "Add a task…  e.g. “Call Sam tomorrow 3pm #work !high every week”", extra, onAdded, compact }: {
  autoFocus?: boolean;
  placeholder?: string;
  extra?: Partial<Task>;
  onAdded?: (t: Task) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const quickAdd = useTasks((s) => s.quickAdd);
  const lists = useSettings((s) => s.settings.tasks.lists);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, { knownLists: lists }) : null), [text, lists]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const t = quickAdd(text, extra);
    if (t) {
      setText("");
      uiSound("pop", 0.25);
      onAdded?.(t);
    }
  };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 rounded-xl border border-white/0 bg-surface-2/70 px-3 ${compact ? "py-1.5" : "py-2"} transition focus-within:border-accent/50 focus-within:bg-surface-2 focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.15)]`}>
        <Plus size={16} className="shrink-0 text-faint" />
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setText("");
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[0.95em] outline-none placeholder:text-faint"
          spellCheck={false}
          data-quickadd
        />
        {text && (
          <button className="btn btn-primary btn-sm" onClick={submit}>
            Add
          </button>
        )}
      </div>
      {parsed && (parsed.due || parsed.priority !== "none" || parsed.tags.length || parsed.recurrence || parsed.estimateMin || parsed.list || parsed.backlog) && (
        <div className="anim-fade mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
          {parsed.due && (
            <span className="chip chip-accent">
              <CalendarClock size={11} /> {formatDue(parsed.due, parsed.hasTime)}
            </span>
          )}
          {parsed.priority !== "none" && (
            <span className={`chip ${parsed.priority === "urgent" ? "chip-danger" : parsed.priority === "high" ? "chip-warning" : ""}`}>
              <Flag size={11} /> {parsed.priority}
            </span>
          )}
          {parsed.recurrence && (
            <span className="chip">
              <Repeat size={11} /> {describeRecurrence(parsed.recurrence)}
            </span>
          )}
          {parsed.estimateMin && (
            <span className="chip">
              <Timer size={11} /> {parsed.estimateMin}m
            </span>
          )}
          {parsed.list && <span className="chip">@{parsed.list}</span>}
          {parsed.tags.map((t) => (
            <span key={t} className="chip">
              <Hash size={11} />
              {t}
            </span>
          ))}
          {parsed.backlog && <span className="chip">Someday</span>}
        </div>
      )}
    </div>
  );
}
