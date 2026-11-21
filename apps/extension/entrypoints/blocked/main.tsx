import { isBlockingActive, phaseLabel } from "@stellar/shared/timer";
import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { clock, decide, remaining } from "../../lib/blocking.ts";
import { parseBlockedLocation } from "../../lib/rules.ts";
import { send, useLink, useNow } from "../../lib/use-link.ts";
import "./style.css";

/**
 * Shown instead of a blocked site. There is deliberately no way to unlock it:
 * the only way through is for the focus phase to end (pausing does not count),
 * from any device.
 */
function Blocked() {
  const { loaded, connection, snapshot, status } = useLink();
  const now = useNow(250);
  const { site, target } = useMemo(
    () => parseBlockedLocation(window.location.search, window.location.hash),
    [],
  );

  // Ask the background for fresh state when the page opens and when it regains focus.
  useEffect(() => {
    const refresh = () => void send({ type: "resync" }).catch(() => undefined);
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  if (!loaded) return null;

  const decision = decide(snapshot, now);
  const blocking =
    decision.block &&
    (site === "" || decision.patterns.some((p) => site === p || site.endsWith(`.${p}`)));
  const state = snapshot?.state;
  const host = connection ? new URL(connection.appUrl).host : null;
  const lists = snapshot?.blocking.lists.map((l) => l.name).join(", ") ?? "";

  if (!blocking || !snapshot || !state) {
    const completed = state && !isBlockingActive(state);
    return (
      <main className="blocked">
        <div className="eclipse" role="img" aria-label="Focus complete">
          <div className="eclipse__halo" />
          <div className="eclipse__disk" />
          <div className="eclipse__body">
            <p className="eyebrow eclipse__eyebrow">
              {completed && state.phase !== "focus" ? phaseLabel(state.phase) : "Clear"}
            </p>
            <p className="eclipse__time" style={{ fontSize: 44, margin: "10px 0" }}>
              Open
            </p>
          </div>
        </div>
        <h1 className="blocked__title">Focus complete</h1>
        <p className="blocked__line">
          {site ? `${site} is open again.` : "Your sites are open again."}
        </p>
        {target && (
          <a className="btn btn--primary blocked__action" href={target} rel="noreferrer">
            Continue to {site || "the site"}
          </a>
        )}
        <Footer host={host} status={status} text={host ? `Synced with ${host}` : "Not connected"} />
      </main>
    );
  }

  const left = remaining(snapshot, now);
  const total = state.phase_total_ms ?? snapshot.settings.focus_min * 60_000;
  const done = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
  const paused = state.status === "paused";

  return (
    <main className="blocked">
      <div
        className="eclipse"
        role="timer"
        aria-label={`${clock(snapshot, now)} remaining in this focus phase`}
      >
        <div className="eclipse__halo" />
        <div className="eclipse__disk" />
        <div className="eclipse__body">
          <p className="eyebrow eclipse__eyebrow">
            Focus · Round {state.round} of {snapshot.settings.rounds_before_long}
          </p>
          <p className="eclipse__time" data-testid="countdown">
            {clock(snapshot, now)}
          </p>
          <p className="eclipse__caption">{paused ? "paused" : "remaining"}</p>
        </div>
      </div>
      <h1 className="blocked__title">This orbit is closed.</h1>
      <p className="blocked__line">
        {site || "This site"} is blocked until your focus phase ends.
        {paused ? " The timer is paused, and the block stays on." : ""}
      </p>
      <div
        className="blocked__progress"
        role="progressbar"
        aria-label="Focus phase progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(done * 100)}
      >
        <span style={{ width: `${done * 100}%` }} />
      </div>
      <Footer
        host={host}
        status={status}
        text={`${status === "offline" ? "Offline, last synced with" : "Synced with"} ${host ?? "your planner"}${lists ? ` · Blocking ${lists}` : ""}`}
      />
    </main>
  );
}

function Footer({ status, text }: { host: string | null; status: string; text: string }) {
  return (
    <p className="blocked__footer">
      <span
        className={
          status === "connected" ? "dot dot--live" : status === "offline" ? "dot dot--warn" : "dot"
        }
        aria-hidden="true"
      />
      {text}
    </p>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Blocked />);
