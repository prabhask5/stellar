import type { Metadata } from "next";
import { NotificationsSection } from "@/components/settings/notifications";
import { Settings } from "@/components/settings/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <Settings notifications={<NotificationsSection />} />;
}
