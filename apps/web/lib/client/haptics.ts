/**
 * Haptic feedback, where the platform really offers it.
 *
 * - Android (and anything with the Vibration API): a short `navigator.vibrate`.
 * - iOS / iPadOS: Safari has no Vibration API. Since Safari 17.4 a native switch control
 *   (`<input type="checkbox" switch>`) plays the system's light tap when it is toggled, in
 *   Safari and in Home Screen web apps alike. Toggling one from inside a real tap is the
 *   only path the platform exposes, so a hidden switch is clicked through its label. It
 *   only fires during a user gesture, and it is silent on versions without the control.
 *
 * Nothing is faked: where neither path exists, nothing happens. See docs/DECISIONS.md.
 */
type Kind = "light" | "success";

let label: HTMLLabelElement | null = null;
let supported: boolean | null = null;

function iosSwitch(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (supported === false) return null;
  if (label?.isConnected) return label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  // Only WebKit builds with the switch control reflect the attribute as a property.
  supported = "switch" in input;
  if (!supported) return null;
  input.id = "sp-haptic";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  const el = document.createElement("label");
  el.htmlFor = input.id;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
  el.append(input);
  document.body.append(el);
  label = el;
  return el;
}

/** Call from inside the handler of a tap. Safe to call anywhere; it does nothing when unsupported. */
export function haptic(kind: Kind = "light"): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(kind === "success" ? [10, 40, 14] : 8);
      return;
    }
    const el = iosSwitch();
    if (!el) return;
    el.click();
    if (kind === "success") setTimeout(() => el.click(), 90);
  } catch {
    // feedback only: never let it break the action it accompanies
  }
}
