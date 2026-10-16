import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  ExternalLink,
  Flame,
  Focus,
  Layers,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { useCanvas } from "@/stores/canvas";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/ids";
import type { Habit, LifeDomain, LifeGoal, LifeProject, Task } from "@/lib/types";

export interface LifeMapCanvasProps {
  domains: LifeDomain[];
  goals: LifeGoal[];
  projects: LifeProject[];
  habits: Habit[];
  tasks: Task[];
  onSelectDomain: (domain: LifeDomain) => void;
  onAddGoal: (domainId: string, title?: string) => void;
  onAddProject: (domainId: string, goalId?: string, title?: string) => void;
  onAddTask: (title: string, domainId: string, goalId?: string, projectId?: string) => void;
  onToggleTask: (taskId: string) => void;
}

export interface MapNode {
  id: string;
  type: "pillar" | "goal" | "project" | "habit" | "task";
  tier: number;
  title: string;
  subtitle?: string;
  score?: number;
  progress?: number;
  status?: string;
  domainId: string;
  parentId?: string;
  entityId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rawDomain?: LifeDomain;
  rawGoal?: LifeGoal;
  rawProject?: LifeProject;
  rawHabit?: Habit;
  rawTask?: Task;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  d: string;
  domainId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function LifeMapCanvas({
  domains,
  goals,
  projects,
  habits,
  tasks,
  onSelectDomain,
  onAddGoal,
  onAddProject,
  onAddTask,
  onToggleTask,
}: LifeMapCanvasProps) {
  const toast = useUi((s) => s.toast);
  const navigate = useUi((s) => s.navigate);

  // Viewport camera state (pan & zoom)
  const [panX, setPanX] = useState(40);
  const [panY, setPanY] = useState(40);
  const [zoom, setZoom] = useState(0.9);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Active lineage illumination state (hover preview + click selection)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const activeNodeId = hoveredNodeId || selectedNodeId;

  const [quickAddParentNode, setQuickAddParentNode] = useState<MapNode | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [goalChildType, setGoalChildType] = useState<"project" | "task">("project");

  // Domain filter selector ("all" or domain.id)
  const [filterDomainId, setFilterDomainId] = useState<string>("all");

  const filteredDomains = useMemo(() => {
    if (filterDomainId === "all") return domains;
    return domains.filter((d) => d.id === filterDomainId);
  }, [domains, filterDomainId]);

  const domainMap = useMemo(() => new Map(domains.map((d) => [d.id, d])), [domains]);

  // Compute 2D Hierarchical Layout
  const { nodes, edges, bounds } = useMemo(() => {
    const computedNodes: MapNode[] = [];
    const computedEdges: MapEdge[] = [];

    const tierX = [60, 360, 680, 980];
    const nodeWidths = [240, 240, 220, 210];
    const nodeHeights = [76, 68, 56, 46];

    let currentY = 50;

    filteredDomains.forEach((dom) => {
      const domGoals = goals.filter((g) => g.domainId === dom.id);
      const domProjects = projects.filter((p) => p.domainId === dom.id);
      const domHabits = habits.filter((h) => h.domainId === dom.id && !h.archived);
      const domTasks = tasks.filter((t) => t.domainId === dom.id && t.status === "open");

      const pillarNodeId = `pillar_${dom.id}`;
      const pillarStartY = currentY;

      // Group by Goal
      const goalYPositions: number[] = [];

      if (domGoals.length === 0) {
        // If domain has no goals, handle unlinked projects or tasks
        const unlinkedProjects = domProjects;
        const unlinkedHabits = domHabits;
        const unlinkedTasks = domTasks;

        if (
          unlinkedProjects.length === 0 &&
          unlinkedHabits.length === 0 &&
          unlinkedTasks.length === 0
        ) {
          computedNodes.push({
            id: pillarNodeId,
            type: "pillar",
            tier: 0,
            title: dom.name,
            subtitle: dom.tagline,
            score: dom.score,
            domainId: dom.id,
            entityId: dom.id,
            x: tierX[0],
            y: currentY,
            width: nodeWidths[0],
            height: nodeHeights[0],
            rawDomain: dom,
          });
          currentY += nodeHeights[0] + 36;
        } else {
          const startPillarY = currentY;
          // Place projects
          unlinkedProjects.forEach((proj) => {
            const projNodeId = `proj_${proj.id}`;
            const projTasks = unlinkedTasks.filter((t) => t.projectId === proj.id);
            const projStartY = currentY;

            if (projTasks.length === 0) {
              computedNodes.push({
                id: projNodeId,
                type: "project",
                tier: 2,
                title: proj.title,
                status: proj.status,
                domainId: dom.id,
                parentId: pillarNodeId,
                entityId: proj.id,
                x: tierX[2],
                y: currentY,
                width: nodeWidths[2],
                height: nodeHeights[2],
                rawProject: proj,
              });
              currentY += nodeHeights[2] + 16;
            } else {
              projTasks.forEach((t) => {
                const taskNodeId = `task_${t.id}`;
                computedNodes.push({
                  id: taskNodeId,
                  type: "task",
                  tier: 3,
                  title: t.title,
                  domainId: dom.id,
                  parentId: projNodeId,
                  entityId: t.id,
                  x: tierX[3],
                  y: currentY,
                  width: nodeWidths[3],
                  height: nodeHeights[3],
                  rawTask: t,
                });
                currentY += nodeHeights[3] + 12;
              });

              const projCenterY = (projStartY + currentY - 12 - nodeHeights[2]) / 2;
              computedNodes.push({
                id: projNodeId,
                type: "project",
                tier: 2,
                title: proj.title,
                status: proj.status,
                domainId: dom.id,
                parentId: pillarNodeId,
                entityId: proj.id,
                x: tierX[2],
                y: Math.max(projStartY, projCenterY),
                width: nodeWidths[2],
                height: nodeHeights[2],
                rawProject: proj,
              });
              currentY += 8;
            }
          });

          // Unlinked habits
          unlinkedHabits.forEach((h) => {
            const habitNodeId = `habit_${h.id}`;
            computedNodes.push({
              id: habitNodeId,
              type: "habit",
              tier: 3,
              title: h.name,
              domainId: dom.id,
              parentId: pillarNodeId,
              entityId: h.id,
              x: tierX[3],
              y: currentY,
              width: nodeWidths[3],
              height: nodeHeights[3],
              rawHabit: h,
            });
            currentY += nodeHeights[3] + 12;
          });

          // Unlinked direct domain tasks
          const directTasks = unlinkedTasks.filter((t) => !t.projectId);
          directTasks.forEach((t) => {
            computedNodes.push({
              id: `task_${t.id}`,
              type: "task",
              tier: 3,
              title: t.title,
              domainId: dom.id,
              parentId: pillarNodeId,
              entityId: t.id,
              x: tierX[3],
              y: currentY,
              width: nodeWidths[3],
              height: nodeHeights[3],
              rawTask: t,
            });
            currentY += nodeHeights[3] + 12;
          });

          const pillarCenterY = (startPillarY + currentY - 24) / 2;
          computedNodes.push({
            id: pillarNodeId,
            type: "pillar",
            tier: 0,
            title: dom.name,
            subtitle: dom.tagline,
            score: dom.score,
            domainId: dom.id,
            entityId: dom.id,
            x: tierX[0],
            y: pillarCenterY,
            width: nodeWidths[0],
            height: nodeHeights[0],
            rawDomain: dom,
          });
          currentY += 40;
        }
      } else {
        const pillarStartY = currentY;
        const goalYPositions: number[] = [];

        domGoals.forEach((goal) => {
          const goalNodeId = `goal_${goal.id}`;
          const goalProjects = domProjects.filter((p) => p.goalId === goal.id);
          const goalHabits = domHabits.filter((h) => h.goalId === goal.id);
          const goalTasks = domTasks.filter((t) => t.goalId === goal.id);

          const goalStartY = currentY;

          // Projects linked to goal
          if (goalProjects.length > 0) {
            goalProjects.forEach((proj) => {
              const projNodeId = `proj_${proj.id}`;
              const projTasks = goalTasks.filter((t) => t.projectId === proj.id);

              if (projTasks.length === 0) {
                computedNodes.push({
                  id: projNodeId,
                  type: "project",
                  tier: 2,
                  title: proj.title,
                  status: proj.status,
                  domainId: dom.id,
                  parentId: goalNodeId,
                  entityId: proj.id,
                  x: tierX[2],
                  y: currentY,
                  width: nodeWidths[2],
                  height: nodeHeights[2],
                  rawProject: proj,
                });
                currentY += nodeHeights[2] + 16;
              } else {
                const projStartY = currentY;
                projTasks.forEach((t) => {
                  const taskNodeId = `task_${t.id}`;
                  computedNodes.push({
                    id: taskNodeId,
                    type: "task",
                    tier: 3,
                    title: t.title,
                    domainId: dom.id,
                    parentId: projNodeId,
                    entityId: t.id,
                    x: tierX[3],
                    y: currentY,
                    width: nodeWidths[3],
                    height: nodeHeights[3],
                    rawTask: t,
                  });
                  currentY += nodeHeights[3] + 12;
                });

                const projCenterY = (projStartY + currentY - 12 - nodeHeights[2]) / 2;
                computedNodes.push({
                  id: projNodeId,
                  type: "project",
                  tier: 2,
                  title: proj.title,
                  status: proj.status,
                  domainId: dom.id,
                  parentId: goalNodeId,
                  entityId: proj.id,
                  x: tierX[2],
                  y: Math.max(projStartY, projCenterY),
                  width: nodeWidths[2],
                  height: nodeHeights[2],
                  rawProject: proj,
                });
                currentY += 8;
              }
            });
          }

          // Direct habits linked to goal (place in Tier 2 if goal has no projects, else Tier 3)
          const habitTier = goalProjects.length === 0 ? 2 : 3;
          goalHabits.forEach((h) => {
            const habitNodeId = `habit_${h.id}`;
            computedNodes.push({
              id: habitNodeId,
              type: "habit",
              tier: habitTier,
              title: h.name,
              domainId: dom.id,
              parentId: goalNodeId,
              entityId: h.id,
              x: tierX[habitTier],
              y: currentY,
              width: nodeWidths[habitTier],
              height: nodeHeights[habitTier],
              rawHabit: h,
            });
            currentY += nodeHeights[habitTier] + 12;
          });

          // Direct tasks linked to goal without project
          const directTasks = goalTasks.filter((t) => !t.projectId);
          directTasks.forEach((t) => {
            const taskNodeId = `task_${t.id}`;
            computedNodes.push({
              id: taskNodeId,
              type: "task",
              tier: 3,
              title: t.title,
              domainId: dom.id,
              parentId: goalNodeId,
              entityId: t.id,
              x: tierX[3],
              y: currentY,
              width: nodeWidths[3],
              height: nodeHeights[3],
              rawTask: t,
            });
            currentY += nodeHeights[3] + 12;
          });

          // Fallback if goal has no projects, habits, or tasks
          if (
            goalProjects.length === 0 &&
            goalHabits.length === 0 &&
            directTasks.length === 0
          ) {
            currentY += nodeHeights[1] + 16;
          }

          const goalEndY = currentY;
          const goalCenterY = Math.max(
            goalStartY,
            (goalStartY + goalEndY - 16 - nodeHeights[1]) / 2,
          );

          computedNodes.push({
            id: goalNodeId,
            type: "goal",
            tier: 1,
            title: goal.title,
            progress: goal.progress,
            domainId: dom.id,
            parentId: pillarNodeId,
            entityId: goal.id,
            x: tierX[1],
            y: goalCenterY,
            width: nodeWidths[1],
            height: nodeHeights[1],
            rawGoal: goal,
          });

          goalYPositions.push(goalCenterY);
          currentY += 16;
        });

        // Unlinked direct projects under domain
        const directDomainProjects = domProjects.filter((p) => !p.goalId);
        directDomainProjects.forEach((proj) => {
          const projNodeId = `proj_${proj.id}`;
          const projTasks = domTasks.filter((t) => t.projectId === proj.id);
          const projStartY = currentY;

          if (projTasks.length === 0) {
            computedNodes.push({
              id: projNodeId,
              type: "project",
              tier: 2,
              title: proj.title,
              status: proj.status,
              domainId: dom.id,
              parentId: pillarNodeId,
              entityId: proj.id,
              x: tierX[2],
              y: currentY,
              width: nodeWidths[2],
              height: nodeHeights[2],
              rawProject: proj,
            });
            currentY += nodeHeights[2] + 16;
          } else {
            projTasks.forEach((t) => {
              computedNodes.push({
                id: `task_${t.id}`,
                type: "task",
                tier: 3,
                title: t.title,
                domainId: dom.id,
                parentId: projNodeId,
                entityId: t.id,
                x: tierX[3],
                y: currentY,
                width: nodeWidths[3],
                height: nodeHeights[3],
                rawTask: t,
              });
              currentY += nodeHeights[3] + 12;
            });

            const projCenterY = (projStartY + currentY - 12 - nodeHeights[2]) / 2;
            computedNodes.push({
              id: projNodeId,
              type: "project",
              tier: 2,
              title: proj.title,
              status: proj.status,
              domainId: dom.id,
              parentId: pillarNodeId,
              entityId: proj.id,
              x: tierX[2],
              y: Math.max(projStartY, projCenterY),
              width: nodeWidths[2],
              height: nodeHeights[2],
              rawProject: proj,
            });
            currentY += 8;
          }
        });

        // Direct habits under domain without a goalId (place in Tier 2 to prevent gap)
        const directDomainHabits = domHabits.filter((h) => !h.goalId);
        const directHabitTier = 2;
        directDomainHabits.forEach((h) => {
          computedNodes.push({
            id: `habit_${h.id}`,
            type: "habit",
            tier: directHabitTier,
            title: h.name,
            domainId: dom.id,
            parentId: pillarNodeId,
            entityId: h.id,
            x: tierX[directHabitTier],
            y: currentY,
            width: nodeWidths[directHabitTier],
            height: nodeHeights[directHabitTier],
            rawHabit: h,
          });
          currentY += nodeHeights[directHabitTier] + 12;
        });

        // Direct tasks under domain without a goalId or projectId
        const directDomainTasks = domTasks.filter((t) => !t.goalId && !t.projectId);
        directDomainTasks.forEach((t) => {
          computedNodes.push({
            id: `task_${t.id}`,
            type: "task",
            tier: 3,
            title: t.title,
            domainId: dom.id,
            parentId: pillarNodeId,
            entityId: t.id,
            x: tierX[3],
            y: currentY,
            width: nodeWidths[3],
            height: nodeHeights[3],
            rawTask: t,
          });
          currentY += nodeHeights[3] + 12;
        });

        // Compute pillar vertical center relative to all its children
        const pillarCenterY = (pillarStartY + currentY - 24) / 2;

        computedNodes.push({
          id: pillarNodeId,
          type: "pillar",
          tier: 0,
          title: dom.name,
          subtitle: dom.tagline,
          score: dom.score,
          domainId: dom.id,
          entityId: dom.id,
          x: tierX[0],
          y: Math.max(pillarStartY, pillarCenterY),
          width: nodeWidths[0],
          height: nodeHeights[0],
          rawDomain: dom,
        });

        currentY += 40;
      }
    });

    // Compute dynamic cubic-bezier connecting wires with smooth monotonic S-curves
    const nodeMap = new Map<string, MapNode>();
    computedNodes.forEach((n) => nodeMap.set(n.id, n));

    computedNodes.forEach((cNode) => {
      if (!cNode.parentId) return;
      const pNode = nodeMap.get(cNode.parentId);
      if (!pNode) return;

      const x1 = pNode.x + pNode.width;
      const y1 = pNode.y + pNode.height / 2;
      const x2 = cNode.x;
      const y2 = cNode.y + cNode.height / 2;

      const spanX = Math.max(20, x2 - x1);
      const dx = Math.min(120, Math.max(16, spanX * 0.45));
      const cx1 = x1 + dx;
      const cy1 = y1;
      const cx2 = x2 - dx;
      const cy2 = y2;

      const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
      computedEdges.push({
        id: `edge_${pNode.id}_${cNode.id}`,
        from: pNode.id,
        to: cNode.id,
        d,
        domainId: cNode.domainId,
        x1,
        y1,
        x2,
        y2,
      });
    });

    const maxX = Math.max(...computedNodes.map((n) => n.x + n.width), 1200);
    const maxY = Math.max(...computedNodes.map((n) => n.y + n.height), 800);

    return {
      nodes: computedNodes,
      edges: computedEdges,
      bounds: { width: maxX + 100, height: maxY + 100 },
    };
  }, [filteredDomains, goals, projects, habits, tasks]);

  // Compute Lineage Illumination Set (Ancestors + Descendants)
  const illuminatedSet = useMemo(() => {
    if (!activeNodeId) return null;

    const set = new Set<string>();
    set.add(activeNodeId);

    const nodeMap = new Map<string, MapNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    // 1. Ancestors
    let curr = nodeMap.get(activeNodeId);
    while (curr && curr.parentId) {
      set.add(curr.parentId);
      curr = nodeMap.get(curr.parentId);
    }

    // 2. Descendants (breadth-first)
    const queue = [activeNodeId];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      nodes.forEach((n) => {
        if (n.parentId === parent) {
          set.add(n.id);
          queue.push(n.id);
        }
      });
    }

    return set;
  }, [activeNodeId, nodes]);

  // 1-Click "Open Pillar in Visual Canvas" handler
  const handleOpenPillarInCanvas = (pillar: LifeDomain) => {
    const canvasStore = useCanvas.getState();
    const boardTitle = `${pillar.name} Ecosystem`;

    let board = canvasStore.boards.find((b) => b.name === boardTitle);
    if (!board) {
      const newBoard = canvasStore.createBoard(boardTitle);
      board = newBoard;

      // Populate ecosystem on the visual infinite canvas
      const pillarGoals = goals.filter((g) => g.domainId === pillar.id);
      const pillarTasks = tasks.filter((t) => t.domainId === pillar.id && t.status === "open");

      // 1. Central Frame for the Pillar
      const frameNode = canvasStore.addNode(newBoard.id, {
        type: "group",
        x: 60,
        y: 60,
        width: 880,
        height: 580,
        label: pillar.name,
        color: "4", // emerald
        data: { subType: "group", title: pillar.name },
      });

      // 2. Philosophy Sticky Note
      canvasStore.addNode(newBoard.id, {
        type: "text",
        x: 100,
        y: 120,
        width: 260,
        height: 200,
        color: "3", // amber
        text: `📜 ${pillar.name} Manifesto\n\n${pillar.reflection || pillar.tagline}\n\n• Satisfaction: ${pillar.score}/10\n• Target: ${pillar.targetScore}/10`,
        data: { subType: "sticky", stickyColor: "amber" },
      });

      // 3. Goal Nodes & Tasks
      pillarGoals.slice(0, 3).forEach((g, gIdx) => {
        const goalNode = canvasStore.addNode(newBoard.id, {
          type: "text",
          x: 400,
          y: 120 + gIdx * 130,
          width: 240,
          height: 100,
          color: "5", // sky
          text: `🎯 Goal: ${g.title}\nProgress: ${g.progress}%\nTimeframe: ${g.timeframe || "quarterly"}`,
        });

        // Add edge from philosophy to goal
        canvasStore.addEdge(newBoard.id, {
          fromNode: frameNode.id,
          toNode: goalNode.id,
          fromSide: "right",
          toSide: "left",
        });
      });

      // 4. Task Nodes
      pillarTasks.slice(0, 3).forEach((t, tIdx) => {
        canvasStore.addNode(newBoard.id, {
          type: "text",
          x: 680,
          y: 120 + tIdx * 110,
          width: 220,
          height: 80,
          data: { subType: "task", taskId: t.id },
        });
      });
    }

    canvasStore.setActiveBoard(board.id);
    navigate("canvas", board.id);
  };

  // Quick Spawn Child Submission
  const handleQuickAddSubmit = () => {
    if (!quickAddTitle.trim() || !quickAddParentNode) return;
    const parent = quickAddParentNode;
    const title = quickAddTitle.trim();

    if (parent.type === "pillar") {
      onAddGoal(parent.domainId, title);
    } else if (parent.type === "goal") {
      if (goalChildType === "project") {
        onAddProject(parent.domainId, parent.entityId, title);
      } else {
        onAddTask(title, parent.domainId, parent.entityId, undefined);
      }
    } else if (parent.type === "project") {
      onAddTask(title, parent.domainId, parent.rawProject?.goalId ?? undefined, parent.entityId);
    }

    setQuickAddTitle("");
    setQuickAddParentNode(null);
  };

  // Canvas Pan Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    // If clicking inside an interactive card, button, input, or link, do not initiate pan
    if ((e.target as HTMLElement).closest(".card, button, input, textarea, a")) {
      return;
    }
    // Clicking canvas background deselects active node
    setSelectedNodeId(null);

    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {}
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX,
      panY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanX(panStartRef.current.panX + dx);
    setPanY(panStartRef.current.panY + dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {}
      setIsPanning(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((z) => Math.max(0.35, Math.min(1.8, Math.round((z + zoomDelta) * 100) / 100)));
    } else {
      setPanX((x) => x - e.deltaX * 0.7);
      setPanY((y) => y - e.deltaY * 0.7);
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden select-none">
      {/* Top Floating Controls Bar */}
      <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-32px)] items-center gap-2 rounded-2xl bg-surface/85 p-1.5 shadow-md backdrop-blur-md border hairline overflow-x-auto no-scrollbar flex-nowrap min-w-0">
        {/* Pillar Filter Selector */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            className={cn(
              "rounded-xl px-2.5 py-1 text-[0.76em] font-medium transition",
              filterDomainId === "all"
                ? "bg-accent text-accent-fg shadow-xs"
                : "text-muted hover:text-text",
            )}
            onClick={() => setFilterDomainId("all")}
          >
            All Pillars ({domains.length})
          </button>
          {domains.map((d) => (
            <button
              key={d.id}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[0.76em] font-medium transition",
                filterDomainId === d.id
                  ? "bg-accent text-accent-fg shadow-xs"
                  : "text-muted hover:text-text",
              )}
              onClick={() => setFilterDomainId(d.id)}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span>{d.name}</span>
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border/40 mx-0.5 shrink-0" />

        {/* Zoom Controls */}
        <div className="flex shrink-0 items-center gap-1 text-[0.76em]">
          <button
            className="btn btn-xs btn-ghost text-muted hover:text-text"
            onClick={() => setZoom((z) => Math.max(0.35, Math.round((z - 0.1) * 10) / 10))}
            title="Zoom Out"
          >
            <Minus size={12} />
          </button>
          <span className="font-mono text-muted tabular px-1">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="btn btn-xs btn-ghost text-muted hover:text-text"
            onClick={() => setZoom((z) => Math.min(1.8, Math.round((z + 0.1) * 10) / 10))}
            title="Zoom In"
          >
            <Plus size={12} />
          </button>
          <button
            className="btn btn-xs btn-ghost text-muted hover:text-text"
            onClick={() => {
              setPanX(40);
              setPanY(40);
              setZoom(0.9);
            }}
            title="Reset View"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* 2D Infinite Dot-Grid Canvas Stage */}
      <div
        className={cn(
          "relative flex-1 overflow-hidden touch-none",
          isPanning ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          className="canvas-world absolute left-0 top-0"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: bounds.width,
            height: bounds.height,
            transition: isPanning ? "none" : "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* SVG Background Dot Grid & Cubic Bezier Paths */}
          <svg
            className="absolute left-0 top-0 pointer-events-none"
            width={bounds.width}
            height={bounds.height}
          >
            <defs>
              <pattern
                id="life-map-dot-grid"
                x="0"
                y="0"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1.2" fill="currentColor" fillOpacity="0.08" />
              </pattern>
            </defs>

            {/* Dot Grid Layer */}
            <rect width={bounds.width} height={bounds.height} fill="url(#life-map-dot-grid)" />

            {/* Cubic Bezier Connector Wires & Port Anchors */}
            {edges.map((edge) => {
              const isIlluminated =
                illuminatedSet &&
                illuminatedSet.has(edge.from) &&
                illuminatedSet.has(edge.to);

              const edgeDomain = domainMap.get(edge.domainId);
              const wireColor = edgeDomain?.color || "var(--color-accent)";

              return (
                <g key={edge.id} className="transition-all duration-200">
                  <path
                    d={edge.d}
                    fill="none"
                    stroke={isIlluminated ? "var(--color-accent)" : wireColor}
                    strokeWidth={isIlluminated ? 2.8 : 2.0}
                    strokeOpacity={isIlluminated ? 1 : illuminatedSet ? 0.18 : 0.65}
                    strokeDasharray={isIlluminated ? "6 3" : undefined}
                    vectorEffect="non-scaling-stroke"
                    className={cn(
                      "transition-all duration-200",
                      isIlluminated && "animate-pulse drop-shadow-md",
                    )}
                  />
                  {/* Connection Node Port Anchors */}
                  <circle
                    cx={edge.x1}
                    cy={edge.y1}
                    r={isIlluminated ? 3.5 : 2.5}
                    fill={isIlluminated ? "var(--color-accent)" : wireColor}
                    opacity={isIlluminated ? 1 : illuminatedSet ? 0.25 : 0.85}
                  />
                  <circle
                    cx={edge.x2}
                    cy={edge.y2}
                    r={isIlluminated ? 3.5 : 2.5}
                    fill={isIlluminated ? "var(--color-accent)" : wireColor}
                    opacity={isIlluminated ? 1 : illuminatedSet ? 0.25 : 0.85}
                  />
                </g>
              );
            })}
          </svg>

          {/* HTML Interactive Node Cards */}
          {nodes.map((node) => {
            const isIlluminated = !illuminatedSet || illuminatedSet.has(node.id);
            const isSelected = activeNodeId === node.id;

            return (
              <div
                key={node.id}
                className={cn(
                  "card group absolute flex flex-col justify-between border hairline transition-all duration-200",
                  isSelected && "ring-2 ring-accent border-accent shadow-lg",
                  !isIlluminated && "opacity-25 grayscale-[40%]",
                  isIlluminated && !isSelected && "hover:border-accent/40 hover:shadow-md",
                )}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  background:
                    node.type === "pillar"
                      ? "color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))"
                      : "var(--color-surface)",
                }}
                onPointerEnter={() => setHoveredNodeId(node.id)}
                onPointerLeave={() => setHoveredNodeId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
              >
                {/* Node Body based on Type */}
                {node.type === "pillar" && (
                  <div className="flex h-full flex-col justify-between p-3 overflow-hidden rounded-xl">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="truncate font-bold text-text text-[0.9em]">
                          {node.title}
                        </span>
                      </div>
                      <span className="rounded-full bg-accent/15 px-2 py-0.2 text-[0.7em] font-bold text-accent tabular">
                        {node.score}/10
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t hairline pt-1 text-[0.72em]">
                      <button
                        className="text-muted hover:text-accent font-medium flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (node.rawDomain) onSelectDomain(node.rawDomain);
                        }}
                      >
                        Pillar Studio <ChevronRight size={11} />
                      </button>

                      <button
                        className="btn btn-xs btn-ghost text-accent flex items-center gap-1 px-1.5 py-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (node.rawDomain) handleOpenPillarInCanvas(node.rawDomain);
                        }}
                        title="Open in Visual Canvas"
                      >
                        <Layers size={11} /> Visual Canvas
                      </button>
                    </div>
                  </div>
                )}

                {node.type === "goal" && (
                  <div className="flex h-full flex-col justify-between p-2.5 overflow-hidden rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-1.5 min-w-0">
                        <Target size={13} className="text-accent shrink-0 mt-0.5" />
                        <span className="line-clamp-2 text-[0.82em] font-semibold text-text leading-snug">
                          {node.title}
                        </span>
                      </div>
                      <span className="text-[0.7em] font-mono text-muted tabular shrink-0">
                        {node.progress}%
                      </span>
                    </div>

                    {/* Progress Bar Hairline */}
                    <div className="h-1 w-full rounded-full bg-surface-2 overflow-hidden mt-1">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${node.progress || 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {node.type === "project" && (
                  <div className="flex h-full items-center justify-between p-2.5 gap-2 overflow-hidden rounded-xl">
                    <div className="flex items-center gap-2 truncate">
                      <Briefcase size={12} className="text-muted shrink-0" />
                      <span className="truncate text-[0.8em] font-medium text-text">
                        {node.title}
                      </span>
                    </div>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.66em] text-muted capitalize shrink-0">
                      {node.status}
                    </span>
                  </div>
                )}

                {node.type === "habit" && (
                  <div className="flex h-full items-center justify-between p-2 gap-2 overflow-hidden rounded-xl">
                    <div className="flex items-center gap-1.5 truncate">
                      <Flame size={12} className="text-accent shrink-0" />
                      <span className="truncate text-[0.78em] text-text font-medium">
                        {node.title}
                      </span>
                    </div>
                    <span className="rounded bg-accent/10 px-1.5 py-0.2 text-[0.66em] text-accent font-bold">
                      Habit
                    </span>
                  </div>
                )}

                {node.type === "task" && (
                  <div className="flex h-full items-center justify-between p-2 gap-2 overflow-hidden rounded-xl">
                    <div className="flex items-center gap-1.5 truncate">
                      <button
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border hairline border-border/70 text-transparent hover:border-accent hover:text-accent transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTask(node.entityId);
                        }}
                        title="Mark complete"
                      >
                        <Check size={11} strokeWidth={2.5} />
                      </button>
                      <span className="truncate text-[0.78em] text-text">{node.title}</span>
                    </div>
                    <span className="rounded bg-surface-2 px-1.5 py-0.2 text-[0.66em] text-faint">
                      Open
                    </span>
                  </div>
                )}

                {/* Right `+` Port for spawning connected children */}
                {node.type !== "task" && node.type !== "habit" && (
                  <button
                    className={cn(
                      "absolute -right-2.5 top-1/2 -translate-y-1/2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md ring-2 ring-surface transition-all duration-150 cursor-pointer hover:scale-125",
                      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickAddParentNode(node);
                    }}
                    title={`Spawn connected child under ${node.title}`}
                  >
                    <Plus size={11} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline Child Spawner Modal / Drawer */}
      {quickAddParentNode && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/60 backdrop-blur-xs anim-fade">
          <div className="card flex w-full max-w-sm flex-col gap-3 p-4 shadow-xl border hairline">
            <div className="flex items-center justify-between border-b hairline pb-2">
              <div className="flex items-center gap-1.5 text-[0.88em] font-semibold text-text truncate">
                <Plus size={14} className="text-accent shrink-0" />
                <span className="truncate">Spawn Child under {quickAddParentNode.title}</span>
              </div>
              <button
                className="text-faint hover:text-text shrink-0"
                onClick={() => setQuickAddParentNode(null)}
              >
                ✕
              </button>
            </div>

            {quickAddParentNode.type === "goal" && (
              <div className="flex items-center rounded-lg bg-surface-2/60 p-0.5 border hairline">
                <button
                  className={cn(
                    "flex-1 rounded-md py-1 text-[0.76em] font-medium transition",
                    goalChildType === "project"
                      ? "bg-surface text-text shadow-xs"
                      : "text-muted hover:text-text",
                  )}
                  onClick={() => setGoalChildType("project")}
                >
                  Project
                </button>
                <button
                  className={cn(
                    "flex-1 rounded-md py-1 text-[0.76em] font-medium transition",
                    goalChildType === "task"
                      ? "bg-surface text-text shadow-xs"
                      : "text-muted hover:text-text",
                  )}
                  onClick={() => setGoalChildType("task")}
                >
                  Task
                </button>
              </div>
            )}

            <input
              type="text"
              className="input w-full text-[0.85em]"
              placeholder={
                quickAddParentNode.type === "pillar"
                  ? "Enter goal title…"
                  : quickAddParentNode.type === "goal"
                    ? goalChildType === "project"
                      ? "Enter project title…"
                      : "Enter task title…"
                    : "Enter task title…"
              }
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickAddSubmit();
              }}
              autoFocus
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                className="btn btn-xs btn-ghost text-muted"
                onClick={() => setQuickAddParentNode(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-xs btn-primary"
                onClick={handleQuickAddSubmit}
                disabled={!quickAddTitle.trim()}
              >
                Spawn Child Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
