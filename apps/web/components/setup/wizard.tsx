"use client";

import { isDateStr } from "@stellar/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PinPad } from "@/components/auth/pin-pad";
import { rememberPinLength } from "@/components/auth/lock-screen";
import { Button, Spinner } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { FieldShell, inputClass, TextArea, TextField } from "@/components/ui/field";
import { GlassCard } from "@/components/ui/glass-card";
import {
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  InfoIcon,
  SparkleIcon,
  WarningIcon,
  XIcon,
} from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/segmented";
import { api, ApiRequestError } from "@/lib/client/api";
import { deviceKind, deviceName } from "@/lib/client/device";

type Step = "welcome" | "connect" | "database" | "pin" | "profile" | "done";
const ORDER: Step[] = ["welcome", "connect", "database", "pin", "profile", "done"];

interface SetupState {
  stage: "connect" | "database" | "pin" | "complete";
  configured: boolean;
  firstRun: boolean;
  pinReset: boolean;
  resetPinEnv: boolean;
  version: string;
  latestSchemaVersion: number;
  appSecretSource: "env" | "file";
  fromEnv: {
    supabaseUrl: boolean;
    anonKey: boolean;
    serviceRoleKey: boolean;
    databaseUrl: boolean;
  };
  hasDatabaseUrl: boolean;
  supabaseUrl: string | null;
}

interface Check {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  hint?: string;
}

export const FIRST_LIGHT_KEY = "sp-first-light";

export function SetupWizard() {
  const [state, setState] = useState<SetupState | null>(null);
  const [step, setStep] = useState<Step>("welcome");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<SetupState>("/api/setup/state");
      setState(s);
      const wanted = new URLSearchParams(window.location.search).get("step");
      if (s.stage === "complete") {
        if (wanted === "profile" || wanted === "done") setStep(wanted);
        else window.location.replace("/");
      } else if (s.pinReset) setStep("pin");
      else if (s.stage === "pin") setStep("pin");
      else if (s.stage === "database") setStep("database");
      else setStep("welcome");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the setup state.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const go = useCallback((next: Step) => {
    setStep(next);
    const url = new URL(window.location.href);
    if (next === "profile" || next === "done") url.searchParams.set("step", next);
    else url.searchParams.delete("step");
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  if (loadError) {
    return (
      <Frame>
        <Header title="Setup can't start" body={loadError} />
        <Button variant="secondary" block onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Frame>
    );
  }
  if (!state) {
    return (
      <Frame>
        <div className="flex justify-center py-16 text-fg-2">
          <Spinner size={24} />
        </div>
      </Frame>
    );
  }

  const index = ORDER.indexOf(step);
  return (
    <Frame progress={state.pinReset ? null : index} total={ORDER.length}>
      {step === "welcome" && <Welcome state={state} onNext={() => go("connect")} />}
      {step === "connect" && (
        <Connect
          state={state}
          onBack={() => go("welcome")}
          onNext={(s) => (setState(s), go("database"))}
        />
      )}
      {step === "database" && <Database onBack={() => go("connect")} onNext={() => go("pin")} />}
      {step === "pin" && (
        <CreatePin reset={state.pinReset} onNext={() => go(state.pinReset ? "done" : "profile")} />
      )}
      {step === "profile" && <Profile onNext={() => go("done")} />}
      {step === "done" && <Done state={state} />}
    </Frame>
  );
}

// ── layout ──────────────────────────────────────────────────────────────────
function Frame({
  children,
  progress,
  total,
}: {
  children: React.ReactNode;
  progress?: number | null;
  total?: number;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-safe pb-safe pt-safe md:justify-center">
      <div className="my-auto w-full max-w-[480px] py-6">
        {typeof progress === "number" && total ? (
          <div
            className="mb-5 flex justify-center gap-1.5"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={progress + 1}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cx(
                  "h-1 rounded-full transition-all duration-300",
                  i === progress
                    ? "w-6 bg-accent"
                    : i < progress
                      ? "w-1.5 bg-accent/60"
                      : "w-1.5 bg-track",
                )}
              />
            ))}
          </div>
        ) : null}
        <GlassCard
          strong
          radius="hero"
          className="animate-fade-up p-6 md:p-8"
          data-testid="setup-card"
        >
          {children}
        </GlassCard>
      </div>
    </main>
  );
}

function Header({
  title,
  body,
  eyebrow,
}: {
  title: string;
  body?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="eyebrow mb-2 text-accent">{eyebrow}</p>}
      <h1 className="text-title1">{title}</h1>
      {body && <p className="mt-2 text-subhead text-fg-2">{body}</p>}
    </header>
  );
}

function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex gap-2.5 rounded-button border p-3 text-footnote",
        tone === "warning"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-hairline bg-fill-subtle text-fg-2",
      )}
    >
      <span className="mt-px shrink-0">
        {tone === "warning" ? <WarningIcon size={18} /> : <InfoIcon size={18} />}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Footer({ onBack, children }: { onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-7 flex items-center gap-3">
      {onBack && (
        <Button variant="secondary" size="lg" onClick={onBack} aria-label="Back" className="!px-4">
          <ChevronLeftIcon size={20} />
        </Button>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ── 1. welcome ──────────────────────────────────────────────────────────────
function Welcome({ state, onNext }: { state: SetupState; onNext: () => void }) {
  return (
    <div className="text-center">
      <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-accent">
        <SparkleIcon size={30} strokeWidth={2} />
      </span>
      <h1 className="text-large-title">Stellar Planner</h1>
      <p className="mx-auto mt-3 max-w-[340px] text-subhead text-fg-2">
        Tasks, goals, routines and focus, in a universe that grows with everything you finish. Setup
        takes about two minutes.
      </p>
      {state.appSecretSource === "file" && (
        <div className="mt-6 text-left">
          <Note>
            A secret key was generated and saved to <code className="text-fg">/data/secret</code>.
            It encrypts your configuration. Setting <code className="text-fg">APP_SECRET</code> in
            the environment instead is more secure, because the key then lives apart from the data.
          </Note>
        </div>
      )}
      <Footer>
        <Button variant="primary" size="lg" block glow onClick={onNext}>
          Get started
        </Button>
      </Footer>
    </div>
  );
}

// ── 2. connect ──────────────────────────────────────────────────────────────
function Connect({
  state,
  onBack,
  onNext,
}: {
  state: SetupState;
  onBack: () => void;
  onNext: (s: SetupState) => void;
}) {
  const [url, setUrl] = useState(state.supabaseUrl ?? "");
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const env = state.fromEnv;
  const alreadySaved = state.stage !== "connect";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; url: string | null; saved: boolean; checks: Check[] }>(
        "/api/setup/connect",
        {
          body: { url, anonKey, serviceRoleKey, databaseUrl },
        },
      );
      setChecks(res.checks);
      if (res.url) setUrl(res.url);
      if (res.ok && res.saved) {
        const next = await api<SetupState>("/api/setup/state");
        // Let the passing checks be seen for a moment before moving on.
        setTimeout(() => onNext(next), 700);
        return;
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  };

  const envHint = "Set by an environment variable.";
  return (
    <form onSubmit={submit} noValidate>
      <Header
        eyebrow="Step 1 of 4"
        title="Connect Supabase"
        body="Your data lives in your own Supabase. These keys are stored encrypted on this server and never leave it."
      />
      <div className="flex flex-col gap-4">
        <TextField
          label="Supabase URL"
          name="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://database.example.com"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          disabled={env.supabaseUrl}
          hint={
            env.supabaseUrl
              ? envHint
              : "The API address (the Kong gateway), not the Studio dashboard."
          }
          required
        />
        <TextField
          label="Anon key"
          name="anonKey"
          type="password"
          value={anonKey}
          onChange={(e) => setAnonKey(e.target.value)}
          placeholder={
            alreadySaved && !env.anonKey ? "Saved. Leave empty to keep it." : "eyJhbGciOi…"
          }
          autoComplete="off"
          spellCheck={false}
          mono
          disabled={env.anonKey}
          hint={env.anonKey ? envHint : undefined}
        />
        <TextField
          label="Service role key"
          name="serviceRoleKey"
          type="password"
          value={serviceRoleKey}
          onChange={(e) => setServiceRoleKey(e.target.value)}
          placeholder={
            alreadySaved && !env.serviceRoleKey ? "Saved. Leave empty to keep it." : "eyJhbGciOi…"
          }
          autoComplete="off"
          spellCheck={false}
          mono
          disabled={env.serviceRoleKey}
          hint={
            env.serviceRoleKey
              ? envHint
              : "Used only by this server, to create your private account."
          }
        />
        <TextField
          label="Postgres connection string"
          name="databaseUrl"
          type="password"
          optional
          value={databaseUrl}
          onChange={(e) => setDatabaseUrl(e.target.value)}
          placeholder={
            state.hasDatabaseUrl
              ? "Saved. Leave empty to keep it."
              : "postgresql://postgres:password@host:5432/postgres"
          }
          autoComplete="off"
          spellCheck={false}
          mono
          disabled={env.databaseUrl}
          hint={
            env.databaseUrl
              ? envHint
              : "Recommended. Lets Stellar Planner create and update its tables for you, and revoke single devices."
          }
        />
      </div>

      {checks && (
        <ul
          className="mt-5 flex flex-col gap-2.5"
          aria-label="Connection checks"
          data-testid="checks"
        >
          {checks.map((c) => (
            <li key={c.id + c.label} className="flex gap-2.5 text-footnote" data-ok={c.ok}>
              <StatusDot status={c.ok ? "done" : "failed"} />
              <div className="min-w-0">
                <p className={c.ok ? "text-fg" : "text-danger"}>
                  <span className="sr-only">{c.ok ? "Passed: " : "Failed: "}</span>
                  {c.message}
                </p>
                {c.hint && <p className="mt-0.5 text-fg-2">{c.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-4 text-footnote text-danger" role="alert">
          {error}
        </p>
      )}

      <Footer onBack={onBack}>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {busy ? "Checking" : "Test and continue"}
        </Button>
      </Footer>
    </form>
  );
}

type RowStatus = "pending" | "running" | "done" | "skipped" | "failed";

function StatusDot({ status }: { status: RowStatus }) {
  return (
    <span
      className={cx(
        "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full",
        status === "done" || status === "skipped"
          ? "bg-success/20 text-success"
          : status === "failed"
            ? "bg-danger/20 text-danger"
            : status === "running"
              ? "text-accent"
              : "border border-fg-2/40",
      )}
    >
      {(status === "done" || status === "skipped") && <CheckIcon size={12} strokeWidth={2.6} />}
      {status === "failed" && <XIcon size={12} strokeWidth={2.6} />}
      {status === "running" && <Spinner size={16} />}
    </span>
  );
}

// ── 3. database ─────────────────────────────────────────────────────────────
interface MigrationRow {
  version: number;
  name: string;
  status: RowStatus;
  error?: string;
}

function titleCase(name: string): string {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Database({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [rows, setRows] = useState<MigrationRow[]>([]);
  const [phase, setPhase] = useState<"running" | "done" | "manual" | "failed">("running");
  const [message, setMessage] = useState<string | null>(null);
  const [sql, setSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    setPhase("running");
    setMessage(null);
    try {
      const res = await fetch("/api/setup/migrate", { method: "POST", credentials: "same-origin" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Could not start the database setup.");
      }
      type Event =
        | { type: "plan"; migrations: { version: number; name: string }[] }
        | ({ type: "progress" } & MigrationRow)
        | { type: "result"; ok: boolean; method: string; error?: string; schemaVersion?: number };
      let finished = false;
      const handle = async (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        const event = JSON.parse(line) as Event;
        if (event.type === "plan") {
          setRows(event.migrations.map((m) => ({ ...m, status: "pending" })));
        } else if (event.type === "progress") {
          setRows((prev) =>
            prev.map((r) =>
              r.version === event.version ? { ...r, status: event.status, error: event.error } : r,
            ),
          );
        } else if (event.ok) {
          finished = true;
          setRows((prev) =>
            prev.map((r) => (r.status === "pending" ? { ...r, status: "done" } : r)),
          );
          setPhase("done");
        } else if (event.method === "manual") {
          finished = true;
          const text = await fetch("/api/setup/sql", { credentials: "same-origin" }).then((r) =>
            r.text(),
          );
          setSql(text);
          setPhase("manual");
        } else {
          finished = true;
          setMessage(event.error ?? "The database setup failed.");
          setPhase("failed");
        }
      };
      // Progress is streamed line by line where the browser exposes the response as a
      // stream; where it does not (some WebKit paths), the whole answer is read at the end.
      const reader = res.body?.getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            await handle(line);
          }
        }
        // A last line without a newline still counts.
        await handle(buffer + decoder.decode());
      } else {
        for (const line of (await res.text()).split("\n")) await handle(line);
      }
      // The connection ended before the server reported an outcome: do not sit on "running".
      if (!finished)
        throw new Error("The connection dropped during the database setup. Run it again.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The database setup failed.");
      setPhase("failed");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const verify = async () => {
    setVerifying(true);
    setMessage(null);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/setup/verify", {
        method: "POST",
      });
      if (res.ok) {
        setPhase("done");
        setSql(null);
        setRows((prev) => prev.map((r) => ({ ...r, status: "done" })));
      } else {
        setMessage(res.message);
      }
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : "Could not verify. Try again.");
    }
    setVerifying(false);
  };

  const copy = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
    } catch {
      const area = document.getElementById("setup-sql") as HTMLTextAreaElement | null;
      area?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <Header
        eyebrow="Step 2 of 4"
        title="Prepare the database"
        body={
          phase === "manual"
            ? "No direct database connection is available, so this step is done by hand. It takes a minute."
            : "Creating the tables Stellar Planner needs. They are all prefixed sp_, so they sit safely beside anything else in your database."
        }
      />

      {phase !== "manual" && (
        <ul className="flex flex-col gap-2.5" aria-label="Migrations" data-testid="migrations">
          {rows.map((r) => (
            <li key={r.version} className="flex gap-2.5 text-subhead" data-status={r.status}>
              <StatusDot status={r.status} />
              <div className="min-w-0">
                <p className={r.status === "pending" ? "text-fg-2" : "text-fg"}>
                  {titleCase(r.name)}
                </p>
                {r.error && (
                  <p className="mt-0.5 break-words text-footnote text-danger">{r.error}</p>
                )}
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="flex items-center gap-2.5 text-subhead text-fg-2">
              <Spinner /> Connecting to the database
            </li>
          )}
        </ul>
      )}

      {phase === "manual" && sql && (
        <div className="flex flex-col gap-4">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-subhead text-fg-2 marker:text-fg-2">
            <li>Copy the SQL below.</li>
            <li>Open your Supabase Studio SQL editor, paste, and run it.</li>
            <li>Come back and choose Verify.</li>
          </ol>
          <div className="relative">
            <TextArea
              id="setup-sql"
              label="Setup SQL"
              readOnly
              mono
              value={sql}
              rows={8}
              className="max-h-[220px] resize-none pr-3 text-[12px]"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <Button
            variant="tinted"
            block
            onClick={copy}
            icon={copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
          >
            {copied ? "Copied" : "Copy SQL"}
          </Button>
        </div>
      )}

      {message && (
        <p className="mt-4 break-words text-footnote text-danger" role="alert">
          {message}
        </p>
      )}

      {phase === "done" && (
        <p
          className="mt-5 flex items-center gap-2 text-subhead text-success"
          role="status"
          data-testid="db-ready"
        >
          <CheckIcon size={18} /> Your database is ready.
        </p>
      )}

      <Footer onBack={onBack}>
        {phase === "manual" ? (
          <Button variant="primary" size="lg" block loading={verifying} onClick={verify}>
            Verify
          </Button>
        ) : phase === "failed" ? (
          <Button variant="primary" size="lg" block onClick={run}>
            Try again
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={phase !== "done"}
            loading={phase === "running"}
            onClick={onNext}
          >
            Continue
          </Button>
        )}
      </Footer>
    </div>
  );
}

// ── 4. PIN ──────────────────────────────────────────────────────────────────
function CreatePin({ reset, onNext }: { reset: boolean; onNext: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const confirming = first !== null;

  const fail = (message: string) => {
    setError(message);
    setErrorKey((k) => k + 1);
    setPin("");
  };

  const submit = async (value: string) => {
    if (busy) return;
    if (!/^\d{6,12}$/.test(value)) {
      fail("Use 6 to 12 digits.");
      return;
    }
    if (!confirming) {
      setFirst(value);
      setPin("");
      setError(null);
      return;
    }
    if (value !== first) {
      setFirst(null);
      fail("Those didn't match. Start again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/setup/pin", {
        body: { pin: value, confirm: value, device: { name: deviceName(), kind: deviceKind() } },
      });
      rememberPinLength(value.length);
      onNext();
    } catch (err) {
      setFirst(null);
      fail(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <Header
        eyebrow={reset ? "PIN reset" : "Step 3 of 4"}
        title={confirming ? "Enter it again" : reset ? "Create a new PIN" : "Create your PIN"}
        body={
          confirming
            ? "Just to be sure."
            : "6 to 12 digits. You'll use it to unlock Stellar Planner on every device, including the browser extension."
        }
      />
      <PinPad
        label={confirming ? "Confirm PIN" : "New PIN"}
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (error) setError(null);
        }}
        onSubmit={submit}
        disabled={busy}
        errorKey={errorKey}
      />
      <p className="mt-4 min-h-[20px] text-subhead text-warning" role="alert">
        {error}
      </p>
      <div className="mt-3 flex w-full items-center gap-3">
        {confirming && (
          <Button
            variant="secondary"
            size="lg"
            aria-label="Back"
            className="!px-4"
            disabled={busy}
            onClick={() => {
              setFirst(null);
              setPin("");
              setError(null);
            }}
          >
            <ChevronLeftIcon size={20} />
          </Button>
        )}
        <Button
          variant="primary"
          size="lg"
          block
          className="flex-1"
          loading={busy}
          disabled={pin.length < 6}
          onClick={() => submit(pin)}
        >
          {confirming ? "Set PIN" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

// ── 5. about you ────────────────────────────────────────────────────────────
function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function timeZones(current: string): string[] {
  const supported = (): string[] => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  };
  const zones = supported();
  const set = new Set(["UTC", current, ...zones]);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function Profile({ onNext }: { onNext: () => void }) {
  const detected = useMemo(detectTimeZone, []);
  const [timezone, setTimezone] = useState(detected);
  const [weekStart, setWeekStart] = useState<"1" | "0">("1");
  const [birthdate, setBirthdate] = useState("");
  const [lifespan, setLifespan] = useState("85");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => timeZones(detected), [detected]);
  const today = new Date().toISOString().slice(0, 10);

  const save = async (includeOptional: boolean) => {
    setBusy(true);
    setError(null);
    const years = Number(lifespan);
    if (includeOptional && birthdate && (!isDateStr(birthdate) || birthdate > today)) {
      setError("Check your birthdate.");
      setBusy(false);
      return;
    }
    if (includeOptional && (!Number.isInteger(years) || years < 1 || years > 150)) {
      setError("Expected lifespan should be between 1 and 150 years.");
      setBusy(false);
      return;
    }
    try {
      await api("/api/v1/settings", {
        method: "PUT",
        body: {
          timezone,
          week_start: Number(weekStart),
          ...(includeOptional ? { birthdate: birthdate || null, lifespan_years: years } : {}),
        },
      });
      onNext();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save. Try again.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
      noValidate
    >
      <Header
        eyebrow="Step 4 of 4"
        title="About you"
        body="Used for your day, week and life progress. All of it is optional and can be changed later in Settings."
      />
      <div className="flex flex-col gap-4">
        <FieldShell
          label="Time zone"
          htmlFor="tz"
          hint={timezone === detected ? "Detected from this device." : undefined}
        >
          <select
            id="tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={cx(inputClass, "appearance-none pr-9")}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FieldShell>
        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-fg-2" id="ws-label">
            Week starts on
          </span>
          <SegmentedControl
            label="Week starts on"
            value={weekStart}
            onChange={setWeekStart}
            options={[
              { value: "1", label: "Monday" },
              { value: "0", label: "Sunday" },
            ]}
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <TextField
            label="Birthdate"
            optional
            type="date"
            name="birthdate"
            max={today}
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            className="min-w-0 [color-scheme:dark]"
          />
          <TextField
            label="Lifespan"
            type="number"
            name="lifespan"
            inputMode="numeric"
            min={1}
            max={150}
            value={lifespan}
            onChange={(e) => setLifespan(e.target.value)}
            className="w-[96px]"
          />
        </div>
        <p className="-mt-2 text-footnote text-fg-2">
          Your birthdate and expected lifespan (in years) draw the Life progress bar.
        </p>
      </div>
      {error && (
        <p className="mt-4 text-footnote text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-7 flex gap-3">
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => save(false)}>
          Skip
        </Button>
        <Button type="submit" variant="primary" size="lg" block className="flex-1" loading={busy}>
          Continue
        </Button>
      </div>
    </form>
  );
}

// ── 6. done ─────────────────────────────────────────────────────────────────
function Done({ state }: { state: SetupState }) {
  const enter = () => {
    try {
      // The Universe home plays "First Light" once when it sees this flag.
      if (state.firstRun || !state.pinReset) sessionStorage.setItem(FIRST_LIGHT_KEY, "1");
    } catch {
      // storage unavailable: skip the event
    }
    window.location.replace("/");
  };
  return (
    <div>
      <div className="text-center">
        <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-accent">
          <CheckIcon size={30} strokeWidth={2.4} />
        </span>
        <h1 className="text-title1">You&rsquo;re all set</h1>
        <p className="mx-auto mt-2 max-w-[340px] text-subhead text-fg-2">
          Your universe starts empty. Every task, goal, routine and focus session you finish adds to
          it.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {state.resetPinEnv && (
          <Note tone="warning">
            <code>RESET_PIN</code> is still set. Remove it from your environment now, or the PIN
            will be cleared again the next time the server restarts.
          </Note>
        )}
        <Note>
          One recommendation: set <code className="text-fg">GOTRUE_DISABLE_SIGNUP=true</code> (or{" "}
          <code className="text-fg">DISABLE_SIGNUP=true</code>) on your Supabase instance so nobody
          else can create an account there. Your data stays private either way, because every row is
          protected by row level security.
        </Note>
      </div>
      <Footer>
        <Button variant="primary" size="lg" block glow onClick={enter}>
          Enter your universe
        </Button>
      </Footer>
    </div>
  );
}
