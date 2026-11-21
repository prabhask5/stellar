"use client";

import {
  type DateStr,
  formatShortDate,
  formatTime,
  relativeDayName,
  type WeekStart,
} from "@stellar/shared";
import { useState } from "react";
import { Button } from "./button";
import { Chip } from "./chip";
import { type DateValue, DatePicker } from "./date-picker";
import { CalendarIcon } from "./icons";
import { Popover } from "./popover";
import { Sheet } from "./sheet";
import { useIsWide } from "./use-media";

export function describeDate(value: DateValue, today: DateStr): string | null {
  if (!value.date) return null;
  const day =
    Math.abs(Date.parse(value.date) - Date.parse(today)) < 7 * 86_400_000
      ? relativeDayName(value.date, today)
      : formatShortDate(value.date, today);
  return value.time ? `${day}, ${formatTime(value.time)}` : day;
}

export interface DateChipProps {
  value: DateValue;
  onChange: (value: DateValue) => void;
  today: DateStr;
  weekStart: WeekStart;
  label?: string;
  withTime?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  size?: "sm" | "md";
}

/** A chip that shows the chosen date and opens the picker: popover on desktop, sheet on phones. */
export function DateChip({
  value,
  onChange,
  today,
  weekStart,
  label = "Due date",
  withTime = true,
  disabled,
  disabledReason,
  size = "md",
}: DateChipProps) {
  const [open, setOpen] = useState(false);
  const wide = useIsWide();
  const text = describeDate(value, today);

  const chip = (
    <Chip
      size={size}
      active={Boolean(text)}
      icon={<CalendarIcon size={16} />}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      aria-label={text ? `${label}: ${text}` : label}
      aria-pressed={undefined}
      aria-haspopup="dialog"
      onClick={wide ? undefined : () => setOpen(true)}
    >
      {text ?? label}
    </Chip>
  );

  const picker = (
    <DatePicker
      value={value}
      onChange={onChange}
      today={today}
      weekStart={weekStart}
      withTime={withTime}
      onPicked={withTime ? undefined : () => setOpen(false)}
    />
  );

  if (wide) {
    return (
      <Popover
        open={open && !disabled}
        onOpenChange={setOpen}
        trigger={chip}
        label={label}
        className="w-[320px] p-4"
      >
        {picker}
      </Popover>
    );
  }
  return (
    <>
      {chip}
      <DateSheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        value={value}
        onChange={onChange}
        today={today}
        weekStart={weekStart}
        withTime={withTime}
      />
    </>
  );
}

export interface DateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: DateValue;
  onChange: (value: DateValue) => void;
  today: DateStr;
  weekStart: WeekStart;
  withTime?: boolean;
}

/** The date picker in a sheet with a Done button. Also used for "Reschedule". */
export function DateSheet({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  today,
  weekStart,
  withTime = true,
}: DateSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} width={380}>
      <DatePicker
        value={value}
        onChange={onChange}
        today={today}
        weekStart={weekStart}
        withTime={withTime}
      />
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-4"
        onClick={() => onOpenChange(false)}
      >
        Done
      </Button>
    </Sheet>
  );
}
