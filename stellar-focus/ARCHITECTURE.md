# Stellar Focus Extension Architecture

System design documentation for the Stellar Focus browser extension, covering the blocking engine, real-time synchronization, and failure recovery patterns.

---

## System Overview

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

---

## Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Fail-Safe Offline** | When offline or uncertain, allow all navigation - never accidentally block legitimate browsing |
| **Online-First Blocking** | Only block when connectivity is verified and session state is confirmed from server |
| **Real-Time Primary** | WebSocket subscriptions provide instant state propagation (~100-500ms latency) |
| **Polling Backup** | 30-second interval catches any missed WebSocket events, ensuring eventual consistency |
| **Local Cache** | IndexedDB persists state across service worker restarts and brief offline periods |
| **Main Frame Only** | Block page navigations, not embedded iframes or resources |

---

## Blocking Decision Engine

The blocking engine evaluates every main-frame navigation through a fail-safe guard chain. Each guard defaults to **ALLOW** on uncertainty.

```
Navigation Event
      │
      ▼
┌─────────────────────────────┐
│ Main frame only?            │── No ──▶ ALLOW (iframe)
└─────────────┬───────────────┘
              │ Yes
              ▼
┌─────────────────────────────┐
│ Internal URL?               │── Yes ─▶ ALLOW (extension pages)
│ (moz-extension://, about:)  │
└─────────────┬───────────────┘
              │ No
              ▼
┌─────────────────────────────┐
│ Online?                     │── No ──▶ ALLOW (fail-safe)
└─────────────┬───────────────┘
              │ Yes
              ▼
┌─────────────────────────────┐
│ Active session?             │── No ──▶ ALLOW
│ (status === 'running')      │
└─────────────┬───────────────┘
              │ Yes
              ▼
┌─────────────────────────────┐
│ Focus phase?                │── No ──▶ ALLOW (on break)
│ (phase === 'focus')         │
└─────────────┬───────────────┘
              │ Yes
              ▼
┌─────────────────────────────┐
│ Domain in active block list?│── No ──▶ ALLOW
└─────────────┬───────────────┘
              │ Yes
              ▼
         🚫 REDIRECT
         → blocked.html
```

### Domain Matching

The domain resolution algorithm supports both exact matches and subdomain blocking:

| Hostname | Blocked Domain | Match? | Reason |
|----------|----------------|--------|--------|
| `youtube.com` | `youtube.com` | ✓ | Exact match |
| `www.youtube.com` | `youtube.com` | ✓ | Subdomain |
| `music.youtube.com` | `youtube.com` | ✓ | Subdomain |
| `youtube.com` | `www.youtube.com` | ✗ | Parent doesn't match child |
| `notyoutube.com` | `youtube.com` | ✗ | Different domain |
| `youtube.com.evil.com` | `youtube.com` | ✗ | Not a subdomain |

### Day-Based Scheduling

Each block list has optional `active_days` scheduling:
- `null` = active every day
- `[1,2,3,4,5]` = active Monday through Friday only
- At navigation time, only lists active for the current day of week are evaluated

---

## Dual-Channel Synchronization

The extension uses a redundant synchronization strategy combining real-time WebSockets with polling backup.

### Real-Time Channel (Primary)

Three Supabase Realtime channels provide instant state updates:

| Channel | Table | Purpose |
|---------|-------|---------|
| Focus Sessions | `focus_sessions` | Session start/pause/stop events |
| Block Lists | `block_lists` | List enable/disable, day schedule changes |
| Blocked Websites | `blocked_websites` | Domain additions/removals |

**Latency**: ~100-500ms from action in Stellar app to blocking state change

### Polling Backup (Secondary)

Browser alarm triggers every 30 seconds:
1. Verify network connectivity to Supabase
2. Re-establish WebSocket subscriptions if just came online
3. Query for active focus session
4. Refresh block lists cache if session state changed

**Purpose**: Catches missed WebSocket events, handles subscription failures, ensures state eventually converges

### State Flow

```
Stellar App                    Supabase                Extension
    │                             │                        │
    │  Start focus session        │                        │
    ├────────────────────────────▶│                        │
    │                             │                        │
    │                             │  postgres_changes      │
    │                             │  (WebSocket)           │
    │                             ├───────────────────────▶│
    │                             │                        │
    │                             │     Query fresh state  │
    │                             │◀────────────────────────┤
    │                             │                        │
    │                             │     Return session     │
    │                             ├───────────────────────▶│
    │                             │                        │
    │                             │     Update cache       │
    │                             │     Blocking active    │
    │                             │                        │
```

---

## Network State Machine

The extension tracks network connectivity and transitions between online/offline states gracefully.

```
┌────────────────────────────────────────────────────────────────┐
│                  Network State Transitions                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Online → Offline:                                              │
│  • Blocking disabled (fail-safe)                                │
│  • WebSocket subscriptions become inactive                      │
│  • Cached state preserved for reference                         │
│                                                                 │
│  Offline → Online:                                              │
│  • Active connectivity check to Supabase                        │
│  • Re-establish WebSocket subscriptions                         │
│  • Poll for fresh session state                                 │
│  • Refresh block lists cache                                    │
│  • Blocking re-enabled if session active                        │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Connectivity Check**: HEAD request to Supabase URL (not just `navigator.onLine`) ensures the specific backend is reachable.

---

## Local Cache Layer

IndexedDB provides persistent local storage across service worker restarts.

### Cache Stores

| Store | Purpose | Key |
|-------|---------|-----|
| `blockLists` | User's block list configurations | `id` (UUID) |
| `blockedWebsites` | Domain entries for all lists | `id` (UUID) |
| `focusSessionCache` | Current session state | `'current'` (singleton) |

### Cache Lifecycle

**Populate**:
- On extension initialization
- After successful Supabase queries
- On real-time events

**Clear**:
- On user logout
- When Supabase returns empty results (user deleted data)
- On session expiration

**Preserve**:
- On query failures (keep known-good state)
- During offline periods

---

## Extension Storage Adapter

Browser extensions cannot use `localStorage` in the service worker context. A custom storage adapter bridges Supabase Auth to `browser.storage.local`:

```
Supabase Client                    Extension Storage
      │                                   │
      │  persistSession: true             │
      │  storage: adapter  ───────────────┤
      │                                   │
      │  Token refresh                    │
      ├───────────────────────────────────▶│ browser.storage.local.set()
      │                                   │
      │  Get session                      │
      ├───────────────────────────────────▶│ browser.storage.local.get()
      │                                   │
```

This enables:
- Session persistence across browser restarts
- Automatic token refresh in background
- Shared auth state between popup and service worker

---

## Failure Modes and Recovery

The extension is designed to fail safely and recover automatically.

### Failure Recovery Strategy

```
Any failure during blocking decision:
      │
      ▼
┌─────────────────────┐
│ ALLOW NAVIGATION    │◀── Never block on uncertainty
└─────────────────────┘

Any failure during sync:
      │
      ▼
┌─────────────────────┐
│ KEEP EXISTING STATE │◀── Preserve known-good state
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ RETRY NEXT POLL     │◀── 30-second auto-recovery
└─────────────────────┘
```

### Failure Categories

| Category | Behavior | Recovery |
|----------|----------|----------|
| **Network** (offline, timeout) | Allow navigation, use cached state | Poll re-checks every 30s |
| **Authentication** (expired, invalid) | Allow navigation, clear session | User re-authenticates |
| **Data** (corrupt cache, empty results) | Clear cache, refetch | Automatic on next poll |
| **Blocking** (navigation complete, invalid URL) | Page loads normally | By design |

---

## Communication Flow

Complete flow from user action in Stellar to blocking in the extension:

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
          │                              │         Query session        │
          │                              │◀─────────────────────────────┤
          │                              │                              │
          │                              │  Return focus_sessions row   │
          │                              ├─────────────────────────────▶│
          │                              │                              │
          │                              │      Update cache            │
          │                              │      status: 'running'       │
          │                              │      phase: 'focus'          │
          │                              │                              │
          │                              │  User navigates to           │
          │                              │  youtube.com                 │
          │                              │                              │
          │                              │      Check: domain blocked?  │
          │                              │      → true                  │
          │                              │                              │
          │                              │      Redirect to             │
          │                              │      blocked.html            │
          │                              │                              │
```
