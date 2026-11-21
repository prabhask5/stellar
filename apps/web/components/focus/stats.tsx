"use client";

import type { FocusSession, FocusState } from "@stellar/db";
import {
  formatDuration,
  formatShortDate,
  isBlockingActive,
  phaseLabel,
  todayIn,
} from "@stellar/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui/cx";

interface Stats {
  today: string;
  today_minutes: number;
  total_minutes: number;
  streak_days: number;
  days: { date: string; minutes: number }[];
}

import { GlassCard } from "@/components/ui/glass-card";
import { SegmentedControl } from "@/components/ui/segmented";
import { keys, queryClient } from "@/lib/client/cache";
import { useReady, useTimeZone, useToday } from "@/lib/client/data/hooks";
import { serverNow } from "@/lib/client/session";
import { getSupabase } from "@/lib/client/supabase";

async function fetchStats(days: number) {
  const { data, error } = await (await getSupabase()).rpc("sp_focus_stats", { p_days: days });
  if (error) throw Object.assign(new Error(error.message), error);
  return data as unknown as Stats;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-[14px] bg-fill-subtle px-3 py-2.5">
      <p className="text-caption text-fg-2">{label}</p>
      <p className="mt-0.5 truncate text-[20px] font-semibold leading-6 text-fg tnum">{value}</p>
    </div>
  );
}

function clock(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export interface FocusStatsProps {
  state: FocusState;
  sessions: FocusSession[];
}

/** Today's focus minutes, a 7- or 30-day chart, the daily streak, and the recent session log. */
export function FocusStats({ state, sessions }: FocusStatsProps) {
  const ready = useReady((s) => s.ready);
  const tz = useTimeZone();
  const today = useToday();
  const [range, setRange] = useState<"7" | "30">("7");
  const days = Number(range);
  const stats = useQuery({
    queryKey: keys.focusStats(30),
    queryFn: () => fetchStats(30),
    enabled: ready,
    staleTime: 60_000,
  }).data;

  // Finished phases change the totals.
  const lastSession = sessions[0]?.id;
  useEffect(() => {
    if (lastSession) void queryClient.invalidateQueries({ queryKey: ["focus_stats"] });
  }, [lastSession]);

  // Add the phase in flight so "today" moves while you focus.
  const liveMinutes = useMemo(() => {
    if (state.phase !== "focus" || !isBlockingActive(state) || !state.phase_total_ms) return 0;
    const remaining =
      state.status === "running" && state.phase_ends_at
        ? Math.max(0, Date.parse(state.phase_ends_at) - serverNow())
        : (state.paused_remaining_ms ?? 0);
    return Math.max(0, state.phase_total_ms - remaining) / 60_000;
  }, [state]);

  const series = useMemo(() => (stats?.days ?? []).slice(-days), [stats, days]);
  const max = Math.max(25, ...series.map((d) => d.minutes));
  const todayMinutes = (stats?.today === today ? stats.today_minutes : 0) + liveMinutes;
  const recent = sessions.slice(0, 12);

  return (
    <section aria-labelledby="focus-stats-title" data-testid="focus-stats">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="focus-stats-title" className="text-title3">
          Stats
        </h2>
        <SegmentedControl
          label="Chart range"
          size="sm"
          fit="content"
          value={range}
          onChange={setRange}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
          ]}
        />
      </div>
      <GlassCard radius="card" className="p-4">
        <div className="flex gap-2">
          <Tile label="Today" value={formatDuration(todayMinutes)} />
          <Tile
            label="Streak"
            value={stats ? (stats.streak_days === 1 ? "1 day" : `${stats.streak_days} days`) : "…"}
          />
          <Tile
            label="All time"
            value={stats ? formatDuration(stats.total_minutes + liveMinutes) : "…"}
          />
        </div>
        <div
          className="mt-5 flex h-[120px] items-end gap-[3px]"
          role="img"
          aria-label={`Focus minutes for the last ${days} days`}
          data-testid="focus-chart"
        >
          {series.map((d) => {
            const minutes = d.date === today ? d.minutes + liveMinutes : d.minutes;
            const h = Math.max(minutes > 0 ? 4 : 2, Math.round((minutes / max) * 104));
            return (
              <div
                key={d.date}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                title={`${formatShortDate(d.date, today)}: ${formatDuration(minutes)}`}
              >
                <div
                  className={cx(
                    "w-full max-w-7 rounded-[4px] transition-[height] duration-[350ms] ease-out",
                    minutes > 0 ? (d.date === today ? "bg-accent" : "bg-violet") : "bg-track",
                  )}
                  style={{ height: h }}
                  data-minutes={Math.round(minutes)}
                />
                {days === 7 && (
                  <span className="text-[10px] leading-none text-fg-2">
                    {new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-US", {
                      weekday: "narrow",
                      timeZone: "UTC",
                    })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <table className="sr-only">
          <caption>Focus minutes per day</caption>
          <tbody>
            {series.map((d) => (
              <tr key={d.date}>
                <th scope="row">{formatShortDate(d.date, today)}</th>
                <td>{Math.round(d.minutes)} minutes</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      <h3 className="mb-2 mt-6 px-1 text-[15px] font-semibold text-fg-2">Recent sessions</h3>
      {recent.length === 0 ? (
        <p className="glass rounded-list px-4 py-5 text-subhead text-fg-2">
          No sessions yet. Your first focus phase will appear here.
        </p>
      ) : (
        <ul
          className="glass overflow-hidden rounded-list [&>*+*]:border-t [&>*+*]:border-separator"
          aria-label="Recent sessions"
          data-testid="session-log"
        >
          {recent.map((s) => {
            const day = todayIn(tz, Date.parse(s.ended_at));
            return (
              <li key={s.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                <span
                  className={cx(
                    "size-2 shrink-0 rounded-full",
                    s.phase === "focus" ? "bg-accent" : "bg-violet",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-fg">{phaseLabel(s.phase)}</span>
                  <span className="block text-footnote text-fg-2 tnum">
                    {day === today ? "Today" : formatShortDate(day, today)},{" "}
                    {clock(s.started_at, tz)} · {formatDuration(s.actual_seconds / 60)}
                    {s.completed ? "" : ` of ${formatDuration(s.planned_seconds / 60)}`}
                  </span>
                </span>
                <span
                  className={cx(
                    "shrink-0 text-footnote",
                    s.completed ? "text-success" : "text-fg-2",
                  )}
                >
                  {s.completed ? "Completed" : "Ended early"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
