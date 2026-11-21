import type { Metadata } from "next";
import { LockRoute } from "./lock-route";

export const metadata: Metadata = { title: "Unlock" };

export default function LockPage() {
  return <LockRoute />;
}
