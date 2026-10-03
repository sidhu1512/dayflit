import { useEffect, useRef, useState } from "react";
import { Check, Link2, Plus, Play, Trash2, X } from "lucide-react";
import type { Priority, Recurrence, Task } from "@/lib/types";
import { useTasks } from "@/stores/tasks";
import { useUi } from "@/stores/ui";
import { useSettings } from "@/stores/settings";
import { useFocus } from "@/stores/focus";
import { parseDue, toDueString } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { extractLinks } from "@/lib/nlp";
import { LinkCard } from "./LinkCard";
import { cn } from "@/lib/ids";
import * as chrono from "chrono-node";

const PRIORITIES: Priority[] = ["none", "low", "medium", "high", "urgent"];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function TaskEditor({ taskId }: { taskId: string }) {
  const task = useTasks((s) => s.tasks.find((t) => t.id === taskId));
  const update = useTasks((s) => s.update);
  const remove = useTasks((s) => s.remove);
  const addSubtask = useTasks((s) => s.addSubtask);
  const toggleSubtask = useTasks((s) => s.toggleSubtask);
  const removeSubtask = useTasks((s) => s.removeSubtask);
  const close = () => useUi.getState().setEditingTask(null);
  const lists = useSettings((s) => s.settings.tasks.lists);
  const startForTask = useFocus((s) => s.startForTask);
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [dueText, setDueText] = useState("");
  const [sub, setSub] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
  }, [task?.id]);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (!task) return null;
  const t: Task = task;
  const commitTitle = () => title.trim() && title !== t.title && update(t.id, { title: title.trim() });
  const commitNotes = () => notes !== t.notes && update(t.id, { notes, links: [...new Set([...t.links, ...extractLinks(notes)])] });
  const dueDate = parseDue(t.due);

  const setDue = (d: Date | null, hasTime?: boolean) => {
    if (!d) return update(t.id, { due: null, hasTime: false });
    const ht = hasTime ?? t.hasTime;
    update(t.id, { due: toDueString(d, ht), hasTime: ht, backlog: false });
  };
  const applyDueText = () => {
    if (!dueText.trim()) return;
    const r = chrono.casual.parse(dueText, new Date(), { forwardDate: true })[0];
    if (r) {
      const d = r.start.date();
      const ht = r.start.isCertain("hour");
      if (!ht) d.setHours(0, 0, 0, 0);
      setDue(d, ht);
      setDueText("");
    }
  };
  const quick = (label: string, fn: () => Date | null) => (
    <button key={label} className="btn btn-sm" onClick={() => setDue(fn(), fn() ? t.hasTime : false)}>
      {label}
    </button>
  );
  const rec = t.recurrence;
  const setRec = (r: Recurrence | null) => update(t.id, { recurrence: r });
  const links = [...new Set([...t.links, ...extractLinks(t.notes)])];

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm anim-fade">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="section-title">Edit task</span>
        <div className="flex-1" />
        <button className="btn btn-sm" onClick={() => { close(); void startForTask(t.id); }} aria-label="Start a focus session on this task" data-tip="Start a focus session on this task">
          <Play size={13} /> Focus
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { commitTitle(); commitNotes(); close(); }} aria-label="Done (Esc)" data-tip="Done (Esc)">
          <X size={16} />
        </button>
      </div>
      <div className="scroll flex-1 px-4 pb-4 pt-2">
        <div className="flex items-start gap-2">
          <button className="checkbox mt-2" data-checked={t.status === "done"} data-priority={t.priority} onClick={() => useTasks.getState().toggle(t.id)}>
            {t.status === "done" && <Check size={12} strokeWidth={3} />}
          </button>
          <input ref={titleRef} className="input !bg-transparent !border-transparent !px-1 text-[1.15em] font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </div>

        <textarea className="input mt-2 min-h-[80px]" placeholder="Notes, links, details… (Markdown)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commitNotes} rows={3} />
        {links.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {links.slice(0, 4).map((l) => (
              <LinkCard key={l} url={l} compact />
            ))}
          </div>
        )}

        <Section title="When">
          <div className="flex flex-wrap items-center gap-1.5">
            {quick("Today", () => new Date())}
            {quick("Tomorrow", () => new Date(Date.now() + 86_400_000))}
            {quick("Next week", () => {
              const d = new Date();
              d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
              return d;
            })}
            {quick("No date", () => null)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input type="date" className="input flex-1" value={dueDate ? toDueString(dueDate, false) : ""} onChange={(e) => (e.target.value ? setDue(parseDue(e.target.value)!) : setDue(null))} />
            <input
              type="time"
              className="input w-[118px]"
              value={t.hasTime && dueDate ? `${String(dueDate.getHours()).padStart(2, "0")}:${String(dueDate.getMinutes()).padStart(2, "0")}` : ""}
              onChange={(e) => {
                const base = dueDate ?? new Date();
                if (!e.target.value) return setDue(base, false);
                const [h, m] = e.target.value.split(":").map(Number);
                const d = new Date(base);
                d.setHours(h, m, 0, 0);
                setDue(d, true);
              }}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1" placeholder="…or type: “next friday 4pm”, “in 3 days”" value={dueText} onChange={(e) => setDueText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyDueText()} />
            {dueText && (
              <button className="btn btn-sm" onClick={applyDueText}>
                Set
              </button>
            )}
          </div>
        </Section>

        <Section title="Repeat">
          <div className="flex flex-wrap gap-1.5">
            {[
              ["Off", null],
              ["Daily", { freq: "daily", interval: 1, mode: "schedule" }],
              ["Weekdays", { freq: "weekdays", interval: 1, mode: "schedule" }],
              ["Weekly", { freq: "weekly", interval: 1, mode: "schedule", byWeekday: [(dueDate ?? new Date()).getDay()] }],
              ["Monthly", { freq: "monthly", interval: 1, mode: "schedule", byMonthDay: (dueDate ?? new Date()).getDate() }],
              ["Yearly", { freq: "yearly", interval: 1, mode: "schedule" }],
            ].map(([label, r]) => (
              <button key={label as string} className={cn("btn btn-sm", (r === null ? !rec : rec?.freq === (r as Recurrence).freq) && "btn-primary")} onClick={() => setRec(r as Recurrence | null)}>
                {label as string}
              </button>
            ))}
          </div>
          {rec && (
            <div className="mt-2 flex flex-col gap-2 text-[0.88em]">
              {rec.freq === "weekly" && (
                <div className="flex gap-1">
                  {DAYS.map((d, i) => {
                    const on = rec.byWeekday?.includes(i);
                    return (
                      <button key={i} className={cn("h-7 w-7 rounded-full text-[0.85em] font-medium", on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")} onClick={() => {
                        const set = new Set(rec.byWeekday ?? []);
                        set.has(i) ? set.delete(i) : set.add(i);
                        setRec({ ...rec, byWeekday: [...set].sort() });
                      }}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted">Every</span>
                <input type="number" min={1} max={365} className="input w-16" value={rec.interval} onChange={(e) => setRec({ ...rec, interval: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                <span className="text-muted">{rec.freq === "daily" ? "day(s)" : rec.freq === "weekly" || rec.freq === "weekdays" ? "week(s)" : rec.freq === "monthly" ? "month(s)" : "year(s)"}</span>
                <div className="flex-1" />
                <select className="input w-auto" value={rec.mode} onChange={(e) => setRec({ ...rec, mode: e.target.value as Recurrence["mode"] })}>
                  <option value="schedule">from due date</option>
                  <option value="completion">after completion</option>
                </select>
              </div>
              <div className="text-faint">{describeRecurrence(rec)}{t.completions ? ` · completed ${t.completions}×` : ""}</div>
            </div>
          )}
        </Section>

        <Section title="Priority & list">
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <button key={p} className={cn("btn btn-sm capitalize", t.priority === p && "btn-primary")} onClick={() => update(t.id, { priority: p })}>
                {p}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <select className="input flex-1" value={t.list} onChange={(e) => update(t.id, { list: e.target.value })}>
              {[...new Set([...lists, t.list])].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <input className="input w-[110px]" type="number" min={0} placeholder="Est. min" value={t.estimateMin ?? ""} onChange={(e) => update(t.id, { estimateMin: e.target.value ? parseInt(e.target.value, 10) : null })} />
          </div>
          <input className="input mt-2" placeholder="Tags, comma separated" defaultValue={t.tags.join(", ")} onBlur={(e) => update(t.id, { tags: e.target.value.split(",").map((x) => x.trim().replace(/^#/, "").toLowerCase()).filter(Boolean) })} />
        </Section>

        <Section title={`Subtasks${t.subtasks.length ? ` · ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : ""}`}>
          <div className="flex flex-col gap-1">
            {t.subtasks.map((s) => (
              <div key={s.id} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-surface-2/60">
                <button className="checkbox !h-4 !w-4 !rounded-[5px]" data-checked={s.done} onClick={() => toggleSubtask(t.id, s.id)}>
                  {s.done && <Check size={10} strokeWidth={3} />}
                </button>
                <span className={cn("flex-1 text-[0.9em]", s.done && "text-faint line-through")}>{s.title}</span>
                <button className="btn btn-ghost btn-icon btn-sm opacity-0 group-hover:opacity-100" onClick={() => removeSubtask(t.id, s.id)}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Plus size={14} className="text-faint" />
              <input className="input !bg-transparent !border-transparent !px-1 text-[0.9em]" placeholder="Add subtask" value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && sub.trim()) {
                  addSubtask(t.id, sub);
                  setSub("");
                }
              }} />
            </div>
          </div>
        </Section>

        {t.source && (
          <Section title="Captured from">
            <div className="flex items-center gap-2 text-[0.85em] text-muted">
              <Link2 size={13} /> {t.source.app}
              {t.source.title && <span className="truncate text-faint">· {t.source.title}</span>}
            </div>
          </Section>
        )}

        <div className="mt-5 flex items-center justify-between text-[0.78em] text-faint">
          <span>Created {new Date(t.createdAt).toLocaleDateString()}{t.completedAt ? ` · done ${new Date(t.completedAt).toLocaleDateString()}` : ""}</span>
          <button className="btn btn-ghost btn-sm text-danger" onClick={() => { remove(t.id); close(); }}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="section-title mb-1.5">{title}</div>
      {children}
    </div>
  );
}
