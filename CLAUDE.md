# Stellar Planner

Context for agents and maintainers. This file and the code are the whole truth; there is no other design document.

## 1. What it is

A self-hosted, single-user planner: tasks, long-term goals, daily routines and a Pomodoro-style focus timer, drawn over a personal 3D universe that reflects what the owner has done. One Docker container (Next.js) on top of the owner's own Supabase. Surfaces: the web app, the same app installed as a PWA (the primary iPhone experience), and **Stellar Focus**, a Chrome/Firefox extension with the synced timer and site blocking. Dark theme only. No sound. No accounts: one owner, one PIN.

Product pillars, used to break ties:

1. **Speed first.** Every interaction is optimistic; nothing the user taps waits on the network. The cosmos never delays first paint, input or navigation.
2. **Clean where you touch, cosmic where you look.** Controls follow Apple's design language. The maximalism lives in the background universe and in full-screen events, which never block input.
3. **Your universe reflects you.** A completed task is a star, a goal a planet, a routine a constellation. The galaxy itself is at full richness from the first launch; there are no levels or scores.

## 2. Architecture

pnpm workspaces + Turborepo. Internal packages export TypeScript source (`./src/*.ts`) and are transpiled by Next (`transpilePackages`) and Vite (WXT); there is no per-package build.

| Path                 | What it is                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web`           | Next.js App Router app: UI, PWA service worker, setup wizard, `/api/v1`, scheduler                   |
| `apps/extension`     | WXT (Manifest V3) extension for Chrome and Firefox                                                   |
| `packages/shared`    | Pure logic used by both apps: dates, recurrence, timer state machine, progress, zod schemas, OpenAPI |
| `packages/db`        | SQL migrations, the embedded migration bundle and runner, generated table types                      |
| `packages/ui-tokens` | `tokens.json` → CSS variables and the Tailwind theme                                                 |
| `packages/universe`  | The three.js scene, the 2D event overlay and the cosmic event bus                                    |
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

- Two layers. The persistent scene is WebGL behind the interface (`canvas.tsx`, built imperatively in `scene-core.ts`), mounted once in the root layout and never remounted on navigation. Cosmic events paint on a separate 2D canvas above the interface with `pointer-events: none` (`event-overlay.tsx`, `overlay.ts`).
- No React in the hot path: the app writes to a vanilla zustand store (`store.ts`); the canvas subscribes. three.js is imported from an idle callback, only when signed in and the tier is not Minimal. A server-rendered CSS starfield (`components/sky`) is the first paint and the Minimal tier.
- Deterministic sky: positions come from hashing ids (`layout.ts`). Data comes from the `sp_universe_snapshot` RPC: a star per completed, undeleted task (recent ones by id, older ones as per-month counts), planets per goal grouped by list, constellations per routine.
- Quality tiers (`quality.ts`): Cinematic, Balanced, Minimal, or Auto (GPU renderer string, memory, cores, data saver, battery; reduced motion → Minimal; a frame governor steps down after 3 s over budget). The scene holds its frame while the page scrolls, a finger is down or keys are typed.
- Events: the app calls `emitCosmic()` (`bus.ts`); `EventDirector` (`director.ts`) queues, coalesces same-kind events and times them. Kinds: `task_completed`, `overdue_postponed`, `goal_progress`, `goal_completed`, `goal_list_completed`, `routine_instance`, `routine_day_complete`, `streak_rekindled`, `focus_start`, `focus_complete`. On Minimal or reduced motion each becomes a brief glow.

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
- **Scoring and eras were removed.** Migration 0011 dropped the stardust ledger (`sp_universe_events`), the era functions and the scoring triggers. Earlier migrations still create them; nothing in the app reads them. Do not reintroduce progression.
- **Soft vs hard delete.** Tasks, goals and the three kinds of list soft-delete (`deleted_at`, purged after 30 days). Routines, routine logs, block sites, quotes and events hard-delete and leave tombstones.

## 4. Design system

- Tokens live in `packages/ui-tokens/tokens.json`. `pnpm tokens` regenerates `css/tokens.css` (CSS variables `--sp-*`) and `css/theme.css` (Tailwind v4 `@theme`); both are committed and a unit test fails when they drift. The web app imports them in `app/globals.css`, the extension in `assets/base.css`, the universe through `palette.ts`. Component primitives are in `apps/web/components/ui`.
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
- **Performance budgets** (`pnpm budgets`, after a build): initial JavaScript ≤ 200 KB gzip on `/`, `/lock` and `/setup`, ≤ 230 KB on the other pages, and no three.js in any of it. Keeping this means: zod stays out of the browser, `@supabase/supabase-js` and Motion's engine load lazily, and sheets, popovers and the command bar fetch their implementation on idle or first open (`lib/client/preloadable.tsx`).
- **Errors and rollbacks.** Never block the UI on a write. A failed write is handled by the outbox (see Data flow), not by the caller. API errors use the envelope; Postgres errors map to 400/403/404/409.
- **iPhone PWA rules.** Safe areas as above; the install hint shows only in iOS Safari outside the installed app; push needs the Home Screen app and is requested only from a button; haptics use the native switch trick on iOS and `navigator.vibrate` elsewhere (`lib/client/haptics.ts`), and nothing is simulated where neither exists.
- **Device kind `ios`.** `sp_devices.kind` allows `web | pwa | extension | ios`. `ios` is the legacy name for devices that sign in through the REST API with tokens in the response body; the UI labels it "API client". Keep the value: it is in a migration constraint and the API schema.
- **Next.js.** The installed version differs from older releases; read the guides under `apps/web/node_modules/next/dist/docs` before using an API from memory. `agentRules: false` in `next.config.ts` stops `next dev` from writing its own agent file.
- **TypeScript** is pinned to `~6.0` because of `typescript-eslint`. Scripts run directly with Node's type stripping, so relative imports in files Node executes need the `.ts` extension.

## 6. Common tasks

| Change                | Where                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a field           | New migration + `bundle`; `packages/db/src/types.ts` (`gen-types` against the dev stack); zod schema in `packages/shared/src/schemas.ts`; the data module in `apps/web/lib/client/data/`; export/import if it is user content. Tests: `tests/db/behaviour.test.ts`, `tests/unit/shared/schemas.test.ts` |
| Add an API endpoint   | `apps/web/app/api/v1/<path>/route.ts` using `api()`, `guard()` and `resource.ts`; add it to `OPERATIONS` in `packages/shared/src/openapi.ts` (a unit test fails on an undocumented route). Tests: `tests/e2e/api.spec.ts`                                                                               |
| Add a screen          | `apps/web/app/(app)/<route>/page.tsx` + `components/<feature>/`; navigation in `components/shell/nav.tsx`; add the route to `SHELL_ROUTES` in `sw/sw.ts` and to `ROUTES` in `scripts/check-budgets.mjs`. Tests: a spec in `tests/e2e/`, and a step in `screens.spec.ts`                                 |
| Add a cosmic event    | The union in `packages/universe/src/bus.ts`, duration in `director.ts`, drawing in `overlay.ts`, then `emitCosmic()` at the trigger. Tests: `tests/unit/universe/logic.test.ts`, `tests/e2e/universe.spec.ts`                                                                                           |
| Extension feature     | `apps/extension/lib/` (keep rule building and decisions pure so they stay unit-testable). Tests: `tests/unit/extension/logic.test.ts`, `tests/e2e/extension.spec.ts` (Chromium), `tests/extension-firefox/smoke.mjs`                                                                                    |
| Change a design token | `packages/ui-tokens/tokens.json`, then `pnpm tokens`                                                                                                                                                                                                                                                    |

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

## 9. Deployment

- `Dockerfile`: three stages on `node:24-bookworm-slim`; the runtime holds Next's standalone output, static assets and `public/` (including both extension zips), runs as the `node` user, exposes 3000, declares `VOLUME /data` and a health check on `/api/health`. `docker-compose.yml` runs it locally.
- **Mount `/data`** (encrypted config, generated secret, lockout counters). Without it every redeploy returns to the setup wizard. On Dokploy: an Application built from the Dockerfile, a volume at `/data`, an HTTPS domain on port 3000.
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
- **Two canvases for the universe:** events are 2D so they work on every tier, need no second WebGL context and cost nothing while idle.
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
- Real-finger behaviour on iPhone (haptics, system back swipe, WebKit touch handling) is only checked by hand.
