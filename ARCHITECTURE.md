# Stellar Planner: Backend Architecture & System Design

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Local Database (Dexie.js / IndexedDB)](#2-local-database-dexiejs--indexeddb)
3. [Supabase Backend](#3-supabase-backend)
4. [Sync Engine (@stellar/sync-engine)](#4-sync-engine-stellarsync-engine)
5. [Single-User Auth Mode](#5-single-user-auth-mode)
6. [Focus Timer State Machine](#6-focus-timer-state-machine)
7. [PWA Architecture](#7-pwa-architecture)

---

## 1. System Overview

Stellar is a **local-first, offline-capable Progressive Web Application** built with SvelteKit that synchronizes across multiple devices using Supabase as its cloud backend. The architecture is designed around five core principles:

1. **Local-first**: All reads come from IndexedDB. The UI never waits on the network.
2. **Offline-capable**: Full CRUD operations work without connectivity.
3. **Intent-preserving**: Operations record *what the user meant* (e.g., "increment by 1"), not just final state.
4. **Conflict-resilient**: A three-tier conflict resolution engine handles concurrent multi-device edits.
5. **Egress-optimized**: Every design decision minimizes Supabase bandwidth consumption.

### High-Level Architecture Diagram

```
+------------------------------------------------------------------+
|                        CLIENT (Browser)                          |
|                                                                  |
|  +------------------+    +------------------+    +-----------+   |
|  |   Svelte Stores  |    |  Focus Timer FSM |    | PWA / SW  |   |
|  |  (Reactive UI)   |    | IDLE->RUN->PAUSE |    | Cache Mgr |   |
|  +--------+---------+    +--------+---------+    +-----+-----+   |
|           |                       |                    |         |
|           v                       v                    v         |
|  +--------------------------------------------------+           |
|  |              Repository Layer (db/repositories)   |           |
|  |  - Local reads (instant)                          |           |
|  |  - Local writes + queue sync operation            |           |
|  +--------------------------------------------------+           |
|           |                       |                              |
|           v                       v                              |
|  +------------------+    +------------------+                    |
|  |  Dexie.js ORM    |    |   Sync Outbox    |                    |
|  |  (IndexedDB)     |    |   (syncQueue)    |                    |
|  |                  |    |                  |                    |
|  | 13 Entity Tables |    | Intent-Based Ops |                    |
|  |  4 System Tables |    | create/set/inc/  |                    |
|  |  1 History Table |    | delete           |                    |
|  +--------+---------+    +--------+---------+                    |
|           |                       |                              |
|           |        +--------------+----------+                   |
|           |        |                         |                   |
|           |        v                         v                   |
|           |  +------------+    +----------------------------+    |
|           |  | Coalescing |    |       Sync Engine          |    |
|           |  | Engine     |    |  - Mutex lock              |    |
|           |  | (queue.ts) |    |  - Push-then-Pull cycle    |    |
|           |  +-----+------+    |  - Cursor-based pull       |    |
|           |        |           |  - Conflict resolution     |    |
|           |        +---------->|  - Egress tracking         |    |
|           |                    +-------------+--------------+    |
|           |                                  |                   |
+-----------|----------------------------------+-------------------+
            |                                  |
            |                                  |     +-----------+
            |          NETWORK                 +---->| Realtime  |
            |                                  |     | WebSocket |
            |                                  |     | Channel   |
            v                                  v     +-----+-----+
+------------------------------------------------------------------+
|                     SUPABASE (Cloud)                             |
|                                                                  |
|  +------------------+    +------------------+    +-----------+   |
|  |   PostgreSQL     |    |  Row Level       |    | Realtime  |   |
|  |   13 Tables      |    |  Security (RLS)  |    | pub/sub   |   |
|  |   with Tombstone |    |  per-user CRUD   |    | postgres  |   |
|  |   Soft Deletes   |    |  policies        |    | _changes  |   |
|  +------------------+    +------------------+    +-----------+   |
|                                                                  |
|  +------------------+    +------------------+                    |
|  |  Auth (GoTrue)   |    |  Triggers        |                    |
|  |  JWT Sessions    |    |  - set_user_id   |                    |
|  |  Token Refresh   |    |  - updated_at    |                    |
|  +------------------+    +------------------+                    |
+------------------------------------------------------------------+
```

### File Map

| Layer | File | Purpose |
|-------|------|---------|
| Database Schema | `src/routes/+layout.ts` (database config) | 14 schema versions passed to `initEngine()` |
| Sync Engine | `@stellar/sync-engine` | Manages Dexie, Supabase, sync — see [engine docs](https://github.com/prabhask5/stellar-engine/blob/main/ARCHITECTURE.md) |
| Focus Utils | `src/lib/utils/focus.ts` | Timer calculations, phase transitions |
| Focus Store | `src/lib/stores/focus.ts` | Focus timer state machine |
| Service Worker | `static/sw.js` *(generated by `stellarPWA` Vite plugin)* | PWA caching strategies |
| SQL Schema | `supabase-schema.sql` | Full PostgreSQL schema with RLS |

---

## 2. Local Database (Dexie.js / IndexedDB)

**Configured in**: `src/routes/+layout.ts` via `initEngine({ database: { ... } })`

Stellar uses **Dexie.js** (managed by `@stellar/sync-engine`) as an ORM over the browser's IndexedDB. The database has evolved through **14 schema versions** with data migrations. The engine creates the Dexie instance and automatically merges system tables (`syncQueue`, `conflictHistory`, `offlineCredentials`, `offlineSession`, `singleUserConfig`) into every version. Stellar has no direct `dexie` or `@supabase/supabase-js` dependencies -- all access is through the engine.

### 2.1 Entity Tables (13)

```
+--------------------+--------------------------------------------------+
| Table              | Indexes                                          |
+--------------------+--------------------------------------------------+
| goalLists          | id, user_id, project_id, order, created_at,      |
|                    | updated_at                                       |
| goals              | id, goal_list_id, order, created_at, updated_at  |
| dailyRoutineGoals  | id, user_id, order, start_date, end_date,        |
|                    | created_at, updated_at                           |
| dailyGoalProgress  | id, daily_routine_goal_id, date,                 |
|                    | [daily_routine_goal_id+date], updated_at          |
| taskCategories     | id, user_id, project_id, order, created_at,      |
|                    | updated_at                                       |
| commitments        | id, user_id, project_id, section, order,         |
|                    | created_at, updated_at                           |
| dailyTasks         | id, user_id, order, created_at, updated_at       |
| longTermTasks      | id, user_id, due_date, category_id, type,        |
|                    | created_at, updated_at                           |
| focusSettings      | id, user_id, updated_at                          |
| focusSessions      | id, user_id, started_at, ended_at, status,       |
|                    | updated_at                                       |
| blockLists         | id, user_id, order, updated_at                   |
| blockedWebsites    | id, block_list_id, updated_at                    |
| projects           | id, user_id, is_current, order, created_at,      |
|                    | updated_at                                       |
+--------------------+--------------------------------------------------+
```

### 2.2 System Tables (4)

```
+--------------------+-----------------------------------------------+
| Table              | Purpose                                       |
+--------------------+-----------------------------------------------+
| syncQueue          | Outbox: intent-based operations pending sync   |
|                    | Index: ++id (auto-increment), table, entityId, |
|                    |        timestamp                               |
| offlineCredentials | Singleton: cached email/password for offline   |
|                    | login. Key: 'current_user'                    |
| offlineSession     | Singleton: offline session token.              |
|                    | Key: 'current_session'                        |
| singleUserConfig   | Singleton: PIN hash + profile for single-user  |
|                    | gate. Key: 'config'                           |
+--------------------+-----------------------------------------------+
```

### 2.3 History Table (1)

```
+--------------------+-----------------------------------------------+
| conflictHistory    | Audit log of conflict resolutions.             |
|                    | Index: ++id, entityId, entityType, timestamp   |
|                    | 30-day retention, auto-cleaned.                |
+--------------------+-----------------------------------------------+
```

### 2.4 Version Migration History

| Version | Feature Added |
|---------|--------------|
| v2 | Initial schema: goalLists, goals, dailyRoutineGoals, dailyGoalProgress, syncQueue |
| v3 | Added `entityId` index to syncQueue for coalescing |
| v4 | Added `order` to goals/routines for drag-drop reordering + data migration |
| v5 | Tasks feature: taskCategories, commitments, dailyTasks, longTermTasks |
| v6 | Offline auth: offlineCredentials, offlineSession |
| v7 | Focus feature: focusSettings, focusSessions, blockLists, blockedWebsites |
| v8 | `_version` column on all entities for optimistic concurrency + migration |
| v9 | conflictHistory table for audit trail |
| v10 | `device_id` column on all entities for deterministic tiebreaking |
| v11 | Projects table + project_id foreign keys |
| v12 | Progressive routine columns (start_target_value, etc.) |
| v13 | `order` index on goalLists for reordering + migration |
| v14 | Single-user auth: `singleUserConfig` system table for local PIN gate |

### 2.5 Hidden Columns (Not Indexed)

Every entity table also carries these non-indexed columns:
- **`_version`** (number): Optimistic concurrency control. Incremented on conflict merge.
- **`device_id`** (string): UUID of the device that last modified the record.
- **`deleted`** (boolean): Soft-delete tombstone flag.

---

## 3. Supabase Backend

**File**: `supabase-schema.sql`

### 3.1 PostgreSQL Table Design

All 13 entity tables mirror the local Dexie schema with these PostgreSQL-specific additions:

- **UUID primary keys** via `uuid_generate_v4()`
- **Cascading foreign keys** (e.g., `goals.goal_list_id` references `goal_lists.id ON DELETE CASCADE`)
- **Check constraints** on enum-like fields (e.g., `type IN ('completion', 'incremental', 'progressive')`)
- **Unique constraints** (e.g., `focus_settings(user_id)`, `daily_goal_progress(daily_routine_goal_id, date)`)
- **Partial indexes** on `deleted = false` for efficient non-tombstone queries
- **`updated_at` indexes** on every table for cursor-based incremental sync

### 3.2 Row Level Security (RLS)

Every table has RLS enabled with four policies (SELECT, INSERT, UPDATE, DELETE):

```sql
-- Direct ownership (most tables):
create policy "Users can view their own goal lists"
  on goal_lists for select
  using ((select auth.uid()) = user_id);

-- Indirect ownership via parent (goals via goal_lists, progress via routines):
create policy "Users can view their own goals"
  on goals for select
  using (
    exists (
      select 1 from goal_lists
      where goal_lists.id = goals.goal_list_id
      and goal_lists.user_id = (select auth.uid())
    )
  );
```

**Security implications for sync**: RLS silently blocks unauthorized writes. Supabase returns no error but affects 0 rows. The sync engine explicitly checks for returned data after every write to detect this (`engine.ts` lines 1427-1471).

### 3.3 Database Triggers

Two trigger functions run on every table:

```sql
-- Auto-set user_id on INSERT (9 tables with direct user_id):
create trigger set_goal_lists_user_id
  before insert on goal_lists
  for each row execute function set_user_id();

-- Auto-update updated_at on every UPDATE (all 13 tables):
create trigger update_goals_updated_at
  before update on goals
  for each row execute function update_updated_at_column();
```

### 3.4 Realtime Publications

All 13 entity tables are added to the `supabase_realtime` publication:

```sql
alter publication supabase_realtime add table goal_lists;
alter publication supabase_realtime add table goals;
-- ... (all 13 tables)
```

This enables WebSocket-based real-time change streaming to connected clients.

---

## 4. Sync Engine (@stellar/sync-engine)

Stellar uses the `@stellar/sync-engine` package (an external dependency hosted at [github.com/prabhask5/stellar-engine](https://github.com/prabhask5/stellar-engine)) for all backend synchronization, authentication, conflict resolution, and realtime updates. See the [engine documentation](https://github.com/prabhask5/stellar-engine/blob/main/ARCHITECTURE.md) for complete technical details.

The engine is initialized in `src/routes/+layout.ts` with Stellar's 13 entity table definitions, auth configuration, and lifecycle hooks. Each table definition in the engine's `TableConfig` requires only `supabaseName` and `columns` (plus optional fields like `isSingleton`). The Dexie table name is automatically derived from `supabaseName` via the engine's `snakeToCamel()` conversion (e.g., `goal_lists` becomes `goalLists`, `daily_goal_progress` becomes `dailyGoalProgress`). There is no separate `dexieTable` field. All repository files use the engine's generic CRUD APIs (`engineCreate`, `engineUpdate`, `engineDelete`, `engineBatchWrite`, `engineIncrement`) and query APIs (`engineGet`, `engineQuery`, `engineQueryRange`, etc.) rather than direct Dexie or Supabase calls.

### Key Engine Capabilities

- **Intent-based sync** with operation coalescing (4 operation types, 11 coalescing rules)
- **Three-tier conflict resolution** with field-level merging and device ID tiebreakers
- **Dual-mode authentication** (Supabase + offline credential caching)
- **Realtime subscriptions** via consolidated WebSocket channel
- **Tombstone system** with configurable cleanup intervals
- **Egress optimization** (column selection, cursor-based pull, realtime-first strategy)
- **Network state machine** with iOS PWA special handling

---

## 5. Single-User Auth Mode

Stellar uses a 6-digit PIN code gate backed by real Supabase email/password auth. The user provides an email during first-time setup; the PIN is padded and used as the actual Supabase password via `supabase.auth.signUp()`. Optional email confirmation blocks setup until the email is verified. Optional device verification requires OTP on untrusted devices. Email changes are supported via `changeSingleUserEmail()`. All engine-level details (PIN padding, email/password auth, device verification, email change flow, offline fallback) are documented in the [engine's Single-User Auth Mode section](https://github.com/prabhask5/stellar-engine/blob/main/ARCHITECTURE.md#2-single-user-auth-mode).

### 5.1 Configuration

**File**: `src/routes/+layout.ts`

Single-user mode is configured at engine initialization:

```typescript
auth: {
  mode: 'single-user',
  singleUser: {
    gateType: 'code',
    codeLength: 6
  },
  profileExtractor: (meta) => ({
    firstName: meta.first_name || '',
    lastName: meta.last_name || ''
  }),
  profileToMetadata: (p) => ({
    first_name: p.firstName,
    last_name: p.lastName
  }),
  enableOfflineAuth: true,
  emailConfirmation: { enabled: true },
  deviceVerification: { enabled: true },
}
```

The `singleUserConfig` system table in IndexedDB stores the PIN hash (for offline fallback), email, profile, and Supabase user ID.

### 5.2 Supabase Requirement

The auth system uses real Supabase email/password auth (`supabase.auth.signUp()` / `supabase.auth.signInWithPassword()`) with the PIN padded to meet the minimum password length. This gives the user a proper `auth.uid()` for RLS compliance.

If `emailConfirmation` is enabled, Supabase email templates must be configured. See [EMAIL_TEMPLATES.md](https://github.com/prabhask5/stellar-engine/blob/main/EMAIL_TEMPLATES.md) for the full HTML templates for signup confirmation, email change confirmation, and device verification emails.

If `deviceVerification` is enabled, a `trusted_devices` table is required in Supabase (see [engine README](https://github.com/prabhask5/stellar-engine/blob/main/README.md) for the SQL schema).

### 5.3 Login Page: Setup & Unlock Modes

**File**: `src/routes/login/+page.svelte`

The login page has two modes, determined by the `singleUserSetUp` flag from `resolveAuthState()`:

| `singleUserSetUp` | Mode | UI |
|-------------------|------|-----|
| `false` | **Setup** | First name, last name, email, create 6-digit code + confirm code |
| `true` | **Unlock** | Shows user avatar/name, enter 6-digit code |

```
First visit (/login)             Return visit (/login)
+------------------------+       +------------------------+
| Welcome to Stellar     |       | Welcome back, John     |
| Set up your account    |       |                        |
|                        |       | Enter your code        |
| First Name [________]  |       | [ ][ ][ ][ ][ ][ ]    |
| Last Name  [________]  |       |                        |
| Email      [________]  |       | [    Unlock    ]       |
|                        |       +------------------------+
| Create a 6-digit code  |
| [ ][ ][ ][ ][ ][ ]    |
|                        |
| Confirm your code       |
| [ ][ ][ ][ ][ ][ ]    |
|                        |
| [  Get Started  ]      |
+------------------------+
```

On setup, the page calls `setupSingleUser(code, { firstName, lastName }, email)`. If `emailConfirmation` is enabled, setup returns `{ confirmationRequired: true }` and the page shows a "check your email" modal. After the user clicks the email link, `completeSingleUserSetup()` finalizes setup.

On unlock, the page calls `unlockSingleUser(code)`. If `deviceVerification` is enabled and the device is untrusted, unlock returns `{ deviceVerificationRequired: true, maskedEmail }` and shows a "verify your device" modal. After the user clicks the email link, `completeDeviceVerification()` finalizes the session.

Both functions are imported from `@prabhask5/stellar-engine/auth`.

Incorrect codes on unlock trigger a shake animation and clear the digit inputs.

### 5.4 Sign-Out Replaced with Lock

**File**: `src/routes/+layout.svelte`

In single-user mode, "Sign Out" is replaced with a **Lock** action. The layout's sign-out handler calls `lockSingleUser()` instead of the standard Supabase `signOut()`:

```
User taps "Lock" in sidebar
  |
  v
250ms delay (for nav animation)
  |
  v
lockSingleUser()
  |  --> stopSyncEngine()
  |  --> syncStatusStore.reset()
  |  --> authState.setNoAuth()
  |
  v
window.location.href = '/login'
```

Locking does NOT destroy the anonymous Supabase session, user data, or IndexedDB config. The user can unlock again by entering their PIN code.

The `onAuthKicked` callback also calls `lockSingleUser()` and redirects to `/login` when a session is invalidated server-side.

### 5.5 Profile Page: Code Change

**File**: `src/routes/(protected)/profile/+page.svelte`

Instead of a password change form, the profile page provides a **code change** interface using `changeSingleUserGate(oldCode, newCode)`. The user enters their current 6-digit code and a new 6-digit code. Profile name editing uses `updateSingleUserProfile(profile)`.

### 5.6 Confirm Page

**File**: `src/routes/confirm/+page.svelte`

The confirm page handles three types of email confirmations via the `type` URL parameter:

| `type` | Purpose | Triggered By |
|--------|---------|-------------|
| `signup` | Email confirmation after initial setup | `setupSingleUser()` |
| `email_change` | Confirm a new email address | `changeSingleUserEmail()` |
| `email` | Device verification OTP | `sendDeviceVerification()` |

The page calls `verifyOtp({ token_hash, type })`, sends the result via BroadcastChannel (`AUTH_CONFIRMED`), and auto-closes the tab. The originating tab (login page or profile page) listens for the broadcast and calls the appropriate completion function.

### 5.7 Profile Page: Email Change

**File**: `src/routes/(protected)/profile/+page.svelte`

The profile page includes an email change card that calls `changeSingleUserEmail(newEmail)`. On success, a confirmation modal appears with a resend button (30-second cooldown). A BroadcastChannel listener waits for `AUTH_CONFIRMED` with `verificationType === 'email_change'`, then calls `completeSingleUserEmailChange()` to update the local config and display.

---

## 6. Focus Timer State Machine

**Files**: `src/lib/utils/focus.ts`, `src/lib/stores/focus.ts`

### 7.1 State Diagram

```
                    start()
    +-------+  ----------------->  +---------+
    | IDLE  |                      | RUNNING |
    | (no   |  <-----------------  | FOCUS   |
    | session)     stop()          |         |
    +-------+                      +----+----+
                                        |
                           timer expires |
                           or skip()    |
                                        v
                                   +---------+
                  resume()         | PAUSED  |
              +----------------->  | (at     |
              |                    | phase   |
              |                    | start)  |
              |                    +----+----+
              |                         |
              |            resume()     |
              |            or auto-     |
              |            start        |
              v                         v
         +---------+              +---------+
         | RUNNING |              | RUNNING |
         | FOCUS   |  <--------   | BREAK   |
         | (next   |  timer       |         |
         | cycle)  |  expires     |         |
         +---------+              +---------+
              |                         |
              |   cycle >= total_cycles |
              |   (session complete)    |
              v                         v
         +---------+              +---------+
         | STOPPED |              | STOPPED |
         +---------+              +---------+
```

### 7.2 Phase Transitions

```typescript
function getNextPhase(session, settings): { phase, cycle, durationMs } {
  if (session.phase === 'focus') {
    // Focus complete -> Break
    const isLongBreak = session.current_cycle >= settings.cycles_before_long_break;
    return {
      phase: 'break',
      cycle: session.current_cycle,
      durationMs: isLongBreak ? longBreakMs : breakMs
    };
  }
  // Break complete -> Next focus (or idle if all cycles done)
  if (session.current_cycle >= session.total_cycles) {
    return { phase: 'idle', cycle: session.current_cycle, durationMs: 0 };
  }
  return {
    phase: 'focus',
    cycle: session.current_cycle + 1,
    durationMs: focusDurationMs
  };
}
```

### 7.3 Timer Precision

The focus store uses a **100ms tick interval** for smooth countdown display:

```typescript
tickInterval = setInterval(tick, 100);
```

Remaining time is computed from server-synced timestamps rather than decrementing a local counter, ensuring accuracy across devices:

```typescript
function calculateRemainingMs(session: FocusSession): number {
  const phaseStartTime = new Date(session.phase_started_at).getTime();
  const now = Date.now();
  const elapsed = now - phaseStartTime;
  return Math.max(0, session.phase_remaining_ms - elapsed);
}
```

### 7.4 Cross-Device Sync

When a focus session is started/paused/stopped on Device A, Device B receives the update via realtime and plays appropriate transition animations:

```
Device A: start() --> DB write --> Sync push --> Supabase
                                                    |
                                        Realtime broadcast
                                                    |
Device B: handleRealtimeUpdate() <------------------+
  |
  +---> Detect transition type:
  |       no session -> session = 'starting'
  |       running -> paused = 'pausing'
  |       paused -> running = 'resuming'
  |       any -> stopped = 'stopping'
  |
  +---> Update local state
  +---> Start/stop tick interval
  +---> Play 600ms transition animation
```

---

## 7. PWA Architecture

**File**: `static/sw.js` *(auto-generated at build time by the `stellarPWA` Vite plugin from `@prabhask5/stellar-engine/vite` — do not edit manually)*

### 7.1 Cache Strategy Overview

```
+------------------------------------------------------------------+
|  SERVICE WORKER CACHING STRATEGIES                               |
|                                                                  |
|  +----------------------------+                                  |
|  | NAVIGATION (HTML pages)    |                                  |
|  | Strategy: Network-First    |                                  |
|  | Timeout: 3 seconds         |                                  |
|  | Fallback: Cached '/' page  |                                  |
|  | Last resort: offline.html  |                                  |
|  +----------------------------+                                  |
|                                                                  |
|  +----------------------------+                                  |
|  | IMMUTABLE ASSETS           |                                  |
|  | (/_app/immutable/*)        |                                  |
|  | Strategy: Cache-First      |                                  |
|  | Cache: ASSET_CACHE (v1)    |                                  |
|  | Never revalidates          |                                  |
|  | Persists across deploys    |                                  |
|  +----------------------------+                                  |
|                                                                  |
|  +----------------------------+                                  |
|  | STATIC ASSETS              |                                  |
|  | (.js, .css, .png, etc.)    |                                  |
|  | Strategy: Cache-First      |                                  |
|  | Cache: SHELL_CACHE (ver)   |                                  |
|  | No background revalidation |                                  |
|  | Versioned per deploy       |                                  |
|  +----------------------------+                                  |
|                                                                  |
|  +----------------------------+                                  |
|  | OTHER REQUESTS             |                                  |
|  | Strategy: Network-First    |                                  |
|  | Fallback: Cache            |                                  |
|  +----------------------------+                                  |
|                                                                  |
|  EXCLUDED: /api/* routes (never cached)                          |
|  EXCLUDED: External origins                                      |
+------------------------------------------------------------------+
```

### 7.2 Dual-Cache Architecture

```
stellar-assets-v1          (PERSISTENT - survives deploys)
  |
  +---> Content-hashed immutable files
  +---> /_app/immutable/chunks/*.js
  +---> /_app/immutable/assets/*.css
  +---> Never expires, never revalidates

stellar-shell-{APP_VERSION} (VERSIONED - one per deploy)
  |
  +---> '/' (root HTML)
  +---> /manifest.json, /favicon.png
  +---> Non-immutable static assets
  +---> Old versions deleted on activate
```

### 7.3 Background Precaching

After activation, the service worker fetches an `asset-manifest.json` and precaches all application assets:

```
activate event
  |
  v
backgroundPrecache()
  |
  +---> Fetch /asset-manifest.json
  |
  +---> Diff against both caches (asset + shell)
  |
  +---> Only download UNCACHED assets
  |       (deduplicated against both caches)
  |
  +---> Batch download (5 concurrent)
  |       with 50ms inter-batch delay
  |
  +---> Notify clients: { type: 'PRECACHE_COMPLETE' }
```

### 7.4 Update Flow

```
New deploy detected (new SW installed)
  |
  v
SW sends: { type: 'SW_INSTALLED', version: APP_VERSION }
  |
  v
UpdatePrompt component shows banner to user
  |
  v
User clicks "Update" --> skipWaiting() + page reload
  |
  v
New SW activates:
  1. Delete old stellar-shell-* caches
  2. Keep stellar-assets-v1 (immutable files persist!)
  3. clients.claim()
```

The controlled update flow (no `skipWaiting()` during install) prevents jarring mid-session updates.

---

## 8. Plans Page: Total Progress Bar

The Plans page (`src/routes/(protected)/plans/+page.svelte`) displays an aggregate **Total Progress** bar under the Projects section header. It averages the `completionPercentage` of all projects (each capped at 100% via `Math.min`) using a Svelte `$derived` computation. When any individual project's progress changes, the reactive store triggers a recalculation, and the existing `ProgressBar` component's CSS transitions animate the update smoothly. A fallback message ("No projects to track") displays when no projects exist. The bar is hidden during the loading state.

---

## Summary of Design Complexities

| Aspect | Complexity |
|--------|-----------|
| **Offline-first architecture** | Full CRUD with IndexedDB, seamless online/offline transitions |
| **Intent-based outbox** | 4 operation types, aggressive coalescing (11 rules), cross-operation optimization |
| **Three-tier conflict resolution** | Field-level merging, device ID tiebreakers, audit trail |
| **Single-user auth mode** | Real Supabase email/password auth + PIN gate, email confirmation, device verification, email change, lock/unlock instead of sign-in/sign-out |
| **Realtime + polling hybrid** | WebSocket for instant sync, polling as fallback, deduplication |
| **Tombstone lifecycle** | Soft deletes, multi-device propagation, timed hard-delete cleanup |
| **Egress optimization** | Column selection, coalescing, realtime-first, cursor-based, validation caching |
| **PWA with dual caches** | Immutable asset persistence, versioned shell, background precaching |
| **Focus timer FSM** | Phase transitions, cross-device sync, 100ms precision ticks |
| **14-version schema evolution** | Data migrations, index additions, new tables without data loss |
| **Mutex-protected sync** | Promise-based lock with stale detection, operation timeouts |
| **Network state machine** | iOS PWA visibility handling, sequential reconnect callbacks |

> **Note:** Most of the sync, auth, conflict resolution, realtime, and network complexity listed above is now encapsulated in the `@stellar/sync-engine` package. See [stellar-engine/ARCHITECTURE.md](https://github.com/prabhask5/stellar-engine/blob/main/ARCHITECTURE.md) for detailed documentation of these subsystems.
