/** Describes this browser for the device list, e.g. "Safari on iPhone". */
export function deviceName(ua: string = navigator.userAgent): string {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) ||
        (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "this device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${browser} on ${os}`;
}

/** True when running as an installed app (home-screen PWA). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function deviceKind(): "web" | "pwa" {
  return isStandalone() ? "pwa" : "web";
}
