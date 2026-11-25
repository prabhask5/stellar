"use client";

import { Deferred } from "./deferred";

const load = () => import("./touch-feel").then((m) => m.TouchFeel);

/** Loads the touch behaviour (pressed states, keyboard dismissal) after first paint. */
export function TouchFeelLoader() {
  return <Deferred load={load} />;
}
