"use client";

import { useEffect } from "react";
import { toast } from "@/lib/client/toast";

/**
 * Registers the service worker (production builds only) and runs the update
 * flow: when a new version has installed in the background, a toast offers
 * "Reload"; choosing it activates the new worker and reloads once.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;

    const offerUpdate = (registration: ServiceWorkerRegistration) => {
      if (!registration.waiting || !navigator.serviceWorker.controller) return;
      toast("New version available", {
        id: "sw-update",
        duration: 60 * 60 * 1000,
        action: {
          label: "Reload",
          run: () => registration.waiting?.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    };

    const onControllerChange = () => {
      // Fires when the new worker takes over after "Reload". Guard against a reload loop.
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const hadController = Boolean(navigator.serviceWorker.controller);
    if (hadController)
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let interval: ReturnType<typeof setInterval> | null = null;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        offerUpdate(registration);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          // An update replaces a worker that already controls this page. That is decided
          // now, when the new worker is found: on a first install nothing controls the page
          // yet, but the worker can have taken control by the time "installed" is heard,
          // and the first visit would be told there is a new version.
          const replacing = Boolean(navigator.serviceWorker.controller);
          installing?.addEventListener("statechange", () => {
            if (replacing && installing.state === "installed") offerUpdate(registration);
          });
        });
        // Look for a new version when the app comes back to the foreground, and hourly.
        const check = () =>
          document.visibilityState === "visible" &&
          void registration.update().catch(() => undefined);
        document.addEventListener("visibilitychange", check);
        interval = setInterval(check, 60 * 60 * 1000);
        // Once active, cache every app route so each opens offline.
        const ready = await navigator.serviceWorker.ready;
        const warm = () => ready.active?.postMessage({ type: "WARM_SHELL" });
        if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 5000 });
        else setTimeout(warm, 2500);
      } catch (err) {
        console.warn("[sw] registration failed", err);
      }
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (interval) clearInterval(interval);
    };
  }, []);
  return null;
}
