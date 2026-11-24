"use client";

import type { GoalList } from "@stellar/db";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Page, PageHeader } from "@/components/ui/page";
import { PushedScreen } from "@/components/ui/pushed-screen";
import { markPushed, navigateWithTransition, takePushed } from "@/lib/client/nav-transition";
import { useMounted } from "@/components/ui/use-media";
import { useCollection } from "@/lib/client/data/hooks";
import { QuoteCard, TimeProgressCard } from "./cards";
import { GoalListDetail } from "./goal-list-detail";
import { GoalListsGrid } from "./goal-lists";

export function GoalsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mounted = useMounted();
  const { rows: lists } = useCollection("sp_goal_lists");
  const { rows: goals } = useCollection("sp_goals");
  const sorted = useMemo(() => [...lists].sort((a, b) => a.sort_order - b.sort_order), [lists]);
  const listId = params.get("list");
  const index = sorted.findIndex((l) => l.id === listId);
  const open = index >= 0 ? sorted[index] : null;

  const openList = useCallback(
    (list: GoalList) => {
      markPushed();
      navigateWithTransition("push", () =>
        router.push(`${pathname}?list=${list.id}`, { scroll: true }),
      );
    },
    [router, pathname],
  );
  const back = useCallback(() => {
    // The system's own back gesture may already have left this screen.
    if (!new URLSearchParams(window.location.search).has("list")) return;
    const pop = takePushed();
    navigateWithTransition("pop", () => (pop ? router.back() : router.replace(pathname)));
  }, [router, pathname]);

  if (open) {
    return (
      <Page>
        <PushedScreen onBack={back} underlay={mounted ? <GoalListsGrid onOpen={openList} /> : null}>
          <GoalListDetail list={open} index={index} goals={goals} onBack={back} />
        </PushedScreen>
      </Page>
    );
  }

  return (
    <Page wide>
      <PageHeader title="Goals" />
      <div className="grid gap-4 lg:grid-cols-2">
        {mounted ? <QuoteCard /> : <div className="glass min-h-[92px] rounded-card" />}
        <TimeProgressCard />
      </div>
      <div className="mt-8">{mounted && <GoalListsGrid onOpen={openList} />}</div>
    </Page>
  );
}
