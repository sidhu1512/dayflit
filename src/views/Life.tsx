import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bookmark,
  Briefcase,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Edit2,
  ExternalLink,
  Flame,
  Layers,
  LayoutGrid,
  Network,
  PieChart,
  Plus,
  Pencil,
  Quote,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { TruncatedText } from "@/components/ui/ThemedTooltip";
import {
  useLife,
  calculateAverageScore,
  calculateBalanceIndex,
  calculateDomainDeltas,
  DEFAULT_DOMAINS,
} from "@/stores/life";
import { useHabits, isDoneOn } from "@/stores/habits";
import { useTasks } from "@/stores/tasks";
import { useUi } from "@/stores/ui";
import { useCanvas } from "@/stores/canvas";
import { LifeRadarInstrument } from "@/components/LifeRadarInstrument";
import { LifeMapCanvas } from "@/components/LifeMapCanvas";
import { SmartObjectCard } from "@/components/SmartObjectCard";
import { Empty } from "@/components/Empty";
import { SlidingPillContainer } from "@/components/ui/MotionPrimitives";
import { dateKey } from "@/lib/dates";
import { cn } from "@/lib/ids";
import { useElementWidth } from "@/lib/useElementWidth";
import type {
  Habit,
  LifeDomain,
  LifeGoal,
  LifeProject,
  LifeResource,
  Task,
  WheelAssessment,
} from "@/lib/types";

type LifeTab = "library" | "wheel" | "map";

export function LifeView() {
  const [tab, setTab] = useState<LifeTab>("library");
  const data = useLife((s) => s.data);
  const activeDomainId = useLife((s) => s.activeDomainId);
  const setActiveDomain = useLife((s) => s.setActiveDomain);
  const addDomain = useLife((s) => s.addDomain);
  const updateDomain = useLife((s) => s.updateDomain);
  const removeDomain = useLife((s) => s.removeDomain);
  const setDomainScore = useLife((s) => s.setDomainScore);
  const addGoal = useLife((s) => s.addGoal);
  const updateGoal = useLife((s) => s.updateGoal);
  const removeGoal = useLife((s) => s.removeGoal);
  const addProject = useLife((s) => s.addProject);
  const updateProject = useLife((s) => s.updateProject);
  const removeProject = useLife((s) => s.removeProject);
  const addResource = useLife((s) => s.addResource);
  const removeResource = useLife((s) => s.removeResource);
  const addPrinciple = useLife((s) => s.addPrinciple);
  const removePrinciple = useLife((s) => s.removePrinciple);
  const saveAssessment = useLife((s) => s.saveAssessment);
  const removeAssessment = useLife((s) => s.removeAssessment);

  const habits = useHabits((s) => s.habits);
  const tasks = useTasks((s) => s.tasks);
  const updateTask = useTasks((s) => s.update);
  const addTask = useTasks((s) => s.add);
  const toggleTask = useTasks((s) => s.toggle);
  const toast = useUi((s) => s.toast);
  const viewParam = useUi((s) => s.viewParam);
  const navigate = useUi((s) => s.navigate);

  const domains = data.domains;
  const goals = data.goals;
  const projects = data.projects;
  const assessments = data.assessments;

  // Active domain object (defaults to first domain if none selected)
  const activeDomain = useMemo(() => {
    if (activeDomainId) {
      const found = domains.find((d) => d.id === activeDomainId);
      if (found) return found;
    }
    return domains[0] ?? null;
  }, [domains, activeDomainId]);

  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>();
  const twoPane = containerWidth >= 620;
  const [drillDownPillar, setDrillDownPillar] = useState<string | null>(null);

  // Deep linking via viewParam
  useEffect(() => {
    if (!viewParam) return;
    if (viewParam === "wheel") {
      setTab("wheel");
    } else if (viewParam === "map") {
      setTab("map");
    } else if (viewParam === "library") {
      setTab("library");
    } else {
      const found = domains.find((d) => d.id === viewParam);
      if (found) {
        setTab("library");
        setActiveDomain(found.id);
        setDrillDownPillar(found.id);
        return;
      }
      const goalId = viewParam.startsWith("goal:") ? viewParam.slice(5) : viewParam;
      const foundGoal = goals.find((g) => g.id === goalId);
      if (foundGoal) {
        setTab("library");
        setActiveDomain(foundGoal.domainId);
        setDrillDownPillar(foundGoal.domainId);
        return;
      }
    }
  }, [viewParam, domains, goals, setActiveDomain]);

  // Left Architectural Rail inline new pillar input
  const [newPillarName, setNewPillarName] = useState("");
  const handleCreatePillar = () => {
    const trimmed = newPillarName.trim();
    if (!trimmed) return;
    const newDom = addDomain({
      name: trimmed,
      tagline: `Philosophy & core focus for ${trimmed}`,
      description: "",
      icon: "Sparkles",
      color: "#60a5fa",
      score: 7,
      targetScore: 10,
      reflection: "Establish core habits and initial strategic milestones.",
      principles: ["Define clear north-star operating standards"],
      resources: [],
    });
    setNewPillarName("");
    setActiveDomain(newDom.id);
    toast({ title: `Pillar "${trimmed}" created`, kind: "success" });
  };

  // Launch Pillar into Directive 2 Infinite Canvas
  const handleOpenPillarInCanvas = (domain: LifeDomain) => {
    const canvasStore = useCanvas.getState();
    const boardTitle = `${domain.name} Ecosystem`;

    let board = canvasStore.boards.find((b) => b.name === boardTitle);
    if (!board) {
      const newBoard = canvasStore.createBoard(boardTitle);
      board = newBoard;

      const domGoals = goals.filter((g) => g.domainId === domain.id);
      const domTasks = tasks.filter((t) => t.domainId === domain.id && t.status === "open");

      // Frame
      const frameNode = canvasStore.addNode(newBoard.id, {
        type: "group",
        x: 60,
        y: 60,
        width: 860,
        height: 560,
        label: domain.name,
        color: "4",
        data: { subType: "group", title: domain.name },
      });

      // Manifesto Sticky
      canvasStore.addNode(newBoard.id, {
        type: "text",
        x: 100,
        y: 120,
        width: 260,
        height: 200,
        color: "3",
        text: `📜 ${domain.name} Manifesto\n\n${domain.reflection || domain.tagline}\n\n• Satisfaction: ${domain.score}/10\n• Target: ${domain.targetScore}/10`,
        data: { subType: "sticky", stickyColor: "amber" },
      });

      // Goals
      domGoals.slice(0, 3).forEach((g, idx) => {
        const goalNode = canvasStore.addNode(newBoard.id, {
          type: "text",
          x: 400,
          y: 120 + idx * 130,
          width: 240,
          height: 100,
          color: "5",
          text: `🎯 Goal: ${g.title}\nProgress: ${g.progress}%\nTimeframe: ${g.timeframe || "quarterly"}`,
        });

        canvasStore.addEdge(newBoard.id, {
          fromNode: frameNode.id,
          toNode: goalNode.id,
          fromSide: "right",
          toSide: "left",
        });
      });

      // Tasks
      domTasks.slice(0, 3).forEach((t, idx) => {
        canvasStore.addNode(newBoard.id, {
          type: "text",
          x: 680,
          y: 120 + idx * 110,
          width: 220,
          height: 80,
          data: { subType: "task", taskId: t.id },
        });
      });
    }

    canvasStore.setActiveBoard(board.id);
    navigate("canvas", board.id);
    toast({
      title: "Opened in Infinite Canvas",
      body: `Launched ${board.name} in visual workspace`,
      kind: "success",
    });
  };

  return (
    <div ref={containerRef} className="relative flex h-full flex-col select-none overflow-hidden bg-bg text-text">
      {/* Top Header Bar */}
      <div className="flex shrink-0 items-center justify-between border-b hairline px-4 py-2.5 bg-surface/50 backdrop-blur-md min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Compass size={19} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[1.05em] font-semibold leading-tight tracking-tight truncate">
                Life Studio & Map
              </span>
              <span className="rounded-full bg-accent/10 px-2 py-0.2 text-[0.68em] font-bold text-accent shrink-0">
                {domains.length} Pillars
              </span>
              <InfoHint
                text={
                  tab === "library"
                    ? "Things 3 Areas + Craft.do Editorial Studio"
                    : tab === "wheel"
                      ? "Precision Instrument & Historical Time-Machine"
                      : "Interactive Spatial Bezier Node Map"
                }
              />
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <SlidingPillContainer
          activeKey={tab}
          className="flex shrink-0 items-center rounded-xl bg-surface-2/70 p-0.5 border hairline"
          pillClassName="bg-surface shadow-xs rounded-lg"
        >
          <button
            data-active={tab === "library"}
            className={cn(
              "relative z-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.8em] font-medium transition-colors",
              tab === "library"
                ? "text-text"
                : "text-muted hover:text-text",
            )}
            onClick={() => setTab("library")}
          >
            <LayoutGrid size={13} />
            <span>Studio</span>
          </button>
          <button
            data-active={tab === "wheel"}
            className={cn(
              "relative z-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.8em] font-medium transition-colors",
              tab === "wheel"
                ? "text-text"
                : "text-muted hover:text-text",
            )}
            onClick={() => setTab("wheel")}
          >
            <PieChart size={13} />
            <span>Wheel of Life</span>
          </button>
          <button
            data-active={tab === "map"}
            className={cn(
              "relative z-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.8em] font-medium transition-colors",
              tab === "map"
                ? "text-text"
                : "text-muted hover:text-text",
            )}
            onClick={() => setTab("map")}
          >
            <Network size={13} />
            <span>Life Map</span>
          </button>
        </SlidingPillContainer>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* ============================================================ */}
        {/* TAB 1: EDITORIAL LIFE STUDIO (Master-Detail Architectural Layout)*/}
        {/* ============================================================ */}
        {tab === "library" && (
          <div className="flex h-full min-w-0 overflow-hidden anim-fade">
            {/* LEFT ARCHITECTURAL RAIL */}
            {(twoPane || !drillDownPillar) && (
              <div
                className={cn(
                  "flex flex-col justify-between border-r hairline bg-surface/30",
                  twoPane ? "w-64 shrink-0" : "w-full",
                )}
              >
                <SlidingPillContainer
                  activeKey={activeDomain?.id || ""}
                  className="flex flex-col flex-1 min-h-0 overflow-y-auto scroll p-2.5 gap-1 relative"
                  pillClassName="bg-surface-2 rounded-xl shadow-xs"
                >
                  <div className="relative z-1 px-2 py-1 text-[0.7em] font-semibold uppercase tracking-wider text-faint">
                    Life Pillars
                  </div>

                  {domains.map((dom) => {
                    const isSelected = activeDomain?.id === dom.id;
                    const domGoals = goals.filter((g) => g.domainId === dom.id);
                    const goalAvg =
                      domGoals.length > 0
                        ? Math.round(domGoals.reduce((a, b) => a + b.progress, 0) / domGoals.length)
                        : Math.round((dom.score / 10) * 100);

                    // Miniature Things 3-style SVG radial ring (radius 7, circumference ~44)
                    const circumference = 44;
                    const strokeDashoffset = circumference - (goalAvg / 100) * circumference;
                    const pillarColor = dom.color || "var(--color-accent)";

                    return (
                      <button
                        key={dom.id}
                        data-active={isSelected}
                        className={cn(
                          "relative z-1 group flex items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors",
                          isSelected
                            ? "text-text font-medium"
                            : "text-muted hover:text-text",
                        )}
                        onClick={() => {
                          setActiveDomain(dom.id);
                          setDrillDownPillar(dom.id);
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Miniature Things 3 SVG Radial Ring */}
                          <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                            <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
                              <circle
                                cx="10"
                                cy="10"
                                r="7"
                                fill="none"
                                stroke="currentColor"
                                strokeOpacity="0.12"
                                strokeWidth="2"
                              />
                              <circle
                                cx="10"
                                cy="10"
                                r="7"
                                fill="none"
                                stroke={pillarColor}
                                strokeWidth="2"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                              />
                            </svg>
                            {/* 6px optical dot at center */}
                            <span
                              className="absolute h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: pillarColor }}
                            />
                          </div>

                          <TruncatedText text={dom.name} side="right" className="truncate text-[0.84em] flex-1 min-w-0" />
                        </div>

                        {/* Tabular fulfillment score & Action buttons */}
                        <div className="flex items-center gap-1 shrink-0 pl-1.5">
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                            <button
                              type="button"
                              className="p-1 rounded-md text-faint hover:text-accent hover:bg-surface-3 transition-colors cursor-pointer"
                              title={`Rename ${dom.name}`}
                              aria-label={`Rename ${dom.name}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const newName = await useUi.getState().promptUser({
                                  title: `Rename "${dom.name}"`,
                                  body: "Enter new name for this life pillar:",
                                  initialValue: dom.name,
                                  placeholder: dom.name,
                                  confirmLabel: "Rename",
                                });
                                if (newName && newName.trim() && newName.trim() !== dom.name) {
                                  updateDomain(dom.id, { name: newName.trim() });
                                }
                              }}
                            >
                              <Pencil size={11} />
                            </button>
                            {domains.length > 1 && (
                              <button
                                type="button"
                                className="p-1 rounded-md text-faint hover:text-danger hover:bg-danger/20 transition-colors cursor-pointer"
                                title={`Delete ${dom.name}`}
                                aria-label={`Delete ${dom.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeDomain(dom.id);
                                }}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                          <span className="text-[0.76em] tabular text-muted font-mono">
                            {dom.score.toFixed(1)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </SlidingPillContainer>

                {/* Rail Bottom: Inline New Pillar Input */}
                <div className="border-t hairline p-2.5 bg-surface/50">
                  <div className="flex items-center gap-1.5 rounded-xl border hairline bg-surface/80 px-2 py-1 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/20 transition">
                    <Plus size={13} className="text-muted shrink-0" />
                    <input
                      type="text"
                      className="w-full bg-transparent text-[0.8em] text-text placeholder:text-muted/60 outline-none"
                      placeholder="New Pillar… (Enter)"
                      value={newPillarName}
                      onChange={(e) => setNewPillarName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreatePillar();
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT EDITORIAL CANVAS (Craft.do + Things 3 Document) */}
            {(twoPane || drillDownPillar) && (
              <div className="flex-1 min-w-0 overflow-y-auto scroll p-6">
                {!twoPane && (
                  <button
                    onClick={() => setDrillDownPillar(null)}
                    className="mb-4 inline-flex items-center gap-1.5 rounded-lg border hairline bg-surface-2/60 px-2.5 py-1 text-[0.8em] font-medium text-muted hover:text-text transition-colors"
                  >
                    <ChevronLeft size={14} />
                    <span>Back to Pillars</span>
                  </button>
                )}
                {activeDomain ? (
                  <EditorialPillarDocument
                    domain={activeDomain}
                    goals={goals.filter((g) => g.domainId === activeDomain.id)}
                    projects={projects.filter((p) => p.domainId === activeDomain.id)}
                    habits={habits.filter((h) => h.domainId === activeDomain.id && !h.archived)}
                    tasks={tasks.filter((t) => t.domainId === activeDomain.id && t.status === "open")}
                    onUpdateScore={(s) => setDomainScore(activeDomain.id, s)}
                    onUpdateDomain={(patch) => updateDomain(activeDomain.id, patch)}
                    onDeleteDomain={() => {
                      const domId = activeDomain.id;
                      removeDomain(domId);
                      toast({ title: "Pillar removed", kind: "info" });
                    }}
                    onAddGoal={(title) => {
                      addGoal({
                        domainId: activeDomain.id,
                        title,
                        progress: 0,
                        status: "in_progress",
                        timeframe: "quarterly",
                      });
                      toast({ title: "Goal added", kind: "success" });
                    }}
                    onUpdateGoal={updateGoal}
                    onRemoveGoal={removeGoal}
                    onAddProject={(title, goalId) => {
                      addProject({
                        domainId: activeDomain.id,
                        goalId,
                        title,
                        status: "active",
                        tags: [],
                      });
                      toast({ title: "Project added", kind: "success" });
                    }}
                    onUpdateProject={updateProject}
                    onRemoveProject={removeProject}
                    onAddPrinciple={(p) => addPrinciple(activeDomain.id, p)}
                    onRemovePrinciple={(idx) => removePrinciple(activeDomain.id, idx)}
                    onAddResource={(res) => addResource(activeDomain.id, res)}
                    onRemoveResource={(rId) => removeResource(activeDomain.id, rId)}
                    onToggleTask={toggleTask}
                    onAddTask={(title, goalId, projectId) => {
                      addTask({
                        title,
                        domainId: activeDomain.id,
                        goalId: goalId || null,
                        projectId: projectId || null,
                      });
                      toast({ title: "Task added", kind: "success" });
                    }}
                    onOpenInCanvas={() => handleOpenPillarInCanvas(activeDomain)}
                  />
                ) : (
                  <Empty
                    icon={<Compass size={32} />}
                    title="No Pillar Selected"
                    body="Select or create a life pillar on the left rail to view its editorial studio."
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: WHEEL OF LIFE (Instrument + Time-Machine)             */}
        {/* ============================================================ */}
        {tab === "wheel" && (
          <div className="h-full overflow-y-auto scroll p-6">
            <LifeRadarInstrument
              domains={domains}
              assessments={assessments}
              onUpdateScore={setDomainScore}
              onSelectDomain={(d) => {
                setActiveDomain(d.id);
                setTab("library");
              }}
              onSaveSnapshot={saveAssessment}
              onRemoveAssessment={removeAssessment}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: LIFE MAP (Interactive Spatial Bezier Node Graph)     */}
        {/* ============================================================ */}
        {tab === "map" && (
          <LifeMapCanvas
            domains={domains}
            goals={goals}
            projects={projects}
            habits={habits}
            tasks={tasks}
            onSelectDomain={(d) => {
              setActiveDomain(d.id);
              setTab("library");
            }}
            onAddGoal={(domId, title) => {
              addGoal({
                domainId: domId,
                title: title?.trim() || "New Strategic Goal",
                progress: 0,
                status: "in_progress",
                timeframe: "quarterly",
              });
              toast({ title: "Goal created on Life Map", kind: "success" });
            }}
            onAddProject={(domId, goalId, title) => {
              addProject({
                domainId: domId,
                goalId,
                title: title?.trim() || "New Project",
                status: "active",
                tags: [],
              });
              toast({ title: "Project created on Life Map", kind: "success" });
            }}
            onAddTask={(title, domId, goalId, projectId) => {
              addTask({
                title: title.trim() || "New Task",
                domainId: domId,
                goalId: goalId || null,
                projectId: projectId || null,
              });
              toast({ title: "Task added to Life Map", kind: "success" });
            }}
            onToggleTask={toggleTask}
          />
        )}
      </div>
    </div>
  );
}

// ====================================================================
// COMPONENT: EDITORIAL PILLAR DOCUMENT (Things 3 "Areas" + Craft.do)
// ====================================================================
function EditorialPillarDocument({
  domain,
  goals,
  projects,
  habits,
  tasks,
  onUpdateScore,
  onUpdateDomain,
  onDeleteDomain,
  onAddGoal,
  onUpdateGoal,
  onRemoveGoal,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onAddPrinciple,
  onRemovePrinciple,
  onAddResource,
  onRemoveResource,
  onToggleTask,
  onAddTask,
  onOpenInCanvas,
}: {
  domain: LifeDomain;
  goals: LifeGoal[];
  projects: LifeProject[];
  habits: Habit[];
  tasks: Task[];
  onUpdateScore: (score: number) => void;
  onUpdateDomain: (patch: Partial<LifeDomain>) => void;
  onDeleteDomain: () => void;
  onAddGoal: (title: string) => void;
  onUpdateGoal: (id: string, patch: Partial<LifeGoal>) => void;
  onRemoveGoal: (id: string) => void;
  onAddProject: (title: string, goalId?: string) => void;
  onUpdateProject: (id: string, patch: Partial<LifeProject>) => void;
  onRemoveProject: (id: string) => void;
  onAddPrinciple: (p: string) => void;
  onRemovePrinciple: (idx: number) => void;
  onAddResource: (r: Omit<LifeResource, "id" | "createdAt">) => void;
  onRemoveResource: (id: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (title: string, goalId?: string, projectId?: string) => void;
  onOpenInCanvas: () => void;
}) {
  // Inline Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(domain.name);

  useEffect(() => {
    setTitleValue(domain.name);
  }, [domain.name]);

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() && titleValue.trim() !== domain.name) {
      onUpdateDomain({ name: titleValue.trim() });
    }
  };

  // Inline Principle adding
  const [newPrincipleText, setNewPrincipleText] = useState("");
  const handleAddPrinciple = () => {
    if (!newPrincipleText.trim()) return;
    onAddPrinciple(newPrincipleText.trim());
    setNewPrincipleText("");
  };

  // Inline Quick Task/Goal Adder
  const [quickAddInput, setQuickAddInput] = useState("");
  const handleQuickAdd = () => {
    const text = quickAddInput.trim();
    if (!text) return;
    if (text.startsWith("goal:") || text.startsWith("Goal:")) {
      onAddGoal(text.replace(/^goal:\s*/i, ""));
    } else {
      onAddTask(text);
    }
    setQuickAddInput("");
  };

  // Inline Wisdom adder
  const [newWisdomInput, setNewWisdomInput] = useState("");
  const handleAddWisdom = () => {
    const text = newWisdomInput.trim();
    if (!text) return;
    const isUrl = /^https?:\/\//i.test(text);
    const isQuote = text.startsWith('"') || text.startsWith("“");

    onAddResource({
      title: isUrl ? text : text.slice(0, 40),
      type: isUrl ? "link" : isQuote ? "quote" : "guideline",
      content: text,
      url: isUrl ? text : undefined,
    });
    setNewWisdomInput("");
  };

  // Expanded Goals state map
  const [expandedGoalIds, setExpandedGoalIds] = useState<Record<string, boolean>>({});
  const toggleGoalExpand = (goalId: string) => {
    setExpandedGoalIds((prev) => ({ ...prev, [goalId]: !prev[goalId] }));
  };

  const goalIds = useMemo(() => new Set(goals.map((g) => g.id)), [goals]);
  const unlinkedProjects = useMemo(
    () => projects.filter((p) => !p.goalId || !goalIds.has(p.goalId)),
    [projects, goalIds],
  );
  const unlinkedHabits = useMemo(
    () => habits.filter((h) => !h.goalId || !goalIds.has(h.goalId)),
    [habits, goalIds],
  );
  const unlinkedTasks = useMemo(
    () => tasks.filter((t) => !t.goalId || !goalIds.has(t.goalId)),
    [tasks, goalIds],
  );
  const hasUnlinkedItems =
    unlinkedProjects.length > 0 || unlinkedHabits.length > 0 || unlinkedTasks.length > 0;

  const principles = domain.principles || [];
  const resources = domain.resources || [];

  return (
    <div className="mx-auto flex max-w-4xl w-full min-w-0 flex-col gap-8 pb-16">
      {/* 1. EDITORIAL HEADER & MANIFESTO */}
      <div
        className="rounded-2xl border hairline p-6 transition-all"
        style={{
          background: `color-mix(in srgb, ${domain.color || "var(--color-accent)"} 5%, var(--color-surface))`,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {/* 6px optical dot + Title */}
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: domain.color || "var(--color-accent)" }}
              />
              {isEditingTitle ? (
                <input
                  type="text"
                  className="bg-transparent font-bold text-2xl text-text outline-none border-b hairline border-accent"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleBlur();
                  }}
                  autoFocus
                />
              ) : (
                <h1
                  className="cursor-pointer font-bold text-2xl text-text tracking-tight hover:text-accent transition-colors"
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to edit title"
                >
                  {domain.name}
                </h1>
              )}
            </div>

            {/* Click-to-edit Tagline */}
            <input
              type="text"
              className="bg-transparent text-[0.85em] text-muted outline-none hover:text-text focus:text-text transition-colors"
              value={domain.tagline}
              onChange={(e) => onUpdateDomain({ tagline: e.target.value })}
              placeholder="Tagline or guiding vision…"
            />
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="btn btn-sm btn-ghost flex items-center gap-1.5 text-accent hover:bg-accent/10 whitespace-nowrap shrink-0"
              onClick={onOpenInCanvas}
              title="Open Pillar in Directive 2 Infinite Canvas"
            >
              <Layers size={13} /> Visual Canvas
            </button>
            <button
              className="btn btn-sm btn-ghost text-faint hover:text-danger"
              onClick={onDeleteDomain}
              title="Delete Pillar"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Philosophy / Manifesto Paragraph */}
        <div className="mt-4 border-t hairline pt-3">
          <div className="text-[0.72em] font-semibold uppercase tracking-wider text-faint mb-1.5">
            North-Star Philosophy & Focus Note
          </div>
          <textarea
            className="input w-full text-[0.85em] min-h-[64px] bg-surface/50 border hairline resize-y"
            value={domain.reflection}
            onChange={(e) => onUpdateDomain({ reflection: e.target.value })}
            placeholder="What is the north star for this pillar? What does optimal fulfillment look like?"
          />
        </div>
      </div>

      {/* 2. TACTILE FULFILLMENT SCRUBBER */}
      <div className="card p-5 border hairline">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[0.9em] font-semibold text-text">Tactile Fulfillment Scrubber</div>
            <div className="text-[0.74em] text-muted">
              Slide 1–10 satisfaction score vs target equilibrium ({domain.targetScore}/10)
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xl font-bold text-accent tabular">{domain.score}</span>
            <span className="text-[0.76em] text-faint">/ 10</span>
          </div>
        </div>

        {/* Minimal Horizontal Track with setPointerCapture */}
        <TactileScrubberTrack
          value={domain.score}
          targetValue={domain.targetScore}
          onChange={onUpdateScore}
        />
      </div>

      {/* 3. NUMBERED OPERATING PRINCIPLES */}
      <div className="card p-5 border hairline">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[0.9em] font-semibold text-text">Numbered Operating Principles</div>
            <div className="text-[0.74em] text-muted">
              Non-negotiable mental models and daily heuristics governing this pillar
            </div>
          </div>
          <span className="text-[0.74em] text-faint font-mono">{principles.length} rules</span>
        </div>

        <div className="flex flex-col gap-2">
          {principles.map((pr, idx) => {
            const numStr = (idx + 1).toString().padStart(2, "0");
            return (
              <div
                key={idx}
                className="group flex items-center justify-between rounded-xl bg-surface-2/40 px-3.5 py-2.5 text-[0.84em] transition hover:bg-surface-2/70"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-mono font-semibold text-accent/80 text-[0.82em]">
                    {numStr}
                  </span>
                  <input
                    type="text"
                    className="w-full bg-transparent text-text outline-none"
                    value={pr}
                    onChange={(e) => {
                      const updated = [...principles];
                      updated[idx] = e.target.value;
                      onUpdateDomain({ principles: updated });
                    }}
                  />
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 text-faint hover:text-danger transition-opacity ml-2 shrink-0"
                  onClick={() => onRemovePrinciple(idx)}
                  title="Remove principle"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}

          {/* Inline Add Principle Input */}
          <div className="flex items-center gap-2 rounded-xl border hairline bg-surface/50 px-3 py-2 mt-1">
            <span className="font-mono font-semibold text-faint text-[0.82em]">
              {(principles.length + 1).toString().padStart(2, "0")}
            </span>
            <input
              type="text"
              className="w-full bg-transparent text-[0.84em] text-text placeholder:text-muted/60 outline-none"
              placeholder="Add operating principle… (Enter)"
              value={newPrincipleText}
              onChange={(e) => setNewPrincipleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPrinciple();
              }}
            />
          </div>
        </div>
      </div>

      {/* 4. UNIFIED OUTCOMES STREAM (Goals, Projects, Habits & Tasks) */}
      <div className="card p-5 border hairline">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[0.95em] font-semibold text-text">Unified Outcomes Stream</div>
            <div className="text-[0.74em] text-muted">
              Strategic Goals linked directly to Active Projects, Daily Habits & Open Tasks
            </div>
          </div>
          <button
            className="btn btn-xs btn-ghost text-accent flex items-center gap-1"
            onClick={() => onAddGoal("New Milestone Goal")}
          >
            <Plus size={12} /> Add Goal
          </button>
        </div>

        {/* Goals List with Expandable Rows */}
        <div className="flex flex-col gap-3">
          {goals.map((g) => {
            const isExpanded = expandedGoalIds[g.id] ?? true;
            const linkedProjects = projects.filter((p) => p.goalId === g.id);
            const linkedHabits = habits.filter((h) => h.goalId === g.id);
            const linkedTasks = tasks.filter((t) => t.goalId === g.id);

            // Goal Progress Ring (Radius 10, Circumference ~62.8)
            const circ = 62.8;
            const dashoffset = circ - ((g.progress || 0) / 100) * circ;

            return (
              <div
                key={g.id}
                className="rounded-xl border hairline bg-surface-2/30 p-3.5 transition-all"
              >
                {/* Goal Top Row */}
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                    onClick={() => toggleGoalExpand(g.id)}
                  >
                    {/* Progress Ring */}
                    <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                      <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity="0.12"
                          strokeWidth="2.5"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeWidth="2.5"
                          strokeDasharray={circ}
                          strokeDashoffset={dashoffset}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute font-mono text-[9px] font-bold text-text tabular">
                        {g.progress}
                      </span>
                    </div>

                    <input
                      type="text"
                      className="bg-transparent font-semibold text-[0.9em] text-text outline-none flex-1 truncate hover:text-accent transition-colors"
                      value={g.title}
                      onChange={(e) => onUpdateGoal(g.id, { title: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-[0.7em] text-muted capitalize">
                      {g.timeframe || "quarterly"}
                    </span>
                    <button
                      className="text-faint hover:text-text"
                      onClick={() => toggleGoalExpand(g.id)}
                    >
                      <ChevronDown
                        size={15}
                        className={cn(
                          "transition-transform duration-200",
                          !isExpanded && "-rotate-90",
                        )}
                      />
                    </button>
                    <button
                      className="text-faint hover:text-danger"
                      onClick={() => onRemoveGoal(g.id)}
                      title="Remove Goal"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded Goal Details */}
                {isExpanded && (
                  <div className="mt-3 flex flex-col gap-3 border-t hairline pt-3 pl-8">
                    {/* 1. Linked Projects */}
                    {linkedProjects.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[0.7em] font-semibold uppercase tracking-wider text-faint">
                          Active Projects
                        </div>
                        {linkedProjects.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-lg bg-surface/50 px-2.5 py-1.5 text-[0.78em]"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Briefcase size={12} className="text-muted shrink-0" />
                              <span className="truncate text-text font-medium">{p.title}</span>
                            </div>
                            <button
                              className="text-faint hover:text-danger"
                              onClick={() => onRemoveProject(p.id)}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 2. Linked Habits (with clickable 7-day sparkline cells) */}
                    {linkedHabits.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[0.7em] font-semibold uppercase tracking-wider text-faint">
                          Daily Habits (7-Day Sparkline)
                        </div>
                        {linkedHabits.map((h) => (
                          <HabitSparklineRow key={h.id} habit={h} />
                        ))}
                      </div>
                    )}

                    {/* 3. Linked Open Tasks */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[0.7em] font-semibold uppercase tracking-wider text-faint">
                        Open Tasks ({linkedTasks.length})
                      </div>
                      {linkedTasks.map((t) => (
                        <div
                          key={t.id}
                          className="group flex items-center justify-between rounded-lg bg-surface/60 px-2.5 py-1.5 text-[0.8em]"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <button
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border hairline transition-all",
                                t.status === "done"
                                  ? "bg-accent text-accent-fg border-accent"
                                  : "border-border hover:border-accent hover:bg-accent/10 text-transparent hover:text-accent",
                              )}
                              onClick={() => onToggleTask(t.id)}
                              title={t.status === "done" ? "Mark open" : "Complete task"}
                            >
                              <Check size={11} className={t.status === "done" ? "text-accent-fg" : "opacity-0 group-hover:opacity-100"} />
                            </button>
                            <span className="truncate text-text">{t.title}</span>
                          </div>
                        </div>
                      ))}

                      {/* Add Task to Goal Inline */}
                      <GoalTaskAdder onAdd={(taskTitle) => onAddTask(taskTitle, g.id)} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Direct Pillar Focus & Tasks (for tasks, habits, projects not bound to a specific strategic goal) */}
          {hasUnlinkedItems && (
            <div className="rounded-xl border hairline bg-surface-2/30 p-3.5 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: domain.color || "var(--color-accent)" }}
                  />
                  <span className="text-[0.84em] font-semibold text-text">Direct Pillar Focus & Tasks</span>
                </div>
                <span className="text-[0.7em] text-muted font-mono">
                  {unlinkedTasks.length} tasks · {unlinkedHabits.length} habits · {unlinkedProjects.length} projects
                </span>
              </div>

              <div className="flex flex-col gap-3 pl-3 border-l hairline border-border/50">
                {/* Unlinked Projects */}
                {unlinkedProjects.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[0.7em] font-semibold uppercase tracking-wider text-faint">
                      Active Projects
                    </div>
                    {unlinkedProjects.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg bg-surface/50 px-2.5 py-1.5 text-[0.78em]"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Briefcase size={12} className="text-muted shrink-0" />
                          <span className="truncate text-text font-medium">{p.title}</span>
                        </div>
                        <button
                          className="text-faint hover:text-danger"
                          onClick={() => onRemoveProject(p.id)}
                          title="Remove Project"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unlinked Habits */}
                {unlinkedHabits.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[0.7em] font-semibold uppercase tracking-wider text-faint">
                      Daily Habits (7-Day Sparkline)
                    </div>
                    {unlinkedHabits.map((h) => (
                      <HabitSparklineRow key={h.id} habit={h} />
                    ))}
                  </div>
                )}

                {/* Unlinked Tasks */}
                {unlinkedTasks.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[0.7em] font-semibold uppercase tracking-wider text-faint">
                      Open Tasks ({unlinkedTasks.length})
                    </div>
                    {unlinkedTasks.map((t) => (
                      <div
                        key={t.id}
                        className="group flex items-center justify-between rounded-lg bg-surface/60 px-2.5 py-1.5 text-[0.8em]"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <button
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border hairline transition-all",
                              t.status === "done"
                                ? "bg-accent text-accent-fg border-accent"
                                : "border-border hover:border-accent hover:bg-accent/10 text-transparent hover:text-accent",
                            )}
                            onClick={() => onToggleTask(t.id)}
                            title={t.status === "done" ? "Mark open" : "Complete task"}
                          >
                            <Check size={11} className={t.status === "done" ? "text-accent-fg" : "opacity-0 group-hover:opacity-100"} />
                          </button>
                          <span className="truncate text-text">{t.title}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {goals.length === 0 && !hasUnlinkedItems && (
            <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-[0.8em] text-muted">
              No active outcomes anchored to this pillar yet. Create a strategic goal or add a direct daily task below.
            </div>
          )}

          {/* Quick-add bottom input */}
          <div className="flex items-center gap-2 rounded-xl border hairline bg-surface/50 px-3 py-2 mt-2">
            <Plus size={14} className="text-muted shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent text-[0.84em] text-text placeholder:text-muted/60 outline-none"
              placeholder="+ Add task or type 'goal: ...' to create goal (Enter)"
              value={quickAddInput}
              onChange={(e) => setQuickAddInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickAdd();
              }}
            />
          </div>
        </div>
      </div>

      {/* 5. WISDOM SHELF & SMART OBJECT CARDS */}
      <div className="card p-5 border hairline">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[0.95em] font-semibold text-text">Wisdom Shelf & Saved Vault</div>
            <div className="text-[0.74em] text-muted">
              Smart visual object cards for articles, quotes, colors & protocols
            </div>
          </div>
          <span className="text-[0.74em] text-faint font-mono">{resources.length} saved</span>
        </div>

        {/* Smart Object Cards Grid */}
        {resources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-[0.8em] text-muted">
            No wisdom resources saved for this pillar yet. Add an article link, quote, or color code
            below.
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {resources.map((r) => (
              <SmartObjectCard
                key={r.id}
                resource={r}
                content={r.content}
                title={r.title}
                url={r.url}
                author={r.author}
                onDelete={() => onRemoveResource(r.id)}
              />
            ))}
          </div>
        )}

        {/* Add Wisdom Input */}
        <div className="flex items-center gap-2 rounded-xl border hairline bg-surface/50 px-3 py-2 mt-3">
          <Bookmark size={14} className="text-muted shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent text-[0.84em] text-text placeholder:text-muted/60 outline-none"
            placeholder="Add wisdom, quote, #color, or URL… (Enter)"
            value={newWisdomInput}
            onChange={(e) => setNewWisdomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddWisdom();
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// COMPONENT: TACTILE SCRUBBER TRACK (1-10 Fulfillment Scrubber)
// ====================================================================
function TactileScrubberTrack({
  value,
  targetValue,
  onChange,
}: {
  value: number;
  targetValue: number;
  onChange: (val: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const updateFromPointer = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const score = Math.max(1, Math.min(10, Math.round(1 + ratio * 9)));
    onChange(score);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {}
    setIsScrubbing(true);
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isScrubbing) {
      updateFromPointer(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isScrubbing) {
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {}
      setIsScrubbing(false);
    }
  };

  const currentPercent = ((value - 1) / 9) * 100;
  const targetPercent = ((targetValue - 1) / 9) * 100;

  return (
    <div
      ref={trackRef}
      className="relative flex h-10 w-full cursor-ew-resize items-center touch-none py-2 select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Background Track */}
      <div className="relative h-2 w-full rounded-full bg-surface-2 overflow-hidden">
        {/* Fill */}
        <div
          className="h-full rounded-full bg-accent transition-all duration-75"
          style={{ width: `${currentPercent}%` }}
        />
      </div>

      {/* Target Marker Flag */}
      <div
        className="absolute top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none"
        style={{ left: `${targetPercent}%` }}
      >
        <span className="h-4 w-0.5 bg-muted/60" />
        <span className="text-[0.62em] font-mono text-muted/60 mt-0.5">T{targetValue}</span>
      </div>

      {/* Scrubber Thumb */}
      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md ring-4 ring-accent/20 transition-transform active:scale-125"
        style={{ left: `${currentPercent}%` }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />
      </div>
    </div>
  );
}

// ====================================================================
// COMPONENT: HABIT SPARKLINE ROW (7 Clickable Daily Cells)
// ====================================================================
function HabitSparklineRow({ habit }: { habit: Habit }) {
  const toggle = useHabits((s) => s.toggle);

  // Generate last 7 calendar days
  const last7Days = useMemo(() => {
    const now = new Date();
    const days: { key: string; dayLabel: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push({
        key: dateKey(d),
        dayLabel: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      });
    }
    return days;
  }, []);

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface/60 px-3 py-2 text-[0.8em]">
      <div className="flex items-center gap-2 truncate">
        <Flame size={13} className="text-accent shrink-0" />
        <span className="truncate text-text font-medium">{habit.name}</span>
      </div>

      {/* 7 Clickable sparkline cells */}
      <div className="flex items-center gap-1.5 shrink-0">
        {last7Days.map((day) => {
          const isDone = isDoneOn(habit, day.key);
          return (
            <button
              key={day.key}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md text-[0.68em] font-bold transition-all",
                isDone
                  ? "bg-accent text-accent-fg shadow-xs"
                  : "bg-surface-2 text-faint hover:border-accent/40 border hairline",
              )}
              onClick={() => toggle(habit.id, day.key)}
              title={`${day.key}: ${isDone ? "Done" : "Incomplete"}`}
            >
              {day.dayLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ====================================================================
// COMPONENT: INLINE GOAL TASK ADDER
// ====================================================================
function GoalTaskAdder({ onAdd }: { onAdd: (title: string) => void }) {
  const [val, setVal] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && val.trim()) {
      onAdd(val.trim());
      setVal("");
    }
  };

  return (
    <div className="flex items-center gap-1.5 pt-0.5">
      <Plus size={12} className="text-faint shrink-0" />
      <input
        type="text"
        className="w-full bg-transparent text-[0.78em] text-text placeholder:text-muted/50 outline-none"
        placeholder="+ Add task to goal… (Enter)"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
