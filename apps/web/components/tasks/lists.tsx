"use client";

import type { TaskList } from "@stellar/db";
import { listCounts, needsRebalance } from "@stellar/shared";
import { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { cx } from "@/components/ui/cx";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { TextField } from "@/components/ui/field";
import { DragIcon, PlusIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/page";
import { Sheet } from "@/components/ui/sheet";
import { Sortable, SortableItem } from "@/components/ui/sortable";
import { keys, queryClient } from "@/lib/client/cache";
import { useCollection } from "@/lib/client/data/hooks";
import {
  createTaskList,
  deleteTaskList,
  moveTaskList,
  updateTaskList,
} from "@/lib/client/data/tasks";
import { enqueue } from "@/lib/client/outbox";

export interface ListCardProps {
  emoji: string;
  name: string;
  /** "12 tasks", or a progress line for goal lists. */
  meta: React.ReactNode;
  onOpen: () => void;
  handle?: React.HTMLAttributes<HTMLElement>;
  dragging?: boolean;
  children?: React.ReactNode;
  /** Top-right adornment, e.g. the mini planet on goal lists. */
  corner?: React.ReactNode;
}

/** Card with a 44px emoji tile, name, count or progress, and a 6-dot drag handle. */
export function ListCard({
  emoji,
  name,
  meta,
  onOpen,
  handle,
  dragging,
  children,
  corner,
}: ListCardProps) {
  return (
    <div
      className={cx(
        "glass relative flex h-full flex-col rounded-card transition-[box-shadow,transform] duration-200",
        dragging && "scale-[1.03] shadow-[0_18px_44px_rgba(0,0,0,0.5)]",
      )}
      data-testid="list-card"
      data-list={name}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col items-start rounded-card p-4 text-left"
      >
        {/* Named by its content ("Open Groceries 3 tasks"), so what is heard contains what is seen. */}
        <span className="sr-only">Open </span>
        <span
          className="mb-3 flex size-11 items-center justify-center rounded-[14px] bg-fill-subtle text-[22px] leading-none"
          aria-hidden="true"
        >
          {emoji}
        </span>
        <span className="block w-full truncate text-headline text-fg">{name}</span>
        {children}
        <span className="mt-0.5 block text-footnote text-fg-2 tnum">{meta}</span>
      </button>
      {corner && <span className="pointer-events-none absolute right-10 top-4">{corner}</span>}
      {handle && (
        <button
          type="button"
          {...handle}
          aria-label={`Reorder ${name}`}
          className="absolute right-1.5 top-2 flex size-9 cursor-grab touch-none items-center justify-center rounded-chip text-fg-2/70 hover:bg-fill-hover hover:text-fg active:cursor-grabbing"
        >
          <DragIcon size={18} />
        </button>
      )}
    </div>
  );
}

export interface ListFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  list?: { id: string; name: string; emoji: string | null } | null;
  noun: string;
  defaultEmoji: string;
  onCreate: (name: string, emoji: string) => void;
  onUpdate: (id: string, patch: { name: string; emoji: string }) => void;
  onDelete?: (id: string) => void;
  deleteWarning?: string;
}

/** Create or edit a list: emoji picker + name. Editing also offers delete with a confirmation. */
export function ListFormSheet({
  open,
  onOpenChange,
  list,
  noun,
  defaultEmoji,
  onCreate,
  onUpdate,
  onDelete,
  deleteWarning,
}: ListFormProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(defaultEmoji);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setName(list?.name ?? "");
      setEmoji(list?.emoji ?? defaultEmoji);
    }
  }, [open, list, defaultEmoji]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (list) onUpdate(list.id, { name: trimmed, emoji });
    else onCreate(trimmed, emoji);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={list ? `Edit ${noun}` : `New ${noun}`}
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
                placeholder={`Name this ${noun}`}
              />
            </div>
          </div>
          <div className="flex gap-3">
            {list && onDelete && (
              <Button variant="danger" size="lg" onClick={() => setConfirm(true)}>
                Delete
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1"
              disabled={!name.trim()}
            >
              {list ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Sheet>
      {list && onDelete && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete “${list.name}”?`}
          body={deleteWarning ?? "Everything in it is deleted too."}
          confirmLabel="Delete"
          onConfirm={() => {
            onDelete(list.id);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

/** Resolves the ranks around a drop position and rebalances when the gap is exhausted. */
export function applyMove<T extends { id: string; sort_order: number }>(
  rows: readonly T[],
  id: string,
  beforeId: string | null,
  afterId: string | null,
  move: (id: string, before: number | null, after: number | null) => void,
  rebalance: () => void,
): void {
  const rank = (rowId: string | null) =>
    rowId ? (rows.find((r) => r.id === rowId)?.sort_order ?? null) : null;
  const before = rank(beforeId);
  const after = rank(afterId);
  move(id, before, after);
  if (needsRebalance(before, after)) rebalance();
}

export function rebalance(
  table:
    "sp_task_lists" | "sp_goal_lists" | "sp_routines" | "sp_block_lists" | "sp_tasks" | "sp_goals",
  scope: string | null = null,
): void {
  enqueue({ kind: "rpc", fn: "sp_rebalance", args: { p_table: table, p_scope: scope } });
  setTimeout(() => void queryClient.invalidateQueries({ queryKey: keys.table(table) }), 1200);
}

/** Task lists: reorderable emoji cards with open-task counts and a "+" to create. */
export function TaskListsPanel({
  onOpen,
  columns = 2,
}: {
  onOpen: (list: TaskList) => void;
  columns?: 2 | 3;
}) {
  const { rows: lists, loading } = useCollection("sp_task_lists");
  const { rows: tasks } = useCollection("sp_tasks");
  const [creating, setCreating] = useState(false);
  const sorted = useMemo(() => [...lists].sort((a, b) => a.sort_order - b.sort_order), [lists]);
  const counts = useMemo(() => listCounts(tasks), [tasks]);

  return (
    <section aria-labelledby="task-lists-title" data-testid="task-lists">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="task-lists-title" className="text-title3">
          Task lists
        </h2>
        <IconButton
          label="New task list"
          variant="glass"
          size={36}
          onClick={() => setCreating(true)}
        >
          <PlusIcon size={18} />
        </IconButton>
      </div>
      <p className="mb-4 text-footnote text-fg-2">
        Drag to reorder. List tasks stay out of Today and All.
      </p>
      {sorted.length === 0 && !loading ? (
        <div className="glass rounded-card">
          <EmptyState
            title="No lists yet."
            body="Lists hold tasks without dates: groceries, ideas, a packing list."
            className="py-8"
          />
        </div>
      ) : (
        <Sortable
          ids={sorted.map((l) => l.id)}
          layout="grid"
          onMove={(id, b, a) =>
            applyMove(sorted, id, b, a, moveTaskList, () => rebalance("sp_task_lists"))
          }
        >
          <div
            className={cx(
              "grid gap-3",
              columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2",
            )}
          >
            {sorted.map((list) => {
              const n = counts.get(list.id) ?? 0;
              return (
                <SortableItem key={list.id} id={list.id}>
                  {({ handle, dragging }) => (
                    <ListCard
                      emoji={list.emoji}
                      name={list.name}
                      meta={n === 1 ? "1 task" : `${n} tasks`}
                      onOpen={() => onOpen(list)}
                      handle={handle}
                      dragging={dragging}
                    />
                  )}
                </SortableItem>
              );
            })}
          </div>
        </Sortable>
      )}
      <ListFormSheet
        open={creating}
        onOpenChange={setCreating}
        noun="list"
        defaultEmoji="📋"
        onCreate={createTaskList}
        onUpdate={updateTaskList}
        onDelete={deleteTaskList}
      />
    </section>
  );
}
