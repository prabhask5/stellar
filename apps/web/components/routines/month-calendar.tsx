"use client";

import type { Routine, RoutineLog } from "@stellar/db";
import {
  type DateStr,
  formatLongDate,
  monthGrid,
  monthName,
  type WeekStart,
  weekdayName,
  weekdayOrder,
} from "@stellar/shared";
import { useMemo } from "react";
import { DayRing } from "@/components/ui/progress";
import { fractionFor, indexLogs } from "./model";

export interface MonthCalendarProps {
  year: number;
  month: number;
  today: DateStr;
  weekStart: WeekStart;
  routines: Routine[];
  logs: RoutineLog[];
  selected: DateStr | null;
  onSelect: (date: DateStr) => void;
}

/** Month grid of DayRings: each ring shows that day's completion; 100% days glow; today is a filled gold circle. */
export function MonthCalendar({
  year,
  month,
  today,
  weekStart,
  routines,
  logs,
  selected,
  onSelect,
}: MonthCalendarProps) {
  const weeks = useMemo(() => monthGrid(year, month, weekStart), [year, month, weekStart]);
  const index = useMemo(() => indexLogs(logs), [logs]);
  const fractions = useMemo(() => {
    const map = new Map<DateStr, number | null>();
    for (const week of weeks)
      for (const cell of week)
        if (cell.inMonth) map.set(cell.date, fractionFor(routines, index, cell.date));
    return map;
  }, [weeks, routines, index]);

  return (
    <div data-testid="month-calendar">
      <p className="mb-2 text-headline" aria-live="polite">
        {monthName(month)} {year}
      </p>
      <div role="grid" aria-label={`${monthName(month)} ${year}`}>
        <div role="row" className="grid grid-cols-7">
          {weekdayOrder(weekStart).map((d) => (
            <span
              key={d}
              role="columnheader"
              aria-label={weekdayName(d)}
              className="flex h-7 items-center justify-center text-caption text-fg-2"
            >
              {weekdayName(d, true).charAt(0)}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={week[0]?.date} className="grid grid-cols-7">
            {week.map((cell) => {
              if (!cell.inMonth)
                return <span key={cell.date} role="gridcell" aria-hidden="true" className="h-12" />;
              const value = fractions.get(cell.date) ?? null;
              const future = cell.date > today;
              const percent = value === null || future ? null : Math.round(value * 100);
              return (
                <button
                  key={cell.date}
                  type="button"
                  role="gridcell"
                  aria-selected={cell.date === selected}
                  aria-current={cell.date === today ? "date" : undefined}
                  aria-label={`${formatLongDate(cell.date)}${percent === null ? (future ? ", upcoming" : ", nothing scheduled") : `, ${percent}% complete`}`}
                  data-date={cell.date}
                  data-percent={percent ?? undefined}
                  onClick={() => onSelect(cell.date)}
                  className="flex h-12 items-center justify-center rounded-full transition-transform duration-100 active:scale-95"
                >
                  <DayRing
                    day={cell.day}
                    value={value}
                    today={cell.date === today}
                    future={future}
                    selected={cell.date === selected}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
