"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { BellIcon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import {
  disablePush,
  enablePush,
  type PushStatus,
  pushStatus,
  sendTestPush,
} from "@/lib/client/push";
import { toast, toastError } from "@/lib/client/toast";
import { Section } from "./parts";

export function usePush() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    pushStatus()
      .then(setStatus)
      .catch(() => setStatus({ support: "unsupported", permission: "default", subscribed: false }));
  }, []);
  useEffect(refresh, [refresh]);

  const toggle = useCallback(
    async (on: boolean) => {
      setBusy(true);
      try {
        if (on) {
          await enablePush();
          toast("Notifications are on", { tone: "success" });
        } else {
          await disablePush();
          toast("Notifications are off");
        }
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Could not change notifications.");
      }
      setBusy(false);
      refresh();
    },
    [refresh],
  );
  return { status, busy, toggle };
}

const IOS_HINT =
  "On iPhone and iPad, first add Stellar Planner to your Home Screen (Share, then Add to Home Screen). Notifications work from the installed app.";

/** Subscribe / unsubscribe for web push. Permission is only requested from this button, never on load. */
export function NotificationsSection() {
  const { status, busy, toggle } = usePush();
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const r = await sendTestPush();
      toast(r.sent > 0 ? "Test notification sent" : "No device is subscribed yet", {
        tone: r.sent > 0 ? "success" : "default",
      });
    } catch {
      toastError("Could not send a test notification.");
    }
    setTesting(false);
  };

  return (
    <Section
      id="notifications"
      title="Notifications"
      description="A short notification when a focus phase or a break ends. Nothing else is ever sent, and there is no sound in the app itself."
    >
      <GroupedList>
        {status?.support === "supported" || status === null ? (
          <ListRow
            as="label"
            htmlFor="set-push"
            leading={<BellIcon size={20} />}
            title="Phase-end notifications"
            subtitle={
              status?.permission === "denied"
                ? "Blocked in your browser settings for this site."
                : status?.subscribed
                  ? "On for this device."
                  : "Off for this device."
            }
            trailing={
              <Switch
                id="set-push"
                label="Phase-end notifications"
                checked={Boolean(status?.subscribed)}
                disabled={busy || status === null}
                onChange={(on) => void toggle(on)}
              />
            }
          />
        ) : (
          <div className="p-4 text-subhead text-fg-2" data-testid="push-unavailable">
            {status.support === "needs-install"
              ? IOS_HINT
              : "This browser does not support notifications for web apps."}
          </div>
        )}
        {status?.subscribed && (
          <ListRow
            title="Send a test"
            subtitle="Arrives on every device that has notifications on."
            trailing={
              <Button variant="secondary" size="sm" loading={testing} onClick={test}>
                Send
              </Button>
            }
          />
        )}
      </GroupedList>
      {status?.support === "supported" && (
        <p className="px-1 text-footnote text-fg-2">{IOS_HINT}</p>
      )}
    </Section>
  );
}
