"use client";

import type { Routine, RoutineLog } from "@stellar/db";
import { type DateStr, formatShortDate, scheduleSummary, type WeekStart } from "@stellar/shared";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/page";
import { isActive, streakFor } from "./model";
import { RoutineSheet } from "./routine-sheet";

export interface ManageRoutinesProps {
  routines: Routine[];
  logs: RoutineLog[];
  today: DateStr;
  weekStart: WeekStart;
}

function detail(routine: Routine, today: DateStr): string {
  const parts = [scheduleSummary(routine)];
  if (routine.type === "progress" && routine.total_amount)
    parts.push(`${routine.total_amount}${routine.unit ? ` ${routine.unit}` : ""} a day`);
  if (routine.start_date > today)
    parts.push(`starts ${formatShortDate(routine.start_date, today)}`);
  else if (routine.end_date && routine.end_date < today)
    parts.push(`ended ${formatShortDate(routine.end_date, today)}`);
  else if (routine.end_date) parts.push(`until ${formatShortDate(routine.end_date, today)}`);
  return parts.join(" · ");
}

/** Manage routines: each with its schedule summary and current streak; add and edit from here. */
export function ManageRoutines({ routines, logs, today, weekStart }: ManageRoutinesProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(
    () => [...routines].sort((a, b) => a.sort_order - b.sort_order),
    [routines],
  );
  const active = sorted.filter((r) => isActive(r, today)).length;
  const editing = sorted.find((r) => r.id === editingId) ?? null;

  return (
    <section aria-label="Manage routines" data-testid="manage-routines">
      <div className="glass overflow-hidden rounded-list">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left hover:bg-fill-hover"
        >
          <span className="font-medium text-fg">Manage routines</span>
          <span className="flex items-center gap-2 text-[15px] text-fg-2 tnum">
            {active} active
            <ChevronRightIcon
              size={16}
              className={cx("transition-transform duration-200", open && "rotate-90")}
            />
          </span>
        </button>
        {open && (
          <div className="border-t border-separator">
            {sorted.length === 0 ? (
              <EmptyState
                title="No constellations yet."
                body="A routine repeats on the days you choose. Each completed day lights a star."
                className="py-7"
              />
            ) : (
              <ul className="[&>*+*]:border-t [&>*+*]:border-separator" aria-label="Routines">
                {sorted.map((r) => {
                  const streak = streakFor(r, logs, today);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setEditingId(r.id)}
                        aria-label={`Edit ${r.name}`}
                        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-fill-hover"
                        data-testid="routine-item"
                        data-routine={r.name}
                      >
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-fill-subtle text-[18px]"
                          aria-hidden="true"
                        >
                          {r.emoji ?? "✨"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-fg">{r.name}</span>
                          <span className="block truncate text-footnote text-fg-2">
                            {detail(r, today)}
                          </span>
                        </span>
                        <span
                          className={cx(
                            "shrink-0 text-right text-footnote tnum",
                            streak > 0 ? "font-medium text-accent" : "text-fg-2",
                          )}
                          data-testid="streak"
                        >
                          {streak > 0 ? `${streak}-day streak` : "No streak"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-separator p-3">
              <Button
                variant="tinted"
                block
                icon={<PlusIcon size={18} />}
                onClick={() => setAdding(true)}
              >
                Add routine
              </Button>
            </div>
          </div>
        )}
      </div>
      <RoutineSheet open={adding} onOpenChange={setAdding} today={today} weekStart={weekStart} />
      <RoutineSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditingId(null)}
        routine={editing}
        today={today}
        weekStart={weekStart}
      />
    </section>
  );
}
