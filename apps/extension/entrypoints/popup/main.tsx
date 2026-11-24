import { normalizeAppUrl } from "@stellar/shared/normalize";
import { isBlockingActive, phaseLabel } from "@stellar/shared/timer";
import { type FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { ApiError, findInstance, type InstanceInfo, pinLogin } from "../../lib/api.ts";
import { clock } from "../../lib/blocking.ts";
import { clientFor } from "../../lib/client.ts";
import { setConnection, setStatus } from "../../lib/storage.ts";
import type { Connection, LinkStatus, Snapshot } from "../../lib/types.ts";
import { send, useLink, useNow } from "../../lib/use-link.ts";
import "./style.css";

const BROWSER_NAME = import.meta.env.BROWSER === "firefox" ? "Firefox" : "Chrome";

function Icon({ d, fill, size = 20 }: { d: string; fill?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
const ICON = {
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.5a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-2.8 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.8-1.1 2 2 0 1 1-2.8-2.8 1.6 1.6 0 0 0-1.1-2.8 2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.8 2 2 0 1 1 2.8-2.8 1.6 1.6 0 0 0 2.8-1.1 2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.8 1.1 2 2 0 1 1 2.8 2.8 1.6 1.6 0 0 0 1.1 2.8 2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.4 1Z",
  back: "m14.5 5.5-6.5 6.5 6.5 6.5",
  play: "M8 5.5v13l10.5-6.5L8 5.5Z",
  pause: "M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z",
  stop: "M7 7h10v10H7z",
  skip: "M6.5 6v12l8.5-6-8.5-6ZM16.4 6h1.9v12h-1.9z",
  check: "m5 12.5 4.5 4.5L19 7",
};

// ── connect ─────────────────────────────────────────────────────────────────
function Connect({ reconnect }: { reconnect: Connection | null }) {
  const [url, setUrl] = useState(reconnect?.appUrl ?? "");
  const [found, setFound] = useState<{ appUrl: string; instance: InstanceInfo } | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async (value: string) => {
    setError(null);
    const normalized = normalizeAppUrl(value);
    if (!normalized.ok) return setError(normalized.message);
    setBusy(true);
    try {
      // Must be requested from this click. Chrome grants it at install; Firefox asks here.
      // Needed to reach your instance and Supabase, and to redirect blocked sites.
      const granted = await browser.permissions
        .request({ origins: ["<all_urls>"] })
        .catch(() => true);
      if (!granted)
        throw new ApiError(
          "forbidden",
          "Without site access the extension can't reach your planner or block sites. Try again and allow it.",
        );
      setFound(await findInstance(normalized.value));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  };

  // Reconnecting after the session ended: the instance is already known.
  useEffect(() => {
    if (reconnect) void find(reconnect.appUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (value: string) => {
    if (!found || busy || value.length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const { session, deviceId } = await pinLogin(
        found.appUrl,
        value,
        `${BROWSER_NAME} extension`,
      );
      const connection: Connection = {
        appUrl: found.appUrl,
        supabaseUrl: found.instance.supabaseUrl as string,
        supabaseAnonKey: found.instance.supabaseAnonKey as string,
        userId: session.user_id,
        deviceId,
        connectedAt: Date.now(),
      };
      await setConnection(connection);
      const { error: sessionError } = await clientFor(connection).auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (sessionError)
        throw new ApiError(
          "upstream_error",
          "Signed in, but the session could not be stored. Try again.",
        );
      await setStatus("connected");
      // The background takes it from here: subscribe to Realtime and fetch the current state.
      await send({ type: "connected" });
    } catch (err) {
      setPin("");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  if (!found) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void find(url);
    };
    return (
      <form className="stack grow" onSubmit={submit}>
        <div>
          <h1 className="title">Connect your planner</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            Enter the address where you open Stellar Planner.
          </p>
        </div>
        <label className="sr-only" htmlFor="app-url">
          Stellar Planner address
        </label>
        <input
          id="app-url"
          className="field"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="planner.example.com"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
        />
        <p className="error" role="alert">
          {error}
        </p>
        <div className="grow" />
        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={busy || !url.trim()}
        >
          {busy ? "Looking…" : "Continue"}
        </button>
        {reconnect && <DisconnectButton disabled={busy} />}
      </form>
    );
  }

  const press = (key: string) => {
    if (busy) return;
    if (key === "back") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 12) return;
    setError(null);
    setPin(pin + key);
  };
  return (
    <div className="stack grow">
      <div className="found" role="status">
        <Icon d={ICON.check} size={16} />
        Found Stellar Planner at {new URL(found.appUrl).host}
      </div>
      <div style={{ textAlign: "center" }}>
        <h1 className="title">Enter your PIN</h1>
        <div className="pin-dots" role="status" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: Math.max(6, pin.length) }, (_, i) => (
            <span key={i} className={i < pin.length ? "on" : ""} />
          ))}
        </div>
        <PinKeys onPress={press} onSubmit={() => void connect(pin)} disabled={busy} />
        <p className="error" role="alert">
          {error}
        </p>
      </div>
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={busy || pin.length < 6}
        onClick={() => void connect(pin)}
      >
        {busy ? "Connecting…" : "Connect"}
      </button>
      {!reconnect && (
        <button
          type="button"
          className="btn btn--secondary btn--block"
          disabled={busy}
          onClick={() => (setFound(null), setPin(""), setError(null))}
        >
          Use a different address
        </button>
      )}
      {reconnect && <DisconnectButton disabled={busy} />}
    </div>
  );
}

/** A way out when the PIN cannot be entered (wrong instance, PIN forgotten): unlink and start over. */
function DisconnectButton({ disabled }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      className="btn btn--secondary btn--block"
      disabled={disabled}
      onClick={() => void send({ type: "disconnect" }).catch(() => undefined)}
    >
      Disconnect this browser
    </button>
  );
}

function PinKeys({
  onPress,
  onSubmit,
  disabled,
}: {
  onPress: (key: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) onPress(e.key);
      else if (e.key === "Backspace") onPress("back");
      else if (e.key === "Enter") onSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="keypad" aria-label="Keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
        <button
          key={k}
          type="button"
          className="key"
          disabled={disabled}
          onClick={() => onPress(k)}
        >
          {k}
        </button>
      ))}
      <span />
      <button type="button" className="key" disabled={disabled} onClick={() => onPress("0")}>
        0
      </button>
      <button
        type="button"
        className="key key--plain"
        disabled={disabled}
        aria-label="Delete"
        onClick={() => onPress("back")}
      >
        Delete
      </button>
    </div>
  );
}

// ── timer ───────────────────────────────────────────────────────────────────
const STATUS_TEXT: Record<LinkStatus, string> = {
  connected: "Synced",
  offline: "Offline",
  needs_pin: "PIN needed",
  disconnected: "Not connected",
};

function Timer({
  snapshot,
  connection,
  status,
}: {
  snapshot: Snapshot;
  connection: Connection;
  status: LinkStatus;
}) {
  const now = useNow(250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state, settings, blocking } = snapshot;

  const act = async (action: "start" | "pause" | "resume" | "skip" | "end") => {
    setBusy(true);
    setError(null);
    const result = await send<{ ok: boolean; error: string | null }>({
      type: "timer",
      action,
    }).catch(() => ({ ok: false, error: "failed" }));
    if (!result.ok)
      setError(
        result.error === "offline"
          ? "You're offline. The timer will catch up when you reconnect."
          : result.error === "version_conflict"
            ? null
            : "That didn't go through. Try again.",
      );
    setBusy(false);
  };

  const main =
    state.status === "running" ? "pause" : state.status === "paused" ? "resume" : "start";
  const mainLabel =
    main === "pause"
      ? "Pause"
      : main === "resume"
        ? "Resume"
        : state.status === "awaiting"
          ? `Start ${phaseLabel(state.phase).toLowerCase()}`
          : "Start focus";
  const idle = state.status === "idle";
  const active = isBlockingActive(state);
  const caption =
    state.status === "paused"
      ? "Paused"
      : state.status === "awaiting"
        ? "Ready when you are"
        : `Round ${state.round} of ${settings.rounds_before_long}`;

  return (
    <>
      <div className="timer">
        <p className="eyebrow timer__phase">{phaseLabel(state.phase)}</p>
        <p
          className="timer__clock"
          role="timer"
          aria-label={`${clock(snapshot, now)} remaining`}
          data-testid="clock"
        >
          {clock(snapshot, now)}
        </p>
        <p className="muted small">{caption}</p>
      </div>
      <div className="controls">
        <button
          type="button"
          className="round glass"
          aria-label="End session"
          title="End session"
          disabled={busy || idle}
          onClick={() => void act("end")}
        >
          <Icon d={ICON.stop} fill />
        </button>
        <button
          type="button"
          className="round round--main"
          aria-label={mainLabel}
          title={mainLabel}
          disabled={busy}
          onClick={() => void act(main)}
        >
          <Icon d={main === "pause" ? ICON.pause : ICON.play} fill size={28} />
        </button>
        <button
          type="button"
          className="round glass"
          aria-label="Skip phase"
          title="Skip phase"
          disabled={busy || idle}
          onClick={() => void act("skip")}
        >
          <Icon d={ICON.skip} fill />
        </button>
      </div>
      <p className="error" role="alert" style={{ textAlign: "center", marginTop: -8 }}>
        {error}
      </p>
      <section className="card glass" aria-label="Blocking">
        <p className="card__title">
          {active
            ? blocking.lists.length
              ? "Blocking now"
              : "Nothing is blocked"
            : state.phase !== "focus" && !idle
              ? "Sites open during break"
              : "Blocks during focus"}
        </p>
        {blocking.lists.length > 0 ? (
          <div className="chips">
            {blocking.lists.map((l) => (
              <span key={l.id} className="chip">
                {l.emoji ? `${l.emoji} ` : ""}
                {l.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 4 }}>
            Choose block lists on the Focus page of your planner.
          </p>
        )}
        {blocking.lists.length > 0 && (
          <p className="muted small" style={{ marginTop: 8 }}>
            {blocking.patterns.length} {blocking.patterns.length === 1 ? "site" : "sites"}
          </p>
        )}
      </section>
      <div className="grow" />
      <div className="foot">
        <span className="status" role="status">
          <span
            className={
              status === "connected"
                ? "dot dot--live"
                : status === "offline"
                  ? "dot dot--warn"
                  : "dot"
            }
            aria-hidden="true"
          />
          {STATUS_TEXT[status]}
        </span>
        <a href={`${connection.appUrl}/focus`} target="_blank" rel="noreferrer">
          Open Stellar Planner
        </a>
      </div>
    </>
  );
}

function Settings({
  connection,
  status,
  onBack,
}: {
  connection: Connection;
  status: LinkStatus;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack grow">
      <h1 className="title">Settings</h1>
      <div className="card glass">
        <div className="row">
          <span className="muted small">Instance</span>
          <span className="small break-all" style={{ textAlign: "right" }}>
            {connection.appUrl}
          </span>
        </div>
        <div className="row">
          <span className="muted small">Status</span>
          <span className="small">{STATUS_TEXT[status]}</span>
        </div>
        <div className="row">
          <span className="muted small">Connected</span>
          <span className="small">
            {new Date(connection.connectedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
      <p className="muted small">
        Disconnecting removes the session and block rules from this browser. Your data stays in your
        planner.
      </p>
      <div className="grow" />
      <button
        type="button"
        className="btn btn--danger btn--block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await send({ type: "disconnect" }).catch(() => undefined);
          onBack();
        }}
      >
        Disconnect
      </button>
    </div>
  );
}

function Popup() {
  const { loaded, connection, snapshot, status } = useLink();
  const [view, setView] = useState<"main" | "settings">("main");

  useEffect(() => {
    void send({ type: "resync" }).catch(() => undefined);
  }, []);

  if (!loaded) return <div className="popup" />;
  const linked = connection !== null && status !== "disconnected" && status !== "needs_pin";

  return (
    <main className="popup">
      <header className="popup__head">
        {view === "settings" ? (
          <button
            type="button"
            className="icon-btn"
            style={{ margin: "-4px 0 -4px -8px" }}
            aria-label="Back"
            onClick={() => setView("main")}
          >
            <Icon d={ICON.back} />
          </button>
        ) : (
          <span className="popup__brand">Stellar Planner</span>
        )}
        {linked && view === "main" && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Settings"
            onClick={() => setView("settings")}
          >
            <Icon d={ICON.gear} />
          </button>
        )}
      </header>
      {!linked || !connection ? (
        <Connect reconnect={status === "needs_pin" ? connection : null} key={status} />
      ) : view === "settings" ? (
        <Settings connection={connection} status={status} onBack={() => setView("main")} />
      ) : snapshot ? (
        <Timer snapshot={snapshot} connection={connection} status={status} />
      ) : (
        <p className="muted" role="status">
          Fetching your timer…
        </p>
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
