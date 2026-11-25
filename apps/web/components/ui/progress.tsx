import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

function pct(value: number): number {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
}

export interface ProgressBarProps {
  /**
   * 0…1, and past 1 (up to 3) for something taken beyond its goal: the bar then laps itself
   * in a new colour and gains a growing glow, a comet and stars (see `.sp-over` in globals.css).
   */
  value: number;
  label: string;
  tone?: "accent" | "violet" | "white";
  /** Classes for the outer element: margins and flex sizing. */
  className?: string;
  /** Text read by screen readers instead of the percentage, e.g. "5 of 8 glasses". */
  valueText?: string;
  /** A CSS colour for the fill, in place of `tone`. */
  color?: string;
  /** `md` is the 8px bar used for a summary. */
  size?: "sm" | "md";
}

const TONE = { accent: "bg-accent", violet: "bg-violet", white: "bg-fg" } as const;

/** Past the goal: the colour of each lap, its name, and how many stars it earns. */
const LAPS = [
  { name: "Beyond", color: "var(--sp-success)" },
  { name: "Stellar", color: "var(--sp-violet)" },
  { name: "Supernova", color: "var(--sp-azure)" },
] as const;
const STARS = ["left-[18%]", "left-[52%]", "left-[86%]"] as const;

/** Rounded progress bar. Fills animate over 350ms. */
export function ProgressBar({
  value,
  label,
  tone = "accent",
  className,
  valueText,
  color,
  size = "sm",
}: ProgressBarProps) {
  const raw = Number.isFinite(value) ? Math.max(0, value) : 0;
  const p = pct(raw);
  // 0 at the goal, 1 at twice it, 2 at three times it (the most the bar shows).
  const extra = Math.min(2, Math.max(0, raw - 1));
  const tier = extra <= 0.004 ? 0 : extra >= 2 ? 3 : extra >= 1 ? 2 : 1;
  const lap = tier ? LAPS[tier - 1]! : null;
  const shown = Math.round(Math.min(3, raw) * 100);
  const fill =
    "absolute inset-y-0 left-0 rounded-full transition-[width] duration-[350ms] ease-out";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-valuetext={valueText ?? `${tier ? shown : p}%`}
      data-over={tier || undefined}
      className={cx("flex w-full items-center gap-2", className)}
      style={
        lap
          ? ({ "--lap": lap.color, "--over": (extra / 2).toFixed(3) } as CSSProperties)
          : undefined
      }
    >
      <div
        className={cx(
          "relative min-w-0 flex-1 rounded-full bg-track",
          size === "md" ? "h-2" : "h-1.5",
          // Thicker under a thumb than under a cursor once it is something to show off.
          lap && (size === "md" ? "sp-over h-2.5 md:h-2" : "sp-over h-2 md:h-1.5"),
        )}
      >
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className={cx(fill, "transition-[width,background-color]", !color && TONE[tone])}
            style={{ width: `${p}%`, backgroundColor: color }}
          />
          {lap && (
            <>
              {/* Each lap is drawn over the one before: green over gold, violet over green. */}
              <div
                className={fill}
                style={{ width: `${Math.min(1, extra) * 100}%`, background: LAPS[0].color }}
              />
              {tier >= 2 && (
                <div
                  className={fill}
                  style={{ width: `${(extra - 1) * 100}%`, background: LAPS[1].color }}
                />
              )}
              {tier === 3 && (
                <div className={cx(fill, "w-full")} style={{ background: LAPS[2].color }} />
              )}
              <span className="sp-over__comet" aria-hidden="true" />
            </>
          )}
        </div>
        {lap &&
          STARS.slice(0, tier).map((at, i) => (
            <span
              key={at}
              aria-hidden="true"
              className={cx("sp-over__star", at)}
              style={{ animationDelay: `${i * 0.5}s` }}
            />
          ))}
      </div>
      {lap && (
        <span
          className="shrink-0 whitespace-nowrap text-caption font-semibold tnum text-(--lap)"
          data-testid="over-badge"
          aria-hidden="true"
        >
          {/* A phone has room for the number; a desktop row also names the lap. */}
          <span className="hidden md:inline">{lap.name} · </span>
          {shown}%
        </span>
      )}
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
