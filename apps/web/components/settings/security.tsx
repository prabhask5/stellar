"use client";

import type { DeviceInfo } from "@stellar/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PinPad } from "@/components/auth/pin-pad";
import { rememberPinLength } from "@/components/auth/lock-screen";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { DevicesIcon, PuzzleIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { api, ApiRequestError } from "@/lib/client/api";
import { keys, queryClient } from "@/lib/client/cache";
import { useReady, useSettings } from "@/lib/client/data/hooks";
import { updateSettings } from "@/lib/client/data/settings";
import { clearLocalData } from "@/lib/client/persist";
import { clearSessionState } from "@/lib/client/session";
import { toast, toastError } from "@/lib/client/toast";
import { InlineSelect, relativeTime, Section } from "./parts";

const LOCK_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "5", label: "After 5 minutes" },
  { value: "60", label: "After 1 hour" },
  { value: "1440", label: "After 1 day" },
] as const;

const KIND_LABEL: Record<DeviceInfo["kind"], string> = {
  web: "Browser",
  pwa: "Installed app",
  extension: "Browser extension",
  ios: "iPhone app",
};

/** Leaves this device: clears everything stored locally, then shows the PIN screen. */
async function leave(): Promise<void> {
  clearSessionState();
  queryClient.clear();
  await clearLocalData();
  window.location.replace("/lock");
}

function ChangePin({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<"current" | "new" | "confirm">("current");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("current");
    setCurrent("");
    setNext("");
    setPin("");
    setError(null);
    setBusy(false);
  };
  const fail = (message: string, back: "current" | "new" = "current") => {
    setError(message);
    setErrorKey((k) => k + 1);
    setPin("");
    setStep(back);
    setBusy(false);
  };

  const submit = async (value: string) => {
    if (busy || value.length < 6) return;
    setError(null);
    if (step === "current") {
      setCurrent(value);
      setPin("");
      setStep("new");
    } else if (step === "new") {
      if (!/^\d{6,12}$/.test(value)) return fail("Use 6 to 12 digits.", "new");
      setNext(value);
      setPin("");
      setStep("confirm");
    } else {
      if (value !== next) return fail("Those didn't match. Enter the new PIN again.", "new");
      setBusy(true);
      try {
        await api("/api/v1/auth/pin/change", { body: { current_pin: current, new_pin: value } });
        rememberPinLength(value.length);
        toast("PIN changed", { tone: "success" });
        onOpenChange(false);
        reset();
      } catch (err) {
        fail(err instanceof ApiRequestError ? err.message : "Could not change the PIN. Try again.");
      }
    }
  };

  const title =
    step === "current"
      ? "Enter your current PIN"
      : step === "new"
        ? "Choose a new PIN"
        : "Enter the new PIN again";
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title="Change PIN"
      width={400}
    >
      <div className="flex flex-col items-center pb-2 text-center">
        <p className="mb-5 text-subhead text-fg-2">{title}</p>
        <PinPad
          label={title}
          value={pin}
          onChange={setPin}
          onSubmit={submit}
          disabled={busy}
          errorKey={errorKey}
        />
        <p className="mt-4 min-h-5 text-subhead text-warning" role="alert">
          {error}
        </p>
        <Button
          variant="primary"
          size="lg"
          block
          loading={busy}
          disabled={pin.length < 6}
          onClick={() => submit(pin)}
          className="mt-3"
        >
          {step === "confirm" ? "Change PIN" : "Continue"}
        </Button>
      </div>
    </Sheet>
  );
}

interface DevicesResponse {
  data: DeviceInfo[];
  can_revoke: boolean;
}

export function SecuritySection() {
  const settings = useSettings();
  const ready = useReady((s) => s.ready);
  const client = useQueryClient();
  const devices = useQuery({
    queryKey: keys.devices,
    queryFn: () => api<DevicesResponse>("/api/v1/devices"),
    enabled: ready,
    staleTime: 30_000,
  });
  const [pinOpen, setPinOpen] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const [revoking, setRevoking] = useState<DeviceInfo | null>(null);

  const revoke = async (device: DeviceInfo) => {
    try {
      await api(`/api/v1/devices/${device.id}`, { method: "DELETE" });
      toast(`Signed out ${device.name}`, { tone: "success" });
      await client.invalidateQueries({ queryKey: keys.devices });
    } catch (err) {
      toastError(err instanceof ApiRequestError ? err.message : "Could not revoke that device.");
    }
  };

  const signOut = async () => {
    await api("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    await leave();
  };

  const signOutEverywhere = async () => {
    try {
      await api("/api/v1/auth/logout-everywhere", { method: "POST" });
      await leave();
    } catch (err) {
      toastError(err instanceof ApiRequestError ? err.message : "Could not sign out everywhere.");
    }
  };

  const active = (devices.data?.data ?? []).filter((d) => !d.revoked_at);
  const lockValue = settings?.lock_after_minutes ? String(settings.lock_after_minutes) : "off";

  return (
    <Section id="security" title="Security">
      <GroupedList>
        <ListRow
          title="Change PIN"
          subtitle="You'll need your current PIN."
          onClick={() => setPinOpen(true)}
        />
        <ListRow
          as="label"
          htmlFor="set-lock"
          title="Lock after inactivity"
          subtitle="Asks for your PIN again when you come back."
          trailing={
            <InlineSelect
              id="set-lock"
              label="Lock after inactivity"
              value={lockValue as (typeof LOCK_OPTIONS)[number]["value"]}
              options={LOCK_OPTIONS}
              onChange={(v) =>
                updateSettings({ lock_after_minutes: v === "off" ? null : Number(v) })
              }
            />
          }
        />
      </GroupedList>

      <div>
        <h3 className="mb-2 mt-2 px-1 text-[15px] font-semibold text-fg-2">Devices</h3>
        <GroupedList role="list" aria-label="Devices" data-testid="devices">
          {active.map((d) => (
            <div
              key={d.id}
              role="listitem"
              className="flex min-h-[60px] items-center gap-3 px-4 py-2"
            >
              <span className="text-fg-2">
                {d.kind === "extension" ? <PuzzleIcon size={22} /> : <DevicesIcon size={22} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-fg">
                  {d.name}
                  {d.current && (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-caption text-accent">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-footnote text-fg-2">
                  {KIND_LABEL[d.kind]} ·{" "}
                  {d.current
                    ? "Active now"
                    : `Last seen ${relativeTime(d.last_seen_at).toLowerCase()}`}
                </p>
              </div>
              {!d.current && devices.data?.can_revoke && (
                <Button variant="danger" size="sm" onClick={() => setRevoking(d)}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
          {active.length === 0 && (
            <p className="px-4 py-4 text-subhead text-fg-2">
              {devices.isLoading ? "Loading devices" : "No devices yet."}
            </p>
          )}
        </GroupedList>
        {devices.data && !devices.data.can_revoke && (
          <p className="mt-2 px-1 text-footnote text-fg-2">
            To sign out a single device, add the Postgres connection string under Connection. “Sign
            out everywhere” always works.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={signOut}>
          Sign out
        </Button>
        <Button variant="danger" onClick={() => setEverywhere(true)}>
          Sign out everywhere
        </Button>
      </div>

      <ChangePin open={pinOpen} onOpenChange={setPinOpen} />
      <ConfirmDialog
        open={everywhere}
        onOpenChange={setEverywhere}
        title="Sign out everywhere?"
        body="Every browser, installed app and extension will need your PIN again. Your data is not affected."
        confirmLabel="Sign out everywhere"
        onConfirm={signOutEverywhere}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Sign out ${revoking?.name ?? "device"}?`}
        body="It will need your PIN to connect again. This can take up to an hour to reach a device that is in use right now."
        confirmLabel="Revoke"
        onConfirm={() => revoking && void revoke(revoking)}
      />
    </Section>
  );
}
