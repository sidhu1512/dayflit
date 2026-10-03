export function ProgressRing({ size = 120, stroke = 6, progress, children, color, trackClass = "ring-track", animate = true }: {
  size?: number;
  stroke?: number;
  progress: number;
  children?: React.ReactNode;
  color?: string;
  trackClass?: string;
  animate?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" className={trackClass} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          className={color ? undefined : "ring-fill"}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={animate ? undefined : { transition: "none" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
