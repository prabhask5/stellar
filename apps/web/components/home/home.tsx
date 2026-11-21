"use client";

import {
  eraLabel,
  eraProgress,
  formatDuration,
  formatLongDate,
  greetingFor,
  isBlockingActive,
  nextDue,
  todayIn,
  todayStats,
  zonedParts,
} from "@stellar/shared";
import { emitCosmic } from "@stellar/universe/bus";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { TaskRow } from "@/components/tasks/task-row";
import { GlassCard } from "@/components/ui/glass-card";
import { GearIcon } from "@/components/ui/icons";
import { useMounted } from "@/components/ui/use-media";
import { withLingering } from "@/lib/client/complete";
import {
  useCollection,
  useFocus,
  useMinute,
  useTimeZone,
  useToday,
  useUniverse,
} from "@/lib/client/data/hooks";
import { dayFraction } from "@/lib/client/data/routines";
import { serverNow } from "@/lib/client/session";
import { useUi } from "@/lib/client/ui-store";

const FIRST_LIGHT_KEY = "sp-first-light";

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 rounded-[14px] bg-fill-subtle px-3 py-2.5">
      <p className="text-caption text-fg-2">{label}</p>
      <p className="mt-0.5 truncate text-[20px] font-semibold leading-6 tracking-[-0.01em] text-fg tnum">
        {children}
      </p>
    </div>
  );
}

const small = "text-[13px] font-medium text-fg-2";

/** Universe home: greeting, Era badge, and the glass Today card over the interactive sky. */
export function Home() {
  const mounted = useMounted();
  const tz = useTimeZone();
  const today = useToday();
  const minute = useMinute();
  const universe = useUniverse();
  const { rows: tasks } = useCollection("sp_tasks");
  const { rows: routines } = useCollection("sp_routines");
  const { rows: logs } = useCollection("sp_routine_logs");
  const { rows: sessions } = useCollection("sp_focus_sessions");
  const focus = useFocus();
  const lingering = useUi((s) => s.lingering);

  // "First Light" plays once, right after setup.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(FIRST_LIGHT_KEY)) {
        sessionStorage.removeItem(FIRST_LIGHT_KEY);
        emitCosmic({ type: "first_light" });
      }
    } catch {
      // storage unavailable
    }
  }, []);

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

  const era = eraProgress(universe?.total ?? 0);
  const stars = universe?.stars.count ?? 0;

  return (
    <main
      className="flex min-h-dvh flex-col px-safe"
      style={{
        paddingTop: "calc(max(16px, var(--sat)) + 20px)",
        paddingBottom: "var(--bottom-clearance)",
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-fg-2">{mounted ? formatLongDate(today) : " "}</p>
          <h1 className="mt-1 text-large-title">{mounted ? greetingFor(hour) : " "}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              className="inline-flex h-7 items-center rounded-full border border-accent-line bg-accent-soft px-3 text-[13px] font-medium text-accent"
              data-testid="era-badge"
            >
              {eraLabel(era.era)}
            </span>
            <span className="text-[13px] text-fg-2 tnum">
              {stars === 1 ? "1 star ignited" : `${stars.toLocaleString("en-US")} stars ignited`}
            </span>
          </div>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="glass flex size-11 shrink-0 items-center justify-center rounded-full text-fg transition-transform duration-100 active:scale-95 md:hidden"
        >
          <GearIcon size={20} />
        </Link>
      </header>

      {/* The sky fills this space; it is interactive on this page only. */}
      <div className="min-h-[120px] flex-1" data-universe-stage />

      <GlassCard
        radius="hero"
        as="section"
        aria-labelledby="today-title"
        className="w-full max-w-[460px] p-5 md:mb-2"
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
          <StatTile label="Tasks">
            {stats.done}
            <span className={small}> / {stats.total}</span>
          </StatTile>
          <StatTile label="Routines">
            {routinesFraction === null ? (
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
          {upcoming.length === 0 ? (
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

function formatFocus(minutes: number): React.ReactNode {
  const text = formatDuration(minutes);
  // "1h 15m" → large digits, small unit letters, as in the mockup.
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
