import type { ReactNode } from "react";
import { cx } from "./cx";

export interface TimerRingProps {
  /** Fraction of the phase remaining, 1 → 0. The ring empties clockwise from 12 o'clock. */
  fraction: number;
  /** Accessible description, e.g. "22 minutes 57 seconds remaining". */
  label: string;
  size?: number;
  stroke?: number;
  /** Dim the ring while paused or waiting. */
  dimmed?: boolean;
  children: ReactNode;
  className?: string;
}

/** 300px ring, 6px stroke, Starlight Gold with a drop-shadow glow. The one glowing thing on the Focus view. */
export function TimerRing({
  fraction,
  label,
  size = 300,
  stroke = 6,
  dimmed,
  children,
  className,
}: TimerRingProps) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const r = (size - stroke) / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="timer"
      aria-label={label}
      className={cx("relative flex items-center justify-center", className)}
      style={{ width: size, height: size, maxWidth: "100%" }}
      data-testid="timer-ring"
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 size-full -rotate-90 transition-opacity duration-300"
        style={{
          filter: "drop-shadow(0 0 14px var(--sp-accent-glow))",
          opacity: dimmed ? 0.55 : 1,
        }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="rgba(46,30,120,0.18)"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--sp-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          style={{ transition: "stroke-dashoffset 300ms linear" }}
        />
      </svg>
      <div className="relative flex flex-col items-center text-center">{children}</div>
    </div>
  );
}
