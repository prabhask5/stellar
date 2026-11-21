"use client";

import type { Task } from "@stellar/db";
import { type DateStr, dueLabel } from "@stellar/shared";
import { animate, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { memo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cx } from "@/components/ui/cx";
import { CalendarIcon, CheckIcon, TrashIcon } from "@/components/ui/icons";
import { useIsTouch } from "@/components/ui/use-media";
import { toggleTask } from "@/lib/client/complete";
import { deleteTask } from "@/lib/client/data/tasks";
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
  const [open, setOpen] = useState(false);
  const checkbox = useRef<HTMLButtonElement>(null);
  const completeOpacity = useTransform(x, [0, 28, COMPLETE_AT], [0, 0.5, 1]);
  const completeScale = useTransform(x, [0, COMPLETE_AT], [0.6, 1]);

  const settle = (to: number) => {
    void animate(x, to, { type: "spring", stiffness: 400, damping: 36 });
    setOpen(to !== 0);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > COMPLETE_AT && !done) {
      settle(0);
      toggleTask(task, checkbox.current);
    } else if (info.offset.x < -64 || (open && info.offset.x < 24)) {
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
        aria-label={onOpen ? `Edit “${task.name}”` : undefined}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 text-left disabled:cursor-default"
      >
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
      >
        {body}
      </div>
    );
  }

  return (
    <div data-testid="task-row" data-task={task.name} className="relative overflow-hidden">
      <motion.div
        aria-hidden="true"
        style={{ opacity: completeOpacity }}
        className="absolute inset-y-0 left-0 flex w-full items-center bg-accent/90 pl-6 text-accent-ink"
      >
        <motion.span style={{ scale: completeScale }}>
          <CheckIcon size={24} strokeWidth={2.4} />
        </motion.span>
      </motion.div>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH }}>
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
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-[rgba(246,199,110,0.22)] text-[11px] font-medium text-accent disabled:opacity-40"
        >
          <CalendarIcon size={20} />
          Reschedule
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
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTIONS_WIDTH, right: done ? 0 : 120 }}
        dragElastic={{ left: 0.08, right: 0.15 }}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{ x, touchAction: "pan-y" }}
        className="relative bg-[#110e2b]"
      >
        {body}
      </motion.div>
    </div>
  );
});
