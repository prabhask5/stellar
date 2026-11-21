import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalsPage } from "@/components/goals/goals-page";

export const metadata: Metadata = { title: "Goals" };

export default function Goals() {
  return (
    <Suspense fallback={null}>
      <GoalsPage />
    </Suspense>
  );
}
