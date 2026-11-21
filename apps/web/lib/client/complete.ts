import type { Task } from "@stellar/db";
import { originOf } from "@stellar/universe/bus";
import { setTaskCompleted } from "./data/tasks";
import { toast, UNDO_MS } from "./toast";
import { LINGER_MS, useUi } from "./ui-store";

let batch: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Completing a task: the checkbox fills at once, the row lingers ~600ms, then
 * leaves the list and an Undo toast appears. Several completions in a row
 * share one toast ("3 tasks completed") whose Undo re-opens all of them.
 */
export function toggleTask(task: Pick<Task, "id" | "completed">, element?: Element | null): void {
  if (task.completed) {
    setTaskCompleted(task.id, false);
    return;
  }
  useUi.getState().linger(task.id);
  setTaskCompleted(task.id, true, originOf(element));
  batch.push(task.id);
  const ids = batch.slice();
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    batch = [];
    batchTimer = null;
  }, UNDO_MS + LINGER_MS);
  setTimeout(() => {
    toast(ids.length === 1 ? "Task completed" : `${ids.length} tasks completed`, {
      id: "task-completed",
      undo: () => {
        for (const id of ids) setTaskCompleted(id, false);
        batch = batch.filter((id) => !ids.includes(id));
      },
    });
  }, LINGER_MS);
}

/** Presents just-completed tasks as still open while they linger, so views keep their row for a moment. */
export function withLingering<T extends Pick<Task, "id" | "completed">>(
  tasks: readonly T[],
  lingering: ReadonlySet<string>,
): T[] {
  if (lingering.size === 0) return tasks as T[];
  return tasks.map((t) => (t.completed && lingering.has(t.id) ? { ...t, completed: false } : t));
}
