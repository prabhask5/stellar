# Stellar Focus Extension -- System Architecture

```
 _____ _____ _____ __    __    _____ _____    _____ _____ _____ _____ _____
|   __|_   _|   __|  |  |  |  |  _  | __  |  |   __|     |     |  |  |   __|
|__   | | | |   __|  |__|  |__|     |    -|  |   __|  |  |   --|  |  |__   |
|_____| |_| |_____|_____|_____|__|__|__|__|  |__|  |_____|_____|_____|_____|
```

Stellar Focus is a browser extension that blocks distracting websites during
Pomodoro focus sessions managed by the Stellar PWA. It integrates via Supabase
Realtime for instant state synchronization. There is no direct communication
between the extension and the main app -- they share a Supabase backend.

---

## Table of Contents

1.  [System Overview](#1-system-overview)
2.  [Design Principles](#2-design-principles)
3.  [Blocking Decision Engine](#3-blocking-decision-engine)
4.  [Dual-Channel Synchronization](#4-dual-channel-synchronization)
5.  [Network State Machine](#5-network-state-machine)
6.  [Local Cache Layer](#6-local-cache-layer)
7.  [Extension Storage Adapter](#7-extension-storage-adapter)
8.  [Popup Communication Protocol](#8-popup-communication-protocol)
9.  [Egress Optimizations](#9-egress-optimizations)
10. [Failure Modes and Recovery](#10-failure-modes-and-recovery)
11. [Communication Flow](#11-communication-flow)

---

## 1. System Overview

```
+===========================================================================+
|                        STELLAR FOCUS EXTENSION                            |
|                                                                           |
|  +---------------------------+      +-------------------------------+     |
|  |     Service Worker        |      |        Popup (UI)             |     |
|  |     (background)          |      |                               |     |
|  |                           |      |  - PIN gate / Unlock          |     |
|  |  +---------------------+ |      |  - Focus status display       |     |
|  |  | Blocking Engine     | | msg  |  - Block list viewer          |     |
|  |  |                     |<-------+  - Focus time today            |     |
|  |  | webNavigation       | |      |  - Sync status indicator      |     |
|  |  | .onBeforeNavigate   | |      +-------------------------------+     |
|  |  +--------+------------+ |                                             |
|  |           |              |      +-------------------------------+     |
|  |           v              |      |      Blocked Page             |     |
|  |  +---------------------+ |      |      (pages/blocked.html)     |     |
|  |  | Redirect Handler    | |      |                               |     |
|  |  | tabs.update(url)    +------->|  - Galaxy animation           |     |
|  |  +---------------------+ |      |  - Motivational message       |     |
|  |           ^              |      |  - Return to Stellar link     |     |
|  |           |              |      +-------------------------------+     |
|  |  +---------------------+ |                                             |
|  |  | IndexedDB Cache     | |      +-------------------------------+     |
|  |  |                     | |      |      Options Page             |     |
|  |  | - blockLists        | |      |      (options/options.html)   |     |
|  |  | - blockedWebsites   | |      |                               |     |
|  |  | - focusSessionCache | |      |  - Supabase URL               |     |
|  |  +---------------------+ |      |  - Anon Key                   |     |
|  |           ^              |      |  - App URL                    |     |
|  |           |              |      |  - Debug mode toggle          |     |
|  +-----------|--------------|      +-------------------------------+     |
|              |              |                                             |
+==============|==============|=============================================+
               |              |
               |   WebSocket  |  REST API
               |   (Realtime) |  (PostgREST)
               |              |
+==============|==============|=============================================+
|              v              v         SUPABASE                            |
|                                                                           |
|  +---------------------------+    +----------------------------+          |
|  |   Realtime WebSocket      |    |   PostgREST API            |          |
|  |                           |    |                            |          |
|  |   postgres_changes on:    |    |   GET /focus_sessions      |          |
|  |   - focus_sessions        |    |   GET /block_lists         |          |
|  |   - block_lists           |    |   GET /blocked_websites    |          |
|  |   - blocked_websites      |    |                            |          |
|  +---------------------------+    +----------------------------+          |
|                                                                           |
|  +----------------------------------------------------------------+      |
|  |                    PostgreSQL Database                          |      |
|  |                                                                |      |
|  |   focus_sessions          block_lists        blocked_websites  |      |
|  |   +-----------------+    +---------------+   +---------------+ |      |
|  |   | id              |    | id            |   | id            | |      |
|  |   | user_id         |    | user_id       |   | block_list_id | |      |
|  |   | phase           |    | name          |   | domain        | |      |
|  |   | status          |    | active_days   |   | deleted       | |      |
|  |   | phase_started_at|    | is_enabled    |   +---------------+ |      |
|  |   | focus_duration  |    | order         |                     |      |
|  |   | break_duration  |    | deleted       |                     |      |
|  |   | ended_at        |    +---------------+                     |      |
|  |   | started_at      |                                          |      |
|  |   | elapsed_duration|                                          |      |
|  |   +-----------------+                                          |      |
|  +----------------------------------------------------------------+      |
|                                                                           |
|  +----------------------------------------------------------------+      |
|  |   Auth (GoTrue)                                                |      |
|  |   - Anonymous sign-in (signInAnonymously)                      |      |
|  |   - JWT access tokens                                          |      |
|  |   - Session persistence via browser.storage.local adapter      |      |
|  +----------------------------------------------------------------+      |
|                                                                           |
|  +----------------------------------------------------------------+      |
|  |   single_user_config                                           |      |
|  |   +-------------------+                                        |      |
|  |   | pin_hash (text)   |  SHA-256 hash of the user's PIN       |      |
|  |   | updated_at        |  Timestamp of last config update       |      |
|  |   +-------------------+                                        |      |
|  +----------------------------------------------------------------+      |
|                                                                           |
+===========================================================================+
```

### Key Architectural Property

The Stellar PWA and the Stellar Focus Extension never communicate directly.
Both read from and write to the same Supabase backend. The extension is a
read-only consumer: it observes session and block list state, then enforces
blocking rules locally.

```
+------------------+            +------------------+            +------------------+
|                  |   writes   |                  |   reads    |                  |
|   Stellar PWA    +----------->|    Supabase      +<-----------+  Stellar Focus   |
|   (main app)     |            |    (backend)     |            |  Extension       |
|                  |            |                  |            |                  |
+------------------+            +------------------+            +------------------+
```

---

## 2. Design Principles

```
+----+------------------------+----------------------------------------------------+
| #  | Principle              | Description                                        |
+----+------------------------+----------------------------------------------------+
| 1  | Fail-Safe Offline      | Allow ALL navigation when offline or uncertain.     |
|    |                        | The extension must never block a page it cannot     |
|    |                        | confirm should be blocked. When in doubt, allow.    |
+----+------------------------+----------------------------------------------------+
| 2  | Online-First Blocking  | Only block when connectivity is verified AND an     |
|    |                        | active focus session is confirmed from Supabase.    |
|    |                        | No cached-only blocking -- stale state must not     |
|    |                        | trap users on a blocked page after a session ends.  |
+----+------------------------+----------------------------------------------------+
| 3  | Real-Time Primary      | WebSocket subscriptions via Supabase Realtime are   |
|    |                        | the primary synchronization mechanism. Latency is   |
|    |                        | typically ~100-500ms from database write to          |
|    |                        | extension state update.                             |
+----+------------------------+----------------------------------------------------+
| 4  | Polling Backup         | Two staggered 1-minute alarms (Firefox MV3 minimum) |
|    |                        | ensure ~30-second wake-ups. Throttled to a 25s      |
|    |                        | minimum interval to prevent excessive polling.       |
|    |                        | Guarantees eventual consistency if WebSocket drops.  |
+----+------------------------+----------------------------------------------------+
| 5  | Local Cache            | IndexedDB persists block lists, blocked websites,   |
|    |                        | and focus session state across service worker        |
|    |                        | restarts (especially important for Firefox event     |
|    |                        | page lifecycle).                                     |
+----+------------------------+----------------------------------------------------+
| 6  | Main Frame Only        | Only main frame navigations (frameId === 0) are     |
|    |                        | evaluated for blocking. Iframes, subresources, and  |
|    |                        | background requests are never intercepted.           |
+----+------------------------+----------------------------------------------------+
```

---

## 3. Blocking Decision Engine

### Decision Flowchart

Every navigation event passes through the following fail-safe guard chain. Each
"No" immediately defaults to ALLOW, ensuring the extension never blocks
erroneously.

```
webNavigation.onBeforeNavigate(details)
              |
              v
   +---------------------+
   | Is main frame?      |    No
   | (frameId === 0)     +---------> ALLOW
   +----------+----------+
              | Yes
              v
   +---------------------+
   | Is internal URL?    |    Yes
   | (moz-extension://,  +---------> ALLOW
   |  about:, empty)     |
   +----------+----------+
              | No
              v
   +---------------------+
   | Is online?          |    No
   | (isOnline flag)     +---------> ALLOW
   +----------+----------+
              | Yes
              v
   +---------------------+
   | Active session?     |    No
   | (status==='running')+---------> ALLOW
   +----------+----------+
              | Yes
              v
   +---------------------+
   | Focus phase?        |    No
   | (phase==='focus')   +---------> ALLOW (breaks are unblocked)
   +----------+----------+
              | Yes
              v
   +---------------------+
   | Domain in active    |    No
   | block list?         +---------> ALLOW
   | (isDomainBlocked)   |
   +----------+----------+
              | Yes
              v
   +---------------------+
   | REDIRECT            |
   | to blocked.html     |
   | ?url=...&domain=... |
   +---------------------+
```

### Domain Matching

The `isDomainBlocked()` function normalizes hostnames by lowercasing and
stripping the `www.` prefix, then checks against cached blocked websites.

```
+----------------------------+------------------+---------+
| Blocked Domain             | Navigation URL   | Result  |
+----------------------------+------------------+---------+
| youtube.com                | youtube.com      | BLOCKED |
| youtube.com                | www.youtube.com  | BLOCKED |
| youtube.com                | m.youtube.com    | BLOCKED |
| youtube.com                | music.youtube.com| BLOCKED |
| youtube.com                | youtubemusic.com | ALLOW   |
| youtube.com                | notyoutube.com   | ALLOW   |
| mail.google.com            | mail.google.com  | BLOCKED |
| mail.google.com            | google.com       | ALLOW   |
+----------------------------+------------------+---------+
```

**Matching rules:**

1. **Exact match** -- `normalizedHostname === blockedDomain`
2. **Subdomain match** -- `normalizedHostname.endsWith('.' + blockedDomain)`
3. Everything else is allowed (no partial string matching).

### Day-Based Scheduling

Each block list has an `active_days` field:

```
active_days: null              -->  Active EVERY day (null = all days)
active_days: [1, 2, 3, 4, 5]  -->  Active Monday through Friday only
active_days: [0, 6]           -->  Active Saturday and Sunday only
```

Day numbers follow JavaScript's `Date.getDay()` convention:

```
0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday,
4 = Thursday, 5 = Friday, 6 = Saturday
```

At navigation time, the current day is checked against each block list's
`active_days`. If the list is not active today, all its websites are skipped.

---

## 4. Dual-Channel Synchronization

### Architecture Overview

```
+===========================================================================+
|                    SYNCHRONIZATION CHANNELS                               |
|                                                                           |
|   PRIMARY: Realtime WebSocket          BACKUP: Polling Alarms             |
|   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~         ~~~~~~~~~~~~~~~~~~~~~~~~           |
|   Latency: ~100-500ms                  Interval: ~30s effective           |
|   Direction: Push (server->client)     Direction: Pull (client->server)   |
|   Payload: postgres_changes event      Payload: Full query response       |
|                                                                           |
|   HEALTHY  --> Polling is throttled    UNHEALTHY --> Polling takes over   |
|                (25s min interval)                    + reconnect attempts  |
|                                                                           |
+===========================================================================+
```

### Real-Time Channel (Primary)

A single consolidated Supabase Realtime channel carries three subscriptions:

```
supabase.channel(`stellar-ext-${userId}-${timestamp}`)

    +-- .on('postgres_changes', { table: 'focus_sessions',   filter: user_id=eq.X })
    |
    +-- .on('postgres_changes', { table: 'block_lists',      filter: user_id=eq.X })
    |
    +-- .on('postgres_changes', { table: 'blocked_websites'  /* no user filter */  })
    |
    +-- .subscribe(status => ...)
```

**Why one channel instead of three?**
Supabase Realtime multiplexes subscriptions within a single WebSocket
connection, but each `.channel()` call creates a separate Phoenix channel
join. A single channel with three `.on()` handlers reduces join overhead and
simplifies lifecycle management.

**Why no `user_id` filter on `blocked_websites`?**
The `blocked_websites` table links through `block_list_id`, not directly
through `user_id`. Row-Level Security (RLS) policies filter at the server
level. The handler additionally validates that the `block_list_id` belongs to
the user's cached block lists before processing.

**Egress optimization: payload-direct processing.**
When a realtime event arrives, the handler uses `payload.new` directly to
update the IndexedDB cache, rather than re-fetching the row from the REST API.
This eliminates one round-trip per event.

### Polling Backup (Secondary)

Two staggered browser alarms provide backup synchronization:

```
          0s         30s        60s        90s       120s
  ========|===========|==========|==========|==========|========
          ^                      ^                     ^
     ALARM_PRIMARY          ALARM_PRIMARY         ALARM_PRIMARY
     (periodInMinutes: 1)                         (fires again)
                     ^                      ^
                ALARM_SECONDARY        ALARM_SECONDARY
                (delayInMinutes: 0.5,
                 periodInMinutes: 1)
```

Firefox MV3 enforces a **1-minute minimum** for alarm periods. By creating
two alarms offset by 30 seconds, the extension achieves ~30-second wake-ups.

**On each alarm wake (`handleAlarmWake`):**

```
  1. Is realtime unhealthy?
     +-- Yes --> Attempt setupRealtimeSubscriptions()
     +-- No  --> Skip reconnect

  2. Always: pollFocusSessionThrottled()
     +-- Check: Has 25 seconds elapsed since last poll?
         +-- No  --> Skip (rate limited)
         +-- Yes --> Execute pollFocusSession()
             |
             +-- checkConnectivity(supabaseUrl)  // HEAD request
             +-- getSession()                     // Auth check
             +-- Query focus_sessions (ended_at IS NULL)
             +-- Update IndexedDB cache
             +-- Refresh block lists if session just started
```

### State Flow Sequence

```
  Stellar App             Supabase                    Extension
  (PWA)                   (Backend)                   (Service Worker)
       |                       |                            |
       |  INSERT/UPDATE        |                            |
       |  focus_sessions       |                            |
       +---------------------->|                            |
       |                       |                            |
       |                       |  postgres_changes          |
       |                       |  (WebSocket push)          |
       |                       +--------------------------->|
       |                       |                            |
       |                       |                  +---------+---------+
       |                       |                  | Update in-memory  |
       |                       |                  | currentFocusSession|
       |                       |                  | Write to IndexedDB |
       |                       |                  | Notify popup      |
       |                       |                  +---------+---------+
       |                       |                            |
       |                       |  (If realtime missed)      |
       |                       |                            |
       |                       |  SELECT focus_sessions     |
       |                       |<---------------------------+
       |                       |                            |
       |                       |  { data: [...] }           |
       |                       +--------------------------->|
       |                       |                            |
```

### Realtime Health Tracking

```
realtimeHealthy: boolean

  .subscribe(status) callback:
  +---------------------------------------------------+
  | Status         | Action                           |
  +----------------+----------------------------------+
  | SUBSCRIBED     | realtimeHealthy = true           |
  |                | Log: "Realtime healthy"          |
  +----------------+----------------------------------+
  | CHANNEL_ERROR  | realtimeHealthy = false          |
  | TIMED_OUT      | Schedule reconnect (3s delay)    |
  | CLOSED         | + Trigger throttled poll          |
  +----------------+----------------------------------+
```

The 3-second delay on reconnection prevents tight reconnect loops when the
server is temporarily unavailable. On the next alarm wake, if
`realtimeHealthy` is still false, another reconnection attempt is made.

---

## 5. Network State Machine

```
                    +==================+
                    |                  |
           +------->     ONLINE       +--------+
           |        |                  |        |
           |        | - Blocking ON    |        |  navigator.onLine = false
           |        | - WebSocket ON   |        |  OR checkConnectivity fails
           |        | - Polling ON     |        |
           |        +==================+        |
           |                                    |
           |                                    v
           |        +==================+
           |        |                  |
           +--------+    OFFLINE       |
                    |                  |
    checkConnectivity| - Blocking OFF   |
    succeeds (HEAD  | - WebSocket OFF  |
    to Supabase     | - Cache PRESERVED|
    /rest/v1/)      | - Alarms ACTIVE  |
                    |   (still fire,   |
                    |    skip work)    |
                    +==================+
```

### Online --> Offline Transition

```
  1. isOnline = false
  2. Blocking is disabled (guard: if (!isOnline) return)
  3. WebSocket subscriptions are cleaned up (cleanupRealtimeSubscriptions)
  4. IndexedDB cache is PRESERVED (not cleared)
  5. Alarms continue to fire but pollFocusSession() short-circuits
```

### Offline --> Online Transition

```
  1. Alarm fires -> pollFocusSession()
  2. checkConnectivity(supabaseUrl)   // HEAD request to /rest/v1/
     +-- Succeeds: isOnline = true
  3. Detect wasOnline=false, isOnline=true
  4. setupRealtimeSubscriptions()     // Re-establish WebSocket
  5. getSession()                     // Verify auth still valid
  6. Query focus_sessions             // Fresh state from server
  7. refreshBlockLists()              // Refresh cached block lists
  8. Update IndexedDB cache
  9. Blocking is re-enabled
```

**Connectivity check method:**

```typescript
fetch(`${supabaseUrl}/rest/v1/`, {
  method: 'HEAD',
  mode: 'no-cors'
});
```

This is preferred over `navigator.onLine` because the browser's online flag
can report false positives (connected to a network but no internet access).

---

## 6. Local Cache Layer

### IndexedDB Database: `stellar-focus-extension` (version 1)

```
+===========================================================================+
|                          IndexedDB Stores                                 |
|                                                                           |
|  +---------------------------+                                            |
|  | Store: blockLists         |  keyPath: 'id'                            |
|  |                           |  Index: user_id (non-unique)              |
|  |  Fields:                  |                                            |
|  |  - id: string             |  Block list UUID                          |
|  |  - user_id: string        |  Owner user UUID                          |
|  |  - name: string           |  Display name                             |
|  |  - active_days: number[]  |  [0-6] or null (all days)                |
|  |  - is_enabled: boolean    |  Always true in cache (filtered on fetch) |
|  |  - order: number          |  Sort order                               |
|  +---------------------------+                                            |
|                                                                           |
|  +---------------------------+                                            |
|  | Store: blockedWebsites    |  keyPath: 'id'                            |
|  |                           |  Index: block_list_id (non-unique)        |
|  |  Fields:                  |                                            |
|  |  - id: string             |  Website UUID                             |
|  |  - block_list_id: string  |  Parent block list UUID                   |
|  |  - domain: string         |  e.g. "youtube.com"                       |
|  +---------------------------+                                            |
|                                                                           |
|  +---------------------------+                                            |
|  | Store: focusSessionCache  |  keyPath: 'id'                            |
|  |                           |  (no secondary indexes)                   |
|  |  Fields:                  |                                            |
|  |  - id: string             |  Always 'current' (singleton)             |
|  |  - user_id: string        |  Owner user UUID                          |
|  |  - phase: string          |  'focus' | 'break' | 'idle'              |
|  |  - status: string         |  'running' | 'paused' | 'stopped'        |
|  |  - phase_started_at: str  |  ISO 8601 timestamp                       |
|  |  - focus_duration: number |  Minutes                                  |
|  |  - break_duration: number |  Minutes                                  |
|  |  - cached_at: string      |  ISO 8601 timestamp of last cache write   |
|  +---------------------------+                                            |
|                                                                           |
+===========================================================================+
```

### Cache Lifecycle

```
  POPULATE (write to cache)
  +---------------------------------------------------------+
  | Trigger                    | What is cached             |
  +----------------------------+----------------------------+
  | init()                     | Focus session + block lists|
  | pollFocusSession()         | Focus session              |
  | refreshBlockLists()        | Block lists + websites     |
  | Realtime: focus_sessions   | Focus session (from payload)|
  | Realtime: block_lists      | Single block list record   |
  | Realtime: blocked_websites | Single website record      |
  +----------------------------+----------------------------+

  CLEAR (remove from cache)
  +---------------------------------------------------------+
  | Trigger                    | What is cleared            |
  +----------------------------+----------------------------+
  | Logout (no session)        | focusSessionCache          |
  | No active session found    | focusSessionCache          |
  | Session ended (ended_at)   | focusSessionCache          |
  | refreshBlockLists() start  | blockLists, blockedWebsites|
  |   (then immediately        |   (clear-then-repopulate)  |
  |    repopulated)            |                            |
  | Block list deleted/disabled| Individual record removed  |
  +----------------------------+----------------------------+

  PRESERVE (keep existing cache)
  +---------------------------------------------------------+
  | Trigger                    | Behavior                   |
  +----------------------------+----------------------------+
  | Query failure / error      | Cache untouched, log error |
  | Offline state              | Cache untouched            |
  | Service worker restart     | IndexedDB persists         |
  +----------------------------+----------------------------+
```

---

## 7. Extension Storage Adapter

Service workers cannot access `localStorage` or `sessionStorage`. Supabase
Auth requires a storage adapter for session persistence. The extension bridges
this gap with a custom adapter that maps to `browser.storage.local`.

```
+===========================================================================+
|                                                                           |
|   Supabase Client                                                         |
|   (createClient)                                                          |
|        |                                                                  |
|        |  auth.storage = { getItem, setItem, removeItem }                 |
|        v                                                                  |
|   +-------------------------------+                                       |
|   |  Extension Storage Adapter    |                                       |
|   |                               |                                       |
|   |  getItem(key):                |                                       |
|   |    browser.storage.local      |                                       |
|   |      .get(key)                |                                       |
|   |      -> result[key] || null   |                                       |
|   |                               |                                       |
|   |  setItem(key, value):         |                                       |
|   |    browser.storage.local      |                                       |
|   |      .set({ [key]: value })   |                                       |
|   |                               |                                       |
|   |  removeItem(key):             |                                       |
|   |    browser.storage.local      |                                       |
|   |      .remove(key)             |                                       |
|   +---------------+---------------+                                       |
|                   |                                                       |
|                   v                                                       |
|   +-------------------------------+                                       |
|   |  browser.storage.local        |                                       |
|   |                               |                                       |
|   |  Persists across:             |                                       |
|   |  - Service worker restarts    |                                       |
|   |  - Browser restarts           |                                       |
|   |  - Event page suspension      |                                       |
|   |    (Firefox MV3)              |                                       |
|   |                               |                                       |
|   |  Also stores:                 |                                       |
|   |  - stellar_config             |                                       |
|   |  - stellar_debug_mode         |                                       |
|   |  - stellar_pin_config         |  (cached PIN hash from Supabase)      |
|   +-------------------------------+                                       |
|                                                                           |
+===========================================================================+
```

Both the service worker and the popup create their own Supabase client
instances, each with the same storage adapter pattern. Because they both read
from `browser.storage.local`, they share the same anonymous auth session.

### Authentication Flow (PIN-Based)

The extension uses anonymous Supabase authentication rather than
email/password login. The full auth and PIN gate flow is:

```
  Extension startup (service worker init)
            |
            v
  +---------------------+
  | signInAnonymously() |  Creates anonymous Supabase session
  +----------+----------+  (or resumes existing from storage)
             |
             v
  +---------------------+
  | Fetch PIN config    |  SELECT pin_hash FROM single_user_config
  | from Supabase       |  Cache result in browser.storage.local
  +----------+----------+  (key: stellar_pin_config)
             |
             v
  +---------------------+
  | Extension locked    |  Service worker in LOCKED state
  | (awaiting PIN)      |  Blocking engine active regardless
  +----------+----------+
             |
             |  User opens popup, enters PIN
             v
  +---------------------+
  | SHA-256 hash of     |  All verification is local:
  | entered PIN         |  hash(input) === cached pin_hash
  +----------+----------+
             |
        +----+----+
        |         |
     Match     No match
        |         |
        v         v
  +-----------+  +------------+
  | Send      |  | Show error |
  | UNLOCKED  |  | message    |
  | to SW     |  +------------+
  +-----------+
        |
        v
  +---------------------+
  | Extension unlocked  |  Full popup UI accessible
  | Normal operation    |  PIN config re-checked periodically
  +---------------------+
```

**Offline behavior:** If the PIN config is already cached in
`browser.storage.local`, PIN verification works fully offline. If the
config has never been cached (e.g., fresh install), the extension
requires an online connection to fetch it from `single_user_config`.

---

## 8. Popup Communication Protocol

The popup communicates with the service worker exclusively through
`browser.runtime.sendMessage` / `browser.runtime.onMessage`. The popup never
queries Supabase directly for data (egress optimization) -- it relies on the
service worker's cache.

```
+========================+                     +========================+
|       POPUP            |                     |    SERVICE WORKER      |
|                        |                     |                        |
|   Request Messages     |                     |   Response / Action    |
|   (popup -> SW)        |                     |                        |
|                        |                     |                        |
|  GET_FOCUS_STATUS  ----|-------------------->|  Returns:              |
|                        |                     |  { isOnline,           |
|                        |                     |    realtimeHealthy,    |
|                        |                     |    focusSession }      |
|                        |                     |                        |
|  GET_BLOCK_LISTS   ----|-------------------->|  Returns:              |
|                        |   (async response)  |  { lists }             |
|                        |                     |  (from IndexedDB)      |
|                        |                     |                        |
|  GET_FOCUS_TIME    ----|-------------------->|  Returns:              |
|  _TODAY                |   (async response)  |  { totalMs,            |
|                        |                     |    hasRunningSession } |
|                        |                     |                        |
|  CHECK_REALTIME    ----|-------------------->|  Action:               |
|                        |                     |  If unhealthy:         |
|                        |                     |    reconnect + poll    |
|                        |                     |                        |
|  CONFIG_UPDATED    ----|-------------------->|  Action:               |
|                        |                     |  resetSupabase()       |
|                        |                     |  cleanup + re-init     |
|                        |                     |                        |
|  BLOCK_LIST_UPDATED----|-------------------->|  Action:               |
|                        |                     |  refreshBlockLists()   |
|                        |                     |                        |
|  UNLOCKED          ----|-------------------->|  Action:               |
|                        |                     |  Mark PIN gate as      |
|                        |                     |  unlocked; allow       |
|                        |                     |  normal operation      |
|                        |                     |                        |
|  LOCKED            ----|-------------------->|  Action:               |
|                        |                     |  Mark PIN gate as      |
|                        |                     |  locked; require PIN   |
|                        |                     |  entry before use      |
|                        |                     |                        |
+========================+                     +========================+

+========================+                     +========================+
|       POPUP            |                     |    SERVICE WORKER      |
|                        |                     |                        |
|   Notification Messages|                     |   Push Notifications   |
|   (SW -> popup)        |                     |   (SW -> popup)        |
|                        |                     |                        |
|  FOCUS_STATUS      ----|<--------------------|  Sent when:            |
|  _CHANGED              |                     |  Realtime update to    |
|                        |                     |  focus_sessions        |
|                        |                     |                        |
|  BLOCK_LISTS       ----|<--------------------|  Sent when:            |
|  _CHANGED              |                     |  Realtime update to    |
|                        |                     |  block_lists           |
|                        |                     |                        |
+========================+                     +========================+
```

### Message Flow Summary

```
+---------------------------+-----------+----------------------------------+
| Message Type              | Direction | Purpose                          |
+---------------------------+-----------+----------------------------------+
| GET_FOCUS_STATUS          | P -> SW   | Get session state from SW cache  |
| GET_BLOCK_LISTS           | P -> SW   | Get block lists from IndexedDB   |
| GET_FOCUS_TIME_TODAY      | P -> SW   | Get today's focus time (queried) |
| CHECK_REALTIME            | P -> SW   | Health check, reconnect if needed|
| CONFIG_UPDATED            | P -> SW   | Re-initialize after config save  |
| BLOCK_LIST_UPDATED        | P -> SW   | Force refresh block lists cache  |
| CHECK_UPDATE              | P -> SW   | Check for extension updates      |
| GET_STATUS                | P -> SW   | Legacy: simple online/active     |
| FOCUS_SESSION_UPDATED     | P -> SW   | Force refresh session (throttled)|
| UNLOCKED                  | P -> SW   | PIN verified; unlock extension   |
| LOCKED                    | P -> SW   | Lock extension; require PIN      |
| FOCUS_STATUS_CHANGED      | SW -> P   | Notify popup of session change   |
| BLOCK_LISTS_CHANGED       | SW -> P   | Notify popup of list change      |
+---------------------------+-----------+----------------------------------+

P = Popup, SW = Service Worker
```

---

## 9. Egress Optimizations

The extension implements six strategies to minimize Supabase API and realtime
egress:

```
+----+---------------------------------------+--------------------------------------+
| #  | Strategy                              | Implementation Detail                |
+----+---------------------------------------+--------------------------------------+
|    |                                       |                                      |
| 1  | Single consolidated realtime channel  | One .channel() call with three       |
|    |                                       | .on('postgres_changes', ...) handlers |
|    |                                       | instead of three separate channels.   |
|    |                                       | Reduces Phoenix channel joins from    |
|    |                                       | 3 to 1.                              |
|    |                                       |                                      |
+----+---------------------------------------+--------------------------------------+
|    |                                       |                                      |
| 2  | Explicit column selection             | COLUMNS object defines exactly which |
|    |                                       | fields to SELECT for each table:     |
|    |                                       |                                      |
|    |                                       |   focus_sessions:                    |
|    |                                       |     id, user_id, phase, status,      |
|    |                                       |     phase_started_at, focus_duration,|
|    |                                       |     break_duration, ended_at         |
|    |                                       |                                      |
|    |                                       |   block_lists:                       |
|    |                                       |     id, user_id, name, active_days,  |
|    |                                       |     is_enabled, order, deleted       |
|    |                                       |                                      |
|    |                                       |   blocked_websites:                  |
|    |                                       |     id, block_list_id, domain,       |
|    |                                       |     deleted                          |
|    |                                       |                                      |
|    |                                       | Avoids transferring unused columns.  |
|    |                                       |                                      |
+----+---------------------------------------+--------------------------------------+
|    |                                       |                                      |
| 3  | Realtime payload-direct processing    | When a postgres_changes event        |
|    |                                       | arrives, payload.new is used         |
|    |                                       | directly to update IndexedDB.        |
|    |                                       | No follow-up REST API call.          |
|    |                                       | Saves 1 query per realtime event.    |
|    |                                       |                                      |
+----+---------------------------------------+--------------------------------------+
|    |                                       |                                      |
| 4  | session.user instead of getUser()     | After getSession(), session.user     |
|    |                                       | provides the user object. No         |
|    |                                       | separate auth.getUser() API call.    |
|    |                                       | Saves 1 auth request per poll cycle. |
|    |                                       |                                      |
+----+---------------------------------------+--------------------------------------+
|    |                                       |                                      |
| 5  | Popup queries SW cache, not Supabase  | The popup sends GET_FOCUS_STATUS,    |
|    |                                       | GET_BLOCK_LISTS, GET_FOCUS_TIME_TODAY|
|    |                                       | messages to the service worker.      |
|    |                                       | The SW responds from in-memory state |
|    |                                       | or IndexedDB. Popup never creates    |
|    |                                       | its own realtime subscriptions.      |
|    |                                       |                                      |
|    |                                       | Before: 6 realtime subscriptions     |
|    |                                       |   (3 SW + 3 popup)                   |
|    |                                       | After: 1 consolidated channel in SW  |
|    |                                       |                                      |
+----+---------------------------------------+--------------------------------------+
|    |                                       |                                      |
| 6  | Rate limiting on polling              | MIN_POLL_INTERVAL_MS = 25000         |
|    |                                       | Polls within 25s of the last poll    |
|    |                                       | are silently skipped. Prevents       |
|    |                                       | burst polling when multiple alarms   |
|    |                                       | or events fire in quick succession.  |
|    |                                       |                                      |
+----+---------------------------------------+--------------------------------------+
```

---

## 10. Failure Modes and Recovery

### Core Recovery Principle

```
+===========================================================================+
|                                                                           |
|                         ANY FAILURE                                        |
|                            |                                              |
|                            v                                              |
|                  +-------------------+                                    |
|                  | ALLOW NAVIGATION  |  <-- Never block on error          |
|                  +-------------------+                                    |
|                            |                                              |
|                            v                                              |
|                  +-------------------+                                    |
|                  | KEEP EXISTING     |  <-- Don't clear cache on error    |
|                  | STATE             |                                    |
|                  +-------------------+                                    |
|                            |                                              |
|                            v                                              |
|                  +-------------------+                                    |
|                  | RETRY NEXT POLL   |  <-- Alarms ensure eventual retry  |
|                  +-------------------+                                    |
|                                                                           |
+===========================================================================+
```

### Failure Recovery Flowchart

```
  Error occurs during any operation
            |
            v
  +---------------------+
  | Log error           |
  | (debugError)        |
  +----------+----------+
             |
             v
  +---------------------+     +---------------------+
  | Is this a blocking  | No  | Is this a cache      | No
  | decision?           +---->| update?              +----> Continue normally
  +----------+----------+     +----------+----------+
             |                           |
             | Yes                       | Yes
             v                           v
  +---------------------+     +---------------------+
  | return false        |     | Keep existing cache  |
  | (ALLOW navigation)  |     | Fall back to full    |
  +---------------------+     | refreshBlockLists()  |
                              | on next poll         |
                              +---------------------+
```

### Failure Categories

```
+----------------+----------------------------+-----------------------------------+
| Category       | Failure Scenario           | Recovery Strategy                 |
+----------------+----------------------------+-----------------------------------+
|                |                            |                                   |
| NETWORK        | Supabase unreachable       | isOnline = false                  |
|                |                            | All blocking disabled             |
|                |                            | Alarms keep firing, check         |
|                |                            | connectivity each cycle           |
|                |                            |                                   |
|                | WebSocket disconnects      | realtimeHealthy = false           |
|                |                            | Reconnect after 3s delay          |
|                |                            | Alarms attempt reconnect          |
|                |                            | Polling takes over as primary     |
|                |                            |                                   |
|                | HEAD request timeout       | checkConnectivity returns false   |
|                |                            | Treated as offline                |
|                |                            |                                   |
+----------------+----------------------------+-----------------------------------+
|                |                            |                                   |
| AUTHENTICATION | Session expired            | currentFocusSession = null        |
|                |                            | focusSessionCache cleared         |
|                |                            | Blocking disabled (no session)    |
|                |                            | Realtime cleaned up               |
|                |                            | Service worker re-authenticates   |
|                |                            | anonymously on next init          |
|                |                            |                                   |
|                | Token refresh fails        | getSession() returns null         |
|                |                            | Same recovery as expired session  |
|                |                            |                                   |
|                | Anonymous auth recovery    | Service worker calls              |
|                |                            | signInAnonymously() on init       |
|                |                            | New anonymous session created     |
|                |                            | Realtime re-established           |
|                |                            |                                   |
+----------------+----------------------------+-----------------------------------+
|                |                            |                                   |
| PIN GATE       | PIN config cached          | PIN verification works offline    |
|                |                            | SHA-256 hash compared locally     |
|                |                            | No network request needed         |
|                |                            |                                   |
|                | PIN config not cached      | Requires online to fetch from     |
|                |                            | single_user_config via Supabase   |
|                |                            | If offline: PIN gate unavailable, |
|                |                            | extension remains locked          |
|                |                            |                                   |
+----------------+----------------------------+-----------------------------------+
|                |                            |                                   |
| DATA           | Query returns error        | Existing cache preserved          |
|                |                            | Error logged                      |
|                |                            | Retry on next poll cycle          |
|                |                            |                                   |
|                | Realtime payload           | catch block logs error            |
|                | processing error           | Falls back to full                |
|                |                            | refreshBlockLists()               |
|                |                            |                                   |
|                | IndexedDB error            | Operation fails silently          |
|                |                            | In-memory state may diverge       |
|                |                            | Next poll re-syncs                |
|                |                            |                                   |
+----------------+----------------------------+-----------------------------------+
|                |                            |                                   |
| BLOCKING       | isDomainBlocked() throws   | catch returns false (ALLOW)       |
|                |                            | Error logged                      |
|                |                            |                                   |
|                | tabs.update() fails        | Navigation proceeds unblocked     |
|                |                            | (browser default behavior)        |
|                |                            |                                   |
|                | blocked.html fails to load | Extension internal page shows     |
|                |                            | error; user can navigate back     |
|                |                            |                                   |
+----------------+----------------------------+-----------------------------------+
```

---

## 11. Communication Flow

Complete end-to-end sequence from user action to blocking enforcement:

```
  User              Stellar App       Supabase            Extension SW         Browser
  (person)          (PWA)             (Backend)           (background)         (tab)
    |                  |                  |                    |                  |
    |  Click "Start    |                  |                    |                  |
    |  Focus Session"  |                  |                    |                  |
    +----------------->|                  |                    |                  |
    |                  |                  |                    |                  |
    |                  |  INSERT INTO     |                    |                  |
    |                  |  focus_sessions  |                    |                  |
    |                  |  (status=running |                    |                  |
    |                  |   phase=focus)   |                    |                  |
    |                  +----------------->|                    |                  |
    |                  |                  |                    |                  |
    |                  |                  |  postgres_changes  |                  |
    |                  |                  |  (WebSocket push)  |                  |
    |                  |                  |  event: INSERT     |                  |
    |                  |                  |  table:            |                  |
    |                  |                  |   focus_sessions   |                  |
    |                  |                  +------------------->|                  |
    |                  |                  |                    |                  |
    |                  |                  |          +---------+---------+        |
    |                  |                  |          | payload.new:      |        |
    |                  |                  |          |  status: running  |        |
    |                  |                  |          |  phase: focus     |        |
    |                  |                  |          |                   |        |
    |                  |                  |          | 1. Build session  |        |
    |                  |                  |          |    cache object   |        |
    |                  |                  |          |                   |        |
    |                  |                  |          | 2. IndexedDB.put( |        |
    |                  |                  |          |    focusSession)  |        |
    |                  |                  |          |                   |        |
    |                  |                  |          | 3. currentFocus   |        |
    |                  |                  |          |    Session =      |        |
    |                  |                  |          |    sessionData    |        |
    |                  |                  |          |                   |        |
    |                  |                  |          | 4. refreshBlock   |        |
    |                  |                  |          |    Lists()        |        |
    |                  |                  |          |                   |        |
    |                  |                  |          | 5. notifyPopup(   |        |
    |                  |                  |          |    FOCUS_STATUS   |        |
    |                  |                  |          |    _CHANGED)      |        |
    |                  |                  |          +---------+---------+        |
    |                  |                  |                    |                  |
    |                  |                  |                    |                  |
    |  Navigate to     |                  |                    |                  |
    |  youtube.com     |                  |                    |                  |
    +-------------------------------------------------------------------->|     |
    |                  |                  |                    |           |      |
    |                  |                  |          +---------+-----------+      |
    |                  |                  |          |                     |      |
    |                  |                  |          | onBeforeNavigate:   |      |
    |                  |                  |          |                     |      |
    |                  |                  |          | frameId === 0?  YES |      |
    |                  |                  |          | internal URL?   NO  |      |
    |                  |                  |          | isOnline?       YES |      |
    |                  |                  |          | status=running? YES |      |
    |                  |                  |          | phase=focus?    YES |      |
    |                  |                  |          |                     |      |
    |                  |                  |          | isDomainBlocked(    |      |
    |                  |                  |          |   "youtube.com"):   |      |
    |                  |                  |          |                     |      |
    |                  |                  |          |   IndexedDB.getAll( |      |
    |                  |                  |          |     blockLists)     |      |
    |                  |                  |          |   IndexedDB.getAll( |      |
    |                  |                  |          |     blockedWebsites)|      |
    |                  |                  |          |                     |      |
    |                  |                  |          |   Match found: YES  |      |
    |                  |                  |          |                     |      |
    |                  |                  |          | tabs.update(tabId,  |      |
    |                  |                  |          |   blocked.html?     |      |
    |                  |                  |          |   url=youtube.com   |      |
    |                  |                  |          |   &domain=          |      |
    |                  |                  |          |   youtube.com)      |      |
    |                  |                  |          +----------+----------+      |
    |                  |                  |                     |                 |
    |                  |                  |                     +---------------->|
    |                  |                  |                                       |
    |  Sees blocked    |                  |                              +--------+
    |  page with       |                  |                              |blocked |
    |  galaxy + msg    |<-------------------------------------------------------+|
    |                  |                  |                              |.html   |
    |                  |                  |                              +--------+
    |                  |                  |                                       |
```

---

## File Index

```
stellar-focus/
  src/
    background/
      service-worker.ts    -- Blocking engine, realtime, polling, cache management
    auth/
      supabase.ts          -- Supabase client factory, storage adapter, auth helpers
    lib/
      storage.ts           -- IndexedDB abstraction (blockLists, blockedWebsites, focusSessionCache)
      network.ts           -- Online/offline detection, connectivity checks
      debug.ts             -- Conditional logging (enabled via stellar_debug_mode)
    config.ts              -- Extension config from browser.storage.local
    popup/
      popup.ts             -- Popup UI logic, service worker messaging
      popup.html           -- Popup markup
    pages/
      blocked.ts           -- Blocked page with galaxy animation
      blocked.html         -- Blocked page markup
    options/
      options.ts           -- Configuration page logic
      options.html         -- Configuration page markup
  manifests/
    chrome.json            -- Chrome MV3 manifest
    firefox.json           -- Firefox MV3 manifest
```
