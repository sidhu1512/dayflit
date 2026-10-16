import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Check, Flame, Plus, Repeat, Trash2, X } from "lucide-react";
import { useHabits, HABIT_COLORS, HABIT_ICONS, streak, completionRate, describeSchedule, isDoneOn, isScheduledOn, habitsForDay } from "@/stores/habits";
import { useLife } from "@/stores/life";
import { useUi } from "@/stores/ui";
import { HabitRow } from "@/components/HabitRow";
import { Empty } from "@/components/Empty";
import { dateKey } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { HabitIcon } from "@/components/icons";
import { HabitHeatmap } from "@/components/HabitHeatmap";
import type { Habit, HabitSchedule } from "@/lib/types";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function HabitsView() {
  const habits = useHabits((s) => s.habits);
  const viewParam = useUi((s) => s.viewParam);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [historyMode, setHistoryMode] = useState<"heatmaps" | "table">("heatmaps");
  const today = new Date();
  const active = useMemo(() => habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order), [habits]);
  const todays = habitsForDay(active, today);
  const doneToday = todays.filter((h) => isDoneOn(h, dateKey(today))).length;
  const last14 = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)), []);

  useEffect(() => {
    if (viewParam && habits.some((h) => h.id === viewParam)) {
      setEditing(viewParam);
      useUi.getState().navigate("habits", null);
    }
  }, [viewParam, habits]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-1">
        <div className="flex-1">
          <div className="text-[1.05em] font-semibold">Habits</div>
          <div className="text-[0.78em] text-muted">{todays.length ? `${doneToday}/${todays.length} done today` : "Small things, every day"}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
          <Plus size={14} /> New habit
        </button>
      </div>
      <div className="scroll flex-1 px-2.5 pb-3 pt-2">
        {active.length === 0 ? (
          <Empty icon={<Repeat size={28} />} title="No habits yet" body="Track anything you want to do regularly: water, reading, stretching…" action={<button className="btn btn-sm" onClick={() => setEditing("new")}>Create one</button>} />
        ) : (
          <>
            <div className="section-title px-2 pb-1">Today</div>
            {todays.map((h) => (
              <HabitRow key={h.id} habit={h} onOpen={() => setEditing(h.id)} />
            ))}
            {active.filter((h) => !isScheduledOn(h, today)).length > 0 && (
              <>
                <div className="section-title px-2 pb-1 pt-3">Not today</div>
                {active.filter((h) => !isScheduledOn(h, today)).map((h) => (
                  <HabitRow key={h.id} habit={h} dense onOpen={() => setEditing(h.id)} />
                ))}
              </>
            )}
            <div className="flex items-center justify-between px-2 pb-1 pt-4 flex-nowrap min-w-0 gap-2">
              <div className="section-title truncate min-w-0 flex-1">Habit Consistency</div>
              <div className="flex items-center rounded-lg bg-surface-2/70 p-0.5 text-[0.74em] shrink-0">
                <button
                  className={cn("rounded-md px-2 py-0.5 font-medium transition shrink-0 whitespace-nowrap", historyMode === "heatmaps" ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
                  onClick={() => setHistoryMode("heatmaps")}
                >
                  Heatmaps (18w)
                </button>
                <button
                  className={cn("rounded-md px-2 py-0.5 font-medium transition shrink-0 whitespace-nowrap", historyMode === "table" ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
                  onClick={() => setHistoryMode("table")}
                >
                  14-Day Table
                </button>
              </div>
            </div>

            {historyMode === "heatmaps" ? (
              <div className="flex flex-col gap-2.5">
                {active.map((h) => (
                  <div key={h.id} className="card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: h.color }}>
                          <HabitIcon name={h.icon} size={14} color="#ffffff" />
                        </span>
                        <span className="text-[0.88em] font-semibold text-text">{h.name}</span>
                        {h.target > 1 && <span className="text-[0.72em] text-muted">({h.target} {h.unit}/day)</span>}
                      </div>
                      <button className="btn btn-ghost btn-sm text-[0.74em]" onClick={() => setEditing(h.id)}>
                        Configure
                      </button>
                    </div>
                    <HabitHeatmap
                      habit={h}
                      weeks={18}
                      onToggleDate={(k) => useHabits.getState().toggle(h.id, k)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="card overflow-x-auto p-2">
                <table className="w-full border-separate border-spacing-y-1 text-[0.78em]">
                  <thead>
                    <tr>
                      <th className="w-[38%] text-left font-normal text-faint"></th>
                      {last14.map((d) => (
                        <th key={d.toISOString()} className={cn("text-center font-normal text-faint", dateKey(d) === dateKey(today) && "text-accent")}>
                          {format(d, "d")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((h) => (
                      <tr key={h.id}>
                        <td className="truncate pr-2">
                          <span className="mr-1.5 inline-flex align-middle" style={{ color: h.color }}>
                            <HabitIcon name={h.icon} size={12} />
                          </span>
                          {h.name}
                        </td>
                        {last14.map((d) => {
                          const k = dateKey(d);
                          const done = isDoneOn(h, k);
                          const sched = isScheduledOn(h, d);
                          const partial = !done && (h.log[k] ?? 0) > 0;
                          return (
                            <td key={k} className="text-center">
                              <button className={cn("mx-auto block h-4 w-4 rounded-[5px] transition", !sched && !done && "opacity-20")} style={{ background: done ? h.color : partial ? `color-mix(in srgb, ${h.color} 45%, transparent)` : "rgb(var(--surface-3))" }} onClick={() => useHabits.getState().toggle(h.id, k)} aria-label={`${k}${done ? " done" : ""}`} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      {editing && <HabitEditor id={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HabitEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const habit = useHabits((s) => (id ? s.habits.find((h) => h.id === id) : undefined));
  const add = useHabits((s) => s.add);
  const update = useHabits((s) => s.update);
  const remove = useHabits((s) => s.remove);
  const ask = useUi((s) => s.ask);
  const domains = useLife((s) => s.data.domains);
  const goals = useLife((s) => s.data.goals);
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? HABIT_ICONS[Math.floor(Math.random() * HABIT_ICONS.length)]);
  const [color, setColor] = useState(habit?.color ?? HABIT_COLORS[Math.floor(Math.random() * HABIT_COLORS.length)]);
  const [schedule, setSchedule] = useState<HabitSchedule>(habit?.schedule ?? { type: "daily" });
  const [target, setTarget] = useState(habit?.target ?? 1);
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [reminder, setReminder] = useState(habit?.reminderTime ?? "");
  const [domainId, setDomainId] = useState(habit?.domainId ?? "");
  const [goalId, setGoalId] = useState(habit?.goalId ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const save = () => {
    if (!name.trim()) return;
    const patch: Partial<Habit> = {
      name: name.trim(),
      icon,
      color,
      schedule,
      target: Math.max(1, target),
      unit: unit.trim(),
      reminderTime: reminder || null,
      domainId: domainId || null,
      goalId: (domainId && goalId) ? goalId : null,
    };
    if (habit) update(habit.id, patch);
    else add({ name: name.trim(), ...patch });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm anim-fade">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="section-title">{habit ? "Edit habit" : "New habit"}</span>
        <div className="flex-1" />
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="scroll flex-1 px-4 pb-4 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 30%, transparent)`, color }}>
            <HabitIcon name={icon} size={20} />
          </div>
          <input className="input text-[1.05em] font-medium" placeholder="Drink water" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
        <div className="section-title mt-4 mb-1.5">Icon</div>
        <div className="flex flex-wrap gap-1">
          {HABIT_ICONS.map((i) => (
            <button key={i} className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2", icon === i && "bg-accent/20 text-accent ring-1 ring-accent")} onClick={() => setIcon(i)} aria-label={i}>
              <HabitIcon name={i} size={16} />
            </button>
          ))}
        </div>
        <div className="section-title mt-4 mb-1.5">Colour</div>
        <div className="flex flex-wrap gap-1.5">
          {HABIT_COLORS.map((c) => (
            <button key={c} className={cn("h-6 w-6 rounded-full", color === c && "ring-2 ring-text ring-offset-2 ring-offset-bg")} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <div className="section-title mt-4 mb-1.5">Schedule</div>
        <div className="flex gap-1.5">
          {[
            ["Every day", { type: "daily" } as HabitSchedule],
            ["Specific days", { type: "weekdays", days: [1, 2, 3, 4, 5] } as HabitSchedule],
            ["Times per week", { type: "timesPerWeek", times: 3 } as HabitSchedule],
          ].map(([label, s]) => (
            <button key={label as string} className={cn("btn btn-sm flex-1", schedule.type === (s as HabitSchedule).type && "btn-primary")} onClick={() => setSchedule(s as HabitSchedule)}>
              {label as string}
            </button>
          ))}
        </div>
        {schedule.type === "weekdays" && (
          <div className="mt-2 flex gap-1">
            {DAY_LABELS.map((d, i) => (
              <button key={i} className={cn("h-8 w-8 rounded-full text-[0.85em] font-medium", schedule.days.includes(i) ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")} onClick={() => {
                const set = new Set(schedule.days);
                set.has(i) ? set.delete(i) : set.add(i);
                setSchedule({ type: "weekdays", days: [...set].sort() });
              }}>
                {d}
              </button>
            ))}
          </div>
        )}
        {schedule.type === "timesPerWeek" && (
          <div className="mt-2 flex items-center gap-2 text-[0.9em]">
            <input type="number" min={1} max={7} className="input w-16" value={schedule.times} onChange={(e) => setSchedule({ type: "timesPerWeek", times: Math.min(7, Math.max(1, parseInt(e.target.value, 10) || 1)) })} />
            <span className="text-muted">times per week</span>
          </div>
        )}
        <div className="section-title mt-4 mb-1.5">Daily target</div>
        <div className="flex items-center gap-2 text-[0.9em]">
          <input type="number" min={1} max={99} className="input w-16" value={target} onChange={(e) => setTarget(Math.max(1, parseInt(e.target.value, 10) || 1))} />
          <input className="input flex-1" placeholder="unit (glasses, pages, minutes…)" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="section-title mt-4 mb-1.5">Reminder</div>
        <input type="time" className="input w-40" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        <div className="mt-1 text-[0.75em] text-faint">A notification if the habit isn't done by this time.</div>

        <div className="section-title mt-4 mb-1.5">Life Pillar (Optional)</div>
        <select
          className="input w-full text-[0.88em]"
          value={domainId}
          onChange={(e) => {
            setDomainId(e.target.value);
            setGoalId("");
          }}
        >
          <option value="">No Life Pillar linked</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {domainId && goals.filter((g) => g.domainId === domainId).length > 0 && (
          <div className="mt-2">
            <div className="text-[0.78em] text-faint mb-1">Target Goal (Optional)</div>
            <select
              className="input w-full text-[0.85em]"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">No specific goal</option>
              {goals
                .filter((g) => g.domainId === domainId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </div>
        )}
        {habit && (
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[0.85em]">
            <div className="card py-2">
              <div className="flex items-center justify-center gap-1 text-[1.2em] font-semibold text-warning">
                <Flame size={14} /> {streak(habit)}
              </div>
              <div className="text-faint">streak</div>
            </div>
            <div className="card py-2">
              <div className="text-[1.2em] font-semibold">{Math.round(completionRate(habit, 30) * 100)}%</div>
              <div className="text-faint">last 30 days</div>
            </div>
            <div className="card py-2">
              <div className="text-[1.2em] font-semibold">{Object.keys(habit.log).length}</div>
              <div className="text-faint">total days</div>
            </div>
          </div>
        )}
        <div className="mt-5 flex items-center gap-2">
          {habit && (
            <>
              <button className="btn btn-ghost btn-sm text-muted" onClick={() => { update(habit.id, { archived: !habit.archived }); onClose(); }}>
                {habit.archived ? "Unarchive" : "Archive"}
              </button>
              <button className="btn btn-ghost btn-sm text-danger" onClick={async () => { if (await ask({ title: `Delete “${habit.name}”?`, body: "All its history will be removed.", confirmLabel: "Delete", danger: true })) { remove(habit.id); onClose(); } }}>
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
          <div className="flex-1" />
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            <Check size={14} /> {habit ? "Save" : "Create"}
          </button>
        </div>
        {habit && <div className="mt-3 text-[0.75em] text-faint">{describeSchedule(habit.schedule)} · since {format(new Date(habit.createdAt), "d MMM yyyy")}</div>}
      </div>
    </div>
  );
}
