/**
 * Demo mode: the real interface running on made-up data that lives only in this tab.
 *
 * It exists so a visitor can try the app on the owner's instance, so the rule is absolute:
 * in demo mode the browser never asks the server or the database for data. That is
 * enforced at the three places every request passes through (`api()`, `getSession()`,
 * `getSupabase()`), each of which refuses before touching the network, and the sync queue
 * neither stores nor sends. A visitor has no session to begin with, so even a bug here
 * could only produce "not signed in"; the refusals also keep the owner's own data out of
 * the demo when the owner turns it on in a signed-in browser.
 *
 * The switch is one cookie: the page gate lets it reach the (data-free) app shell without
 * a session, and this module reads the same cookie, so the two can never disagree.
 */
export const DEMO_COOKIE = "sp-demo";

export function isDemo(): boolean {
  return typeof document !== "undefined" && /(?:^|;\s*)sp-demo=1(?:;|$)/.test(document.cookie);
}

export class DemoError extends Error {
  constructor() {
    super("Not available in the demo.");
    this.name = "DemoError";
  }
}

/** Throws in demo mode. Called first thing by everything that would reach the server. */
export function refuseInDemo(): void {
  if (isDemo()) throw new DemoError();
}

export function enterDemo(): void {
  document.cookie = `${DEMO_COOKIE}=1; path=/; max-age=86400; samesite=lax`;
  // A full load on purpose: the page gate must see the cookie, and the app must start clean.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
}

export function exitDemo(): void {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`;
  // A full load: every sample row held in memory goes with the page.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/lock");
}
