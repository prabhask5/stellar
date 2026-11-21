"use client";

import type { Task } from "@stellar/db";
import type { DateStr } from "@stellar/shared";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { TaskRow, type TaskRowProps } from "./task-row";

export interface TaskGroupProps {
  tasks: Task[];
  today: DateStr;
  context: TaskRowProps["context"];
  onOpen: (task: Task) => void;
  onReschedule?: (task: Task) => void;
  label: string;
  className?: string;
  /** Rendered after the rows inside the same card. */
  footer?: ReactNode;
}

/** A grouped list of task rows. Rows slide in and collapse out with a layout animation. */
export function TaskGroup({
  tasks,
  today,
  context,
  onOpen,
  onReschedule,
  label,
  className,
  footer,
}: TaskGroupProps) {
  const reduce = useReducedMotion();
  return (
    <div
      role="list"
      aria-label={label}
      className={cx("glass overflow-hidden rounded-list", className)}
    >
      <AnimatePresence initial={false}>
        {tasks.map((task, i) => (
          <m.div
            key={task.id}
            role="listitem"
            layout={reduce ? false : "position"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 38,
              opacity: { duration: 0.15 },
            }}
            className={cx("overflow-hidden", i > 0 && "border-t border-separator")}
          >
            <TaskRow
              task={task}
              today={today}
              context={context}
              onOpen={onOpen}
              onReschedule={onReschedule}
            />
          </m.div>
        ))}
      </AnimatePresence>
      {footer}
    </div>
  );
}
