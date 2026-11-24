"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";
import { api, ApiRequestError } from "@/lib/client/api";
import { deviceKind, deviceName } from "@/lib/client/device";
import { PinPad } from "./pin-pad";

const PIN_LENGTH_KEY = "sp-pin-length";

export function rememberedPinLength(): number | null {
  try {
    const n = Number(localStorage.getItem(PIN_LENGTH_KEY));
    return n >= 6 && n <= 12 ? n : null;
  } catch {
    return null;
  }
}

export function rememberPinLength(length: number): void {
  try {
    localStorage.setItem(PIN_LENGTH_KEY, String(length));
  } catch {
    // private mode: auto-submit is simply unavailable
  }
}

export function forgetPinLength(): void {
  try {
    localStorage.removeItem(PIN_LENGTH_KEY);
  } catch {
    // ignored
  }
}

export interface LockScreenProps {
  /** "login" creates a session; "unlock" re-checks the PIN for the inactivity lock. */
  mode: "login" | "unlock";
  onSuccess: () => void;
}

function formatWait(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Full-screen PIN entry over the starfield. */
export function LockScreen({ mode, onSuccess }: LockScreenProps) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [autoLength, setAutoLength] = useState<number | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    setAutoLength(rememberedPinLength());
  }, []);

  useEffect(() => {
    if (lockedUntil === null) return;
    const t = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setError(null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const submit = useCallback(
    async (value: string) => {
      if (submitting.current || value.length < 6) return;
      submitting.current = true;
      setBusy(true);
      setError(null);
      try {
        if (mode === "login") {
          await api("/api/v1/auth/pin", {
            body: { pin: value, device: { name: deviceName(), kind: deviceKind() } },
          });
        } else {
          await api("/api/v1/auth/unlock", { body: { pin: value } });
        }
        rememberPinLength(value.length);
        onSuccess();
      } catch (err) {
        setPin("");
        setErrorKey((k) => k + 1);
        // The remembered length may be out of date (the PIN was changed on another device).
        // Stop submitting automatically, or every attempt at the new PIN would be cut short
        // and count towards the lockout.
        if (!(err instanceof ApiRequestError && err.code === "network")) {
          forgetPinLength();
          setAutoLength(null);
        }
        if (err instanceof ApiRequestError) {
          setError(err.message);
          if (err.code === "locked" && err.retryAfterSeconds) {
            setNow(Date.now());
            setLockedUntil(Date.now() + err.retryAfterSeconds * 1000);
          }
        } else {
          setError("Something went wrong. Try again.");
        }
        setBusy(false);
        submitting.current = false;
      }
    },
    [mode, onSuccess],
  );

  const waitSeconds = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = waitSeconds > 0;

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center px-safe pb-safe pt-safe"
      aria-labelledby="lock-title"
    >
      {/* Portrait: title, keypad, message, button in one column. Sideways phone: the keypad
          sits beside the rest, so everything, Unlock included, fits the height. */}
      <div className="grid w-full max-w-[340px] animate-fade-up grid-cols-1 justify-items-center flat:max-w-[640px] flat:grid-cols-2 flat:items-center flat:gap-x-10">
        <div className="flex flex-col items-center flat:col-start-1 flat:row-start-1 flat:self-end">
          <span className="mb-5 flex size-14 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-accent short:hidden">
            <LockIcon size={26} />
          </span>
          <p className="eyebrow text-fg-2">Stellar Planner</p>
          <h1 id="lock-title" className="mt-1.5 text-title1 short:text-title2">
            Enter your PIN
          </h1>
        </div>

        <div className="mt-7 short:mt-5 flat:col-start-2 flat:row-span-2 flat:row-start-1 flat:mt-0">
          <PinPad
            label="PIN"
            value={pin}
            onChange={(v) => {
              setPin(v);
              if (error && !locked) setError(null);
            }}
            onSubmit={submit}
            autoSubmitLength={autoLength}
            disabled={busy || locked}
            errorKey={errorKey}
          />
        </div>

        <div className="flex w-full flex-col items-center flat:col-start-1 flat:row-start-2 flat:self-start">
          <p
            className="mt-5 min-h-[40px] text-center text-subhead text-warning short:mt-2 short:min-h-[24px]"
            role="alert"
            aria-live="assertive"
          >
            {locked ? `Too many attempts. Try again in ${formatWait(waitSeconds)}.` : error}
          </p>

          <Button
            variant="primary"
            size="lg"
            block
            glow={pin.length >= 6}
            loading={busy}
            disabled={pin.length < 6 || locked}
            onClick={() => submit(pin)}
            className="mt-1"
          >
            Unlock
          </Button>
        </div>
      </div>
    </main>
  );
}
