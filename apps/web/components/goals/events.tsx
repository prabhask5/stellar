"use client";

import type { CountdownEvent } from "@stellar/db";
import {
  type Countdown,
  countdown,
  type CountdownUnit,
  countdownUnits,
  type DateStr,
  eventInstant,
  formatLongDate,
  formatTime,
} from "@stellar/shared";
import { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { DateChip } from "@/components/ui/date-chip";
import type { DateValue } from "@/components/ui/date-picker";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { TextField } from "@/components/ui/field";
import { PlusIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { useIsWide } from "@/components/ui/use-media";
import { createEvent, deleteEvent, updateEvent } from "@/lib/client/data/events";
import {
  useCollection,
  useTick,
  useTimeZone,
  useToday,
  useWeekStart,
} from "@/lib/client/data/hooks";

const DEFAULT_EMOJI = "📅";
const NAMES: Record<CountdownUnit, [one: string, many: string, short: string]> = {
  years: ["year", "years", "y"],
  months: ["month", "months", "mo"],
  weeks: ["week", "weeks", "w"],
  days: ["day", "days", "d"],
  hours: ["hour", "hours", "h"],
  minutes: ["minute", "minutes", "m"],
  seconds: ["second", "seconds", "s"],
};
const CLOCK: ReadonlySet<CountdownUnit> = new Set(["hours", "minutes", "seconds"]);
const two = (n: number) => String(n).padStart(2, "0");
const unitName = (unit: CountdownUnit, n: number) => NAMES[unit][n === 1 ? 0 : 1];

/** "Thursday, Dec 30, 2027 · 5:00 PM": the year is said once the date is in another year. */
function when(event: CountdownEvent, today: DateStr): string {
  const year = event.date.slice(0, 4);
  const day =
    year === today.slice(0, 4)
      ? formatLongDate(event.date)
      : `${formatLongDate(event.date)}, ${year}`;
  return event.time ? `${day} · ${formatTime(event.time)}` : day;
}

/** "1 year, 2 months, 3 days, 4 hours" for screen readers: the two or three largest units. */
function spoken(c: Countdown): string {
  if (c.past) return "it has arrived";
  return countdownUnits(c)
    .filter((u) => c[u] > 0)
    .slice(0, 3)
    .map((u) => `${c[u]} ${unitName(u, c[u])}`)
    .join(", ");
}

/** The short form for a row: the two largest units, or a running clock on the last day. */
function brief(c: Countdown): string {
  if (c.past) return "Now";
  const units = countdownUnits(c);
  if (CLOCK.has(units[0]!)) return `${two(c.hours)}:${two(c.minutes)}:${two(c.seconds)}`;
  return units
    .filter((u) => !CLOCK.has(u) && c[u] > 0)
    .slice(0, 2)
    .map((u) => `${c[u]}${NAMES[u][2]}`)
    .join(" ");
}

/**
 * Desktop: every unit from the largest down to seconds, each in its own tile, the largest
 * in gold. There is room for the whole count side by side.
 */
function Tiles({ c }: { c: Countdown }) {
  const units = countdownUnits(c);
  return (
    <div className="flex flex-wrap justify-end gap-2" aria-hidden="true" data-testid="event-tiles">
      {units.map((u, i) => (
        <div
          key={u}
          className={cx(
            "flex min-w-[72px] flex-col items-center rounded-card border px-3 py-2.5",
            i === 0 ? "border-accent-line bg-accent-soft" : "border-hairline bg-fill-subtle",
          )}
        >
          <span
            data-unit={u}
            className={cx(
              "text-[34px] font-semibold leading-none tnum",
              i === 0 ? "text-accent" : "text-fg",
            )}
          >
            {CLOCK.has(u) ? two(c[u]) : c[u]}
          </span>
          <span className="eyebrow mt-1.5 text-fg-2">{unitName(u, c[u])}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Phone: one number that fills the card (the largest unit), with the rest of the count
 * on a single line under it. Readable at a glance, nothing to scroll sideways.
 */
function Stack({ c }: { c: Countdown }) {
  const [first, ...rest] = countdownUnits(c);
  const lead = first!;
  const calendar = rest.filter((u) => !CLOCK.has(u) && c[u] > 0);
  return (
    <div aria-hidden="true" data-testid="event-stack">
      <p className="flex items-baseline gap-2">
        <span
          className="text-[64px] font-semibold leading-[0.95] text-accent tnum"
          data-unit={lead}
        >
          {CLOCK.has(lead) && lead !== "hours" ? two(c[lead]) : c[lead]}
        </span>
        <span className="text-title3 text-fg">{unitName(lead, c[lead])}</span>
      </p>
      {rest.length > 0 && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-subhead text-fg-2 tnum">
          {calendar.map((u) => (
            <span key={u}>
              <span className="font-semibold text-fg">{c[u]}</span> {unitName(u, c[u])}
            </span>
          ))}
          {rest.some((u) => CLOCK.has(u)) && (
            <span className="font-semibold text-fg" data-testid="event-clock">
              {rest
                .filter((u) => CLOCK.has(u))
                .map((u) => `${two(c[u])}${NAMES[u][2]}`)
                .join(" ")}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** The next event, large. */
function Featured({
  event,
  c,
  wide,
  today,
  onEdit,
}: {
  event: CountdownEvent;
  c: Countdown;
  wide: boolean;
  today: DateStr;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${event.name}, ${when(event, today)}, in ${spoken(c)}. Edit`}
      data-testid="event-featured"
      data-layout={wide ? "desktop" : "phone"}
      className={cx(
        "glass relative w-full overflow-hidden rounded-hero border-accent-line text-left transition-transform duration-100 active:scale-[0.995]",
        wide ? "flex items-center justify-between gap-6 p-6" : "p-5",
      )}
      // A wash of the accent from the corner the emoji sits in, over the glass.
      style={{
        backgroundImage:
          "radial-gradient(120% 140% at 0% 0%, var(--sp-accent-soft), transparent 55%), radial-gradient(90% 120% at 100% 100%, var(--sp-nebula-blue), transparent 60%)",
      }}
    >
      <div className={cx("flex min-w-0 items-center gap-4", !wide && "mb-5")}>
        <span
          className={cx(
            "flex shrink-0 items-center justify-center rounded-card border border-hairline bg-fill-subtle leading-none",
            wide ? "size-16 text-[34px]" : "size-12 text-[26px]",
          )}
          aria-hidden="true"
        >
          {event.emoji}
        </span>
        <span className="min-w-0">
          <span className="eyebrow block text-accent">Next up</span>
          <span className={cx("block truncate text-fg", wide ? "text-title2" : "text-title3")}>
            {event.name}
          </span>
          <span className="mt-0.5 block truncate text-footnote text-fg-2">
            {when(event, today)}
          </span>
        </span>
      </div>
      {wide ? <Tiles c={c} /> : <Stack c={c} />}
    </button>
  );
}

/** Every other event: a compact card on desktop, a row on a phone. */
function Lesser({
  event,
  c,
  wide,
  today,
  onEdit,
}: {
  event: CountdownEvent;
  c: Countdown;
  wide: boolean;
  today: DateStr;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${event.name}, ${when(event, today)}, ${c.past ? "passed" : `in ${spoken(c)}`}. Edit`}
      data-testid="event-item"
      className={cx(
        "flex w-full items-center gap-3 text-left transition-colors duration-100 hover:bg-fill-hover",
        wide ? "glass rounded-card p-4" : "min-h-[60px] px-4 py-2.5",
        c.past && "opacity-55",
      )}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-fill-subtle text-[20px] leading-none"
        aria-hidden="true"
      >
        {event.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg">{event.name}</span>
        <span className="block truncate text-footnote text-fg-2">{when(event, today)}</span>
      </span>
      <span
        className={cx(
          "shrink-0 text-right font-semibold tnum",
          wide ? "text-title3" : "text-headline",
          c.past ? "text-fg-2" : "text-fg",
        )}
        aria-hidden="true"
      >
        {c.past ? "Passed" : brief(c)}
      </span>
    </button>
  );
}

function EventSheet({
  open,
  onOpenChange,
  event,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CountdownEvent | null;
  today: DateStr;
}) {
  const weekStart = useWeekStart();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  const [date, setDate] = useState<DateValue>({ date: null, time: null });

  useEffect(() => {
    if (!open) return;
    setName(event?.name ?? "");
    setEmoji(event?.emoji ?? DEFAULT_EMOJI);
    setDate({ date: event?.date ?? null, time: event?.time?.slice(0, 5) ?? null });
  }, [open, event]);

  const ready = Boolean(name.trim() && date.date);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !date.date) return;
    const input = { name: name.trim(), emoji, date: date.date, time: date.time };
    if (event) updateEvent(event.id, input);
    else createEvent(input);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={event ? "Edit event" : "New event"}
      width={420}
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex items-end gap-3">
          <EmojiPicker value={emoji} onChange={setEmoji} label="Emoji" size={44} />
          <div className="min-w-0 flex-1">
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
              placeholder="A date or a deadline"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateChip
            value={date}
            onChange={setDate}
            today={today}
            weekStart={weekStart}
            label="Date"
          />
          {!date.date && (
            <span className="text-footnote text-fg-2">Pick the day to count down to.</span>
          )}
        </div>
        <div className="flex gap-3">
          {event && (
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                deleteEvent(event.id);
                onOpenChange(false);
              }}
            >
              Delete
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={!ready}>
            {event ? "Save" : "Add event"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Upcoming events: dates and deadlines counted down live, in the owner's time zone. The
 * nearest one is shown large; the rest follow in order, and ones that have passed sink to
 * the end until they are deleted.
 */
export function UpcomingEvents() {
  const { rows } = useCollection("sp_events");
  const tz = useTimeZone();
  const today = useToday();
  const wide = useIsWide();
  const now = useTick(1000, rows.length > 0);
  const [editing, setEditing] = useState<CountdownEvent | "new" | null>(null);

  const ordered = useMemo(
    () => [...rows].sort((a, b) => eventInstant(a, tz) - eventInstant(b, tz)),
    [rows, tz],
  );
  const counted = ordered.map((event) => ({ event, c: countdown(now, event, tz) }));
  const upcoming = counted.filter((x) => !x.c.past);
  const passed = counted.filter((x) => x.c.past).reverse();
  const [next, ...later] = upcoming;
  const rest = [...later, ...passed];

  return (
    <section aria-labelledby="events-title" data-testid="upcoming-events">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="events-title" className="text-title3">
          Upcoming events
        </h2>
        <IconButton label="New event" variant="glass" size={36} onClick={() => setEditing("new")}>
          <PlusIcon size={18} />
        </IconButton>
      </div>
      {rows.length === 0 ? (
        <p className="glass rounded-card px-4 py-5 text-subhead text-fg-2">
          Nothing to count down to yet. Add a date or a deadline and watch it approach.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {next && (
            <Featured
              event={next.event}
              c={next.c}
              wide={wide}
              today={today}
              onEdit={() => setEditing(next.event)}
            />
          )}
          {rest.length > 0 && (
            <div
              className={
                wide
                  ? "grid grid-cols-2 gap-3 xl:grid-cols-3"
                  : "glass overflow-hidden rounded-list [&>*+*]:border-t [&>*+*]:border-separator"
              }
            >
              {rest.map(({ event, c }) => (
                <Lesser
                  key={event.id}
                  event={event}
                  c={c}
                  wide={wide}
                  today={today}
                  onEdit={() => setEditing(event)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <EventSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        event={editing === "new" ? null : editing}
        today={today}
      />
    </section>
  );
}
