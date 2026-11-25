# Stellar Planner — Product & Technical Specification

> Single source of truth for building Stellar Planner. Every requirement here is in scope unless marked **(later)**. When this document is silent, make the decision that best serves the three product pillars below, and record it in `docs/DECISIONS.md`.

## 0. Product pillars (use these to break ties)

1. **Speed first.** Every interaction feels instant. Optimistic UI everywhere: nothing the user taps waits on the network. The cosmic visuals must never delay first paint, input, or navigation.
2. **Clean where you touch, cosmic where you look.** Interactive UI follows Apple's design language: calm, minimal, precise, system font, generous touch targets. The maximalist cosmos lives in the persistent background universe and in full-screen *events*. Events never block input.
3. **Your universe reflects you.** Every completed task is a star, every goal a planet and every routine a constellation in a personal 3D universe. The galaxy itself is at full richness from the first launch: there are no levels to unlock.

Single user, self-hosted, deployed as a Docker container on Dokploy, backed by the owner's existing self-hosted Supabase. Dark theme only. **No sound anywhere.**

---

## 1. Surfaces

| Surface | Tech | Notes |
|---|---|---|
| Web app | Next.js (App Router) + TypeScript | Desktop + mobile browsers |
| PWA | Same web app, installable | Primary iPhone experience; offline-capable; web push |
| Browser extension | WXT (MV3), React | Chrome/Chromium + Firefox from one codebase; real-time synced focus timer and website blocking |
| Native iOS app **(later)** | SwiftUI | Not built now. This build ships a versioned REST API, an OpenAPI spec, design tokens exported to Swift, and `docs/IOS_INTEGRATION.md` so the app can be built later against any instance's public URL |

---

## 2. Repository & stack

pnpm workspaces + Turborepo monorepo:

```
stellar-planner/
├─ apps/
│  ├─ web/                 # Next.js app: UI, PWA, /api/v1, setup wizard, scheduler
│  └─ extension/           # WXT extension (chrome + firefox targets)
├─ packages/
│  ├─ shared/              # Pure TS: zod schemas, types, timer state machine, recurrence,
│  │                       # progress math, date utils (timezone aware)
│  ├─ db/                  # SQL migrations (numbered), migration runner, generated DB types
│  ├─ ui-tokens/           # Design tokens (tokens.json) → CSS vars, Tailwind theme, Swift file
│  └─ universe/            # React Three Fiber scene + cosmic event system (lazy-loaded)
├─ docs/
│  ├─ SELF_HOSTING.md  DOKPLOY.md  EXTENSION.md  IOS_INTEGRATION.md
│  ├─ API.md  DECISIONS.md  PROGRESS.md
│  └─ openapi.json (generated)
├─ Dockerfile  docker-compose.yml  .env.example
└─ README.md
```

**Stack:** use the latest stable versions at build time and verify APIs against current docs rather than memory.
- Next.js App Router, React, TypeScript `strict`, `output: "standalone"`.
- Tailwind CSS (v4-style CSS-first config), driven by `packages/ui-tokens`.
- Radix primitives (shadcn/ui as a starting point, fully restyled to this spec; it must not look like stock shadcn).
- Motion (framer-motion successor) for UI animation.
- React Three Fiber + drei + @react-three/postprocessing for the universe.
- TanStack Query for server state (optimistic mutations, persisted cache in IndexedDB).
- Zustand for local UI state.
- supabase-js (+ `@supabase/ssr` for cookie sessions in Next).
- dnd-kit for reordering (pointer + touch + keyboard sensors).
- Serwist (or the current recommended Next.js service-worker library) for the PWA.
- `web-push` for notifications.
- zod everywhere at boundaries. OpenAPI generated from the zod schemas.
- Lightweight, lazy-loaded, searchable emoji picker (e.g. Frimousse) with the full emoji set.
- Vitest (unit) + Playwright (e2e).

---

## 3. Architecture

### 3.1 Data access principle
- **Business logic lives in Postgres** (constraints, triggers, RPC functions). That way the web app, extension and future iOS app all behave identically.
- Web app and extension talk **directly to Supabase** (PostgREST + RPC + Realtime) with the owner's session. This is the fastest path, and RLS protects every row.
- `/api/v1` in Next.js is a thin, documented REST facade over the same RPCs and tables, for the native app and any third party. It also hosts the endpoints Supabase can't do alone: PIN auth, setup, instance info, push, health.

### 3.2 Table naming
The owner's Supabase instance may host other projects. **All tables, functions, types and views are prefixed `sp_`** and live in `public`, which PostgREST exposes by default, so no Supabase config changes are needed.

### 3.3 Server responsibilities (Next.js Node runtime, long-running container)
- Setup wizard + encrypted config store.
- PIN authentication and device management.
- **Scheduler loop** (started once from `instrumentation.ts`, about every 2s, guarded so only one loop runs):
  - advances focus timer phases whose `phase_ends_at` has passed (authoritative advancer; clients may also advance as a fallback via the versioned RPC)
  - sends web-push notifications on phase end
- Migration runner on boot (idempotent).
- `/api/v1` facade, `/api/health`.

### 3.4 Realtime
Tables that need live sync are added to the `supabase_realtime` publication: `sp_focus_state`, `sp_focus_settings`, `sp_block_lists`, `sp_block_list_sites`, `sp_tasks`, `sp_task_lists`, `sp_goals`, `sp_goal_lists`, `sp_routines`, `sp_routine_logs`. Clients subscribe with `postgres_changes` filtered by `user_id`, and patch the TanStack Query cache. Two open devices must reflect each other's changes within about 1s.

---

## 4. Self-hosting, setup wizard & auth

### 4.1 Zero-config deploy
The container starts with **no required env vars**. If the app is unconfigured, every route redirects to `/setup`.

Optional env overrides (take precedence over wizard config):
`APP_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `PUBLIC_APP_URL`, `RESET_PIN=true`.

Persistent volume: **`/data`** (config, generated secrets). Document mounting it in Dokploy.

### 4.2 Setup wizard (`/setup`), Apple-style step flow over the starfield
1. **Welcome.** "Stellar Planner" title, one-line intro.
2. **Connect Supabase.** Fields: Supabase URL, anon key, service role key, Postgres connection string (optional but recommended).
   - Normalize the URL: trim whitespace and trailing slashes, strip accidental suffixes like `/rest/v1`, `/auth/v1`, `/api`, add `https://` if missing.
   - Probe `GET {url}/auth/v1/health` and `GET {url}/rest/v1/` (with the anon key). Show clear pass/fail per check with a fix hint, e.g. "Found Supabase at https://database.example.com (you entered …/api)".
   - Validate that the service role key works (admin API call).
3. **Database.**
   - If a connection string is given, run all migrations automatically, with a progress list.
   - If not, try the self-hosted pg-meta endpoint via the service role if available.
   - Otherwise show the full migration SQL with a copy button and "Open your Supabase Studio SQL editor, paste, run", then a **Verify** button that checks the `sp_schema_version` table.
4. **Create your PIN.** 6–12 digits, entered twice. Large iOS-style keypad on touch devices, keyboard on desktop.
5. **About you** (optional, editable later): birthdate + expected lifespan (default 85) for the life progress bar, timezone (auto-detected), week start (Mon/Sun).
6. **Done.** Lands on Universe home.

During setup the server also:
- Generates `APP_SECRET` if not provided and writes it to `/data/secret` (warn in the UI that setting it via env is more secure).
- Writes `/data/config.json`, encrypted with AES-256-GCM using a key derived from `APP_SECRET`.
- Creates the hidden owner auth user via the admin API: `owner@stellar.local` with a random 64-char password, stored only in encrypted config, `email_confirm: true`.
- Generates VAPID keys for web push.
- Shows a recommendation to set `GOTRUE_DISABLE_SIGNUP=true` (or `DISABLE_SIGNUP`) on the Supabase instance. Data stays safe via RLS regardless.

Settings → **Connection** later allows re-testing and re-running migrations, and shows the schema version.

### 4.3 PIN authentication (web, PWA, extension, iOS)
- `POST /api/v1/auth/pin { pin, device: { name, kind: "web"|"pwa"|"extension"|"ios" } }`
  - Verifies the PIN against an argon2id hash in config.
  - On success, the server signs in the hidden owner with password grant and returns the Supabase session (`access_token`, `refresh_token`, `expires_at`). It also records a row in `sp_devices`.
  - Web/PWA: the session is set as httpOnly cookies via `@supabase/ssr` and the response body omits tokens.
  - Extension/iOS: tokens are returned in the JSON body.
- **Rate limiting:** 5 failed attempts → 30s lockout, doubling each further failure, capped at 1 hour. Persist counters in `/data`, so restarts don't reset them. Generic error messages. Log attempts (time, device kind, IP) to `sp_auth_events`.
- Sessions refresh normally through supabase-js. A PIN prompt appears only when the refresh token is invalid.
- **Lock screen:** full-screen starfield + PIN keypad. Optional "Lock after inactivity" setting (off / 5 min / 1 h / 1 day).
- Settings → **Security:**
  - change PIN (requires current PIN)
  - device list with last-seen and revoke (delete that session from `auth.sessions` when `DATABASE_URL` is configured; otherwise hide per-device revoke)
  - "Sign out everywhere" (rotate hidden password + global sign-out)
- `RESET_PIN=true` env: on boot, clears the PIN and puts the app back into the "Create your PIN" step. Document this as the recovery path.

### 4.4 Instance discovery (for extension & iOS)
`GET /api/v1/instance` (public) → `{ name: "Stellar Planner", version, apiVersion: 1, supabaseUrl, supabaseAnonKey, configured: true }`. This lets a client that only knows the app's public URL bootstrap everything.

### 4.5 Dokploy deployment
- Multi-stage `Dockerfile` (Node LTS alpine/slim, pnpm, Next standalone, non-root user, `HEALTHCHECK` on `/api/health`, port 3000, `VOLUME /data`).
- `docker-compose.yml` for local runs / alternative deploys.
- `docs/DOKPLOY.md` covers creating the Application from the Git repo (Dockerfile build), mounting `/data`, adding the domain with HTTPS, optional env vars, updating/redeploying, and backups (`/data` + the Supabase DB).

---

## 5. Data model (Postgres, all `sp_` prefixed, all with RLS `user_id = auth.uid()`)

All rows have `id uuid pk default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `created_at`, `updated_at` (trigger-maintained). Use **soft delete** (`deleted_at`) on user content so offline clients can sync deletions; purge after 30 days. Reorderable entities use `sort_order` as fractional ranking (text or numeric), so a reorder updates exactly one row.

### 5.1 Tasks
```
sp_task_lists   (name text, emoji text, sort_order)
sp_tasks        (name text not null, description text null,
                 due_date date null, due_time time null,
                 list_id uuid null references sp_task_lists on delete cascade,
                 completed boolean default false, completed_at timestamptz null,
                 sort_order, deleted_at)
  CHECK (list_id IS NULL OR (due_date IS NULL AND due_time IS NULL))  -- list tasks have no dates
  CHECK (due_time IS NULL OR due_date IS NOT NULL)
```
Views (owner timezone from `sp_settings`):
- **Today:** `list_id IS NULL AND due_date <= today AND NOT completed`, sorted by `due_date, due_time NULLS LAST, sort_order`. Split into **Overdue** (`due_date < today`) and **Today**.
- **All:** `list_id IS NULL`, sorted by due date ascending, undated tasks last.
- **Calendar:** `list_id IS NULL AND due_date IS NOT NULL`.
- **List detail:** `list_id = X`.

RPC `sp_postpone_overdue_to_today()` moves every incomplete overdue non-list task to today, keeping `due_time`. Returns a count, and the UI offers undo.

### 5.2 Goals
```
sp_goal_lists   (name, emoji, sort_order, deleted_at)
sp_goals        (list_id uuid not null references sp_goal_lists on delete cascade,
                 name text not null, description text null,
                 type text check (type in ('todo','progress')),
                 current_amount numeric default 0, total_amount numeric null,
                 unit text null,            -- optional label e.g. "books"
                 completed boolean default false, completed_at, sort_order, deleted_at)
  CHECK (type = 'todo' OR (total_amount IS NOT NULL AND total_amount > 0))
```
- Trigger: for `progress` goals, `completed = current_amount >= total_amount`.
- **Goal progress:** todo → 0 or 1; progress → `min(current/total, 1)`.
- **List progress** = mean of its goals' progress (both types), shown as a percent and "X of Y complete".

### 5.2a Upcoming events

- An event is a name, an emoji and a date, optionally with a time. Both are read in the owner's time zone.
- The Goals page lists them between the time-progress card and the goal lists, nearest first, with a live countdown: years, months, weeks, days, hours, minutes, seconds, starting at the largest unit that is not zero. Years and months are calendar units; the last day counts real time, so the count reaches zero exactly at the event.
- The nearest event is shown large (desktop: a tile per unit; phone: one large number with the rest on a line). Events that have passed stay at the end, dimmed, until deleted.
- Deleting is immediate with Undo. Events sync, export and import like everything else.

### 5.3 Routines
A routine is a goal template repeated over time. Day-goals are **computed, not stored**. Only per-day results are stored.
```
sp_routines     (name, description null, emoji null,
                 type text check (type in ('todo','progress')),
                 total_amount numeric null, unit text null,
                 start_date date not null, end_date date null,
                 frequency text check (frequency in ('daily','weekdays','interval')),
                 weekdays smallint[] null,      -- 0=Sun..6=Sat, required for 'weekdays'
                 interval_days int null,        -- >=2, required for 'interval' (from start_date)
                 sort_order, deleted_at)
sp_routine_logs (routine_id references sp_routines on delete cascade, date date,
                 completed boolean default false, amount numeric default 0,
                 primary key (routine_id, date))
```
- `packages/shared/recurrence.ts` (`isScheduled(routine, date)`) and a matching SQL function `sp_routine_scheduled(routine, date)` must agree. Unit-test both against the same fixtures.
- **Edit = rewrite everything** (owner's explicit choice): updating a routine re-derives all days from the new rules. Trigger behaviour on update:
  - delete logs whose date is no longer scheduled
  - if `type` or `total_amount` changed, reset all remaining logs (`completed=false, amount=0`)
- **Delete** a routine → hard delete with cascade of all logs. UI shows a confirmation: "This removes the routine and all of its history."
- **Day completion %** = mean progress of that day's scheduled instances (todo 0/1, progress `min(amount/total,1)`). Days with nothing scheduled have no ring.
- **Streak** per routine = consecutive scheduled days fully completed, ending today or yesterday.
- RPC `sp_routine_days(from date, to date)` returns per-day instances + percentages for the calendar (one round trip per visible month).

### 5.4 Focus timer & blocking
```
sp_focus_settings (user_id pk, focus_min int default 25, short_break_min int default 5,
                   long_break_min int default 15, rounds_before_long int default 4,
                   auto_start_breaks bool default false, auto_start_focus bool default false,
                   active_block_list_ids uuid[] default '{}')
sp_focus_state    (user_id pk,
                   status text check (status in ('idle','running','paused','awaiting')),
                   -- 'awaiting' = a phase ended and auto-start is off; waiting for Start
                   phase text check (phase in ('focus','short_break','long_break')),
                   round int default 1,
                   phase_started_at timestamptz, phase_ends_at timestamptz,
                   paused_remaining_ms int null,
                   session_id uuid null,
                   version bigint default 0, updated_at,
                   notified_phase_end_at timestamptz null)
sp_focus_sessions (started_at, ended_at, phase, planned_seconds, actual_seconds,
                   completed bool, round int)       -- one row per finished/abandoned phase
sp_block_lists      (name, emoji null, sort_order, deleted_at)
sp_block_list_sites (block_list_id references sp_block_lists on delete cascade,
                     pattern text not null)       -- normalized domain, e.g. "youtube.com"
```
- **Timer state machine** lives in `packages/shared/timer.ts` (pure, fully unit-tested) and is mirrored by RPC `sp_timer_action(action, expected_version)`, with actions `start | pause | resume | skip | end | advance`.
  - Every action checks `expected_version`, increments `version`, and rejects stale writes. This prevents double-advances when several devices fire at once.
  - Time remaining is always derived from `phase_ends_at - now()` (or `paused_remaining_ms`). The timer never ticks in the DB.
  - Clients correct for clock skew using the server time returned by every RPC.
- **Advancing:** focus → short break (or long break every N rounds) → focus (round+1)… With auto-start off, the state becomes `awaiting` at the boundary. On advance, write a `sp_focus_sessions` row.
- **Pause:** allowed in any phase. **Blocking stays active while a focus phase is paused.**
- **Blocking is active iff** `phase = 'focus' AND status IN ('running','paused')`. Breaks, `awaiting` and `idle` unblock.
- The block list set comes from `active_block_list_ids` (multi-select, chosen on the Focus screen before or during a session).
- Site pattern normalization: lowercase; strip scheme, `www.`, path, port. Matching covers the domain and all subdomains. Reject invalid entries with an inline message.

### 5.5 Settings, universe, misc
```
sp_settings (user_id pk, timezone text, week_start smallint, birthdate date null,
             lifespan_years int default 85, quality_tier text default 'auto'
             check (quality_tier in ('auto','cinematic','balanced','minimal')),
             show_completed bool default false, lock_after_minutes int null)
sp_quotes (text, author, is_builtin bool)       -- seed ~100 short, attributed, public-domain-safe quotes
sp_devices (name, kind, last_seen_at, auth_session_id uuid null, revoked_at)
sp_push_subscriptions (endpoint unique, p256dh, auth, device_id, created_at)
sp_auth_events (kind, device_kind, ip, created_at)
sp_schema_version (version int, applied_at)
```

### 5.6 Universe snapshot
There is no score, no levels and no ledger: the universe is drawn from the owner's own rows. (Eras and "stardust" scoring existed until migration 0011, which removed them and dropped `sp_universe_events`.)

| Data | Visual unit |
|---|---|
| Completed task (not deleted) | 1 star |
| Goal | planet, sized by progress; a completed goal glows |
| Goal list at 100% | planetary system gets rings/moons |
| Routine | constellation; stars are completed days, brightness follows the streak |

RPC `sp_universe_snapshot()` returns `stars` (count, the most recent star seeds, counts per month), `lists`, `planets` (with progress), `constellations` (with streak/dim state) and `server_time`. Keep the payload small: aggregate old stars into counts per month instead of sending rows.

---

## 6. Design system (Palette A, "Nebula Gold"; dark only)

The approved mockups are the visual reference. Implement these tokens in `packages/ui-tokens/tokens.json`, then generate CSS variables, the Tailwind theme, and `docs/ios/StellarTokens.swift` (SwiftUI `Color`/`Font` extensions) from it.

### 6.1 Color
| Token | Value | Use |
|---|---|---|
| `bg.void` | `#070615` | App background behind the universe |
| `glass.fill` | `rgba(24,20,56,0.55)` | Cards, tab bar, sidebar, sheets |
| `glass.fillStrong` | `rgba(24,20,56,0.78)` | Sheets/dialogs, low-quality tier fallback |
| `glass.border` | `rgba(255,255,255,0.10)` | 1px hairline on glass |
| `glass.blur` | `blur(28px) saturate(140%)` | Use `backdrop-filter` + `-webkit-` prefix |
| `fill.subtle` | `rgba(255,255,255,0.05)` | Stat tiles, chip backgrounds |
| `fill.hover` | `rgba(255,255,255,0.06)` | Row hover |
| `fill.selected` | `rgba(255,255,255,0.08)` | Active nav/tab item; segmented thumb uses `0.16` |
| `separator` | `rgba(255,255,255,0.07)` | Row dividers |
| `track` | `rgba(255,255,255,0.10)` | Progress tracks |
| `text.primary` | `#F5F3FF` | Primary text |
| `text.secondary` | `#ABA6CC` | Secondary text, icons at rest |
| `accent` (Starlight Gold) | `#F6C76E` | Primary buttons, active states, progress, checks. **One glowing thing per view.** |
| `accent.ink` | `#1A1206` | Text/icons on gold |
| `accent.soft` | `rgba(246,199,110,0.14)` | Tinted chips/badges |
| `accent.line` | `rgba(246,199,110,0.35)` | Chip borders |
| `accent.glow` | `rgba(246,199,110,0.45)` | Glow shadows |
| `violet` | `#9D8CFF` | Secondary data (month/year bars, second planet class) |
| `nebula.violet` | `rgba(110,76,255,0.50)` | Background nebula |
| `nebula.magenta` | `rgba(214,72,160,0.38)` | Background nebula |
| `nebula.blue` | `rgba(60,110,255,0.28)` | Background nebula |
| `core` | `rgba(255,214,150,0.95)` | Galactic core light |
| `warning` (overdue) | `#FFB27A` | Overdue dates, always with a word ("Overdue", date) |
| `success` / live | `#7CF2B0` | Sync dot, success toasts |
| `danger` | `#FF7A8A` | Destructive actions |

Body text must hold ≥4.5:1 contrast over the worst-case glass-over-nebula background. Increase glass opacity where needed.

### 6.2 Typography
Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif` (Inter self-hosted via `next/font` as the non-Apple fallback). Follow Apple's type ramp:

| Style | Size/line | Weight | Tracking |
|---|---|---|---|
| largeTitle | 34/41 | 700 | -0.02em |
| title1 | 28/34 | 700 | -0.02em |
| title2 | 22/28 | 600 | -0.01em |
| title3 | 20/25 | 600 | -0.01em |
| headline | 17/22 | 600 | — |
| body | 17/22 mobile, 15/20 desktop | 400 | — |
| subhead | 15/20 | 400–500 | — |
| footnote | 13/18 | 400 | — |
| caption | 12/16 | 500 | — |
| eyebrow | 13/16 | 600 | 0.06em, uppercase (dates, phase labels) |
| timer | 76/1 (block page 72) | 200 | -0.03em, `tabular-nums` |

All numbers that change use `font-variant-numeric: tabular-nums`. Inputs are ≥16px on mobile (prevents iOS zoom).

### 6.3 Shape, spacing, depth
- 4pt grid: 4, 8, 12, 16, 20, 24, 32, 40, 56, 64. Page padding 20 on phone, `clamp(20px,4vw,56px)` desktop.
- Radii: segmented thumb 8 · buttons/chips 10–12 · grouped lists 16 · cards 20–22 · hero/summary card 28 · floating tab bar 30 · pills/avatars full. Use continuous-feeling corners.
- Touch targets ≥44×44 everywhere.
- Depth comes from glass + light, not heavy shadows. Glow (`0 0 32px accent.glow`) only on the single primary action/progress of a view.

### 6.4 Components (build as a small internal library in `apps/web/components/ui`)
- **GlassCard / GroupedList:** iOS inset-grouped list look, hairline separators.
- **TabBar** (phone): floating glass pill, 5 items (Universe, Tasks, Goals, Routines, Focus), 22px line icons + 11px labels; active item gold with a `fill.selected` capsule.
- **Sidebar** (≥1024px) and **collapsed icon rail** (768–1023px).
- **SegmentedControl:** iOS style, animated thumb with spring.
- **TaskRow:** 22px circle checkbox (1.5px `text.secondary` ring → fills gold with check on complete), name, optional one-line description, due label right-aligned (warning color when overdue). Swipe actions on touch (right: complete; left: delete, reschedule).
- **QuickAddBar:** glass bar with name input + chips (Due date, Description, List) + gold Add button. Enter submits. Selecting a List clears/disables the due-date chip (list tasks have no dates).
- **ListCard:** 44px emoji tile, name, count/progress, drag handle (6-dot). Reorder with long-press on touch.
- **ProgressBar** (6px, rounded), **ProgressRing**, **DayRing** (conic ring around a date, glows when 100%), **Stepper** (−/+ segmented for progress goals; long-press repeats; tap the number to type).
- **Sheet:** bottom sheet with detents on phone, centered dialog on desktop; drag to dismiss.
- **DatePicker:** iOS-style inline calendar + optional time wheel; quick picks Today / Tomorrow / Next week / No date.
- **EmojiPicker:** lazy-loaded, searchable, full emoji set, recent emojis.
- **Toast:** glass, bottom (above tab bar), with Undo for destructive or bulk actions (5s).
- **TimerRing:** 300px ring, 6px stroke, gold with drop-shadow glow.
- **SyncIndicator:** dot + "N devices in sync" / "Offline, changes saved" / "Syncing…".
- **Icons:** one consistent custom line-icon set, 24px grid, ~1.8 stroke, round caps/joins, `currentColor`. No emoji as UI icons. Emoji appear only as user-chosen list/routine identities.

### 6.5 Motion
- **UI motion** (Motion library), springy and fast:
  - press scale 0.97
  - segmented/tab thumb spring (stiffness ~400, damping ~32)
  - sheets (stiffness ~300, damping ~32)
  - list insert/remove with layout animation
- **Durations:** instant 100ms (hover), quick 200ms (toggles), smooth 350ms (progress fills). Never animate layout on scroll.
- **Optimistic completion:** the checkbox fills gold within one frame. The row lingers about 600ms, then collapses out, and an Undo toast appears.
- **Ambient loops** (twinkle, nebula drift, orbits) belong to the universe layer only, never to list rows.
- `prefers-reduced-motion`: ambient loops stop, events become a brief static glow, transitions become fades/snaps.

---

## 7. The Universe (persistent background + cosmic events)

### 7.1 Persistent universe layer
- A single `<UniverseCanvas/>` mounted once in the root layout. It is fixed and full-bleed, sits behind all UI (including under safe areas), has `pointer-events: none` except on the Universe home, and **persists across route changes**: it is never remounted on navigation.
- **Loaded after first paint:** the UI renders with a CSS/2D starfield placeholder (same palette) immediately. Three.js is dynamically imported once idle (`requestIdleCallback`) and cross-fades in. Interactive UI must be usable before the 3D scene loads.
- **Contents** (deterministic: every entity's position comes from a hash of its id, so all devices show the same universe):
  - **Stars:** one per completed task, laid out along a slowly rotating spiral galaxy. Instanced points with a custom shader (size, twinkle phase, color temperature). Older stars aggregate into dense dust lanes, so tens of thousands stay cheap.
  - **Planets:** one per goal, grouped into planetary systems per goal list, orbiting the core. Planet radius/brightness scale with progress; a completed goal gets atmosphere + glow; a 100% list gets rings/moons. Planet hue varies by list (gold/violet/rose/blue families).
  - **Constellations:** one per routine. Stars are scheduled-day completions linked by lines. Brightness tracks the current streak. **Gentle dimming:** a broken streak dims the constellation to ~35% (never removed); the next completion triggers a rekindle animation.
  - **Galactic core + backdrop:** always at full richness, independent of the owner's data: bright core, coloured nebulae, ambient dust, globular clusters, neighbouring galaxies in the distance and a filament web across the sky. Only the particle counts vary, by quality tier.
- **Camera:** slow drift. Universe home allows gentle drag/pinch to orbit and zoom, with an inertial return to the default framing. Other pages use a fixed, slightly blurred, darker framing so content stays readable.
- **Quality tiers** (Settings, default Auto):
  - **Cinematic:** full scene, bloom, DPR ≤2, 60fps.
  - **Balanced:** no postprocessing, DPR ≤1.25, fewer particles, render at 30fps when idle.
  - **Minimal:** static pre-rendered starfield (canvas 2D/CSS), no loops, events as simple glows.
  - **Auto** picks a tier from GPU tier detection, `deviceMemory`, `hardwareConcurrency`, `saveData`, and Battery API (≤20% & not charging → step down). `prefers-reduced-motion` → Minimal. It drops a tier automatically if the measured frame time stays above budget for 3s.
  - Rendering pauses when the tab is hidden, and while a text input is focused on phones.

### 7.2 Cosmic events (full-screen, non-blocking)
An **EventDirector** queue renders events on an overlay layer (`pointer-events: none`) above the UI. Events never delay or block taps. Rapid repeats coalesce: 5 tasks completed in 3s play as one bigger burst. Events also update the persistent universe, so the new star/planet stays.

| Trigger | Event | Duration |
|---|---|---|
| Task completed | Star ignition: a spark flies from the checkbox position up into the sky and ignites a new star with a small flare | ~1.2s |
| Overdue tasks postponed | Comet sweep across the sky | ~1.5s |
| Progress goal increment | Planet accretion pulse on that planet | ~1s |
| Goal completed | Planet formation: accretion disk collapses into a glowing planet, shockwave ring | ~2.5s |
| Goal list 100% | Planetary system blossoms: rings + moons ignite, gold aurora wash | ~3.5s |
| Routine instance done | Constellation star lights | ~0.8s |
| Routine day 100% | Constellation draws itself line by line, flare | ~2s |
| Streak rekindled | Dim constellation flickers back to full | ~1.5s |
| Focus phase start | **Warp jump:** star streaks radiate from the center, stars stretch into lines, then settle into a calm "warp tunnel" ambient state that persists subtly during focus | ~1.5s + ambient |
| Focus phase complete | **Supernova:** bright bloom, expanding shell, dust swirls into the core | ~3s |

Minimal tier and reduced motion swap every event for a brief soft glow/flash at the source.

---

## 8. Screens & functionality

Navigation: phone = floating tab bar (Universe, Tasks, Goals, Routines, Focus) + Settings via the gear on Universe home. Tablet = icon rail. Desktop = sidebar with labels.

Global:
- **⌘K / Ctrl+K** command bar (desktop) to add a task, jump to a page, start/pause focus.
- Keyboard shortcuts: `N` new task, `1–5` pages, `Space` start/pause on Focus.
- Every list has a polished empty state with a short, gently cosmic line ("Clear skies. Nothing left in orbit today.").
- Copy voice: warm, calm, second person, sentence case, no exclamation marks, no space puns in errors.

### 8.1 Universe home
- Eyebrow date and greeting by time of day ("Good evening").
- The interactive universe fills the screen. Tap/hover on a planet shows its goal name + progress; tap on a constellation shows the routine + streak.
- Bottom glass **Today** card:
  - three stat tiles (Tasks done/total today, Routines % today, Focus time today)
  - the next 3 due tasks with checkboxes (completing here triggers star ignition)
  - "See all" → Tasks

### 8.2 Tasks
- Top: **QuickAddBar** (name, optional due date/time, description, task list). A task with a list goes only into that list, never into Today/All/Calendar.
- **Segmented tabs:**
  - **Today:** an Overdue section (warning header "Overdue · N" + **"Move all to today"** one-click button with Undo), then Today. Sorted earliest due → latest.
  - **All:** master list of all non-list tasks, sorted earliest due → latest, undated at bottom, grouped by date headers (Overdue, Today, Tomorrow, weekday names, later dates, No date).
  - **Calendar:** month view (week view toggle on desktop) with task dots/pills per day, an agenda for the selected day, drag a task to another day to reschedule (desktop), and quick add prefilled with the selected date.
- **Task lists** section, on the same page (desktop: right column; phone: below the list or its own segment, whichever reads better): reorderable cards (emoji + name + count), a "+" button to create (name + emoji picker). Opening a list shows its tasks with its own quick-add (no date chip). Rename, change emoji, delete with confirm.
- **Task detail sheet:** edit name, description, due date/time, move to list (clears dates) / back to no list, delete.
- "Show completed" toggle per view. Completed tasks show struck through in secondary color.
- Same task object everywhere; views are just filters.

### 8.3 Goals
- **Motivational quote card:** random per visit from built-in + user quotes. Manage your own quotes in Settings.
- **Time progress card:** five bars (Day, Week, Month, Year, Life) with percent, computed in the owner's timezone and week start. Life uses birthdate + lifespan. If no birthdate, show "Add your birthdate" linking to Settings.
- **Goal lists:** reorderable cards with emoji, name, mini planet (size ∝ progress), progress bar of total completion across todo + progress goals, "X of Y · NN%".
- **List detail:** goals with type-appropriate controls. Todo = checkbox. Progress = bar + "current / total unit" + Stepper; tap the number to set an exact value. Add goal sheet: name, description, type (segmented Todo/Progress), total amount + unit for progress.

### 8.4 Routines
- **Month calendar:** each day shows a DayRing with that day's completion %. 100% days glow gold. Future days have no ring; today is a filled gold circle.
- **Tapping a day** opens its day panel (inline on desktop, sheet on phone) listing that day's routine day-goals: todo = checkbox; progress = bar + Stepper. Editing past days is allowed. Day % updates live.
- **Manage routines** (bottom of the page): list of routines with schedule summary ("Every day", "Mon, Wed, Fri", "Every 3 days") and streak. Add/edit sheet fields:
  - name, optional emoji, description
  - type (Todo / Progress + total amount + unit)
  - start date, optional end date
  - frequency: Every day / Specific weekdays (weekday chips) / Every N days
  - live preview of the next 14 scheduled dates
- Editing shows a note: "Changes apply to every day, past and future." Delete confirms that history is removed.

### 8.5 Focus
- **Phase segmented display:** Focus 25 · Short break 5 · Long break 15 (current highlighted), "Round 2 of 4".
- **TimerRing** with the remaining time (from `phase_ends_at`) and phase label. Controls: End (stop square), Start/Pause (big gold 84px circle), Skip.
- **SyncIndicator** ("3 devices in sync"): count of devices seen via Realtime presence.
- **Blocking card:**
  - during focus, "Blocking now" with active lists as gold chips, plus inactive lists as gray chips to toggle
  - during breaks, "Sites open during break"
  - "Edit lists" → Block lists manager (create/rename/emoji/delete lists, add/remove site patterns with validation, paste multiple lines at once)
- **Settings sheet:** focus/short/long minutes, rounds before long break, auto-start breaks, auto-start focus.
- **Stats:** today's focus minutes, a 7-/30-day bar chart of focus minutes, current daily focus streak, recent session log (phase, time, completed/abandoned).
- **Notifications:** at each phase end, web push "Focus complete. Time for a 5-minute break." (and similar). Ask for permission from a clear button, never on load. Explain that iOS requires the app to be added to the Home Screen.
- **Ambient focus mode:** while a focus phase runs, the universe shows the subtle warp tunnel. A "Fullscreen" button shows just the ring over the sky.
- The timer is **not** linked to tasks.

### 8.6 Settings
Sections:
- **General:** timezone, week start, birthdate, lifespan.
- **Appearance:** quality tier Auto/Cinematic/Balanced/Minimal with a live preview.
- **Quotes:** add/remove your own.
- **Notifications.**
- **Security:** PIN, lock timeout, devices.
- **Extension:** download links for the Chrome zip and Firefox package served by the app, plus install steps.
- **Connection:** Supabase status, schema version, re-run migrations.
- **Data:** export everything as JSON; import JSON.
- **About:** version.

---

## 9. Mobile, PWA & device safe areas (iPhone with Dynamic Island, notch, and no notch)

### 9.1 Viewport & safe areas (mandatory)
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- iOS standalone: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style = black-translucent`, `theme-color #070615`.
- **Never hardcode inset values.** Use `env(safe-area-inset-top|right|bottom|left)` everywhere:
  - page headers: `padding-top: max(16px, env(safe-area-inset-top))` (+ visual spacing)
  - floating tab bar: `bottom: max(12px, env(safe-area-inset-bottom))`; scroll containers get bottom padding = tab bar height + bottom inset
  - landscape: left/right insets on all content; tab bar and sheets respect them
  - sheets: bottom padding includes the home-indicator inset
  - toasts sit above the tab bar
- The universe canvas and nebula background are **full-bleed under all insets**. Only content respects them.
- Use `100dvh`/`100svh` (never bare `100vh`) for full-height layouts. `overscroll-behavior: none` on the app shell. Disable the tap highlight. `touch-action: manipulation`.
- **Keyboard:** use `visualViewport` so the quick-add bar and sheets stay above the iOS keyboard. No layout jumps.
- **Device test matrix** (Playwright viewport projects + visual screenshot checks):
  - iPhone SE (375×667, no notch)
  - iPhone 13/14 (390×844, notch)
  - iPhone 15/16 Pro (393×852, Dynamic Island)
  - iPhone Pro Max (430×932)
  - phone landscape
  - iPad (820×1180)
  - desktop 1280 & 1920

  Simulate safe-area insets in tests via CSS env overrides or a test-only class.
- **Responsive breakpoints:** <768 phone (tab bar), 768–1023 tablet (rail), ≥1024 desktop (sidebar, multi-column).

### 9.2 PWA
- Web app manifest:
  - name/short_name "Stellar Planner", `display: standalone`, `orientation: any`, `background_color`/`theme_color #070615`
  - full icon set incl. maskable
  - shortcuts (New task, Start focus)
- Apple touch icons + **apple-touch-startup-image splash screens** for all current iPhone sizes (generate them in a build script from one SVG).
- **Service worker:** precache the app shell + fonts. Navigation falls back to the cached shell. Runtime-cache static assets. Update flow: "New version available, Reload" toast.
- **Offline data:**
  - TanStack Query cache persisted to IndexedDB, so the app opens instantly with the last data
  - mutations made offline go into an IndexedDB **outbox** and replay in order on reconnect, using client-generated UUIDs so creates are idempotent
  - conflicts resolve last-write-wins by `updated_at`
  - SyncIndicator shows offline/pending state
  - the Focus timer works offline from cached state, and syncs actions on reconnect (server version check wins)
- **Web push:** VAPID; subscribe/unsubscribe in Settings; works on desktop browsers and iOS 16.4+ home-screen apps.
- Installed-PWA niceties: status bar blends into the sky, no pull-to-refresh bounce on the shell, standalone-only "Add to Home Screen" hint hidden when already installed.

---

## 10. Browser extension (`apps/extension`, WXT)

### 10.1 Connect flow (popup, first run)
1. Enter the app's public URL. The extension normalizes it and calls `GET {url}/api/v1/instance`. On success it shows "Found Stellar Planner".
2. Enter the PIN on a keypad. `POST /api/v1/auth/pin` with `device.kind = "extension"` returns the Supabase session.
3. The extension stores the URL, Supabase URL/anon key and session in `chrome.storage.local`. supabase-js is configured with a `chrome.storage` adapter and auto-refresh.
4. It auto-links: subscribes to Realtime and fetches the current state. Done in about two taps after the URL.

All extension installs share the same single timer/block lists because they all read the same rows.

### 10.2 Background (service worker / Firefox event page)
- Maintain a Realtime subscription to `sp_focus_state`, `sp_focus_settings`, `sp_block_lists`, `sp_block_list_sites`. MV3 workers get suspended, so:
  - keep the websocket alive while a session is active (heartbeat under the browser's idle timeout)
  - re-sync on every wake via `chrome.alarms` (minimum supported period) and on `runtime.onStartup`
  - re-sync on network online events
- **Blocking with `declarativeNetRequest` dynamic rules:** for each active pattern, `urlFilter: "||domain^"`, `resourceTypes: ["main_frame"]`, action `redirect` to `blocked.html?site=<domain>` (extension page).
  - Install rules when blocking becomes active. Remove them when it ends.
  - When blocking starts, also redirect any **already-open tabs** on blocked domains.
- **Offline resilience:** cache the last known state. If running, keep blocking until the cached `phase_ends_at`, using an alarm to unblock exactly then unless Realtime says otherwise. If paused, keep blocking until a state change arrives (blocks stay on while paused).
- **Hard block, no bypass:** the block page offers no unlock. The only way to unblock is the timer leaving a focus phase (pause doesn't count) from any device.
- Toolbar badge: remaining minutes during focus (gold), "B" or a break color during breaks, empty when idle.

### 10.3 Block page (`blocked.html`)
Matches the approved mockup:
- full starfield + nebula
- black eclipse disk with gold corona and slowly rotating nebula halo
- inside the disk: "FOCUS · ROUND 2 OF 4" eyebrow, live countdown, "remaining"
- below the disk: "This orbit is closed." and "{site} is blocked until your focus phase ends."
- thin gold progress bar
- footer sync dot: "Synced with {host} · Blocking {list names}"

The countdown is live. When the phase ends, the page shows "Focus complete" and offers a button to continue to the originally requested URL.

### 10.4 Popup
360px wide, the same design language as the app:
- phase label, big countdown, round
- Start/Pause, Skip, End (full control, synced to all devices)
- active block lists summary
- connection status
- "Open Stellar Planner" link
- Settings view: disconnect, instance URL

### 10.5 Build & distribution
- `pnpm --filter extension build` produces Chrome (MV3) and Firefox (MV3, `browser_specific_settings.gecko.id`) outputs + zips.
- The web Docker build copies the zips into the app's public folder for download from Settings.
- `docs/EXTENSION.md`: load unpacked in Chrome; Firefox via `about:debugging` (temporary) or signing as an unlisted add-on with `web-ext sign` for permanent install.
- **Permissions:** `storage`, `alarms`, `declarativeNetRequest`, `tabs`, plus host access for redirects, plus runtime-requested host permission for the user's instance and Supabase origins. Verify the exact permissions current Chrome and Firefox require for DNR redirects, and document them.

---

## 11. REST API v1 (for the future iOS app & integrations)

- Base `{PUBLIC_APP_URL}/api/v1`. JSON. `Authorization: Bearer <supabase access_token>` (from the PIN endpoint), forwarded to Supabase so RLS applies.
- Errors are `{ error: { code, message } }` with proper HTTP status codes.
- Every list endpoint supports `updated_since` (delta sync) and returns soft-deleted ids.
- Rate-limit auth endpoints.
- `docs/openapi.json` is generated from the zod schemas. `docs/API.md` covers it with examples.
- CORS allows the app origin + extension origins.

Endpoints:
- `GET /instance`
- `POST /auth/pin`, `POST /auth/refresh`, `POST /auth/logout`, `GET /devices`, `DELETE /devices/:id`
- `GET|PUT /settings`
- `GET|POST /task-lists`, `PATCH|DELETE /task-lists/:id`, `POST /task-lists/reorder`
- `GET /tasks?view=today|all|calendar|list&list_id=&from=&to=`, `POST /tasks`, `PATCH|DELETE /tasks/:id`, `POST /tasks/postpone-overdue`
- `GET|POST /goal-lists`, `PATCH|DELETE /goal-lists/:id`, `POST /goal-lists/reorder`
- `GET|POST /goals`, `PATCH|DELETE /goals/:id`, `POST /goals/:id/increment {delta}`
- `GET|POST /events`, `PATCH|DELETE /events/:id`
- `GET|POST /routines`, `PATCH|DELETE /routines/:id`, `GET /routines/days?from=&to=`, `PUT /routines/:id/logs/:date`
- `GET|PUT /focus/settings`, `GET /focus/state`, `POST /focus/actions {action, expectedVersion}`, `GET /focus/sessions?from=&to=`, `GET /focus/stats`
- `GET|POST /block-lists`, `PATCH|DELETE /block-lists/:id`, `POST|DELETE /block-lists/:id/sites`
- `GET /universe/snapshot`
- `GET /quotes/random`, `GET|POST|DELETE /quotes`
- `POST|DELETE /push/subscriptions`
- `GET /export`, `POST /import`

`docs/IOS_INTEGRATION.md` covers:
- the connect flow (URL → `/instance` → PIN)
- using supabase-swift with the returned session for Realtime (focus state sync)
- REST for everything else
- applying `StellarTokens.swift`
- safe-area/Dynamic Island guidance for SwiftUI (backgrounds `.ignoresSafeArea()`, content respects safe areas, tab bar via `safeAreaInset(edge: .bottom)`)
- Live Activity + Dynamic Island idea for the focus countdown **(later)**
- using Apple's Screen Time APIs (FamilyControls/ManagedSettings/DeviceActivity) to shield apps while `blocking active` is true, including the entitlement caveats **(later)**

---

## 12. Performance budgets (CI-checked where possible)

- Initial JS for the first route (excluding the lazy universe chunk) ≤ 200 KB gzip. Three.js/R3F only in the lazy `universe` chunk.
- LCP < 1.5s on a mid-range phone over 4G for a cached PWA open. Instant (<300ms) shell from service worker.
- Interaction → visual feedback ≤ 1 frame (optimistic). INP < 100ms.
- Universe: Cinematic holds 60fps on a recent iPhone. Balanced 30fps+ on older devices. Zero React re-renders of the canvas on page navigation. Scene updates go through refs/stores, not props.
- Realtime update → UI within 1s.

---

## 13. Quality & testing

- Unit (Vitest) in `packages/shared`:
  - recurrence (daily/weekdays/interval, start/end bounds, timezone/DST edges)
  - timer state machine (all transitions, version conflicts, pause blocking rule, auto-start on/off, long-break cadence)
  - progress math, site-pattern normalization, URL normalization
- SQL parity: tests that run the SQL functions (when a Postgres is available, e.g. Docker or `DATABASE_URL`) against the same fixtures as the TS versions.
- E2E (Playwright), desktop + iPhone 15 Pro + iPhone SE projects:
  - setup wizard (mocked Supabase where needed)
  - PIN login + lockout
  - add/complete/postpone tasks
  - list tasks excluded from Today/All
  - goal progress
  - routine scheduling + edit rewrite + delete
  - focus start/pause/skip with blocking-state assertions
  - safe-area screenshots
- Accessibility: semantic buttons/inputs, labels on icon buttons, focus rings (2px gold, 2px offset), keyboard operable, VoiceOver-friendly labels on rings/progress, contrast ≥4.5:1.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass for web and extension. `docker build` must succeed.

---

## 14. Out of scope for this build
Native iOS app (API/docs/tokens only), sound, multi-user/sharing, external calendar sync, natural-language date parsing, billing.
