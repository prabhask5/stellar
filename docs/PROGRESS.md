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

- [ ] QuickAddBar (due date/time, description, list; list disables date). AC: e2e.
- [ ] Today (Overdue + "Move all to today" with Undo), All (date groups), Calendar (month, week on desktop, drag to reschedule, agenda, prefilled quick add). AC: e2e.
- [ ] Task lists: reorderable emoji cards, create, list detail with own quick add, rename/emoji/delete. AC: e2e; list tasks never in Today/All/Calendar.
- [ ] Task detail sheet; swipe actions; show completed toggle. AC: e2e/phone.

## Phase 5 — Goals

- [ ] Quote card, time progress (Day/Week/Month/Year/Life). AC: unit-tested math, tz + week start aware.
- [ ] Goal lists (reorderable, mini planet, progress), list detail, add goal sheet, Stepper with typed value. AC: e2e goal progress.

## Phase 6 — Routines

- [ ] Month calendar with DayRings, day panel (inline desktop / sheet phone) with live %. AC: e2e.
- [ ] Manage routines: three frequencies, 14-date live preview, streaks, rewrite-on-edit note, delete confirm. AC: e2e scheduling + edit rewrite + delete.

## Phase 7 — Focus

- [ ] Scheduler loop in `instrumentation.ts` (single-instance guard) advancing due phases + sending push. AC: phase advances with no client open.
- [ ] Focus screen: phase segments, TimerRing, controls, SyncIndicator (presence), blocking card, fullscreen. AC: e2e start/pause/skip + blocking-state assertions.
- [ ] Phase settings sheet, block list manager (validation, multi-line paste), stats (today, 7/30-day chart, streak, log). AC: e2e.
- [ ] Web push: VAPID, subscribe/unsubscribe, phase-end messages, iOS hint. AC: subscription API tests; SW push handler.

## Phase 8 — Universe & events

- [ ] Persistent `UniverseCanvas` in root layout, idle-loaded, cross-fade from CSS starfield, never remounted. AC: three.js only in lazy chunk; no canvas re-render on navigation.
- [ ] Deterministic stars / planets / constellations / core / nebulae / era layers; gentle dimming. AC: same seed → same positions (unit test).
- [ ] Camera drift, orbit/zoom on home with inertial return, hover/tap labels. AC: manual + screenshot.
- [ ] Quality tiers + auto-detect + frame-time fallback, pause when hidden / input focused on phones. AC: unit tests for tier selection.
- [ ] EventDirector with every §7.2 event, coalescing, reduced-motion/minimal variants. AC: unit tests for queue/coalescing; events visible in e2e screenshots.

## Phase 9 — PWA & offline

- [ ] Manifest, icons (incl. maskable), shortcuts, generated iOS splash screens. AC: files generated from one SVG by script.
- [ ] Service worker: precache shell, navigation fallback, runtime caching, update toast, push. AC: offline reload serves shell (e2e).
- [ ] IndexedDB persisted query cache + ordered outbox replay with client UUIDs. AC: unit tests for outbox; e2e offline add → reconnect.
- [ ] Offline focus timer. AC: actions queue and reconcile by version.
- [ ] Safe-area polish across full device matrix. AC: screenshot pass, nothing under insets.

## Phase 10 — Extension

- [ ] Connect flow (URL → instance → PIN), storage adapter, auto refresh. AC: unit tests + build.
- [ ] Background: Realtime + alarms + startup + online resync, DNR redirect rules, already-open tabs, offline resilience, badge. AC: unit tests on rule builder + state reducer.
- [ ] Block page per mockup; popup with full controls and settings. AC: screenshots.
- [ ] Chrome + Firefox builds and zips; served from the web app. AC: `pnpm --filter extension build` emits both zips.

## Phase 11 — API & iOS readiness

- [ ] Every `/api/v1` endpoint in §11 with zod validation, error envelope, `updated_since`, CORS, rate limits. AC: API e2e tests.
- [ ] Generated `docs/openapi.json`; `docs/API.md`; `docs/IOS_INTEGRATION.md`. AC: generator in sync test.

## Phase 12 — Ship

- [ ] Dockerfile (standalone, non-root, healthcheck, `/data`, extension zips), docker-compose, `.env.example`. AC: `docker build .` succeeds; container answers `/api/health`.
- [ ] README, `docs/SELF_HOSTING.md`, `docs/DOKPLOY.md`, `docs/EXTENSION.md`.
- [ ] Full e2e suite green on desktop, iPhone 15 Pro, iPhone SE; performance budget check script. AC: all pass.
- [ ] Final summary below.

## Summary

_Written at the end of the run._
