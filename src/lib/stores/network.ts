import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

type OnlineCallback = () => void;

function createNetworkStore(): Readable<boolean> & {
  init: () => void;
  onReconnect: (callback: OnlineCallback) => () => void;
} {
  const { subscribe, set } = writable<boolean>(true);
  const reconnectCallbacks: Set<OnlineCallback> = new Set();
  let wasOffline = false;

  function init() {
    if (!browser) return;

    // Set initial state
    const initiallyOnline = navigator.onLine;
    set(initiallyOnline);
    wasOffline = !initiallyOnline;

    // Listen for going offline
    window.addEventListener('offline', () => {
      wasOffline = true;
      set(false);
    });

    // Listen for coming back online
    window.addEventListener('online', () => {
      set(true);

      // If we were offline, trigger reconnect callbacks
      if (wasOffline) {
        wasOffline = false;
        // Small delay to ensure network is stable
        setTimeout(() => {
          reconnectCallbacks.forEach((callback) => {
            try {
              callback();
            } catch (e) {
              console.error('[Network] Reconnect callback error:', e);
            }
          });
        }, 500);
      }
    });

    // Also listen for visibility changes (iOS specific - PWA may not fire online/offline)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const nowOnline = navigator.onLine;
        set(nowOnline);

        // If we're coming back online after being hidden
        if (nowOnline && wasOffline) {
          wasOffline = false;
          setTimeout(() => {
            reconnectCallbacks.forEach((callback) => {
              try {
                callback();
              } catch (e) {
                console.error('[Network] Reconnect callback error:', e);
              }
            });
          }, 500);
        }
      } else {
        // When going to background, assume we might lose connection
        wasOffline = !navigator.onLine;
      }
    });
  }

  function onReconnect(callback: OnlineCallback): () => void {
    reconnectCallbacks.add(callback);
    return () => reconnectCallbacks.delete(callback);
  }

  return {
    subscribe,
    init,
    onReconnect
  };
}

export const isOnline = createNetworkStore();
