"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { BellIcon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import {
  describeTest,
  disablePush,
  enablePush,
  type PushStatus,
  pushStatus,
  sendTestPush,
  syncPush,
} from "@/lib/client/push";
import { toast, toastError } from "@/lib/client/toast";
import { Section } from "./parts";

// One status for the whole app, so the switch in Settings and the prompt on Focus can never
// disagree: both read this, and a change made through either updates both.
let shared: PushStatus | null = null;
let started = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function refresh(): void {
  pushStatus()
    .catch((): PushStatus => ({ support: "unsupported", permission: "default", subscribed: false }))
    .then((next) => {
      shared = next;
      for (const fn of listeners) fn();
    });
}

function start(): void {
  if (started) return;
  started = true;
  refresh();
  // The first look can come before the service worker exists; look again once it does, and
  // make sure a device that is "on" is still registered with the server.
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker.ready
      .then(() => syncPush())
      .catch(() => {})
      .then(refresh);
  // Permission can be changed in the browser's own settings while the app is in the background.
  document.addEventListener("visibilitychange", () => !document.hidden && refresh());
}

export function usePush() {
  const status = useSyncExternalStore(
    subscribe,
    () => shared,
    () => null,
  );
  const [busy, setBusy] = useState(false);
  useEffect(start, []);

  const toggle = useCallback(async (on: boolean) => {
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
  }, []);
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
      const { ok, message } = describeTest(await sendTestPush());
      if (ok) toast(message, { tone: "success" });
      else toastError(message);
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
