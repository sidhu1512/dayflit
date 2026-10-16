import { describe, expect, it } from "vitest";
import {
  calculateAverageScore,
  calculateBalanceIndex,
  calculateDomainDeltas,
  getLifeAlignmentStats,
  defaultLifeData,
  DEFAULT_DOMAINS,
  useLife,
} from "@/stores/life";
import { makeTask } from "@/stores/tasks";
import { makeHabit } from "@/stores/habits";
import { makeNote } from "@/stores/notes";
import { makeEntry } from "@/stores/journal";
import type { Task, Habit, LifeGoal, LifeProject } from "@/lib/types";

describe("Wheel of Life scoring & balance algorithm", () => {
  it("calculates accurate average satisfaction scores", () => {
    const scores = {
      health: 8,
      career: 8,
      finance: 7,
      growth: 9,
      relationships: 6,
      mindset: 10,
    };
    // Sum = 48, Count = 6, Avg = 8.0
    expect(calculateAverageScore(scores)).toBe(8);
  });

  it("handles empty scores map safely", () => {
    expect(calculateAverageScore({})).toBe(0);
  });

  it("evaluates optimal equilibrium when all pillars are high and balanced", () => {
    const scores = {
      health: 9,
      career: 9,
      finance: 9,
      growth: 9,
      relationships: 9,
      mindset: 9,
    };
    const res = calculateBalanceIndex(scores);
    expect(res.variance).toBe(0);
    expect(res.score).toBeGreaterThanOrEqual(9);
    expect(res.label).toBe("Optimal Equilibrium");
  });

  it("flags imbalance when variance between domains is high", () => {
    const skewedScores = {
      health: 10,
      career: 10,
      finance: 2,
      growth: 10,
      relationships: 2,
      mindset: 2,
    };
    const res = calculateBalanceIndex(skewedScores);
    expect(res.variance).toBeGreaterThan(10);
    // Skewed scores lower the balance index score despite high career/growth
    expect(res.score).toBeLessThan(7);
  });

  it("labels high-variance scores with good average as Asymmetrical Focus", () => {
    // 5 pillars at 10, 1 pillar at 3 -> Average = 8.83, stdDev ≈ 2.61 (>= 2.2)
    const asymmetricScores = {
      health: 10,
      career: 10,
      finance: 10,
      growth: 10,
      relationships: 10,
      mindset: 3,
    };
    const res = calculateBalanceIndex(asymmetricScores);
    expect(res.label).toBe("Asymmetrical Focus");
  });

  it("labels high-variance scores with mediocre average as Needs Focus & Care", () => {
    // 3 pillars at 8, 3 pillars at 2 -> Average = 5.0, stdDev = 3.0 (>= 2.2)
    const unevenScores = {
      health: 8,
      career: 8,
      finance: 8,
      growth: 2,
      relationships: 2,
      mindset: 2,
    };
    const res = calculateBalanceIndex(unevenScores);
    expect(res.label).toBe("Needs Focus & Care");
  });
});

describe("Historical snapshot deltas calculation", () => {
  it("calculates positive, negative, and zero score deltas against baseline", () => {
    const current = { health: 9, career: 8, finance: 7, mindset: 6 };
    const baseline = { health: 7, career: 8, finance: 9, mindset: 6 };
    const deltas = calculateDomainDeltas(current, baseline);

    expect(deltas.health).toBe(2);
    expect(deltas.career).toBe(0);
    expect(deltas.finance).toBe(-2);
    expect(deltas.mindset).toBe(0);
  });

  it("returns empty object when baseline is undefined or empty", () => {
    const current = { health: 8, career: 7 };
    expect(calculateDomainDeltas(current, undefined)).toEqual({});
    expect(calculateDomainDeltas(current, {})).toEqual({});
  });
});

describe("Alignment Health Diagnostics (getLifeAlignmentStats)", () => {
  const dummyDomains = DEFAULT_DOMAINS.slice(0, 3);
  const d1 = dummyDomains[0].id;
  const d2 = dummyDomains[1].id;

  it("calculates alignment ratio and unanchored tasks correctly", () => {
    const openTasks: Task[] = [
      makeTask({ title: "Workout", domainId: d1, status: "open" }),
      makeTask({ title: "Build feature", goalId: "goal-1", status: "open" }),
      makeTask({ title: "Ship project", projectId: "proj-1", status: "open" }),
      makeTask({ title: "Unanchored chore", status: "open" }),
      makeTask({ title: "Done unanchored", status: "done" }),
    ];

    const dummyGoals: LifeGoal[] = [
      {
        id: "goal-1",
        domainId: d1,
        title: "Goal 1",
        status: "in_progress",
        progress: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const dummyProjects: LifeProject[] = [
      {
        id: "proj-1",
        domainId: d1,
        title: "Project 1",
        status: "active",
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const stats = getLifeAlignmentStats(openTasks, [], dummyDomains, dummyGoals, dummyProjects);

    expect(stats.openTasksCount).toBe(4);
    expect(stats.anchoredTasksCount).toBe(3);
    expect(stats.unanchoredTasksCount).toBe(1);
    expect(stats.alignmentRatio).toBe(75); // 3 of 4 open tasks are anchored
  });

  it("returns 100% alignment ratio when all open tasks are anchored or when no tasks exist", () => {
    expect(getLifeAlignmentStats([], [], dummyDomains, [], []).alignmentRatio).toBe(100);

    const openTasks = [makeTask({ title: "Work", domainId: d1, status: "open" })];
    expect(getLifeAlignmentStats(openTasks, [], dummyDomains, [], []).alignmentRatio).toBe(100);
  });

  it("accurately detects stagnant goals with no active projects and no active habits", () => {
    const goals: LifeGoal[] = [
      {
        id: "stagnant-1",
        domainId: d1,
        title: "Write Book",
        status: "in_progress",
        progress: 10,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "active-1",
        domainId: d2,
        title: "Run Marathon",
        status: "in_progress",
        progress: 30,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: "achieved-1",
        domainId: d1,
        title: "Finish Course",
        status: "achieved",
        progress: 100,
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const projects: LifeProject[] = [
      {
        id: "proj-1",
        goalId: "active-1",
        domainId: d2,
        title: "Mileage training",
        status: "active",
        tags: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const stats = getLifeAlignmentStats([], [], dummyDomains, goals, projects);

    expect(stats.stagnantGoals.length).toBe(1);
    expect(stats.stagnantGoals[0].id).toBe("stagnant-1");
  });

  it("aggregates open task counts per domain accurately", () => {
    const openTasks: Task[] = [
      makeTask({ title: "Run", domainId: d1, status: "open" }),
      makeTask({ title: "Lift", domainId: d1, status: "open" }),
      makeTask({ title: "Code", domainId: d2, status: "open" }),
    ];

    const stats = getLifeAlignmentStats(openTasks, [], dummyDomains, [], []);
    expect(stats.domainTaskCounts[d1]).toBe(2);
    expect(stats.domainTaskCounts[d2]).toBe(1);
    expect(stats.domainTaskCounts[dummyDomains[2].id]).toBe(0);
  });

  it("detects orphaned tasks pointing to deleted domainId as unanchored", () => {
    const tasks: Task[] = [
      makeTask({ title: "Valid task", domainId: d1, status: "open" }),
      makeTask({ title: "Orphaned domain task", domainId: "nonexistent-domain-xyz", status: "open" }),
      makeTask({ title: "Orphaned goal task", goalId: "nonexistent-goal-xyz", status: "open" }),
      makeTask({ title: "Orphaned project task", projectId: "nonexistent-proj-xyz", status: "open" }),
    ];

    const stats = getLifeAlignmentStats(tasks, [], dummyDomains, [], []);
    expect(stats.openTasksCount).toBe(4);
    expect(stats.anchoredTasksCount).toBe(1);
    expect(stats.unanchoredTasksCount).toBe(3);
    expect(stats.alignmentRatio).toBe(25);
    expect(stats.unanchoredTasks.map((t) => t.title)).toEqual([
      "Orphaned domain task",
      "Orphaned goal task",
      "Orphaned project task",
    ]);
  });

  it("recognizes goals with active open tasks as not stagnant", () => {
    const goal: LifeGoal = {
      id: "goal-with-task",
      domainId: d1,
      title: "Active Goal with Tasks",
      status: "in_progress",
      progress: 10,
      createdAt: 0,
      updatedAt: 0,
    };

    const task = makeTask({ title: "Task for goal", goalId: "goal-with-task", status: "open" });
    const stats = getLifeAlignmentStats([task], [], dummyDomains, [goal], []);
    expect(stats.stagnantGoals.length).toBe(0);
  });

  it("stagnant goal detection: domain-wide habit does not prevent stagnant flag on unrelated goal", () => {
    const goal: LifeGoal = {
      id: "stagnant-goal-in-domain",
      domainId: d1,
      title: "Goal with no specific actions",
      status: "in_progress",
      progress: 0,
      createdAt: 0,
      updatedAt: 0,
    };

    // Habit is in domain d1, but NOT linked to this goal (h.goalId is null)
    const habit = makeHabit({ name: "Unrelated pillar habit", domainId: d1 });

    const stats = getLifeAlignmentStats([], [habit], dummyDomains, [goal], []);
    // Prior bug counted any habit in domain as goal momentum; now it correctly flags it as stagnant
    expect(stats.stagnantGoals.length).toBe(1);
    expect(stats.stagnantGoals[0].id).toBe("stagnant-goal-in-domain");
  });
});

describe("Visual Life Library default initialization", () => {
  it("initializes 6 core life pillars with valid scores (1-10)", () => {
    const data = defaultLifeData();
    expect(data.domains.length).toBe(6);
    data.domains.forEach((d) => {
      expect(d.score).toBeGreaterThanOrEqual(1);
      expect(d.score).toBeLessThanOrEqual(10);
      expect(d.targetScore).toBeGreaterThanOrEqual(d.score);
      expect(d.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it("provides meaningful initial goals and active projects linked to domains", () => {
    const data = defaultLifeData();
    expect(data.goals.length).toBeGreaterThanOrEqual(6);
    expect(data.projects.length).toBeGreaterThanOrEqual(3);

    const domainIds = new Set(data.domains.map((d) => d.id));
    data.goals.forEach((g) => {
      expect(domainIds.has(g.domainId)).toBe(true);
      expect(g.progress).toBeGreaterThanOrEqual(0);
      expect(g.progress).toBeLessThanOrEqual(100);
    });
  });

  it("records historical assessment baseline", () => {
    const data = defaultLifeData();
    expect(data.assessments.length).toBeGreaterThanOrEqual(2);
    expect(data.assessments[0].overallScore).toBeGreaterThan(0);
  });
});

describe("useLife store custom domain & knowledge vault CRUD", () => {
  it("adds, updates, and deletes custom life pillars with cascading cleanup", () => {
    const store = useLife.getState();
    const initialCount = store.data.domains.length;

    // Add custom domain
    const custom = store.addDomain({
      name: "Creative Arts",
      tagline: "Music production and oil painting",
      description: "Cultivating right-brain expression and artistic fluency.",
      icon: "Sparkles",
      color: "#ec4899",
      score: 6,
      targetScore: 9,
      reflection: "Dedicating Sunday afternoons to painting.",
      principles: ["Create before consuming"],
    });

    expect(custom.id).toBeDefined();
    expect(custom.isCustom).toBe(true);
    expect(custom.score).toBe(6);
    expect(useLife.getState().data.domains.length).toBe(initialCount + 1);

    // Add a goal and project to this custom domain
    const goal = store.addGoal({
      domainId: custom.id,
      title: "Paint 5 landscapes",
      status: "in_progress",
      progress: 20,
    });
    const proj = store.addProject({
      domainId: custom.id,
      goalId: goal.id,
      title: "Plein Air series",
      status: "active",
      tags: ["art"],
    });

    expect(useLife.getState().data.goals.some((g) => g.id === goal.id)).toBe(true);
    expect(useLife.getState().data.projects.some((p) => p.id === proj.id)).toBe(true);

    // Update custom domain score
    store.setDomainScore(custom.id, 8);
    expect(useLife.getState().data.domains.find((d) => d.id === custom.id)?.score).toBe(8);

    // Remove custom domain -> cascading deletes linked goals and projects
    store.removeDomain(custom.id);
    expect(useLife.getState().data.domains.some((d) => d.id === custom.id)).toBe(false);
    expect(useLife.getState().data.goals.some((g) => g.id === goal.id)).toBe(false);
    expect(useLife.getState().data.projects.some((p) => p.id === proj.id)).toBe(false);
  });

  it("manages core principles within a domain", () => {
    const store = useLife.getState();
    const domainId = store.data.domains[0].id;
    const initialPrinciplesCount = store.data.domains[0].principles?.length || 0;

    // Add principle
    store.addPrinciple(domainId, "Test new fundamental principle");
    const domainAfterAdd = useLife.getState().data.domains.find((d) => d.id === domainId)!;
    expect(domainAfterAdd.principles?.length).toBe(initialPrinciplesCount + 1);
    expect(domainAfterAdd.principles).toContain("Test new fundamental principle");

    // Remove principle
    const addedIndex = domainAfterAdd.principles!.indexOf("Test new fundamental principle");
    store.removePrinciple(domainId, addedIndex);
    const domainAfterRemove = useLife.getState().data.domains.find((d) => d.id === domainId)!;
    expect(domainAfterRemove.principles?.length).toBe(initialPrinciplesCount);
    expect(domainAfterRemove.principles).not.toContain("Test new fundamental principle");
  });

  it("manages curated vault knowledge resources within a domain", () => {
    const store = useLife.getState();
    const domainId = store.data.domains[0].id;

    // Add resource
    const res = store.addResource(domainId, {
      title: "Atomic Habits Summary",
      type: "book",
      content: "Make it obvious, attractive, easy, and satisfying.",
    });

    expect(res.id).toBeDefined();
    let domain = useLife.getState().data.domains.find((d) => d.id === domainId)!;
    expect(domain.resources?.some((r) => r.id === res.id)).toBe(true);

    // Update resource
    store.updateResource(domainId, res.id, { title: "Atomic Habits Full Guide" });
    domain = useLife.getState().data.domains.find((d) => d.id === domainId)!;
    expect(domain.resources?.find((r) => r.id === res.id)?.title).toBe("Atomic Habits Full Guide");

    // Remove resource
    store.removeResource(domainId, res.id);
    domain = useLife.getState().data.domains.find((d) => d.id === domainId)!;
    expect(domain.resources?.some((r) => r.id === res.id)).toBe(false);
  });

  it("prevents deleting the last remaining life pillar", () => {
    const store = useLife.getState();
    const originalDomains = [...store.data.domains];
    useLife.setState({
      data: {
        ...store.data,
        domains: [originalDomains[0]],
      },
    });

    store.removeDomain(originalDomains[0].id);
    expect(useLife.getState().data.domains.length).toBe(1);
    expect(useLife.getState().data.domains[0].id).toBe(originalDomains[0].id);

    useLife.setState({
      data: {
        ...store.data,
        domains: originalDomains,
      },
    });
  });
});

describe("Cross-system Life Alignment store integration", () => {
  it("makeTask correctly preserves domainId, goalId, and projectId", () => {
    const task = makeTask({
      title: "Morning Zone 2 Cardio Run",
      domainId: "health",
      goalId: "goal-health-1",
      projectId: "proj-health-1",
    });

    expect(task.title).toBe("Morning Zone 2 Cardio Run");
    expect(task.domainId).toBe("health");
    expect(task.goalId).toBe("goal-health-1");
    expect(task.projectId).toBe("proj-health-1");
    expect(task.status).toBe("open");
  });

  it("makeHabit correctly preserves domainId and goalId", () => {
    const habit = makeHabit({
      name: "Cold Shower",
      domainId: "health",
      goalId: "goal-health-1",
    });
    expect(habit.domainId).toBe("health");
    expect(habit.goalId).toBe("goal-health-1");
  });

  it("makeNote correctly preserves domainId", () => {
    const note = makeNote({
      title: "Philosophy of Stoicism",
      domainId: "mindset",
    });
    expect(note.domainId).toBe("mindset");
  });

  it("makeEntry correctly preserves domainId", () => {
    const entry = makeEntry({
      body: "Grateful for clean morning air and quiet focus.",
      domainId: "mindset",
    });
    expect(entry.domainId).toBe("mindset");
  });
});

