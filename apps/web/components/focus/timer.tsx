"use client";

import { haptic } from "@/lib/client/haptics";
import type { FocusSettings, FocusState } from "@stellar/db";
import {
  formatClock,
  phaseDurationMs,
  phaseLabel,
  remainingMs,
  type TimerAction,
  type TimerPhase,
} from "@stellar/shared";
import { cx } from "@/components/ui/cx";
import { PauseIcon, PlayIcon, SkipIcon, StopIcon } from "@/components/ui/icons";
import { TimerRing } from "@/components/ui/timer-ring";
import { timerAction, toTimerSettings, toTimerState } from "@/lib/client/data/focus";
import { useTick } from "@/lib/client/data/hooks";

/**
 * Each phase has its own colour, from the sky's palette: gold for focus (the app's accent),
 * violet for a short break, pale blue for the long one. Class names are spelled out so the
 * stylesheet keeps them.
 */
const PHASES: {
  phase: TimerPhase;
  label: string;
  key: "focus_min" | "short_break_min" | "long_break_min";
  text: string;
  now: string;
  done: string;
  upcoming: string;
}[] = [
  {
    phase: "focus",
    label: "Focus",
    key: "focus_min",
    text: "text-accent",
    now: "bg-accent",
    done: "bg-accent/75",
    upcoming: "bg-accent/40",
  },
  {
    phase: "short_break",
    label: "Short break",
    key: "short_break_min",
    text: "text-violet",
    now: "bg-violet",
    done: "bg-violet/80",
    upcoming: "bg-violet/45",
  },
  {
    phase: "long_break",
    label: "Long break",
    key: "long_break_min",
    text: "text-azure",
    now: "bg-azure",
    done: "bg-azure/80",
    upcoming: "bg-azure/45",
  },
];
const LOOK = Object.fromEntries(PHASES.map((p) => [p.phase, p])) as Record<
  TimerPhase,
  (typeof PHASES)[number]
>;

/**
 * The whole Pomodoro cycle at a glance: focus, short break, focus, short break … focus,
 * long break. One bar per phase (long for focus, short for a break) in its phase's colour, lit
 * up to where the session is now, with the three phase lengths named underneath. Display only.
 */
export function PhaseStrip({ state, settings }: { state: FocusState; settings: FocusSettings }) {
  const rounds = Math.max(1, settings.rounds_before_long);
  // A break belongs to the round it follows.
  const round = Math.min(rounds, Math.max(1, ((state.round - 1) % rounds) + 1));
  const current = (round - 1) * 2 + (state.phase === "focus" ? 0 : 1);
  const started = state.status !== "idle";
  const steps = Array.from({ length: rounds * 2 }, (_, i) => {
    const phase: TimerPhase =
      i % 2 === 0 ? "focus" : i === rounds * 2 - 1 ? "long_break" : "short_break";
    return { phase, round: Math.floor(i / 2) + 1 };
  });
  return (
    <div className="w-full" data-testid="phase-strip">
      <ol aria-label="Pomodoro cycle" className="flex h-2.5 w-full items-center gap-1">
        {steps.map((step, i) => {
          const here = i === current;
          const done = started && i < current;
          return (
            <li
              key={i}
              aria-current={here ? "step" : undefined}
              aria-label={`${phaseLabel(step.phase)}, round ${step.round}${done ? ", done" : here ? ", current" : ""}`}
              title={`${phaseLabel(step.phase)} · round ${step.round}`}
              data-step={step.phase}
              data-state={here ? "current" : done ? "done" : "upcoming"}
              className={cx(
                "min-w-0 rounded-full transition-[background-color,height] duration-300",
                // The current phase is the thick, fully lit bar.
                here ? "h-2.5" : "h-1.5",
                step.phase === "focus"
                  ? "flex-[3]"
                  : step.phase === "long_break"
                    ? "flex-[2]"
                    : "flex-1",
                here
                  ? LOOK[step.phase].now
                  : done
                    ? LOOK[step.phase].done
                    : LOOK[step.phase].upcoming,
              )}
            />
          );
        })}
      </ol>
      <ul
        aria-label="Phase lengths in minutes"
        className="mt-2.5 flex w-full items-center justify-between gap-2 text-footnote"
      >
        {PHASES.map((p) => (
          <li
            key={p.phase}
            className={cx(
              "flex min-w-0 items-center gap-1 whitespace-nowrap transition-colors duration-200",
              state.phase === p.phase ? cx("font-medium", p.text) : "text-fg-2",
            )}
          >
            <span aria-hidden className={cx("size-2 shrink-0 rounded-full", p.now)} />
            <span className="truncate">{p.label}</span>
            <span className="tnum">{settings[p.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function spoken(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m} ${m === 1 ? "minute" : "minutes"} ${s} ${s === 1 ? "second" : "seconds"} remaining`;
}

export interface TimerFaceProps {
  state: FocusState;
  settings: FocusSettings;
  size?: number;
}

/** The ring with the remaining time, derived from phase_ends_at (the timer never ticks in the database). */
export function TimerFace({ state, settings, size = 300 }: TimerFaceProps) {
  const running = state.status === "running";
  const now = useTick(250, running);
  const timer = toTimerState(state);
  const cfg = toTimerSettings(settings);
  const total = state.phase_total_ms ?? phaseDurationMs(state.phase, cfg);
  // Never more than the phase is long: this device's guess at the start time and the
  // server's can differ by a moment, which showed "25:01" for an instant after Start.
  const remaining = Math.min(remainingMs(timer, now, cfg), total > 0 ? total : Infinity);
  const fraction =
    state.status === "idle" || state.status === "awaiting" ? 1 : total > 0 ? remaining / total : 0;
  const caption =
    state.status === "paused"
      ? "Paused"
      : state.status === "awaiting"
        ? "Ready when you are"
        : `Round ${state.round} of ${settings.rounds_before_long}`;

  return (
    <TimerRing
      fraction={fraction}
      label={`${phaseLabel(state.phase)}: ${spoken(remaining)}`}
      size={size}
      dimmed={state.status === "paused"}
    >
      <p className="eyebrow text-accent" data-testid="phase-label">
        {phaseLabel(state.phase)}
      </p>
      <p
        className="my-1 text-timer text-fg"
        style={{ fontSize: size < 280 ? 60 : undefined, lineHeight: 1.05 }}
        data-testid="timer-clock"
        aria-hidden="true"
      >
        {formatClock(remaining)}
      </p>
      <p className="text-subhead text-fg-2 tnum" data-testid="timer-caption">
        {caption}
      </p>
      {state.status === "paused" && (
        <p className="sr-only">
          Round {state.round} of {settings.rounds_before_long}
        </p>
      )}
    </TimerRing>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  children,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => {
        haptic();
        onClick();
      }}
      className={cx(
        "flex items-center justify-center rounded-full transition-[transform,background-color,opacity] duration-100 ease-out active:scale-[0.94] disabled:opacity-35 disabled:active:scale-100",
        primary
          ? "glow size-[84px] bg-accent text-accent-ink hover:brightness-105"
          : "glass size-14 text-fg hover:bg-[rgba(40,34,84,0.6)]",
      )}
    >
      {children}
    </button>
  );
}

/** End (stop square), Start / Pause (the big gold button), Skip. */
export function TimerControls({ state }: { state: FocusState }) {
  const main: { action: TimerAction; label: string } =
    state.status === "running"
      ? { action: "pause", label: "Pause" }
      : state.status === "paused"
        ? { action: "resume", label: "Resume" }
        : {
            action: "start",
            label:
              state.status === "awaiting"
                ? `Start ${phaseLabel(state.phase).toLowerCase()}`
                : "Start focus",
          };
  const idle = state.status === "idle";
  return (
    <div className="flex items-center justify-center gap-7" data-testid="timer-controls">
      <RoundButton label="End session" disabled={idle} onClick={() => timerAction("end")}>
        <StopIcon size={22} />
      </RoundButton>
      <RoundButton label={main.label} primary onClick={() => timerAction(main.action)}>
        {state.status === "running" ? (
          <PauseIcon size={34} />
        ) : (
          <PlayIcon size={34} className="translate-x-[2px]" />
        )}
      </RoundButton>
      <RoundButton label="Skip phase" disabled={idle} onClick={() => timerAction("skip")}>
        <SkipIcon size={22} />
      </RoundButton>
    </div>
  );
}
