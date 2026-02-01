# Stellar -- Tech Stack & Framework Documentation

Stellar is a self-hosted, offline-first productivity Progressive Web App (PWA) built with modern web technologies. It lets users manage tasks, plans, routines, and focus sessions across multiple devices. The app works fully offline using a local IndexedDB database, syncs to a Supabase PostgreSQL backend when online, and uses a custom intent-based sync engine with three-tier conflict resolution for multi-device consistency. The entire frontend is a single-page application powered by Svelte 5 and SvelteKit 2, bundled by Vite, and served as an installable PWA via a custom service worker.

---

## Table of Contents

1. [Svelte 5 + SvelteKit 2 (Frontend Framework)](#1-svelte-5--sveltekit-2-frontend-framework)
2. [TypeScript (Language)](#2-typescript-language)
3. [Dexie.js / IndexedDB (Local Database)](#3-dexiejs--indexeddb-local-database)
4. [Supabase (Backend-as-a-Service)](#4-supabase-backend-as-a-service)
5. [Sync System (Custom Sync Engine)](#5-sync-system-custom-sync-engine)
6. [Vite (Build Tool)](#6-vite-build-tool)
7. [Service Worker / PWA (Offline Support)](#7-service-worker--pwa-offline-support)
8. [High-Level Architecture Patterns](#8-high-level-architecture-patterns)
9. [Development Dependencies](#9-development-dependencies)
10. [Runtime Dependencies](#10-runtime-dependencies)

---

## 1. Svelte 5 + SvelteKit 2 (Frontend Framework)

### What is Svelte?

Svelte is a JavaScript framework for building user interfaces. Unlike React or Vue, which do most of their work in the browser using a "virtual DOM," Svelte shifts that work to a compile step. When you build your project, Svelte compiles your components into highly efficient vanilla JavaScript that directly manipulates the real DOM. This means smaller bundle sizes and faster runtime performance because there is no framework overhead running in the browser.

### What is SvelteKit?

SvelteKit is the official application framework built on top of Svelte. Think of Svelte as the language for writing individual UI components, and SvelteKit as the full toolkit that provides routing (mapping URLs to pages), server-side rendering, data loading, and build configuration. It is to Svelte what Next.js is to React.

### Svelte 5 Runes (Reactivity System)

Svelte 5 introduced "runes" -- special compiler directives prefixed with `$` that control reactivity. The Stellar codebase uses all four core runes extensively.

**`$state` -- Reactive state declaration**

Declares a piece of reactive state. When the value changes, any part of the UI that reads it automatically updates.

```svelte
<!-- From src/routes/+layout.svelte -->
let showToast = $state(false);
let toastMessage = $state('');
let toastType = $state<'info' | 'error'>('info');
let isSigningOut = $state(false);
```

In the example above, `showToast` starts as `false`. When it is set to `true` anywhere in the script, the toast notification in the template automatically appears without you having to manually update the DOM.

**`$derived` -- Computed values**

Declares a value that is computed from other reactive values. It automatically recalculates whenever its dependencies change.

```svelte
<!-- From src/routes/+layout.svelte -->
const isOnLoginPage = $derived($page.url.pathname.startsWith('/login'));
const isAuthenticated = $derived(
  data.authMode !== 'none' && !isAuthPage && !$authState.isLoading
);
```

Here, `isAuthenticated` is a derived value that depends on `data.authMode`, `isAuthPage`, and `$authState.isLoading`. Whenever any of those change, `isAuthenticated` recalculates automatically.

**`$effect` -- Side effects**

Runs code whenever its reactive dependencies change, similar to React's `useEffect`. Used for things like syncing state, logging, or interacting with external systems.

```svelte
<!-- From src/routes/+layout.svelte -->
$effect(() => {
  if (data.authMode === 'supabase' && data.session) {
    authState.setSupabaseAuth(data.session);
  } else if (data.authMode === 'offline' && data.offlineProfile) {
    authState.setOfflineAuth(data.offlineProfile);
  } else {
    authState.setNoAuth();
  }
});
```

This effect watches `data.authMode` and `data.session`. Whenever the layout receives new data (e.g., after navigation or a session change), it updates the global auth state accordingly.

**`$props` -- Component props**

Declares the props a component accepts from its parent. Replaces the old `export let` syntax from Svelte 4.

```svelte
<!-- From src/routes/+layout.svelte -->
interface Props {
  children?: import('svelte').Snippet;
  data: LayoutData;
}

let { children, data }: Props = $props();
```

The layout component receives `children` (the page content to render) and `data` (loaded by the layout's data function) as props.

### Snippets (Template Composition)

Svelte 5 uses "snippets" (via `{@render ...}`) to compose templates. In the layout file, the child page content is rendered with:

```svelte
<main class="main">
  {@render children?.()}
</main>
```

### SvelteKit Routing

SvelteKit uses file-system based routing. Each directory under `src/routes/` maps to a URL path:

```
src/routes/
  +layout.svelte          --> Root layout (wraps ALL pages)
  +page.svelte            --> Homepage (/)
  (protected)/
    +layout.svelte        --> Auth-guarded layout
    +layout.ts            --> Auth check data loader
    tasks/+page.svelte    --> /tasks
    plans/+page.svelte    --> /plans
    routines/+page.svelte --> /routines
    focus/+page.svelte    --> /focus
    profile/+page.svelte  --> /profile
  login/+page.svelte      --> /login
  setup/+page.svelte      --> /setup
  confirm/+page.svelte    --> /confirm (email confirmation)
  api/                    --> Server API routes
```

The `(protected)` directory is a "route group" (the parentheses mean it does not create a URL segment). It wraps all authenticated routes in a shared layout that checks authentication before rendering.

Key SvelteKit imports used throughout the codebase:

- `$app/stores` -- Provides the `page` store (current URL, params, etc.)
- `$app/navigation` -- Provides `goto()` for programmatic navigation
- `$app/environment` -- Provides `browser` boolean (true if running in browser, false during SSR)
- `$lib/...` -- Alias for `src/lib/`, the shared library directory

### Configuration

**`svelte.config.js`** (`/Users/prabhask/Documents/Projects/stellar/svelte.config.js`):

```js
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};
```

- `adapter-auto` -- Automatically detects the deployment target (Vercel, Netlify, Node, etc.) and configures the build output accordingly.
- `vitePreprocess()` -- Enables TypeScript and CSS preprocessing inside `.svelte` files.

---

## 2. TypeScript (Language)

### What is TypeScript?

TypeScript is a superset of JavaScript that adds static type checking. It lets you annotate variables, function parameters, and return values with types. The TypeScript compiler catches type errors before your code runs, preventing entire categories of bugs (like passing a string where a number is expected).

### Why it is used in Stellar

Every source file in Stellar is written in TypeScript (`.ts` files and `<script lang="ts">` blocks in `.svelte` files). This provides:

- **Compile-time safety**: The compiler catches typos, missing properties, and type mismatches before the app runs.
- **IDE support**: Editors like VS Code provide autocomplete, go-to-definition, and inline error highlighting.
- **Self-documenting code**: Type annotations serve as documentation for the shape of data structures (entities, sync operations, config objects, etc.).

### Configuration

**`tsconfig.json`** (`/Users/prabhask/Documents/Projects/stellar/tsconfig.json`):

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

Key settings:

| Option | What it does |
|--------|-------------|
| `strict: true` | Enables all strict type-checking options (no implicit `any`, strict null checks, etc.). This is the strictest TypeScript configuration. |
| `checkJs: true` | Also type-checks plain `.js` files (like `static/sw.js`). |
| `moduleResolution: "bundler"` | Uses Vite/bundler-style module resolution (supports `$lib/...` path aliases). |
| `sourceMap: true` | Generates source maps so browser devtools show the original TypeScript source, not compiled JavaScript. |
| `extends: "./.svelte-kit/tsconfig.json"` | Inherits SvelteKit-generated path aliases (`$lib`, `$app`, etc.). |

---

## 3. Dexie.js / IndexedDB (Local Database)

### What is IndexedDB?

IndexedDB is a database built into every modern web browser. Unlike `localStorage` (which only stores strings), IndexedDB is a full object database that can store complex JavaScript objects, supports indexes for fast queries, and can hold megabytes of data. It is asynchronous (non-blocking) and works entirely offline.

### What is Dexie.js?

Dexie.js is a wrapper library around IndexedDB that provides a much friendlier API. Raw IndexedDB requires verbose, callback-based code with request objects and event handlers. Dexie replaces that with a clean, Promise-based API that supports queries, transactions, and live queries (reactive queries that automatically re-run when data changes).

### How Stellar uses Dexie

Stellar's entire local data layer is built on Dexie. The database schema is defined in:

**`src/lib/db/schema.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/db/schema.ts`)

The database is called `GoalPlannerDB` and is currently at **schema version 13**. It contains **17 tables** total:

**13 Entity Tables** (user data that syncs to the server):

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| `goalLists` | Plan/goal list containers | `user_id`, `project_id`, `order` |
| `goals` | Individual goals within lists | `goal_list_id`, `order` |
| `dailyRoutineGoals` | Recurring routine items | `user_id`, `order`, `start_date`, `end_date` |
| `dailyGoalProgress` | Daily progress tracking for routines | `daily_routine_goal_id`, `date`, compound index |
| `taskCategories` | Task tag/category definitions | `user_id`, `project_id`, `order` |
| `commitments` | Commitment items | `user_id`, `project_id`, `section`, `order` |
| `dailyTasks` | Daily to-do items | `user_id`, `order` |
| `longTermTasks` | Long-term tasks with due dates | `user_id`, `due_date`, `category_id` |
| `focusSettings` | Focus mode configuration | `user_id` |
| `focusSessions` | Focus session history | `user_id`, `started_at`, `ended_at`, `status` |
| `blockLists` | Website block list definitions | `user_id`, `order` |
| `blockedWebsites` | Individual blocked website URLs | `block_list_id` |
| `projects` | Project containers (group lists + tags + commitments) | `user_id`, `is_current`, `order` |

**3 System Tables** (local-only, never synced):

| Table | Purpose |
|-------|---------|
| `syncQueue` | Outbox for pending sync operations (auto-increment ID) |
| `offlineCredentials` | Cached user credentials for offline login (singleton) |
| `offlineSession` | Cached session data for offline mode (singleton) |

**1 Diagnostic Table**:

| Table | Purpose |
|-------|---------|
| `conflictHistory` | Records of past conflict resolutions for review |

The schema definition looks like this (showing the final version 13):

```typescript
this.version(13).stores({
  goalLists: 'id, user_id, project_id, order, created_at, updated_at',
  goals: 'id, goal_list_id, order, created_at, updated_at',
  // ... (13 entity tables + 4 system/diagnostic tables)
  syncQueue: '++id, table, entityId, timestamp',
  conflictHistory: '++id, entityId, entityType, timestamp'
});
```

In Dexie's schema syntax:
- `id` -- The first field is the primary key
- `++id` -- Auto-incrementing primary key
- Other fields are indexed columns (searchable/sortable)
- `[field1+field2]` -- Compound index (for queries filtering on multiple fields)

### Schema Versioning

Dexie supports schema migrations. Each `this.version(N)` call defines the schema at version N. When the database is opened and the stored version is older than the code's version, Dexie automatically runs the upgrade functions. For example, version 4 added the `order` column and populated it for existing records:

```typescript
this.version(4).stores({ /* ... */ })
  .upgrade(async (tx) => {
    const routines = await tx.table('dailyRoutineGoals').toArray();
    const sorted = routines.sort(/* by created_at */);
    for (let i = 0; i < sorted.length; i++) {
      await tx.table('dailyRoutineGoals').update(sorted[i].id, { order: i });
    }
  });
```

### The Repository Pattern

All database reads and writes go through repository functions. Each entity type has its own file in:

**`src/lib/db/repositories/`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/db/repositories/`)

Repositories encapsulate three concerns in a single atomic transaction:

1. **Write to local DB** (IndexedDB via Dexie)
2. **Queue a sync operation** (into the `syncQueue` table)
3. **Schedule a sync push** (tells the engine to push soon)

Example from `goals.ts` (`/Users/prabhask/Documents/Projects/stellar/src/lib/db/repositories/goals.ts`):

```typescript
export async function createGoal(goalListId, name, type, targetValue) {
  const timestamp = now();
  const newGoal = { id: generateId(), /* ... */ };

  // Atomic transaction: write + queue happen together or not at all
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    await db.goals.add(newGoal);
    await queueCreateOperation('goals', newGoal.id, { /* payload */ });
  });

  markEntityModified(newGoal.id);  // Protect from being overwritten by pull
  scheduleSyncPush();              // Tell sync engine to push soon

  return newGoal;
}
```

This pattern is consistent across all repositories. The key insight is that the **local write and sync queue entry are in the same Dexie transaction**, so they either both succeed or both fail. This guarantees that if data is written locally, a sync operation is always queued for it.

### Client Module

**`src/lib/db/client.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/db/client.ts`):

```typescript
import { db } from './schema';
export { db };

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
```

All entity IDs are UUIDs generated client-side. Timestamps are ISO 8601 strings. This is essential for offline-first operation: the client can create entities without consulting the server.

---

## 4. Supabase (Backend-as-a-Service)

### What is Supabase?

Supabase is an open-source backend platform that provides:

- **PostgreSQL database** -- A powerful relational database that stores all synced user data.
- **Authentication** -- Email/password authentication with session management, token refresh, and PKCE flow.
- **Realtime** -- WebSocket-based subscriptions that push database changes to connected clients in real time.
- **Row Level Security (RLS)** -- PostgreSQL policies that ensure users can only read/write their own data, enforced at the database level.
- **REST API** -- Auto-generated CRUD endpoints for every table (powered by PostgREST).

Supabase is self-hostable, which aligns with Stellar's self-hosted philosophy. Users deploy their own Supabase instance and configure Stellar to connect to it.

### Why Supabase in Stellar

Supabase serves as the cloud sync layer. While Stellar works fully offline using IndexedDB, Supabase provides:

1. **Multi-device sync** -- Changes made on one device are pushed to Supabase and pulled/pushed in real time to other devices.
2. **Authentication** -- Supabase Auth handles user registration, login, session tokens, and token refresh.
3. **Security** -- Row Level Security ensures that even if someone has the Supabase URL and anon key, they can only access their own data.
4. **Real-time updates** -- WebSocket subscriptions instantly notify other open tabs/devices of changes.

### Runtime Configuration

Stellar uses runtime configuration instead of build-time environment variables. This allows a single build to be deployed with different Supabase instances:

**`src/lib/config/runtimeConfig.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/config/runtimeConfig.ts`):

```typescript
export interface StellarConfig {
  supabaseUrl: string;      // e.g., https://your-project.supabase.co
  supabaseAnonKey: string;  // Public anonymous key
  configured: boolean;
}
```

The config is:
1. Fetched from the server (`/api/config` endpoint) on first load
2. Cached in `localStorage` for instant subsequent loads and offline PWA support
3. Used to lazily initialize the Supabase client

### Supabase Client Initialization

**`src/lib/supabase/client.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/supabase/client.ts`):

The Supabase client uses a **Proxy-based lazy singleton** pattern:

```typescript
let realClient: SupabaseClient | null = null;

function getOrCreateClient(): SupabaseClient {
  if (realClient) return realClient;

  const config = getConfig();
  realClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'         // Secure auth flow for PWAs
    }
  });
  return realClient;
}

// Proxy delegates all property access to the real client
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getOrCreateClient();
    return Reflect.get(client, prop, receiver);
  }
});
```

The Proxy pattern means all consumer code simply imports `supabase` and uses it directly. The actual client is created on first access, after the runtime config is available. This avoids initialization-order issues that plague environment-variable approaches.

Key auth features:
- **PKCE flow** -- More secure than implicit flow, works well with PWAs.
- **Auto token refresh** -- Tokens are refreshed before expiry.
- **Corrupted data cleanup** -- On startup, any malformed Supabase auth data in localStorage is detected and cleared.
- **iOS PWA detection** -- Special handling for iOS standalone mode, which can evict localStorage data.

---

## 5. Sync System (Custom Sync Engine)

### Overview

The sync system is Stellar's most complex subsystem. It enables offline-first multi-device operation using an **outbox pattern** with **intent-based operations** and **three-tier conflict resolution**.

```
+------------------+          +-------------------+          +------------------+
|   User Action    |          |   Sync Engine     |          |   Supabase       |
|                  |          |                   |          |   (PostgreSQL)   |
|  1. Write to     |  push    |  3. Read outbox   |  HTTP    |                  |
|     IndexedDB    |--------->|  4. Transform ops  |--------->|  5. Apply to DB  |
|  2. Queue to     |          |     to mutations  |          |                  |
|     syncQueue    |          |                   |  pull    |                  |
|                  |<---------|  6. Pull changes   |<---------|  7. Return delta |
|  8. Merge into   |          |     since cursor  |          |                  |
|     IndexedDB    |          |                   |          |                  |
+------------------+          +-------------------+          +------------------+
                                      |
                                      | WebSocket
                                      v
                              +-------------------+
                              |  Realtime Layer   |
                              |  (instant push    |
                              |   from other      |
                              |   devices)        |
                              +-------------------+
```

### The Five Rules of Local-First Sync

From the engine header comment (`/Users/prabhask/Documents/Projects/stellar/src/lib/sync/engine.ts`):

```
1. All reads come from local DB (IndexedDB)
2. All writes go to local DB first, immediately
3. Every write creates a pending operation in the outbox
4. Sync loop ships outbox to server in background
5. On refresh, load local state instantly, then run background sync
```

### Intent-Based Operations (Outbox Pattern)

Instead of syncing raw data diffs, Stellar records the **intent** of each user action. This preserves semantic meaning during conflict resolution.

**`src/lib/sync/operations.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/sync/operations.ts`):

There are four operation types:

| Operation | Intent | Example |
|-----------|--------|---------|
| `create` | A new entity was created | User creates a new task |
| `set` | A field (or fields) were explicitly set to a value | User renames a task |
| `increment` | A numeric field was incremented by a delta | User taps +1 on a counter goal |
| `delete` | An entity was soft-deleted | User deletes a task |

The `increment` operation is particularly important. Instead of recording "current_value is now 5," it records "current_value was incremented by +1." This means if two devices both increment the same counter offline, the sync engine can sum the deltas instead of losing one update.

Each operation is stored in the `syncQueue` table:

```typescript
interface SyncOperationItem {
  id?: number;           // Auto-increment queue ID
  table: string;         // Target table (e.g., 'goals')
  entityId: string;      // UUID of the entity
  operationType: 'create' | 'set' | 'increment' | 'delete';
  field?: string;        // Specific field (for set/increment)
  value?: unknown;       // New value or delta
  timestamp: string;     // When the operation was created
  retries: number;       // Number of push attempts
}
```

### Operation Coalescing

Before pushing, the queue is coalesced to minimize server requests:

**`src/lib/sync/queue.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/sync/queue.ts`):

```
Coalescing strategies:
  CREATE -> DELETE         : Cancel both (entity never existed on server)
  CREATE -> UPDATE -> DELETE: Cancel all (net effect is nothing)
  UPDATE(s) -> DELETE      : Keep only delete
  CREATE -> UPDATE(s)      : Merge updates into create payload
  Multiple INCREMENTs      : Sum deltas (e.g., +1, +1, +1 = +3)
  Multiple SETs            : Merge into single set (last value wins)
```

### Push/Pull Sync Cycle

The sync engine (`/Users/prabhask/Documents/Projects/stellar/src/lib/sync/engine.ts`) runs a push/pull cycle:

```
SYNC CYCLE
==========

1. PUSH PHASE (local -> server)
   a. Coalesce pending operations
   b. For each operation in the outbox:
      - Transform to Supabase mutation (insert/update/delete)
      - Execute against Supabase REST API
      - On success: remove from outbox
      - On failure: increment retry counter (max 5 retries)

2. PULL PHASE (server -> local)
   a. For each entity table:
      - Query Supabase for records updated after the last sync cursor
      - For each remote record:
        * Skip if recently modified locally (protection window)
        * Skip if recently processed by realtime
        * Run through conflict resolution
        * Write merged result to IndexedDB
   b. Update the sync cursor to the latest timestamp

3. POST-SYNC
   a. Clean up failed items (> max retries)
   b. Clean up old conflict history (> 30 days)
   c. Update sync status store (for UI indicator)
```

### Three-Tier Conflict Resolution

**`src/lib/sync/conflicts.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/sync/conflicts.ts`):

When the pull phase finds a remote record that conflicts with a local record (both modified since last sync), the conflict resolution engine applies three tiers:

```
CONFLICT RESOLUTION TIERS
==========================

Tier 1: NON-OVERLAPPING CHANGES (different entities)
  -> Auto-merge. No conflict. Each entity is independent.

Tier 2: DIFFERENT FIELDS on the same entity
  -> Auto-merge fields. If Device A changed "name" and Device B
     changed "completed," both changes are kept.

Tier 3: SAME FIELD on the same entity
  -> Apply resolution strategy:

     a. PENDING LOCAL OPS: If the field has pending local operations
        that haven't been pushed yet, local wins (the push will
        send the latest local value).

     b. DELETE WINS: If either side deleted the entity, the delete
        wins. This prevents "resurrection" of deleted entities.

     c. LAST-WRITE-WINS: Compare updated_at timestamps. The more
        recent write wins. If timestamps are identical, use device_id
        as a deterministic tiebreaker (lower device_id wins).
```

Conflict resolutions are recorded in the `conflictHistory` table for diagnostic review:

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

### Realtime Subscriptions (WebSocket)

**`src/lib/sync/realtime.ts`** (`/Users/prabhask/Documents/Projects/stellar/src/lib/sync/realtime.ts`):

For instant multi-device sync, Stellar subscribes to Supabase Realtime via WebSocket. This provides near-instant updates (typically under 100ms) without waiting for the next poll cycle.

Key design decisions:

1. **Single channel per user** -- One WebSocket channel subscribes to all 13 entity tables.
2. **Echo suppression** -- Each record carries a `device_id`. Changes from the current device are ignored to prevent echo.
3. **Duplicate prevention** -- Recently processed entities are tracked with a 2-second TTL to prevent the same change from being applied by both realtime and polling.
4. **Conflict-aware** -- Incoming realtime changes go through the same conflict resolution engine as polled changes.
5. **Graceful degradation** -- If WebSocket fails, it retries with exponential backoff (1s, 2s, 4s, 8s, 16s) up to 5 attempts, then falls back to polling only.
6. **Offline-aware** -- Reconnection attempts are paused while offline and resumed when the browser comes back online.

```typescript
const REALTIME_TABLES = [
  'goal_lists', 'goals', 'daily_routine_goals', 'daily_goal_progress',
  'task_categories', 'commitments', 'daily_tasks', 'long_term_tasks',
  'focus_settings', 'focus_sessions', 'block_lists', 'blocked_websites',
  'projects'
];
```

---

## 6. Vite (Build Tool)

### What is Vite?

Vite (French for "fast") is a modern JavaScript build tool. During development, it serves files directly using native ES modules in the browser, which means near-instant hot module replacement (HMR) -- when you save a file, the change appears in the browser in milliseconds. For production, Vite uses Rollup to bundle all files into optimized, minified chunks.

### Why Vite in Stellar

SvelteKit uses Vite as its underlying build engine. Stellar's Vite config adds custom optimizations on top:

**`vite.config.ts`** (`/Users/prabhask/Documents/Projects/stellar/vite.config.ts`):

```typescript
export default defineConfig({
  plugins: [sveltekit(), serviceWorkerVersion()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('date-fns'))  return 'vendor-date-fns';
            if (id.includes('dexie'))     return 'vendor-dexie';
          }
        }
      }
    },
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    target: 'es2020'
  }
});
```

Key configurations:

| Setting | Purpose |
|---------|---------|
| `manualChunks` | Splits vendor libraries into separate chunks (`vendor-supabase`, `vendor-date-fns`, `vendor-dexie`). This improves caching: when app code changes, vendor chunks stay cached. |
| `minify: 'esbuild'` | Uses esbuild for minification (faster than terser). |
| `target: 'es2020'` | Targets modern browsers, enabling smaller output (no polyfills for async/await, optional chaining, etc.). |

### Custom Plugin: `serviceWorkerVersion()`

The config includes a custom Vite plugin that:

1. **On build start** (`buildStart`): Injects a timestamp-based version string into `static/sw.js`, replacing the `APP_VERSION` constant. This ensures each build produces a new service worker version.

2. **After build** (`closeBundle`): Scans the build output directory for all `.js` and `.css` files, then writes an `asset-manifest.json`. The service worker uses this manifest to precache all application chunks for full offline support.

---

## 7. Service Worker / PWA (Offline Support)

### What is a Service Worker?

A service worker is a JavaScript file that runs in the background, separate from the web page. It acts as a network proxy: it intercepts every HTTP request the page makes and can decide whether to serve a cached response or fetch from the network. This is the foundation of Progressive Web Apps (PWAs) -- apps that can be installed on the home screen and work offline.

### What is a PWA?

A Progressive Web App is a website that behaves like a native app. It can be installed on a phone or computer, has an app icon, works offline, and receives updates automatically. PWAs are built with standard web technologies but use service workers and a manifest file to provide the native-like experience.

### Stellar's Service Worker Strategy

**`static/sw.js`** (`/Users/prabhask/Documents/Projects/stellar/static/sw.js`):

Stellar uses a **split-cache strategy** with two separate caches:

```
CACHE ARCHITECTURE
==================

ASSET_CACHE ('stellar-assets-v1')
  - Persistent across deployments
  - Stores immutable assets (/_app/immutable/*)
  - These files have content hashes in their filenames
  - Once cached, never revalidated (the hash guarantees correctness)

SHELL_CACHE ('stellar-shell-{version}')
  - Versioned per deployment
  - Stores the app shell (root HTML, manifest, icons)
  - Old versions are deleted on activation
```

The fetch strategy depends on the request type:

```
FETCH STRATEGIES
================

Navigation requests (HTML pages):
  -> Network-first with offline fallback
  -> Try network; if offline, serve cached root HTML
  -> SvelteKit's client-side router handles page rendering

Immutable assets (/_app/immutable/*):
  -> Cache-first, permanent
  -> Check cache first; if miss, fetch and cache forever
  -> Files have content hashes, so they never need revalidation

Static assets (icons, manifest, etc.):
  -> Cache-first with background update
  -> Serve from cache immediately; optionally revalidate in background

API routes (/api/*):
  -> Network only (never cached)
  -> API responses must always be fresh

External requests:
  -> Network only (not intercepted)
```

### Background Precaching

On first load, the layout component (`+layout.svelte`) sends messages to the service worker to proactively cache all application chunks:

```typescript
// From src/routes/+layout.svelte onMount()
controller.postMessage({ type: 'PRECACHE_ALL' });
```

This ensures that even pages the user has never visited are available offline. The service worker fetches the `asset-manifest.json` (generated by the Vite plugin) and caches every listed JS and CSS file in the background.

### Update Flow

When a new version of the service worker is detected:
1. The new SW installs and waits (does NOT `skipWaiting()`)
2. An `UpdatePrompt` component shows the user a notification
3. When the user accepts, the new SW is activated and the page reloads

This prevents the jarring experience of the page silently updating under the user.

---

## 8. High-Level Architecture Patterns

### Offline-First Architecture

```
USER INTERACTION FLOW
=====================

                          +---> IndexedDB (instant)
                         /
User taps "Add Task" ---+
                         \
                          +---> syncQueue (background)
                                    |
                                    v
                              Sync Engine (async)
                                    |
                                    v
                              Supabase (when online)
```

The user never waits for the network. All interactions are local-first:
- Reads come from IndexedDB (sub-millisecond)
- Writes go to IndexedDB immediately
- Sync happens in the background

### Data Flow Architecture

```
+-------------------+     +------------------+     +-----------------+
|  Svelte Components|     |  Repositories    |     |  Dexie (IDB)    |
|  (UI Layer)       |---->|  (Data Layer)    |---->|  (Storage)      |
|                   |     |                  |     |                 |
|  $state, $derived |     |  createGoal()    |     |  db.goals.add() |
|  live queries     |<----|  updateGoal()    |<----|  db.goals.get() |
+-------------------+     +------------------+     +-----------------+
                                |                         |
                                v                         |
                          +------------------+            |
                          |  Sync Queue      |            |
                          |  (syncQueue tbl) |            |
                          +------------------+            |
                                |                         |
                                v                         |
                          +------------------+            |
                          |  Sync Engine     |            |
                          |  (push/pull)     |----------->|
                          +------------------+     (writes merged
                                |                  remote data)
                                v
                          +------------------+
                          |  Supabase        |
                          |  (PostgreSQL)    |
                          +------------------+
                                |
                                v
                          +------------------+
                          |  Realtime        |
                          |  (WebSocket)     |
                          +------------------+
                                |
                                v
                          Other devices
```

### Soft Delete Pattern

Stellar never hard-deletes records. Instead, it sets `deleted: true` on the record. This is essential for sync:
- A hard delete cannot be synced (the record is gone, so there is nothing to push).
- A soft delete is just an update (`deleted: true`), which flows through the normal sync pipeline.
- Queries filter out soft-deleted records: `items.filter(item => !item.deleted)`.

### Tombstone + Version Pattern

Every entity carries:
- `updated_at` -- ISO timestamp of last modification (used for conflict resolution)
- `_version` -- Numeric version counter (incremented on conflict merge)
- `device_id` -- ID of the device that last modified the record (used as tiebreaker)
- `deleted` -- Boolean soft-delete flag

### Authentication Flow

```
AUTHENTICATION MODES
====================

1. SUPABASE AUTH (online)
   - Email + password via Supabase Auth
   - PKCE flow for security
   - Session stored in localStorage
   - Auto token refresh

2. OFFLINE AUTH
   - Credentials cached in IndexedDB (offlineCredentials table)
   - Session cached in IndexedDB (offlineSession table)
   - On reconnect: re-authenticate with Supabase BEFORE allowing sync
   - If credentials are invalid: block sync, redirect to login
   - Offline changes are preserved (not cleared) for re-auth

3. RECONNECT SECURITY
   - When transitioning online -> offline -> online:
     * Cached password is re-validated with Supabase
     * Sync is blocked until validation succeeds
     * This prevents unauthorized data modification if
       the password was changed on another device while offline
```

### Multi-Device Sync Timeline

```
Device A (phone)                    Supabase                    Device B (laptop)
      |                                |                              |
      |-- Create task "Buy milk" ----->|                              |
      |   (push via HTTP)              |                              |
      |                                |-- WebSocket notification --->|
      |                                |                              |
      |                                |   Pull: "Buy milk" arrived  |
      |                                |                              |
      |                                |<-- Complete "Buy milk" ------|
      |                                |    (push via HTTP)           |
      |<-- WebSocket notification -----|                              |
      |                                |                              |
      | Pull: "Buy milk" = completed   |                              |
      |                                |                              |

OFFLINE SCENARIO:
      |                                |                              |
      |-- [OFFLINE] --                 |                              |
      |  Create "Read book"            |                              |
      |  (saved to IndexedDB +         |                              |
      |   queued in syncQueue)         |                              |
      |                                |                              |
      |-- [BACK ONLINE] --            |                              |
      |  1. Validate credentials       |                              |
      |  2. Push "Read book"  -------->|                              |
      |  3. Pull any changes  <--------|                              |
      |                                |-- WebSocket: "Read book" --->|
```

---

## 9. Development Dependencies

These are tools used only during development and are NOT included in the production bundle:

| Package | Version | Purpose |
|---------|---------|---------|
| `svelte` | ^5.0.0 | The Svelte compiler (transforms `.svelte` files to JS) |
| `@sveltejs/kit` | ^2.21.0 | SvelteKit framework (routing, SSR, data loading) |
| `@sveltejs/adapter-auto` | ^4.0.0 | Auto-detects deployment target |
| `@sveltejs/vite-plugin-svelte` | ^5.0.0 | Vite plugin for Svelte compilation |
| `vite` | ^6.0.0 | Build tool and dev server |
| `typescript` | ^5.0.0 | TypeScript compiler |
| `svelte-check` | ^4.3.5 | Type-checks Svelte files |
| `eslint` | ^9.39.2 | JavaScript/TypeScript linter |
| `@eslint/js` | ^9.39.2 | ESLint core JavaScript rules |
| `eslint-plugin-svelte` | ^3.14.0 | ESLint rules for Svelte files |
| `typescript-eslint` | ^8.54.0 | ESLint rules for TypeScript |
| `globals` | ^17.2.0 | Global variable definitions for ESLint |
| `prettier` | ^3.8.1 | Code formatter |
| `prettier-plugin-svelte` | ^3.4.1 | Prettier support for `.svelte` files |
| `knip` | ^5.82.1 | Dead code detector (finds unused exports, files, and dependencies) |

### NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite dev` | Start development server with HMR |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Preview production build locally |
| `check` | `svelte-check` | Type-check all Svelte and TS files |
| `check:watch` | `svelte-check --watch` | Type-check in watch mode |
| `lint` | `eslint src` | Lint all source files |
| `lint:fix` | `eslint src --fix` | Auto-fix lint issues |
| `format` | `prettier --write ...` | Format all source files |
| `format:check` | `prettier --check ...` | Check formatting without changes |
| `dead-code` | `knip` | Find unused code |
| `dead-code:fix` | `knip --fix` | Remove unused code |
| `cleanup` | `lint:fix + format` | Fix lint issues and format |
| `validate` | `check + lint + dead-code` | Full validation suite |

---

## 10. Runtime Dependencies

These are the libraries included in the production bundle:

| Package | Version | Purpose | Bundle Chunk |
|---------|---------|---------|-------------|
| `@supabase/supabase-js` | ^2.49.0 | Supabase client (REST API, Auth, Realtime WebSocket) | `vendor-supabase` |
| `dexie` | ^4.2.1 | IndexedDB wrapper (local database, live queries, transactions) | `vendor-dexie` |
| `date-fns` | ^4.1.0 | Date utility library (formatting, parsing, comparison) | `vendor-date-fns` |

The dependency count is intentionally minimal (only 3 runtime dependencies). This keeps the bundle small and reduces supply chain risk. Each dependency is split into its own vendor chunk by the Vite config for optimal caching.
