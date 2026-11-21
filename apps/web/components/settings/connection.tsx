"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { api, ApiRequestError } from "@/lib/client/api";
import { useReady } from "@/lib/client/data/hooks";
import { toast, toastError } from "@/lib/client/toast";
import { Section } from "./parts";

interface Connection {
  supabaseUrl: string;
  reachable: boolean;
  schemaVersion: number | null;
  latestSchemaVersion: number;
  upToDate: boolean;
  hasDatabaseUrl: boolean;
  fromEnv: {
    supabaseUrl: boolean;
    anonKey: boolean;
    serviceRoleKey: boolean;
    databaseUrl: boolean;
  };
  appSecretSource: "env" | "file";
  resetPinEnv: boolean;
  version: string;
}

interface Check {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  hint?: string;
}

const KEY = ["connection"] as const;

export function ConnectionSection() {
  const ready = useReady((s) => s.ready);
  const client = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api<Connection>("/api/setup/connection"),
    enabled: ready,
    staleTime: 15_000,
  });
  const [testing, setTesting] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [sql, setSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const c = q.data;

  const test = async () => {
    setTesting(true);
    try {
      const res = await api<{ ok: boolean; checks: Check[] }>("/api/setup/connect", {
        body: { dryRun: true },
      });
      setChecks(res.checks);
      await client.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      toastError(err instanceof ApiRequestError ? err.message : "Could not test the connection.");
    }
    setTesting(false);
  };

  const migrate = async () => {
    setMigrating(true);
    try {
      const res = await fetch("/api/setup/migrate", { method: "POST", credentials: "same-origin" });
      const lines = (await res.text()).trim().split("\n");
      const result = JSON.parse(lines[lines.length - 1] ?? "{}") as {
        ok?: boolean;
        method?: string;
        applied?: number[];
        error?: string;
      };
      if (result.ok) {
        toast(
          result.applied?.length
            ? `Applied ${result.applied.length} migration${result.applied.length === 1 ? "" : "s"}`
            : "The database is already up to date",
          { tone: "success" },
        );
      } else if (result.method === "manual") {
        setSql(await fetch("/api/setup/sql", { credentials: "same-origin" }).then((r) => r.text()));
      } else {
        toastError(result.error ?? "The migrations could not be run.");
      }
      await client.invalidateQueries({ queryKey: KEY });
    } catch {
      toastError("The migrations could not be run.");
    }
    setMigrating(false);
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/setup/verify", {
        method: "POST",
      });
      if (res.ok) {
        toast(res.message, { tone: "success" });
        setSql(null);
      } else toastError(res.message);
      await client.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      toastError(err instanceof ApiRequestError ? err.message : "Could not verify.");
    }
    setVerifying(false);
  };

  const status = !c ? "Checking" : !c.reachable ? "Unreachable" : "Connected";
  return (
    <Section id="connection" title="Connection">
      <GroupedList data-testid="connection">
        <ListRow
          title="Supabase"
          subtitle={c?.supabaseUrl ?? "…"}
          trailing={
            <span className="flex items-center gap-2 text-[15px]">
              <span
                className={`size-2 rounded-full ${!c ? "bg-fg-2" : c.reachable ? "bg-success" : "bg-danger"}`}
                aria-hidden="true"
              />
              {status}
            </span>
          }
        />
        <ListRow
          title="Schema version"
          subtitle={
            c && !c.upToDate
              ? `Version ${c.latestSchemaVersion} is available. Run migrations to update.`
              : undefined
          }
          trailing={
            <span className="tnum">
              {c
                ? `${c.schemaVersion ?? "none"}${c.upToDate ? "" : ` of ${c.latestSchemaVersion}`}`
                : "…"}
            </span>
          }
        />
        <ListRow
          title="Direct database access"
          subtitle={
            c?.hasDatabaseUrl
              ? "Migrations run automatically when the app updates."
              : "Not configured. Updates use the copy-and-paste SQL path."
          }
          trailing={c?.hasDatabaseUrl ? "On" : "Off"}
        />
        <ListRow
          title="Configuration key"
          subtitle={
            c?.appSecretSource === "env"
              ? "APP_SECRET comes from the environment."
              : "Stored at /data/secret. Setting APP_SECRET in the environment is more secure."
          }
          trailing={c?.appSecretSource === "env" ? "Environment" : "File"}
        />
      </GroupedList>

      {c?.resetPinEnv && (
        <p
          className="rounded-button border border-warning/30 bg-warning/10 p-3 text-footnote text-warning"
          role="alert"
        >
          RESET_PIN is still set. Remove it from the environment, or your PIN will be cleared at the
          next restart.
        </p>
      )}

      {checks && (
        <ul className="glass flex flex-col gap-2 rounded-list p-4" aria-label="Connection checks">
          {checks.map((ch) => (
            <li key={ch.id + ch.label} className="text-footnote">
              <span className={ch.ok ? "text-success" : "text-danger"}>
                {ch.ok ? "Passed" : "Failed"}
              </span>
              <span className="text-fg"> · {ch.message}</span>
              {ch.hint && <span className="block text-fg-2">{ch.hint}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={testing} onClick={test}>
          Test connection
        </Button>
        <Button variant="secondary" loading={migrating} onClick={migrate}>
          Run migrations
        </Button>
      </div>

      <Sheet
        open={sql !== null}
        onOpenChange={(o) => !o && setSql(null)}
        title="Run the SQL by hand"
        description="There is no direct database connection, so open your Supabase Studio SQL editor, paste this, run it, then verify."
        width={560}
      >
        <TextArea
          label="Setup SQL"
          readOnly
          mono
          rows={10}
          value={sql ?? ""}
          className="max-h-[300px] resize-none text-[12px]"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="mt-4 flex gap-2">
          <Button
            variant="tinted"
            className="flex-1"
            icon={copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
            onClick={async () => {
              await navigator.clipboard.writeText(sql ?? "").catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy SQL"}
          </Button>
          <Button variant="primary" className="flex-1" loading={verifying} onClick={verify}>
            Verify
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}
