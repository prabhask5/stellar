# Stellar Planner -- Tech Stack & Framework Documentation

Stellar is a self-hosted, offline-first productivity Progressive Web App (PWA) built with modern web technologies. It lets users manage tasks, plans, routines, and focus sessions across multiple devices. The app works fully offline using a local IndexedDB database, syncs to a Supabase PostgreSQL backend when online, and uses a custom intent-based sync engine with three-tier conflict resolution for multi-device consistency. The entire frontend is a single-page application powered by Svelte 5 and SvelteKit 2, bundled by Vite, and served as an installable PWA via a custom service worker.

---

## Table of Contents

1. [Svelte 5 + SvelteKit 2 (Frontend Framework)](#1-svelte-5--sveltekit-2-frontend-framework)
2. [TypeScript (Language)](#2-typescript-language)
3. [Dexie.js / IndexedDB (Local Database)](#3-dexiejs--indexeddb-local-database)
4. [Supabase (Backend-as-a-Service)](#4-supabase-backend-as-a-service)
5. [Sync System (@stellar/sync-engine)](#5-sync-system-stellarsync-engine)
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

Stellar's entire local data layer is built on Dexie, managed by `@stellar/sync-engine`. The database schema versions are defined inline in the `initEngine()` call in `src/routes/+layout.ts` via the `database` config option. The engine creates the Dexie instance, auto-merges system tables, and handles migrations. Stellar has no direct `dexie` dependency.

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
| `longTermTasks` | Long-term tasks and reminders with due dates | `user_id`, `due_date`, `category_id` |
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

> **Note:** The system tables (`syncQueue`, `offlineCredentials`, `offlineSession`) and the `conflictHistory` diagnostic table are managed by the `@stellar/sync-engine` package. Stellar's application code does not interact with these tables directly.

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

### Client Access

The database instance is managed by `@stellar/sync-engine`. Repository files use the engine's generic CRUD APIs and utility functions:

```typescript
import { generateId, now } from '@stellar/sync-engine/utils';
import { engineCreate, engineQuery } from '@stellar/sync-engine/data';
```

All entity IDs are UUIDs generated client-side via `generateId()`. Timestamps are ISO 8601 strings via `now()`. This is essential for offline-first operation: the client can create entities without consulting the server.

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

> **Note:** Supabase client initialization, authentication flows (including offline credential caching and PKCE), and runtime configuration management are handled by the `@stellar/sync-engine` package. See the [engine FRAMEWORKS.md](https://github.com/prabhask5/stellar-engine/blob/main/FRAMEWORKS.md) for implementation details.

### Runtime Configuration

Stellar uses runtime configuration instead of build-time environment variables. This allows a single build to be deployed with different Supabase instances. The config is:

1. Fetched from the server (`/api/config` endpoint) on first load
2. Cached in `localStorage` for instant subsequent loads and offline PWA support
3. Used by the engine to lazily initialize the Supabase client

---

## 5. Sync System (@stellar/sync-engine)

Stellar's sync system is provided by the `@stellar/sync-engine` package, an external dependency hosted at [github.com/prabhask5/stellar-engine](https://github.com/prabhask5/stellar-engine). See the [engine FRAMEWORKS.md](https://github.com/prabhask5/stellar-engine/blob/main/FRAMEWORKS.md) for complete documentation of the sync architecture, Supabase integration, and offline capabilities.

Stellar has zero direct dependencies on `@supabase/supabase-js` or `dexie`. All infrastructure is encapsulated by `@stellar/sync-engine` via its subpath exports (`/data`, `/auth`, `/stores`, `/utils`, `/actions`, `/config`, `/types`).

Stellar configures the engine with 13 entity tables in `src/routes/+layout.ts`.

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
   - Email + password via Supabase Auth (PIN padded in single-user mode)
   - PKCE flow for security
   - Session stored in localStorage
   - Auto token refresh
   - Optional email confirmation on signup
   - Optional device verification via OTP on untrusted devices
   - Email change via changeSingleUserEmail() + confirmation flow

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

4. DEVICE VERIFICATION (optional)
   - On untrusted devices, unlockSingleUser() triggers OTP via signInWithOtp()
   - User receives a verification email and clicks the link
   - /confirm page verifies the OTP and sends AUTH_CONFIRMED via BroadcastChannel
   - completeDeviceVerification() trusts the device and starts sync
   - Trusted devices are tracked in the Supabase trusted_devices table
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
| `@stellar/sync-engine` | ^1.0.0 | Local-first sync engine (manages Supabase, Dexie, auth, sync) | `vendor-supabase`, `vendor-dexie` (transitive) |
| `date-fns` | ^4.1.0 | Date utility library (formatting, parsing, comparison) | `vendor-date-fns` |

The dependency count is intentionally minimal (only 2 direct runtime dependencies). Supabase and Dexie are transitive dependencies provided by `@stellar/sync-engine` -- stellar has no direct imports of either. This keeps the bundle small and reduces supply chain risk.
