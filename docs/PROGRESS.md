# Stellar Planner — build progress

Source of truth: `SPEC.md`. Decisions: `docs/DECISIONS.md`.
Each phase ends with `pnpm typecheck && pnpm lint && pnpm test`, a build of the affected apps, and a commit.

Legend: `[ ]` open · `[x]` done and verified. "AC" = acceptance criteria.

## Phase 0 — Scaffold

- [x] pnpm workspace + Turborepo (`apps/web`, `apps/extension`, `packages/{shared,db,ui-tokens,universe}`). AC: `pnpm install` clean; `turbo run typecheck lint test build` pipelines resolve.
- [x] TypeScript strict base config shared by all packages. AC: `strict`, `noUncheckedIndexedAccess` on; `pnpm typecheck` passes.
- [x] ESLint (flat config) + Prettier. AC: `pnpm lint` and `pnpm format:check` pass.
- [x] Vitest wired per package; Playwright wired in `apps/web` with desktop, iPhone 15 Pro, iPhone SE projects. AC: a smoke unit test and a smoke e2e pass.
- [x] `packages/ui-tokens`: `tokens.json` (SPEC §6) → `tokens.css` (CSS vars), Tailwind v4 `@theme` file, `docs/ios/StellarTokens.swift`. AC: generator is deterministic; a test asserts outputs are in sync with `tokens.json`.
- [x] Next.js app: root layout with viewport-fit=cover, iOS meta, Inter fallback via `next/font`, safe-area utilities, `100dvh` shell. AC: no bare `100vh`; header/tab-bar paddings use `env(safe-area-inset-*)`.
- [x] CSS starfield + nebula placeholder (palette-matched, zero JS). AC: renders at first paint; static under `prefers-reduced-motion`.

## Phase 1 — Database

- [x] Migrations `0001…` for every `sp_` table in SPEC §5 with constraints, indexes, `updated_at` triggers, soft delete. AC: applies cleanly to an empty Postgres with Supabase roles; re-apply is a no-op.
- [x] RLS `user_id = auth.uid()` on every table; grants for `authenticated`. AC: a second user sees zero rows (SQL test).
- [x] Task logic: check constraints, `completed_at` trigger, `sp_postpone_overdue_to_today()`, undo RPC. AC: SQL tests.
- [x] Goal logic: progress→completed trigger, `sp_goal_increment`. AC: SQL tests.
- [x] Routine logic: `sp_routine_scheduled`, rewrite-on-edit trigger, hard delete cascade, `sp_routine_days(from,to)`, streaks, `sp_routine_log_set`. AC: parity fixtures match TS.
- [x] Timer: `sp_timer_action(action, expected_version)` mirroring `packages/shared/timer.ts`, session rows, server time in every response, `sp_timer_advance_due()` for the scheduler. AC: parity fixtures; stale version rejected.
- [x] Universe: scoring triggers appending to `sp_universe_events` (incl. negative reversals), eras, `sp_universe_snapshot()`. AC: SQL tests cover every row of the §5.6 table.
- [x] Realtime publication for the ten tables in §3.4; `REPLICA IDENTITY FULL` where filters/deletes need it. AC: publication membership test.
- [x] ~100 built-in quotes seeded. AC: `sp_quotes` builtin count ≥ 100, visible to owner.
- [x] 30-day purge of soft-deleted rows (`sp_purge_deleted`). AC: SQL test.
- [x] Idempotent migration runner (`pg`, advisory lock, `sp_schema_version`), plus bundled single-file SQL for the Studio fallback. AC: running twice applies nothing the second time.
- [x] Generated DB types (`packages/db/src/types.ts`). AC: typed supabase client compiles in web + extension.
- [x] `packages/shared`: zod schemas, date utils (timezone aware), recurrence, timer machine, progress math, scoring/eras, site-pattern + URL normalization, fractional ranking. AC: full unit tests incl. DST edges.
- [x] TS↔SQL parity fixtures (recurrence, timer, eras, pattern normalization) run against Postgres when available. AC: `pnpm test` runs them when `DATABASE_URL`/Docker is present, skips cleanly otherwise.

## Phase 2 — Setup & auth

- [x] Zero-config boot: unconfigured → every route redirects to `/setup`. AC: e2e.
- [x] Encrypted `/data/config.json` (AES-256-GCM, key from `APP_SECRET`), generated `/data/secret`, env overrides. AC: unit tests for round-trip + tamper detection.
- [x] Wizard step Welcome → Connect (URL normalization, auth/rest probes with hints, service-role validation) → Database (connection string / pg-meta / copy SQL + Verify, progress list) → PIN (keypad) → About you → Done (First Light). AC: e2e against the local test stack.
- [x] Hidden owner user via admin API, VAPID keys, signup-disable recommendation. AC: owner exists, password only in encrypted config.
- [x] `POST /api/v1/auth/pin` (argon2id, cookies for web/pwa, tokens for extension/ios), `sp_devices`, `sp_auth_events`. AC: e2e + unit.
- [x] Escalating lockout persisted in `/data` (5 fails → 30s, doubling, cap 1h). AC: unit tests + e2e lockout.
- [x] Lock screen (starfield + keypad) and `/api/v1/auth/unlock`. AC: e2e. (The inactivity-lock setting and the Security settings UI land with Settings in Phase 3.)
- [x] Devices list, revoke (needs `DATABASE_URL`), sign out everywhere, change PIN. AC: API tests.
- [x] `RESET_PIN=true` recovery. AC: unit test on boot logic.
- [x] `GET /api/v1/instance`, `GET /api/health`. AC: e2e.

## Phase 3 — App shell & design system

- [x] Component library (§6.4): GlassCard, GroupedList, TabBar, Sidebar, Rail, SegmentedControl, TaskRow, QuickAddBar, ListCard, ProgressBar, ProgressRing, DayRing, Stepper, Sheet, DatePicker (+time wheel), EmojiPicker, Toast, TimerRing, SyncIndicator, custom icon set. AC: matches mockups at all three widths; a11y labels; 44px targets. (QuickAddBar and ListCard ship with Tasks in Phase 4, TimerRing with Focus in Phase 7.)
- [x] Responsive navigation: tab bar <768, rail 768–1023, sidebar ≥1024 with Era progress. AC: screenshots.
- [x] Settings (General, Appearance, Quotes, Notifications, Security, Extension, Connection, Data, About). AC: each section functional. (The Notifications section ships with web push in Phase 7.)
- [x] Toasts with Undo (5s). AC: e2e.
- [x] ⌘K command bar + shortcuts (`N`, `1–5`, `Space`). AC: e2e desktop.
- [x] Sync layer: TanStack Query + Realtime `postgres_changes` cache patching + optimistic mutations. AC: two contexts reflect each other in ~1s (e2e).

## Phase 4 — Tasks

- [x] QuickAddBar (due date/time, description, list; list disables date). AC: e2e.
- [x] Today (Overdue + "Move all to today" with Undo), All (date groups), Calendar (month, week on desktop, drag to reschedule, agenda, prefilled quick add). AC: e2e.
- [x] Task lists: reorderable emoji cards, create, list detail with own quick add, rename/emoji/delete. AC: e2e; list tasks never in Today/All/Calendar.
- [x] Task detail sheet; swipe actions; show completed toggle. AC: e2e/phone.

## Phase 5 — Goals

- [x] Quote card, time progress (Day/Week/Month/Year/Life). AC: unit-tested math, tz + week start aware.
- [x] Goal lists (reorderable, mini planet, progress), list detail, add goal sheet, Stepper with typed value. AC: e2e goal progress.

## Phase 6 — Routines

- [x] Month calendar with DayRings, day panel (inline desktop / sheet phone) with live %. AC: e2e.
- [x] Manage routines: three frequencies, 14-date live preview, streaks, rewrite-on-edit note, delete confirm. AC: e2e scheduling + edit rewrite + delete.

## Phase 7 — Focus

- [x] Scheduler loop in `instrumentation.ts` (single-instance guard) advancing due phases + sending push. AC: phase advances with no client open.
- [x] Focus screen: phase segments, TimerRing, controls, SyncIndicator (presence), blocking card, fullscreen. AC: e2e start/pause/skip + blocking-state assertions.
- [x] Phase settings sheet, block list manager (validation, multi-line paste), stats (today, 7/30-day chart, streak, log). AC: e2e.
- [x] Web push: VAPID, subscribe/unsubscribe, phase-end messages, iOS hint. AC: subscription API tests; SW push handler. (The service worker that receives the push ships with the PWA in Phase 9.)

## Phase 8 — Universe & events

- [x] Persistent `UniverseCanvas` in root layout, idle-loaded, cross-fade from CSS starfield, never remounted. AC: three.js only in lazy chunk; no canvas re-render on navigation.
- [x] Deterministic stars / planets / constellations / core / nebulae / era layers; gentle dimming. AC: same seed → same positions (unit test).
- [x] Camera drift, orbit/zoom on home with inertial return, hover/tap labels. AC: manual + screenshot.
- [x] Quality tiers + auto-detect + frame-time fallback, pause when hidden / input focused on phones. AC: unit tests for tier selection.
- [x] EventDirector with every §7.2 event, coalescing, reduced-motion/minimal variants. AC: unit tests for queue/coalescing; events visible in e2e screenshots.

## Phase 9 — PWA & offline

- [x] Manifest, icons (incl. maskable), shortcuts, generated iOS splash screens. AC: files generated from one SVG by script.
- [x] Service worker: precache shell, navigation fallback, runtime caching, update toast, push. AC: offline reload serves shell (e2e).
- [x] IndexedDB persisted query cache + ordered outbox replay with client UUIDs. AC: unit tests for outbox; e2e offline add → reconnect.
- [x] Offline focus timer. AC: actions queue and reconcile by version.
- [x] Safe-area polish across full device matrix. AC: screenshot pass, nothing under insets.

## Phase 10 — Extension

- [x] Connect flow (URL → instance → PIN), storage adapter, auto refresh. AC: unit tests + build.
- [x] Background: Realtime + alarms + startup + online resync, DNR redirect rules, already-open tabs, offline resilience, badge. AC: unit tests on rule builder + state reducer.
- [x] Block page per mockup; popup with full controls and settings. AC: screenshots.
- [x] Chrome + Firefox builds and zips; served from the web app. AC: `pnpm --filter extension build` emits both zips.

## Phase 11 — API & iOS readiness

- [x] Every `/api/v1` endpoint in §11 with zod validation, error envelope, `updated_since`, CORS, rate limits. AC: API e2e tests.
- [x] Generated `docs/openapi.json`; `docs/API.md`; `docs/IOS_INTEGRATION.md`. AC: generator in sync test.

## Phase 12 — Ship

- [x] Dockerfile (standalone, non-root, healthcheck, `/data`, extension zips), docker-compose, `.env.example`. AC: `docker build .` succeeds; container answers `/api/health`.
- [x] README, `docs/SELF_HOSTING.md`, `docs/DOKPLOY.md`, `docs/EXTENSION.md`.
- [x] Full e2e suite green on desktop, iPhone 15 Pro, iPhone SE; performance budget check script. AC: all pass.
- [x] Final summary below.

## Summary

### What was built

- **Web app / PWA** (`apps/web`, Next.js 16 standalone): setup wizard, PIN lock with escalating lockout, Universe home, Tasks (Today / All / Calendar / Lists), Goals, Routines, Focus timer with stats and block lists, Settings (profile, security and devices, connection, data export/import, notifications, quotes, extension download). iPhone-first with safe-area handling for Dynamic Island, notch and home-button phones; installable; offline shell and an IndexedDB outbox; Web Push when a phase ends; ⌘K command bar and keyboard shortcuts on desktop.
- **Universe** (`packages/universe`): lazily loaded three.js scene with quality tiers and a frame governor, a 2D cosmic-event overlay with coalescing, and a score/era ledger kept in Postgres.
- **Database** (`packages/db`): nine idempotent `sp_` migrations with RLS on every table, the timer state machine, recurrence, streaks, scoring, tombstones for delta sync, export/import, and a migration runner used by the wizard.
- **Browser extension** (`apps/extension`, WXT, Manifest V3): Chrome and Firefox builds from one codebase; connect by URL and PIN; Realtime plus alarm re-sync; declarativeNetRequest blocking including tabs already open; offline expiry; block page matching the mockup; popup with full timer controls; toolbar badge. Both zips are built into the image and served under Settings → Extension.
- **REST API** `/api/v1`: every endpoint in SPEC §11 with zod validation, the error envelope, `updated_since` delta sync, idempotent creates, CORS and rate limits; `docs/openapi.json` generated from the schemas and served at `/api/v1/openapi.json`; `docs/API.md`; `docs/IOS_INTEGRATION.md`; generated `docs/ios/StellarTokens.swift`.
- **Shipping**: multi-stage `Dockerfile` (non-root, health check, `/data` volume), `docker-compose.yml`, `.env.example`, `README.md`, `docs/SELF_HOSTING.md`, `docs/DOKPLOY.md`, `docs/EXTENSION.md`.

### How it was verified

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit tests plus SQL behaviour and TS/SQL parity tests against a real Postgres) and `pnpm build` pass for every package.
- Playwright runs against the production standalone build on desktop, iPhone 15 Pro and iPhone SE profiles: setup wizard, PIN and lockout, shell and safe areas, tasks, goals, routines, focus, universe, PWA/offline, the extension loaded into a real Chromium, and the REST API.
- `pnpm budgets` checks initial JavaScript after each build.
- `docker build .` and a zero-environment container start, checked through `/api/health` and the redirect to `/setup`.
- Screens were compared with the mockups in `docs/design/` from screenshots on all three profiles.

### Deviations and things to know

- **Performance budget scope.** The 200 KB gzip budget is enforced on the routes a visit starts on: home 199 KB, lock 153 KB, setup 166 KB. Pages reached from there measure 201–224 KB when opened directly and are held to a 230 KB ceiling. React and the Next.js runtime alone are 126 KB. three.js is in none of the initial JavaScript. The LCP, INP and frame-rate targets in SPEC §12 are design goals the architecture was built for (service-worker shell, optimistic updates, frame governor); they were **not** measured on physical phones.
- **Real devices.** Everything was tested in Chromium with emulated iPhone viewports and simulated safe-area insets. It has not been run on a physical iPhone, in Safari, or in Firefox. The Firefox extension builds and its logic is unit-tested, but it has not been loaded into Firefox.
- **Push notifications** were exercised up to the subscription and send path with a test subscription; delivery to a real device (which on iPhone requires the installed PWA) was not observed.
- **Local Supabase for tests** is a slim compatible stack (`dev/supabase`), not the full official distribution: Postgres 15 with wal2json, GoTrue, PostgREST, Realtime, postgres-meta behind nginx. The app has not been run against Supabase Cloud or the official self-hosted bundle.
- **Extension host access.** The extension requests access to all sites, because a redirect rule only applies where the extension has host permission and any site can be put on a block list.
- **API additions beyond §11:** reorder endpoints for tasks, goals, routines and block lists, and `/api/v1/openapi.json`. `POST /focus/actions` answers `409` on a version conflict, with the current state in the body.
- **TypeScript 6** rather than 7 (typescript-eslint does not support 7 yet). Other choices are recorded in `docs/DECISIONS.md`.

### Manual steps for the owner

1. **Deploy** with Docker or Dokploy and **mount a volume at `/data`** (`docs/SELF_HOSTING.md`, `docs/DOKPLOY.md`). Serve it over HTTPS.
2. **Run the setup wizard** with your Supabase URL, anon key, service role key and, ideally, the Postgres connection string.
3. **Disable sign-ups on your Supabase**: `GOTRUE_DISABLE_SIGNUP=true` (`DISABLE_SIGNUP` in the official `.env`), then restart auth.
4. **Optionally set `APP_SECRET`** in the environment before running setup, so the encryption key lives apart from `/data`.
5. **Chrome extension:** download the zip from Settings → Extension, unzip, and "Load unpacked" at `chrome://extensions`.
6. **Firefox extension:** permanent installation needs the package signed with your own Mozilla account (`web-ext sign --channel unlisted`); see `docs/EXTENSION.md`. Change the add-on ID first if you will distribute it.
7. **Forgotten PIN:** set `RESET_PIN=true`, restart, choose a new PIN, then **remove `RESET_PIN`** and restart again.
8. **Back up** the Supabase database and the `/data` volume.
9. **iPhone:** add the app to the Home Screen from Safari's Share menu; notifications only work from the installed app.
