import type { Metadata } from "next";
import { FocusPage } from "@/components/focus/focus-page";

export const metadata: Metadata = { title: "Focus" };

export default function Focus() {
  return <FocusPage />;
}
