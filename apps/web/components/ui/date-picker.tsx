"use client";

import {
  addDays,
  addMonths,
  type DateStr,
  formatTime,
  monthGrid,
  monthName,
  parts,
  startOfWeek,
  toDateStr,
  type WeekStart,
  weekdayName,
  weekdayOrder,
} from "@stellar/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "./chip";
import { cx } from "./cx";
import { IconButton } from "./button";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, XIcon } from "./icons";

export interface DateValue {
  date: DateStr | null;
  /** "HH:MM" (24h) or null. A time needs a date. */
  time: string | null;
}

export interface DatePickerProps {
  value: DateValue;
  onChange: (value: DateValue) => void;
  today: DateStr;
  weekStart: WeekStart;
  /** Offer a time wheel. */
  withTime?: boolean;
  /** Offer "No date". */
  allowClear?: boolean;
  min?: DateStr;
  max?: DateStr;
  /** Called when a quick pick or day is chosen, so a popover can close itself. */
  onPicked?: () => void;
}

/** iOS-style inline calendar with quick picks (Today, Tomorrow, Next week, No date) and an optional time wheel. */
export function DatePicker({
  value,
  onChange,
  today,
  weekStart,
  withTime = false,
  allowClear = true,
  min,
  max,
  onPicked,
}: DatePickerProps) {
  const anchor = value.date ?? today;
  const [view, setView] = useState(() => ({
    year: parts(anchor).year,
    month: parts(anchor).month,
  }));
  const [timeOpen, setTimeOpen] = useState(value.time !== null);
  const weeks = useMemo(() => monthGrid(view.year, view.month, weekStart), [view, weekStart]);
  const order = weekdayOrder(weekStart);

  useEffect(() => {
    if (!value.date) return;
    const p = parts(value.date);
    setView((v) =>
      v.year === p.year && v.month === p.month ? v : { year: p.year, month: p.month },
    );
  }, [value.date]);

  const shift = (delta: number) => {
    const next = parts(addMonths(toDateStr(view.year, view.month, 1), delta));
    setView({ year: next.year, month: next.month });
  };

  const pick = (date: DateStr | null, done = true) => {
    onChange({ date, time: date ? value.time : null });
    if (date === null) setTimeOpen(false);
    if (done && !timeOpen) onPicked?.();
  };

  const nextWeek = addDays(startOfWeek(today, weekStart), 7);
  const quick: { label: string; date: DateStr | null }[] = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Next week", date: nextWeek },
    ...(allowClear ? [{ label: "No date", date: null }] : []),
  ];
  const disabled = (d: DateStr) => (min !== undefined && d < min) || (max !== undefined && d > max);

  const onGridKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = map[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = addDays(value.date ?? today, delta);
    if (!disabled(next)) onChange({ date: next, time: value.time });
  };

  return (
    <div className="w-full select-none" data-testid="date-picker">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-3">
        {quick.map((q) => (
          <Chip key={q.label} size="sm" active={q.date === value.date} onClick={() => pick(q.date)}>
            {q.label}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-between pb-1">
        <p className="pl-1 text-headline" aria-live="polite">
          {monthName(view.month)} {view.year}
        </p>
        <div className="flex gap-1">
          <IconButton label="Previous month" variant="plain" size={36} onClick={() => shift(-1)}>
            <ChevronLeftIcon size={18} />
          </IconButton>
          <IconButton label="Next month" variant="plain" size={36} onClick={() => shift(1)}>
            <ChevronRightIcon size={18} />
          </IconButton>
        </div>
      </div>

      <div role="grid" aria-label={`${monthName(view.month)} ${view.year}`} onKeyDown={onGridKey}>
        <div role="row" className="grid grid-cols-7">
          {order.map((d) => (
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
              const selected = cell.date === value.date;
              const isToday = cell.date === today;
              return (
                <button
                  key={cell.date}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${weekdayName(new Date(`${cell.date}T00:00:00Z`).getUTCDay())}, ${monthName(parts(cell.date).month)} ${cell.day}`}
                  tabIndex={selected || (!value.date && isToday) ? 0 : -1}
                  disabled={disabled(cell.date)}
                  onClick={() => pick(cell.date)}
                  className="flex h-10 items-center justify-center disabled:opacity-30"
                >
                  <span
                    className={cx(
                      "flex size-9 items-center justify-center rounded-full text-[15px] tnum transition-colors duration-100",
                      selected
                        ? "bg-accent font-semibold text-accent-ink"
                        : isToday
                          ? "font-semibold text-accent"
                          : cell.inMonth
                            ? "text-fg hover:bg-fill-selected"
                            : "text-fg-2/45 hover:bg-fill-hover",
                    )}
                  >
                    {cell.day}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {withTime && (
        <div className="mt-3 border-t border-separator pt-3">
          {timeOpen && value.date ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-subhead text-fg">
                  <ClockIcon size={18} className="text-fg-2" />
                  {value.time ? formatTime(value.time) : "Time"}
                </p>
                <IconButton
                  label="Remove time"
                  variant="plain"
                  size={36}
                  onClick={() => {
                    setTimeOpen(false);
                    onChange({ date: value.date, time: null });
                  }}
                >
                  <XIcon size={16} />
                </IconButton>
              </div>
              <TimeWheel
                value={value.time ?? "09:00"}
                onChange={(time) => onChange({ date: value.date, time })}
              />
            </div>
          ) : (
            <Chip
              icon={<ClockIcon size={16} />}
              disabled={!value.date}
              onClick={() => {
                setTimeOpen(true);
                if (value.date && !value.time) onChange({ date: value.date, time: "09:00" });
              }}
            >
              Add time
            </Chip>
          )}
        </div>
      )}
    </div>
  );
}

const ROW = 36;
const HOURS = Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const PERIODS = ["AM", "PM"];

function Wheel({
  items,
  index,
  onIndex,
  label,
}: {
  items: string[];
  index: number;
  onIndex: (i: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmatic = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Math.abs(el.scrollTop - index * ROW) > 2) {
      programmatic.current = true;
      el.scrollTo({ top: index * ROW });
      setTimeout(() => (programmatic.current = false), 120);
    }
  }, [index]);

  const onScroll = () => {
    if (programmatic.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ROW)));
      if (i !== index) onIndex(i);
    }, 90);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onIndex(Math.min(items.length - 1, index + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onIndex(Math.max(0, index - 1));
    }
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKey}
      className="no-scrollbar relative h-[180px] w-16 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-chip"
      style={{ paddingBlock: (180 - ROW) / 2, scrollbarWidth: "none" }}
    >
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          role="option"
          aria-selected={i === index}
          tabIndex={-1}
          onClick={() => onIndex(i)}
          className={cx(
            "flex w-full snap-center items-center justify-center text-[20px] tnum transition-colors duration-100",
            i === index ? "font-medium text-fg" : "text-fg-2/60",
          )}
          style={{ height: ROW }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/** Three scroll-snap wheels: hour, minute (5-minute steps), AM/PM. Arrow keys work too. */
export function TimeWheel({
  value,
  onChange,
}: {
  value: string;
  onChange: (time: string) => void;
}) {
  const [h = 9, m = 0] = value.split(":").map(Number);
  const hourIndex = h % 12;
  const minuteIndex = Math.min(11, Math.round(m / 5));
  const periodIndex = h >= 12 ? 1 : 0;

  const emit = (hi: number, mi: number, pi: number) => {
    const hour24 = (hi % 12) + (pi === 1 ? 12 : 0);
    onChange(`${String(hour24).padStart(2, "0")}:${String(mi * 5).padStart(2, "0")}`);
  };

  return (
    <div className="relative mt-1 flex justify-center gap-2" data-testid="time-wheel">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-[224px] -translate-x-1/2 -translate-y-1/2 rounded-chip bg-fill-selected"
        aria-hidden="true"
      />
      <Wheel
        label="Hour"
        items={HOURS}
        index={hourIndex}
        onIndex={(i) => emit(i, minuteIndex, periodIndex)}
      />
      <Wheel
        label="Minute"
        items={MINUTES}
        index={minuteIndex}
        onIndex={(i) => emit(hourIndex, i, periodIndex)}
      />
      <Wheel
        label="AM or PM"
        items={PERIODS}
        index={periodIndex}
        onIndex={(i) => emit(hourIndex, minuteIndex, i)}
      />
    </div>
  );
}
