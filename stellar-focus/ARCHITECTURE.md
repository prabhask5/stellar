# Stellar Focus Extension Architecture

This document provides a complete technical reference for the Stellar Focus browser extension, covering every significant file, module, and function.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Data Flow](#data-flow)
3. [Service Worker](#service-worker)
4. [Storage Layer](#storage-layer)
5. [Authentication](#authentication)
6. [Popup UI](#popup-ui)
7. [Blocked Page](#blocked-page)
8. [Network Layer](#network-layer)
9. [Build System](#build-system)
10. [File Reference](#file-reference)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Stellar Focus Extension                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │  Service Worker  │───▶│  IndexedDB Cache │◀───│  Popup UI        │   │
│  │  (Background)    │    │  (Local Storage) │    │  (User Interface)│   │
│  └────────┬─────────┘    └──────────────────┘    └──────────────────┘   │
│           │                                                              │
│           │ webNavigation.onBeforeNavigate                               │
│           ▼                                                              │
│  ┌──────────────────┐                           ┌──────────────────┐    │
│  │ Blocking Logic   │──────────────────────────▶│  Blocked Page    │    │
│  └──────────────────┘                           │  (Galaxy Canvas) │    │
│                                                  └──────────────────┘    │
├──────────────────────────────────────────────────────────────────────────┤
│                              Network                                      │
│                                 │                                         │
│                                 ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        Supabase                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │  │ focus_      │  │ block_      │  │  Real-time WebSocket     │   │   │
│  │  │ sessions    │  │ lists       │  │  Subscriptions           │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Online-First Blocking**: Only blocks when online and can verify focus session state
2. **Fail-Safe Offline**: When offline, defaults to allowing all navigation
3. **Real-Time Updates**: WebSocket subscriptions for instant state changes
4. **Polling Backup**: 30-second polling as fallback for missed real-time events
5. **Local Caching**: IndexedDB cache for offline credential and state persistence

---

## Data Flow

### Navigation Blocking Flow

```
User navigates to URL
        │
        ▼
┌───────────────────────────┐
│ webNavigation.            │
│ onBeforeNavigate listener │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│ Check: isOnline?          │──No──▶ Allow navigation
└───────────┬───────────────┘
            │ Yes
            ▼
┌───────────────────────────┐
│ Check: currentFocusSession│──No──▶ Allow navigation
│ exists?                   │
└───────────┬───────────────┘
            │ Yes
            ▼
┌───────────────────────────┐
│ Check: status === running │──No──▶ Allow navigation
│ AND phase === focus?      │
└───────────┬───────────────┘
            │ Yes
            ▼
┌───────────────────────────┐
│ isDomainBlocked(hostname) │──No──▶ Allow navigation
└───────────┬───────────────┘
            │ Yes
            ▼
┌───────────────────────────┐
│ Redirect to blocked.html  │
│ with domain parameter     │
└───────────────────────────┘
```

### Sync Flow

```
                     ┌──────────────────┐
                     │   Browser Start  │
                     │   or Install     │
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │     init()       │
                     └────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      pollFocusSession()  refreshBlockLists()  setupRealtimeSubscriptions()
              │               │               │
              ▼               ▼               ▼
      Supabase Query   Supabase Query    WebSocket Channels
              │               │               │
              ▼               ▼               ▼
      Update cache     Update cache     Listen for changes
              │               │               │
              └───────────────┴───────────────┘
                              │
                              ▼
                     Blocking Logic Ready
```

---

## Service Worker

### `src/background/service-worker.ts`

The core background script that orchestrates all extension functionality.

**Constants:**
```typescript
POLL_INTERVAL_MS = 30 * 1000  // 30 seconds
```

**Global State:**
```typescript
let currentFocusSession: FocusSessionCache | null = null;
let isOnline: boolean;
let focusSessionChannel: RealtimeChannel | null;
let blockListChannel: RealtimeChannel | null;
let blockedWebsitesChannel: RealtimeChannel | null;
```

### Lifecycle Events

#### `browser.runtime.onInstalled`
Triggered on first install or update.
- Calls `setupAlarm()` to configure polling
- Calls `init()` to initialize state

#### `browser.runtime.onStartup`
Triggered when browser starts.
- Same initialization as onInstalled

#### `browser.alarms.onAlarm`
Triggered by polling alarm every 30 seconds.
- Calls `pollFocusSession()` to check for updates

### Core Functions

#### `init(): Promise<void>`
Initializes extension state.
```typescript
async function init() {
  // 1. Check online status
  isOnline = await checkConnectivity(getSupabaseUrl());

  // 2. Load cached focus session
  const cached = await focusSessionCacheStore.get('current');
  if (cached) currentFocusSession = cached;

  // 3. Poll for current session
  await pollFocusSession();

  // 4. Load block lists
  await refreshBlockLists();

  // 5. Set up real-time subscriptions
  await setupRealtimeSubscriptions();
}
```

#### `setupAlarm(): void`
Configures the polling alarm.
```typescript
function setupAlarm() {
  browser.alarms.create('focus-poll', {
    periodInMinutes: POLL_INTERVAL_MS / 60000 // 0.5 minutes
  });
}
```

#### `pollFocusSession(): Promise<void>`
Fetches current focus session from Supabase.

**Steps:**
1. Check connectivity
2. Re-setup subscriptions if just came back online
3. Verify authentication
4. Query `focus_sessions` table for active session
5. Update local cache and `currentFocusSession`
6. Refresh block lists if session just started

#### `refreshBlockLists(): Promise<void>`
Fetches and caches block lists from Supabase.

**Steps:**
1. Verify online and authenticated
2. Query `block_lists` table for user's lists
3. Query `blocked_websites` table for all blocked domains
4. Clear and repopulate local cache
5. Log summary of cached lists

#### `setupRealtimeSubscriptions(): Promise<void>`
Creates WebSocket channels for instant updates.

**Channels:**
| Channel | Table | Filter | On Update |
|---------|-------|--------|-----------|
| `focusSessionChannel` | `focus_sessions` | `user_id=eq.{userId}` | `pollFocusSession()` |
| `blockListChannel` | `block_lists` | `user_id=eq.{userId}` | `refreshBlockLists()` |
| `blockedWebsitesChannel` | `blocked_websites` | (all) | `refreshBlockLists()` |

#### `isDomainBlocked(hostname: string): Promise<boolean>`
Determines if a domain should be blocked.

```typescript
async function isDomainBlocked(hostname: string): Promise<boolean> {
  // Get cached block lists and websites
  const blockLists = await blockListsCache.getAll();
  const blockedWebsites = await blockedWebsitesCache.getAll();

  // Get current day of week (0=Sunday, 6=Saturday)
  const currentDay = new Date().getDay();

  // Check each enabled block list
  for (const list of blockLists) {
    if (!list.is_enabled) continue;

    // Check if today is an active day
    if (list.active_days !== null && !list.active_days.includes(currentDay)) {
      continue;
    }

    // Check if hostname matches any blocked website in this list
    const listWebsites = blockedWebsites.filter(w => w.block_list_id === list.id);
    for (const website of listWebsites) {
      if (matchesDomain(hostname, website.domain)) {
        return true;
      }
    }
  }
  return false;
}
```

**Domain Matching:**
```typescript
function matchesDomain(hostname: string, blockedDomain: string): boolean {
  // Exact match
  if (hostname === blockedDomain) return true;
  // Subdomain match (www.youtube.com matches youtube.com)
  if (hostname.endsWith('.' + blockedDomain)) return true;
  return false;
}
```

### WebNavigation Listener

```typescript
browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only block main frame navigations
  if (details.frameId !== 0) return;

  const url = new URL(details.url);
  const hostname = url.hostname;

  // Skip internal URLs
  if (hostname === '' ||
      url.protocol === 'moz-extension:' ||
      url.protocol === 'chrome-extension:' ||
      url.protocol === 'about:') return;

  // CRITICAL: Don't block if offline (fail-safe)
  if (!isOnline) return;

  // Must have active focus session
  if (!currentFocusSession) return;
  if (currentFocusSession.status !== 'running') return;
  if (currentFocusSession.phase !== 'focus') return;

  // Check if domain is blocked
  if (await isDomainBlocked(hostname)) {
    const blockedUrl = browser.runtime.getURL(
      `pages/blocked.html?url=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(hostname)}`
    );
    browser.tabs.update(details.tabId, { url: blockedUrl });
  }
});
```

### Message Handling

```typescript
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CHECK_UPDATE':
      sendResponse({ updateAvailable: false });
      break;

    case 'BLOCK_LIST_UPDATED':
      refreshBlockLists();
      break;

    case 'FOCUS_SESSION_UPDATED':
      pollFocusSession();
      break;

    case 'GET_STATUS':
      sendResponse({
        isOnline,
        focusActive: currentFocusSession?.status === 'running' &&
                     currentFocusSession?.phase === 'focus'
      });
      break;
  }
});
```

---

## Storage Layer

### `src/lib/storage.ts`

IndexedDB storage for caching extension data.

**Database Configuration:**
```typescript
const DB_NAME = 'stellar-focus-extension';
const DB_VERSION = 1;
```

**Object Stores:**

| Store | Key Path | Indexes | Purpose |
|-------|----------|---------|---------|
| `blockLists` | `id` | `user_id` | Cached block list configurations |
| `blockedWebsites` | `id` | `block_list_id` | Cached domain entries |
| `focusSessionCache` | `id` | - | Current session state |

### Type Definitions

```typescript
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface CachedBlockList {
  id: string;
  user_id: string;
  name: string;
  active_days: DayOfWeek[] | null;  // null = all days
  is_enabled: boolean;
  order: number;
}

interface CachedBlockedWebsite {
  id: string;
  block_list_id: string;
  domain: string;
}

interface FocusSessionCache {
  id: string;             // 'current'
  user_id: string;
  phase: 'focus' | 'break' | 'idle';
  status: 'running' | 'paused' | 'stopped';
  phase_started_at: string;
  focus_duration: number;
  break_duration: number;
  cached_at: string;
}
```

### Store Operations

Each store exports an object with CRUD operations:

```typescript
export const blockListsCache = {
  put: (data: CachedBlockList) => put('blockLists', data),
  get: (key: string) => get<CachedBlockList>('blockLists', key),
  getAll: () => getAll<CachedBlockList>('blockLists'),
  delete: (key: string) => remove('blockLists', key),
  clear: () => clear('blockLists'),
};

export const blockedWebsitesCache = {
  put: (data: CachedBlockedWebsite) => put('blockedWebsites', data),
  get: (key: string) => get<CachedBlockedWebsite>('blockedWebsites', key),
  getAll: () => getAll<CachedBlockedWebsite>('blockedWebsites'),
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

---

## Authentication

### `src/auth/supabase.ts`

Supabase client configured for browser extension environment.

**Storage Adapter:**
Uses `browser.storage.local` for session persistence:

```typescript
export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: {
          getItem: async (key) => {
            const result = await browser.storage.local.get(key);
            return result[key] || null;
          },
          setItem: async (key, value) => {
            await browser.storage.local.set({ [key]: value });
          },
          removeItem: async (key) => {
            await browser.storage.local.remove(key);
          },
        },
      },
    });
  }
  return supabaseInstance;
}
```

**Exported Functions:**

| Function | Description |
|----------|-------------|
| `getSupabase()` | Returns Supabase client singleton |
| `getSession()` | Returns current auth session or null |
| `getUser()` | Returns current user or null |

---

## Popup UI

### `src/popup/popup.ts`

Popup interface logic.

**Key Functions:**

| Function | Description |
|----------|-------------|
| `initializePopup()` | Set up UI, check auth, load data |
| `loadFocusStatus()` | Fetch and display current session |
| `loadBlockLists()` | Fetch and display block lists |
| `handleLogin(email, password)` | Supabase auth login |
| `handleLogout()` | Sign out and clear state |
| `navigateToApp(url)` | Open or focus existing Stellar tab |
| `updateSyncIndicator(state)` | Update sync status UI |

**UI States:**
- Offline placeholder
- Auth section (login form)
- Main section (focus status, block lists, user info)

### `src/popup/popup.html`

Popup markup with:
- Animated starfield background
- Sync status indicator
- Focus status card with phase icons
- Block lists section
- User info and logout button
- Footer with Stellar link and privacy policy

### `src/popup/popup.css`

Styles matching Stellar app design system:
- Deep space color palette
- Glassmorphism effects
- Smooth transitions
- Status indicators with animations

---

## Blocked Page

### `src/pages/blocked.ts`

Cinematic blocked page with two canvas-based animations.

**URL Parameters:**
```typescript
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    url: params.get('url') || '',
    domain: params.get('domain') || ''
  };
}
```

### Spiral Galaxy Renderer

Procedural galaxy generation with:
- 2 spiral arms (2,500 stars each)
- Dense core (800 stars)
- Scattered field stars (300)
- Slow rotation animation
- Per-star twinkling

**Galaxy Parameters:**
```typescript
const NUM_ARMS = 2;
const ARM_SPREAD = 0.5;
const STARS_PER_ARM = 2500;
const GALAXY_RADIUS = 350;
const CORE_RADIUS = 40;
const ROTATION_SPEED = 0.00008;
```

**Star Structure:**
```typescript
interface GalaxyStar {
  r: number;           // Radial distance from center
  theta: number;       // Angle in radians
  size: number;        // Star radius
  color: string;       // RGBA color
  twinkleSpeed: number;
  twinkleOffset: number;
  twinkleIntensity: number;
}
```

### Background Starfield

Simpler starfield for depth:
- 500 randomly placed stars
- Three size tiers
- Independent twinkling
- Glow effect for bright stars

**Star Structure:**
```typescript
interface BackgroundStar {
  x: number;
  y: number;
  baseSize: number;
  maxBrightness: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  twinkleIntensity: number;
}
```

### Encouraging Messages

Fixed main message with rotating submessages:
```typescript
const submessages = [
  'This moment is for your focus.',
  'You\'ve got this.',
  'Your future self will thank you.',
  'Distractions can wait.',
  'Deep work requires deep focus.',
  'The best work happens here.',
  'Stay present. Stay powerful.',
  'This is where the magic happens.',
  'Trust the process.',
  'You\'re building something great.'
];
```

### Navigation

**Return to Stellar:**
```typescript
async function focusOrOpenApp() {
  const tabs = await browser.tabs.query({
    currentWindow: true,
    url: `${config.appUrl}/*`
  });

  if (tabs.length > 0 && tabs[0].id !== undefined) {
    // Focus existing Stellar tab
    await browser.tabs.update(tabs[0].id, { active: true });
  } else {
    // Create new tab
    await browser.tabs.create({ url: `${config.appUrl}/focus` });
  }
}
```

**Keyboard Shortcuts:**
- `Escape`: Go back in history
- `Enter`: Open/focus Stellar app

---

## Network Layer

### `src/lib/network.ts`

Network status detection and connectivity checking.

**Functions:**

| Function | Description |
|----------|-------------|
| `getNetworkStatus()` | Returns current `navigator.onLine` status |
| `checkConnectivity(url)` | Active check by fetching URL |
| `getSupabaseUrl()` | Returns configured Supabase URL |

**Active Connectivity Check:**
```typescript
export async function checkConnectivity(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      mode: 'no-cors'
    });
    return true;
  } catch {
    return false;
  }
}
```

---

## Build System

### `build.js`

Node.js build script using esbuild.

**Build Targets:**
| Target | Manifest | Output |
|--------|----------|--------|
| `firefox` | `manifests/firefox.json` | `dist-firefox/` |
| `chrome` | `manifests/chrome.json` | `dist-chrome/` |

**Build Process:**
1. Clean output directory
2. Copy manifest for target browser
3. Bundle TypeScript files with esbuild:
   - `src/background/service-worker.ts` → `background/service-worker.js`
   - `src/popup/popup.ts` → `popup/popup.js`
   - `src/pages/blocked.ts` → `pages/blocked.js`
4. Copy static assets (HTML, CSS, icons)

**esbuild Configuration:**
```javascript
await esbuild.build({
  entryPoints: [...],
  bundle: true,
  outdir: outDir,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: false,  // Easier debugging
  sourcemap: false
});
```

### Manifest Differences

**Firefox (`manifests/firefox.json`):**
```json
{
  "background": {
    "scripts": ["background/service-worker.js"],
    "type": "module"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "stellar-focus@stellar.app",
      "strict_min_version": "142.0",
      "data_collection_permissions": {
        "required": ["authenticationInfo", "personallyIdentifyingInfo"]
      }
    }
  }
}
```

**Chrome (`manifests/chrome.json`):**
```json
{
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  }
}
```

---

## File Reference

```
stellar-focus/
├── manifests/
│   ├── firefox.json           # Firefox manifest (MV3)
│   └── chrome.json            # Chrome manifest (MV3)
├── icons/
│   ├── icon-48.png           # Toolbar icon
│   └── icon-128.png          # Store listing icon
├── src/
│   ├── config.ts              # Config loader
│   ├── config.local.ts        # Local secrets (gitignored)
│   ├── config.local.example.ts # Config template
│   ├── background/
│   │   └── service-worker.ts  # Background script
│   │       ├── init()
│   │       ├── setupAlarm()
│   │       ├── pollFocusSession()
│   │       ├── refreshBlockLists()
│   │       ├── setupRealtimeSubscriptions()
│   │       ├── isDomainBlocked()
│   │       └── onBeforeNavigate listener
│   ├── popup/
│   │   ├── popup.html         # Popup markup
│   │   ├── popup.ts           # Popup logic
│   │   │   ├── initializePopup()
│   │   │   ├── loadFocusStatus()
│   │   │   ├── loadBlockLists()
│   │   │   ├── handleLogin()
│   │   │   └── navigateToApp()
│   │   └── popup.css          # Popup styles
│   ├── pages/
│   │   ├── blocked.html       # Blocked page markup
│   │   ├── blocked.ts         # Blocked page logic
│   │   │   ├── initGalaxy()
│   │   │   ├── initStarfield()
│   │   │   └── focusOrOpenApp()
│   │   └── blocked.css        # Blocked page styles
│   ├── lib/
│   │   ├── storage.ts         # IndexedDB layer
│   │   │   ├── blockListsCache
│   │   │   ├── blockedWebsitesCache
│   │   │   └── focusSessionCacheStore
│   │   └── network.ts         # Network utilities
│   │       ├── getNetworkStatus()
│   │       └── checkConnectivity()
│   └── auth/
│       └── supabase.ts        # Supabase client
│           ├── getSupabase()
│           ├── getSession()
│           └── getUser()
├── build.js                    # esbuild script
├── package.json
├── tsconfig.json
├── dist-firefox/              # Firefox build output
└── dist-chrome/               # Chrome build output
```

---

## Communication Diagram

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Stellar App   │     │   Supabase     │     │   Extension    │
└───────┬────────┘     └───────┬────────┘     └───────┬────────┘
        │                      │                      │
        │  Start focus session │                      │
        ├─────────────────────▶│                      │
        │                      │                      │
        │                      │  WebSocket event     │
        │                      ├─────────────────────▶│
        │                      │                      │
        │                      │  pollFocusSession()  │
        │                      │◀─────────────────────┤
        │                      │                      │
        │                      │  Return session data │
        │                      ├─────────────────────▶│
        │                      │                      │
        │                      │           currentFocusSession = data
        │                      │                      │
        │                      │           User navigates to youtube.com
        │                      │                      │
        │                      │           isDomainBlocked('youtube.com')
        │                      │                      │
        │                      │           Redirect to blocked.html
        │                      │                      │
```
