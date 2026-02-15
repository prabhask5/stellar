# Frameworks & Dependencies - Stellar Focus Extension

This document explains every framework and dependency used in the Stellar Focus browser extension. It assumes no previous experience with these technologies.

---

## Table of Contents

1. [Overview: Extension vs Main App](#1-overview-extension-vs-main-app)
2. [webextension-polyfill](#2-webextension-polyfill)
3. [Supabase (Browser Extension Context)](#3-supabase-browser-extension-context)
4. [esbuild](#4-esbuild)
5. [TypeScript](#5-typescript)
6. [Extension Architecture](#6-extension-architecture)
7. [No UI Framework (Vanilla JS/HTML)](#7-no-ui-framework-vanilla-jshtml)
8. [Local Storage (IndexedDB)](#8-local-storage-indexeddb)
9. [Communication with Main App](#9-communication-with-main-app)
10. [Quick Reference](#10-quick-reference)
11. [Building & Testing](#11-building--testing)

---

## 1. Overview: Extension vs Main App

Stellar Focus is a browser extension that blocks distracting websites during Pomodoro focus sessions. It is a **completely separate codebase** from Stellar Planner. They share the same Supabase backend but differ in everything else.

| Aspect | Main App | Extension |
|---|---|---|
| UI Framework | SvelteKit + Svelte 5 | Vanilla HTML/CSS/JS |
| Build Tool | Vite | esbuild |
| Database Wrapper | Dexie.js | Raw IndexedDB API |
| Date Library | date-fns | Manual calculations |
| Runtime | Browser tab | Extension context |
| Dependencies | 3 production + 13 dev | 2 production + 3 dev |

**Why so different?** Browser extensions have strict constraints. Every kilobyte matters because the popup must open instantly. There is no dev server to run -- extensions are loaded from static files. The service worker (background script) has no DOM access and can be suspended by the browser at any time. These constraints make a minimal dependency approach the right fit.

---

## 2. webextension-polyfill

### What It Is

`webextension-polyfill` is a library by Mozilla that provides a unified, Promise-based API for browser extensions. It solves a fundamental compatibility problem between Chrome and Firefox.

### Why It Is Needed

Chrome and Firefox use different APIs for extensions:

- **Chrome** uses the `chrome.*` namespace with **callbacks**:
  ```js
  // Chrome's native API (callback-based)
  chrome.storage.local.get('key', function(result) {
    console.log(result.key);
  });
  ```

- **Firefox** uses the `browser.*` namespace with **Promises**:
  ```js
  // Firefox's native API (Promise-based)
  const result = await browser.storage.local.get('key');
  console.log(result.key);
  ```

The polyfill wraps Chrome's callback-based `chrome.*` API to match Firefox's Promise-based `browser.*` API. This means the extension code can be written once using `browser.*` and it works in both browsers.

Every TypeScript file in the extension imports it the same way:

```ts
import browser from 'webextension-polyfill';
```

### Key APIs Used

#### Storage API

The Storage API persists data across browser restarts. The extension uses `browser.storage.local` (not `localStorage`) because service workers do not have access to `localStorage`.

```ts
// Save a value
await browser.storage.local.set({ stellar_config: { supabaseUrl: '...', supabaseAnonKey: '...' } });

// Read a value
const result = await browser.storage.local.get('stellar_config');
const config = result.stellar_config;

// Remove a value
await browser.storage.local.remove('stellar_config');
```

Used in:
- `src/config.ts` -- stores the Supabase URL, anon key, and app URL
- `src/auth/supabase.ts` -- custom storage adapter for Supabase auth tokens
- `src/lib/debug.ts` -- stores the debug mode toggle

#### Alarms API

The Alarms API schedules recurring wake-ups for the service worker. This is critical because browsers can suspend the service worker at any time to save memory.

```ts
// Create a repeating alarm (wakes the service worker every 1 minute)
browser.alarms.create('focus-poll', {
  periodInMinutes: 1
});

// Create a second alarm offset by 30 seconds for more frequent polling
browser.alarms.create('focus-poll-2', {
  delayInMinutes: 0.5,   // Start after 30 seconds
  periodInMinutes: 1      // Then repeat every 1 minute
});

// Listen for alarm events
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'focus-poll' || alarm.name === 'focus-poll-2') {
    // Check if focus session is still active, reconnect realtime if needed
    handleAlarmWake();
  }
});
```

The extension uses two staggered alarms because Firefox enforces a 1-minute minimum interval for Manifest V3 alarms. By offsetting two 1-minute alarms by 30 seconds, the service worker wakes roughly every 30 seconds.

#### Web Navigation API

The Web Navigation API intercepts page navigations before they happen. This is how the extension blocks distracting websites.

```ts
// Intercept navigations before the page loads
browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only block main frame (not iframes)
  if (details.frameId !== 0) return;

  const url = new URL(details.url);
  const hostname = url.hostname;

  // Skip extension-internal URLs
  if (url.protocol === 'moz-extension:' || url.protocol === 'about:') return;

  // Only block during active focus sessions
  if (!currentFocusSession || currentFocusSession.phase !== 'focus') return;

  // Check against block lists in IndexedDB cache
  const shouldBlock = await isDomainBlocked(hostname);

  if (shouldBlock) {
    // Redirect to the blocked page with the original URL as a parameter
    const blockedUrl = browser.runtime.getURL(
      `pages/blocked.html?url=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(hostname)}`
    );
    browser.tabs.update(details.tabId, { url: blockedUrl });
  }
});
```

The `onBeforeNavigate` event fires for every navigation. The handler checks if the domain is in the user's block lists and, if so, redirects the tab to the extension's blocked page instead.

#### Tabs API

The Tabs API manipulates browser tabs. The extension uses it to redirect blocked navigations and to open or focus Stellar Planner.

```ts
// Redirect a tab to the blocked page
browser.tabs.update(details.tabId, { url: blockedUrl });

// Query for existing tabs matching a URL pattern
const tabs = await browser.tabs.query({
  currentWindow: true,
  url: `${appUrl}/*`
});

// Focus an existing tab or create a new one
if (tabs.length > 0 && tabs[0].id !== undefined) {
  await browser.tabs.update(tabs[0].id, { active: true });
} else {
  await browser.tabs.create({ url: appUrl });
}
```

#### Runtime API

The Runtime API enables communication between different parts of the extension (popup, service worker, content pages) and provides access to extension resources.

```ts
// Send a message from the popup to the service worker
const response = await browser.runtime.sendMessage({ type: 'GET_FOCUS_STATUS' });
// response = { isOnline: true, realtimeHealthy: true, focusSession: {...} }

// Listen for messages in the service worker
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_FOCUS_STATUS') {
    sendResponse({
      isOnline,
      realtimeHealthy,
      focusSession: currentFocusSession
    });
  }
});

// Get a URL to an extension file (used for the blocked page redirect)
const blockedUrl = browser.runtime.getURL('pages/blocked.html?url=...');
// Returns: "moz-extension://abc123/pages/blocked.html?url=..." (Firefox)
// Returns: "chrome-extension://abc123/pages/blocked.html?url=..." (Chrome)

// Open the options page
browser.runtime.openOptionsPage();

// Listen for extension install/update
browser.runtime.onInstalled.addListener(() => { /* first-time setup */ });
browser.runtime.onStartup.addListener(() => { /* browser launched */ });
```

Message passing is central to the extension's architecture. The popup never queries Supabase directly for data -- it sends messages to the service worker, which maintains a single consolidated realtime channel and returns cached data.

---

## 3. Supabase (Browser Extension Context)

### What Supabase Is

Supabase is an open-source backend-as-a-service (like Firebase). It provides a PostgreSQL database, authentication, and realtime subscriptions over WebSockets. Both Stellar Planner and the extension connect to the same Supabase project.

### The Service Worker Problem

In a normal web app, Supabase stores auth tokens in `localStorage`. But **service workers do not have access to `localStorage`**. They run in a separate context with no DOM and no `window` object.

The solution is a custom storage adapter that uses `browser.storage.local` (the extension storage API) instead of `localStorage`.

### Custom Storage Adapter

From `src/auth/supabase.ts`:

```ts
import browser from 'webextension-polyfill';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../config';

let supabaseInstance: SupabaseClient | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  if (supabaseInstance) return supabaseInstance;

  const config = await getConfig();
  if (!config) {
    throw new Error('Extension not configured.');
  }

  supabaseInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      storage: {
        // Custom adapter: browser.storage.local instead of localStorage
        getItem: async (key: string) => {
          const result = await browser.storage.local.get(key);
          return result[key] || null;
        },
        setItem: async (key: string, value: string) => {
          await browser.storage.local.set({ [key]: value });
        },
        removeItem: async (key: string) => {
          await browser.storage.local.remove(key);
        },
      },
    },
    realtime: {
      // Shorter heartbeat (15s vs 30s default) keeps the WebSocket alive
      // and signals activity to Firefox's event page lifecycle.
      // Heartbeats are WebSocket pings with no Supabase egress cost.
      heartbeatIntervalMs: 15000,
    },
  });

  return supabaseInstance;
}
```

The three methods (`getItem`, `setItem`, `removeItem`) match the `localStorage` interface, but they use the extension's storage API which is available in service workers. Supabase calls these methods to read and write auth tokens (JWT access tokens, refresh tokens, session data).

### Realtime Subscription Setup

The service worker subscribes to Supabase Realtime to receive instant updates when the user starts a focus session, updates block lists, or adds blocked websites in Stellar Planner.

A single consolidated channel handles all three tables (an egress optimization -- fewer connections means less data transfer):

```ts
import { type RealtimeChannel } from '@supabase/supabase-js';

let realtimeChannel: RealtimeChannel | null = null;

async function setupRealtimeSubscriptions() {
  const session = await getSession();
  if (!session) return;

  const user = session.user;
  const supabase = await getSupabase();

  // Set auth token for the realtime connection
  supabase.realtime.setAuth(session.access_token);

  // Single channel listening to three tables
  realtimeChannel = supabase
    .channel(`stellar-ext-${user.id}-${Date.now()}`)
    // Focus sessions: know when to start/stop blocking
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'focus_sessions',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      // Use payload.new directly instead of re-fetching (saves egress)
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const session = payload.new;
        // Update local cache and blocking state...
      }
    })
    // Block lists: know which lists are enabled
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'block_lists',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      // Update block lists in IndexedDB cache...
    })
    // Blocked websites: know which domains to block
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'blocked_websites'
    }, (payload) => {
      // Update blocked websites in IndexedDB cache...
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeHealthy = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeHealthy = false;
        // Attempt reconnection after 3 seconds
        setTimeout(() => setupRealtimeSubscriptions(), 3000);
      }
    });
}
```

### Auth Flow

The extension uses Supabase anonymous auth paired with a user-specific PIN. There is no email/password login. Instead, the user enters a 6-digit PIN in the popup, and the extension calls `signInAnonymously()` to create an anonymous Supabase session. It then verifies the PIN against the `user_pins` table to link the anonymous session to the correct user account. The Supabase client handles JWT token management, storage (via the custom adapter), and automatic token refresh. The service worker reads the same stored tokens to authenticate its own Supabase queries and realtime subscriptions.

```ts
// In the popup (popup.ts)
// Step 1: Create an anonymous session
const { data: anonData, error: anonError } = await client.auth.signInAnonymously();
// Tokens are automatically stored via the custom adapter to browser.storage.local

// Step 2: Verify the PIN to resolve the actual user
const { data: pinData, error: pinError } = await client
  .from('user_pins')
  .select('user_id')
  .eq('pin', enteredPin)
  .single();
// pinData.user_id is the authenticated user whose data the extension will sync

// In the service worker (service-worker.ts)
const session = await getSession();
// Reads the same tokens from browser.storage.local
const userId = await getLinkedUserId(); // Resolved from the PIN verification step
```

---

## 4. esbuild

### What It Is

esbuild is a JavaScript/TypeScript bundler written in Go. It compiles TypeScript to JavaScript and bundles all imports into single output files. It is 10-100x faster than alternatives like webpack because it is written in a compiled language rather than JavaScript.

### Why esbuild Instead of Vite

Stellar Planner uses Vite, which provides a dev server with hot module replacement (HMR) for a live-reloading development experience. Extensions do not benefit from this because:

1. **No dev server needed** -- Extensions are loaded from static files on disk. You reload the extension in the browser after each build.
2. **Simpler configuration** -- esbuild needs about 20 lines of config. Vite with SvelteKit needs multiple config files and plugins.
3. **Faster builds** -- esbuild compiles the entire extension in under 100ms. There is no warm-up time.
4. **Multiple entry points** -- Extensions have several independent scripts (service worker, popup, blocked page, options page). esbuild handles this naturally.

### Build Configuration

The build script is `build.js` at the project root. Here is the core structure:

```js
import { build } from 'esbuild';

// Common options shared by all entry points
const commonOptions = {
  bundle: true,          // Bundle all imports into a single file
  format: 'esm',         // Output ES modules (required for Manifest V3 service workers)
  target: esbuildTarget, // 'firefox109' or 'chrome109'
  sourcemap: true,       // Generate .map files for debugging
  minify: false,         // Keep readable for debugging
};

// Build each entry point
await build({
  ...commonOptions,
  entryPoints: ['src/popup/popup.ts'],
  outfile: 'dist-firefox/popup/popup.js',
});

await build({
  ...commonOptions,
  entryPoints: ['src/background/service-worker.ts'],
  outfile: 'dist-firefox/background/service-worker.js',
});

await build({
  ...commonOptions,
  entryPoints: ['src/pages/blocked.ts'],
  outfile: 'dist-firefox/pages/blocked.js',
});

await build({
  ...commonOptions,
  entryPoints: ['src/options/options.ts'],
  outfile: 'dist-firefox/options/options.js',
});
```

### 4 Entry Points

Each entry point is an independent script that runs in a different context:

| Entry Point | Output | Context |
|---|---|---|
| `src/background/service-worker.ts` | `background/service-worker.js` | Service worker (no DOM) |
| `src/popup/popup.ts` | `popup/popup.js` | Popup window |
| `src/pages/blocked.ts` | `pages/blocked.js` | Blocked page (full tab) |
| `src/options/options.ts` | `options/options.js` | Options page (full tab) |

### Output Structure

The build produces two output directories, one per browser:

```
dist-chrome/
  manifest.json          # Chrome manifest (from manifests/chrome.json)
  background/
    service-worker.js    # Bundled service worker
    service-worker.js.map
  popup/
    popup.html           # Copied from src/
    popup.css            # Copied from src/
    popup.js             # Bundled popup script
  pages/
    blocked.html
    blocked.css
    blocked.js
  options/
    options.html
    options.css
    options.js
  icons/
    icon-48.png
    icon-128.png

dist-firefox/
  (same structure, but with Firefox manifest)
```

### Build Commands

```bash
npm run build            # Build for both Firefox and Chrome
npm run build:firefox    # Build for Firefox only
npm run build:chrome     # Build for Chrome only
npm run clean            # Delete dist-firefox/ and dist-chrome/
npm run package          # Build + create .zip files for submission
```

---

## 5. TypeScript

### What It Is

TypeScript adds static type checking to JavaScript. It catches errors at compile time (like passing a string where a number is expected) and provides better editor autocomplete. Every `.ts` file in the extension is compiled to `.js` by esbuild during the build step.

### Extension-Specific Types

The extension defines its own types for cached data structures in `src/lib/storage.ts`:

```ts
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BlockListCache {
  id: string;
  user_id: string;
  name: string;
  active_days: DayOfWeek[] | null;  // null = every day
  is_enabled: boolean;
  order: number;
}

export interface BlockedWebsiteCache {
  id: string;
  block_list_id: string;
  domain: string;
}

export interface FocusSessionCache {
  id: string;
  user_id: string;
  phase: 'focus' | 'break' | 'idle';
  status: 'running' | 'paused' | 'stopped';
  phase_started_at: string;
  focus_duration: number;
  break_duration: number;
  cached_at: string;
}
```

The popup also defines its own types for the data it receives:

```ts
interface FocusSession {
  id: string;
  user_id: string;
  phase: 'focus' | 'break';
  status: 'running' | 'paused' | 'completed';
  phase_started_at: string;
  focus_duration: number;
  break_duration: number;
  elapsed_duration: number;
  started_at: string;
  ended_at: string | null;
}

interface BlockList {
  id: string;
  name: string;
  is_enabled: boolean;
  active_days: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] | null;
}
```

### Simpler Config (No SvelteKit)

The extension's `tsconfig.json` is minimal compared to the main app. There is no SvelteKit, no path aliases, no special preprocessor configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "noEmit": false,
    "types": ["webextension-polyfill"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Key points:
- **target: ES2022** -- Modern JavaScript features like top-level await and private class fields are available
- **types: ["webextension-polyfill"]** -- Loads the `@types/webextension-polyfill` package, which provides TypeScript definitions for all `browser.*` APIs
- **strict: true** -- Enables all strict type-checking options

---

## 6. Extension Architecture

### How Browser Extensions Work

A browser extension is not a normal web page. It consists of several isolated scripts that run in different contexts and communicate through message passing.

```
+----------------------------------------------------+
|  BROWSER                                            |
|                                                     |
|  +----------------------------------------------+  |
|  | Service Worker (background/service-worker.js) |  |
|  | - Runs invisibly, no DOM access               |  |
|  | - Polls Supabase for focus session state      |  |
|  | - Intercepts web navigations                  |  |
|  | - Maintains realtime subscription             |  |
|  | - Can be suspended/woken by browser           |  |
|  +----------------------------------------------+  |
|          ^            ^            ^                 |
|          | messages   | messages   | messages        |
|          v            v            v                 |
|  +----------+  +-----------+  +-----------+         |
|  |  Popup   |  |  Blocked  |  |  Options  |         |
|  |  (UI)    |  |  Page     |  |  Page     |         |
|  +----------+  +-----------+  +-----------+         |
+----------------------------------------------------+
```

### Service Worker (Background Script)

**File:** `src/background/service-worker.ts`

The service worker is the brain of the extension. It runs in the background without any visible UI. It:

- **Polls Supabase** every ~30 seconds (via two staggered alarms) to check for active focus sessions
- **Intercepts web navigations** via `browser.webNavigation.onBeforeNavigate` and redirects blocked domains to the blocked page
- **Maintains a single realtime WebSocket** connection to Supabase for instant updates
- **Responds to messages** from the popup and other pages (e.g., `GET_FOCUS_STATUS`, `GET_BLOCK_LISTS`)
- **Caches data in IndexedDB** (block lists, blocked websites, focus session state) so the popup does not need to query Supabase directly

The service worker can be **suspended** by the browser at any time to save resources. This is why alarms are essential -- they wake the service worker periodically to check for updates and reconnect realtime if needed.

### Popup UI

**Files:** `src/popup/popup.ts`, `src/popup/popup.html`, `src/popup/popup.css`

The popup appears when the user clicks the extension icon in the browser toolbar. It shows:

- Current focus session status (focus, break, paused, or idle)
- Today's total focus time
- Block lists and their active/inactive status
- PIN input (if not authenticated) -- a 6-digit numeric PIN field replaces a traditional login form
- Offline indicator

The popup does **not** query Supabase directly for data. It sends messages to the service worker and renders the cached responses. This reduces Supabase egress from 6 realtime connections (3 in the service worker + 3 in the popup) down to 1 consolidated channel.

### Blocked Page

**Files:** `src/pages/blocked.ts`, `src/pages/blocked.html`, `src/pages/blocked.css`

When the service worker intercepts a navigation to a blocked domain, it redirects the tab to this page. The blocked page:

- Displays an encouraging message ("Stay in the flow.")
- Shows a random motivational submessage
- Renders a **Canvas-based spiral galaxy animation** (starfield + rotating galaxy with 5,600+ stars)
- Provides a "Return to Stellar" button that focuses an existing app tab or opens a new one
- Supports keyboard shortcuts (Escape to go back, Enter to open Stellar)

### Options Page

**Files:** `src/options/options.ts`, `src/options/options.html`, `src/options/options.css`

The options page is where the user configures which Supabase instance to connect to. It contains a form with three fields:

- **Supabase URL** -- the project URL (e.g., `https://abc123.supabase.co`)
- **Supabase Anon Key** -- the public anonymous key
- **App URL** -- Stellar Planner URL

On save, the options page validates the connection by making a test query, stores the config in `browser.storage.local`, and notifies the service worker to re-initialize via `browser.runtime.sendMessage({ type: 'CONFIG_UPDATED' })`.

The options page also includes a debug mode toggle.

### Manifest Files (V3 for Both Chrome and Firefox)

Both Chrome and Firefox use Manifest V3, but with slight differences.

**Chrome manifest** (`manifests/chrome.json`):
```json
{
  "manifest_version": 3,
  "name": "Stellar Focus",
  "permissions": ["storage", "webNavigation", "alarms"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html"
  },
  "options_page": "options/options.html"
}
```

**Firefox manifest** (`manifests/firefox.json`):
```json
{
  "manifest_version": 3,
  "name": "Stellar Focus",
  "permissions": ["storage", "webNavigation", "alarms"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "scripts": ["background/service-worker.js"],
    "type": "module"
  },
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": true
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "stellar-focus@stellar.app",
      "strict_min_version": "142.0"
    }
  }
}
```

Key differences:
- Chrome uses `"service_worker": "file.js"` (a string). Firefox uses `"scripts": ["file.js"]` (an array).
- Chrome uses `"options_page"`. Firefox uses `"options_ui"` with `"open_in_tab": true`.
- Firefox requires `"browser_specific_settings"` with a gecko extension ID.

---

## 7. No UI Framework (Vanilla JS/HTML)

### Why No Framework

The extension uses plain HTML, CSS, and JavaScript with no UI framework (no Svelte, React, or Vue). This is deliberate:

1. **Smaller bundle size** -- No framework runtime to download. The popup JS bundle is as small as possible.
2. **Faster popup load** -- The popup must appear instantly when the user clicks the icon. Framework initialization adds latency.
3. **Simpler mental model** -- The popup has ~15 DOM elements. A framework would add complexity without proportional benefit.
4. **No reactivity needed** -- The popup displays data from the service worker and does not have complex interactive state.

### DOM Manipulation Patterns

The extension grabs DOM elements by ID at the top of each script and manipulates them directly:

```ts
// Get references to DOM elements
const statusLabel = document.getElementById('statusLabel') as HTMLElement;
const statusDesc = document.getElementById('statusDesc') as HTMLElement;
const blockListsContainer = document.getElementById('blockLists') as HTMLElement;

// Update text content
statusLabel.textContent = 'Focus Time';
statusDesc.textContent = 'Stay focused -- distractions blocked';

// Toggle visibility with CSS classes
authSection.classList.add('hidden');
mainSection.classList.remove('hidden');

// Create elements dynamically for lists
const itemDiv = document.createElement('div');
itemDiv.className = 'block-list-item';

const nameSpan = document.createElement('span');
nameSpan.className = 'block-list-name';
nameSpan.textContent = list.name;
itemDiv.appendChild(nameSpan);

blockListsContainer.appendChild(itemDiv);
```

SVG icons are created using `document.createElementNS` (required for SVG elements):

```ts
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.setAttribute('width', '16');
svg.setAttribute('height', '16');
svg.setAttribute('viewBox', '0 0 24 24');

const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
path.setAttribute('d', 'M11 4H4a2 2 0 0 0-2 2v14...');
svg.appendChild(path);
```

### Canvas API for Galaxy Animation

The blocked page uses the HTML Canvas API to render a spiral galaxy animation. This is pure JavaScript with no libraries -- just the native `<canvas>` element and its 2D drawing context.

```ts
function initGalaxy() {
  const canvas = document.getElementById('galaxyCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');

  // Galaxy parameters
  const NUM_ARMS = 2;
  const STARS_PER_ARM = 2500;
  const GALAXY_RADIUS = 350;
  const ROTATION_SPEED = 0.00008;

  // Create star positions using spiral math
  for (let arm = 0; arm < NUM_ARMS; arm++) {
    const armAngle = (arm / NUM_ARMS) * Math.PI * 2;
    for (let i = 0; i < STARS_PER_ARM; i++) {
      const t = i / STARS_PER_ARM;
      const spiralAngle = armAngle + t * Math.PI * 3;
      const baseR = CORE_RADIUS + t * (GALAXY_RADIUS - CORE_RADIUS);
      // Add randomness for natural look
      const scatter = (Math.random() - 0.5) * ARM_SPREAD * baseR * 0.4;
      stars.push({ r: baseR + scatter, theta: spiralAngle, size, color, ... });
    }
  }

  // Animation loop using requestAnimationFrame
  function animate(time: number) {
    rotation += ROTATION_SPEED;
    ctx.clearRect(0, 0, width, height);

    // Draw radial gradient for galactic core glow
    const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, CORE_RADIUS * 3);
    coreGradient.addColorStop(0, 'rgba(255, 250, 240, 0.9)');
    coreGradient.addColorStop(1, 'rgba(108, 92, 231, 0)');
    ctx.fillStyle = coreGradient;
    ctx.arc(centerX, centerY, CORE_RADIUS * 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw each star with twinkle animation
    for (const star of stars) {
      const theta = star.theta + rotation;
      const x = centerX + Math.cos(theta) * star.r;
      const y = centerY + Math.sin(theta) * star.r;
      const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
      ctx.fillStyle = star.color;
      ctx.globalAlpha = twinkle;
      ctx.arc(x, y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
```

The galaxy has ~5,600 stars total: 800 core stars, 5,000 spiral arm stars (2,500 per arm), and 300 scattered field stars. Each star twinkles independently using sine waves with random offsets.

---

## 8. Local Storage (IndexedDB)

### What IndexedDB Is

IndexedDB is a browser-native database that stores structured data as key-value pairs. Unlike `localStorage` (which only stores strings), IndexedDB can store objects, arrays, and binary data. Crucially, it is available in service workers where `localStorage` is not.

### Raw IndexedDB (No Dexie)

Stellar Planner uses **Dexie.js**, a wrapper library that makes IndexedDB feel like a simple ORM. The extension uses the **raw IndexedDB API** instead because:

1. Fewer dependencies means a smaller bundle
2. The extension only needs basic CRUD operations on 3 stores
3. Dexie would add ~15KB for minimal benefit

The raw API is callback/event-based. The extension wraps it in Promises for easier use.

### Opening the Database

From `src/lib/storage.ts`:

```ts
const DB_NAME = 'stellar-focus-extension';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Return cached connection if available
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    // onupgradeneeded runs when the database is first created
    // or when DB_VERSION is incremented
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores (like tables in SQL)
      if (!db.objectStoreNames.contains('blockLists')) {
        const store = db.createObjectStore('blockLists', { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('blockedWebsites')) {
        const store = db.createObjectStore('blockedWebsites', { keyPath: 'id' });
        store.createIndex('block_list_id', 'block_list_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('focusSessionCache')) {
        db.createObjectStore('focusSessionCache', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
  });
}
```

### Read/Write Patterns

Generic CRUD functions wrap the verbose IndexedDB API:

```ts
// Write (insert or update)
async function put<T>(storeName: string, data: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Read by key
async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Read all records
async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Delete by key
async function remove(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Clear all records in a store
async function clear(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
```

These are exported as typed cache objects:

```ts
export const blockListsCache = {
  put: (data: BlockListCache) => put('blockLists', data),
  get: (key: string) => get<BlockListCache>('blockLists', key),
  getAll: () => getAll<BlockListCache>('blockLists'),
  delete: (key: string) => remove('blockLists', key),
  clear: () => clear('blockLists'),
};

export const blockedWebsitesCache = {
  put: (data: BlockedWebsiteCache) => put('blockedWebsites', data),
  get: (key: string) => get<BlockedWebsiteCache>('blockedWebsites', key),
  getAll: () => getAll<BlockedWebsiteCache>('blockedWebsites'),
  delete: (key: string) => remove('blockedWebsites', key),
  clear: () => clear('blockedWebsites'),
};

export const focusSessionCacheStore = {
  put: (data: FocusSessionCache) => put('focusSessionCache', data),
  get: (key: string) => get<FocusSessionCache>('focusSessionCache', key),
  delete: (key: string) => remove('focusSessionCache', key),
  clear: () => clear('focusSessionCache'),
};
```

### 3 Object Stores

| Store | Key | Purpose |
|---|---|---|
| `blockLists` | `id` (UUID) | Cached enabled block lists from Supabase |
| `blockedWebsites` | `id` (UUID) | Cached blocked domains from Supabase |
| `focusSessionCache` | `'current'` (fixed key) | The single active focus session |

---

## 9. Communication with Main App

### No Direct Communication

The extension and Stellar Planner **never communicate directly**. There are no content scripts, no postMessage calls, and no shared state in the browser. They are completely independent codebases that happen to connect to the same Supabase project.

### Shared Supabase Backend

All communication flows through the Supabase database:

```
+-------------------+         +-------------------+         +-------------------+
|                   |         |                   |         |                   |
| Stellar Planner   |  write  |     Supabase      | realtime|   Extension       |
|   (SvelteKit)     | ------> |   (PostgreSQL)    | ------> |   (Service Worker)|
|                   |         |                   |         |                   |
|  User starts a    |         |  focus_sessions   |         |  Receives update  |
|  focus session    |         |  table updated    |         |  via WebSocket    |
|                   |         |                   |         |  Starts blocking  |
+-------------------+         +-------------------+         +-------------------+
```

### The Flow in Detail

1. **User starts a focus session** in Stellar Planner
2. The app **writes a row** to the `focus_sessions` table in Supabase with `status: 'running'` and `phase: 'focus'`
3. Supabase **broadcasts the change** over a WebSocket to all subscribed clients
4. The extension's service worker **receives the realtime event** and updates its local state
5. The service worker **starts blocking** by checking navigations against the cached block lists
6. When the user visits a blocked domain, the service worker **redirects** the tab to `pages/blocked.html`

The same flow applies for block list changes:

1. User **creates or edits a block list** in Stellar Planner
2. The app writes to `block_lists` and `blocked_websites` tables
3. Extension receives the change via realtime
4. Extension **updates its IndexedDB cache** directly from the realtime payload (no re-fetch needed)

### Why This Architecture

- **No content scripts needed** -- The extension does not inject code into web pages. It intercepts navigations at the browser level.
- **Works across devices** -- The same Supabase data drives both the app and the extension. Changes on one device appear on another.
- **Offline safety** -- When offline, the extension stops blocking entirely. It never blocks based on stale data because blocking requires both an online connection and an authenticated session.

---

## 10. Quick Reference

### File Locations

| File | Purpose |
|---|---|
| `src/background/service-worker.ts` | Background script: polling, blocking, realtime, message handling |
| `src/popup/popup.ts` | Popup UI logic: auth, status display, block list rendering |
| `src/popup/popup.html` | Popup HTML structure |
| `src/popup/popup.css` | Popup styles |
| `src/pages/blocked.ts` | Blocked page logic: galaxy animation, navigation |
| `src/pages/blocked.html` | Blocked page HTML structure |
| `src/pages/blocked.css` | Blocked page styles |
| `src/options/options.ts` | Options page logic: config form, validation |
| `src/options/options.html` | Options page HTML structure |
| `src/options/options.css` | Options page styles |
| `src/auth/supabase.ts` | Supabase client with custom storage adapter |
| `src/config.ts` | Extension configuration (reads from browser.storage.local) |
| `src/lib/storage.ts` | IndexedDB wrapper: block lists, websites, session cache |
| `src/lib/network.ts` | Network connectivity detection |
| `src/lib/debug.ts` | Debug logging (toggled via options page) |
| `build.js` | esbuild build script |
| `tsconfig.json` | TypeScript configuration |
| `manifests/chrome.json` | Chrome Manifest V3 |
| `manifests/firefox.json` | Firefox Manifest V3 |
| `package.json` | Dependencies and build scripts |

### Dependencies

**Production (2):**
| Package | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | ^2.45.0 | Supabase client (auth, database queries, realtime) |
| `webextension-polyfill` | ^0.12.0 | Cross-browser extension API compatibility |

**Development (3):**
| Package | Version | Purpose |
|---|---|---|
| `@types/webextension-polyfill` | ^0.10.7 | TypeScript types for browser extension APIs |
| `esbuild` | ^0.27.2 | TypeScript bundler |
| `typescript` | ^5.3.0 | Type checking (esbuild handles compilation) |

---

## 11. Building & Testing

### Build

```bash
# Install dependencies
npm install

# Build for both browsers
npm run build

# Build for one browser
npm run build:firefox
npm run build:chrome

# Type-check without building
npm run typecheck

# Clean build output
npm run clean

# Build + create .zip files for store submission
npm run package
```

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select `dist-firefox/manifest.json`
4. The extension icon appears in the toolbar

### Load in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist-chrome/` directory
5. The extension icon appears in the toolbar

### Testing the Blocking Flow

1. Configure the extension via the options page (Supabase URL, anon key, app URL)
2. Log in via the popup
3. Start a focus session in Stellar Planner
4. The extension receives the update via realtime (watch the sync indicator in the popup)
5. Navigate to a domain in your block lists -- you should see the blocked page with the galaxy animation

### Debugging

1. Enable debug mode in the options page
2. Open the browser's extension debugging tools:
   - **Firefox:** `about:debugging` > Click "Inspect" on Stellar Focus
   - **Chrome:** `chrome://extensions` > Click "Inspect views: service worker"
3. All `debugLog`, `debugWarn`, and `debugError` calls appear in the console

### After Code Changes

There is no hot reload. After changing source code:

1. Run `npm run build` (or `npm run build:firefox` / `npm run build:chrome`)
2. Reload the extension:
   - **Firefox:** Click the reload icon on `about:debugging`
   - **Chrome:** Click the refresh icon on `chrome://extensions`
3. Close and reopen the popup to see changes
