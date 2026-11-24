"use client";

import type { Goal } from "@stellar/db";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { FieldShell, inputClass, TextField } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { createGoal, deleteGoal, updateGoal } from "@/lib/client/data/goals";

export interface GoalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  /** Present when editing. */
  goal?: Goal | null;
}

/** Add or edit a goal: name, description, Todo / Progress, and for progress goals a total and an optional unit. */
export function GoalSheet({ open, onOpenChange, listId, goal }: GoalSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"todo" | "progress">("todo");
  const [total, setTotal] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setDescription(goal?.description ?? "");
    setType(goal?.type ?? "todo");
    setTotal(goal?.total_amount ? String(goal.total_amount) : "");
    setUnit(goal?.unit ?? "");
    setError(null);
  }, [open, goal]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the goal a name.");
    const amount = Number(total.replace(",", "."));
    if (type === "progress" && (!Number.isFinite(amount) || amount <= 0))
      return setError("Enter a total above zero.");
    const fields = {
      name: trimmed,
      description: description.trim() || null,
      type,
      total_amount: type === "progress" ? amount : null,
      unit: type === "progress" ? unit.trim() || null : null,
    };
    if (goal) updateGoal(goal.id, fields);
    else createGoal({ list_id: listId, ...fields });
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? "Edit goal" : "New goal"}
      width={440}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="goal-sheet" noValidate>
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={500}
          autoFocus
          placeholder="What do you want to achieve?"
        />
        <FieldShell label="Description" htmlFor="goal-description" optional>
          <textarea
            autoComplete="off"
            enterKeyHint="enter"
            autoCapitalize="sentences"
            id="goal-description"
            rows={2}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={cx(inputClass, "h-auto resize-none py-2.5 leading-snug")}
          />
        </FieldShell>
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-fg-2">Type</span>
          <SegmentedControl
            label="Goal type"
            value={type}
            onChange={setType}
            options={[
              { value: "todo", label: "Todo", hint: "done or not done" },
              { value: "progress", label: "Progress", hint: "counts towards a total" },
            ]}
          />
          <p className="text-footnote text-fg-2">
            {type === "todo"
              ? "Done or not done."
              : "Counts up towards a total, like 20 books or 500 km."}
          </p>
        </div>
        {type === "progress" && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Total"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="20"
            />
            <TextField
              label="Unit"
              optional
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={40}
              placeholder="books"
            />
          </div>
        )}
        {goal && goal.type === "progress" && type === "todo" && (
          <p className="text-footnote text-warning">
            Switching to a todo goal clears its recorded progress.
          </p>
        )}
        {error && (
          <p className="text-footnote text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-1 flex gap-3">
          {goal && (
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                deleteGoal(goal.id);
                onOpenChange(false);
              }}
            >
              Delete
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" className="flex-1">
            {goal ? "Save" : "Add goal"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
