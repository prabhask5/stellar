"use client";

import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Task } from "@stellar/db";
import {
  addDays,
  addMonths,
  calendarView,
  type DateStr,
  formatLongDate,
  monthGrid,
  monthName,
  parts,
  startOfWeek,
  toDateStr,
  type WeekStart,
  weekdayName,
  weekdayOrder,
} from "@stellar/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { SectionHeader } from "@/components/ui/grouped-list";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { useIsDesktop } from "@/components/ui/use-media";
import { withLingering } from "@/lib/client/complete";
import { useReady } from "@/lib/client/data/hooks";
import { updateTask } from "@/lib/client/data/tasks";
import { useLocalPref, useShowCompleted } from "@/lib/client/prefs";
import { getSupabase } from "@/lib/client/supabase";
import { useUi } from "@/lib/client/ui-store";
import { TaskGroup } from "./task-group";
import { ShowCompletedToggle } from "./views";

export interface CalendarTabProps {
  tasks: Task[];
  today: DateStr;
  weekStart: WeekStart;
  selected: DateStr;
  onSelect: (date: DateStr) => void;
  onOpen: (task: Task) => void;
  onReschedule: (task: Task) => void;
}

/** Completed tasks older than the cache window, loaded only for the visible range when "Show completed" is on. */
function useOlderCompleted(from: DateStr, to: DateStr, enabled: boolean): Task[] {
  const ready = useReady((s) => s.ready);
  const q = useQuery({
    queryKey: ["tasks_range", from, to],
    enabled: enabled && ready,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("sp_tasks")
        .select("*")
        .is("deleted_at", null)
        .is("list_id", null)
        .eq("completed", true)
        .gte("due_date", from)
        .lte("due_date", to)
        .limit(2000);
      if (error) throw Object.assign(new Error(error.message), error);
      return data as Task[];
    },
  });
  return enabled ? (q.data ?? []) : [];
}

function Pill({
  task,
  onOpen,
  draggable,
}: {
  task: Task;
  onOpen: (t: Task) => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: task.id,
    disabled: !draggable,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
              zIndex: 30,
              position: "relative",
            }
          : undefined
      }
      className={cx(
        "block w-full truncate rounded-[6px] px-1.5 text-left text-[12px] leading-[20px]",
        task.completed ? "bg-fill-subtle text-fg-2 line-through" : "bg-accent-soft text-accent",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "shadow-[0_8px_20px_rgba(0,0,0,0.5)]",
      )}
      data-testid="calendar-pill"
    >
      {task.name}
    </button>
  );
}

function DayCell({
  date,
  day,
  inMonth,
  isToday,
  selected,
  tasks,
  onSelect,
  onOpen,
  desktop,
  tall,
}: {
  date: DateStr;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  selected: boolean;
  tasks: Task[];
  onSelect: (d: DateStr) => void;
  onOpen: (t: Task) => void;
  desktop: boolean;
  tall: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const max = tall ? 8 : 3;
  const openCount = tasks.filter((t) => !t.completed).length;
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-selected={selected}
      data-date={date}
      className={cx(
        "relative flex flex-col border-b border-r border-separator transition-colors duration-100",
        tall ? "min-h-[220px]" : desktop ? "min-h-[104px]" : "min-h-[52px]",
        isOver && "bg-accent-soft",
        selected && !isOver && "bg-fill-selected",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(date)}
        aria-label={`${formatLongDate(date)}${openCount ? `, ${openCount} ${openCount === 1 ? "task" : "tasks"}` : ""}`}
        aria-current={isToday ? "date" : undefined}
        className={cx(
          "flex w-full flex-col items-center gap-1 py-1.5",
          desktop && "items-start px-2",
        )}
      >
        <span
          className={cx(
            "flex size-7 items-center justify-center rounded-full text-[14px] tnum",
            isToday
              ? "bg-accent font-semibold text-accent-ink"
              : inMonth
                ? "text-fg"
                : "text-fg-2/45",
          )}
        >
          {day}
        </span>
        {!desktop && (
          <span className="flex h-1.5 items-center gap-[3px]" aria-hidden="true">
            {tasks.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className={cx("size-1.5 rounded-full", t.completed ? "bg-fg-2/50" : "bg-accent")}
              />
            ))}
          </span>
        )}
      </button>
      {desktop && (
        <div className="flex flex-1 flex-col gap-1 px-1.5 pb-1.5">
          {tasks.slice(0, max).map((t) => (
            <Pill key={t.id} task={t} onOpen={onOpen} draggable={!t.completed} />
          ))}
          {tasks.length > max && (
            <button
              type="button"
              onClick={() => onSelect(date)}
              className="px-1.5 text-left text-[11px] text-fg-2 hover:text-fg"
            >
              +{tasks.length - max} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Calendar: month view (week view on desktop), dots or pills per day, an agenda
 * for the selected day, and drag-to-reschedule on desktop.
 */
export function CalendarTab({
  tasks,
  today,
  weekStart,
  selected,
  onSelect,
  onOpen,
  onReschedule,
}: CalendarTabProps) {
  const desktop = useIsDesktop();
  const lingering = useUi((s) => s.lingering);
  const [showCompleted, setShowCompleted] = useShowCompleted("calendar");
  const [mode, setMode] = useLocalPref<"month" | "week">("sp-calendar-mode", "month");
  const view = desktop ? mode : "month";
  const sel = parts(selected);
  const [cursor, setCursor] = useState({ year: sel.year, month: sel.month });

  const weeks = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(selected, weekStart);
      return [
        Array.from({ length: 7 }, (_, i) => {
          const date = addDays(start, i);
          const p = parts(date);
          return { date, day: p.day, inMonth: true };
        }),
      ];
    }
    return monthGrid(cursor.year, cursor.month, weekStart);
  }, [view, selected, weekStart, cursor]);

  const from = weeks[0]?.[0]?.date ?? selected;
  const to = weeks[weeks.length - 1]?.[6]?.date ?? selected;
  const older = useOlderCompleted(from, to, showCompleted);
  const merged = useMemo(() => {
    if (older.length === 0) return tasks;
    const known = new Set(tasks.map((t) => t.id));
    return [...tasks, ...older.filter((t) => !known.has(t.id))];
  }, [tasks, older]);
  const byDay = useMemo(
    () => calendarView(showCompleted ? merged : withLingering(merged, lingering), showCompleted),
    [merged, lingering, showCompleted],
  );
  const agenda = byDay.get(selected) ?? [];

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const date = String(e.over.id);
    const task = merged.find((t) => t.id === e.active.id);
    if (task && task.due_date !== date) updateTask(task.id, { due_date: date });
  };

  const step = (delta: number) => {
    if (view === "week") {
      const next = addDays(selected, delta * 7);
      onSelect(next);
      setCursor({ year: parts(next).year, month: parts(next).month });
    } else {
      const next = parts(addMonths(toDateStr(cursor.year, cursor.month, 1), delta));
      setCursor({ year: next.year, month: next.month });
    }
  };
  const goToday = () => {
    onSelect(today);
    setCursor({ year: parts(today).year, month: parts(today).month });
  };
  const select = (date: DateStr) => {
    onSelect(date);
    const p = parts(date);
    if (view === "month" && (p.year !== cursor.year || p.month !== cursor.month))
      setCursor({ year: p.year, month: p.month });
  };

  const title =
    view === "week"
      ? `Week of ${monthName(parts(from).month, true)} ${parts(from).day}`
      : `${monthName(cursor.month)} ${cursor.year}`;

  return (
    <div data-testid="calendar-tab">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title3" aria-live="polite">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {desktop && (
            <SegmentedControl
              label="Calendar view"
              size="sm"
              fit="content"
              value={mode}
              onChange={setMode}
              options={[
                { value: "month", label: "Month" },
                { value: "week", label: "Week" },
              ]}
            />
          )}
          <Button variant="secondary" size="sm" onClick={goToday}>
            Today
          </Button>
          <IconButton
            label={view === "week" ? "Previous week" : "Previous month"}
            variant="glass"
            size={36}
            onClick={() => step(-1)}
          >
            <ChevronLeftIcon size={18} />
          </IconButton>
          <IconButton
            label={view === "week" ? "Next week" : "Next month"}
            variant="glass"
            size={36}
            onClick={() => step(1)}
          >
            <ChevronRightIcon size={18} />
          </IconButton>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div role="grid" aria-label={title} className="glass overflow-hidden rounded-list">
          <div role="row" className="grid grid-cols-7 border-b border-separator">
            {weekdayOrder(weekStart).map((d) => (
              <span
                key={d}
                role="columnheader"
                aria-label={weekdayName(d)}
                className="py-2 text-center text-caption text-fg-2"
              >
                {desktop ? weekdayName(d, true) : weekdayName(d, true).charAt(0)}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div
              role="row"
              key={week[0]?.date}
              className="grid grid-cols-7 [&>*:nth-child(7)]:border-r-0 last:[&>*]:border-b-0"
            >
              {week.map((cell) => (
                <DayCell
                  key={cell.date}
                  date={cell.date}
                  day={cell.day}
                  inMonth={cell.inMonth}
                  isToday={cell.date === today}
                  selected={cell.date === selected}
                  tasks={byDay.get(cell.date) ?? []}
                  onSelect={select}
                  onOpen={onOpen}
                  desktop={desktop}
                  tall={view === "week"}
                />
              ))}
            </div>
          ))}
        </div>
      </DndContext>
      {desktop && (
        <p className="mt-2 px-1 text-footnote text-fg-2">
          Drag a task to another day to reschedule it.
        </p>
      )}

      <section aria-label="Agenda" className="mt-6">
        <SectionHeader>
          {formatLongDate(selected)} · <span className="tnum">{agenda.length}</span>
        </SectionHeader>
        {agenda.length === 0 ? (
          <div className="glass rounded-list">
            <EmptyState
              title="A quiet day."
              body="Nothing is scheduled. Add a task above to place it here."
              className="py-7"
            />
          </div>
        ) : (
          <TaskGroup
            label={`Tasks on ${formatLongDate(selected)}`}
            tasks={agenda}
            today={today}
            context="all"
            onOpen={onOpen}
            onReschedule={onReschedule}
          />
        )}
      </section>
      <ShowCompletedToggle view="calendar" value={showCompleted} onChange={setShowCompleted} />
    </div>
  );
}
