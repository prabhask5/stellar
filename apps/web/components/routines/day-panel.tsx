"use client";

import type { Routine, RoutineLog } from "@stellar/db";
import { type DateStr, formatShortDate, weekdayName, dayOfWeek } from "@stellar/shared";
import { originOf } from "@stellar/universe/bus";
import { useMemo } from "react";
import { AmountLabel } from "@/components/ui/amount";
import { Checkbox } from "@/components/ui/checkbox";
import { cx } from "@/components/ui/cx";
import { ProgressBar } from "@/components/ui/progress";
import { Stepper } from "@/components/ui/stepper";
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

export interface DayPanelProps {
  date: DateStr;
  today: DateStr;
  routines: Routine[];
  logs: RoutineLog[];
  /** Hide the heading when the panel is inside a sheet that already has a title. */
  bare?: boolean;
}

/** One day's routine day-goals with a live completion percentage. Past days are editable; future days are a preview. */
export function DayPanel({ date, today, routines, logs, bare }: DayPanelProps) {
  const index = useMemo(() => indexLogs(logs), [logs]);
  const instances = useMemo(() => instancesFor(routines, index, date), [routines, index, date]);
  const fraction = useMemo(() => fractionFor(routines, index, date), [routines, index, date]);
  const future = date > today;
  const percent = fraction === null ? null : Math.round(fraction * 100);

  return (
    <div data-testid="day-panel" data-date={date}>
      <div className={cx("flex items-center justify-between", bare ? "mb-1" : "mb-2")}>
        {bare ? <span /> : <h2 className="text-headline">{dayTitle(date, today)}</h2>}
        {percent !== null && !future && (
          <span
            className={cx("text-headline tnum", percent > 0 ? "text-accent" : "text-fg-2")}
            aria-label={`${percent}% complete`}
            data-testid="day-percent"
          >
            {percent}%
          </span>
        )}
        {future && instances.length > 0 && (
          <span className="text-footnote text-fg-2">Scheduled</span>
        )}
      </div>
      {instances.length === 0 ? (
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
    </div>
  );
}
