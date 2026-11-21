"use client";

import type { Task } from "@stellar/db";
import { allView, type DateStr, todayView } from "@stellar/shared";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/grouped-list";
import { EmptyState } from "@/components/ui/page";
import { Switch } from "@/components/ui/switch";
import { withLingering } from "@/lib/client/complete";
import { postponeOverdue } from "@/lib/client/data/tasks";
import { useShowCompleted } from "@/lib/client/prefs";
import { useUi } from "@/lib/client/ui-store";
import { TaskGroup } from "./task-group";

interface TabProps {
  tasks: Task[];
  today: DateStr;
  loading: boolean;
  onOpen: (task: Task) => void;
  onReschedule: (task: Task) => void;
}

export function ShowCompletedToggle({
  view,
  value,
  onChange,
}: {
  view: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = `show-completed-${view}`;
  return (
    <label
      htmlFor={id}
      className="mt-5 flex cursor-pointer items-center justify-between gap-3 px-1 text-[15px] text-fg-2"
    >
      Show completed
      <Switch id={id} label="Show completed" checked={value} onChange={onChange} />
    </label>
  );
}

/** Today: Overdue (with "Move all to today") then Today, earliest due first. */
export function TodayTab({ tasks, today, loading, onOpen, onReschedule }: TabProps) {
  const lingering = useUi((s) => s.lingering);
  const [showCompleted, setShowCompleted] = useShowCompleted("today");
  const view = useMemo(
    () => todayView(withLingering(tasks, lingering), today),
    [tasks, lingering, today],
  );
  const empty = view.overdue.length === 0 && view.today.length === 0;

  return (
    <div data-testid="today-tab">
      {view.overdue.length > 0 && (
        <section aria-label="Overdue" className="mb-7">
          <SectionHeader
            tone="warning"
            action={
              <Button variant="tinted" size="sm" onClick={() => postponeOverdue()}>
                Move all to today
              </Button>
            }
          >
            Overdue · <span className="tnum">{view.overdue.length}</span>
          </SectionHeader>
          <TaskGroup
            label="Overdue tasks"
            tasks={view.overdue}
            today={today}
            context="today"
            onOpen={onOpen}
            onReschedule={onReschedule}
          />
        </section>
      )}
      {view.today.length > 0 && (
        <section aria-label="Today">
          <SectionHeader>
            Today · <span className="tnum">{view.today.length}</span>
          </SectionHeader>
          <TaskGroup
            label="Today's tasks"
            tasks={view.today}
            today={today}
            context="today"
            onOpen={onOpen}
            onReschedule={onReschedule}
          />
        </section>
      )}
      {empty && !loading && <EmptyState title="Clear skies." body="Nothing left in orbit today." />}
      {showCompleted && view.completed.length > 0 && (
        <section aria-label="Completed today" className="mt-7">
          <SectionHeader>
            Completed · <span className="tnum">{view.completed.length}</span>
          </SectionHeader>
          <TaskGroup
            label="Completed today"
            tasks={view.completed}
            today={today}
            context="today"
            onOpen={onOpen}
          />
        </section>
      )}
      <ShowCompletedToggle view="today" value={showCompleted} onChange={setShowCompleted} />
    </div>
  );
}

/** All: every non-list task grouped by date, undated last. */
export function AllTab({ tasks, today, loading, onOpen, onReschedule }: TabProps) {
  const lingering = useUi((s) => s.lingering);
  const [showCompleted, setShowCompleted] = useShowCompleted("all");
  const groups = useMemo(
    () => allView(showCompleted ? tasks : withLingering(tasks, lingering), today, showCompleted),
    [tasks, lingering, today, showCompleted],
  );

  return (
    <div data-testid="all-tab">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="mb-7">
          <SectionHeader tone={g.tone}>
            {g.label} · <span className="tnum">{g.tasks.length}</span>
          </SectionHeader>
          <TaskGroup
            label={`${g.label} tasks`}
            tasks={g.tasks}
            today={today}
            context="all"
            onOpen={onOpen}
            onReschedule={onReschedule}
          />
        </section>
      ))}
      {groups.length === 0 && !loading && (
        <EmptyState title="An open sky." body="Add a task above and it will appear here." />
      )}
      <ShowCompletedToggle view="all" value={showCompleted} onChange={setShowCompleted} />
    </div>
  );
}
