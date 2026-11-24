/**
 * Push and pop between a list and its detail, the way a navigation stack moves: the new
 * screen slides in from the right over the old one (and back out again), using the View
 * Transitions API where the browser has it (Safari 18+, Chromium). Elsewhere, and with
 * reduced motion, the change is simply immediate. Tab switches never use this.
 */
type Kind = "push" | "pop";

interface ViewTransitionDocument {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
}

/** True between a tap on "open list" and the matching back, so Back can pop instead of pushing. */
let pushedInApp = 0;

export function markPushed(): void {
  pushedInApp += 1;
}

/** Whether going back should pop the history entry we pushed (rather than replace the address). */
export function takePushed(): boolean {
  if (pushedInApp <= 0) return false;
  pushedInApp -= 1;
  return true;
}

/** Runs a navigation, animated as a push or a pop when possible. `navigate` must change the URL. */
export function navigateWithTransition(kind: Kind, navigate: () => void): void {
  const doc = document as Document & ViewTransitionDocument;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) {
    navigate();
    return;
  }
  const before = window.location.href;
  const root = document.documentElement;
  root.dataset.nav = kind;
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        navigate();
        // The router commits asynchronously: wait for the address to change, then one frame
        // for React to paint the new screen. Give up waiting after a moment rather than hang.
        const started = performance.now();
        const check = () => {
          if (window.location.href !== before || performance.now() - started > 400)
            requestAnimationFrame(() => resolve());
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
  void transition.finished.catch(() => {}).then(() => delete root.dataset.nav);
}
