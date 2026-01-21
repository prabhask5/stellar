# Stellar Architecture

This document provides a complete technical reference for the Stellar codebase, covering every significant file, module, and function.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Data Flow](#data-flow)
3. [Database Layer](#database-layer)
4. [Sync Engine](#sync-engine)
5. [Repositories](#repositories)
6. [Stores (State Management)](#stores-state-management)
7. [Authentication](#authentication)
8. [Focus Timer System](#focus-timer-system)
9. [Routes & Pages](#routes--pages)
10. [Components](#components)
11. [Utilities](#utilities)
12. [Service Worker (PWA)](#service-worker-pwa)
13. [Supabase Integration](#supabase-integration)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Browser                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │   Routes    │───▶│   Stores    │───▶│     Repositories        │  │
│  │  (Pages)    │◀───│   (State)   │◀───│   (Data Access)         │  │
│  └─────────────┘    └─────────────┘    └───────────┬─────────────┘  │
│         │                 │                        │                │
│         ▼                 ▼                        ▼                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │ Components  │    │ Sync Engine │───▶│   IndexedDB (Dexie)     │  │
│  └─────────────┘    └──────┬──────┘    └─────────────────────────┘  │
│                            │                                        │
├────────────────────────────┼────────────────────────────────────────┤
│  Service Worker            │            Network                     │
│  (Cache, Offline)          ▼                                        │
│                     ┌─────────────┐                                 │
│                     │  Supabase   │                                 │
│                     │ (PostgreSQL)│                                 │
│                     └─────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Local-First**: All reads come from IndexedDB. UI never waits for network.
2. **Optimistic Updates**: Writes update local state immediately, then sync.
3. **Outbox Pattern**: Every write creates a sync queue entry for background push.
4. **Last-Write-Wins**: Conflict resolution uses `updated_at` timestamps with entity protection.

---

## Data Flow

### Read Path
```
User Action → Store.load() → Sync Engine.getX() → Dexie Query → IndexedDB → UI Update
```

### Write Path
```
User Action → Store.create() → Repository.create() → Dexie Transaction [
  1. Write to entity table
  2. Add to syncQueue
] → Schedule Sync Push → Return immediately
```

### Sync Path
```
Background Timer → acquireSyncLock() → [
  1. pushLocalChanges() - Ship outbox to Supabase
  2. pullRemoteChanges() - Fetch updates, merge to local
] → releaseSyncLock() → Notify stores to refresh
```

---

## Database Layer

### `src/lib/db/schema.ts`
Defines the Dexie database schema with migration versions.

**Class: `GoalPlannerDB`**
- Extends `Dexie`
- 15 tables with indexed fields
- 7 schema versions with upgrade paths

**Tables:**
| Table | Primary Key | Indexes |
|-------|-------------|---------|
| `goalLists` | `id` | `user_id`, `created_at`, `updated_at` |
| `goals` | `id` | `goal_list_id`, `order`, `created_at`, `updated_at` |
| `dailyRoutineGoals` | `id` | `user_id`, `order`, `start_date`, `end_date`, `created_at`, `updated_at` |
| `dailyGoalProgress` | `id` | `daily_routine_goal_id`, `date`, `[daily_routine_goal_id+date]`, `updated_at` |
| `syncQueue` | `++id` (auto) | `table`, `entityId`, `timestamp` |
| `taskCategories` | `id` | `user_id`, `order`, `created_at`, `updated_at` |
| `commitments` | `id` | `user_id`, `section`, `order`, `created_at`, `updated_at` |
| `dailyTasks` | `id` | `user_id`, `order`, `created_at`, `updated_at` |
| `longTermTasks` | `id` | `user_id`, `due_date`, `category_id`, `created_at`, `updated_at` |
| `offlineCredentials` | `id` | - (singleton) |
| `offlineSession` | `id` | - (singleton) |
| `focusSettings` | `id` | `user_id`, `updated_at` |
| `focusSessions` | `id` | `user_id`, `started_at`, `ended_at`, `status`, `updated_at` |
| `blockLists` | `id` | `user_id`, `order`, `updated_at` |
| `blockedWebsites` | `id` | `block_list_id`, `updated_at` |

### `src/lib/db/client.ts`
Database singleton and utility functions.

**Exports:**
- `db`: Dexie database instance
- `generateId()`: Creates UUID v4 for new entities
- `now()`: Returns ISO timestamp for consistency

---

## Sync Engine

### `src/lib/sync/engine.ts`
Core synchronization orchestration. ~700 lines of carefully designed sync logic.

**Key Constants:**
```typescript
SYNC_DEBOUNCE_MS = 2000        // Debounce after writes
SYNC_INTERVAL_MS = 300000      // 5 minute periodic sync
VISIBILITY_SYNC_DEBOUNCE_MS = 1000
RECENTLY_MODIFIED_TTL_MS = 5000 // Entity protection window
```

**Functions:**

#### `initSync(userId: string): Promise<void>`
Initializes sync system for a user.
- Starts periodic sync interval
- Sets up visibility change listeners
- Registers online/offline handlers
- Performs initial pull

#### `stopSync(): void`
Cleans up sync resources.
- Clears intervals and timeouts
- Removes event listeners
- Resets state variables

#### `scheduleSyncPush(): void`
Schedules a debounced push after local writes.
- Clears existing timeout
- Sets new timeout for `SYNC_DEBOUNCE_MS`
- Called by repositories after writes

#### `runSyncCycle(): Promise<void>`
Main sync orchestration.
```typescript
async function runSyncCycle(): Promise<void> {
  const acquired = await acquireSyncLock();
  if (!acquired) return; // Another sync in progress

  try {
    syncStatusStore.set('syncing');
    await pushLocalChanges();
    await pullRemoteChanges();
    syncStatusStore.set('idle');
    notifySyncComplete();
  } catch (error) {
    syncStatusStore.set('error');
  } finally {
    releaseSyncLock();
  }
}
```

#### `pushLocalChanges(): Promise<void>`
Ships outbox queue to Supabase.
- Gets pending items from sync queue
- Groups by table for batch operations
- Handles create/update/delete operations
- Removes successful items from queue
- Increments retry count on failure

#### `pullRemoteChanges(): Promise<void>`
The most complex function in the codebase. Fetches and merges remote changes.

**Steps:**
1. Get current user ID and last sync cursor
2. Get pending entity IDs (to skip protected entities)
3. Execute 12 parallel Supabase queries for all tables
4. Wrap all inserts in single Dexie transaction
5. For each remote entity:
   - Skip if `pendingEntityIds.has(id)` (has unsynced local changes)
   - Skip if `isRecentlyModified(id)` (modified in last 5 seconds)
   - Compare `updated_at` timestamps
   - Accept remote if newer than local
6. Update last sync cursor

#### `markEntityModified(entityId: string): void`
Marks an entity as recently modified to prevent pull overwrite.
- Stores entity ID with current timestamp
- Called by repositories after local writes

#### `onSyncComplete(callback: () => void): () => void`
Registers callback for sync completion events.
- Returns unsubscribe function
- Used by stores to refresh after sync

**Conflict Resolution:**
```
Remote Change Arrives
        │
        ▼
┌───────────────────┐
│ Entity in pending │──Yes──▶ Skip (local wins)
│     queue?        │
└───────┬───────────┘
        │ No
        ▼
┌───────────────────┐
│ Recently modified │──Yes──▶ Skip (local wins)
│   (< 5 seconds)?  │
└───────┬───────────┘
        │ No
        ▼
┌───────────────────┐
│ Remote newer than │──No───▶ Skip (local wins)
│      local?       │
└───────┬───────────┘
        │ Yes
        ▼
    Accept Remote
```

### `src/lib/sync/queue.ts`
Outbox queue management.

**Constants:**
```typescript
MAX_SYNC_RETRIES = 5
MAX_QUEUE_SIZE = 1000
```

**Functions:**

#### `getPendingSync(): Promise<SyncQueueItem[]>`
Returns items ready to sync (backoff passed, under retry limit).

#### `queueSyncDirect(table, operation, entityId, payload): Promise<void>`
Adds item to sync queue. Called within Dexie transactions for atomicity.

#### `removeSyncItem(id: number): Promise<void>`
Removes successfully synced item.

#### `incrementRetry(id: number): Promise<void>`
Increases retry count and updates timestamp for backoff.

#### `getPendingEntityIds(): Promise<Set<string>>`
Returns entity IDs with pending sync operations.

#### `cleanupFailedItems(): Promise<{ count, tables }>`
Removes items exceeding `MAX_SYNC_RETRIES`.

**Exponential Backoff:**
```typescript
function shouldRetryItem(item: SyncQueueItem): boolean {
  if (item.retries >= MAX_SYNC_RETRIES) return false;
  const backoffMs = Math.pow(2, item.retries) * 1000; // 1s, 2s, 4s, 8s, 16s
  const elapsed = Date.now() - new Date(item.timestamp).getTime();
  return elapsed >= backoffMs;
}
```

---

## Repositories

Each repository handles CRUD operations for a specific entity type. All follow the same pattern:

1. Wrap local write + sync queue entry in Dexie transaction
2. Call `scheduleSyncPush()` after successful write
3. Return updated entity

### `src/lib/db/repositories/goalLists.ts`

| Function | Description |
|----------|-------------|
| `getGoalLists(userId)` | Get all non-deleted lists for user |
| `getGoalList(id)` | Get single list by ID |
| `createGoalList(name, userId)` | Create new list |
| `updateGoalList(id, name)` | Update list name |
| `deleteGoalList(id)` | Soft-delete (tombstone) |

### `src/lib/db/repositories/goals.ts`

| Function | Description |
|----------|-------------|
| `getGoals(listId)` | Get goals for a list, ordered |
| `createGoal(listId, name, type, targetValue)` | Create new goal |
| `updateGoal(id, updates)` | Update goal properties |
| `toggleGoal(id)` | Toggle completion status |
| `incrementGoal(id)` | Increment current value |
| `reorderGoals(goals)` | Batch update order |
| `deleteGoal(id)` | Soft-delete |

### `src/lib/db/repositories/dailyRoutines.ts`

| Function | Description |
|----------|-------------|
| `getDailyRoutines(userId)` | Get all routines, ordered |
| `createDailyRoutine(userId, name, type, targetValue, startDate, endDate, activeDays)` | Create routine with scheduling |
| `updateDailyRoutine(id, updates)` | Update routine |
| `reorderDailyRoutines(routines)` | Batch update order |
| `deleteDailyRoutine(id)` | Soft-delete |

### `src/lib/db/repositories/dailyProgress.ts`

| Function | Description |
|----------|-------------|
| `getDayProgress(userId, date)` | Get all progress for a date |
| `getProgressForRoutine(routineId, date)` | Get progress for specific routine on date |
| `updateProgress(routineId, date, value, completed)` | Update or create progress |
| `getMonthProgress(userId, year, month)` | Get aggregated monthly data |

### `src/lib/db/repositories/taskCategories.ts`

| Function | Description |
|----------|-------------|
| `getTaskCategories(userId)` | Get all categories |
| `createTaskCategory(userId, name, color)` | Create category |
| `updateTaskCategory(id, updates)` | Update category |
| `deleteTaskCategory(id)` | Soft-delete |

### `src/lib/db/repositories/commitments.ts`

| Function | Description |
|----------|-------------|
| `getCommitments(userId)` | Get all commitments |
| `getCommitmentsBySection(userId, section)` | Filter by Career/Social/Personal |
| `createCommitment(userId, name, section)` | Create commitment |
| `updateCommitment(id, updates)` | Update commitment |
| `deleteCommitment(id)` | Soft-delete |

### `src/lib/db/repositories/dailyTasks.ts`

| Function | Description |
|----------|-------------|
| `getDailyTasks(userId)` | Get all tasks, ordered |
| `createDailyTask(userId, name)` | Create task |
| `toggleDailyTask(id)` | Toggle completion |
| `reorderDailyTasks(tasks)` | Batch update order |
| `deleteDailyTask(id)` | Soft-delete |
| `clearCompletedTasks(userId)` | Remove all completed |

### `src/lib/db/repositories/longTermTasks.ts`

| Function | Description |
|----------|-------------|
| `getLongTermTasks(userId)` | Get all with categories joined |
| `getLongTermTasksByCategory(userId, categoryId)` | Filter by category |
| `createLongTermTask(userId, name, dueDate, categoryId)` | Create task |
| `updateLongTermTask(id, updates)` | Update task |
| `toggleLongTermTask(id)` | Toggle completion |
| `deleteLongTermTask(id)` | Soft-delete |

### `src/lib/db/repositories/focusSettings.ts`

| Function | Description |
|----------|-------------|
| `getFocusSettings(userId)` | Get settings (creates default if missing) |
| `updateFocusSettings(userId, updates)` | Update settings |

### `src/lib/db/repositories/focusSessions.ts`

| Function | Description |
|----------|-------------|
| `getActiveSession(userId)` | Get running/paused session |
| `getFocusSession(id)` | Get session by ID |
| `createFocusSession(userId, focusDuration, breakDuration, totalCycles)` | Start new session |
| `updateFocusSession(id, updates)` | Update session state |
| `pauseFocusSession(id, remainingMs)` | Pause timer |
| `resumeFocusSession(id)` | Resume timer |
| `stopFocusSession(id, elapsedMinutes)` | End session |
| `advancePhase(id, newPhase, newCycle, durationMs, elapsedMinutes)` | Move to next phase |
| `getTodayFocusTime(userId)` | Sum focus time for today |

### `src/lib/db/repositories/blockLists.ts`

| Function | Description |
|----------|-------------|
| `getBlockLists(userId)` | Get all block lists |
| `createBlockList(userId, name, activeDays)` | Create list |
| `updateBlockList(id, updates)` | Update list |
| `toggleBlockList(id)` | Toggle enabled state |
| `deleteBlockList(id)` | Soft-delete |

### `src/lib/db/repositories/blockedWebsites.ts`

| Function | Description |
|----------|-------------|
| `getBlockedWebsites(blockListId)` | Get websites for list |
| `addBlockedWebsite(blockListId, domain)` | Add website |
| `removeBlockedWebsite(id)` | Soft-delete website |

---

## Stores (State Management)

All stores follow the local-first pattern: load from IndexedDB, subscribe to sync events for refresh.

### `src/lib/stores/data.ts`
Main data stores for goals, routines, tasks.

**Stores:**

#### `goalListsStore`
```typescript
{
  subscribe,
  loading: { subscribe },
  load: async () => void,
  create: async (name, userId) => GoalList,
  update: async (id, name) => GoalList,
  delete: async (id) => void,
  refresh: async () => void
}
```

#### `goalListStore`
Single list with nested goals.

#### `routinesStore`
Daily routine goals with progress.

#### `monthProgressStore`
Aggregated calendar data.

#### `taskCategoriesStore`
Category management.

#### `commitmentsStore`
Commitment management by section.

#### `dailyTasksStore`
Today's tasks.

#### `longTermTasksStore`
Long-term tasks with categories.

### `src/lib/stores/focus.ts`
Focus timer state management.

**State Interface:**
```typescript
interface FocusState {
  settings: FocusSettings | null;
  session: FocusSession | null;
  remainingMs: number;
  isRunning: boolean;
}
```

**Key Functions:**

#### `tick()`
Called every second when timer is running.
- Calculates remaining milliseconds
- Triggers phase completion when `remainingMs <= 0`

#### `handlePhaseComplete()`
Handles end of focus/break phase.
- Calculates elapsed focus time
- Advances to next phase or ends session
- Notifies focus time updated

#### `start()`
Starts new focus session.
- Creates session via repository
- Starts tick interval
- Pushes state to extension

#### `pause() / resume()`
Pause/resume handlers.
- Saves remaining time on pause
- Restores timer on resume

#### `skip()`
Skips current phase early.
- Calculates partial elapsed time for focus phases
- Advances to next phase

### `src/lib/stores/sync.ts`
Sync status store.

```typescript
type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';
export const syncStatusStore: Writable<SyncStatus>;
```

### `src/lib/stores/authState.ts`
Authentication state management.

```typescript
interface AuthState {
  user: User | null;
  session: Session | null;
  mode: AuthMode; // 'supabase' | 'offline' | 'none'
  loading: boolean;
}
```

### `src/lib/stores/network.ts`
Online/offline status tracking.

```typescript
export const isOnline: Writable<boolean>;
```

---

## Authentication

### `src/lib/auth/crypto.ts`
Cryptographic utilities for offline auth.

**Constants:**
```typescript
ITERATIONS = 100000  // PBKDF2 iterations
KEY_LENGTH = 256     // bits
SALT_LENGTH = 16     // bytes
```

**Functions:**

#### `generateSalt(): string`
Creates cryptographically secure random salt.

#### `hashPassword(password, salt): Promise<string>`
PBKDF2-SHA256 password hashing.
```typescript
const derivedBits = await crypto.subtle.deriveBits({
  name: 'PBKDF2',
  salt: salt,
  iterations: ITERATIONS,
  hash: 'SHA-256'
}, keyMaterial, KEY_LENGTH);
```

#### `verifyPassword(password, salt, storedHash): Promise<boolean>`
Verifies password against stored hash with timing-safe comparison.

#### `generateToken(): string`
Creates UUID for offline session tokens.

### `src/lib/auth/offlineCredentials.ts`
Credential caching for offline login.

| Function | Description |
|----------|-------------|
| `cacheOfflineCredentials(email, password, user, session)` | Cache after successful online login |
| `getOfflineCredentials()` | Retrieve cached credentials |
| `verifyOfflinePassword(password)` | Verify against cached hash |
| `updateOfflineCredentialsPassword(newPassword)` | Update after password change |
| `clearOfflineCredentials()` | Clear on logout |

### `src/lib/auth/offlineSession.ts`
Offline session management.

| Function | Description |
|----------|-------------|
| `createOfflineSession(userId)` | Create 7-day offline session |
| `getOfflineSession()` | Retrieve current session |
| `isOfflineSessionValid()` | Check if not expired |
| `clearOfflineSession()` | Clear on logout |

### `src/lib/auth/reconnectHandler.ts`
Handles online/offline transitions.

| Function | Description |
|----------|-------------|
| `setupReconnectHandler()` | Initialize listeners |
| `handleReconnect()` | Re-authenticate when online |

---

## Focus Timer System

### Timer State Machine

```
                    ┌──────────┐
                    │   Idle   │◀────────────────────┐
                    └────┬─────┘                     │
                         │ start()                   │
                         ▼                           │
              ┌──────────────────────┐               │
              │   Focus (running)    │───────────────┤ session complete
              └──────────┬───────────┘               │ (all cycles done)
                         │                           │
           ┌─────────────┼─────────────┐             │
           │             │             │             │
      pause()      timer ends      skip()           │
           │             │             │             │
           ▼             ▼             ▼             │
    ┌──────────┐   ┌──────────┐   ┌──────────┐      │
    │  Paused  │   │  Break   │   │  Break   │      │
    └────┬─────┘   └────┬─────┘   └────┬─────┘      │
         │              │              │             │
    resume()       timer ends      skip()           │
         │              │              │             │
         ▼              ▼              ▼             │
    Focus (running) ◀───┴──────────────┘             │
         │                                           │
    stop() ──────────────────────────────────────────┘
```

### Phase Transitions

```typescript
function getNextPhase(session: FocusSession, settings: FocusSettings): NextPhase {
  if (session.phase === 'focus') {
    if (session.current_cycle >= session.total_cycles) {
      return { phase: 'idle', cycle: session.current_cycle, duration: 0 };
    }
    const isLongBreak = session.current_cycle % settings.cycles_before_long_break === 0;
    return {
      phase: 'break',
      cycle: session.current_cycle,
      duration: isLongBreak ? settings.long_break_duration : settings.break_duration
    };
  }
  // After break, start next focus
  return {
    phase: 'focus',
    cycle: session.current_cycle + 1,
    duration: session.focus_duration
  };
}
```

### Extension Communication

```typescript
// Push focus state to browser extension
async function pushToExtension(state: FocusState) {
  const message = {
    type: 'FOCUS_STATE_UPDATE',
    payload: {
      phase: state.session?.phase || 'idle',
      status: state.session?.status || 'stopped',
      remainingMs: state.remainingMs,
      isBlocking: state.session?.phase === 'focus' && state.session?.status === 'running'
    }
  };
  // Extension listens via postMessage or storage changes
}
```

---

## Routes & Pages

### `src/routes/+layout.svelte`
Root layout with navigation and auth checking.

**Responsibilities:**
- Render navigation bar (authenticated/unauthenticated)
- Show sync status indicator
- Display update prompt for PWA
- Handle auth state changes

### `src/routes/(protected)/+layout.svelte`
Protected route wrapper.
- Redirects to `/login` if not authenticated
- Initializes sync engine on mount
- Cleans up sync on unmount

### `src/routes/(protected)/goals/+page.svelte`
Goal lists page.
- Displays all goal lists with progress
- Create/edit/delete lists
- Navigate to individual list

### `src/routes/(protected)/goals/[id]/+page.svelte`
Single goal list page.
- Displays goals within list
- Add/edit/delete goals
- Drag-and-drop reordering
- Progress tracking

### `src/routes/(protected)/routines/+page.svelte`
Routines management page.
- List all routines
- Create/edit routines with days selector
- View active status

### `src/routes/(protected)/routines/[id]/+page.svelte`
Single routine edit page.
- Edit routine details
- Delete routine

### `src/routes/(protected)/calendar/+page.svelte`
Monthly calendar view.
- Color-coded day completion
- Click day to view/edit progress
- Navigate months

### `src/routes/(protected)/tasks/+page.svelte`
Tasks page with three sections.
- Daily tasks (quick add, checkbox)
- Commitments (Career/Social/Personal)
- Long-term tasks with categories

### `src/routes/(protected)/focus/+page.svelte`
Focus timer page.
- Timer display with progress ring
- Start/pause/skip/stop controls
- Focus settings modal
- Block lists section
- Daily focus time stats

### `src/routes/(protected)/focus/block-lists/[id]/+page.svelte`
Block list edit page.
- Edit list name and active days
- Add/remove blocked websites

### `src/routes/(protected)/profile/+page.svelte`
User profile page.
- Update name
- Change password
- Sign out

### `src/routes/login/+page.svelte`
Login page.
- Email/password form
- Offline login support
- Link to signup

### `src/routes/signup/+page.svelte`
Registration page.
- Email/password/name form
- Create Supabase account

### `src/routes/policy/+page.svelte`
Privacy policy page.
- Cinematic space background
- Simple privacy statement

---

## Components

### `src/lib/components/Modal.svelte`
Reusable modal dialog.

**Props:**
- `show: boolean` - Visibility state
- `title: string` - Header text
- `size?: 'sm' | 'md' | 'lg'` - Width variant

**Slots:**
- default - Modal body content
- `footer` - Action buttons

### `src/lib/components/SyncStatus.svelte`
Sync indicator in header.
- Shows syncing spinner
- Success checkmark
- Error indicator
- Tooltip with status

### `src/lib/components/UpdatePrompt.svelte`
PWA update notification.
- Detects new service worker
- Shows "Update Available" banner
- Handles skip waiting and reload

### `src/lib/components/RoutineForm.svelte`
Form for creating/editing routines.

**Features:**
- Name input
- Type selector (completion/incremental)
- Target value input (for incremental)
- Date range pickers
- Days-of-week selector with quick buttons

### `src/lib/components/focus/FocusTimer.svelte`
Timer display component.

**Features:**
- Circular progress ring
- Time display (MM:SS)
- Phase indicator
- Cycle counter

### `src/lib/components/focus/FocusSettings.svelte`
Settings modal for focus timer.

**Settings:**
- Focus duration slider
- Short break slider
- Long break slider
- Cycles before long break
- Auto-start toggles

### `src/lib/components/focus/BlockListManager.svelte`
Block list management component.

**Features:**
- List of block lists with toggles
- Create new list modal
- Edit/delete actions
- Website count display

### `src/lib/components/focus/BlockListForm.svelte`
Form for block list creation/editing.

**Fields:**
- Name input
- Days-of-week selector

---

## Utilities

### `src/lib/utils/colors.ts`
Color calculation utilities.

| Function | Description |
|----------|-------------|
| `calculateGoalProgress(list)` | Compute completion percentage |
| `getProgressColor(percentage)` | Red-to-green gradient |
| `getCalendarDayColor(completion)` | Day cell background |

### `src/lib/utils/dates.ts`
Date manipulation utilities.

| Function | Description |
|----------|-------------|
| `formatDate(date)` | Display format |
| `isRoutineActiveOnDate(routine, date)` | Check if routine applies |
| `getMonthDays(year, month)` | Get days in month |
| `isSameDay(a, b)` | Compare dates |

### `src/lib/utils/focus.ts`
Focus timer utilities.

| Function | Description |
|----------|-------------|
| `calculateRemainingMs(session)` | Compute remaining time |
| `getNextPhase(session, settings)` | Determine next phase |
| `formatTime(ms)` | Format as MM:SS |
| `DEFAULT_FOCUS_SETTINGS` | Default settings object |

---

## Service Worker (PWA)

### `static/sw.js`
Service worker for offline support.

**Cache Strategy:**
```
Request Type    │ Strategy
───────────────┼──────────────────────────────
HTML pages     │ Network-first, fallback cache
JS/CSS/Images  │ Cache-first, background update
API calls      │ Network-only (handled by sync)
```

**Lifecycle Events:**

#### `install`
- Precache critical assets (/, manifest, icons)
- Don't skip waiting (let UpdatePrompt control)

#### `activate`
- Delete old caches (stellar-* except current)
- Claim all clients

#### `fetch`
```typescript
if (request is HTML) {
  try {
    response = await fetchWithTimeout(request, 5000);
    cache.put(request, response.clone());
    return response;
  } catch {
    return cache.match(request);
  }
} else {
  return cache.match(request) || fetch(request);
}
```

**Version Management:**
- `APP_VERSION` updated on each build
- Cache name: `stellar-${APP_VERSION}`
- Vite plugin injects version at build time

---

## Supabase Integration

### `src/lib/supabase/client.ts`
Supabase client singleton.

```typescript
export const supabase = createClient<Database>(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
);
```

### `src/lib/supabase/types.ts`
Generated TypeScript types from database schema.

### Real-time Subscriptions

```typescript
const channel = supabase
  .channel('focus-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'focus_sessions',
    filter: `user_id=eq.${userId}`
  }, handleRealtimeUpdate)
  .subscribe();
```

### Row Level Security

All tables use RLS policies:
```sql
-- Users can only access their own data
CREATE POLICY "Users can view own data"
ON goal_lists FOR SELECT
USING (user_id = auth.uid());
```

---

## File Reference

```
src/
├── routes/
│   ├── +layout.svelte              # Root layout
│   ├── +page.svelte                # Landing page
│   ├── login/+page.svelte          # Login
│   ├── signup/+page.svelte         # Registration
│   ├── policy/+page.svelte         # Privacy policy
│   └── (protected)/
│       ├── +layout.svelte          # Auth wrapper
│       ├── goals/
│       │   ├── +page.svelte        # Goal lists
│       │   └── [id]/+page.svelte   # Single list
│       ├── routines/
│       │   ├── +page.svelte        # Routines
│       │   └── [id]/+page.svelte   # Edit routine
│       ├── calendar/+page.svelte   # Calendar view
│       ├── tasks/+page.svelte      # Tasks
│       ├── focus/
│       │   ├── +page.svelte        # Focus timer
│       │   └── block-lists/
│       │       └── [id]/+page.svelte
│       └── profile/+page.svelte    # User profile
├── lib/
│   ├── components/
│   │   ├── Modal.svelte
│   │   ├── SyncStatus.svelte
│   │   ├── UpdatePrompt.svelte
│   │   ├── RoutineForm.svelte
│   │   └── focus/
│   │       ├── FocusTimer.svelte
│   │       ├── FocusSettings.svelte
│   │       ├── BlockListManager.svelte
│   │       └── BlockListForm.svelte
│   ├── db/
│   │   ├── schema.ts               # Dexie schema
│   │   ├── client.ts               # DB singleton
│   │   └── repositories/
│   │       ├── index.ts            # Re-exports
│   │       ├── goalLists.ts
│   │       ├── goals.ts
│   │       ├── dailyRoutines.ts
│   │       ├── dailyProgress.ts
│   │       ├── taskCategories.ts
│   │       ├── commitments.ts
│   │       ├── dailyTasks.ts
│   │       ├── longTermTasks.ts
│   │       ├── focusSettings.ts
│   │       ├── focusSessions.ts
│   │       ├── blockLists.ts
│   │       └── blockedWebsites.ts
│   ├── stores/
│   │   ├── data.ts                 # Main data stores
│   │   ├── focus.ts                # Focus timer store
│   │   ├── sync.ts                 # Sync status
│   │   ├── authState.ts            # Auth state
│   │   └── network.ts              # Online status
│   ├── sync/
│   │   ├── engine.ts               # Sync orchestration
│   │   └── queue.ts                # Outbox management
│   ├── auth/
│   │   ├── crypto.ts               # PBKDF2 hashing
│   │   ├── offlineCredentials.ts   # Credential cache
│   │   ├── offlineSession.ts       # Offline sessions
│   │   └── reconnectHandler.ts     # Online/offline handling
│   ├── supabase/
│   │   ├── client.ts               # Supabase client
│   │   └── types.ts                # Generated types
│   ├── types.ts                    # TypeScript interfaces
│   └── utils/
│       ├── colors.ts               # Color calculations
│       ├── dates.ts                # Date utilities
│       └── focus.ts                # Timer utilities
├── app.css                         # Global styles
└── app.html                        # HTML template

static/
├── sw.js                           # Service worker
├── manifest.json                   # PWA manifest
├── favicon.png
├── icon-192.png
└── icon-512.png
```
