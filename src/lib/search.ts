import Fuse from "fuse.js";
import type { Clip, Habit, Note, Task } from "./types";
import { plainText } from "./markdown";

export interface SearchHit {
  type: "task" | "note" | "habit" | "clip";
  id: string;
  title: string;
  subtitle: string;
  score: number;
  tags: string[];
  done?: boolean;
}

interface Doc {
  type: SearchHit["type"];
  id: string;
  title: string;
  body: string;
  tags: string[];
  done?: boolean;
  subtitle: string;
}

export function buildIndex(tasks: Task[], notes: Note[], habits: Habit[], clips: Clip[]) {
  const docs: Doc[] = [
    ...tasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, body: t.notes, tags: t.tags, done: t.status === "done", subtitle: t.list })),
    ...notes.filter((n) => !n.archived).map((n) => ({ type: "note" as const, id: n.id, title: n.title || plainText(n.body).slice(0, 60), body: plainText(n.body).slice(0, 4000), tags: n.tags, subtitle: "Note" })),
    ...habits.filter((h) => !h.archived).map((h) => ({ type: "habit" as const, id: h.id, title: h.name, body: h.notes, tags: [], subtitle: "Habit" })),
    ...clips.map((c) => ({ type: "clip" as const, id: c.id, title: c.text.slice(0, 80) || (c.kind === "image" ? "Image" : ""), body: c.text.slice(0, 2000), tags: [], subtitle: c.source.app })),
  ];
  const fuse = new Fuse(docs, {
    keys: [
      { name: "title", weight: 0.6 },
      { name: "body", weight: 0.25 },
      { name: "tags", weight: 0.15 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });
  return {
    search(q: string, limit = 30): SearchHit[] {
      const query = q.trim();
      if (!query) return [];
      // tag query
      if (query.startsWith("#")) {
        const tag = query.slice(1).toLowerCase();
        return docs
          .filter((d) => d.tags.some((t) => t.startsWith(tag)))
          .slice(0, limit)
          .map((d) => ({ type: d.type, id: d.id, title: d.title, subtitle: d.subtitle, score: 0, tags: d.tags, done: d.done }));
      }
      return fuse.search(query, { limit }).map((r) => ({ type: r.item.type, id: r.item.id, title: r.item.title, subtitle: r.item.subtitle, score: r.score ?? 1, tags: r.item.tags, done: r.item.done }));
    },
    size: docs.length,
  };
}
