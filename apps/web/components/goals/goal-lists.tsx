"use client";

import type { GoalList } from "@stellar/db";
import { listProgress } from "@stellar/shared";
import { useMemo, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { DragIcon, PlusIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress";
import { Sortable, SortableItem } from "@/components/ui/sortable";
import { applyMove, ListFormSheet, rebalance } from "@/components/tasks/lists";
import {
  createGoalList,
  deleteGoalList,
  moveGoalList,
  updateGoalList,
} from "@/lib/client/data/goals";
import { useCollection } from "@/lib/client/data/hooks";
import { MiniPlanet } from "./cards";

/** Goal lists: reorderable cards with emoji, a mini planet, a progress bar and "X of Y · NN%". */
export function GoalListsGrid({ onOpen }: { onOpen: (list: GoalList) => void }) {
  const { rows: lists, loading } = useCollection("sp_goal_lists");
  const { rows: goals } = useCollection("sp_goals");
  const [creating, setCreating] = useState(false);
  const sorted = useMemo(() => [...lists].sort((a, b) => a.sort_order - b.sort_order), [lists]);
  const progress = useMemo(() => {
    const map = new Map<string, ReturnType<typeof listProgress>>();
    for (const l of lists) map.set(l.id, listProgress(goals.filter((g) => g.list_id === l.id)));
    return map;
  }, [lists, goals]);

  return (
    <section aria-labelledby="goal-lists-title" data-testid="goal-lists">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="goal-lists-title" className="text-title3">
          Goal lists
        </h2>
        <IconButton
          label="New goal list"
          variant="glass"
          size={36}
          onClick={() => setCreating(true)}
        >
          <PlusIcon size={18} />
        </IconButton>
      </div>
      {sorted.length === 0 && !loading ? (
        <div className="glass rounded-card">
          <EmptyState
            title="No planets yet."
            body="Create a list, add goals to it, and watch a planetary system form as you make progress."
          />
        </div>
      ) : (
        <Sortable
          ids={sorted.map((l) => l.id)}
          layout="grid"
          onMove={(id, b, a) =>
            applyMove(sorted, id, b, a, moveGoalList, () => rebalance("sp_goal_lists"))
          }
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {sorted.map((list, index) => {
              const p = progress.get(list.id) ?? listProgress([]);
              return (
                <SortableItem key={list.id} id={list.id}>
                  {({ handle, dragging }) => (
                    <div
                      className={cx(
                        "glass relative h-full rounded-card transition-[box-shadow,transform] duration-200",
                        dragging && "scale-[1.03] shadow-[0_18px_44px_rgba(0,0,0,0.5)]",
                      )}
                      data-testid="goal-list-card"
                      data-list={list.name}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(list)}
                        aria-label={`Open ${list.name}`}
                        className="flex h-full w-full flex-col rounded-card p-4 text-left"
                      >
                        <span className="flex w-full items-start justify-between pr-7">
                          <span className="text-[28px] leading-8" aria-hidden="true">
                            {list.emoji}
                          </span>
                          <MiniPlanet
                            progress={p.fraction}
                            index={index}
                            complete={p.allComplete}
                          />
                        </span>
                        <span className="mt-4 block w-full truncate text-headline text-fg">
                          {list.name}
                        </span>
                        <ProgressBar
                          value={p.fraction}
                          label={`${list.name} progress`}
                          valueText={`${p.complete} of ${p.total} complete, ${p.percent}%`}
                          className="mt-2.5"
                        />
                        <span className="mt-2 block text-footnote text-fg-2 tnum">
                          {p.total === 0
                            ? "No goals yet"
                            : `${p.complete} of ${p.total} · ${p.percent}%`}
                        </span>
                      </button>
                      <button
                        type="button"
                        {...handle}
                        aria-label={`Reorder ${list.name}`}
                        className="absolute right-1 top-1.5 flex size-9 cursor-grab touch-none items-center justify-center rounded-chip text-fg-2/60 hover:bg-fill-hover hover:text-fg active:cursor-grabbing"
                      >
                        <DragIcon size={18} />
                      </button>
                    </div>
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
        noun="goal list"
        defaultEmoji="🎯"
        onCreate={createGoalList}
        onUpdate={updateGoalList}
        onDelete={deleteGoalList}
      />
    </section>
  );
}
