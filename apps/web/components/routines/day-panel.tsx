"use client";

import type { Routine, RoutineLog } from "@stellar/db";
import { type DateStr, formatShortDate, weekdayName, dayOfWeek } from "@stellar/shared";
import { originOf } from "@stellar/universe/bus";
import { type CSSProperties, useMemo } from "react";
import { AmountLabel } from "@/components/ui/amount";
import { Checkbox } from "@/components/ui/checkbox";
import { cx } from "@/components/ui/cx";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { Stepper } from "@/components/ui/stepper";
import { useIsDesktop } from "@/components/ui/use-media";
import { useCollection } from "@/lib/client/data/hooks";
import { setRoutineLog } from "@/lib/client/data/routines";
import { type DayInstance, fractionFor, indexLogs, instancesFor } from "./model";

export function dayTitle(date: DateStr, today: DateStr): string {
  const short = formatShortDate(date, today);
  if (date === today) return `Today, ${short}`;
  return `${weekdayName(dayOfWeek(date))}, ${short}`;
}

function InstanceRow({
  instance,
  date,
  disabled,
}: {
  instance: DayInstance;
  date: DateStr;
  disabled: boolean;
}) {
  const { routine, completed, amount } = instance;
  const label = routine.name;
  if (routine.type === "todo") {
    return (
      <div
        className="flex min-h-[52px] items-center gap-1 pl-0.5"
        data-testid="routine-row"
        data-routine={label}
      >
        <Checkbox
          checked={completed}
          disabled={disabled}
          label={completed ? `Mark “${label}” as not done` : `Complete “${label}”`}
          onChange={(checked, el) =>
            setRoutineLog(routine.id, date, { completed: checked }, originOf(el))
          }
        />
        <span
          className={cx(
            "min-w-0 flex-1 truncate py-2 transition-colors duration-200",
            completed ? "text-fg-2 line-through decoration-fg-2/60" : "text-fg",
          )}
        >
          {routine.emoji && (
            <span className="mr-1.5" aria-hidden="true">
              {routine.emoji}
            </span>
          )}
          {label}
        </span>
      </div>
    );
  }
  const total = routine.total_amount ?? 0;
  return (
    <div
      className="flex items-center gap-3 py-2.5 pl-3"
      data-testid="routine-row"
      data-routine={label}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cx("truncate", completed ? "text-fg-2" : "text-fg")}>
            {routine.emoji && (
              <span className="mr-1.5" aria-hidden="true">
                {routine.emoji}
              </span>
            )}
            {label}
          </span>
          <span className="text-fg-2" aria-hidden="true">
            ·
          </span>
          <AmountLabel
            current={amount}
            total={routine.total_amount}
            unit={routine.unit}
            label={label}
            onSet={
              disabled
                ? undefined
                : (v, el) => setRoutineLog(routine.id, date, { amount: v }, originOf(el))
            }
          />
        </p>
        <ProgressBar
          value={total > 0 ? amount / total : 0}
          label={`${label} progress`}
          valueText={`${amount} of ${total}${routine.unit ? ` ${routine.unit}` : ""}`}
          className="mt-2"
        />
      </div>
      {!disabled && (
        <Stepper
          label={label}
          value={amount}
          unit={routine.unit}
          onStep={(delta, el) =>
            setRoutineLog(routine.id, date, { amount: Math.max(0, amount + delta) }, originOf(el))
          }
        />
      )}
    </div>
  );
}

/**
 * The day's colour: from the theme's red at nothing done, through gold, to its green at
 * everything done. Mixed in OKLCH so the steps in between stay as soft as the two ends.
 */
function toneStyle(percent: number): CSSProperties {
  return {
    "--tone": `color-mix(in oklch, var(--sp-success) ${percent}%, var(--sp-danger))`,
  } as CSSProperties;
}
/** The whole box takes the day's colour: a wash over the glass and a matching edge. */
const TINT: CSSProperties = {
  backgroundImage:
    "linear-gradient(155deg, color-mix(in srgb, var(--tone) 24%, transparent), color-mix(in srgb, var(--tone) 8%, transparent))",
  borderColor: "color-mix(in srgb, var(--tone) 42%, transparent)",
};

function Percent({ percent, className }: { percent: number; className: string }) {
  return (
    <span
      className={cx("font-semibold leading-none tnum text-(--tone)", className)}
      aria-label={`${percent}% complete`}
      data-testid="day-percent"
    >
      {percent}
      <span className="text-[0.55em] font-medium">%</span>
    </span>
  );
}

/**
 * How much of the day is done, at a glance. Two layouts: on a phone a ring beside a large
 * number (thumb-height, read from arm's length); on a desktop the number sits at the end of
 * the heading above a bar the width of the card, since the calendar's rings are right there.
 */
function DaySummary({
  title,
  percent,
  done,
  total,
  desktop,
  boxed,
}: {
  /** In a sheet there is no card around the panel, so the summary is its own tinted box. */
  boxed: boolean;
  title: string | null;
  percent: number;
  done: number;
  total: number;
  desktop: boolean;
}) {
  const count = percent === 100 ? "All done" : `${done} of ${total} done`;
  if (desktop)
    return (
      <div className="mb-3" data-testid="day-summary" data-layout="desktop">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="truncate text-headline">{title}</h2>}
            <p className="mt-0.5 text-footnote text-fg-2">{count}</p>
          </div>
          <Percent percent={percent} className="text-[34px]" />
        </div>
        <ProgressBar
          value={percent / 100}
          label="Routines done"
          valueText={count}
          color="var(--tone)"
          className="mt-3 h-2"
        />
      </div>
    );
  return (
    <div
      className={cx("mb-3 flex items-center gap-4", boxed && "rounded-card border p-3")}
      style={boxed ? TINT : undefined}
      data-testid="day-summary"
      data-layout="phone"
    >
      <ProgressRing
        value={percent / 100}
        size={64}
        stroke={6}
        label="Routines done"
        color="var(--tone)"
        trackOpacity={0.14}
      >
        <span className="text-footnote font-medium text-fg tnum">
          {done}/{total}
        </span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <Percent percent={percent} className="text-[40px]" />
        <div className="mt-1 flex min-w-0 gap-1 text-footnote text-fg-2">
          {title && (
            <>
              <h2 className="truncate">{title}</h2>
              <span aria-hidden="true">·</span>
            </>
          )}
          <p className="shrink-0">{count}</p>
        </div>
      </div>
    </div>
  );
}

export interface DayPanelProps {
  date: DateStr;
  today: DateStr;
  routines: Routine[];
  logs: RoutineLog[];
  /** Hide the heading when the panel is inside a sheet that already has a title. */
  bare?: boolean;
}

/**
 * One day's routine day-goals with a live completion summary, in a box that takes the day's
 * colour. Past days are editable; future days are a preview.
 */
export function DayPanel({ date, today, routines, logs, bare }: DayPanelProps) {
  const { loading } = useCollection("sp_routines");
  const desktop = useIsDesktop();
  const index = useMemo(() => indexLogs(logs), [logs]);
  const instances = useMemo(() => instancesFor(routines, index, date), [routines, index, date]);
  const fraction = useMemo(() => fractionFor(routines, index, date), [routines, index, date]);
  const future = date > today;
  const percent = fraction === null || future ? null : Math.round(fraction * 100);
  const done = instances.filter((i) => i.completed).length;

  const body = (
    <>
      {percent !== null ? (
        <DaySummary
          title={bare ? null : dayTitle(date, today)}
          percent={percent}
          done={done}
          total={instances.length}
          desktop={desktop && !bare}
          boxed={Boolean(bare)}
        />
      ) : (
        <div className={cx("flex items-center justify-between", bare ? "mb-1" : "mb-2")}>
          {bare ? <span /> : <h2 className="text-headline">{dayTitle(date, today)}</h2>}
          {future && instances.length > 0 && (
            <span className="text-footnote text-fg-2">Scheduled</span>
          )}
        </div>
      )}
      {instances.length === 0 && loading ? (
        <div role="status" aria-label="Loading routines" className="space-y-3 py-4">
          <span className="block h-3 w-1/2 rounded-full bg-fill-selected" />
          <span className="block h-3 w-1/3 rounded-full bg-fill-selected" />
        </div>
      ) : instances.length === 0 ? (
        <p className="py-4 text-subhead text-fg-2">
          {routines.length === 0
            ? "No routines yet. Add one below."
            : "A free day. Nothing is scheduled."}
        </p>
      ) : (
        <div className="border-t border-separator [&>*+*]:border-t [&>*+*]:border-separator">
          {instances.map((i) => (
            <InstanceRow key={i.routine.id} instance={i} date={date} disabled={future} />
          ))}
        </div>
      )}
    </>
  );
  const tone = percent === null ? undefined : toneStyle(percent);
  // In a sheet the panel is the sheet's content; the summary alone carries the colour.
  if (bare)
    return (
      <div data-testid="day-panel" data-date={date} style={tone}>
        {body}
      </div>
    );
  return (
    <GlassCard
      radius="card"
      className="px-4 pb-2 pt-4 transition-[border-color] duration-300"
      data-testid="day-panel"
      data-date={date}
      data-percent={percent ?? undefined}
      style={tone ? { ...tone, ...TINT } : undefined}
    >
      {body}
    </GlassCard>
  );
}
