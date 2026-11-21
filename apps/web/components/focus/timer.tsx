"use client";

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

const PHASES: {
  phase: TimerPhase;
  label: string;
  key: "focus_min" | "short_break_min" | "long_break_min";
}[] = [
  { phase: "focus", label: "Focus", key: "focus_min" },
  { phase: "short_break", label: "Short break", key: "short_break_min" },
  { phase: "long_break", label: "Long break", key: "long_break_min" },
];

/** Focus 25 · Short break 5 · Long break 15, with the current phase highlighted. Display only. */
export function PhaseStrip({ state, settings }: { state: FocusState; settings: FocusSettings }) {
  return (
    <ol
      aria-label="Phases"
      className="glass flex w-full rounded-button p-[3px]"
      data-testid="phase-strip"
    >
      {PHASES.map((p) => {
        const active = state.phase === p.phase;
        return (
          <li
            key={p.phase}
            aria-current={active ? "step" : undefined}
            className={cx(
              "flex h-[38px] min-w-0 flex-1 items-center justify-center gap-1 rounded-thumb px-2 text-[15px] font-medium transition-colors duration-200",
              active ? "bg-fill-thumb text-fg" : "text-fg-2",
            )}
          >
            <span className="truncate">{p.label}</span>
            <span className="tnum">{settings[p.key]}</span>
          </li>
        );
      })}
    </ol>
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
  const remaining = remainingMs(timer, now, cfg);
  const total = state.phase_total_ms ?? phaseDurationMs(state.phase, cfg);
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
      onClick={onClick}
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
