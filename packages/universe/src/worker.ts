/**
 * Worker entry: owns the GL context and the frame loop, so the galaxy costs the main thread
 * nothing. Everything it knows arrives as messages from the host.
 */
import type { FromEngine, ToEngine } from "./protocol.ts";
import { Engine } from "./renderer/engine.ts";

const scope = self as unknown as {
  postMessage: (message: FromEngine | { type: "supported"; ok: boolean }) => void;
  onmessage: ((e: MessageEvent<ToEngine | { type: "check" }>) => void) | null;
};

let engine: Engine | null = null;

/** Can this worker really draw WebGL2? Safari 16.4–16.6 has OffscreenCanvas without it. */
function supported(): boolean {
  try {
    if (typeof OffscreenCanvas === "undefined") return false;
    return new OffscreenCanvas(1, 1).getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

scope.onmessage = (e) => {
  const message = e.data;
  // Asked before the host hands its canvas over, because a transfer cannot be undone.
  if (message.type === "check") {
    scope.postMessage({ type: "supported", ok: supported() });
    return;
  }
  try {
    if (message.type === "init")
      engine = new Engine(message.canvas, (out) => scope.postMessage(out));
    engine?.handle(message);
  } catch (error) {
    scope.postMessage({ type: "failed", reason: String(error) });
  }
};
