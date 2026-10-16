import { memo, useEffect, useRef, useState } from "react";

interface RollingDigitProps {
  char: string;
  height?: number;
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const SingleDigit = memo(function SingleDigit({ char, height = 24 }: RollingDigitProps) {
  const isDigit = /[0-9]/.test(char);
  const prevCharRef = useRef(char);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (prevCharRef.current !== char) {
      setAnimating(true);
      const timer = window.setTimeout(() => setAnimating(false), 240);
      prevCharRef.current = char;
      return () => window.clearTimeout(timer);
    }
  }, [char]);

  if (!isDigit) {
    return (
      <span
        className="inline-flex items-center justify-center font-mono opacity-80"
        style={{ width: "0.55em", height }}
      >
        {char}
      </span>
    );
  }

  const num = parseInt(char, 10);

  return (
    <span
      className="relative inline-block overflow-hidden font-mono"
      style={{
        height,
        width: "0.62em",
        lineHeight: `${height}px`,
        verticalAlign: "middle",
      }}
    >
      <span
        className="flex flex-col transition-transform"
        style={{
          transform: `translateY(-${num * height}px)`,
          transitionDuration: "240ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          filter: animating ? "blur(0.5px)" : "none",
        }}
      >
        {DIGITS.map((d) => (
          <span
            key={d}
            className="flex items-center justify-center tabular-nums select-none"
            style={{ height }}
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  );
});

export const RollingDigits = memo(function RollingDigits({
  value,
  height = 24,
  className = "",
}: {
  value: string;
  height?: number;
  className?: string;
}) {
  const chars = value.split("");

  return (
    <div
      className={`inline-flex items-center tabular-nums select-none ${className}`}
      style={{ height }}
      aria-label={value}
    >
      {chars.map((c, i) => (
        <SingleDigit key={`${i}-${c === ":" ? "colon" : "digit"}`} char={c} height={height} />
      ))}
    </div>
  );
});
