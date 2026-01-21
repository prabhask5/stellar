# Stellar Focus Extension Architecture

Technical reference for the Stellar Focus browser extension covering service worker lifecycle, blocking logic, storage layer, Supabase integration, real-time synchronization, and failure modes.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Worker](#2-service-worker)
3. [Blocking Engine](#3-blocking-engine)
4. [Domain Resolution Algorithm](#4-domain-resolution-algorithm)
5. [Storage Layer](#5-storage-layer)
6. [Supabase Integration](#6-supabase-integration)
7. [Real-Time Synchronization](#7-real-time-synchronization)
8. [Polling Subsystem](#8-polling-subsystem)
9. [Authentication](#9-authentication)
10. [Network Detection](#10-network-detection)
11. [Message Passing](#11-message-passing)
12. [Build System](#12-build-system)
13. [Failure Modes](#13-failure-modes)

---

## 1. System Overview

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Stellar Focus Extension                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────┐          ┌─────────────────────┐                       │
│  │   Service Worker    │◀────────▶│   IndexedDB Cache   │                       │
│  │   (Background)      │          │   (Local Storage)   │                       │
│  └──────────┬──────────┘          └─────────────────────┘                       │
│             │                                                                    │
│             │ browser.webNavigation.onBeforeNavigate                            │
│             │                                                                    │
│  ┌──────────▼──────────┐          ┌─────────────────────┐                       │
│  │   Blocking Engine   │─────────▶│   Redirect Handler  │                       │
│  │                     │          │                     │                       │
│  │  • Phase check      │          │  tabs.update()      │                       │
│  │  • Domain matching  │          │  → blocked.html     │                       │
│  │  • Day scheduling   │          │                     │                       │
│  └─────────────────────┘          └─────────────────────┘                       │
│                                                                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                              External Services                                   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                              Supabase                                    │    │
│  │                                                                          │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │    │
│  │  │ focus_sessions  │  │ block_lists     │  │ Realtime WebSocket      │  │    │
│  │  │ (user sessions) │  │ (user lists)    │  │ (3 channels)            │  │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │    │
│  │                                                                          │    │
│  │  ┌─────────────────┐  ┌─────────────────┐                               │    │
│  │  │blocked_websites │  │ Supabase Auth   │                               │    │
│  │  │(domain entries) │  │ (JWT tokens)    │                               │    │
│  │  └─────────────────┘  └─────────────────┘                               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Fail-Safe Offline** | When offline or uncertain, allow all navigation |
| **Online-First Blocking** | Only block when connectivity verified and session confirmed |
| **Real-Time Primary** | WebSocket subscriptions for instant state propagation |
| **Polling Backup** | 30-second interval catches missed WebSocket events |
| **Local Cache** | IndexedDB for session persistence and offline state retention |
| **Main Frame Only** | Block navigations, not embedded resources |

---

## 2. Service Worker

### File: `src/background/service-worker.ts`

The service worker is the extension's persistent background process, responsible for intercepting navigations, managing state, and maintaining server connections.

### Global State

```typescript
let currentFocusSession: FocusSessionCache | null = null;
let isOnline: boolean = true;
let focusSessionChannel: RealtimeChannel | null = null;
let blockListChannel: RealtimeChannel | null = null;
let blockedWebsitesChannel: RealtimeChannel | null = null;
```

| Variable | Type | Purpose |
|----------|------|---------|
| `currentFocusSession` | `FocusSessionCache \| null` | Cached active focus session state |
| `isOnline` | `boolean` | Current connectivity status |
| `focusSessionChannel` | `RealtimeChannel \| null` | WebSocket channel for session updates |
| `blockListChannel` | `RealtimeChannel \| null` | WebSocket channel for block list changes |
| `blockedWebsitesChannel` | `RealtimeChannel \| null` | WebSocket channel for domain changes |

### Lifecycle Events

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  onInstalled    │      │   onStartup     │      │    onAlarm      │
│  (First/Update) │      │ (Browser Start) │      │  (Every 30s)    │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         ▼                        ▼                        ▼
    setupAlarm()             setupAlarm()           pollFocusSession()
         │                        │
         ▼                        ▼
      init()                   init()
```

#### `browser.runtime.onInstalled`

Triggered on first installation or extension update.

```typescript
browser.runtime.onInstalled.addListener(async (details) => {
  setupAlarm();
  await init();
});
```

#### `browser.runtime.onStartup`

Triggered when browser starts with extension installed.

```typescript
browser.runtime.onStartup.addListener(async () => {
  setupAlarm();
  await init();
});
```

#### `browser.alarms.onAlarm`

Triggered by polling alarm (every 30 seconds).

```typescript
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'focus-poll') {
    await pollFocusSession();
  }
});
```

### Initialization Sequence

```typescript
async function init(): Promise<void> {
  // 1. Check network connectivity
  isOnline = await checkConnectivity(getSupabaseUrl());

  // 2. Load cached session from IndexedDB
  const cached = await focusSessionCacheStore.get('current');
  if (cached) {
    currentFocusSession = cached;
  }

  // 3. If online, poll for fresh session data
  if (isOnline) {
    await pollFocusSession();
  }

  // 4. Refresh block lists cache
  await refreshBlockLists();

  // 5. Establish WebSocket subscriptions
  await setupRealtimeSubscriptions();
}
```

### Initialization Flow Diagram

```
                        init()
                          │
                          ▼
              ┌───────────────────────┐
              │  checkConnectivity()  │
              │  → isOnline = result  │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Load cached session  │
              │  from IndexedDB       │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  isOnline?            │
              └───────────┬───────────┘
                   │             │
                  Yes           No
                   │             │
                   ▼             │
              pollFocusSession() │
                   │             │
                   └──────┬──────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  refreshBlockLists()  │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  setupRealtimeSubs()  │
              └───────────────────────┘
```

### Alarm Configuration

```typescript
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

function setupAlarm(): void {
  browser.alarms.create('focus-poll', {
    periodInMinutes: POLL_INTERVAL_MS / 60000 // 0.5 minutes
  });
}
```

---

## 3. Blocking Engine

### Navigation Interception

The blocking engine uses `webNavigation.onBeforeNavigate` to intercept navigations before they occur.

```typescript
browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Decision chain executes synchronously for performance
  const shouldBlock = await evaluateBlockingDecision(details);

  if (shouldBlock) {
    const redirectUrl = buildBlockedPageUrl(details.url, hostname);
    browser.tabs.update(details.tabId, { url: redirectUrl });
  }
});
```

### Blocking Decision Flow

```
Navigation Event (details)
          │
          ▼
┌─────────────────────────────────┐
│ Guard: frameId === 0?           │── No ──▶ ALLOW (iframe/subframe)
│ (main frame only)               │
└───────────────┬─────────────────┘
                │ Yes
                ▼
┌─────────────────────────────────┐
│ Guard: Internal URL?            │── Yes ─▶ ALLOW
│ • moz-extension://              │
│ • chrome-extension://           │
│ • about:                        │
│ • empty hostname                │
└───────────────┬─────────────────┘
                │ No
                ▼
┌─────────────────────────────────┐
│ Guard: isOnline === true?       │── No ──▶ ALLOW (fail-safe)
└───────────────┬─────────────────┘
                │ Yes
                ▼
┌─────────────────────────────────┐
│ Guard: currentFocusSession      │── No ──▶ ALLOW (no session)
│ exists?                         │
└───────────────┬─────────────────┘
                │ Yes
                ▼
┌─────────────────────────────────┐
│ Guard: status === 'running'?    │── No ──▶ ALLOW (paused/stopped)
└───────────────┬─────────────────┘
                │ Yes
                ▼
┌─────────────────────────────────┐
│ Guard: phase === 'focus'?       │── No ──▶ ALLOW (break phase)
└───────────────┬─────────────────┘
                │ Yes
                ▼
┌─────────────────────────────────┐
│ Check: isDomainBlocked()        │── No ──▶ ALLOW (not in lists)
│ (domain resolution algorithm)   │
└───────────────┬─────────────────┘
                │ Yes
                ▼
        🚫 REDIRECT
        → blocked.html?domain=...
```

### Full Listener Implementation

```typescript
browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // 1. Main frame only
  if (details.frameId !== 0) return;

  // 2. Parse URL
  let url: URL;
  try {
    url = new URL(details.url);
  } catch {
    return; // Invalid URL, allow
  }

  const hostname = url.hostname;

  // 3. Skip internal URLs
  if (hostname === '' ||
      url.protocol === 'moz-extension:' ||
      url.protocol === 'chrome-extension:' ||
      url.protocol === 'about:' ||
      url.protocol === 'chrome:') {
    return;
  }

  // 4. Fail-safe: Don't block when offline
  if (!isOnline) return;

  // 5. Check session state
  if (!currentFocusSession) return;
  if (currentFocusSession.status !== 'running') return;
  if (currentFocusSession.phase !== 'focus') return;

  // 6. Check domain against block lists
  const blocked = await isDomainBlocked(hostname);

  if (blocked) {
    const blockedUrl = browser.runtime.getURL(
      `pages/blocked.html?url=${encodeURIComponent(details.url)}&domain=${encodeURIComponent(hostname)}`
    );
    browser.tabs.update(details.tabId, { url: blockedUrl });
  }
});
```

### Redirect URL Construction

```typescript
function buildBlockedPageUrl(originalUrl: string, hostname: string): string {
  const base = browser.runtime.getURL('pages/blocked.html');
  const params = new URLSearchParams({
    url: originalUrl,
    domain: hostname
  });
  return `${base}?${params.toString()}`;
}
```

---

## 4. Domain Resolution Algorithm

### Overview

The domain resolution algorithm determines if a hostname should be blocked based on:
1. Block list enabled status
2. Day-of-week scheduling
3. Exact domain matching
4. Subdomain matching

### Algorithm Pseudocode

```
isDomainBlocked(hostname):
  INPUT: hostname (e.g., "www.youtube.com")
  OUTPUT: boolean

  1. Normalize hostname
     hostname ← lowercase(hostname)

  2. Get current day of week
     currentDay ← getDay() // 0=Sunday, 6=Saturday

  3. Retrieve cached data
     blockLists ← IndexedDB.blockLists.getAll()
     blockedWebsites ← IndexedDB.blockedWebsites.getAll()

  4. For each blockList in blockLists:
       // Skip disabled lists
       IF blockList.is_enabled === false THEN
         CONTINUE

       // Check day scheduling
       IF blockList.active_days !== null THEN
         IF currentDay NOT IN blockList.active_days THEN
           CONTINUE
         END IF
       END IF

       // Get websites for this list
       listWebsites ← blockedWebsites.filter(w => w.block_list_id === blockList.id)

       // Check domain matching
       FOR EACH website IN listWebsites:
         IF matchesDomain(hostname, website.domain) THEN
           RETURN true
         END IF
       END FOR
     END FOR

  5. RETURN false
```

### Domain Matching Function

```typescript
function matchesDomain(hostname: string, blockedDomain: string): boolean {
  // Normalize both to lowercase
  const h = hostname.toLowerCase();
  const d = blockedDomain.toLowerCase();

  // Exact match: youtube.com === youtube.com
  if (h === d) return true;

  // Subdomain match: www.youtube.com ends with .youtube.com
  if (h.endsWith('.' + d)) return true;

  return false;
}
```

### Matching Examples

| Hostname | Blocked Domain | Match? | Reason |
|----------|----------------|--------|--------|
| `youtube.com` | `youtube.com` | ✓ | Exact match |
| `www.youtube.com` | `youtube.com` | ✓ | Subdomain match |
| `music.youtube.com` | `youtube.com` | ✓ | Subdomain match |
| `youtube.com` | `www.youtube.com` | ✗ | No subdomain match |
| `notyoutube.com` | `youtube.com` | ✗ | Different domain |
| `youtube.com.evil.com` | `youtube.com` | ✗ | Different domain |

### Day Scheduling Resolution

```
┌─────────────────────────────────────────────────────────────────┐
│                    Day Scheduling Logic                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Block List "Social Media"                                       │
│  active_days: [1, 2, 3, 4, 5]  (Monday-Friday)                  │
│                                                                  │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐                    │
│  │ Sun │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │                    │
│  │  0  │  1  │  2  │  3  │  4  │  5  │  6  │                    │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                    │
│  │  ✗  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✗  │                    │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘                    │
│                                                                  │
│  Block List "Entertainment"                                      │
│  active_days: null  (All days)                                   │
│                                                                  │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐                    │
│  │ Sun │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │                    │
│  │  0  │  1  │  2  │  3  │  4  │  5  │  6  │                    │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                    │
│  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │                    │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Full Implementation

```typescript
async function isDomainBlocked(hostname: string): Promise<boolean> {
  // Normalize hostname
  const normalizedHostname = hostname.toLowerCase();

  // Get current day (0=Sunday through 6=Saturday)
  const currentDay = new Date().getDay();

  // Retrieve cached data from IndexedDB
  const blockLists = await blockListsCache.getAll();
  const blockedWebsites = await blockedWebsitesCache.getAll();

  // Check each block list
  for (const list of blockLists) {
    // Skip disabled lists
    if (!list.is_enabled) continue;

    // Check day scheduling
    if (list.active_days !== null) {
      if (!list.active_days.includes(currentDay as DayOfWeek)) {
        continue;
      }
    }

    // Get websites belonging to this list
    const listWebsites = blockedWebsites.filter(
      w => w.block_list_id === list.id
    );

    // Check each domain
    for (const website of listWebsites) {
      if (matchesDomain(normalizedHostname, website.domain)) {
        return true;
      }
    }
  }

  return false;
}
```

---

## 5. Storage Layer

### File: `src/lib/storage.ts`

IndexedDB-based local storage for caching extension data.

### Database Schema

```
Database: stellar-focus-extension
Version: 1

┌─────────────────────────────────────────────────────────────────┐
│                        Object Stores                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Store: blockLists                                        │    │
│  │ Key Path: id                                             │    │
│  │ Indexes: user_id                                         │    │
│  │                                                          │    │
│  │ Schema:                                                  │    │
│  │   id: string (UUID)                                      │    │
│  │   user_id: string (UUID)                                 │    │
│  │   name: string                                           │    │
│  │   active_days: number[] | null                           │    │
│  │   is_enabled: boolean                                    │    │
│  │   order: number                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Store: blockedWebsites                                   │    │
│  │ Key Path: id                                             │    │
│  │ Indexes: block_list_id                                   │    │
│  │                                                          │    │
│  │ Schema:                                                  │    │
│  │   id: string (UUID)                                      │    │
│  │   block_list_id: string (UUID, FK)                       │    │
│  │   domain: string                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Store: focusSessionCache                                 │    │
│  │ Key Path: id                                             │    │
│  │                                                          │    │
│  │ Schema:                                                  │    │
│  │   id: string ('current')                                 │    │
│  │   user_id: string (UUID)                                 │    │
│  │   phase: 'focus' | 'break' | 'idle'                      │    │
│  │   status: 'running' | 'paused' | 'stopped'               │    │
│  │   phase_started_at: string (ISO timestamp)               │    │
│  │   focus_duration: number (seconds)                       │    │
│  │   break_duration: number (seconds)                       │    │
│  │   cached_at: string (ISO timestamp)                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Type Definitions

```typescript
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface CachedBlockList {
  id: string;
  user_id: string;
  name: string;
  active_days: DayOfWeek[] | null;
  is_enabled: boolean;
  order: number;
}

interface CachedBlockedWebsite {
  id: string;
  block_list_id: string;
  domain: string;
}

interface FocusSessionCache {
  id: string;              // Always 'current'
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

```typescript
// Block Lists Cache
export const blockListsCache = {
  put: (data: CachedBlockList) => put('blockLists', data),
  get: (key: string) => get<CachedBlockList>('blockLists', key),
  getAll: () => getAll<CachedBlockList>('blockLists'),
  delete: (key: string) => remove('blockLists', key),
  clear: () => clear('blockLists'),
};

// Blocked Websites Cache
export const blockedWebsitesCache = {
  put: (data: CachedBlockedWebsite) => put('blockedWebsites', data),
  get: (key: string) => get<CachedBlockedWebsite>('blockedWebsites', key),
  getAll: () => getAll<CachedBlockedWebsite>('blockedWebsites'),
  delete: (key: string) => remove('blockedWebsites', key),
  clear: () => clear('blockedWebsites'),
};

// Focus Session Cache
export const focusSessionCacheStore = {
  put: (data: FocusSessionCache) => put('focusSessionCache', data),
  get: (key: string) => get<FocusSessionCache>('focusSessionCache', key),
  delete: (key: string) => remove('focusSessionCache', key),
  clear: () => clear('focusSessionCache'),
};
```

### Database Initialization

```typescript
const DB_NAME = 'stellar-focus-extension';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create blockLists store
      if (!db.objectStoreNames.contains('blockLists')) {
        const store = db.createObjectStore('blockLists', { keyPath: 'id' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }

      // Create blockedWebsites store
      if (!db.objectStoreNames.contains('blockedWebsites')) {
        const store = db.createObjectStore('blockedWebsites', { keyPath: 'id' });
        store.createIndex('block_list_id', 'block_list_id', { unique: false });
      }

      // Create focusSessionCache store
      if (!db.objectStoreNames.contains('focusSessionCache')) {
        db.createObjectStore('focusSessionCache', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

### Cache Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      Cache Lifecycle                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Populate Cache:                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ Supabase    │───▶│ Transform   │───▶│ IndexedDB   │          │
│  │ Query       │    │ Response    │    │ put()       │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│                                                                  │
│  Triggers:                                                       │
│  • Extension initialization                                      │
│  • Successful Supabase query in pollFocusSession()              │
│  • Successful Supabase query in refreshBlockLists()             │
│  • Real-time event received                                      │
│                                                                  │
│  Clear Cache:                                                    │
│  ┌─────────────┐    ┌─────────────┐                              │
│  │ User Action │───▶│ IndexedDB   │                              │
│  │ or Event    │    │ clear()     │                              │
│  └─────────────┘    └─────────────┘                              │
│                                                                  │
│  Triggers:                                                       │
│  • User logout                                                   │
│  • Session expiration                                            │
│  • No results returned from Supabase (user deleted data)        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Supabase Integration

### File: `src/auth/supabase.ts`

Supabase client configured for the browser extension environment.

### Client Configuration

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          storage: extensionStorageAdapter,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return supabaseInstance;
}
```

### Extension Storage Adapter

Browser extensions cannot use localStorage in the service worker context. A custom adapter uses `browser.storage.local`:

```typescript
const extensionStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await browser.storage.local.get(key);
    return result[key] || null;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    await browser.storage.local.set({ [key]: value });
  },

  removeItem: async (key: string): Promise<void> => {
    await browser.storage.local.remove(key);
  },
};
```

### Database Queries

#### Focus Session Query

```typescript
async function queryFocusSession(userId: string): Promise<FocusSession | null> {
  const { data, error } = await getSupabase()
    .from('focus_sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['running', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
```

#### Block Lists Query

```typescript
async function queryBlockLists(userId: string): Promise<BlockList[]> {
  const { data, error } = await getSupabase()
    .from('block_lists')
    .select('*')
    .eq('user_id', userId)
    .order('order', { ascending: true });

  if (error) throw error;
  return data || [];
}
```

#### Blocked Websites Query

```typescript
async function queryBlockedWebsites(blockListIds: string[]): Promise<BlockedWebsite[]> {
  if (blockListIds.length === 0) return [];

  const { data, error } = await getSupabase()
    .from('blocked_websites')
    .select('*')
    .in('block_list_id', blockListIds);

  if (error) throw error;
  return data || [];
}
```

### Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    Supabase Data Flow                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐                                              │
│  │ focus_sessions  │◀─── Query: user_id, status IN (running,     │
│  │ table           │           paused), ORDER BY created_at DESC │
│  └────────┬────────┘           LIMIT 1                           │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────┐                                              │
│  │ FocusSession    │───▶ currentFocusSession (in-memory)        │
│  │ response        │───▶ focusSessionCacheStore (IndexedDB)     │
│  └─────────────────┘                                              │
│                                                                   │
│  ┌─────────────────┐                                              │
│  │ block_lists     │◀─── Query: user_id, ORDER BY order ASC     │
│  │ table           │                                              │
│  └────────┬────────┘                                              │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────┐                                              │
│  │ BlockList[]     │───▶ blockListsCache (IndexedDB)            │
│  │ response        │                                              │
│  └────────┬────────┘                                              │
│           │                                                       │
│           │ Extract block_list_ids                                │
│           ▼                                                       │
│  ┌─────────────────┐                                              │
│  │blocked_websites │◀─── Query: block_list_id IN (ids)          │
│  │ table           │                                              │
│  └────────┬────────┘                                              │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────┐                                              │
│  │ BlockedWebsite[]│───▶ blockedWebsitesCache (IndexedDB)       │
│  │ response        │                                              │
│  └─────────────────┘                                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Real-Time Synchronization

### WebSocket Channels

Three Supabase Realtime channels provide instant state updates:

| Channel | Table | Filter | Events | Handler |
|---------|-------|--------|--------|---------|
| `focusSessionChannel` | `focus_sessions` | `user_id=eq.{userId}` | INSERT, UPDATE, DELETE | `pollFocusSession()` |
| `blockListChannel` | `block_lists` | `user_id=eq.{userId}` | INSERT, UPDATE, DELETE | `refreshBlockLists()` |
| `blockedWebsitesChannel` | `blocked_websites` | (none) | INSERT, UPDATE, DELETE | `refreshBlockLists()` |

### Subscription Setup

```typescript
async function setupRealtimeSubscriptions(): Promise<void> {
  // Clean up existing subscriptions
  await cleanupSubscriptions();

  // Verify prerequisites
  if (!isOnline) return;
  const session = await getSession();
  if (!session) return;

  const userId = session.user.id;
  const supabase = getSupabase();

  // Set auth token for realtime
  supabase.realtime.setAuth(session.access_token);

  // Focus Sessions Channel
  focusSessionChannel = supabase
    .channel('focus_sessions_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'focus_sessions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        console.log('Focus session change:', payload.eventType);
        pollFocusSession();
      }
    )
    .subscribe();

  // Block Lists Channel
  blockListChannel = supabase
    .channel('block_lists_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'block_lists',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        console.log('Block list change:', payload.eventType);
        refreshBlockLists();
      }
    )
    .subscribe();

  // Blocked Websites Channel
  blockedWebsitesChannel = supabase
    .channel('blocked_websites_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'blocked_websites',
      },
      (payload) => {
        console.log('Blocked website change:', payload.eventType);
        refreshBlockLists();
      }
    )
    .subscribe();
}
```

### Subscription Cleanup

```typescript
async function cleanupSubscriptions(): Promise<void> {
  const supabase = getSupabase();

  if (focusSessionChannel) {
    await supabase.removeChannel(focusSessionChannel);
    focusSessionChannel = null;
  }

  if (blockListChannel) {
    await supabase.removeChannel(blockListChannel);
    blockListChannel = null;
  }

  if (blockedWebsitesChannel) {
    await supabase.removeChannel(blockedWebsitesChannel);
    blockedWebsitesChannel = null;
  }
}
```

### Real-Time Event Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                    Real-Time Event Flow                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Stellar App                    Supabase                Extension   │
│      │                             │                        │       │
│      │  User starts focus session  │                        │       │
│      ├────────────────────────────▶│                        │       │
│      │                             │                        │       │
│      │                             │  postgres_changes      │       │
│      │                             │  event (INSERT)        │       │
│      │                             ├───────────────────────▶│       │
│      │                             │                        │       │
│      │                             │     pollFocusSession() │       │
│      │                             │◀───────────────────────┤       │
│      │                             │                        │       │
│      │                             │     Return session     │       │
│      │                             ├───────────────────────▶│       │
│      │                             │                        │       │
│      │                             │    Update in-memory    │       │
│      │                             │    currentFocusSession │       │
│      │                             │                        │       │
│      │                             │    Update IndexedDB    │       │
│      │                             │    cache               │       │
│      │                             │                        │       │
│      │                             │    Blocking now active │       │
│      │                             │                        │       │
│                                                                     │
│  Latency: ~100-500ms typical                                        │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Subscription Lifecycle

```
┌────────────────────────────────────────────────────────────────────┐
│                  Subscription Lifecycle                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Establish Subscriptions:                                           │
│  • Extension initialization (onInstalled, onStartup)               │
│  • Coming back online after offline period                          │
│  • Auth token refresh                                               │
│  • Manual re-initialization                                         │
│                                                                     │
│  Cleanup Subscriptions:                                             │
│  • Going offline                                                    │
│  • User logout                                                      │
│  • Before re-establishing (prevent duplicates)                      │
│  • Extension unload                                                 │
│                                                                     │
│  Recovery:                                                          │
│  • pollFocusSession() checks and re-establishes if needed          │
│  • Network status change triggers re-setup                          │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8. Polling Subsystem

### Purpose

Polling serves as a backup mechanism when:
- Real-time events are missed due to network issues
- WebSocket connection drops temporarily
- Extension starts while app is in active session
- Subscriptions fail to establish

### Poll Function

```typescript
async function pollFocusSession(): Promise<void> {
  // 1. Check connectivity
  const wasOffline = !isOnline;
  isOnline = await checkConnectivity(getSupabaseUrl());

  // 2. If just came online, re-establish subscriptions
  if (wasOffline && isOnline) {
    await setupRealtimeSubscriptions();
  }

  // 3. Skip if offline
  if (!isOnline) return;

  // 4. Verify authentication
  const session = await getSession();
  if (!session) {
    currentFocusSession = null;
    await focusSessionCacheStore.clear();
    return;
  }

  // 5. Query for active session
  try {
    const focusSession = await queryFocusSession(session.user.id);

    // 6. Update state
    if (focusSession) {
      const hadNoSession = !currentFocusSession;

      currentFocusSession = {
        id: 'current',
        user_id: focusSession.user_id,
        phase: focusSession.phase,
        status: focusSession.status,
        phase_started_at: focusSession.phase_started_at,
        focus_duration: focusSession.focus_duration,
        break_duration: focusSession.break_duration,
        cached_at: new Date().toISOString(),
      };

      await focusSessionCacheStore.put(currentFocusSession);

      // 7. Refresh block lists if session just started
      if (hadNoSession) {
        await refreshBlockLists();
      }
    } else {
      // No active session
      currentFocusSession = null;
      await focusSessionCacheStore.clear();
    }
  } catch (error) {
    console.error('Poll error:', error);
    // Keep existing state on error
  }
}
```

### Poll Flow Diagram

```
         Alarm Fires (every 30s)
                  │
                  ▼
         pollFocusSession()
                  │
                  ▼
    ┌─────────────────────────┐
    │   checkConnectivity()   │
    └───────────┬─────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
  Online                  Offline
    │                       │
    ▼                       ▼
Was offline?              RETURN
    │                    (keep state)
    │ Yes
    ▼
setupRealtimeSubscriptions()
    │
    ▼
    ┌─────────────────────────┐
    │     getSession()        │
    └───────────┬─────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
Has session            No session
    │                       │
    ▼                       ▼
queryFocusSession()    Clear cache
    │                  RETURN
    ▼
    ┌─────────────────────────┐
    │    Has active session?  │
    └───────────┬─────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
   Yes                     No
    │                       │
    ▼                       ▼
Update state            Clear state
Cache session           Clear cache
    │
    ▼
Was first session?
    │ Yes
    ▼
refreshBlockLists()
```

### Block Lists Refresh

```typescript
async function refreshBlockLists(): Promise<void> {
  // 1. Verify prerequisites
  if (!isOnline) return;

  const session = await getSession();
  if (!session) return;

  try {
    // 2. Query block lists
    const blockLists = await queryBlockLists(session.user.id);

    // 3. Clear existing cache
    await blockListsCache.clear();

    // 4. Cache new block lists
    for (const list of blockLists) {
      await blockListsCache.put({
        id: list.id,
        user_id: list.user_id,
        name: list.name,
        active_days: list.active_days,
        is_enabled: list.is_enabled,
        order: list.order,
      });
    }

    // 5. Query blocked websites for all lists
    const listIds = blockLists.map(l => l.id);
    const websites = await queryBlockedWebsites(listIds);

    // 6. Clear and cache websites
    await blockedWebsitesCache.clear();
    for (const website of websites) {
      await blockedWebsitesCache.put({
        id: website.id,
        block_list_id: website.block_list_id,
        domain: website.domain,
      });
    }

    console.log(`Cached ${blockLists.length} block lists, ${websites.length} domains`);
  } catch (error) {
    console.error('Refresh block lists error:', error);
    // Keep existing cache on error
  }
}
```

---

## 9. Authentication

### Session Management

```typescript
export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await getSupabase().auth.getSession();
  return session;
}

export async function getUser(): Promise<User | null> {
  const { data: { user } } = await getSupabase().auth.getUser();
  return user;
}
```

### Login Flow

```typescript
async function login(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Initialize extension state after login
  await init();

  return { success: true, user: data.user };
}
```

### Logout Flow

```typescript
async function logout(): Promise<void> {
  // 1. Sign out from Supabase
  await getSupabase().auth.signOut();

  // 2. Cleanup subscriptions
  await cleanupSubscriptions();

  // 3. Clear all cached data
  await blockListsCache.clear();
  await blockedWebsitesCache.clear();
  await focusSessionCacheStore.clear();

  // 4. Reset in-memory state
  currentFocusSession = null;
}
```

### Token Refresh

Supabase client handles automatic token refresh. The extension storage adapter persists the refreshed token to `browser.storage.local`.

```
┌────────────────────────────────────────────────────────────────┐
│                    Token Refresh Flow                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Supabase Client                                                │
│       │                                                         │
│       │  Token expires in < 60 seconds                          │
│       ▼                                                         │
│  ┌─────────────────────┐                                        │
│  │ Auto-refresh token  │                                        │
│  └──────────┬──────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│  ┌─────────────────────┐                                        │
│  │ storage.setItem()   │                                        │
│  │ (storage adapter)   │                                        │
│  └──────────┬──────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│  ┌─────────────────────┐                                        │
│  │browser.storage.local│                                        │
│  │ .set({ key: token })│                                        │
│  └─────────────────────┘                                        │
│                                                                 │
│  On next poll/request:                                          │
│  • Updated token used automatically                             │
│  • Realtime auth updated via setAuth()                         │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 10. Network Detection

### File: `src/lib/network.ts`

### Passive Detection

```typescript
export function getNetworkStatus(): boolean {
  return navigator.onLine;
}
```

### Active Connectivity Check

```typescript
export async function checkConnectivity(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      mode: 'no-cors',
    });
    return true;
  } catch {
    return false;
  }
}
```

### Network Status Integration

```typescript
// Check Supabase specifically (not just general internet)
export function getSupabaseUrl(): string {
  return config.supabaseUrl;
}

// Usage in service worker
isOnline = await checkConnectivity(getSupabaseUrl());
```

### Online/Offline Transitions

```
┌────────────────────────────────────────────────────────────────┐
│                  Network State Transitions                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Online → Offline:                                              │
│  • isOnline = false                                             │
│  • Subscriptions become inactive                                │
│  • Blocking disabled (fail-safe)                                │
│  • Cached data preserved                                        │
│                                                                 │
│  Offline → Online:                                              │
│  • checkConnectivity() returns true                             │
│  • isOnline = true                                              │
│  • setupRealtimeSubscriptions() called                          │
│  • pollFocusSession() fetches fresh data                        │
│  • refreshBlockLists() updates cache                            │
│  • Blocking re-enabled if session active                        │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 11. Message Passing

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `CHECK_UPDATE` | Popup → Background | Check for extension updates |
| `BLOCK_LIST_UPDATED` | Popup → Background | Trigger block list refresh |
| `FOCUS_SESSION_UPDATED` | Popup → Background | Trigger session poll |
| `GET_STATUS` | Popup → Background | Get current blocking status |

### Handler Implementation

```typescript
browser.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    switch (message.type) {
      case 'CHECK_UPDATE':
        sendResponse({ updateAvailable: false });
        break;

      case 'BLOCK_LIST_UPDATED':
        refreshBlockLists();
        sendResponse({ success: true });
        break;

      case 'FOCUS_SESSION_UPDATED':
        pollFocusSession();
        sendResponse({ success: true });
        break;

      case 'GET_STATUS':
        sendResponse({
          isOnline,
          focusActive: currentFocusSession?.status === 'running' &&
                       currentFocusSession?.phase === 'focus',
          session: currentFocusSession,
        });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }

    return true; // Keep channel open for async response
  }
);
```

### Message Flow

```
┌─────────────┐                              ┌─────────────┐
│   Popup     │                              │   Service   │
│   Script    │                              │   Worker    │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  browser.runtime.sendMessage({            │
       │    type: 'GET_STATUS'                     │
       │  })                                        │
       ├───────────────────────────────────────────▶│
       │                                            │
       │                                   Process request
       │                                            │
       │  sendResponse({                           │
       │    isOnline: true,                        │
       │    focusActive: true,                     │
       │    session: {...}                         │
       │  })                                        │
       │◀───────────────────────────────────────────┤
       │                                            │
    Update UI                                       │
       │                                            │
```

---

## 12. Build System

### File: `build.js`

Node.js build script using esbuild.

### Build Targets

| Target | Manifest Source | Output Directory |
|--------|----------------|------------------|
| `firefox` | `manifests/firefox.json` | `dist-firefox/` |
| `chrome` | `manifests/chrome.json` | `dist-chrome/` |

### Build Process

```
1. Clean output directory
        │
        ▼
2. Copy manifest.json
   • manifests/{browser}.json → dist-{browser}/manifest.json
        │
        ▼
3. Bundle TypeScript with esbuild
   • src/background/service-worker.ts → background/service-worker.js
   • src/popup/popup.ts → popup/popup.js
   • src/pages/blocked.ts → pages/blocked.js
        │
        ▼
4. Copy static assets
   • src/popup/popup.html → popup/popup.html
   • src/popup/popup.css → popup/popup.css
   • src/pages/blocked.html → pages/blocked.html
   • src/pages/blocked.css → pages/blocked.css
   • icons/* → icons/
```

### esbuild Configuration

```javascript
await esbuild.build({
  entryPoints: [
    'src/background/service-worker.ts',
    'src/popup/popup.ts',
    'src/pages/blocked.ts',
  ],
  bundle: true,
  outdir: `dist-${browser}`,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  external: [],
});
```

### Manifest Differences

**Firefox (`manifests/firefox.json`):**

```json
{
  "manifest_version": 3,
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
  "manifest_version": 3,
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  }
}
```

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build for all browsers |
| `npm run build:firefox` | Build Firefox only |
| `npm run build:chrome` | Build Chrome only |
| `npm run clean` | Remove dist directories |
| `npm run typecheck` | TypeScript type checking |

---

## 13. Failure Modes

### Network Failures

| Failure | Detection | Behavior | Recovery |
|---------|-----------|----------|----------|
| Total offline | `checkConnectivity()` returns false | Allow all navigation | Poll re-checks every 30s |
| Supabase unreachable | Active check fails | Allow all navigation | Poll re-checks every 30s |
| WebSocket disconnects | Channel goes inactive | Events missed | Poll catches state changes |
| Slow network | Requests timeout | Cached state used | Retry on next poll |

### Authentication Failures

| Failure | Detection | Behavior | Recovery |
|---------|-----------|----------|----------|
| Token expired | 401 response | Clear session state | User re-authenticates |
| Invalid credentials | Auth error | Show error to user | User retries |
| Session missing | `getSession()` returns null | Allow all navigation | User logs in |

### Data Failures

| Failure | Detection | Behavior | Recovery |
|---------|-----------|----------|----------|
| IndexedDB unavailable | Operation throws | Use in-memory only | Refresh on restart |
| Corrupt cache | Parse error | Clear and refetch | Automatic |
| Query returns empty | No data | Clear cache | Normal behavior |
| Query fails | Exception | Keep existing cache | Retry on next poll |

### Blocking Failures

| Failure | Detection | Behavior | Recovery |
|---------|-----------|----------|----------|
| Navigation already complete | Tab update fails | Page loads normally | User can navigate back |
| Invalid URL | URL parse throws | Allow navigation | Normal |
| Extension URL blocked | Protocol check | Skip blocking | By design |

### Failure Recovery Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    Failure Recovery                             │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Any failure during blocking decision:                          │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────┐                                        │
│  │ ALLOW NAVIGATION    │◀── Fail-safe default                  │
│  │ (never block on     │                                        │
│  │  uncertainty)       │                                        │
│  └─────────────────────┘                                        │
│                                                                 │
│  Any failure during sync:                                       │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────┐                                        │
│  │ KEEP EXISTING STATE │◀── Preserve known-good state          │
│  │ (use cached data)   │                                        │
│  └─────────────────────┘                                        │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────┐                                        │
│  │ RETRY NEXT POLL     │◀── 30 second interval                 │
│  │ (auto-recovery)     │                                        │
│  └─────────────────────┘                                        │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## File Reference

```
stellar-focus/
├── manifests/
│   ├── firefox.json              # Firefox manifest (MV3)
│   └── chrome.json               # Chrome manifest (MV3)
├── icons/
│   ├── icon-48.png               # Toolbar icon
│   └── icon-128.png              # Store listing icon
├── src/
│   ├── config.ts                 # Config loader
│   ├── config.local.ts           # Local secrets (gitignored)
│   ├── config.local.example.ts   # Config template
│   ├── background/
│   │   └── service-worker.ts     # Background script
│   │       ├── Global state
│   │       ├── init()
│   │       ├── setupAlarm()
│   │       ├── pollFocusSession()
│   │       ├── refreshBlockLists()
│   │       ├── setupRealtimeSubscriptions()
│   │       ├── cleanupSubscriptions()
│   │       ├── isDomainBlocked()
│   │       ├── matchesDomain()
│   │       └── webNavigation.onBeforeNavigate listener
│   ├── popup/
│   │   ├── popup.html            # Popup markup
│   │   ├── popup.ts              # Popup logic
│   │   └── popup.css             # Popup styles
│   ├── pages/
│   │   ├── blocked.html          # Blocked page markup
│   │   ├── blocked.ts            # Blocked page logic
│   │   └── blocked.css           # Blocked page styles
│   ├── lib/
│   │   ├── storage.ts            # IndexedDB layer
│   │   │   ├── Database setup
│   │   │   ├── blockListsCache
│   │   │   ├── blockedWebsitesCache
│   │   │   └── focusSessionCacheStore
│   │   └── network.ts            # Network utilities
│   │       ├── getNetworkStatus()
│   │       ├── checkConnectivity()
│   │       └── getSupabaseUrl()
│   └── auth/
│       └── supabase.ts           # Supabase client
│           ├── extensionStorageAdapter
│           ├── getSupabase()
│           ├── getSession()
│           └── getUser()
├── build.js                      # esbuild script
├── package.json
├── tsconfig.json
├── dist-firefox/                 # Firefox build output
└── dist-chrome/                  # Chrome build output
```

---

## Communication Diagram

```
┌────────────────────┐         ┌────────────────────┐         ┌────────────────────┐
│    Stellar App     │         │      Supabase      │         │     Extension      │
└─────────┬──────────┘         └─────────┬──────────┘         └─────────┬──────────┘
          │                              │                              │
          │  Start focus session         │                              │
          ├─────────────────────────────▶│                              │
          │                              │                              │
          │                              │  postgres_changes (INSERT)   │
          │                              ├─────────────────────────────▶│
          │                              │                              │
          │                              │         pollFocusSession()   │
          │                              │◀─────────────────────────────┤
          │                              │                              │
          │                              │  Return focus_sessions row   │
          │                              ├─────────────────────────────▶│
          │                              │                              │
          │                              │      currentFocusSession = { │
          │                              │        status: 'running',    │
          │                              │        phase: 'focus'        │
          │                              │      }                       │
          │                              │                              │
          │                              │  User navigates to           │
          │                              │  youtube.com                 │
          │                              │                              │
          │                              │      isDomainBlocked()       │
          │                              │      → true                  │
          │                              │                              │
          │                              │      tabs.update()           │
          │                              │      → blocked.html          │
          │                              │                              │
          │  Add domain to block list    │                              │
          ├─────────────────────────────▶│                              │
          │                              │                              │
          │                              │  postgres_changes (INSERT)   │
          │                              ├─────────────────────────────▶│
          │                              │                              │
          │                              │       refreshBlockLists()    │
          │                              │◀─────────────────────────────┤
          │                              │                              │
          │                              │  Return block_lists +        │
          │                              │  blocked_websites            │
          │                              ├─────────────────────────────▶│
          │                              │                              │
          │                              │      Update IndexedDB cache  │
          │                              │                              │
```
