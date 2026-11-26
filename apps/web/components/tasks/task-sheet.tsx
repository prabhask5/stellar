"use client";

import type { Task, TaskList } from "@stellar/db";
import type { DateStr, WeekStart } from "@stellar/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateChip } from "@/components/ui/date-chip";
import { FieldShell, inputClass, TextField } from "@/components/ui/field";
import { TrashIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { cx } from "@/components/ui/cx";
import { toggleTask } from "@/lib/client/complete";
import { deleteTask, updateTask } from "@/lib/client/data/tasks";

export interface TaskSheetProps {
  task: Task | null;
  onClose: () => void;
  lists: TaskList[];
  today: DateStr;
  weekStart: WeekStart;
}

/**
 * Task detail: name, description, due date and time, list, delete. Changes are
 * saved as they are made. Moving a task into a list clears its dates.
 */
export function TaskSheet({ task: current, onClose, lists, today, weekStart }: TaskSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Keep showing the last task while the sheet animates out.
  const [shown, setShown] = useState<Task | null>(current);
  useEffect(() => {
    if (current) setShown(current);
  }, [current]);
  const task = current ?? shown;

  // What each field held when the user last saw it in sync. A field is only written when the
  // user changed it from that, so an open sheet never puts an old name or note back over an
  // edit made meanwhile on another device; untouched fields simply follow the task.
  const base = useRef({ name: "", description: "" });
  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description ?? "");
      base.current = { name: task.name, description: task.description ?? "" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);
  useEffect(() => {
    if (!task) return;
    const was = base.current.name;
    base.current.name = task.name;
    setName((mine) => (mine === was ? task.name : mine));
  }, [task?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!task) return;
    const theirs = task.description ?? "";
    const was = base.current.description;
    base.current.description = theirs;
    setDescription((mine) => (mine === was ? theirs : mine));
  }, [task?.description]); // eslint-disable-line react-hooks/exhaustive-deps

  // Going to the background may be the last thing this page does: save what was typed.
  const commitRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && commitRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  if (!task) return null;

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) setName(task.name);
    else if (trimmed !== base.current.name) {
      base.current.name = trimmed;
      updateTask(task.id, { name: trimmed });
    }
  };
  const commitDescription = () => {
    const next = description.trim();
    if (next !== base.current.description.trim()) {
      base.current.description = next;
      updateTask(task.id, { description: next || null });
    }
  };
  commitRef.current = () => {
    commitName();
    commitDescription();
  };
  const close = () => {
    commitName();
    commitDescription();
    onClose();
  };
  const inList = task.list_id !== null;

  return (
    <Sheet open={current !== null} onOpenChange={(o) => !o && close()} title="Task" hideTitle>
      <div className="flex flex-col gap-4 pt-1" data-testid="task-sheet">
        <TextField
          label="Name"
          value={name}
          maxLength={500}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) =>
            e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()
          }
        />
        <FieldShell label="Description" htmlFor="task-description" optional>
          <textarea
            autoComplete="off"
            enterKeyHint="enter"
            autoCapitalize="sentences"
            id="task-description"
            rows={3}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
            placeholder="Add a note"
            className={cx(inputClass, "h-auto resize-none py-2.5 leading-snug")}
          />
        </FieldShell>
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-fg-2">Due</span>
          <div className="flex flex-wrap items-center gap-2">
            <DateChip
              value={{
                date: task.due_date,
                time: task.due_time ? task.due_time.slice(0, 5) : null,
              }}
              onChange={(v) => updateTask(task.id, { due_date: v.date, due_time: v.time })}
              today={today}
              weekStart={weekStart}
              label="Due date"
              disabled={inList}
              disabledReason="Tasks in a list don't have due dates"
            />
            {inList && (
              <span className="text-footnote text-fg-2">
                Tasks in a list don&rsquo;t have due dates.
              </span>
            )}
          </div>
        </div>
        <FieldShell
          label="List"
          htmlFor="task-list"
          hint={
            inList
              ? undefined
              : "Moving a task into a list clears its due date and takes it out of Today, All and Calendar."
          }
        >
          <select
            id="task-list"
            value={task.list_id ?? ""}
            onChange={(e) => updateTask(task.id, { list_id: e.target.value || null })}
            className={cx(inputClass, "appearance-none")}
          >
            <option value="">No list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.emoji} {l.name}
              </option>
            ))}
          </select>
        </FieldShell>
        <div className="mt-2 flex gap-3">
          <Button
            variant="danger"
            size="lg"
            icon={<TrashIcon size={18} />}
            onClick={() => {
              deleteTask(task.id);
              onClose();
            }}
          >
            Delete
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => {
              toggleTask(task);
              close();
            }}
          >
            {task.completed ? "Mark as not done" : "Complete"}
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={close}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
