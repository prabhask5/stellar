"use client";

import type { RoutineLog } from "@stellar/db";
import { addDays, addMonths, type DateStr, endOfMonth, parts, toDateStr } from "@stellar/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Page } from "@/components/ui/page";
import { Sheet } from "@/components/ui/sheet";
import { useIsDesktop, useMounted } from "@/components/ui/use-media";
import { upsertRow } from "@/lib/client/cache";
import { useCollection, useReady, useToday, useWeekStart } from "@/lib/client/data/hooks";
import { getSupabase } from "@/lib/client/supabase";
import { DayPanel, dayTitle } from "./day-panel";
import { ManageRoutines } from "./manage";
import { MonthCalendar } from "./month-calendar";

/** Logs older than the cached window are loaded on demand for the month being viewed and merged into the cache. */
function useOlderLogs(from: DateStr, to: DateStr, today: DateStr): void {
  const ready = useReady((s) => s.ready);
  const needed = to < addDays(today, -400);
  const q = useQuery({
    queryKey: ["logs_range", from, to],
    enabled: ready && needed,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("sp_routine_logs")
        .select("*")
        .gte("date", from)
        .lte("date", to)
        .limit(5000);
      if (error) throw Object.assign(new Error(error.message), error);
      return data as RoutineLog[];
    },
  });
  useEffect(() => {
    for (const log of q.data ?? []) upsertRow("sp_routine_logs", log);
  }, [q.data]);
}

export function RoutinesPage() {
  const mounted = useMounted();
  const desktop = useIsDesktop();
  const today = useToday();
  const weekStart = useWeekStart();
  const { rows: routines } = useCollection("sp_routines");
  const { rows: logs } = useCollection("sp_routine_logs");
  const sorted = useMemo(
    () => [...routines].sort((a, b) => a.sort_order - b.sort_order),
    [routines],
  );
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const [selected, setSelected] = useState<DateStr | null>(null);
  const [sheetDate, setSheetDate] = useState<DateStr | null>(null);

  const view = cursor ?? { year: parts(today).year, month: parts(today).month };
  const first = toDateStr(view.year, view.month, 1);
  useOlderLogs(first, endOfMonth(first), today);

  const shift = (delta: number) => {
    const next = parts(addMonths(first, delta));
    setCursor({ year: next.year, month: next.month });
  };

  const onSelect = (date: DateStr) => {
    if (desktop) setSelected(date);
    else if (date === today) setSelected(null);
    else setSheetDate(date);
  };

  // Phones always show today's panel inline (other days open in a sheet); desktop shows the selected day.
  const inlineDate = desktop ? (selected ?? today) : today;

  return (
    <Page wide>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-large-title">Routines</h1>
        <div className="flex gap-2">
          <IconButton label="Previous month" variant="glass" size={40} onClick={() => shift(-1)}>
            <ChevronLeftIcon size={20} />
          </IconButton>
          <IconButton label="Next month" variant="glass" size={40} onClick={() => shift(1)}>
            <ChevronRightIcon size={20} />
          </IconButton>
        </div>
      </header>

      {mounted && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <GlassCard radius="card" className="p-4">
            <MonthCalendar
              year={view.year}
              month={view.month}
              today={today}
              weekStart={weekStart}
              routines={sorted}
              logs={logs}
              selected={desktop ? inlineDate : null}
              onSelect={onSelect}
            />
          </GlassCard>
          <div className="flex flex-col gap-4">
            <GlassCard radius="card" className="px-4 pb-2 pt-4">
              <DayPanel date={inlineDate} today={today} routines={sorted} logs={logs} />
            </GlassCard>
            <ManageRoutines routines={sorted} logs={logs} today={today} weekStart={weekStart} />
          </div>
        </div>
      )}

      <Sheet
        open={sheetDate !== null}
        onOpenChange={(o) => !o && setSheetDate(null)}
        title={sheetDate ? dayTitle(sheetDate, today) : "Day"}
      >
        {sheetDate && (
          <DayPanel date={sheetDate} today={today} routines={sorted} logs={logs} bare />
        )}
      </Sheet>
    </Page>
  );
}
