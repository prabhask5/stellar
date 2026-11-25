import type { Metadata } from "next";
import { DemoSwitch } from "./demo-switch";

export const metadata: Metadata = {
  title: "Demo",
  description: "Try Stellar Planner with sample data. Nothing you do is saved.",
};

export default function DemoPage() {
  return <DemoSwitch />;
}
