"use client";

import type { Task } from "@stellar/db";
import { type DateStr, dueLabel } from "@stellar/shared";
import { type PanInfo, useMotionValue, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { memo, useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useContextMenu } from "@/components/ui/context-menu";
import { cx } from "@/components/ui/cx";
import { CalendarIcon, CheckIcon, TrashIcon } from "@/components/ui/icons";
import { useIsTouch } from "@/components/ui/use-media";
import { toggleTask } from "@/lib/client/complete";
import { deleteTask } from "@/lib/client/data/tasks";
import { haptic } from "@/lib/client/haptics";
import { preloadAnimate, withAnimate } from "@/lib/client/motion-animate";
import { useUi } from "@/lib/client/ui-store";

export interface TaskRowProps {
  task: Task;
  today: DateStr;
  /** Controls the due label: "home" shows the word Overdue, "all" omits the day (the group header has it). */
  context?: "today" | "all" | "home" | "list";
  onOpen?: (task: Task) => void;
  /** Called from the swipe action. */
  onReschedule?: (task: Task) => void;
  compact?: boolean;
  /** Extra element before the due label, e.g. a drag handle. */
  trailing?: React.ReactNode;
}

const ACTIONS_WIDTH = 148;
const COMPLETE_AT = 84;
/** Dragging this far to the left on release deletes, like a full swipe in Mail. */
const FULL_SWIPE = 232;
const MAX_LEFT = 300;

/**
 * One task: 22px circle checkbox, name, optional one-line description and a
 * right-aligned due label (warning colour when overdue). On touch devices,
 * swipe right to complete and left for Reschedule and Delete.
 */
export const TaskRow = memo(function TaskRow({
  task,
  today,
  context = "today",
  onOpen,
  onReschedule,
  compact,
  trailing,
}: TaskRowProps) {
  const touch = useIsTouch();
  const lingering = useUi((s) => s.lingering.has(task.id));
  const done = task.completed || lingering;
  const due =
    context === "list"
      ? null
      : dueLabel(lingering ? { ...task, completed: false } : task, today, context);
  const x = useMotionValue(0);
  const open = useUi((s) => s.openRow === task.id);
  const setOpenRow = useUi((s) => s.setOpenRow);
  // The actions tray grows with the drag so nothing bare shows behind the row; past the
  // full-swipe point the Delete side takes over, which is the cue that letting go deletes.
  const trayWidth = useTransform(x, (v) => Math.max(ACTIONS_WIDTH, -v));
  const rescheduleOpacity = useTransform(x, [-FULL_SWIPE, -FULL_SWIPE + 40], [0, 1]);
  const checkbox = useRef<HTMLButtonElement>(null);
  const rowMenu = useContextMenu();
  const completeOpacity = useTransform(x, [0, 28, COMPLETE_AT], [0, 0.5, 1]);
  const completeScale = useTransform(x, [0, COMPLETE_AT], [0.6, 1]);

  useEffect(preloadAnimate, []);

  const settle = (to: number) => {
    withAnimate((animate) => {
      void animate(x, to, { type: "spring", stiffness: 400, damping: 36 });
    });
    const current = useUi.getState().openRow;
    if (to !== 0) setOpenRow(task.id);
    else if (current === task.id) setOpenRow(null);
  };

  // Another row opened, or this one was closed from outside: slide back.
  useEffect(() => {
    if (!open && x.get() !== 0)
      withAnimate((animate) => {
        void animate(x, 0, { type: "spring", stiffness: 400, damping: 36 });
      });
  }, [open, x]);

  // Scrolling the list puts an open row away.
  useEffect(() => {
    if (!open) return;
    const close = () => useUi.getState().setOpenRow(null);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // Decide from where the row ended up, not from how far the finger travelled: a row
    // that was open at −148 and is pushed back to rest has moved +148 without ever
    // showing the "complete" side.
    const at = x.get();
    if (at < -FULL_SWIPE) {
      // A full swipe commits the destructive action (with Undo, like the button).
      haptic("success");
      settle(0);
      deleteTask(task.id);
    } else if (at > COMPLETE_AT && !done && !open) {
      settle(0);
      toggleTask(task, checkbox.current);
    } else if (at < -64 && (open || info.offset.x < 0)) {
      settle(-ACTIONS_WIDTH);
    } else {
      settle(0);
    }
  };

  const body = (
    <div
      className={cx(
        "flex items-center gap-1 pl-1.5 pr-4",
        compact ? "min-h-12" : "min-h-[60px] lg:min-h-[64px]",
      )}
    >
      <Checkbox
        ref={checkbox}
        checked={done}
        label={done ? `Mark “${task.name}” as not done` : `Complete “${task.name}”`}
        onChange={(_, el) => toggleTask(task, el)}
      />
      <button
        type="button"
        onClick={() => (open ? settle(0) : onOpen?.(task))}
        disabled={!onOpen}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 text-left disabled:cursor-default"
      >
        {/* Named by its content ("Edit Call Mom …"): what is heard contains what is seen,
            which is what voice control matches against. */}
        {onOpen && <span className="sr-only">Edit </span>}
        <span
          className={cx(
            "block truncate transition-colors duration-200",
            done ? "text-fg-2 line-through decoration-fg-2/60" : "text-fg",
          )}
        >
          {task.name}
        </span>
        {!compact && task.description && (
          <span className="mt-0.5 block truncate text-footnote text-fg-2">{task.description}</span>
        )}
      </button>
      {trailing}
      {due && !done && (
        <span
          className={cx(
            "shrink-0 pl-2 text-footnote tnum",
            due.tone === "warning" ? "font-medium text-warning" : "text-fg-2",
          )}
        >
          {due.text}
        </span>
      )}
    </div>
  );

  if (!touch) {
    return (
      <div
        data-testid="task-row"
        data-task={task.name}
        className="transition-colors duration-100 hover:bg-fill-hover"
        onContextMenu={(e) =>
          rowMenu.onContextMenu(e, [
            {
              label: done ? "Mark as not done" : "Complete",
              icon: <CheckIcon size={16} />,
              run: () => toggleTask(task, checkbox.current),
            },
            ...(onOpen ? [{ label: "Edit", run: () => onOpen(task) }] : []),
            ...(onReschedule && task.list_id === null
              ? [
                  {
                    label: "Reschedule",
                    icon: <CalendarIcon size={16} />,
                    run: () => onReschedule(task),
                  },
                ]
              : []),
            {
              label: "Delete",
              icon: <TrashIcon size={16} />,
              danger: true,
              run: () => deleteTask(task.id),
            },
          ])
        }
      >
        {body}
        {rowMenu.menu}
      </div>
    );
  }

  return (
    <div data-testid="task-row" data-task={task.name} className="relative overflow-hidden">
      <m.div
        aria-hidden="true"
        style={{ opacity: completeOpacity }}
        className="absolute inset-y-0 left-0 flex w-full items-center bg-accent/90 pl-6 text-accent-ink"
      >
        <m.span style={{ scale: completeScale }}>
          <CheckIcon size={24} strokeWidth={2.4} />
        </m.span>
      </m.div>
      <m.div className="absolute inset-y-0 right-0 flex" style={{ width: trayWidth }}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          aria-label={`Reschedule “${task.name}”`}
          disabled={task.list_id !== null}
          onClick={() => {
            settle(0);
            onReschedule?.(task);
          }}
          className="flex w-[74px] shrink-0 flex-col items-center justify-center gap-1 bg-[rgba(246,199,110,0.22)] text-[11px] font-medium text-accent disabled:opacity-40"
        >
          <m.span
            style={{ opacity: rescheduleOpacity }}
            className="flex flex-col items-center gap-1"
          >
            <CalendarIcon size={20} />
            Reschedule
          </m.span>
        </button>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          aria-label={`Delete “${task.name}”`}
          onClick={() => {
            settle(0);
            deleteTask(task.id);
          }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-[rgba(255,122,138,0.24)] text-[11px] font-medium text-danger"
        >
          <TrashIcon size={20} />
          Delete
        </button>
      </m.div>
      <m.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -MAX_LEFT, right: done ? 0 : 120 }}
        dragElastic={{ left: 0.12, right: 0.15 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{ x, touchAction: "pan-y" }}
        className="relative bg-[#110e2b]"
      >
        {body}
      </m.div>
    </div>
  );
});
