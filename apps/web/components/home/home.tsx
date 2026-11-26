"use client";

import {
  formatDuration,
  formatLongDate,
  greetingFor,
  isBlockingActive,
  nextDue,
  todayIn,
  todayStats,
  zonedParts,
} from "@stellar/shared";
import { sendStageInput } from "@stellar/universe/state";
import Link from "next/link";
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { TaskRow } from "@/components/tasks/task-row";
import { cx } from "@/components/ui/cx";
import { GlassCard } from "@/components/ui/glass-card";
import { GearIcon } from "@/components/ui/icons";
import { useMounted } from "@/components/ui/use-media";
import { withLingering } from "@/lib/client/complete";
import { useCollection, useFocus, useMinute, useTimeZone, useToday } from "@/lib/client/data/hooks";
import { dayFraction } from "@/lib/client/data/routines";
import { serverNow } from "@/lib/client/session";
import { useUi } from "@/lib/client/ui-store";

function StatTile({
  label,
  compact,
  children,
}: {
  label: string;
  /** Long values (three-digit counts) step down a size so they fit on a 320px phone. */
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-[14px] bg-fill-subtle px-2.5 py-2.5 min-[360px]:px-3">
      <p className="text-caption text-fg-2">{label}</p>
      <p
        className={cx(
          "mt-0.5 truncate font-semibold leading-6 tracking-[-0.01em] text-fg tnum",
          compact ? "text-[16px] min-[360px]:text-[20px]" : "text-[20px]",
        )}
      >
        {children}
      </p>
    </div>
  );
}

const small = "text-[13px] font-medium text-fg-2";

/** Universe home: greeting and the glass Today card over the interactive galaxy. */
export function Home() {
  // The "Add to Home Screen" hint only exists for iOS Safari, so only iOS fetches it, and
  // straight away rather than when idle (it is the largest text on a first visit).
  const [Hint, setHint] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!/iP(hone|ad|od)/.test(navigator.userAgent)) return;
    void import("@/components/shell/install-hint")
      .then((m) => setHint(() => m.InstallHint))
      .catch(() => {});
  }, []);
  const mounted = useMounted();
  const tz = useTimeZone();
  const today = useToday();
  const minute = useMinute();
  const { rows: tasks, loading: tasksLoading } = useCollection("sp_tasks");
  const { rows: routines, loading: routinesLoading } = useCollection("sp_routines");
  const { rows: logs } = useCollection("sp_routine_logs");
  const { rows: sessions } = useCollection("sp_focus_sessions");
  const focus = useFocus();
  const lingering = useUi((s) => s.lingering);

  const now = minute || serverNow();
  const hour = zonedParts(now, tz).hour;

  const upcoming = useMemo(
    () => nextDue(withLingering(tasks, lingering), today, 3),
    [tasks, lingering, today],
  );
  const stats = useMemo(() => {
    const doneToday = new Set(
      tasks
        .filter(
          (t) => t.completed && t.completed_at && todayIn(tz, Date.parse(t.completed_at)) === today,
        )
        .map((t) => t.id),
    );
    return todayStats(tasks, today, doneToday);
  }, [tasks, today, tz]);

  // Recomputed whenever routines or logs change.
  const routinesFraction = useMemo(() => dayFraction(today), [today, routines, logs]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusMinutes = useMemo(() => {
    let seconds = 0;
    for (const s of sessions) {
      if (s.phase === "focus" && todayIn(tz, Date.parse(s.ended_at)) === today)
        seconds += s.actual_seconds;
    }
    const state = focus?.state;
    if (state && state.phase === "focus" && isBlockingActive(state) && state.phase_total_ms) {
      const remaining =
        state.status === "running" && state.phase_ends_at
          ? Math.max(0, Date.parse(state.phase_ends_at) - now)
          : (state.paused_remaining_ms ?? 0);
      seconds += Math.max(0, state.phase_total_ms - remaining) / 1000;
    }
    return seconds / 60;
  }, [sessions, focus, tz, today, now]);

  return (
    <main
      className="relative flex min-h-dvh flex-col px-safe"
      style={{
        paddingTop: "calc(max(16px, var(--sat)) + 20px)",
        paddingBottom: "var(--bottom-clearance)",
      }}
    >
      {/* The sky is behind everything on this page, and interactive here only. */}
      <UniverseStage />
      <header className="pointer-events-none relative flex items-start justify-between gap-4 [&_a]:pointer-events-auto">
        <div className="min-w-0">
          <p className="eyebrow text-fg-2">{mounted ? formatLongDate(today) : " "}</p>
          <h1 className="mt-1 text-large-title">{mounted ? greetingFor(hour) : " "}</h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="glass flex size-11 shrink-0 items-center justify-center rounded-full text-fg transition-transform duration-100 active:scale-95 md:hidden"
        >
          <GearIcon size={20} />
        </Link>
      </header>

      {/* The galaxy shows through this gap. */}
      <div className="pointer-events-none min-h-[120px] flex-1" data-universe-gap />

      {Hint && <Hint />}
      <GlassCard
        radius="hero"
        as="section"
        aria-labelledby="today-title"
        className="relative w-full max-w-[460px] p-5 md:mb-2"
        data-testid="today-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="today-title" className="text-title3">
            Today
          </h2>
          <Link
            href="/tasks"
            className="-mr-2 flex h-9 items-center rounded-chip px-2 text-[15px] font-medium text-accent hover:bg-fill-hover"
          >
            See all
          </Link>
        </div>
        <div className="flex gap-2">
          <StatTile label="Tasks" compact={`${stats.done}${stats.total}`.length > 4}>
            {stats.done}
            <span className={small}>
              {`${stats.done}${stats.total}`.length > 4 ? "/" : " / "}
              {stats.total}
            </span>
          </StatTile>
          <StatTile label="Routines">
            {routinesLoading ? (
              <span className={small} aria-label="Loading">
                –
              </span>
            ) : routinesFraction === null ? (
              <span className={small}>None today</span>
            ) : (
              <>
                {Math.round(routinesFraction * 100)}
                <span className={small}>%</span>
              </>
            )}
          </StatTile>
          <StatTile label="Focus">{formatFocus(focusMinutes)}</StatTile>
        </div>
        <div className="-mx-2 mt-3 border-t border-separator [&>*+*]:border-t [&>*+*]:border-separator">
          {upcoming.length === 0 && tasksLoading ? (
            <div role="status" aria-label="Loading tasks" className="space-y-3 px-2 pb-2 pt-4">
              <span className="block h-3 w-3/5 rounded-full bg-fill-selected" />
              <span className="block h-3 w-2/5 rounded-full bg-fill-selected" />
            </div>
          ) : upcoming.length === 0 ? (
            <p className="px-2 pb-1 pt-4 text-subhead text-fg-2">
              Clear skies. Nothing left in orbit today.
            </p>
          ) : (
            upcoming.map((t) => (
              <TaskRow key={t.id} task={t} today={today} context="home" compact />
            ))
          )}
        </div>
      </GlassCard>
    </main>
  );
}

/**
 * The open sky on the Universe home: the whole page behind the greeting and the Today card.
 * Drag to orbit, pinch or scroll to zoom, double tap to return to the designed view. It is
 * only there to be looked at: nothing in the galaxy is a control.
 */
function UniverseStage() {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const moved = useRef(0);
  const lastTap = useRef({ at: 0, x: 0, y: 0 });

  useEffect(() => () => sendStageInput({ type: "release" }), []);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  return (
    <div
      className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
      data-universe-stage
      role="img"
      aria-label="A spiral galaxy. Drag to look around."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        pinch.current = spread();
        moved.current = 0;
        if (pointers.current.size === 1) sendStageInput({ type: "grab" });
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2) {
          const d = spread();
          if (pinch.current > 0 && d > 0)
            sendStageInput({ type: "zoom", factor: d / pinch.current });
          pinch.current = d;
        } else {
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          moved.current += Math.abs(dx) + Math.abs(dy);
          sendStageInput({ type: "drag", dx, dy });
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        pinch.current = spread();
        if (pointers.current.size > 0) return;
        sendStageInput({ type: "release" });
        if (moved.current >= 8) return;
        // Two taps close together in time and place: back to the designed view.
        const tap = lastTap.current;
        const again =
          e.timeStamp - tap.at < 350 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 32;
        lastTap.current = { at: again ? 0 : e.timeStamp, x: e.clientX, y: e.clientY };
        if (again) sendStageInput({ type: "reset" });
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) sendStageInput({ type: "release" });
      }}
      onWheel={(e) => sendStageInput({ type: "zoom", factor: Math.exp(-e.deltaY * 0.0012) })}
    />
  );
}

function formatFocus(minutes: number): React.ReactNode {
  const text = formatDuration(minutes);
  // "1h 15m" → large digits, small unit letters.
  return text.split(/(\d+)/).map((part, i) =>
    /\d/.test(part) ? (
      <span key={i}>{part}</span>
    ) : (
      <span key={i} className={small}>
        {part}
      </span>
    ),
  );
}
