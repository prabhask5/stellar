"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { type CollectionTable, getRows } from "@/lib/client/cache";
import { type Diagnostics, diagnostics, type RequestRecord } from "@/lib/client/diagnostics";
import { pendingOps } from "@/lib/client/outbox";
import { serverNow } from "@/lib/client/session";
import { useSync } from "@/lib/client/sync-store";

const TABLES: [CollectionTable, string][] = [
  ["sp_tasks", "Tasks"],
  ["sp_task_lists", "Task lists"],
  ["sp_goals", "Goals"],
  ["sp_goal_lists", "Goal lists"],
  ["sp_routines", "Routines"],
  ["sp_routine_logs", "Routine logs"],
  ["sp_block_lists", "Block lists"],
  ["sp_block_list_sites", "Blocked sites"],
];

const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1_048_576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1_048_576).toFixed(1)} MB`;

function ago(at: number, now: number): string {
  if (!at) return "never";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

type Tone = "good" | "warn" | "bad" | "idle";
const DOT: Record<Tone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  idle: "bg-fg-2",
};

function Tile({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone: Tone;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-hairline bg-fill-subtle p-3">
      <p className="flex items-center gap-1.5 text-caption text-fg-2">
        <span className={cx("size-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 truncate text-headline text-fg tnum">{value}</p>
      <p className="mt-0.5 truncate text-caption text-fg-2 tnum">{children}</p>
    </div>
  );
}

/** Response times of the most recent requests, oldest to newest. Failed ones are red. */
function Latency({ recent }: { recent: RequestRecord[] }) {
  const max = Math.max(200, ...recent.map((r) => r.ms));
  return (
    <div
      className="flex h-12 items-end gap-[3px]"
      role="img"
      aria-label={`Response times of the last ${recent.length} requests, slowest ${max} milliseconds`}
    >
      {recent.length === 0 && <span className="text-caption text-fg-2">No requests yet.</span>}
      {recent.map((r, i) => (
        <span
          key={`${r.at}:${i}`}
          title={`${r.method} ${r.path} · ${r.status || "failed"} · ${r.ms} ms`}
          className={cx(
            "min-w-[3px] flex-1 rounded-sm",
            r.status === 0 || r.status >= 400 ? "bg-danger" : "bg-accent/70",
          )}
          style={{ height: `${Math.max(6, Math.round((r.ms / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-caption font-medium uppercase tracking-wide text-fg-2">{children}</h3>
  );
}

/**
 * Everything about the link to Supabase in one read-only place: requests and their
 * timing, live updates, the queue of changes waiting to be sent, and what is held on this
 * device. Refreshes once a second, and only while it is on screen.
 */
export function DiagnosticsDashboard() {
  const root = useRef<HTMLDivElement>(null);
  const [d, setD] = useState<Diagnostics | null>(null);
  const [storage, setStorage] = useState<number | null>(null);
  const sync = useSync();

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const read = () => setD(diagnostics());
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !timer) {
        read();
        timer = setInterval(read, 1000);
        void navigator.storage
          ?.estimate?.()
          .then((e) => setStorage(e.usage ?? null))
          .catch(() => {});
      } else if (!entry?.isIntersecting && timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  const now = Date.now();
  const recent = d?.recent ?? [];
  const ok = recent.filter((r) => r.status > 0 && r.status < 400);
  const average = ok.length ? Math.round(ok.reduce((n, r) => n + r.ms, 0) / ok.length) : null;
  const last = recent[recent.length - 1];
  const queue = d ? pendingOps() : [];
  const skew = Math.round(serverNow() - Date.now());
  const live = sync.realtime === "connected";

  return (
    <div ref={root} className="glass rounded-list p-4" data-testid="diagnostics">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile
          label="Database"
          value={
            !sync.online ? "Offline" : last && last.status === 0 ? "Not answering" : "Reachable"
          }
          tone={!sync.online || (last && last.status === 0) ? "bad" : "good"}
        >
          {average === null ? "No requests yet" : `${average} ms average`}
        </Tile>
        <Tile
          label="Live updates"
          value={
            live ? "Connected" : sync.realtime === "connecting" ? "Connecting" : "Not connected"
          }
          tone={live ? "good" : sync.realtime === "idle" ? "idle" : "warn"}
        >
          {d ? `${d.realtime.events} received · last ${ago(d.realtime.lastEventAt, now)}` : "…"}
        </Tile>
        <Tile
          label="Changes to send"
          value={queue.length === 0 ? "All sent" : `${queue.length} waiting`}
          tone={queue.length === 0 ? "good" : sync.online ? "warn" : "bad"}
        >
          {d ? `${d.sync.sent} sent · last ${ago(d.sync.lastSentAt, now)}` : "…"}
        </Tile>
        <Tile label="Devices in sync" value={String(sync.devices)} tone={live ? "good" : "idle"}>
          Clock{" "}
          {Math.abs(skew) < 1000
            ? "matches the server"
            : `${(skew / 1000).toFixed(1)} s from server`}
        </Tile>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section aria-label="Traffic">
          <Heading>Traffic this session</Heading>
          <Latency recent={recent} />
          <dl className="mt-3 grid grid-cols-4 gap-2 text-caption text-fg-2">
            {[
              ["Requests", String(d?.requests ?? 0)],
              ["Failed", String(d?.failed ?? 0)],
              ["Sent", bytes(d?.bytesSent ?? 0)],
              ["Received", bytes(d?.bytesReceived ?? 0)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="truncate">{k}</dt>
                <dd
                  className={cx(
                    "truncate text-[15px] tnum",
                    k === "Failed" && v !== "0" ? "text-danger" : "text-fg",
                  )}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="On this device">
          <Heading>On this device</Heading>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-footnote">
            {TABLES.map(([table, label]) => (
              <div key={table} className="flex min-w-0 justify-between gap-2">
                <dt className="truncate text-fg-2">{label}</dt>
                <dd className="text-fg tnum">{d ? getRows(table).length : "…"}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-caption text-fg-2 tnum">
            {storage === null
              ? "Storage use is not reported by this browser."
              : `${bytes(storage)} stored offline`}
            {d && (d.sync.conflicts > 0 || d.sync.rejected > 0)
              ? ` · ${d.sync.conflicts} superseded, ${d.sync.rejected} refused`
              : ""}
          </p>
        </section>
      </div>

      <section aria-label="Recent requests" className="mt-5">
        <Heading>Recent requests</Heading>
        <ol className="max-h-56 overflow-y-auto overscroll-contain rounded-[12px] border border-hairline bg-[rgba(10,8,28,0.45)] px-3 py-2 font-mono text-[12px] leading-[1.7]">
          {recent.length === 0 && <li className="text-fg-2">Nothing yet.</li>}
          {[...recent].reverse().map((r, i) => {
            const bad = r.status === 0 || r.status >= 400;
            return (
              <li
                key={`${r.at}:${i}`}
                className={cx("flex gap-2 whitespace-nowrap", bad ? "text-danger" : "text-fg-2")}
              >
                <span className="w-[68px] shrink-0 tnum">
                  {new Date(r.at).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="w-[46px] shrink-0">{r.method}</span>
                <span className={cx("min-w-0 flex-1 truncate", !bad && "text-fg")}>{r.path}</span>
                <span className="shrink-0 tnum">{r.status || "ERR"}</span>
                <span className="w-[58px] shrink-0 text-right tnum">{r.ms} ms</span>
              </li>
            );
          })}
        </ol>
      </section>

      {d && d.errors.length > 0 && (
        <section aria-label="Errors" className="mt-5">
          <Heading>Errors</Heading>
          <ul className="flex flex-col gap-1 text-footnote">
            {[...d.errors]
              .reverse()
              .slice(0, 5)
              .map((e, i) => (
                <li key={`${e.at}:${i}`} className="min-w-0 truncate text-danger">
                  {ago(e.at, now)} · {e.method} {e.path} · {e.status || "no answer"}
                  {e.error ? ` · ${e.error}` : ""}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
