# Stellar Planner

Context for agents and maintainers. This file and the code are the whole truth; there is no other design document.

## 1. What it is

A self-hosted, single-user planner: tasks, long-term goals, daily routines and a Pomodoro-style focus timer, drawn over a spiral galaxy that answers what the owner does. One Docker container (Next.js) on top of the owner's own Supabase. Surfaces: the web app, the same app installed as a PWA (the primary iPhone experience), and **Stellar Focus**, a Chrome/Firefox extension with the synced timer and site blocking. Dark theme only. No sound. No accounts: one owner, one PIN.

Product pillars, used to break ties:

1. **Speed first.** Every interaction is optimistic; nothing the user taps waits on the network. The cosmos never delays first paint, input or navigation.
2. **Clean where you touch, cosmic where you look.** Controls follow Apple's design language. The maximalism lives in the galaxy behind the interface and in the events that play inside it, which never block input.
3. **A galaxy that answers you.** The universe is a backdrop, at full richness from the first launch. What the owner does plays in it as a momentary event: a finished task is a shooting star into a spiral arm. It keeps no record: there are no levels, scores, eras or counters.

## 2. Architecture

pnpm workspaces + Turborepo. Internal packages export TypeScript source (`./src/*.ts`) and are transpiled by Next (`transpilePackages`) and Vite (WXT); there is no per-package build.

| Path                 | What it is                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web`           | Next.js App Router app: UI, PWA service worker, setup wizard, `/api/v1`, scheduler                   |
| `apps/extension`     | WXT (Manifest V3) extension for Chrome and Firefox                                                   |
| `packages/shared`    | Pure logic used by both apps: dates, recurrence, timer state machine, progress, zod schemas, OpenAPI |
| `packages/db`        | SQL migrations, the embedded migration bundle and runner, generated table types                      |
| `packages/ui-tokens` | `tokens.json` → CSS variables and the Tailwind theme                                                 |
| `packages/universe`  | The galaxy: a WebGL2 renderer in a worker, the cosmic events, and the event bus                      |
| `dev/`               | Local Supabase stacks (see [dev/README.md](dev/README.md))                                           |
| `tests/`             | Every test (see [tests/README.md](tests/README.md))                                                  |
| `scripts/`           | `check-budgets.mjs` and `check-links.mjs`, both run in CI                                            |

### Data flow

- **Rules live in Postgres.** Constraints, triggers and RPC functions decide; every object is prefixed `sp_` in `public` (the Supabase project may host other apps), and every table has RLS `user_id = auth.uid()`. `packages/shared` mirrors the rules in TypeScript for instant UI, and parity tests hold the two to the same fixtures.
- **The browser talks to Supabase directly** (PostgREST, RPC, Realtime) with a short-lived access token. `apps/web/lib/client/data/*` is the data layer; each table is one TanStack Query entry holding an array, and views are pure functions from `packages/shared` over those arrays.
- **Optimistic UI + outbox** (`lib/client/outbox.ts`). A mutation updates the cache, then queues an operation in IndexedDB; operations are sent in order, survive reloads and replay after offline. Inserts carry client ids (insert-or-ignore). An update that waited is guarded by `updated_at` (last write wins) unless one of our own operations on that row already landed. Tabs share one queue. Failures that can heal are retried; a refusal drops the operation, reloads the collection and shows a toast; a conflict reloads silently.
- **Realtime** (`lib/client/realtime.ts`): one authenticated channel for the tables in `REALTIME_TABLES` (`packages/db/src/index.ts`) plus presence ("N devices in sync"). Rows with queued operations ignore incoming echoes. Hard-delete tables have an unfiltered DELETE listener.
- **`/api/v1`** (`apps/web/app/api/v1`) is a thin REST facade over the same tables and RPCs for integrations: it forwards the caller's bearer token so RLS applies. Shared plumbing is in `lib/server/resource.ts` (delta sync with `updated_since` + `deleted_ids`, idempotent create, update, delete, reorder) and `lib/server/http.ts` (error envelope `{ error: { code, message } }`, CORS, rate limits). The document served at `/api/v1/openapi.json` is built by `packages/shared/src/openapi.ts` from the zod schemas.
- **Auth.** The setup wizard creates one hidden Supabase user (`owner@stellar.local`, random password kept only in the encrypted config). `POST /api/v1/auth/pin` verifies the PIN (argon2id) and signs that user in. Web/PWA: the refresh token lives only in httpOnly cookies (`sp-auth`, via `@supabase/ssr`); the page fetches a short-lived access token from `GET /api/v1/auth/session` and keeps it in memory. Extension and API clients receive tokens in the response body. `proxy.ts` only checks that the cookie exists (no network on navigation); the API accepts tokens for the owner's user id only. Five wrong PINs lock sign-in globally (30 s, doubling, 1 h cap, persisted in `lockout.json`); a per-IP in-memory limiter covers auth and setup endpoints.
- **Setup wizard + config.** Unconfigured instances send every page to `/setup` (`components/setup`, `app/api/setup/*`, `lib/server/setup.ts`). Config is `config.json` in the data directory, AES-256-GCM with a key derived from `APP_SECRET` (generated into `secret` when not set by env). Data directory: `/data` in the container, `STELLAR_DATA_DIR` to override, `apps/web/.data` in local dev. Env values override stored ones (`lib/server/config.ts`).
- **Boot and scheduler.** `instrumentation.ts` → `lib/server/boot.ts`: applies `RESET_PIN`, migrates the schema (Postgres connection string if configured, otherwise the instance's pg-meta endpoint with the service role key; retried, never throws), and starts one scheduler loop (`lib/server/scheduler.ts`, every 2 s) that advances due timers through `sp_scheduler_tick`, sends each phase-end web push once, and purges soft-deleted rows daily.
- **Service worker** (`apps/web/sw/sw.ts`, built by `scripts/build-sw.mjs` after `next build`): precaches the shell, serves pages stale-while-revalidate, shows push notifications. It never caches API or Supabase responses; data lives in the persisted query cache and the outbox, and signing out deletes both.
- **Pages are static shells.** No data is server-rendered. List detail is a query parameter (`/tasks?list=…`), so every page can be precached.

### Extension (`apps/extension`)

- Entrypoints: `background.ts`, `popup/`, `blocked/` (the block page). Logic is in `lib/`: `background.ts` (sync loop), `client.ts` (supabase-js with a `storage.local` adapter), `rules.ts` (declarativeNetRequest rule builder), `blocking.ts` (block decision, badge), `storage.ts`, `api.ts` (instance discovery and PIN sign-in).
- Connect: instance URL → `GET /api/v1/instance` → PIN → `POST /api/v1/auth/pin` with `kind: "extension"`.
- No state in memory: connection, session and the last snapshot are in `storage.local`. The background re-syncs on install, browser start, a 30-second alarm, `online`, popup or block-page open and every Realtime event, reading everything through the `sp_focus_get` RPC.
- Blocking uses dynamic redirect rules (`regexFilter` + `regexSubstitution`, so the block page can offer the original address once the phase ends; `urlFilter` fallback past 900 domains or when a regex is refused). Tabs already open on a blocked site are redirected.
- Offline: a running focus phase blocks until its cached end time, then an alarm lifts the block; a paused one blocks until a state change arrives. A session that is really gone (not merely offline) clears the cached state.
- Firefox: add-on id `stellar-focus@stellar.local`, minimum version 140, `data_collection_permissions: authenticationInfo`. Host permissions are optional there, so the popup requests them on connect.
- `wxt zip` also builds a sources archive for Mozilla's reviewers from the workspace root; its contents are listed in `wxt.config.ts` and explained in [apps/extension/README.md](apps/extension/README.md).

### Universe and events (`packages/universe`, `apps/web/components/universe`)

A spiral galaxy drawn behind the interface, and momentary events for what the owner does. It is purely a backdrop: it shows nothing about the owner's data and stores nothing. **Priority, always: interaction latency, then frame rate and battery, then richness.**

- **One custom WebGL2 renderer, no three.js.** `renderer/engine.ts` owns the GL context and the frame loop and is driven only by messages (`protocol.ts`). `host.ts` (main thread) creates the one canvas and forwards size, page, quality, focus, events with their screen origins, pointer input, visibility and reduced motion.
- **Worker first.** The engine runs in a worker on the canvas's OffscreenCanvas (`worker.ts`) wherever a worker can draw WebGL2 (Chrome 80, Firefox 114, Safari 17); otherwise the same engine is loaded on the main thread behind the same messages. The host asks the worker to try before it transfers the canvas (a transfer cannot be undone), and never reads the user agent. The worker is bundled by `apps/web/scripts/build-universe-worker.mjs` (esbuild) into `public/universe-worker.js`, not by Next: Turbopack passes a worker its chunk list in the URL fragment, and WebKit gives a worker its URL without one.
- **Lazy.** The server-rendered CSS starfield (`components/sky`) is the first paint. `UniverseHost` (root layout, mounted once, never remounted) imports `@stellar/universe/react` from an idle callback once signed in; the canvas fades in over the starfield (400 ms) after its first galaxy frame, then the starfield is hidden. Without WebGL2 the starfield stays and there are no events. `bus.ts` and `state.ts` are the only universe modules in initial JavaScript, and they import nothing.
- **Galaxy** (`renderer/galaxy.ts`): generated once from a fixed seed into typed arrays: an exponential disk, two major and two minor log-spiral arms (pitch 13°), a bar and bulge, young blue stars and pink star-forming knots on the arms, dust on each arm's trailing edge, an unresolved-starlight haze and a far sky. Every point stores its orbit; the vertex shader moves it, so the CPU never touches a star after upload. Arms, knots and dust turn rigidly at one pattern speed (the spiral never winds up); only the bulge and the field stars turn differentially. The first 60,000 stars are the same on every tier.
- **Picture** (`renderer/shaders.ts`): half-float scene target (8-bit fallback), additive light with multiplicative dust, bloom (half → quarter downsample, separable blur), an analytic core glow, ACES tone mapping, vignette, dither. The anti-flicker rules are mandatory: a point smaller than a minimum size is drawn at that size with its light scaled down by area; no twinkle; the first bloom downsample averages 4×4 pixels; point sizes are clamped to the device's maximum. Colours are the `universe.*` design tokens (`renderer/palette.ts`).
- **Live on every page** (`modes.ts`, one table from page to framing). **Home** is explorable: drag to orbit with inertia, pinch or scroll to zoom, double tap to reset, a slow orbit after 4 s idle; the input surface is Home's stage element, the canvas itself never takes pointer events. **Focus** has a closer, lower, fixed framing, with the core below the timer. **Every other page** has the galaxy wide and dimmer behind its content, still turning. Between pages the camera eases; nothing cuts. A hidden tab draws nothing.
- **Reduced motion**: the sky is still on every page. The galaxy is drawn once and no frame is requested while idle; an event wakes it for a soft glow of at most 400 ms where it started (the cached galaxy plus the glow are composited, the stars are not redrawn), and a change of page cross-fades (300 ms).
- **Quality** (`renderer/quality.ts`): a tier sets star count, pixel budget and bloom only: High 190k / 2.4 MP / bloom, Balanced 110k / 1.4 MP / bloom, Low 60k / 0.9 MP / none. The stored setting keeps its old values (`auto | cinematic | balanced | minimal`, labelled Auto, High, Balanced, Low). Auto reads the GPU string, memory, cores, data saver and battery, then judges the first 120 live frames; a step-down is remembered for a week and **never applied mid-view**, only at the next navigation or mode change, under the cross-fade. With Auto, software rendering and data saver get Low and a still sky, and so does a device those frames show cannot move the galaxy at all (under about 12 frames a second; WebKit, for one, hides that its GPU is software): there the sky goes still at once, under a cross-fade, and that is remembered too. `html[data-tier="low"]` also drops the interface's blur.
- **Events** (`bus.ts`, `renderer/effects.ts`): the app calls `emitCosmic()`; events emitted before the host has loaded are replayed. Each type is one spec (duration, origin, target, particle program); all particles come from one pool of 6,000. An event's target is a real star on a major arm picked by hashing the item's id, so the same item always lands in the same place.

  | Event                  | Trigger                             | Effect                                                  |
  | ---------------------- | ----------------------------------- | ------------------------------------------------------- |
  | `task_created`         | quick add, create, Undo of a delete | motes condense on an arm star, a pop and a small ring   |
  | `task_completed`       | checkbox, swipe, Today card         | a shooting star from the control, then an ignition      |
  | `task_uncompleted`     | uncheck, Undo                       | a flare, then a streak back towards the control         |
  | `task_deleted`         | delete                              | the star flickers and collapses into red embers         |
  | `overdue_postponed`    | "Move all to today"                 | a comet across the disk, its tail longer with the count |
  | `goal_progress`        | stepper, increment                  | a pulse along the star's arm, as strong as the step     |
  | `goal_completed`       | a goal reaches 100% or is checked   | a larger ignition with two staggered rings              |
  | `routine_checked`      | a routine's day is done             | a small shooting star                                   |
  | `routine_day_complete` | the day's routines reach 100%       | a meteor shower                                         |
  | `focus_started`        | a focus phase begins (any device)   | the camera pushes in, the core brightens, a ring wave   |
  | `focus_break`          | a break begins (any device)         | the core relaxes, a faint ring settles inwards          |
  | `focus_completed`      | a focus phase runs out (any device) | a core flare, a particle shell and a big ring           |

  While a focus phase is on, the galaxy turns at half speed with a slightly brighter core and the camera sits closer. Nothing is emitted for edits, reordering, renames or navigation.

- **Coalescing**: the same type again starts 120 ms after the one before; at most six of a type at once; a burst of more than six task completions becomes one meteor shower; nothing waits longer than 1.5 s.
- **Emitters live in the client data layer** (`apps/web/lib/client/data/*`): they fire when the owner's own optimistic mutation is applied, never on its Realtime echo, and Undo emits the inverse. Task, goal and routine changes from other devices emit nothing. The focus events are the exception: `watchFocusEvents` (`data/focus.ts`) derives them from every change of the shared timer in the cache, so they play on every open device, once.
- **Zero per-frame allocations**: the frame loop and the effect programs only write into arrays that exist before the first frame.
- **Test hook**: `window.__stellarUniverse` has `events()` (the log of emitted types), `emit()` and `probe()` (the engine's state, frame count, and how many pixels around the galaxy's centre are lit, read back inside the engine because a transferred canvas cannot be read from the page).

### Demo mode (`/demo`, `lib/client/demo.ts`, `demo-data.ts`)

A public switch that runs the real interface on invented data held in memory. One cookie (`sp-demo`) lets a visitor reach the page shells, which contain no data. In demo mode `api()`, `getSession()` and `getSupabase()` refuse before touching the network, the outbox neither stores nor sends, and the persisted cache is never opened. Every API still requires the owner's session. Settings sections that need a server are hidden.

## 3. Data model

All tables have `user_id` (default `auth.uid()`, cascade from `auth.users`), `created_at`, `updated_at` (trigger). Ordered tables use `sort_order double precision`: a reorder writes one row with the midpoint of its neighbours; `sp_rebalance` respaces when a gap runs out.

| Table                                   | Holds                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `sp_tasks`, `sp_task_lists`             | Tasks (name, description, due date/time, list, completed) and their lists; soft delete |
| `sp_goals`, `sp_goal_lists`             | Todo and progress goals (current/total amount, unit) in lists; soft delete             |
| `sp_events`                             | Upcoming events: name, emoji, date, optional time; hard delete                         |
| `sp_routines`, `sp_routine_logs`        | Routine templates and per-day results (`routine_id`, `date`); hard delete              |
| `sp_focus_state`, `sp_focus_settings`   | One row each per owner: the timer and its settings (incl. `active_block_list_ids`)     |
| `sp_focus_sessions`                     | One row per finished or abandoned phase                                                |
| `sp_block_lists`, `sp_block_list_sites` | Block lists (soft delete) and their normalised domain patterns (hard delete)           |
| `sp_settings`                           | Time zone, week start, birthdate, lifespan, quality tier, lock timeout                 |
| `sp_quotes`                             | Built-in and the owner's quotes                                                        |
| `sp_devices`, `sp_auth_events`          | Signed-in devices and the sign-in log                                                  |
| `sp_push_subscriptions`                 | Web push endpoints                                                                     |
| `sp_tombstones`                         | Ids of hard-deleted rows, so delta sync can report them                                |
| `sp_applied_ops`                        | Operation ids of goal increments already applied (idempotency)                         |
| `sp_schema_version`                     | Applied migration versions                                                             |

Semantics that bite:

- **Tasks.** One task object, several views (`packages/shared/src/task-views.ts`, SQL `sp_tasks_view`), all in the owner's time zone. Today: no list, due today or earlier, split into Overdue and Today. All: no list, by due date, undated last. Calendar: no list, has a date. List detail: that list. **List tasks have no dates** (check constraint; moving a task into a list clears them), so they never appear in Today, All or Calendar. Deleting a list soft-deletes its tasks with the same timestamp, so Undo restores exactly those.
- **Goals.** Todo progress is 0 or 1; progress goals `min(current / total, 1)` and complete themselves when `current >= total` (trigger). List progress is the mean over its goals. Increments are sent as deltas with an operation id (`sp_goal_increment`), so offline increments from several devices add up and a replay applies once. Past 100% is display only (`goalOver`, up to `MAX_OVER` = 3×); completion and averages use the capped value.
- **Routines.** Day instances are **computed, not stored** (`isScheduled` in `recurrence.ts`, SQL `sp__scheduled`); only results are stored in `sp_routine_logs`. **Editing rewrites history:** logs on days no longer scheduled are deleted, and a change of type or total resets the remaining logs. **Deleting is a hard delete** that cascades to all logs and writes tombstones (`sp_routines.deleted_at` exists but is unused). Day completion is the mean progress of that day's instances. A streak counts consecutive scheduled days completed back from today; an unfinished today does not break it.
- **Timer.** State machine in `packages/shared/src/timer.ts`, mirrored by `sp_timer_action(action, expected_version)`, the only writer of `sp_focus_state` and `sp_focus_sessions` (both select-only for the owner). Status `idle | running | paused | awaiting` (a phase ended and auto-start is off); phase `focus | short_break | long_break`; actions `start | pause | resume | skip | end | advance`. Every action checks and increments `version` and rejects stale writes, so several devices advancing at once is harmless. Remaining time is derived from `phase_ends_at` (or `paused_remaining_ms`), never ticked; `phase_total_ms` fixes a phase's length when it starts. The server scheduler is the authoritative advancer; clients also send a fallback `advance`. Clients apply the action locally first, then reconcile with the server's answer.
- **Blocking rule.** Blocking is active iff `phase = 'focus'` and status is `running` or `paused`. **Blocks stay on while a focus phase is paused.** Breaks, `awaiting` and `idle` unblock. There is no bypass on the block page.
- **Events.** Countdown maths is in `countdown.ts`: calendar years and months, then weeks and days, then the clock; the last day counts real time so it reaches zero exactly.
- **The database knows nothing about the universe.** Migration 0011 dropped the stardust ledger (`sp_universe_events`), the era functions and the scoring triggers; 0013 dropped `sp_universe_snapshot()`, the last function that served the old scene. Earlier migrations still create them (that is history; they run in order and end with nothing). `/api/v1/universe/snapshot` is gone with it. Do not reintroduce progression.
- **Soft vs hard delete.** Tasks, goals and the three kinds of list soft-delete (`deleted_at`, purged after 30 days). Routines, routine logs, block sites, quotes and events hard-delete and leave tombstones.

## 4. Design system

- Tokens live in `packages/ui-tokens/tokens.json`. `pnpm tokens` regenerates `css/tokens.css` (CSS variables `--sp-*`) and `css/theme.css` (Tailwind v4 `@theme`); both are committed and a unit test fails when they drift. The web app imports them in `app/globals.css`, the extension in `assets/base.css`, the universe (the `universe.*` colours, which are not emitted as CSS) through `renderer/palette.ts`. Component primitives are in `apps/web/components/ui`.
- **Palette "Nebula Gold", dark only.** Void `#070615`, glass surfaces over the sky, Starlight Gold `#F6C76E` as the single accent, violet and azure for secondary data, `warning` for overdue (always with a word), `success`, `danger`.
- **Apple-clean UI, cosmos in the background.** System font stack with Inter as the fallback, Apple's type ramp, inset-grouped lists, hairline separators. Depth comes from glass and light, not shadows.
- **One glow per view:** only the primary action or progress of a screen glows.
- **No emoji as icons.** UI icons are the line set in `components/ui/icons.tsx`. Emoji appear only as identities the owner picked (lists, routines, events).
- **Safe areas.** Never hardcode an inset. Components read `--sat/--sar/--sab/--sal`, defined only as `env(safe-area-inset-*)`. Backgrounds are full-bleed under the insets; content respects them. Use `dvh`/`svh`, never bare `100vh`. Tests simulate insets with the `sp-insets-*` classes on `<html>`.
- **Touch.** Targets are at least 44×44 (small controls get an invisible hit area on coarse pointers). Chrome is not selectable. Inputs are at least 16px on phones. Pressed state appears on pointerdown (`TouchFeel`).
- **Motion.** Quick and springy (durations and springs are tokens); sheets use a short tween and are opaque. Navigation is immediate; tab switches never animate. Ambient loops belong to the universe only. With `prefers-reduced-motion`, loops stop, events become a glow and transitions become fades.
- **Copy voice.** Warm, calm, second person, sentence case. No exclamation marks, no space puns in errors. Empty states get one gently cosmic line.

## 5. Invariants and conventions

- **Migrations are immutable and idempotent.** Never edit, rename or reorder a file in `packages/db/migrations/`; production has applied them. Add a new numbered file written so it can be re-run (`create … if not exists`, `create or replace`, `drop … if exists`), then run `pnpm --filter @stellar/db bundle` to regenerate `src/bundle.generated.ts` (a test checks it is in sync). Migrations run on every boot. Their comments may mention files that no longer exist; that is history, leave it.
- **TS ↔ SQL parity.** Recurrence, streaks, the timer and site normalisation exist in both languages. Change both and extend `packages/shared/src/fixtures.ts`; `tests/db/parity.test.ts` runs the SQL against the same fixtures.
- **Performance budgets** (`pnpm budgets`, after a build): initial JavaScript ≤ 200 KB gzip on `/`, `/lock` and `/setup`, ≤ 230 KB on the other pages, and none of the universe in any of it; the universe itself (layer, engine chunk and worker script together) ≤ 45 KB gzip; three.js not installed. The universe's runtime budgets are held by `tests/e2e/universe.spec.ts`: a still sky (reduced motion) draws no frames while idle, and an event burst while a list scrolls causes no main-thread task over 50 ms. Keeping this means: zod stays out of the browser, `@supabase/supabase-js` and Motion's engine load lazily, and sheets, popovers and the command bar fetch their implementation on idle or first open (`lib/client/preloadable.tsx`).
- **Errors and rollbacks.** Never block the UI on a write. A failed write is handled by the outbox (see Data flow), not by the caller. API errors use the envelope; Postgres errors map to 400/403/404/409.
- **iPhone PWA rules.** Safe areas as above; the install hint shows only in iOS Safari outside the installed app; push needs the Home Screen app and is requested only from a button; haptics use the native switch trick on iOS and `navigator.vibrate` elsewhere (`lib/client/haptics.ts`), and nothing is simulated where neither exists.
- **Device kind `ios`.** `sp_devices.kind` allows `web | pwa | extension | ios`. `ios` is the legacy name for devices that sign in through the REST API with tokens in the response body; the UI labels it "API client". Keep the value: it is in a migration constraint and the API schema.
- **Next.js.** The installed version differs from older releases; read the guides under `apps/web/node_modules/next/dist/docs` before using an API from memory. `agentRules: false` in `next.config.ts` stops `next dev` from writing its own agent file.
- **TypeScript** is pinned to `~6.0` because of `typescript-eslint`. Scripts run directly with Node's type stripping, so relative imports in files Node executes need the `.ts` extension.

## 6. Common tasks

| Change                | Where                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add a field           | New migration + `bundle`; `packages/db/src/types.ts` (`gen-types` against the dev stack); zod schema in `packages/shared/src/schemas.ts`; the data module in `apps/web/lib/client/data/`; export/import if it is user content. Tests: `tests/db/behaviour.test.ts`, `tests/unit/shared/schemas.test.ts`                                                                                                      |
| Add an API endpoint   | `apps/web/app/api/v1/<path>/route.ts` using `api()`, `guard()` and `resource.ts`; add it to `OPERATIONS` in `packages/shared/src/openapi.ts` (a unit test fails on an undocumented route). Tests: `tests/e2e/api.spec.ts`                                                                                                                                                                                    |
| Add a screen          | `apps/web/app/(app)/<route>/page.tsx` + `components/<feature>/`; navigation in `components/shell/nav.tsx`; add the route to `SHELL_ROUTES` in `sw/sw.ts` and to `ROUTES` in `scripts/check-budgets.mjs`. Tests: a spec in `tests/e2e/`, and a step in `screens.spec.ts`                                                                                                                                      |
| Add a cosmic event    | The union and `COSMIC_EVENT_TYPES` in `packages/universe/src/bus.ts`; its spec and particle program in `renderer/effects.ts` (write into `Particles`, allocate nothing); a colour in `tokens.json` → `universe.fx` if it needs one; then `emitCosmic()` in the data module that applies the mutation, and the table in this file. Tests: `tests/unit/universe/effects.test.ts`, `tests/e2e/universe.spec.ts` |
| Extension feature     | `apps/extension/lib/` (keep rule building and decisions pure so they stay unit-testable). Tests: `tests/unit/extension/logic.test.ts`, `tests/e2e/extension.spec.ts` (Chromium), `tests/extension-firefox/smoke.mjs`                                                                                                                                                                                         |
| Change a design token | `packages/ui-tokens/tokens.json`, then `pnpm tokens`                                                                                                                                                                                                                                                                                                                                                         |

## 7. Commands

| Command                                        | What it does                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm stack:up` / `pnpm stack:down`            | Start / stop and wipe the local Supabase stack (`dev/supabase`, gateway on :54321)           |
| `pnpm dev`                                     | Web app on :3000; run through `/setup` with the keys in `dev/supabase/dev.env`               |
| `pnpm dev:seed [--keep]`                       | Fill the local instance with a realistic data set (after setup; refuses non-local databases) |
| `pnpm build`                                   | Extension for both browsers, zips into `apps/web/public/extension/`, then the web app        |
| `pnpm budgets`                                 | Initial-JavaScript budget check, after a build                                               |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Types (apps, packages, tests), ESLint, Prettier                                              |
| `pnpm test`                                    | Unit tests (no services)                                                                     |
| `pnpm test:db`                                 | SQL behaviour, migrations and parity (needs the stack)                                       |
| `pnpm test:e2e [--project=<name>]`             | Playwright against the standalone build (needs the stack and a build)                        |
| `pnpm test:firefox`                            | Real-Firefox extension smoke test (needs the stack, a build and Firefox)                     |
| `pnpm test:all`                                | All four suites                                                                              |
| `pnpm tokens`                                  | Regenerate the CSS from `tokens.json`                                                        |
| `pnpm screenshots`                             | Regenerate the README images in `.github/assets/screenshots/` from demo mode                 |
| `pnpm --filter @stellar/db bundle`             | Re-embed the migrations after adding one                                                     |
| `pnpm --filter @stellar/db gen-types`          | Regenerate `src/types.ts` from the migrated dev stack                                        |
| `pnpm --filter @stellar/web pwa:assets`        | Regenerate icons and iPhone splash screens from `apps/web/assets/icon.svg` (committed)       |
| `node apps/web/scripts/copy-emoji.mjs`         | Refresh the self-hosted emoji data after upgrading `emojibase-data` (committed)              |
| `pnpm --filter @stellar/extension dev`         | Extension dev mode in Chrome (`dev:firefox` for Firefox)                                     |

## 8. Testing and CI

All tests are in `tests/` and are found by glob, so adding, renaming or deleting a test file needs no configuration change. Layout, aliases and prerequisites are in [tests/README.md](tests/README.md).

- `tests/unit/**/*.test.ts` and `tests/db/**/*.test.ts`: Vitest projects `unit` and `db` (`tests/vitest.config.ts`).
- `tests/e2e/*.spec.ts`: Playwright; every spec runs in every project of `tests/playwright.config.ts`, with animations on, and every test ends with the screen-wide invariants in `tests/e2e/support/invariants.ts`.
- `tests/extension-firefox/smoke.mjs`: Selenium + geckodriver, because Playwright cannot load extensions into Firefox.

CI is `.github/workflows/ci.yml`, on pull requests and pushes to `main`: `static` (format, lint, typecheck, links, and a guard that fails on a test file outside `tests/`), `unit`, `db`, `build` (build, budgets, Docker image), `e2e` (one job per Playwright project; the matrix is read from the Playwright config, so adding a project adds a job), `extension-firefox`, and `required`, which fails unless every other job succeeded. **`required` is the only check branch protection needs**, so jobs can be added or removed without touching repository settings. Never make CI green by weakening a test.

### Pull requests: the work is not done until CI is green

Never push to `main`; open a pull request and stay with it.

1. Before pushing, run only the quick checks: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`. Do not run `pnpm test:db` or `pnpm test:e2e` locally first and wait on them: pushing to the pull request starts CI, which runs every suite. Run those locally only to reproduce a failure CI reported (see [tests/README.md](tests/README.md)).
2. After every push, wait for the checks: `gh pr checks <number> --watch`. A full run takes about 12 minutes. Do not report the work as finished, and do not start unrelated work on the branch, while checks are pending or red.
3. When a job fails, read its log (`gh run view <run-id> --log-failed`, or the `e2e-report-<project>` artifact with the trace) and fix the cause. CI retries a failed e2e test once. A test that passes on its retry has passed: it is listed as flaky in the job log, with its trace in the artifact, and needs no follow-up; only a test that failed both attempts is annotated on the pull request and fails the job. When fixing one that does fail, find the signal the test should have waited for (the helpers in `tests/e2e/support/helpers.ts`), never add a sleep, a retry or a looser assertion.
4. CI browsers run on Linux, which differs from a Mac: Firefox has WebGL only with a display (`xvfb-run`), and WebKit paints in software (hence 1× pixel density there). To reproduce a Linux-only failure locally, run the suite inside Playwright's image (`mcr.microsoft.com/playwright:v<version>-noble`) against the stack on the host.
5. Merge only when `required` is green.

## 9. Deployment

- `Dockerfile`: three stages on `node:24-bookworm-slim`; the runtime holds Next's standalone output, static assets and `public/` (including both extension zips), runs as the `node` user, exposes 3000, declares `VOLUME /data` and a health check on `/api/health`. `docker-compose.yml` runs it locally.
- **Mount `/data`** (encrypted config, generated secret, lockout counters). Without it every redeploy returns to the setup wizard. Any host that runs the image with a volume at `/data` and HTTPS in front of port 3000 works; serverless platforms (Vercel and the like) do not, because of the on-disk config and the scheduler loop.
- **No env is required.** Optional overrides, which win over the wizard: `APP_SECRET`, `PUBLIC_APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (see `.env.example`).
- **`RESET_PIN=true`** clears the PIN on every boot while set and re-keys the hidden owner (signing out every device). Set it, restart, choose a PIN, remove it, restart.
- **Connecting to Supabase.** The Supabase URL must be the public HTTPS one, because browsers and the extension call it directly. The Postgres connection string is used only by the server (migrations, per-device revoke), so it must be reachable **from the container**: for a Supabase on the same host that usually means its pooler or database service on a shared Docker network, not `localhost`. Without one, migrations go through pg-meta and per-device revoke is hidden.
- Updating is redeploying; migrations apply themselves on start.

## 10. Key decisions

- **Logic in Postgres, mirrored in TypeScript.** One source of truth for every client; the mirror exists only for optimistic UI and is kept honest by parity tests.
- **Direct browser → Supabase** rather than proxying through Next: the fastest path, and RLS is the guard.
- **Refresh token in httpOnly cookies, access token in memory**, so page scripts never hold the long-lived credential while the browser still talks to Supabase directly.
- **Global PIN lockout, not per IP:** there is one owner, so guesses are counted together.
- **Idempotent migrations embedded in the bundle,** so the runner, the pg-meta path and the paste-into-SQL-editor fallback share one source and the standalone server reads no files.
- **Hard-delete with tombstones** where history must really go (routines) or Undo re-inserts the same id (events); soft delete elsewhere so offline clients can sync deletions.
- **Goal increments are deltas with operation ids,** so offline increments add up and replays apply once.
- **The universe is a backdrop, not a record.** It used to grow with the owner's history (stars per task, planets per goal, eras); that made the sky a second, slower copy of the data and tied its cost to how much the owner had done. Now it is the same galaxy for everyone and only reacts.
- **One WebGL2 renderer in a worker, written for this scene,** instead of three.js on the main thread: about 30 KB instead of several hundred, no main-thread frame work, and events are particles in the same 3D scene rather than a 2D layer over it.
- **Live behind content too.** The galaxy keeps turning on every page, not only on Home and Focus: a sky that stops when you open a list reads as broken. It can afford to, because drawing is in a worker and costs the main thread nothing; the price is GPU time and battery while the app is in front, which reduced motion (a still sky) and the Low tier are there to cut.
- **The worker is built with esbuild, outside Next,** because Turbopack's worker bootstrap depends on the URL fragment, which WebKit strips: the bundled worker would silently never start in Safari.
- **No third-party requests at runtime:** emoji data is self-hosted, the GPU tier is classified locally, fonts come through `next/font`.
- **e2e runs against the standalone build with animations on.** It is the artefact the Docker image runs, and reduced motion once hid a navigation that froze the page.
- **WebKit with iPhone descriptors is the primary mobile target** in tests; Chromium phone projects add real touch input. Non-Chromium swipes are synthesised pointer events, which exercise our gesture code, not the browser's.
- **Extension rules redirect by regex** so the block page can offer the original address; host access to all sites is required because a redirect only applies where the extension has host permission.
- **Demo mode is client-only:** no demo user or rows exist, so it cannot leak or damage the owner's data.

## Known limitations

- Dynamic Type is not honoured: the type ramp is fixed pixels.
- Timer actions made offline replay against the server's clock when the connection returns; the device's timestamps are not carried over.
- An access token already in memory stays valid until it expires (up to an hour) after "Sign out everywhere" or a device revoke.
- Blocking is per browser profile and by domain (no paths); private windows are covered only if the extension is allowed there. It is a commitment device, not parental control.
- Per-device revoke needs the Postgres connection string.
- A hosted Supabase project with neither a connection string nor pg-meta needs its migrations pasted by hand (Settings → Connection).
- Supabase Realtime limits database changes per instance (100 a second by default, averaged over a minute). After a larger burst, such as an import or deleting a big list, it broadcasts no changes for up to a minute; other devices catch up when they next refetch (on return to the app, or on reload). Tests that time a live update call `realtimeDelivering()` first for the same reason.
- Real-finger behaviour on iPhone (haptics, system back swipe, WebKit touch handling) is only checked by hand.
- The universe's frame time on a real phone is only checked by hand (budget: 8 ms a frame in the worker on an iPhone 13-class device at Balanced). To measure: open the app in Safari with Web Inspector attached and run `await __stellarUniverse.probe()` on Home; `frameMs` is the average frame interval and `workMs` the time the engine spends building a frame. CI draws WebGL in software, where neither number means anything.
- Without WebGL2 the CSS starfield stays and no event is shown. In Safari 16 and older the engine runs on the main thread.
