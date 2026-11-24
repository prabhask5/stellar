"use client";

import type { Goal, GoalList } from "@stellar/db";
import { goalProgress, listProgress } from "@stellar/shared";
import { originOf } from "@stellar/universe/bus";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useMemo, useState } from "react";
import { applyMove, ListFormSheet, rebalance } from "@/components/tasks/lists";
import { AmountLabel } from "@/components/ui/amount";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cx } from "@/components/ui/cx";
import { GlassCard } from "@/components/ui/glass-card";
import { ChevronLeftIcon, DragIcon, EditIcon, PlusIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress";
import { Sortable, SortableItem } from "@/components/ui/sortable";
import { Stepper } from "@/components/ui/stepper";
import {
  deleteGoalList,
  incrementGoal,
  moveGoal,
  setGoalAmount,
  setGoalCompleted,
  updateGoalList,
} from "@/lib/client/data/goals";
import { MiniPlanet } from "./cards";
import { GoalSheet } from "./goal-sheet";

function GoalRow({
  goal,
  onEdit,
  handle,
}: {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  handle: React.HTMLAttributes<HTMLElement>;
}) {
  const dragHandle = (
    <button
      type="button"
      {...handle}
      aria-label={`Reorder “${goal.name}”`}
      className="flex size-9 touch:size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-chip text-fg-2/60 hover:bg-fill-hover hover:text-fg active:cursor-grabbing"
    >
      <DragIcon size={18} />
    </button>
  );

  if (goal.type === "todo") {
    return (
      <div
        className="flex min-h-[60px] items-center gap-1 pl-1.5 pr-3"
        data-testid="goal-row"
        data-goal={goal.name}
      >
        <Checkbox
          checked={goal.completed}
          label={goal.completed ? `Mark “${goal.name}” as not done` : `Complete “${goal.name}”`}
          onChange={(checked, el) => setGoalCompleted(goal.id, checked, originOf(el))}
        />
        <button
          type="button"
          onClick={() => onEdit(goal)}
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 text-left"
        >
          <span className="sr-only">Edit </span>
          <span
            className={cx(
              "block truncate transition-colors duration-200",
              goal.completed ? "text-fg-2 line-through decoration-fg-2/60" : "text-fg",
            )}
          >
            {goal.name}
          </span>
          {goal.description && (
            <span className="mt-0.5 block truncate text-footnote text-fg-2">
              {goal.description}
            </span>
          )}
        </button>
        {dragHandle}
      </div>
    );
  }

  const fraction = goalProgress(goal);
  return (
    <div
      className="flex items-center gap-3 py-3 pl-4 pr-3"
      data-testid="goal-row"
      data-goal={goal.name}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <button
            type="button"
            onClick={() => onEdit(goal)}
            className={cx(
              "max-w-full truncate text-left",
              goal.completed ? "text-fg-2" : "text-fg",
            )}
          >
            <span className="sr-only">Edit </span>
            {goal.name}
          </button>
          <AmountLabel
            current={goal.current_amount}
            total={goal.total_amount}
            unit={goal.unit}
            label={goal.name}
            onSet={(v, el) => setGoalAmount(goal.id, v, originOf(el))}
          />
        </div>
        {goal.description && (
          <p className="mt-0.5 truncate text-footnote text-fg-2">{goal.description}</p>
        )}
        <ProgressBar
          value={fraction}
          label={`${goal.name} progress`}
          valueText={`${goal.current_amount} of ${goal.total_amount ?? 0}${goal.unit ? ` ${goal.unit}` : ""}`}
          className="mt-2"
        />
      </div>
      <Stepper
        label={goal.name}
        value={goal.current_amount}
        unit={goal.unit}
        onStep={(delta, el) => incrementGoal(goal.id, delta, originOf(el))}
      />
      {dragHandle}
    </div>
  );
}

export interface GoalListDetailProps {
  list: GoalList;
  index: number;
  goals: Goal[];
  onBack: () => void;
}

/** One goal list: overall progress, then its goals with type-appropriate controls. */
export function GoalListDetail({ list, index, goals, onBack }: GoalListDetailProps) {
  const reduce = useReducedMotion();
  const [adding, setAdding] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState(false);
  const sorted = useMemo(
    () => goals.filter((g) => g.list_id === list.id).sort((a, b) => a.sort_order - b.sort_order),
    [goals, list.id],
  );
  const progress = useMemo(() => listProgress(sorted), [sorted]);
  const editingGoal = sorted.find((g) => g.id === editingGoalId) ?? null;

  return (
    <div data-testid="goal-list-detail">
      <div className="mb-4 flex items-center gap-3">
        <IconButton label="Back to goals" variant="glass" size={40} onClick={onBack}>
          <ChevronLeftIcon size={20} />
        </IconButton>
        <span className="text-[32px] leading-none" aria-hidden="true">
          {list.emoji}
        </span>
        <h1 className="min-w-0 flex-1 truncate text-title1">{list.name}</h1>
        <IconButton
          label="Edit goal list"
          variant="glass"
          size={40}
          onClick={() => setEditingList(true)}
        >
          <EditIcon size={18} />
        </IconButton>
      </div>

      <GlassCard
        radius="card"
        className="mb-6 flex items-center gap-4 p-5"
        data-testid="list-progress"
      >
        <div className="min-w-0 flex-1">
          <p className="text-footnote text-fg-2 tnum">
            {progress.total === 0
              ? "No goals yet"
              : `${progress.complete} of ${progress.total} complete`}
          </p>
          <p className="mt-0.5 text-title2 tnum">{progress.percent}%</p>
          <ProgressBar value={progress.fraction} label={`${list.name} progress`} className="mt-3" />
        </div>
        <MiniPlanet progress={progress.fraction} index={index} complete={progress.allComplete} />
      </GlassCard>

      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold text-fg-2">Goals</h2>
        <Button
          variant="tinted"
          size="sm"
          icon={<PlusIcon size={16} />}
          onClick={() => setAdding(true)}
        >
          Add goal
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="glass rounded-list">
          <EmptyState
            title="A system waiting to form."
            body="Add the first goal. Each one becomes a planet that grows as you make progress."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add goal
              </Button>
            }
          />
        </div>
      ) : (
        <Sortable
          ids={sorted.map((g) => g.id)}
          onMove={(id, b, a) =>
            applyMove(sorted, id, b, a, moveGoal, () => rebalance("sp_goals", list.id))
          }
        >
          <div
            role="list"
            aria-label={`${list.name} goals`}
            className="glass overflow-hidden rounded-list"
          >
            <AnimatePresence initial={false}>
              {sorted.map((goal, i) => (
                <m.div
                  key={goal.id}
                  role="listitem"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 38 }}
                  className={cx(i > 0 && "border-t border-separator")}
                >
                  <SortableItem id={goal.id}>
                    {({ handle, dragging }) => (
                      <div
                        className={cx(
                          dragging && "bg-[#1b1746] shadow-[0_12px_30px_rgba(0,0,0,0.45)]",
                        )}
                      >
                        <GoalRow
                          goal={goal}
                          onEdit={(g) => setEditingGoalId(g.id)}
                          handle={handle}
                        />
                      </div>
                    )}
                  </SortableItem>
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        </Sortable>
      )}

      <GoalSheet open={adding} onOpenChange={setAdding} listId={list.id} />
      <GoalSheet
        open={editingGoal !== null}
        onOpenChange={(o) => !o && setEditingGoalId(null)}
        listId={list.id}
        goal={editingGoal}
      />
      <ListFormSheet
        open={editingList}
        onOpenChange={setEditingList}
        list={list}
        noun="goal list"
        defaultEmoji="🎯"
        onCreate={() => {}}
        onUpdate={updateGoalList}
        onDelete={(id) => {
          deleteGoalList(id);
          onBack();
        }}
        deleteWarning={
          sorted.length === 0
            ? "The list is empty."
            : `Its ${sorted.length === 1 ? "goal is" : `${sorted.length} goals are`} deleted with it.`
        }
      />
    </div>
  );
}
