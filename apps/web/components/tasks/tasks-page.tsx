"use client";

import type { Task, TaskList } from "@stellar/db";
import { type DateStr, formatLongDate } from "@stellar/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { DateSheet } from "@/components/ui/date-chip";
import { Page } from "@/components/ui/page";
import { SegmentedControl } from "@/components/ui/segmented";
import { useIsDesktop, useMounted } from "@/components/ui/use-media";
import { useCollection, useToday, useWeekStart } from "@/lib/client/data/hooks";
import { updateTask } from "@/lib/client/data/tasks";
import { CalendarTab } from "./calendar-tab";
import { ListDetail } from "./list-detail";
import { TaskListsPanel } from "./lists";
import { QuickAddBar } from "./quick-add";
import { TaskSheet } from "./task-sheet";
import { AllTab, TodayTab } from "./views";

type Tab = "today" | "all" | "calendar" | "lists";
const TABS: { value: Tab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "all", label: "All" },
  { value: "calendar", label: "Calendar" },
  { value: "lists", label: "Lists" },
];

export function TasksPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mounted = useMounted();
  const desktop = useIsDesktop();
  const today = useToday();
  const weekStart = useWeekStart();
  const { rows: tasks, loading } = useCollection("sp_tasks");
  const { rows: lists } = useCollection("sp_task_lists");
  const [openId, setOpenId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<DateStr | null>(null);

  const rawTab = params.get("tab") as Tab | null;
  // On desktop the lists live in the right column, so "lists" is not a tab there.
  const tab: Tab =
    rawTab && TABS.some((t) => t.value === rawTab) && !(desktop && rawTab === "lists")
      ? rawTab
      : "today";
  const listId = params.get("list");
  const sortedLists = useMemo(
    () => [...lists].sort((a, b) => a.sort_order - b.sort_order),
    [lists],
  );
  const openList = listId ? (lists.find((l) => l.id === listId) ?? null) : null;
  const selectedDate = calendarDate ?? today;

  const navigate = useCallback(
    (next: { tab?: Tab; list?: string | null }, replace = false) => {
      const q = new URLSearchParams(params.toString());
      if (next.tab !== undefined) {
        if (next.tab === "today") q.delete("tab");
        else q.set("tab", next.tab);
      }
      if (next.list !== undefined) {
        if (next.list) q.set("list", next.list);
        else q.delete("list");
      }
      const url = q.size ? `${pathname}?${q}` : pathname;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, pathname, router],
  );

  const openTask = tasks.find((t) => t.id === openId) ?? null;
  const rescheduleTask = tasks.find((t) => t.id === rescheduleId) ?? null;
  const onOpen = useCallback((t: Task) => setOpenId(t.id), []);
  const onReschedule = useCallback((t: Task) => setRescheduleId(t.id), []);
  const onOpenList = useCallback((l: TaskList) => navigate({ list: l.id }), [navigate]);

  const tabs = desktop ? TABS.filter((t) => t.value !== "lists") : TABS;
  const showQuickAdd = !openList && tab !== "lists";
  const defaultDate = tab === "today" ? today : tab === "calendar" ? selectedDate : null;

  const main = openList ? (
    <ListDetail
      list={openList}
      tasks={tasks}
      lists={sortedLists}
      today={today}
      weekStart={weekStart}
      onBack={() => navigate({ list: null })}
      onOpen={onOpen}
    />
  ) : tab === "today" ? (
    <TodayTab
      tasks={tasks}
      today={today}
      loading={loading}
      onOpen={onOpen}
      onReschedule={onReschedule}
    />
  ) : tab === "all" ? (
    <AllTab
      tasks={tasks}
      today={today}
      loading={loading}
      onOpen={onOpen}
      onReschedule={onReschedule}
    />
  ) : tab === "calendar" ? (
    <CalendarTab
      tasks={tasks}
      today={today}
      weekStart={weekStart}
      selected={selectedDate}
      onSelect={setCalendarDate}
      onOpen={onOpen}
      onReschedule={onReschedule}
    />
  ) : (
    <TaskListsPanel onOpen={onOpenList} columns={3} />
  );

  return (
    <Page wide>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="min-w-0">
          <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow mb-1 text-fg-2">{mounted ? formatLongDate(today) : " "}</p>
              <h1 className="text-large-title">Tasks</h1>
            </div>
            {!openList && (
              <SegmentedControl
                label="Task view"
                value={tab}
                onChange={(t) => navigate({ tab: t }, true)}
                options={tabs}
                fit={desktop ? "content" : "equal"}
                className="lg:w-auto"
              />
            )}
          </header>
          {showQuickAdd && (
            <div className="mb-7">
              <QuickAddBar
                today={today}
                weekStart={weekStart}
                lists={sortedLists}
                defaultDate={defaultDate}
                shortcut
              />
            </div>
          )}
          {mounted && main}
        </div>
        {desktop && (
          <aside className="pt-2">
            <TaskListsPanel onOpen={onOpenList} />
          </aside>
        )}
      </div>

      <TaskSheet
        task={openTask}
        onClose={() => setOpenId(null)}
        lists={sortedLists}
        today={today}
        weekStart={weekStart}
      />
      <DateSheet
        open={rescheduleTask !== null}
        onOpenChange={(o) => !o && setRescheduleId(null)}
        title="Reschedule"
        value={{
          date: rescheduleTask?.due_date ?? null,
          time: rescheduleTask?.due_time ? rescheduleTask.due_time.slice(0, 5) : null,
        }}
        onChange={(v) =>
          rescheduleTask && updateTask(rescheduleTask.id, { due_date: v.date, due_time: v.time })
        }
        today={today}
        weekStart={weekStart}
      />
    </Page>
  );
}
