import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Info,
  PieChart,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  calculateAverageScore,
  calculateBalanceIndex,
  calculateDomainDeltas,
} from "@/stores/life";
import { dateKey } from "@/lib/dates";
import { cn } from "@/lib/ids";
import type { LifeDomain, WheelAssessment } from "@/lib/types";

export interface LifeRadarInstrumentProps {
  domains: LifeDomain[];
  assessments: WheelAssessment[];
  onUpdateScore: (domainId: string, score: number) => void;
  onSelectDomain: (domain: LifeDomain) => void;
  onSaveSnapshot: (notes?: string) => void;
  onRemoveAssessment: (id: string) => void;
  onBridgeGap?: (domain: LifeDomain) => void;
}

export function LifeRadarInstrument({
  domains,
  assessments,
  onUpdateScore,
  onSelectDomain,
  onSaveSnapshot,
  onRemoveAssessment,
  onBridgeGap,
}: LifeRadarInstrumentProps) {
  // Sort assessments by date ascending for the time machine
  const sortedAssessments = useMemo(() => {
    return [...assessments].sort((a, b) => {
      const tA = a.createdAt || new Date(a.date).getTime() || 0;
      const tB = b.createdAt || new Date(b.date).getTime() || 0;
      return tA - tB;
    });
  }, [assessments]);

  // Continuous scrubber position: 0 to Math.max(0, totalSnapshots - 1)
  const totalSnapshots = sortedAssessments.length;
  const [scrubberPos, setScrubberPos] = useState<number>(() => {
    return totalSnapshots > 0 ? totalSnapshots - 1 : 0;
  });

  // Keep scrubber at latest when new snapshots are recorded
  useEffect(() => {
    if (totalSnapshots > 0 && scrubberPos > totalSnapshots - 1) {
      setScrubberPos(totalSnapshots - 1);
    }
  }, [totalSnapshots, scrubberPos]);

  const activeIndex = Math.max(0, Math.min(totalSnapshots - 1, Math.round(scrubberPos)));
  const activeSnapshot = sortedAssessments[activeIndex] ?? null;

  // Domain score map for current live state
  const currentScores = useMemo(() => {
    const map: Record<string, number> = {};
    domains.forEach((d) => {
      map[d.id] = d.score;
    });
    return map;
  }, [domains]);

  const currentAvg = calculateAverageScore(currentScores);
  const currentBalance = calculateBalanceIndex(currentScores);

  // Score deltas between current and active historical snapshot
  const deltas = useMemo(() => {
    return calculateDomainDeltas(currentScores, activeSnapshot?.scores);
  }, [currentScores, activeSnapshot]);

  // Inline Snapshot Creation
  const [isRecording, setIsRecording] = useState(false);
  const [snapshotNotes, setSnapshotNotes] = useState("");

  const handleRecordSnapshot = () => {
    if (!snapshotNotes.trim() && !isRecording) {
      setIsRecording(true);
      return;
    }
    onSaveSnapshot(snapshotNotes);
    setSnapshotNotes("");
    setIsRecording(false);
    setScrubberPos(totalSnapshots);
  };

  // Radar geometry
  const size = 360;
  const center = size / 2;
  const radius = 120;
  const count = domains.length;
  const angleStep = count > 0 ? (2 * Math.PI) / count : 0;
  const rings = [2, 4, 6, 8, 10];

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [hoveredDomainId, setHoveredDomainId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Current score points
  const points = domains.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (d.score / 10) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y, domain: d, angle };
  });

  const polygonPath = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Ghost polygon points (Historical Snapshot with continuous linear morphing)
  const ghostPoints = useMemo(() => {
    if (totalSnapshots === 0) return null;
    if (totalSnapshots === 1) {
      const snap = sortedAssessments[0];
      return domains.map((d, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const pastScore = snap?.scores[d.id] ?? d.score;
        const r = (pastScore / 10) * radius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return { x, y, pastScore };
      });
    }

    const idxA = Math.floor(scrubberPos);
    const idxB = Math.min(totalSnapshots - 1, idxA + 1);
    const t = scrubberPos - idxA;

    const snapA = sortedAssessments[idxA];
    const snapB = sortedAssessments[idxB];

    return domains.map((d, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const scoreA = snapA?.scores[d.id] ?? d.score;
      const scoreB = snapB?.scores[d.id] ?? d.score;
      const interpolatedScore = scoreA + (scoreB - scoreA) * t;
      const r = (interpolatedScore / 10) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { x, y, pastScore: Math.round(interpolatedScore * 10) / 10 };
    });
  }, [totalSnapshots, sortedAssessments, scrubberPos, domains, angleStep, radius, center]);

  const ghostPolygonPath = ghostPoints ? ghostPoints.map((p) => `${p.x},${p.y}`).join(" ") : null;

  // Pointer drag along spoke
  const updateScoreAtPointer = (domainId: string, clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const domIndex = domains.findIndex((d) => d.id === domainId);
    if (domIndex === -1) return;

    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;

    const dx = (clientX - rect.left) * scaleX - center;
    const dy = (clientY - rect.top) * scaleY - center;

    const angle = domIndex * angleStep - Math.PI / 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const proj = dx * cosA + dy * sinA;
    const score = Math.max(1, Math.min(10, Math.round((proj / radius) * 10)));
    onUpdateScore(domainId, score);
  };

  const handlePointerDown = (domainId: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {}
    setActiveDragId(domainId);
    updateScoreAtPointer(domainId, e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeDragId) {
      updateScoreAtPointer(activeDragId, e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDragId) {
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {}
      setActiveDragId(null);
    }
  };

  // Scrubber track pointer capture
  const scrubberTrackRef = useRef<HTMLDivElement | null>(null);
  const [scrubberDragging, setScrubberDragging] = useState(false);

  const handleScrubberPointer = (clientX: number) => {
    if (!scrubberTrackRef.current || totalSnapshots <= 1) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const continuousPos = ratio * (totalSnapshots - 1);
    setScrubberPos(continuousPos);
  };

  const handleScrubberPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {}
    setScrubberDragging(true);
    handleScrubberPointer(e.clientX);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent) => {
    if (scrubberDragging) {
      handleScrubberPointer(e.clientX);
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent) => {
    if (scrubberDragging) {
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {}
      setScrubberDragging(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 anim-fade select-none">
      {/* Precision Instrument Stage */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Radar Wheel Canvas Card */}
        <div className="card flex flex-col items-center justify-between p-6 lg:col-span-7">
          <div className="w-full flex items-center justify-between border-b hairline pb-3">
            <div>
              <div className="text-[1.05em] font-semibold tracking-tight text-text">
                Precision Life Instrument
              </div>
              <div className="text-[0.74em] text-muted">
                10-spoke radial equilibrium · Drag handles along spokes to tune fulfillment
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-[0.72em] font-bold text-accent">
              <span>Equilibrium {currentBalance.score}/10</span>
            </div>
          </div>

          {/* SVG Radar Instrument */}
          <div className="relative my-4 flex items-center justify-center">
            <svg
              ref={svgRef}
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className={cn(
                "overflow-visible select-none touch-none",
                activeDragId ? "cursor-grabbing" : "cursor-default",
              )}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {/* Concentric Polygonal Grid Rings (1px hairline, 10% opacity) */}
              {rings.map((rVal) => {
                const ringRadius = (rVal / 10) * radius;
                const ringPoints = Array.from({ length: count }, (_, i) => {
                  const a = i * angleStep - Math.PI / 2;
                  return `${center + ringRadius * Math.cos(a)},${center + ringRadius * Math.sin(a)}`;
                }).join(" ");

                return (
                  <polygon
                    key={rVal}
                    points={ringPoints}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeWidth={1}
                  />
                );
              })}

              {/* Radial Spokes (1px hairline, 10% opacity) */}
              {domains.map((_, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const x2 = center + radius * Math.cos(angle);
                const y2 = center + radius * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1={center}
                    y1={center}
                    x2={x2}
                    y2={y2}
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeWidth={1}
                  />
                );
              })}

              {/* Ghost Polygon (Historical Assessment Time-Machine) */}
              {ghostPolygonPath && (
                <polygon
                  points={ghostPolygonPath}
                  fill="currentColor"
                  fillOpacity={0.04}
                  stroke="currentColor"
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  className="transition-all duration-200"
                />
              )}

              {/* Primary Active Polygon (--accent fill & stroke) */}
              {polygonPath && (
                <polygon
                  points={polygonPath}
                  fill="var(--color-accent)"
                  fillOpacity={0.16}
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  className="transition-all duration-75"
                />
              )}

              {/* Ghost vertices */}
              {ghostPoints &&
                ghostPoints.map((gp, i) => (
                  <circle
                    key={`ghost-${i}`}
                    cx={gp.x}
                    cy={gp.y}
                    r={2.5}
                    fill="currentColor"
                    fillOpacity={0.5}
                  />
                ))}

              {/* Active Spoke Vertex Handles */}
              {points.map((p, i) => {
                const isHovered = hoveredDomainId === p.domain.id;
                const isDragging = activeDragId === p.domain.id;

                // Spoke label coordinates
                const labelRadius = radius + 22;
                const lx = center + labelRadius * Math.cos(p.angle);
                const ly = center + labelRadius * Math.sin(p.angle);

                let textAnchor: "start" | "end" | "middle" = "middle";
                if (Math.cos(p.angle) > 0.3) textAnchor = "start";
                else if (Math.cos(p.angle) < -0.3) textAnchor = "end";

                return (
                  <g key={p.domain.id}>
                    {/* Vertex draggable ring handle */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isDragging ? 7.5 : isHovered ? 6 : 4.5}
                      fill="var(--color-accent)"
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                      className="cursor-pointer transition-transform shadow-sm"
                      onPointerDown={(e) => handlePointerDown(p.domain.id, e)}
                      onPointerEnter={() => setHoveredDomainId(p.domain.id)}
                      onPointerLeave={() => setHoveredDomainId(null)}
                    />

                    {/* Interactive Spoke Label */}
                    <text
                      x={lx}
                      y={ly}
                      textAnchor={textAnchor}
                      dominantBaseline="central"
                      className="cursor-pointer font-medium text-[11px] transition-colors"
                      fill={isHovered || isDragging ? "var(--color-accent)" : "currentColor"}
                      opacity={isHovered || isDragging ? 1 : 0.75}
                      onClick={() => onSelectDomain(p.domain)}
                    >
                      {p.domain.name}
                      <tspan
                        dx={4}
                        fill="var(--color-accent)"
                        fontWeight="bold"
                        opacity={0.9}
                      >
                        {p.domain.score}
                      </tspan>
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Wheel Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 border-t hairline pt-3 text-[0.74em] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span>Current Score ({currentAvg}/10)</span>
            </span>
            {activeSnapshot && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-dashed border-muted" />
                <span>Ghost Snapshot ({activeSnapshot.overallScore}/10)</span>
              </span>
            )}
            <span className="text-faint">· Drag handles along spokes to adjust</span>
          </div>
        </div>

        {/* Right Diagnostics & Delta Card */}
        <div className="card flex flex-col justify-between p-6 lg:col-span-5">
          <div className="flex flex-col gap-4">
            <div className="border-b hairline pb-3">
              <div className="text-[1.05em] font-semibold tracking-tight text-text">
                Equilibrium Diagnostics
              </div>
              <div className="text-[0.74em] text-muted">
                {currentBalance.label} · Variance {currentBalance.variance}
              </div>
            </div>

            {/* Score Comparison vs Historical Snapshot */}
            <div className="flex flex-col gap-2">
              <div className="text-[0.72em] font-semibold uppercase tracking-wider text-faint">
                Pillar Fulfillment vs {activeSnapshot ? activeSnapshot.date : "Baseline"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {domains.map((d) => {
                  const delta = deltas[d.id] ?? 0;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-xl bg-surface-2/50 px-2.5 py-1.5 text-[0.76em]"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="truncate text-text font-medium">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-1 tabular font-bold shrink-0">
                        <span className="text-text">{d.score}</span>
                        {delta !== 0 && (
                          <span
                            className={cn(
                              "text-[0.85em]",
                              delta > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]",
                            )}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reflection Notes from Active Snapshot */}
            {activeSnapshot?.reflectionNotes && (
              <div className="rounded-xl border hairline bg-surface/50 p-3 text-[0.78em] text-muted italic">
                “{activeSnapshot.reflectionNotes}”
              </div>
            )}
          </div>

          {/* Record Snapshot Action */}
          <div className="border-t hairline pt-4 mt-4">
            {isRecording ? (
              <div className="flex flex-col gap-2">
                <textarea
                  className="input w-full text-[0.8em] min-h-[60px]"
                  placeholder="Record reflection note for this snapshot (optional)…"
                  value={snapshotNotes}
                  onChange={(e) => setSnapshotNotes(e.target.value)}
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="btn btn-xs btn-ghost text-muted"
                    onClick={() => {
                      setIsRecording(false);
                      setSnapshotNotes("");
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-xs btn-primary" onClick={handleRecordSnapshot}>
                    Save Snapshot
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[0.74em] text-faint">
                  {totalSnapshots} historical assessments logged
                </span>
                <button
                  className="btn btn-sm btn-primary flex items-center gap-1.5"
                  onClick={() => setIsRecording(true)}
                >
                  <Plus size={13} /> Save Assessment Snapshot
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* INTERACTIVE HORIZONTAL TIME-MACHINE SCRUBBER                        */}
      {/* ==================================================================== */}
      {totalSnapshots > 0 && (
        <div className="card flex flex-col gap-3 p-4 border hairline">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={15} className="text-accent" />
              <span className="text-[0.88em] font-semibold text-text">
                Time-Machine Evolution Scrubber
              </span>
              <span className="text-[0.74em] text-muted">
                Drag horizontally to watch your life balance morph across past assessments
              </span>
            </div>

            {activeSnapshot && (
              <div className="flex items-center gap-2 text-[0.76em]">
                <span className="rounded-md bg-surface-2 px-2 py-0.5 font-medium text-text">
                  Snapshot: {activeSnapshot.date}
                </span>
                <span className="text-muted">· Score: {activeSnapshot.overallScore}/10</span>
                {totalSnapshots > 1 && (
                  <button
                    className="btn btn-xs btn-ghost text-faint hover:text-danger"
                    onClick={() => onRemoveAssessment(activeSnapshot.id)}
                    title="Delete snapshot"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Scrubber Track */}
          <div
            ref={scrubberTrackRef}
            className="relative flex h-8 w-full cursor-ew-resize items-center touch-none py-1 select-none"
            onPointerDown={handleScrubberPointerDown}
            onPointerMove={handleScrubberPointerMove}
            onPointerUp={handleScrubberPointerUp}
            onPointerCancel={handleScrubberPointerUp}
          >
            {/* Horizontal Guide Line */}
            <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-accent/40 rounded-full transition-all duration-75"
                style={{
                  width: `${totalSnapshots > 1 ? (scrubberPos / (totalSnapshots - 1)) * 100 : 100}%`,
                }}
              />
            </div>

            {/* Historical Notch Markers */}
            {sortedAssessments.map((a, idx) => {
              const pct = (idx / (totalSnapshots - 1 || 1)) * 100;
              const isNearest = activeIndex === idx;

              return (
                <div
                  key={a.id}
                  className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  style={{ left: `${pct}%` }}
                >
                  <div
                    className={cn(
                      "rounded-full transition-all duration-150",
                      isNearest
                        ? "h-3.5 w-3.5 bg-accent ring-2 ring-accent/30"
                        : "h-2 w-2 bg-muted/60",
                    )}
                  />
                  <span className="mt-1.5 text-[0.68em] text-muted/70 tabular">
                    {a.date.slice(5)}
                  </span>
                </div>
              );
            })}

            {/* Tactile Gliding Thumb Indicator */}
            {totalSnapshots > 1 && (
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md ring-4 ring-accent/20 transition-transform active:scale-125 pointer-events-none"
                style={{
                  left: `${(scrubberPos / (totalSnapshots - 1)) * 100}%`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
