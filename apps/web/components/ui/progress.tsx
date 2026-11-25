import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

function pct(value: number): number {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
}

export interface ProgressBarProps {
  /** 0…1 */
  value: number;
  label: string;
  tone?: "accent" | "violet" | "white";
  className?: string;
  /** Text read by screen readers instead of the percentage, e.g. "5 of 8 glasses". */
  valueText?: string;
  /** A CSS colour for the fill, in place of `tone`. */
  color?: string;
}

const TONE = { accent: "bg-accent", violet: "bg-violet", white: "bg-fg" } as const;

/** 6px rounded progress bar. Fills animate over 350ms. */
export function ProgressBar({
  value,
  label,
  tone = "accent",
  className,
  valueText,
  color,
}: ProgressBarProps) {
  const p = pct(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-valuetext={valueText ?? `${p}%`}
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-track", className)}
    >
      <div
        className={cx(
          "h-full rounded-full transition-[width,background-color] duration-[350ms] ease-out",
          !color && TONE[tone],
        )}
        style={{ width: `${p}%`, backgroundColor: color }}
      />
    </div>
  );
}

export interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
  glow?: boolean;
  className?: string;
  trackOpacity?: number;
  /** A CSS colour for the arc; the accent by default. */
  color?: string;
}

/** Circular progress drawn clockwise from 12 o'clock. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  label,
  children,
  glow,
  className,
  trackOpacity = 0.1,
  color = "var(--sp-accent)",
}: ProgressRingProps) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cx("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        style={glow ? { filter: "drop-shadow(0 0 6px var(--sp-accent-glow))" } : undefined}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`rgba(255,255,255,${trackOpacity})`}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="transition-[stroke-dashoffset,stroke] duration-[350ms] ease-out"
          style={{ stroke: color }}
        />
      </svg>
      {children && <span className="relative">{children}</span>}
    </div>
  );
}

export interface DayRingProps {
  day: number;
  /** 0…1, or null when nothing is scheduled (no ring). */
  value: number | null;
  /** Today is a filled gold circle. */
  today?: boolean;
  /** Future days show no ring. */
  future?: boolean;
  selected?: boolean;
  size?: number;
}

/** A date inside a conic ring showing that day's completion. 100% days glow. */
export function DayRing({ day, value, today, future, selected, size = 36 }: DayRingProps) {
  const show = value !== null && !future;
  const v = show ? Math.min(1, Math.max(0, value)) : 0;
  const complete = show && v >= 0.999;
  const ring: CSSProperties = show
    ? { background: `conic-gradient(var(--sp-accent) ${v * 360}deg, rgba(255,255,255,0.10) 0deg)` }
    : {};
  return (
    <span
      className={cx(
        "relative inline-flex items-center justify-center rounded-full tnum",
        selected && !today && "outline-2 outline-offset-2 outline-accent/70",
      )}
      style={{
        width: size,
        height: size,
        ...ring,
        boxShadow: complete || today ? "0 0 14px var(--sp-accent-glow)" : undefined,
      }}
    >
      <span
        className={cx(
          "flex items-center justify-center rounded-full text-[14px] font-medium leading-none",
          today
            ? "bg-accent font-semibold text-accent-ink"
            : show
              ? "bg-[#14112e] text-fg"
              : "text-fg-2",
        )}
        style={{ width: today ? size : size - 6, height: today ? size : size - 6 }}
      >
        {day}
      </span>
    </span>
  );
}
