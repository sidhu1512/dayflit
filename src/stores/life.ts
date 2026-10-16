import { create } from "zustand";
import { uid } from "@/lib/ids";
import { dateKey } from "@/lib/dates";
import { loadCollection, scheduleSave } from "@/lib/persist";
import type {
  LifeData,
  LifeDomain,
  LifeGoal,
  LifeProject,
  LifeResource,
  WheelAssessment,
  Task,
  Habit,
} from "@/lib/types";

export const DEFAULT_DOMAINS: LifeDomain[] = [
  {
    id: "health",
    name: "Health & Vitality",
    tagline: "Physical fitness, restorative sleep, and clean energy",
    description: "Your physical foundation — regular exercise, nourishing fuel, quality rest, and emotional well-being.",
    icon: "Activity",
    color: "#10b981",
    score: 8,
    targetScore: 9,
    reflection: "Consistent training cadence. Aiming to hit bed by 10:30 PM consistently.",
    principles: [
      "Prioritize 8 hours of restorative sleep above all else",
      "Daily intentional physical movement (run, lift, or walk 10k steps)",
      "Whole, unprocessed nutrition 90% of the time",
    ],
    resources: [
      {
        id: "res-health-1",
        title: "Sleep Sanctuary Protocol",
        type: "guideline",
        content: "Bedroom at 67°F (19°C), blackout curtains, no blue-light screens 45 minutes before sleep.",
        createdAt: Date.now() - 86400000 * 25,
      },
      {
        id: "res-health-2",
        title: "Outlive: Science of Longevity",
        type: "book",
        content: "Peter Attia's key pillars: Zone 2 cardiovascular base, high VO2 max, strength & grip stability, metabolic resilience.",
        createdAt: Date.now() - 86400000 * 40,
      },
    ],
    order: 0,
    isCustom: false,
    updatedAt: Date.now(),
  },
  {
    id: "career",
    name: "Work & Craft",
    tagline: "Deep focus, purposeful impact, and professional growth",
    description: "Craftsmanship, career momentum, strategic output, and creating meaningful value.",
    icon: "Briefcase",
    color: "#3b82f6",
    score: 8,
    targetScore: 9,
    reflection: "Delivering high-leverage desktop features; keeping focus blocks uninterrupted.",
    principles: [
      "Protect morning focus hours (8:30am - 12:00pm) for high-leverage craft",
      "Compound skills that are scarce and difficult to replicate",
      "Communicate with clarity, speed, and ownership",
    ],
    resources: [
      {
        id: "res-career-1",
        title: "Deep Work Operating Rhythm",
        type: "guideline",
        content: "Zero notifications during deep blocks. Batch email and messages to 11:30 AM and 4:30 PM.",
        createdAt: Date.now() - 86400000 * 30,
      },
    ],
    order: 1,
    isCustom: false,
    updatedAt: Date.now(),
  },
  {
    id: "finance",
    name: "Wealth & Finance",
    tagline: "Financial clarity, smart savings, and long-term peace",
    description: "Building security, automated investments, low debt, and resource independence.",
    icon: "Coins",
    color: "#f59e0b",
    score: 7,
    targetScore: 9,
    reflection: "Savings rate on target; reviewing subscriptions and annual expenses this month.",
    principles: [
      "Pay yourself first via automated index investments on paycheck day",
      "Maintain a 6-month liquid cash runway for absolute peace of mind",
      "Spend lavishly on what delivers immense value; cut ruthlessly on what doesn't",
    ],
    resources: [
      {
        id: "res-fin-1",
        title: "The Psychology of Money",
        type: "book",
        content: "Morgan Housel: Wealth is the options not yet exercised. True wealth is controlling your time.",
        createdAt: Date.now() - 86400000 * 50,
      },
    ],
    order: 2,
    isCustom: false,
    updatedAt: Date.now(),
  },
  {
    id: "growth",
    name: "Personal Growth",
    tagline: "Intellectual curiosity, deep reading, and wisdom",
    description: "Reading non-fiction, mastering hard skills, reflective journaling, and expanded perspective.",
    icon: "GraduationCap",
    color: "#8b5cf6",
    score: 8,
    targetScore: 9,
    reflection: "Completed 18 books this year; journaling regularly every morning.",
    principles: [
      "Read 25+ pages every evening instead of mindless social feeds",
      "Write daily journal reflections to crystallize mental clarity",
      "Seek feedback and lean into uncomfortable learning zones",
    ],
    resources: [
      {
        id: "res-growth-1",
        title: "Mental Models for Decision Making",
        type: "guideline",
        content: "Inversion (Feynman/Munger), Second-Order Consequences, Regret Minimization Framework.",
        createdAt: Date.now() - 86400000 * 20,
      },
    ],
    order: 3,
    isCustom: false,
    updatedAt: Date.now(),
  },
  {
    id: "relationships",
    name: "Relationships",
    tagline: "Heartfelt presence, family bonds, and true friendships",
    description: "Quality time with family, investing in lifelong friendships, and nurturing community.",
    icon: "Users",
    color: "#f43f5e",
    score: 7,
    targetScore: 9,
    reflection: "Carve out sacred weekend time with family; phone call with old friends every Sunday.",
    principles: [
      "Be 100% present: phones face down or in another room during meals",
      "Reach out to an old or distant friend every Sunday",
      "Praise specifically, openly, and sincerely",
    ],
    resources: [
      {
        id: "res-rel-1",
        title: "Sacred Family Rituals",
        type: "guideline",
        content: "Sunday device-free brunch, Friday evening walk, monthly date night.",
        createdAt: Date.now() - 86400000 * 15,
      },
    ],
    order: 4,
    isCustom: false,
    updatedAt: Date.now(),
  },
  {
    id: "mindset",
    name: "Mindset & Lifestyle",
    tagline: "Calm interior, joyful play, and intentional living",
    description: "Hobbies that ignite joy, digital minimalism, mindful presence, and home sanctuary.",
    icon: "Sparkles",
    color: "#06b6d4",
    score: 8,
    targetScore: 9,
    reflection: "Weekend walks without phone; gratitude reflection at the end of each work session.",
    principles: [
      "Control internal reactions, accept external reality with composure",
      "Daily 10-minute breathwork or outdoor silence before screens",
      "Cultivate play and curiosity without optimization pressure",
    ],
    resources: [
      {
        id: "res-mind-1",
        title: "Box Breathing & Stress Reset",
        type: "guideline",
        content: "Inhale 4s, hold 4s, exhale 4s, hold 4s. 5 cycles immediately calms the autonomic nervous system.",
        createdAt: Date.now() - 86400000 * 10,
      },
    ],
    order: 5,
    isCustom: false,
    updatedAt: Date.now(),
  },
];

export const DEFAULT_GOALS: LifeGoal[] = [
  {
    id: "goal-health-1",
    domainId: "health",
    title: "Run a comfortable 5K in under 26 minutes",
    description: "Interval sprints on Tuesdays, long tempo run on Saturdays.",
    status: "in_progress",
    timeframe: "quarterly",
    progress: 70,
    metric: "3 runs / week",
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now(),
  },
  {
    id: "goal-career-1",
    domainId: "career",
    title: "Deliver DayFlit with world-class desktop ergonomics",
    description: "Polish floating trays, offline-first sync, and smooth tactile microinteractions.",
    status: "in_progress",
    timeframe: "quarterly",
    progress: 85,
    metric: "100% test pass & zero regression",
    createdAt: Date.now() - 86400000 * 20,
    updatedAt: Date.now(),
  },
  {
    id: "goal-finance-1",
    domainId: "finance",
    title: "Build 6-month liquid emergency runway",
    description: "Auto-transfer 25% of monthly income to high-yield reserve account.",
    status: "in_progress",
    timeframe: "annual",
    progress: 60,
    metric: "6 months saved",
    createdAt: Date.now() - 86400000 * 45,
    updatedAt: Date.now(),
  },
  {
    id: "goal-growth-1",
    domainId: "growth",
    title: "Read 24 transformative books this year",
    description: "30 minutes focused reading before bed instead of screens.",
    status: "in_progress",
    timeframe: "annual",
    progress: 75,
    metric: "18 / 24 books finished",
    createdAt: Date.now() - 86400000 * 90,
    updatedAt: Date.now(),
  },
  {
    id: "goal-rel-1",
    domainId: "relationships",
    title: "Dedicated device-free Sunday dinners",
    description: "Deep conversations, home-cooked meals, zero phone distraction.",
    status: "in_progress",
    timeframe: "quarterly",
    progress: 80,
    metric: "Every Sunday",
    createdAt: Date.now() - 86400000 * 15,
    updatedAt: Date.now(),
  },
  {
    id: "goal-mindset-1",
    domainId: "mindset",
    title: "Daily 10-minute breathwork & morning calm",
    description: "Ground yourself before opening communications or laptop.",
    status: "in_progress",
    timeframe: "quarterly",
    progress: 65,
    metric: "Daily habit",
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now(),
  },
];

export const DEFAULT_PROJECTS: LifeProject[] = [
  {
    id: "proj-health-1",
    domainId: "health",
    goalId: "goal-health-1",
    title: "Spring Half-Marathon Prep",
    description: "Training block with weekly mileage ramp-up and hydration tracking.",
    status: "active",
    tags: ["running", "fitness", "cardio"],
    coverColor: "#10b981",
    createdAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now(),
  },
  {
    id: "proj-career-1",
    domainId: "career",
    goalId: "goal-career-1",
    title: "Visual Life Library & Wheel of Life",
    description: "Complete autonomous implementation of life vision, wheel assessments, and life map.",
    status: "active",
    tags: ["architecture", "ui", "dayflit"],
    coverColor: "#3b82f6",
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now(),
  },
  {
    id: "proj-finance-1",
    domainId: "finance",
    goalId: "goal-finance-1",
    title: "Quarterly Investment Review",
    description: "Rebalance index funds and review automated tax-advantaged contributions.",
    status: "active",
    tags: ["wealth", "investing"],
    coverColor: "#f59e0b",
    createdAt: Date.now() - 86400000 * 8,
    updatedAt: Date.now(),
  },
];

export function defaultLifeData(): LifeData {
  const initialScores: Record<string, number> = {};
  DEFAULT_DOMAINS.forEach((d) => {
    initialScores[d.id] = d.score;
  });
  const avg = calculateAverageScore(initialScores);
  const balance = calculateBalanceIndex(initialScores);

  return {
    domains: DEFAULT_DOMAINS,
    goals: DEFAULT_GOALS,
    projects: DEFAULT_PROJECTS,
    assessments: [
      {
        id: uid(),
        date: dateKey(new Date(Date.now() - 86400000 * 14)),
        scores: { ...initialScores, finance: 6, health: 7 },
        overallScore: 7.2,
        balanceIndex: 7.1,
        reflectionNotes: "Baseline assessment. Energy is solid; room to improve bedtime consistency.",
        createdAt: Date.now() - 86400000 * 14,
      },
      {
        id: uid(),
        date: dateKey(),
        scores: initialScores,
        overallScore: avg,
        balanceIndex: balance.score,
        reflectionNotes: "Strong progress across health and personal craft.",
        createdAt: Date.now(),
      },
    ],
    version: 1,
  };
}

export function calculateAverageScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (!values.length) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function calculateBalanceIndex(scores: Record<string, number>): { score: number; label: string; variance: number } {
  const values = Object.values(scores);
  if (!values.length) return { score: 0, label: "Unassessed", variance: 0 };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
  const standardDev = Math.sqrt(variance);

  // Balance score considers both high average and low variance (symmetry)
  // Max score 10: 10 avg with 0 stdDev
  const balanceRatio = Math.max(0, 1 - standardDev / 5);
  const score = Math.round(((avg * 0.7) + (balanceRatio * 10 * 0.3)) * 10) / 10;

  let label = "Emerging Harmony";
  if (standardDev >= 2.2) {
    label = avg >= 7 ? "Asymmetrical Focus" : "Needs Focus & Care";
  } else if (avg >= 8.5 && standardDev < 1.2) {
    label = "Optimal Equilibrium";
  } else if (avg >= 7.5 && standardDev < 1.8) {
    label = "Thriving & Balanced";
  } else if (avg >= 6 && standardDev < 2.0) {
    label = "Steady Foundation";
  } else {
    label = "Needs Focus & Care";
  }

  return { score, label, variance: Math.round(variance * 100) / 100 };
}

/**
 * Calculates per-domain delta (+1, -1, 0) between current scores and a baseline.
 */
export function calculateDomainDeltas(
  current: Record<string, number>,
  baseline?: Record<string, number>,
): Record<string, number> {
  const deltas: Record<string, number> = {};
  if (!baseline) return deltas;
  for (const [id, score] of Object.entries(current)) {
    if (typeof baseline[id] === "number") {
      deltas[id] = score - baseline[id];
    }
  }
  return deltas;
}

/**
 * Diagnostic analysis across life domains: detects unanchored tasks, stagnant goals, and workload distribution.
 */
export function getLifeAlignmentStats(
  tasks: Task[],
  habits: Habit[],
  domains: LifeDomain[],
  goals: LifeGoal[],
  projects: LifeProject[],
) {
  const openTasks = tasks.filter((t) => t.status === "open");

  const validDomainIds = new Set(domains.map((d) => d.id));
  const validGoalIds = new Set(goals.map((g) => g.id));
  const validProjectIds = new Set(projects.map((p) => p.id));

  // A task is only anchored if it points to a STILL VALID domain, goal, or project
  const isTaskAnchored = (t: Task) =>
    Boolean(
      (t.domainId && validDomainIds.has(t.domainId)) ||
      (t.goalId && validGoalIds.has(t.goalId)) ||
      (t.projectId && validProjectIds.has(t.projectId))
    );

  const unanchoredTasks = openTasks.filter((t) => !isTaskAnchored(t));
  const anchoredTasks = openTasks.filter((t) => isTaskAnchored(t));

  const alignmentRatio = openTasks.length > 0 ? Math.round((anchoredTasks.length / openTasks.length) * 100) : 100;

  // Stagnant goals: active goals with 0 active projects AND 0 linked habits AND 0 open tasks
  const stagnantGoals = goals.filter((g) => {
    if (g.status === "achieved") return false;
    const hasProjects = projects.some((p) => p.goalId === g.id && p.status === "active");
    const hasHabits = habits.some((h) => h.goalId === g.id && !h.archived);
    const hasTasks = openTasks.some((t) => t.goalId === g.id);
    return !hasProjects && !hasHabits && !hasTasks;
  });

  // Domain workload: distribution of open tasks per domain (including tasks whose goal/project belongs to this domain)
  const domainTaskCounts: Record<string, number> = {};
  domains.forEach((d) => {
    domainTaskCounts[d.id] = openTasks.filter((t) => {
      if (t.domainId === d.id) return true;
      if (t.goalId) {
        const g = goals.find((x) => x.id === t.goalId);
        if (g?.domainId === d.id) return true;
      }
      if (t.projectId) {
        const p = projects.find((x) => x.id === t.projectId);
        if (p?.domainId === d.id) return true;
      }
      return false;
    }).length;
  });

  return {
    openTasksCount: openTasks.length,
    anchoredTasksCount: anchoredTasks.length,
    unanchoredTasksCount: unanchoredTasks.length,
    unanchoredTasks,
    alignmentRatio,
    stagnantGoals,
    domainTaskCounts,
  };
}

interface LifeState {
  data: LifeData;
  loaded: boolean;
  activeDomainId: string | null;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  setActiveDomain: (id: string | null) => void;
  addDomain: (domain: Omit<LifeDomain, "id" | "updatedAt">) => LifeDomain;
  updateDomain: (id: string, patch: Partial<LifeDomain>) => void;
  removeDomain: (id: string) => void;
  setDomainScore: (id: string, score: number) => void;
  addGoal: (goal: Omit<LifeGoal, "id" | "createdAt" | "updatedAt">) => LifeGoal;
  updateGoal: (id: string, patch: Partial<LifeGoal>) => void;
  removeGoal: (id: string) => void;
  addProject: (project: Omit<LifeProject, "id" | "createdAt" | "updatedAt">) => LifeProject;
  updateProject: (id: string, patch: Partial<LifeProject>) => void;
  removeProject: (id: string) => void;
  addResource: (domainId: string, resource: Omit<LifeResource, "id" | "createdAt">) => LifeResource;
  updateResource: (domainId: string, resourceId: string, patch: Partial<LifeResource>) => void;
  removeResource: (domainId: string, resourceId: string) => void;
  addPrinciple: (domainId: string, principle: string) => void;
  removePrinciple: (domainId: string, index: number) => void;
  saveAssessment: (notes?: string) => WheelAssessment;
  removeAssessment: (id: string) => void;
  resetToDefaults: () => void;
}

function normalizeLifeData(raw: unknown): LifeData {
  if (!raw || typeof raw !== "object") return defaultLifeData();
  const d = raw as Partial<LifeData>;
  const defaults = defaultLifeData();

  const domains = Array.isArray(d.domains) && d.domains.length > 0
    ? d.domains.map((dom, idx) => {
        const foundDef = defaults.domains.find((x) => x.id === dom.id);
        return {
          principles: foundDef?.principles || [],
          resources: foundDef?.resources || [],
          order: idx,
          isCustom: dom.isCustom ?? !foundDef,
          ...foundDef,
          ...dom,
          score: typeof dom.score === "number" ? Math.max(1, Math.min(10, dom.score)) : (foundDef?.score ?? 7),
          targetScore: typeof dom.targetScore === "number" ? Math.max(1, Math.min(10, dom.targetScore)) : 10,
        } as LifeDomain;
      })
    : defaults.domains;

  const goals = Array.isArray(d.goals) ? d.goals : defaults.goals;
  const projects = Array.isArray(d.projects) ? d.projects : defaults.projects;
  const assessments = Array.isArray(d.assessments) ? d.assessments : defaults.assessments;

  return {
    domains,
    goals,
    projects,
    assessments,
    version: 1,
  };
}

export const useLife = create<LifeState>((set, get) => {
  const persist = (data: LifeData) => {
    set({ data });
    scheduleSave("life", data);
  };

  return {
    data: defaultLifeData(),
    loaded: false,
    activeDomainId: null,

    load: async () => {
      try {
        const res = await loadCollection<LifeData | null>("life", null);
        const data = normalizeLifeData(res.data);
        set({ data, loaded: true });
      } catch {
        set({ data: defaultLifeData(), loaded: true });
      }
    },

    reload: async () => {
      try {
        const res = await loadCollection<LifeData | null>("life", null);
        const data = normalizeLifeData(res.data);
        set({ data });
      } catch {
        /* ignore */
      }
    },

    setActiveDomain: (id) => set({ activeDomainId: id }),

    addDomain: (input) => {
      const cur = get().data;
      const domain: LifeDomain = {
        ...input,
        id: uid(),
        score: Math.max(1, Math.min(10, input.score || 7)),
        targetScore: Math.max(1, Math.min(10, input.targetScore || 10)),
        principles: input.principles || [],
        resources: input.resources || [],
        order: cur.domains.length,
        isCustom: true,
        updatedAt: Date.now(),
      };
      persist({ ...cur, domains: [...cur.domains, domain] });
      return domain;
    },

    updateDomain: (id, patch) => {
      const cur = get().data;
      const domains = cur.domains.map((d) =>
        d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d,
      );
      persist({ ...cur, domains });
    },

    removeDomain: (id) => {
      const cur = get().data;
      if (cur.domains.length <= 1) return;
      // Safeguard: only remove if domain exists
      persist({
        ...cur,
        domains: cur.domains.filter((d) => d.id !== id),
        goals: cur.goals.filter((g) => g.domainId !== id),
        projects: cur.projects.filter((p) => p.domainId !== id),
      });
      if (get().activeDomainId === id) {
        set({ activeDomainId: null });
      }
    },

    setDomainScore: (id, score) => {
      const cleanScore = Math.max(1, Math.min(10, Math.round(score)));
      get().updateDomain(id, { score: cleanScore });
    },

    addGoal: (input) => {
      const cur = get().data;
      const goal: LifeGoal = {
        ...input,
        id: uid(),
        progress: Math.max(0, Math.min(100, input.progress || 0)),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      persist({ ...cur, goals: [goal, ...cur.goals] });
      return goal;
    },

    updateGoal: (id, patch) => {
      const cur = get().data;
      const goals = cur.goals.map((g) =>
        g.id === id ? { ...g, ...patch, updatedAt: Date.now() } : g,
      );
      persist({ ...cur, goals });
    },

    removeGoal: (id) => {
      const cur = get().data;
      persist({
        ...cur,
        goals: cur.goals.filter((g) => g.id !== id),
        projects: cur.projects.map((p) => (p.goalId === id ? { ...p, goalId: undefined } : p)),
      });
    },

    addProject: (input) => {
      const cur = get().data;
      const project: LifeProject = {
        ...input,
        id: uid(),
        tags: input.tags || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      persist({ ...cur, projects: [project, ...cur.projects] });
      return project;
    },

    updateProject: (id, patch) => {
      const cur = get().data;
      const projects = cur.projects.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
      );
      persist({ ...cur, projects });
    },

    removeProject: (id) => {
      const cur = get().data;
      persist({ ...cur, projects: cur.projects.filter((p) => p.id !== id) });
    },

    addResource: (domainId, input) => {
      const cur = get().data;
      const resource: LifeResource = {
        ...input,
        id: uid(),
        createdAt: Date.now(),
      };
      const domains = cur.domains.map((d) => {
        if (d.id !== domainId) return d;
        return {
          ...d,
          resources: [resource, ...(d.resources || [])],
          updatedAt: Date.now(),
        };
      });
      persist({ ...cur, domains });
      return resource;
    },

    updateResource: (domainId, resourceId, patch) => {
      const cur = get().data;
      const domains = cur.domains.map((d) => {
        if (d.id !== domainId) return d;
        const resources = (d.resources || []).map((r) =>
          r.id === resourceId ? { ...r, ...patch } : r,
        );
        return { ...d, resources, updatedAt: Date.now() };
      });
      persist({ ...cur, domains });
    },

    removeResource: (domainId, resourceId) => {
      const cur = get().data;
      const domains = cur.domains.map((d) => {
        if (d.id !== domainId) return d;
        return {
          ...d,
          resources: (d.resources || []).filter((r) => r.id !== resourceId),
          updatedAt: Date.now(),
        };
      });
      persist({ ...cur, domains });
    },

    addPrinciple: (domainId, principle) => {
      if (!principle.trim()) return;
      const cur = get().data;
      const domains = cur.domains.map((d) => {
        if (d.id !== domainId) return d;
        return {
          ...d,
          principles: [...(d.principles || []), principle.trim()],
          updatedAt: Date.now(),
        };
      });
      persist({ ...cur, domains });
    },

    removePrinciple: (domainId, index) => {
      const cur = get().data;
      const domains = cur.domains.map((d) => {
        if (d.id !== domainId) return d;
        const principles = [...(d.principles || [])];
        principles.splice(index, 1);
        return { ...d, principles, updatedAt: Date.now() };
      });
      persist({ ...cur, domains });
    },

    saveAssessment: (notes) => {
      const cur = get().data;
      const scores: Record<string, number> = {};
      cur.domains.forEach((d) => {
        scores[d.id] = d.score;
      });
      const avg = calculateAverageScore(scores);
      const balance = calculateBalanceIndex(scores);

      const assessment: WheelAssessment = {
        id: uid(),
        date: dateKey(),
        scores,
        overallScore: avg,
        balanceIndex: balance.score,
        reflectionNotes: notes?.trim() || undefined,
        createdAt: Date.now(),
      };

      persist({
        ...cur,
        assessments: [assessment, ...cur.assessments],
      });
      return assessment;
    },

    removeAssessment: (id) => {
      const cur = get().data;
      persist({
        ...cur,
        assessments: cur.assessments.filter((a) => a.id !== id),
      });
    },

    resetToDefaults: () => {
      const d = defaultLifeData();
      persist(d);
    },
  };
});
