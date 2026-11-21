import type { Metadata } from "next";
import { Suspense } from "react";
import { TasksPage } from "@/components/tasks/tasks-page";

export const metadata: Metadata = { title: "Tasks" };

export default function Tasks() {
  // useSearchParams needs a Suspense boundary for the page to stay statically rendered.
  return (
    <Suspense fallback={null}>
      <TasksPage />
    </Suspense>
  );
}
