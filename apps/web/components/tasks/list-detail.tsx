"use client";

import type { Task, TaskList } from "@stellar/db";
import { type DateStr, listView, type WeekStart } from "@stellar/shared";
import { useMemo, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ChevronLeftIcon, DragIcon, EditIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/page";
import { Sortable, SortableItem } from "@/components/ui/sortable";
import { withLingering } from "@/lib/client/complete";
import { deleteTaskList, moveTask, updateTaskList } from "@/lib/client/data/tasks";
import { useShowCompleted } from "@/lib/client/prefs";
import { useUi } from "@/lib/client/ui-store";
import { applyMove, ListFormSheet, rebalance } from "./lists";
import { QuickAddBar } from "./quick-add";
import { TaskRow } from "./task-row";
import { ShowCompletedToggle } from "./views";

export interface ListDetailProps {
  list: TaskList;
  tasks: Task[];
  lists: TaskList[];
  today: DateStr;
  weekStart: WeekStart;
  onBack: () => void;
  onOpen: (task: Task) => void;
}

/** One list: its own quick-add (no date chip), tasks in manual order, rename / emoji / delete. */
export function ListDetail({
  list,
  tasks,
  lists,
  today,
  weekStart,
  onBack,
  onOpen,
}: ListDetailProps) {
  const lingering = useUi((s) => s.lingering);
  const [showCompleted, setShowCompleted] = useShowCompleted("list");
  const [editing, setEditing] = useState(false);
  const all = useMemo(() => listView(tasks, list.id, true), [tasks, list.id]);
  const open = useMemo(
    () => listView(withLingering(tasks, lingering), list.id),
    [tasks, lingering, list.id],
  );
  const done = useMemo(
    () => all.filter((t) => t.completed && !lingering.has(t.id)),
    [all, lingering],
  );

  return (
    <div data-testid="list-detail">
      <div className="mb-4 flex items-center gap-3">
        <IconButton label="Back to tasks" variant="glass" size={40} onClick={onBack}>
          <ChevronLeftIcon size={20} />
        </IconButton>
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-fill-subtle text-[22px]"
          aria-hidden="true"
        >
          {list.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title2">{list.name}</h2>
          <p className="text-footnote text-fg-2 tnum">
            {open.length === 1 ? "1 task" : `${open.length} tasks`}
          </p>
        </div>
        <IconButton label="Edit list" variant="glass" size={40} onClick={() => setEditing(true)}>
          <EditIcon size={18} />
        </IconButton>
      </div>

      <QuickAddBar
        today={today}
        weekStart={weekStart}
        lists={lists}
        fixedListId={list.id}
        placeholder={`Add to ${list.name}…`}
      />

      <div className="mt-6">
        {open.length === 0 ? (
          <div className="glass rounded-list">
            <EmptyState
              title="Nothing here yet."
              body="Add the first item above."
              className="py-8"
            />
          </div>
        ) : (
          <Sortable
            ids={open.map((t) => t.id)}
            onMove={(id, b, a) =>
              applyMove(open, id, b, a, moveTask, () => rebalance("sp_tasks", list.id))
            }
          >
            <div
              role="list"
              aria-label={`${list.name} tasks`}
              className="glass overflow-hidden rounded-list [&>*+*]:border-t [&>*+*]:border-separator"
            >
              {open.map((task) => (
                <SortableItem key={task.id} id={task.id}>
                  {({ handle, dragging }) => (
                    <div
                      role="listitem"
                      className={cx(
                        dragging && "bg-[#1b1746] shadow-[0_12px_30px_rgba(0,0,0,0.45)]",
                      )}
                    >
                      <TaskRow
                        task={task}
                        today={today}
                        context="list"
                        onOpen={onOpen}
                        trailing={
                          <button
                            type="button"
                            {...handle}
                            aria-label={`Reorder “${task.name}”`}
                            className="flex size-9 touch:size-11 cursor-grab touch-none items-center justify-center rounded-chip text-fg-2/60 hover:bg-fill-hover hover:text-fg active:cursor-grabbing"
                          >
                            <DragIcon size={18} />
                          </button>
                        }
                      />
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </Sortable>
        )}
      </div>

      {showCompleted && done.length > 0 && (
        <div
          role="list"
          aria-label="Completed"
          className="glass mt-6 overflow-hidden rounded-list [&>*+*]:border-t [&>*+*]:border-separator"
        >
          {done.map((task) => (
            <div role="listitem" key={task.id}>
              <TaskRow task={task} today={today} context="list" onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
      <ShowCompletedToggle view="list" value={showCompleted} onChange={setShowCompleted} />

      <ListFormSheet
        open={editing}
        onOpenChange={setEditing}
        list={list}
        noun="list"
        defaultEmoji="📋"
        onCreate={() => {}}
        onUpdate={updateTaskList}
        onDelete={(id) => {
          deleteTaskList(id);
          onBack();
        }}
        deleteWarning={
          all.length === 0
            ? "The list is empty."
            : `Its ${all.length === 1 ? "task is" : `${all.length} tasks are`} deleted with it.`
        }
      />
    </div>
  );
}
