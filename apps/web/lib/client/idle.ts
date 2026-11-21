/** Runs `task` once the browser is idle (or shortly after load where idle callbacks are missing). */
export function whenIdle(task: () => void, timeout = 2500): () => void {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 1200);
  return () => window.clearTimeout(id);
}
