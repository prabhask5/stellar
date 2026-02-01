# Stellar: Backend Architecture & System Design

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Local Database (Dexie.js / IndexedDB)](#2-local-database-dexiejs--indexeddb)
3. [Supabase Backend](#3-supabase-backend)
4. [Authentication System](#4-authentication-system)
5. [Sync Engine](#5-sync-engine)
6. [Outbox Pattern & Operation Coalescing](#6-outbox-pattern--operation-coalescing)
7. [Conflict Resolution](#7-conflict-resolution)
8. [Realtime Subscriptions](#8-realtime-subscriptions)
9. [Tombstone System](#9-tombstone-system)
10. [Network State Machine](#10-network-state-machine)
11. [Focus Timer State Machine](#11-focus-timer-state-machine)
12. [PWA Architecture](#12-pwa-architecture)
13. [Egress Optimization](#13-egress-optimization)
14. [Data Flow Diagrams](#14-data-flow-diagrams)
15. [Debug & Observability](#15-debug--observability)

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
|  |  3 System Tables |    | create/set/inc/  |                    |
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
| Database Schema | `src/lib/db/schema.ts` | Dexie.js schema, 13 versions of migrations |
| Database Client | `src/lib/db/client.ts` | Singleton DB instance, UUID/timestamp helpers |
| Sync Engine | `src/lib/sync/engine.ts` | ~2200 lines: push/pull, hydration, tombstone cleanup |
| Sync Queue | `src/lib/sync/queue.ts` | Outbox queue, coalescing engine, retry logic |
| Sync Operations | `src/lib/sync/operations.ts` | Operation-to-mutation transforms |
| Sync Types | `src/lib/sync/types.ts` | Intent-based operation type system |
| Conflict Resolution | `src/lib/sync/conflicts.ts` | Three-tier field-level conflict resolver |
| Realtime | `src/lib/sync/realtime.ts` | WebSocket subscription manager |
| Device ID | `src/lib/sync/deviceId.ts` | Deterministic tiebreaker generation |
| Auth | `src/lib/supabase/auth.ts` | Supabase auth with offline credential caching |
| Offline Credentials | `src/lib/auth/offlineCredentials.ts` | IndexedDB credential cache |
| Offline Session | `src/lib/auth/offlineSession.ts` | Offline session token management |
| Auth State | `src/lib/stores/authState.ts` | Tri-modal auth state store |
| Network Store | `src/lib/stores/network.ts` | Online/offline detection with iOS PWA handling |
| Focus Utils | `src/lib/utils/focus.ts` | Timer calculations, phase transitions |
| Focus Store | `src/lib/stores/focus.ts` | Focus timer state machine |
| Debug | `src/lib/utils/debug.ts` | Conditional debug logging system |
| Runtime Config | `src/lib/config/runtimeConfig.ts` | Runtime Supabase config with localStorage cache |
| Service Worker | `static/sw.js` | PWA caching strategies |
| SQL Schema | `supabase-schema.sql` | Full PostgreSQL schema with RLS |

---

## 2. Local Database (Dexie.js / IndexedDB)

**File**: `src/lib/db/schema.ts`

Stellar uses **Dexie.js** as an ORM over the browser's IndexedDB. The database has evolved through **13 schema versions** with data migrations, demonstrating careful schema evolution without data loss.

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
| longTermTasks      | id, user_id, due_date, category_id, created_at,  |
|                    | updated_at                                       |
| focusSettings      | id, user_id, updated_at                          |
| focusSessions      | id, user_id, started_at, ended_at, status,       |
|                    | updated_at                                       |
| blockLists         | id, user_id, order, updated_at                   |
| blockedWebsites    | id, block_list_id, updated_at                    |
| projects           | id, user_id, is_current, order, created_at,      |
|                    | updated_at                                       |
+--------------------+--------------------------------------------------+
```

### 2.2 System Tables (3)

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

## 4. Authentication System

Stellar implements a **dual-mode authentication** system that maintains full functionality offline.

### 4.1 Architecture Diagram

```
+------------------------------------------------------------------+
|                     AUTH STATE MACHINE                            |
|                                                                  |
|   +-----------+     +-----------+     +-----------+              |
|   |   none    |---->| supabase  |---->|  offline  |              |
|   | (no auth) |     | (online)  |     | (cached)  |              |
|   +-----------+     +-----+-----+     +-----+-----+              |
|         ^                 |                 |                    |
|         |   +-------------+                 |                    |
|         |   | On login:                     |                    |
|         |   | 1. Supabase signIn()          |                    |
|         |   | 2. Cache credentials to       |                    |
|         |   |    IndexedDB                  |                    |
|         |   | 3. Set mode = 'supabase'      |                    |
|         |   +-------------------------------+                    |
|         |                                                        |
|         |   +-------------------------------+                    |
|         +---| On offline + cached creds:    |                    |
|             | 1. Verify email/password       |                    |
|             |    against IndexedDB cache     |                    |
|             | 2. Create offline session      |                    |
|             |    (random UUID token)         |                    |
|             | 3. Set mode = 'offline'        |                    |
|             +-------------------------------+                    |
+------------------------------------------------------------------+
```

### 4.2 Online Auth Flow

**File**: `src/lib/supabase/auth.ts`

```
User enters email/password
        |
        v
supabase.auth.signInWithPassword()
        |
        +---> SUCCESS:
        |       |
        |       v
        |     cacheOfflineCredentials(email, password, user, session)
        |       |  --> Stores to IndexedDB: offlineCredentials table
        |       |  --> Verifies write with read-back (paranoid check)
        |       v
        |     authState.setSupabaseAuth(session)
        |
        +---> FAILURE: Show error to user
```

### 4.3 Offline Auth Flow

**File**: `src/lib/auth/offlineCredentials.ts`, `src/lib/auth/offlineSession.ts`

```
User enters email/password (offline)
        |
        v
getOfflineCredentials() from IndexedDB
        |
        v
verifyOfflineCredentials(email, password, expectedUserId)
        |
        +---> Checks: userId match, email match, password match
        |
        +---> VALID:
        |       |
        |       v
        |     createOfflineSession(userId)
        |       |  --> Generates random UUID token
        |       |  --> Stores to IndexedDB: offlineSession table
        |       |  --> Read-back verification
        |       v
        |     authState.setOfflineAuth(profile)
        |
        +---> INVALID: { valid: false, reason: 'password_mismatch' }
```

### 4.4 Reconnection Security

When the device comes back online after offline usage:

1. The sync engine sets `authValidatedAfterReconnect = false` (`engine.ts` line 93)
2. **All sync operations are blocked** until auth is re-validated (`engine.ts` lines 1714-1721)
3. The auth layer re-authenticates with Supabase using the cached credentials
4. On success: `markAuthValidated()` is called, sync resumes
5. On failure: The pending sync queue is cleared via `clearPendingSyncQueue()` to prevent unauthorized data from reaching the server

### 4.5 Auth State Store

**File**: `src/lib/stores/authState.ts`

```typescript
interface AuthState {
  mode: AuthMode;                          // 'supabase' | 'offline' | 'none'
  session: Session | null;                 // Supabase JWT session
  offlineProfile: OfflineCredentials | null; // Cached credentials
  isLoading: boolean;                      // Initial auth check in progress
  authKickedMessage: string | null;        // Message when session expires
}
```

Derived stores:
- `isAuthenticated`: `mode !== 'none' && !isLoading`
- `userDisplayInfo`: Extracts firstName/lastName/email from whichever auth mode is active

---

## 5. Sync Engine

**File**: `src/lib/sync/engine.ts` (~2200 lines)

The sync engine is the heart of Stellar's multi-device synchronization. It implements a **push-then-pull architecture** with mutex locking, cursor-based incremental sync, egress monitoring, and tombstone cleanup.

### 5.1 Core Rules

```
Rule 1: All reads come from local DB (IndexedDB)
Rule 2: All writes go to local DB first, immediately
Rule 3: Every write creates a pending operation in the outbox
Rule 4: Sync loop ships outbox to server in background
Rule 5: On refresh, load local state instantly, then run background sync
```

### 5.2 Sync Lifecycle

```
  User Action (write)
        |
        v
  Repository Layer
        |
        +---> 1. Write to local IndexedDB (instant)
        |
        +---> 2. Queue intent-based operation to syncQueue
        |
        +---> 3. Mark entity as "recently modified" (2s TTL)
        |
        v
  scheduleSyncPush()  (2s debounce)
        |
        v
  runFullSync(quiet=false, skipPull=realtime_healthy)
        |
        +---> acquireSyncLock()  (mutex, 60s timeout)
        |
        +---> needsAuthValidation()?  --> block if yes
        |
        +---> getCurrentUserId()  (validates session)
        |
        v
  +------ PUSH PHASE ------+
  |                         |
  | coalescePendingOps()    |  <-- Reduces N operations to M (M << N)
  |         |               |
  | for each pending item:  |
  |   processSyncItem()     |  <-- Transforms intent to Supabase mutation
  |   removeSyncItem()      |  <-- Dequeue on success
  |   incrementRetry()      |  <-- Backoff on failure
  |                         |
  +----------|-------------+
             |
             v
  +------ PULL PHASE ------+
  | (skipped if realtime    |
  |  is healthy)            |
  |                         |
  | pullRemoteChanges()     |
  |   |                     |
  |   +-> 13 parallel       |
  |   |   SELECT queries    |
  |   |   WHERE updated_at  |
  |   |   > cursor          |
  |   |                     |
  |   +-> For each record:  |
  |       - Skip recently   |
  |         modified        |
  |       - Skip realtime-  |
  |         processed       |
  |       - Conflict        |
  |         resolution      |
  |       - Apply to local  |
  |                         |
  +----------|-------------+
             |
             v
  releaseSyncLock()
  notifySyncComplete()  --> All Svelte stores refresh from local
```

### 5.3 Mutex Lock Implementation

**File**: `src/lib/sync/engine.ts` (lines 350-392)

The sync engine uses a **promise-based async mutex** with stale lock detection:

```
acquireSyncLock()
  |
  +---> lockPromise !== null?
  |       |
  |       YES --> Is lock stale (held > 60s)?
  |       |         |
  |       |         YES --> Force release, acquire
  |       |         NO  --> Return false (skip this sync)
  |       |
  |       NO --> Create new lock promise, record timestamp
  |
  +---> return true
```

This prevents concurrent sync cycles from corrupting state while also handling deadlocks from crashed syncs.

### 5.4 Cursor-Based Incremental Sync

```
localStorage: lastSyncCursor_{userId} = "2024-01-15T10:30:00.000Z"
                                              |
                                              v
    SELECT * FROM goal_lists WHERE updated_at > '2024-01-15T10:30:00.000Z'
    SELECT * FROM goals WHERE updated_at > '2024-01-15T10:30:00.000Z'
    ... (all 13 tables in parallel)
                                              |
                                              v
    Track max(updated_at) across all results
                                              |
                                              v
    localStorage: lastSyncCursor_{userId} = "2024-01-15T10:35:22.000Z"
```

Key design decisions:
- **Per-user cursors** prevent cross-user sync contamination after logout/login
- **13 parallel queries** reduce wall-clock time per sync cycle
- **30-second timeout** with `withTimeout()` wrapper prevents hanging syncs
- **Column-level SELECT** (explicit columns per table) instead of `SELECT *` to minimize egress

### 5.5 Watchdog & Resilience

```
Watchdog (every 15s):
  |
  +---> Is sync lock held > 45s?
  |       YES --> Force release (stuck sync detected)
  |
  +---> Clean up recently modified entity tracking
  +---> Clean up realtime tracking
```

### 5.6 Session Validation & Caching

To avoid a network call (`getUser()`) every sync cycle, the engine caches successful auth validation for 1 hour:

```
getCurrentUserId()
  |
  +---> getSession()  (local, no network)
  |
  +---> Is session expired?
  |       YES --> refreshSession() (network)
  |
  +---> Is cached validation < 1 hour old AND same userId?
  |       YES --> return userId (no network call!)
  |       NO  --> getUser() (network call to validate token)
  |
  +---> Cache result for next hour
```

This optimization alone saves **~720 Supabase auth API calls per day** for an active user.

---

## 6. Outbox Pattern & Operation Coalescing

### 6.1 Intent-Based Operations

**File**: `src/lib/sync/types.ts`

Instead of recording final state, Stellar records the **user's intent**:

```typescript
type OperationType = 'increment' | 'set' | 'create' | 'delete';

interface SyncOperationItem {
  id?: number;              // Auto-increment queue ID
  table: SyncEntityType;    // Target table (13 possible values)
  entityId: string;         // UUID of affected entity
  operationType: OperationType;
  field?: string;           // For field-level operations
  value?: unknown;          // Delta (increment), new value (set), or payload (create)
  timestamp: string;        // ISO timestamp for backoff calculation
  retries: number;          // Failed attempt count (max 5)
}
```

**Why intent-based?** Consider a user rapidly clicking "+1" on a counter 50 times:

```
Without intent-preservation:
  50 x SET current_value = N  --> 50 Supabase UPDATE requests

With intent-preservation:
  50 x INCREMENT +1           --> Coalesced to 1 x INCREMENT +50
                              --> 1 Supabase UPDATE request
```

### 6.2 Coalescing Engine

**File**: `src/lib/sync/queue.ts` (lines 36-338)

The coalescing engine runs as a **single-pass, in-memory algorithm** before every push. It processes operations grouped by entity:

```
INPUT: Queue with N operations
  |
  v
Step 1: Group by entity (table:entityId)
  |
  v
Step 2: For each entity group, apply cross-operation rules:
  |
  +---> CREATE + DELETE = cancel both (entity never needs to exist)
  +---> UPDATE(s) + DELETE = keep only DELETE
  +---> CREATE + UPDATE(s) = merge updates into CREATE payload
  +---> CREATE + SET(s) = merge sets into CREATE payload
  +---> INCREMENT(s) + SET (same field) = drop increments
  +---> SET + INCREMENT(s) (same field) = combine into final SET
  |
  v
Step 3: Coalesce same-type operations:
  |
  +---> Multiple INCREMENTs (same field) = sum deltas
  +---> Multiple SETs (same entity) = merge into single SET
  |
  v
Step 4: Remove no-ops:
  |
  +---> Zero-delta increments (INCREMENT +0)
  +---> Empty SETs or timestamp-only SETs
  |
  v
Step 5: Batch apply (bulkDelete + transaction updates)
  |
  v
OUTPUT: Queue with M operations (M << N)
```

### 6.3 Retry & Backoff

**File**: `src/lib/sync/queue.ts` (lines 340-354)

```
Retry #0: Immediate
Retry #1: 1 second backoff
Retry #2: 2 second backoff
Retry #3: 4 second backoff
Retry #4: 8 second backoff
Retry #5: PERMANENTLY FAILED --> item removed from queue
```

Errors are classified as **transient** (network, timeout, rate-limit, 5xx) or **persistent** (auth, validation, RLS). Transient errors suppress UI error indicators until retry #3.

---

## 7. Conflict Resolution

**File**: `src/lib/sync/conflicts.ts`

Stellar implements a **three-tier, field-level conflict resolution** system.

### 7.1 Three-Tier Resolution Diagram

```
Remote change arrives for entity X
  |
  v
Does entity X exist locally?
  |
  NO --> Accept remote entirely (Tier 0: no conflict)
  |
  YES --> Does local have pending operations for X?
            |
            NO --> Is remote.updated_at > local.updated_at?
            |       |
            |       YES --> Accept remote (Tier 0: no conflict)
            |       NO  --> Keep local (remote is stale)
            |
            YES --> CONFLICT DETECTED: Enter field-level resolution
                      |
                      v
                For each field in union(local_fields, remote_fields):
                      |
                      +---> Field in EXCLUDED_FIELDS (id, user_id, etc)?
                      |       YES --> Skip
                      |
                      +---> Values are equal?
                      |       YES --> Skip (Tier 1: auto-merge, non-overlapping)
                      |
                      +---> Field has pending local operations?
                      |       YES --> LOCAL WINS (Tier 2: local_pending strategy)
                      |
                      +---> Field is numeric merge candidate?
                      |       YES --> Last-write-wins with tiebreaker
                      |
                      +---> DEFAULT: Last-write-wins (Tier 3)
                              |
                              +---> Compare timestamps
                              |       |
                              |       local > remote --> LOCAL WINS
                              |       remote > local --> REMOTE WINS
                              |       EQUAL --> Device ID tiebreaker
                              |                   |
                              |                   lower deviceId WINS
                              |                   (deterministic across
                              |                    all devices)
                              v
                      Store FieldConflictResolution
```

### 7.2 Resolution Strategies

| Strategy | When Applied | Behavior |
|----------|-------------|----------|
| `local_pending` | Field has queued operations | Local value preserved unconditionally |
| `delete_wins` | Remote has `deleted=true` | Delete always wins over edits (prevents resurrection) |
| `numeric_merge` | Fields like `current_value`, `elapsed_duration` | Falls back to last-write-wins (true merge would require operation inbox) |
| `last_write` | All other fields | Most recent timestamp wins; device_id breaks ties |

### 7.3 Device ID Tiebreaker

**File**: `src/lib/sync/deviceId.ts`

When two devices modify the same field at the exact same millisecond:

```typescript
// Lower deviceId wins (arbitrary but CONSISTENT across all devices)
if (localDeviceId < remoteDeviceId) {
  winner = 'local';
} else {
  winner = 'remote';
}
```

Device IDs are **UUID v4** values stored in `localStorage` under `stellar_device_id`. They persist across sessions but are unique per browser/device. The lexicographic ordering of UUIDs provides a deterministic, consistent tiebreaker that produces the same result regardless of which device processes the conflict first.

### 7.4 Conflict History

Every resolved conflict is logged to the `conflictHistory` table:

```typescript
interface ConflictHistoryEntry {
  entityId: string;
  entityType: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  resolvedValue: unknown;
  winner: 'local' | 'remote' | 'merged';
  strategy: 'last_write' | 'numeric_merge' | 'delete_wins' | 'local_pending';
  timestamp: string;
}
```

History is auto-cleaned after 30 days (`cleanupConflictHistory()` in `conflicts.ts` line 381).

---

## 8. Realtime Subscriptions

**File**: `src/lib/sync/realtime.ts`

### 8.1 Architecture

```
+------------------------------------------------------------------+
|  REALTIME SUBSCRIPTION MANAGER                                   |
|                                                                  |
|  State Machine:                                                  |
|  disconnected --> connecting --> connected                        |
|       ^              |              |                             |
|       |              v              v                             |
|       +---------  error  <----------+                             |
|       |              |                                            |
|       |              v                                            |
|       +-- reconnect (exponential backoff, max 5 attempts)        |
|                                                                  |
|  Channel: stellar_sync_{userId}                                  |
|  Events: postgres_changes (INSERT, UPDATE, DELETE)               |
|  Tables: 13 entity tables                                        |
|  Security: RLS policies handle filtering (no user_id filter)     |
+------------------------------------------------------------------+
```

### 8.2 Consolidated Channel Pattern

Instead of 13 separate channels (one per table), Stellar uses a **single channel** with 13 event subscriptions:

```typescript
const channelName = `stellar_sync_${userId}`;
state.channel = supabase.channel(channelName);

for (const table of REALTIME_TABLES) {
  state.channel = state.channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table },
    (payload) => handleRealtimeChange(table, payload)
  );
}
```

This reduces WebSocket overhead from 13 connections to 1.

### 8.3 Echo Suppression

When device A pushes a change, Supabase broadcasts it to all subscribers including device A. The realtime handler **skips changes from its own device**:

```typescript
function isOwnDeviceChange(record: Record<string, unknown>): boolean {
  return record.device_id === state.deviceId;
}
```

### 8.4 Deduplication with Polling

Realtime and polling can both deliver the same change. A **recently processed tracking map** with 2-second TTL prevents duplicate processing:

```
Change arrives via Realtime
  --> Process it
  --> Mark entityId in recentlyProcessedByRealtime map

Later, same change arrives via polling
  --> Check wasRecentlyProcessedByRealtime(entityId)
  --> TRUE --> Skip (already applied)
```

### 8.5 Reconnection Strategy

```
Connection lost
  |
  v
Is device offline?
  YES --> pauseRealtime(), wait for 'online' event
  NO  --> scheduleReconnect()
            |
            v
          Attempt 1: 1s delay
          Attempt 2: 2s delay
          Attempt 3: 4s delay
          Attempt 4: 8s delay
          Attempt 5: 16s delay
          MAX REACHED --> Fall back to polling-only mode
```

The `reconnectScheduled` flag prevents duplicate reconnect attempts when both `CHANNEL_ERROR` and `CLOSED` events fire in sequence.

---

## 9. Tombstone System

**File**: `src/lib/sync/engine.ts` (lines 2226-2368)

Stellar uses **soft deletes** with a `deleted` boolean flag instead of hard deletes. This enables multi-device sync (all devices must learn about deletions) while preventing data resurrection.

### 9.1 Soft Delete Flow

```
User deletes item on Device A
  |
  v
Local: item.deleted = true, item.updated_at = now()
  |
  v
Queue: { operationType: 'delete', entityId: ... }
  |
  v
Push to Supabase: UPDATE SET deleted=true, updated_at=now()
  |
  v
Realtime broadcasts UPDATE to Device B
  |
  v
Device B receives soft delete:
  1. Detect isSoftDelete (deleted=true, was false locally)
  2. Play delete animation BEFORE writing to DB
  3. Write soft-deleted record to local DB
  4. UI reactively removes item from display
```

### 9.2 Tombstone Cleanup

```
+------------------------------------------------------------------+
|  TOMBSTONE LIFECYCLE                                             |
|                                                                  |
|  Day 0: Item soft-deleted (deleted=true)                         |
|          - All devices eventually sync the tombstone             |
|          - UI filters out deleted items                          |
|                                                                  |
|  Day 1+: Local cleanup runs                                     |
|          - cleanupLocalTombstones()                              |
|          - Removes records where deleted=true AND                |
|            updated_at < (now - 1 day)                            |
|          - Runs across all 13 entity tables                      |
|                                                                  |
|  Daily: Server cleanup runs (max once per 24 hours)              |
|          - cleanupServerTombstones()                             |
|          - HARD DELETES from PostgreSQL:                         |
|            DELETE FROM table                                     |
|            WHERE deleted=true AND updated_at < cutoff            |
|          - Iterates all 13 tables                                |
|          - lastServerCleanup timestamp prevents re-running       |
+------------------------------------------------------------------+
```

Configuration constants:
- `TOMBSTONE_MAX_AGE_DAYS = 1` (local cleanup after 1 day)
- `CLEANUP_INTERVAL_MS = 86400000` (server cleanup max once per 24 hours)

### 9.3 Delete-Wins Guarantee

When a conflict involves a deleted entity:

```
Remote says: deleted = true
Local has: pending edits (but no pending delete)
  --> Remote delete WINS (prevents resurrection)
  --> "delete_wins" strategy applied

Local says: pending delete operation
Remote has: edits (but not deleted)
  --> Local delete WINS (local_pending strategy)
  --> Entity stays deleted
```

This is a deliberate design choice: **deletes are irreversible in conflict scenarios** to prevent confusing "ghost" resurrections.

---

## 10. Network State Machine

**File**: `src/lib/stores/network.ts`

### 10.1 State Diagram

```
+----------+     'offline' event     +-----------+
|  ONLINE  |------------------------->|  OFFLINE  |
|          |                          |           |
|  - Sync  |     'online' event      | - Local   |
|    active |<-------------------------  only     |
|  - RT    |     + 500ms delay        | - Queue   |
|    alive |                          |   ops     |
+----+-----+                          +-----+-----+
     |                                      |
     | visibilitychange                     |
     | (document.hidden)                    |
     v                                      |
+----------+                                |
| HIDDEN   |   visibilitychange (visible)   |
| (iOS PWA)|   + check navigator.onLine     |
|          |--------------------------------+
| - Assume |   If online + wasOffline:
|   might  |     trigger reconnect callbacks
|   lose   |
|   conn.  |
+----------+
```

### 10.2 iOS PWA Special Handling

iOS Safari does not reliably fire `online`/`offline` events in PWA standalone mode. The network store listens for `visibilitychange` events as a fallback:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const nowOnline = navigator.onLine;
    setIfChanged(nowOnline);
    if (nowOnline && wasOffline) {
      wasOffline = false;
      setTimeout(() => {
        runCallbacksSequentially(reconnectCallbacks, 'Reconnect');
      }, 500);
    }
  }
});
```

### 10.3 Sequential Callback Execution

Reconnect callbacks are executed **sequentially with async/await**, not concurrently. This ensures auth validation completes before sync is triggered:

```
Online event fires
  |
  v
500ms stabilization delay
  |
  v
Callback 1: Validate auth credentials    (async, awaited)
  |
  v
Callback 2: Start realtime subscriptions (async, awaited)
  |
  v
Callback 3: Run full sync                (async, awaited)
```

---

## 11. Focus Timer State Machine

**Files**: `src/lib/utils/focus.ts`, `src/lib/stores/focus.ts`

### 11.1 State Diagram

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

### 11.2 Phase Transitions

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

### 11.3 Timer Precision

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

### 11.4 Cross-Device Sync

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

## 12. PWA Architecture

**File**: `static/sw.js`

### 12.1 Cache Strategy Overview

```
+------------------------------------------------------------------+
|  SERVICE WORKER CACHING STRATEGIES                               |
|                                                                  |
|  +----------------------------+                                  |
|  | NAVIGATION (HTML pages)    |                                  |
|  | Strategy: Network-First    |                                  |
|  | Timeout: 3 seconds         |                                  |
|  | Fallback: Cached '/' page  |                                  |
|  | Last resort: Inline HTML   |                                  |
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

### 12.2 Dual-Cache Architecture

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

### 12.3 Background Precaching

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

### 12.4 Update Flow

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

## 13. Egress Optimization

Stellar is designed to minimize Supabase bandwidth (egress) consumption. Here is a summary of every optimization:

### 13.1 Column Selection

**File**: `src/lib/sync/engine.ts` (lines 267-291)

Instead of `SELECT *`, every query explicitly lists columns:

```typescript
const COLUMNS = {
  goal_lists: 'id,user_id,name,project_id,created_at,updated_at,deleted,_version,device_id',
  goals: 'id,goal_list_id,name,type,target_value,current_value,completed,order,...',
  // ... all 13 tables
};
```

This prevents downloading columns that may be added to PostgreSQL but not needed client-side.

### 13.2 Queue Coalescing

50 rapid increments become 1 UPDATE request. A create-then-delete sequence becomes 0 requests. This is the single largest egress reduction.

### 13.3 Realtime-First Strategy

```typescript
// engine.ts line 776
const skipPull = isRealtimeHealthy();
if (skipPull) {
  debugLog('[SYNC] Realtime healthy - push-only mode (skipping pull)');
}
```

When the WebSocket connection is healthy, user-triggered syncs **skip the pull phase entirely**. Changes from other devices arrive via realtime instead of polling 13 tables.

### 13.4 Cursor-Based Incremental Pull

Only records modified since the last sync are fetched:
```sql
SELECT ... FROM table WHERE updated_at > :cursor
```

### 13.5 Visibility-Based Sync Throttling

```
Tab hidden for < 5 minutes --> No sync on return
Tab hidden for > 5 minutes --> Sync on return (data may be stale)
```

Constants:
- `VISIBILITY_SYNC_MIN_AWAY_MS = 300000` (5 minutes)
- `SYNC_INTERVAL_MS = 900000` (15-minute periodic sync)

### 13.6 User Validation Caching

`getUser()` API call cached for 1 hour:
- `USER_VALIDATION_INTERVAL_MS = 3600000`
- Saves ~720 API calls/day for active user

### 13.7 Online Reconnect Cooldown

```
ONLINE_RECONNECT_COOLDOWN_MS = 120000  // 2 minutes
```

If a sync completed less than 2 minutes before coming back online, the reconnect sync is skipped.

### 13.8 Egress Tracking

The engine tracks bytes transferred per table and per sync cycle:

```typescript
interface EgressStats {
  totalBytes: number;
  totalRecords: number;
  byTable: Record<string, { bytes: number; records: number }>;
  sessionStart: string;
}
```

Accessible via `window.__stellarEgress()` in debug mode.

---

## 14. Data Flow Diagrams

### 14.1 Creating a Task

```
User types "Buy groceries" and hits Enter
  |
  v
Svelte Component: createDailyTask("Buy groceries")
  |
  v
Repository: db.transaction('rw', [db.dailyTasks, db.syncQueue], async () => {
  |
  +---> 1. Generate UUID: crypto.randomUUID()
  |
  +---> 2. Write to IndexedDB:
  |        db.dailyTasks.add({
  |          id: uuid, name: "Buy groceries",
  |          order: 0, completed: false,
  |          user_id, created_at, updated_at,
  |          deleted: false, _version: 1, device_id
  |        })
  |
  +---> 3. Queue sync operation:
  |        db.syncQueue.add({
  |          table: 'daily_tasks',
  |          entityId: uuid,
  |          operationType: 'create',
  |          value: { ...full payload },
  |          timestamp: now, retries: 0
  |        })
  |
  +---> 4. markEntityModified(uuid)  // 2s protection
  })
  |
  v
UI updates INSTANTLY (reads from local IndexedDB)
  |
  v
scheduleSyncPush()  (2s debounce timer starts)
  |
  v  (2 seconds later)
runFullSync()
  |
  +---> coalescePendingOps()  // No-op for single create
  |
  +---> processSyncItem(): INSERT INTO daily_tasks ...
  |       +---> Supabase returns { id: uuid }
  |       +---> removeSyncItem()
  |
  +---> pullRemoteChanges() or skip (if realtime healthy)
  |
  v
Supabase broadcasts INSERT to other devices via Realtime
```

### 14.2 Editing Across Devices

```
Device A (phone):                    Device B (laptop):
  |                                    |
  v                                    |
Edit task name to                      |
"Buy organic groceries"               |
  |                                    |
  v                                    |
Local write + queue SET op             |
  |                                    |
  v                                    |
Push to Supabase:                      |
UPDATE daily_tasks                     |
SET name='Buy organic groceries',      |
    device_id='device-A-uuid',         |
    updated_at=now()                   |
WHERE id='task-uuid'                   |
  |                                    |
  +-- Realtime broadcast ------------->|
                                       v
                          handleRealtimeChange()
                                       |
                                       v
                          isOwnDeviceChange? NO
                          wasRecentlyProcessed? NO
                                       |
                                       v
                          localEntity exists? YES
                          hasPendingOps? NO
                          remote.updated_at > local? YES
                                       |
                                       v
                          db.dailyTasks.put(newRecord)
                                       |
                                       v
                          notifyDataUpdate('daily_tasks', id)
                                       |
                                       v
                          Svelte store refreshes from local
                          UI shows "Buy organic groceries"
```

### 14.3 Handling Conflicts

```
Device A (offline):                  Device B (online):
  |                                    |
  v                                    v
Edit name to "Alpha"                 Edit name to "Beta"
Edit order to 3                      (no order change)
  |                                    |
  v                                    v
Queue: SET name="Alpha"              Push immediately:
Queue: SET order=3                   name="Beta" pushed to server
  |                                    |
  v (comes online)                     |
runFullSync()                          |
  |                                    |
  +---> PUSH: SET name="Alpha", SET order=3
  |       (coalesced into single SET)
  |
  +---> PULL: Gets record with name="Beta" from server
  |       (server has Beta because B pushed first)
  |
  +---> CONFLICT: Entity has pending ops (name, order)
  |
  +---> resolveConflicts():
  |
  |     Field "name":
  |       - Has pending local op? YES
  |       - Strategy: local_pending
  |       - Winner: LOCAL ("Alpha")
  |
  |     Field "order":
  |       - Has pending local op? YES
  |       - Strategy: local_pending
  |       - Winner: LOCAL (3)
  |
  |     Other fields (completed, etc):
  |       - No pending ops, values equal
  |       - Auto-merged (Tier 1)
  |
  +---> Merged entity: { name: "Alpha", order: 3, ... }
  |
  +---> storeConflictHistory() for audit
  |
  +---> PUSH again: name="Alpha" overwrites "Beta" on server
```

### 14.4 Offline-to-Online Transition

```
OFFLINE STATE                          ONLINE TRANSITION
+------------------+                   +---------------------------+
| User has been    |  'online' event   | 1. Network store fires    |
| working offline  |------------------>|    reconnect callbacks     |
| for 2 hours      |                   |    (sequential, awaited)  |
|                  |                   |                           |
| Local changes:   |                   | 2. AUTH VALIDATION:       |
| - Created 3 items|                   |    - getSession()         |
| - Edited 5 items |                   |    - Verify with Supabase |
| - Deleted 1 item |                   |    - markAuthValidated()  |
|                  |                   |    OR clearPendingQueue() |
| Sync queue:      |                   |                           |
| 12 operations    |                   | 3. START REALTIME:        |
| pending          |                   |    - Open WebSocket       |
+------------------+                   |    - Subscribe 13 tables  |
                                       |                           |
                                       | 4. RUN FULL SYNC:         |
                                       |    a. coalescePendingOps() |
                                       |       12 ops -> 6 ops     |
                                       |                           |
                                       |    b. PUSH 6 operations   |
                                       |       to Supabase         |
                                       |                           |
                                       |    c. PULL all changes    |
                                       |       since last cursor   |
                                       |       (2 hours of data    |
                                       |        from other devices)|
                                       |                           |
                                       |    d. Conflict resolution |
                                       |       for any overlapping |
                                       |       edits               |
                                       |                           |
                                       | 5. notifySyncComplete()   |
                                       |    All stores refresh     |
                                       +---------------------------+
```

---

## 15. Debug & Observability

### 15.1 Debug Mode

**File**: `src/lib/utils/debug.ts`

Debug mode is toggled via `localStorage`:

```javascript
localStorage.setItem('stellar_debug_mode', 'true');
```

When enabled, all `debugLog()`, `debugWarn()`, and `debugError()` calls produce console output. When disabled, they are no-ops (zero overhead).

### 15.2 Console Debug Functions

Available in debug mode via the browser console:

| Function | Purpose |
|----------|---------|
| `window.__stellarSyncStats()` | Total sync cycles, last-minute cycle count, last 10 cycle details |
| `window.__stellarEgress()` | Total bandwidth consumed, per-table breakdown with percentages, recent cycle sizes |
| `window.__stellarTombstones()` | Count of tombstones per table (local + server) |
| `window.__stellarTombstones({ cleanup: true, force: true })` | Manually trigger tombstone cleanup |

### 15.3 Logging Prefixes

All log messages use structured prefixes for filtering:

| Prefix | Source | Examples |
|--------|--------|---------|
| `[SYNC]` | Sync engine | Push/pull operations, cursor updates, lock management |
| `[Realtime]` | WebSocket manager | Connection state, incoming changes, echo suppression |
| `[Conflict]` | Conflict resolver | Field resolutions, history storage |
| `[Tombstone]` | Cleanup system | Local/server cleanup counts |
| `[Auth]` | Auth layer | Login, credential caching, session validation |
| `[Network]` | Network store | Callback execution errors |

### 15.4 Sync Status Store

The sync engine maintains a reactive store that drives the UI sync indicator:

```typescript
interface SyncStatus {
  status: 'idle' | 'syncing' | 'error' | 'offline';
  pendingCount: number;
  lastSyncTime: string | null;
  syncMessage: string;
  error: { title: string; details: string } | null;
  syncErrors: SyncError[];  // Recent push failures with timestamps
}
```

### 15.5 Egress Monitoring Output Example

```
=== STELLAR EGRESS STATS ===
Session started: 2024-01-15T08:00:00.000Z
Total egress: 45.23 KB (312 records)

--- BY TABLE ---
  daily_goal_progress: 18.50 KB (180 records, 40.9%)
  goals: 8.20 KB (45 records, 18.1%)
  daily_routine_goals: 6.30 KB (30 records, 13.9%)
  focus_sessions: 4.10 KB (12 records, 9.1%)
  ...

--- RECENT SYNC CYCLES ---
  2024-01-15T10:30:00Z: 2.45 KB (18 records)
  2024-01-15T10:35:00Z: 0 B (0 records)  [push-only, realtime healthy]
  2024-01-15T10:40:00Z: 1.20 KB (8 records)
```

---

## Summary of Design Complexities

| Aspect | Complexity |
|--------|-----------|
| **Offline-first architecture** | Full CRUD with IndexedDB, seamless online/offline transitions |
| **Intent-based outbox** | 4 operation types, aggressive coalescing (11 rules), cross-operation optimization |
| **Three-tier conflict resolution** | Field-level merging, device ID tiebreakers, audit trail |
| **Dual-mode authentication** | Supabase + offline credential cache, reconnection security |
| **Realtime + polling hybrid** | WebSocket for instant sync, polling as fallback, deduplication |
| **Tombstone lifecycle** | Soft deletes, multi-device propagation, timed hard-delete cleanup |
| **Egress optimization** | Column selection, coalescing, realtime-first, cursor-based, validation caching |
| **PWA with dual caches** | Immutable asset persistence, versioned shell, background precaching |
| **Focus timer FSM** | Phase transitions, cross-device sync, 100ms precision ticks |
| **13-version schema evolution** | Data migrations, index additions, new tables without data loss |
| **Mutex-protected sync** | Promise-based lock with stale detection, operation timeouts |
| **Network state machine** | iOS PWA visibility handling, sequential reconnect callbacks |
