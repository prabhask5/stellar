"use client";

import type { Routine } from "@stellar/db";
import {
  type DateStr,
  dayOfWeek,
  formatShortDate,
  nextScheduledDates,
  scheduleSummary,
  validateSchedule,
  type WeekStart,
  weekdayName,
  weekdayOrder,
} from "@stellar/shared";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm";
import { cx } from "@/components/ui/cx";
import { DateChip } from "@/components/ui/date-chip";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { FieldShell, inputClass, TextField } from "@/components/ui/field";
import { InfoIcon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import {
  createRoutine,
  deleteRoutine,
  type RoutineInput,
  updateRoutine,
} from "@/lib/client/data/routines";

export interface RoutineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routine?: Routine | null;
  today: DateStr;
  weekStart: WeekStart;
}

type Frequency = "daily" | "weekdays" | "interval";

/**
 * Add or edit a routine: name, emoji, description, Todo / Progress, dates and
 * one of three frequencies, with a live preview of the next 14 scheduled dates.
 */
export function RoutineSheet({ open, onOpenChange, routine, today, weekStart }: RoutineSheetProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"todo" | "progress">("todo");
  const [total, setTotal] = useState("");
  const [unit, setUnit] = useState("");
  const [start, setStart] = useState<DateStr>(today);
  const [end, setEnd] = useState<DateStr | null>(null);
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [interval, setIntervalDays] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(routine?.name ?? "");
    setEmoji(routine?.emoji ?? null);
    setDescription(routine?.description ?? "");
    setType(routine?.type ?? "todo");
    setTotal(routine?.total_amount ? String(routine.total_amount) : "");
    setUnit(routine?.unit ?? "");
    setStart(routine?.start_date ?? today);
    setEnd(routine?.end_date ?? null);
    setFrequency(routine?.frequency ?? "daily");
    setWeekdays(routine?.weekdays?.length ? routine.weekdays : [1, 3, 5]);
    setIntervalDays(String(routine?.interval_days ?? 2));
    setError(null);
    // Seed the form when the sheet opens; `today` changing mid-edit must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, routine]);

  const schedule = useMemo(
    () => ({
      start_date: start,
      end_date: end,
      frequency,
      weekdays: frequency === "weekdays" ? weekdays : null,
      interval_days: frequency === "interval" ? Number(interval) || 0 : null,
    }),
    [start, end, frequency, weekdays, interval],
  );
  const problem = validateSchedule(schedule);
  const preview = useMemo(
    () => (problem ? [] : nextScheduledDates(schedule, start > today ? start : today, 14)),
    [schedule, problem, start, today],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the routine a name.");
    const amount = Number(total.replace(",", "."));
    if (type === "progress" && (!Number.isFinite(amount) || amount <= 0))
      return setError("Enter a daily total above zero.");
    if (problem) return setError(problem.message);
    const input: RoutineInput = {
      name: trimmed,
      emoji,
      description,
      type,
      total_amount: type === "progress" ? amount : null,
      unit: type === "progress" ? unit : null,
      ...schedule,
    };
    if (routine) updateRoutine(routine.id, input);
    else createRoutine(input);
    onOpenChange(false);
  };

  const toggleDay = (d: number) =>
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={routine ? "Edit routine" : "New routine"}
        detent="large"
        width={520}
      >
        <form
          onSubmit={submit}
          className="flex flex-col gap-5"
          data-testid="routine-sheet"
          noValidate
        >
          {routine && (
            <p className="flex gap-2 rounded-button border border-hairline bg-fill-subtle p-3 text-footnote text-fg-2">
              <InfoIcon size={18} className="mt-px shrink-0" />
              Changes apply to every day, past and future.
            </p>
          )}
          <div className="flex items-end gap-3">
            <EmojiPicker value={emoji} onChange={setEmoji} label="Emoji" placeholder="✨" />
            <div className="min-w-0 flex-1">
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                autoFocus={!routine}
                placeholder="Meditate, read, stretch…"
              />
            </div>
          </div>
          <FieldShell label="Description" htmlFor="routine-description" optional>
            <textarea
              id="routine-description"
              rows={2}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cx(inputClass, "h-auto resize-none py-2.5 leading-snug")}
            />
          </FieldShell>

          <div className="flex flex-col gap-2">
            <span className="text-footnote font-medium text-fg-2">Type</span>
            <SegmentedControl
              label="Routine type"
              value={type}
              onChange={setType}
              options={[
                { value: "todo", label: "Todo" },
                { value: "progress", label: "Progress" },
              ]}
            />
            {type === "progress" && (
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Daily total"
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="8"
                />
                <TextField
                  label="Unit"
                  optional
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  maxLength={40}
                  placeholder="glasses"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-footnote font-medium text-fg-2">Dates</span>
            <div className="flex flex-wrap gap-2">
              <DateChip
                label="Starts"
                value={{ date: start, time: null }}
                onChange={(v) => v.date && setStart(v.date)}
                today={today}
                weekStart={weekStart}
                withTime={false}
              />
              <DateChip
                label="Ends (optional)"
                value={{ date: end, time: null }}
                onChange={(v) => setEnd(v.date)}
                today={today}
                weekStart={weekStart}
                withTime={false}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-footnote font-medium text-fg-2">Repeats</span>
            <SegmentedControl
              label="Frequency"
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: "daily", label: "Every day" },
                { value: "weekdays", label: "Weekdays" },
                { value: "interval", label: "Every N days" },
              ]}
            />
            {frequency === "weekdays" && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
                {weekdayOrder(weekStart).map((d) => (
                  <Chip
                    key={d}
                    size="sm"
                    active={weekdays.includes(d)}
                    aria-label={weekdayName(d)}
                    onClick={() => toggleDay(d)}
                    className="min-w-11 justify-center !h-10"
                  >
                    {weekdayName(d, true)}
                  </Chip>
                ))}
              </div>
            )}
            {frequency === "interval" && (
              <label className="flex items-center gap-2 text-[15px] text-fg-2">
                Every
                <input
                  aria-label="Interval in days"
                  inputMode="numeric"
                  value={interval}
                  onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  className={cx(inputClass, "w-20 text-center tnum")}
                />
                days, counted from the start date
              </label>
            )}
          </div>

          <div
            className="rounded-button border border-hairline bg-fill-subtle p-3"
            data-testid="schedule-preview"
          >
            <p className="text-footnote font-medium text-fg">
              {problem
                ? problem.message
                : `${scheduleSummary(schedule)} · next ${preview.length === 14 ? "14" : preview.length} ${preview.length === 1 ? "date" : "dates"}`}
            </p>
            {!problem && (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Upcoming dates">
                {preview.map((d) => (
                  <li
                    key={d}
                    className="rounded-md bg-fill-selected px-2 py-1 text-caption text-fg-2 tnum"
                  >
                    {weekdayName(dayOfWeek(d), true)} {formatShortDate(d, today)}
                  </li>
                ))}
                {preview.length === 0 && (
                  <li className="text-caption text-fg-2">No upcoming dates. Check the end date.</li>
                )}
              </ul>
            )}
          </div>

          {error && (
            <p className="text-footnote text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            {routine && (
              <Button variant="danger" size="lg" onClick={() => setConfirm(true)}>
                Delete
              </Button>
            )}
            <Button type="submit" variant="primary" size="lg" className="flex-1">
              {routine ? "Save changes" : "Add routine"}
            </Button>
          </div>
        </form>
      </Sheet>
      {routine && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete “${routine.name}”?`}
          body="This removes the routine and all of its history."
          confirmLabel="Delete routine"
          onConfirm={() => {
            deleteRoutine(routine.id);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
