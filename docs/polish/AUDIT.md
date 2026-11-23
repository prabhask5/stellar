# Stellar Planner — polish pass 1 audit

Written in Phase 1 of `docs/polish/POLISH_SPEC.md`, before any product code changed. Statuses are updated as the pass goes on.

**How the findings were produced**

- **Automated sweep (§2.1).** `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` are clean with no warnings. The whole e2e suite ran on seven Playwright projects (three Chromium, three WebKit iPhone, Firefox) with listeners for console errors and warnings, uncaught errors, failed and 4xx/5xx requests and layout shift; the aggregated log is `docs/polish/data/sweep-baseline.txt`. axe-core, overflow, touch-target and native-feel facts for every screen and sheet are in `docs/polish/data/scan-*.json`. Measurements are in `docs/polish/PERF.md`.
- **Scripted adversarial pass (§2.2).** `apps/web/e2e/audit/adversarial.spec.ts` (run with `AUDIT=1`). A failing test there is a finding; each becomes the regression test for its fix.
- **Code review.** Four independent read-throughs (client data and sync layer, UI components, server and SQL, extension and universe). These entries say "code review" in their evidence with a confidence; the ones reproduced in a browser say so and name the test. Code-review entries that have not been reproduced are still listed, because the brief was to assume bugs exist; any that turn out not to be real are closed as "Won't fix (not reproducible)" with the reason.
- **Native-feel audit (§2.3).** One entry per POLISH_SPEC §4 requirement that is not met or only partly met, with where and by how much.
- **Official Supabase bundle.** The smoke subset (setup wizard, PIN, shell, tasks with Realtime between two tabs, focus, extension) passes against the official CLI stack (Kong, official Realtime and Postgres images). No behaviour differed from the dev stack. The Supavisor pooler in transaction mode is not part of the CLI stack's default path, so the pooler finding stays a code-review entry.

**Baseline e2e before any change:** desktop 62/62 · iphone-15-pro 42/42 · iphone-se 42/42 (Chromium) · webkit-iphone-15-pro 40 passed, 2 failed · webkit-iphone-se 40 passed, 2 failed · webkit-iphone-15-pro-landscape 32 passed, 11 failed · firefox-desktop 37 passed, 5 failed.

Ids are stable; the prefix is the current severity. Entries are generated from `docs/polish/data/*.json` by `node scripts/polish/build-audit.mjs`.

**249 findings:** 3 P0 · 40 P1 · 123 P2 · 83 P3.
**Status:** 248 Open · 1 Won't fix.

Severity: **P0** crash, data loss/corruption, security problem, core flow blocked · **P1** a feature is broken or wrong · **P2** friction (slow, janky, confusing, un-native) · **P3** cosmetic.

## P0 (3)

### P0-001 · Outbox · Web + PWA
**Second offline edit to the same row is silently discarded by the `updated_at` guard**

**What / Repro:** Go offline. Create task "A" (or pick an existing task). Wait >15 s (or just stay offline >15 s). Rename it, then complete it (two edits to one row; or create + complete; or delete + Undo). Go online. Reload.
**Expected · Actual:** Expected both edits on the server. Actual: only the first op per row lands. Create+complete offline -> task comes back uncompleted; rename+complete -> not completed; delete+Undo -> task stays deleted.
**Cause:** every op that waited >15 s is sent as `update ... where id = X and updated_at <= <time of the user's action>`. The first replayed op (insert or update) makes the trigger set `updated_at = now()` (replay time), which is later than the `at` of every following op for that row, so their filters match zero rows. `maybeSingle()` returns `data: null` with no error, so the op counts as success.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-10 (rename then description offline: description lost), ADV-11 (create + complete offline: completion lost), ADV-12 (twenty offline changes: completions of offline-created tasks lost) on desktop Chromium and webkit-iphone-15-pro · code: apps/web/lib/client/outbox.ts:175, 185-190; packages/db/migrations/0002_tasks.sql:130 (`new.updated_at := now()` on insert and update; same in goals/routines/lists triggers); apps/web/lib/client/data/core.ts:234-240 · code review, confidence high
**Status:** Open

### P0-002 · Outbox · Web + PWA
**A server 5xx for a doomed op (PostgREST maps `P0002` to 500) blocks the whole queue forever**

**What / Repro:** Tab A offline: tap + on a progress goal (queues `sp_goal_increment`), then create two tasks. Tab B: delete that goal. Tab A online.
**Expected · Actual:** Expected the increment is dropped with a toast and the two tasks sync. Actual: the RPC raises `P0002`, PostgREST answers 500, the outbox classifies it as a network failure, marks the app "Offline", retries the same op every 2-30 s forever; the tasks behind it never sync. Same for `sp_routine_log_set` after the routine was deleted elsewhere, and any other persistent 5xx.
**Cause:** `isNetworkError` treats every 5xx as retryable and there is no retry cap / poison-op handling. (A 429 is the opposite problem: it is dropped as a permanent rejection.)
**Evidence:** code: apps/web/lib/client/supabase.ts:42-52 (`status >= 500` => network error); apps/web/lib/client/outbox.ts:267-271; packages/db/migrations/0003_goals.sql:164-166 and 0004_routines.sql:311-313 (`raise exception ... errcode = 'P0002'`) · code review, confidence medium (PostgREST status mapping `P0*` -> 500 is from memory, not run)
**Status:** Open

### P0-003 · Server · Server / API
**"Verify" in Settings → Connection can permanently brick a configured instance**

**What / Repro:** instance set up without a Postgres connection string (the manual / pg-meta path). Update the app to a build with a newer migration. Settings → Connection shows "out of date" with the SQL to paste. Press **Verify** before the SQL has been run (or after it failed): `POST /api/setup/verify`.
**Expected · Actual:** expected "not up to date yet, run the SQL" and the app keeps working. Actual: `verifySchema()` writes `schemaVerified: false` into the config. `stageOf()` then returns `"database"`, so `configured` is false: every `/api/v1/*` call returns 503 (`requireConfig`), the proxy redirects every page to `/setup`, and `/api/setup/verify`, `/api/setup/migrate`, `/api/setup/sql` now all return 403 "Create your PIN first." because `guardSetup` sees `setupCompletedAt !== null && !configured`. There is no UI path back.
**Cause:** `verifySchema` persists a negative result (`if (ok !== stored.schemaVerified) updateStoredConfig({ schemaVerified: ok })`), and `guardSetup` treats "set up once but not configured" as the RESET_PIN state only. The only thing that sets the flag back is boot-time migration, which needs `DATABASE_URL` — exactly what these users do not have.
**Evidence:** code: apps/web/lib/server/setup.ts:75-77; apps/web/lib/server/setup-guard.ts:19-22; apps/web/lib/server/config.ts:116-119; apps/web/components/settings/connection.tsx:104-107 · code review, confidence high (traced end to end; not exercised over HTTP)
**Status:** Open

## P1 (40)

### P1-004 · Tasks / time · Web + PWA
**A task added from Today gets the wrong date when the owner's time zone is a day ahead of UTC**

**What / Repro:** 1) Settings time zone Pacific/Kiritimati (UTC+14), device in any zone 2) Tasks → Today 3) type a name, Enter
**Expected · Actual:** Expected the task due today in the owner's zone. Actual: it is saved with yesterday's date (due_date − today = −1) and lands in Overdue.
**Cause:** Not yet traced; the quick-add default date does not come from the same owner-zone 'today' the view uses (see also the UTC-before-settings finding).
**Evidence:** apps/web/e2e/audit/adversarial.spec.ts ADV-40 fails on desktop Chromium and webkit-iphone-15-pro
**Status:** Open

### P1-005 · Setup wizard · Safari / iPhone
**Setup wizard never shows the paste-and-verify SQL step in WebKit**

**What / Repro:** 1) /setup in Safari 2) connect without a Postgres connection string where pg-meta is unavailable
**Expected · Actual:** Expected 'Open your Supabase Studio SQL editor, paste, and run it.' with the SQL. Actual: the step never appears.
**Cause:** Not yet traced (streamed NDJSON response handling in WebKit is the suspect).
**Evidence:** e2e/01-setup.spec.ts:168 fails on all three WebKit projects, passes on Chromium and Firefox · code: apps/web/components/setup/wizard.tsx:478-540
**Status:** Open

### P1-006 · Focus · Firefox
**Two devices pressing Skip at the same moment leave Firefox on the old phase**

**What / Repro:** 1) two Firefox windows on /focus, timer paused in focus 2) press Skip in both at once
**Expected · Actual:** Expected both to show Short break. Actual: one window stays on Focus (data-phase=focus, status awaiting) for at least 10 s.
**Cause:** Not yet traced; the losing tab's optimistic state is not replaced by the server's after the version conflict.
**Evidence:** e2e/07-focus.spec.ts:169 fails on firefox-desktop
**Status:** Open

### P1-007 · Focus / block lists · Firefox
**Pasting several sites into a block list adds only one in Firefox**

**What / Repro:** 1) Focus → Edit lists → a list 2) paste 'reddit.com, twitter.com news.ycombinator.com' and add
**Expected · Actual:** Expected every valid site added. Actual: only one site appears.
**Cause:** Not yet traced.
**Evidence:** e2e/07-focus.spec.ts:258 fails on firefox-desktop
**Status:** Open

### P1-008 · Universe events · Firefox
**Cosmic events draw nothing in Firefox**

**What / Repro:** 1) Firefox, Home 2) complete a task
**Expected · Actual:** Expected the star ignition (or the soft glow on Minimal). Actual: the event canvas stays empty.
**Cause:** Not yet traced.
**Evidence:** e2e/08-universe.spec.ts:175 and :227 fail on firefox-desktop (overlay has zero painted pixels)
**Status:** Open

### P1-009 · Auth · iPhone PWA (landscape)
**In landscape the Unlock button is below the screen on the lock screen**

**What / Repro:** 1) iPhone landscape (852×393) 2) open /lock
**Expected · Actual:** Expected the whole PIN screen to fit or scroll with Unlock reachable above the home indicator. Actual: Unlock's bottom edge is at y=510 on a 393px-high screen.
**Cause:** The lock layout stacks the keypad vertically at every size; `short:` variants shrink it but not enough for 393px.
**Evidence:** e2e/02-auth.spec.ts:23 fails on webkit-iphone-15-pro-landscape · code: apps/web/components/auth/lock-screen.tsx:109-158
**Status:** Open

### P1-010 · Settings / data · Safari / iPhone
**Export does not produce a download in WebKit landscape run**

**What / Repro:** 1) Settings → Data → Export in WebKit
**Expected · Actual:** Expected a JSON file download. Actual: no download event within 60 s.
**Cause:** Not yet traced (blob + anchor download path).
**Evidence:** e2e/03-shell.spec.ts:117 fails on webkit-iphone-15-pro-landscape (passes on the portrait WebKit projects)
**Status:** Open

### P1-011 · Outbox · Web + PWA
**Guard miss (0 rows updated) is treated as success: no rollback, no toast, cache keeps showing the unsaved edit**

**What / Repro:** Tab A offline: complete task X; wait 20 s. Tab B: rename task X. Tab A online.
**Expected · Actual:** Expected either the completion applies (field-level merge) or the UI rolls back and says so (DECISIONS line 49: "A rejected operation is dropped, the affected collection is reloaded, and a toast says so"). Actual: completion is dropped server-side, tab A still shows it completed until some unrelated refetch; other devices show it open.
**Cause:** `onSuccess` only upserts when `isRow(result)`; a null result does nothing. Also the guard is row-level, so an unrelated field change elsewhere discards the offline edit.
**Evidence:** code: apps/web/lib/client/outbox.ts:189; apps/web/lib/client/data/core.ts:230-241 · code review, confidence high
**Status:** Open

### P1-012 · Outbox · Web + PWA
**Two tabs share one persisted queue: ops are replayed twice and overwritten**

**What / Repro:** (a) Tab A offline, tap + on a progress goal 3 times. Open tab B (still offline). Go online. (b) Tab A offline: add task "a". Tab B offline: add task "b". Close both tabs, reopen online.
**Expected · Actual:** (a) Expected +3, actual +6: tab B loaded tab A's queue from IndexedDB and both send it (updates are also sent twice, timer ops conflict). (b) Expected both tasks, actual only "b": each tab persists its whole in-memory queue under the single key `queue`, so the last writer wins; a tab that drains calls `del(STORE_KEY)` and erases the other tab's pending ops.
**Cause:** no cross-tab ownership (no Web Lock / leader), whole-array persistence under one key.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-14 on desktop Chromium: one offline +1 on a goal became +2 with a second tab open · code: apps/web/lib/client/outbox.ts:49, 62-68, 106-120 · code review, confidence high
**Status:** Open

### P1-013 · Outbox · Web + PWA
**Non-idempotent RPCs are re-sent after a lost response (goal increment applied twice)**

**What / Repro:** Throttle so the response of `POST /rest/v1/rpc/sp_goal_increment` is aborted after the server processed it (Playwright `route.fetch()` then `route.abort()`). Tap + once.
**Expected · Actual:** Expected +1. Actual +2: the op stays at the head of the queue and is retried; the RPC is a pure delta with no idempotency key.
**Cause:** retry semantics assume idempotent ops; only inserts are.
**Evidence:** code: apps/web/lib/client/outbox.ts:215-216, 256-271; apps/web/lib/client/data/goals.ts:160 · code review, confidence high
**Status:** Open

### P1-014 · Outbox · Web + PWA
**No request timeout anywhere: one hung request freezes sync (and every Supabase call)**

**What / Repro:** With Playwright, `route` a PostgREST write (or `/api/v1/auth/session`) to never fulfil. Make a change, then make more changes, toggle offline/online.
**Expected · Actual:** Expected the op times out, is retried, indicator reflects it. Actual: `flushing` stays true, so `flush()` from `online`/`visibilitychange`/`enqueue` returns immediately; nothing else is sent until the page is reloaded. If `/auth/session` hangs, `inflight` never clears and every query and op awaits it.
**Cause:** no `AbortSignal.timeout` on any fetch; flush is single-flight with no watchdog.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-13 on desktop Chromium: one POST that never answers leaves both tasks unsynced after 60 s · code: apps/web/lib/client/outbox.ts:172-218, 240-243; apps/web/lib/client/api.ts:32-39; apps/web/lib/client/session.ts:127-145 · code review, confidence high (mechanism), medium (how often a fetch hangs rather than fails)
**Status:** Open

### P1-015 · Outbox · Web + PWA
**Sign-out discards unsynced changes without warning, and offline "Sign out" does not sign out**

**What / Repro:** Go offline, add three tasks, Settings -> Sign out.
**Expected · Actual:** Expected a warning about unsynced changes, and a real sign-out (or a refusal while offline). Actual: `logout` fails and is swallowed, `leave()` deletes the outbox and cache (three tasks gone for good), then navigates to `/lock`, which the service worker never serves, so the browser's offline error page appears. The httpOnly session cookie is untouched, so when the network returns `/lock` redirects to `/` and the device is signed in again without a PIN.
**Cause:** `.catch(() => {})` on logout; no check of `useSync.pending`; `/lock` bypasses the SW.
**Evidence:** code: apps/web/components/settings/security.tsx:37-44, 178-181; apps/web/lib/client/persist.ts:46-57; apps/web/sw/sw.ts:103 · code review, confidence high · also reported as U:A23
**Status:** Open

### P1-016 · Optimistic cache vs refetch / Realtime · Web + PWA
**Any refetch replaces a collection wholesale and wipes optimistic changes that are still queued**

**What / Repro:** Offline for >5 min, make 20 changes (new tasks, completions, a goal +, delete a quote). Go online and watch the lists for the next seconds.
**Expected · Actual:** Expected the UI to stay as the user left it while the queue drains. Actual: `refetchOnReconnect`, the Realtime re-subscribe (`invalidateQueries()` with no filter) and `refetchOnWindowFocus` all refetch at once; the server snapshot lacks the not-yet-sent ops and replaces the cache, so new tasks vanish and completed tasks reappear, then pop back one by one as each op's `onSuccess` upserts. Ops with no success write-back (hard deletes, `rpc` increments, postpone) stay reverted until an echo arrives; `sp_quotes` has no Realtime, so a deleted quote stays visible until the next refetch. The same happens when `onError` invalidates a table while other ops for it are pending.
**Cause:** `fetchCollection` results are written straight to the cache; nothing re-applies `pendingOps()` over fetched data and nothing defers refetch until the outbox is empty.
**Evidence:** code: apps/web/lib/client/data/core.ts:56-116; apps/web/lib/client/cache.ts:30-35; apps/web/lib/client/realtime.ts:167; apps/web/lib/client/data/core.ts:267-286 · code review, confidence high
**Status:** Open

### P1-017 · Optimistic cache vs refetch / Realtime · Web + PWA
**In-flight refetch that started before a mutation overwrites it afterwards (task un-completes ~1 s later)**

**What / Repro:** Delay `GET /rest/v1/sp_tasks` by 1.5 s. Background the tab >5 min (or invalidate), return (focus refetch starts), immediately tap a checkbox.
**Expected · Actual:** Expected the task stays completed. Actual: the op succeeds and is upserted, then the older GET snapshot (taken before the commit) lands and sets it back to open; nothing corrects it until the next refetch.
**Cause:** optimistic writes do not cancel or supersede in-flight fetches for that key.
**Evidence:** code: apps/web/lib/client/data/core.ts:164-174 (no `cancelQueries`); apps/web/lib/client/cache.ts:33 · code review, confidence medium (timing-dependent; mechanism traced)
**Status:** Open

### P1-018 · Optimistic cache vs refetch / Realtime · Web + PWA
**Late Realtime echo of an earlier op overwrites newer local state (rapid check/uncheck flicker)**

**What / Repro:** Delay websocket frames by ~300 ms. Complete a task, un-complete it 100 ms later (Show completed on). Both HTTP ops finish before echo 1 arrives.
**Expected · Actual:** Expected it stays open. Actual: echo 1 (completed=true) arrives after the queue is empty, `hasPending` is false, the row flips to completed, then echo 2 flips it back.
**Cause:** echoes are only suppressed while an op for the row is queued; there is no `updated_at` comparison in `applyChange`/`upsertRow`.
**Evidence:** code: apps/web/lib/client/realtime.ts:81-86; apps/web/lib/client/cache.ts:99-110 · code review, confidence medium
**Status:** Open

### P1-019 · Optimistic cache vs refetch / Realtime · Web + PWA
**Goal stepper: rapid + taps jump backwards (RPC ops are invisible to echo suppression)**

**What / Repro:** On a progress goal tap + five times quickly (or hold the stepper). Watch the number.
**Expected · Actual:** Expected 1,2,3,4,5. Actual: shows 5, then drops to 1, 2, 3... as each echo of an earlier increment overwrites the optimistic total. A completion celebration can fire and the bar then visibly regress.
**Cause:** `opRowKey` returns null for `rpc`, so `hasPending("sp_goals:<id>")` is false while increments are queued; `onSuccess` ignores the returned goal row for `rpc`.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-03: displayed amounts 1,2,3,4,5,6,7,8,9,5,6,7,8,9,10 during ten rapid taps · code: apps/web/lib/client/outbox.ts:75-91 (`rpc` -> null key); apps/web/lib/client/data/goals.ts:154-163; apps/web/lib/client/realtime.ts:84; apps/web/lib/client/data/core.ts:262-263 · code review, confidence high
**Status:** Open

### P1-020 · Optimistic cache vs refetch / Realtime · Web + PWA
**Realtime (or a local write) on a never-fetched table seeds the query with a partial list that is "fresh" for 5 minutes**

**What / Repro:** Fresh device (or cache older than 14 days). Land on `/focus` (e.g. the "Start focus" shortcut or `?next=/focus`), press Cmd+K, type a name, Enter (creates a task). Or stay on Home while another device adds a goal. Then open Tasks / Goals within 5 minutes.
**Expected · Actual:** Expected the full list. Actual: only the one new row; the rest is missing with no loading state, because `setQueryData` created the query with `dataUpdatedAt = now`, so `useQuery` sees fresh data and does not fetch. `removeRow`/DELETE events seed `[]` the same way. New tasks also get `sort_order` 1024 because `ranksOf` sees an empty list.
**Cause:** `setRows` uses `prev ?? []` instead of leaving unfetched queries alone. A related variant: an outbox op finishing before `PersistQueryClientProvider` has restored makes hydration skip that table (existing data is newer).
**Evidence:** code: apps/web/lib/client/cache.ts:91-110, 128-138; apps/web/lib/client/realtime.ts:73-85; apps/web/lib/client/data/hooks.ts:18-28 · code review, confidence medium (React Query semantics traced; needs a cold cache)
**Status:** Open

### P1-021 · Optimistic cache vs refetch / Realtime · Web + PWA
**Collections are silently truncated at the PostgREST row cap, in arbitrary order**

**What / Repro:** Seed 1 100 open tasks (POLISH 2.2 "1000 tasks"), or 3 daily routines with a year of logs (1 095 rows). Load Tasks / Routines.
**Expected · Actual:** Expected all rows. Actual: `.limit(5000)` / `.limit(20000)` cannot exceed the server cap, there is no `.order()` and no pagination, so an arbitrary 1 000 rows arrive; missing logs make streaks and calendar rings wrong, and toggling a day whose log was not loaded computes from "no log".
**Cause:** single unpaginated select relying on a client-side limit.
**Evidence:** code: apps/web/lib/client/data/core.ts:62-70, 86-91, 96-101 · code review, confidence medium (depends on the instance's `max_rows`; hosted Supabase default is 1000)
**Status:** Open

### P1-022 · Optimistic cache vs refetch / Realtime · Web + PWA
**Realtime never starts if the first session fetch fails while `navigator.onLine` is true; indicator still says "in sync"**

**What / Repro:** Abort the first `GET /api/v1/auth/session` once (network error) without toggling offline. Then change something in another tab.
**Expected · Actual:** Expected a retry and live sync. Actual: Realtime is only retried from the `online` event, which never fires; the session stays unconnected for the page's lifetime. `syncLabel` shows the green "1 device in sync" because `online` is true and `realtime` is `"idle"`.
**Cause:** no retry/backoff around the bootstrap `getSession()`; "idle" is treated as live. Also `startRealtime` returns a truthy no-op when `getSupabase()` rejects, which blocks later retries.
**Evidence:** code: apps/web/components/shell/providers.tsx:34-55; apps/web/lib/client/sync-store.ts:29-39 · code review, confidence high (mechanism), medium (frequency: flaky first request on PWA resume)
**Status:** Open

### P1-023 · Tasks / goals / routines data layer · Web + PWA
**Tapping a just-completed task again within 600 ms completes it again instead of un-completing**

**What / Repro:** Today tab, tap a checkbox twice within ~500 ms (or check then immediately uncheck).
**Expected · Actual:** Expected the task ends up open. Actual: it stays completed, a second update op is queued, and the toast reads "2 tasks completed" for one task.
**Cause:** while lingering, `withLingering` hands the row a copy with `completed: false`; the row renders checked (`done = task.completed || lingering`, label "Mark as not done") but passes that copy to `toggleTask`, which takes the "complete" branch and pushes the id into `batch` again.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-02 on desktop Chromium and webkit-iphone-15-pro: second tap leaves the task completed and the row gone · code: apps/web/lib/client/complete.ts:15-38, 41-47; apps/web/components/tasks/task-row.tsx:48-49, 91; apps/web/components/tasks/views.tsx:50 · code review, confidence high · also reported as U:A02
**Status:** Open

### P1-024 · Focus timer · Web + PWA
**After a hidden/frozen tab or a cold start, the client "advances" a phase the server already advanced**

**What / Repro:** Start focus with auto-start breaks, freeze/hide the page (or kill the PWA) past the phase end, slow the network to >2.5 s, resume/relaunch.
**Expected · Actual:** Expected the timer reconciled from the server's `phase_ends_at` (POLISH 4.5). Actual: the stale cached state is still "running" with a past end, so 2.5 s after resume the fallback applies `advance` locally: a full-length break starts "now" (later than the 10 s grace), a completion celebration plays, and an op with a stale version is queued. The UI then jumps to the real state when the conflict answer or refetch lands.
**Cause:** the fallback trusts cached state; nothing forces `fetchFocus` on resume before acting.
**Evidence:** code: apps/web/components/shell/focus-ticker.tsx:24-33; apps/web/lib/client/data/focus.ts:80-104; packages/shared/src/timer.ts:284-311 · code review, confidence medium
**Status:** Open

### P1-025 · Focus timer · Web + PWA
**Timer actions made offline replay with the server's clock (and stay optimistic meanwhile)**

**What / Repro:** Offline: Start focus, wait 10 minutes, go online. Or: online start, go offline, Pause, wait for the phase end.
**Expected · Actual:** Expected the session to reflect when the user acted. Actual: `start` is applied at replay time, so the server timer shows 25:00 while the user is 10 minutes in, and any later queued action fails with a version conflict and snaps the UI back. A Pause made offline is local only: the server keeps running, completes the phase, sends the push and (with the extension) changes blocking.
**Cause:** timer ops carry no action time and wait in the general FIFO queue (also behind any slow or stuck op).
**Evidence:** code: apps/web/lib/client/outbox.ts:34, 208-214; apps/web/lib/client/data/focus.ts:96 · code review, confidence high
**Status:** Open

### P1-026 · Session / lock · Web + PWA
**A revoked or expired session leaves all cached data on the device, readable offline**

**What / Repro:** On device B use "Sign out everywhere" (or revoke device A). On device A go offline and open the app.
**Expected · Actual:** Expected A to need the PIN and hold no data. Actual: `goToLock` only removes `sp-session-meta`; the IndexedDB cache and outbox stay. The SW serves the cached shell without touching the proxy, the persisted cache hydrates and renders everything; offline, `getSession` fails with `network`, so the lock redirect never happens. Online, the data flashes before the redirect.
**Cause:** only the explicit `leave()` clears local data.
**Evidence:** code: apps/web/lib/client/session.ts:74-96, 131-137; apps/web/sw/sw.ts:74-83; apps/web/components/shell/providers.tsx:64-77 · code review, confidence medium
**Status:** Open

### P1-027 · Service worker / PWA · Web + PWA
**After "Reload" for a new version, the first page is the old HTML pointing at chunks that no longer exist**

**What / Repro:** Open the app (SW v1). Deploy a build with changed chunks. Wait for the toast, tap Reload.
**Expected · Actual:** Expected the new version running. Actual: the new worker serves the route from `stellar-pages-v1` first, which can still hold v1 HTML (the name is not versioned and activation does not clear it). Its `/_next/static/...` hashes are not in the v2 precache and not in the runtime cache (v1 served them from its precache), so they hit the network and 404 on the new server: an unstyled, non-interactive page. The background refresh fixes the cache only for the next load; an installed iOS PWA has no reload button. Offline it stays broken.
**Cause:** stale-while-revalidate HTML decoupled from the precache revision.
**Evidence:** code: apps/web/sw/sw.ts:22, 26-29, 74-83; apps/web/components/shell/service-worker.tsx:16-33 · code review, confidence medium (traced; not run against two builds)
**Status:** Open

### P1-028 · bugs · Web + PWA
**Inactivity lock does not isolate the app underneath (keyboard reaches it; PIN can be typed into a task)**

**What / Repro:** (a) On Tasks, click into the quick-add input, leave the app idle until "Lock after 5 minutes" fires. Type the PIN and press Enter. (b) While locked press ⌘K, type text, Enter. (c) While locked press Tab then Space. (d) While locked on /focus press Space.
**Expected · Actual:** Expected the lock to swallow all input. Actual: (a) the PIN digits go into the still-focused quick-add field and Enter creates a task named with the PIN (synced to every device); the lock does not open. (b) the command bar opens invisibly under the overlay (z-90 < z-100) and runs "Add task"/navigation/"End focus session". (c) Tab moves focus into the page behind and Space activates buttons/checkboxes. (d) Space starts/pauses the timer.
**Cause:** the overlay is only a `fixed` div. No blur of `document.activeElement`, no `inert`/aria-hidden on the app, no focus trap. PinPad's window key handler deliberately ignores events whose target is INPUT/TEXTAREA (pin-pad.tsx:64). CommandBar's ⌘K handler and FocusPage's Space handler never check `useUi.locked` (only Shortcuts does, shortcuts.tsx:28).
**Evidence:** code: components/shell/inactivity-lock.tsx:63-77; components/auth/pin-pad.tsx:60-78; components/shell/command-bar.tsx:17-26; components/focus/focus-page.tsx:34-51 · code review, confidence high · also reported as C:33
**Status:** Open

### P1-029 · bugs · Web + PWA
**Swiping an open row back to the right completes the task**

**What / Repro:** touch device: swipe a row left to reveal Reschedule/Delete, then swipe it right by more than 84 px to close it.
**Expected · Actual:** Expected the row to close. Actual: the task is completed.
**Cause:** `onDragEnd` tests `info.offset.x > COMPLETE_AT` first. `offset` is measured from the start of the gesture, not from x=0, so from the open position (x=-148) a 90 px close gesture passes the test.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-50 on webkit-iphone-15-pro: swiping an open row closed completes the task · code: components/tasks/task-row.tsx:69-78 · code review, confidence high
**Status:** Open

### P1-030 · bugs · Web + PWA
**Task sheet writes a stale name/description over newer data**

**What / Repro:** open task A, close it. Rename A in another tab/device (or let a Realtime update arrive while the sheet is open). Open A again here and tap Done without touching anything.
**Expected · Actual:** Expected no write. Actual: the field shows the old name and `close()` → `commitName()` sends the old name back, reverting the other edit. Same for description.
**Cause:** the form is re-seeded only when `task?.id` changes (line 37-44). `shown` keeps the previous task after close, so reopening the same id does not re-seed, and `commitName` compares the stale local state with the fresh `task.name`.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-21: tab B's open sheet wrote the old name back over tab A's rename · code: components/tasks/task-sheet.tsx:28-61 · code review, confidence high
**Status:** Open

### P1-031 · bugs · Web + PWA
**Remembered PIN length auto-submits and locks a device out after the PIN length changes**

**What / Repro:** sign in on device X with a 6-digit PIN. Change the PIN to 8 digits on device Y (or via RESET_PIN). On X, try to sign in.
**Expected · Actual:** Expected to be able to type 8 digits. Actual: at the 6th digit PinPad auto-submits, the attempt fails and the field clears; the 7th digit can never be entered. Every try counts toward the global lockout (30 s, doubling).
**Cause:** `sp-pin-length` is never cleared or ignored after a failed attempt; `autoSubmitLength` stays at the old length.
**Evidence:** code: components/auth/lock-screen.tsx:12-27, 52-54, 85-99; components/auth/pin-pad.tsx:54-57 · code review, confidence high
**Status:** Open

### P1-032 · bugs · Web + PWA
**Reordering is impossible on touch for tasks in a list, goals and block lists**

**What / Repro:** iPhone: open a task list, long-press a row and drag.
**Expected · Actual:** Expected the row to lift and move. Actual: nothing; there is no way to reorder.
**Cause:** dnd-kit listeners are spread only on the handle button, and the handle is `mouse:flex hidden` (hidden unless hover+fine pointer). The row itself has no listeners. List/goal-list cards keep a visible handle, so only those work.
**Evidence:** code: components/tasks/list-detail.tsx:120-127; components/goals/goal-list-detail.tsx:40-49; components/focus/blocking.tsx:202-209; components/ui/sortable.tsx:89-95 · code review, confidence high
**Status:** Open

### P1-033 · bugs · Web + PWA
**Undo toast keeps its first timer when its content is replaced, so the Undo window can shrink to almost nothing**

**What / Repro:** complete a task; 4 s later complete another.
**Expected · Actual:** Expected "2 tasks completed · Undo" for 5 s. Actual: the replaced toast disappears about 1 s after it updates (the first toast's timer is still running); completing at ~5 s makes it vanish immediately.
**Cause:** `push` replaces the toast object but keeps the id, so React keeps the same `ToastItem`; the effect deps are `[toast.id, toast.duration]`, which do not change, so the timeout is not restarted. Applies to every toast with a fixed id ("task-completed", "sw-update").
**Evidence:** code: components/ui/toaster.tsx:14-17; lib/client/toast.ts:67-80; lib/client/complete.ts:29-37 · code review, confidence high
**Status:** Open

### P1-034 · bugs · Web + PWA
**Sheets stay interactive while animating out: a fast second tap on Create/Add submits twice**

**What / Repro:** desktop: New list → type a name → double-click "Create" (or double-tap on a phone before the sheet has moved away). Same for "Add goal", "Add routine", Import confirm.
**Expected · Actual:** Expected one row. Actual: two lists/goals/routines with the same name (two imports).
**Cause:** `onOpenChange(false)` only starts the exit animation; AnimatePresence keeps the last rendered tree mounted with its old closures (name still filled) and no `pointer-events:none`/`inert`, and none of the submit handlers has a submitted guard.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-04: three activations of Create within 60 ms made 3 lists · code: components/ui/sheet-impl.tsx:57-153; components/tasks/lists.tsx:125-132; components/goals/goal-sheet.tsx:39-56; components/routines/routine-sheet.tsx:96-116; components/ui/confirm.tsx:43-46; components/settings/data.tsx:53-71 · code review, confidence medium (mechanism traced; timing not measured)
**Status:** Open

### P1-035 · Server · Server / API
**`DELETE /api/v1/routines/:id` soft-deletes, but nothing else treats routines as soft-deletable**

**What / Repro:** `DELETE /api/v1/routines/<id>` → 200. `GET /api/v1/routines` no longer lists it, but `GET /api/v1/routines/days?from=…&to=…` still returns it as an instance every scheduled day, `streaks` still includes it, `GET /universe/snapshot` still draws its constellation. Query: after `update sp_routines set deleted_at = now() where id = B`, `sp_routine_days(today, today)` still listed both test routines.
**Expected · Actual:** SPEC §5.3 and DECISIONS.md line 26 say routines hard-delete with their logs and that `sp_routines.deleted_at` is unused. Actual: the facade passes `soft = true`, so the row becomes a zombie: `sp_routine_days`, `sp__day_fraction`, `sp_routine_streaks`, `sp_routine_log_set` and `sp_universe_snapshot` never filter `deleted_at`. Because the zombie stays "scheduled and incomplete", no later day can reach 100% (the +20 day bonus is never awarded again), its logs are never removed, and `sp_purge_deleted` never purges routines, so it lasts forever.
**Cause:** `remove(…, "sp_routines", id, true)` and `softDelete: true` in the list options, copied from the task/goal routes.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-61: the routine row is still in sp_routines after DELETE returns 200 · code: apps/web/app/api/v1/routines/[id]/route.ts:12-14; apps/web/app/api/v1/routines/route.ts:9-17; packages/db/migrations/0004_routines.sql:214-220, 251-302; 0006_universe.sql:278-283; 0007_sync_and_maintenance.sql:103-112 · code review, confidence high (confirmed by query)
**Status:** Open

### P1-036 · Extension · Extension (Chrome + Firefox)
**Offline with an expired access token is reported as "PIN needed" and hides the timer**

**What / Repro:** Connect, leave the browser idle or asleep for over an hour (access token lifetime), go offline (or wake the laptop before Wi-Fi is up), open the popup.
**Expected · Actual:** Expected "Offline" with the last known timer. Actual: status becomes `needs_pin`; the popup replaces the timer with the PIN keypad and auto-runs `find()`, which fails with "Can't reach …". Blocking continues from cache, so the user sees blocked sites and a popup that looks signed out.
**Cause:** `db.auth.getSession()` tries to refresh; a network failure comes back as `error` with `session: null`, and the code treats any `error || !data.session` as `needs_pin` without checking `isOffline(error)`. The `offline` branch is only reachable from `fetchSnapshot`.
**Evidence:** code: apps/extension/lib/background.ts:158-163; apps/extension/entrypoints/popup/main.tsx:482,511-512 · code review, confidence high (code + auth-js source)
**Status:** Open

### P1-037 · Extension · Extension (Chrome + Firefox)
**No way to disconnect in `needs_pin`; a cached paused focus then blocks forever**

**What / Repro:** Pause a focus phase, then make the session invalid (device removed, PIN reset, refresh token revoked) or forget the PIN. Open the popup.
**Expected · Actual:** Expected a way to disconnect (which removes rules). Actual: `linked` is false so the Settings gear is hidden; the reconnect view also hides "Use a different address". `apply()` keeps enforcing the cached snapshot, and paused focus has `unblockAt: null`, so the rules never lift. Only uninstalling the extension clears them.
**Cause:** Settings/Disconnect is gated on `linked`; paused-focus blocking has no expiry and no dependence on having a working session.
**Evidence:** code: apps/extension/entrypoints/popup/main.tsx:482,500-512,194-203; apps/extension/lib/blocking.ts:27-28; apps/extension/lib/background.ts:159-162 · code review, confidence high (code alone)
**Status:** Open

### P1-038 · Extension · Extension (Chrome + Firefox)
**One unsupported regex disables all blocking (updateDynamicRules is atomic; no `isRegexSupported` check)**

**What / Repro:** Add a long domain (patterns may be up to 253 characters) to an active block list, start focus.
**Expected · Actual:** Expected that pattern to fall back to `urlFilter` and the rest to block. Actual: if Chrome rejects one `regexFilter` (memory limit), the whole `updateDynamicRules` call rejects, so no rules are installed. `apply(snapshot)` throws inside the `try`, the catch sets status `offline` and calls `apply()` again, which throws again as an unhandled rejection. Popup shows "Offline", nothing is blocked, and it repeats every 30 s.
**Cause:** The regex `^https?://([a-z0-9-]+\.)*<domain>(:[0-9]+)?([/?#].*)?$` is never validated with `declarativeNetRequest.isRegexSupported`, and rule installation is all-or-nothing.
**Evidence:** code: apps/extension/lib/rules.ts:23-25,36-49; apps/extension/lib/background.ts:67-75,164-175 · code review, confidence medium (blast radius from code; which domains trip the 2 KB compiled-regex limit needs verification in Chrome)
**Status:** Open

### P1-039 · Universe · Web + PWA
**A WebGL failure inside the canvas takes down the whole app (no error boundary)**

**What / Repro:** Make context creation or shader compilation fail when the Canvas mounts (context limit, GPU process restart, a remount after a tier change while the old context is still being released).
**Expected · Actual:** Expected the CSS starfield to remain and the UI to keep working. Actual: R3F rethrows the error into the parent tree; `UniverseHost` sits in the root layout with no boundary, so React unmounts the root and Next shows its generic client-error screen.
**Cause:** A decorative layer shares the app's error domain.
**Evidence:** code: apps/web/components/universe/universe-host.tsx:164; apps/web/app/layout.tsx:52; packages/universe/src/canvas.tsx:110-141 (no `error.tsx` or `global-error.tsx` exists under apps/web/app) · code review, confidence medium (structure traced; the trigger is a device-side WebGL failure)
**Status:** Open

### P1-049 · Optimistic cache vs refetch / Realtime · Web + PWA
**No explicit refresh on resume; data up to 5 minutes old (timer: 60 s) is trusted after backgrounding**

**What / Repro:** Background the PWA for 2 minutes while another device completes tasks and the focus phase ends. Resume.
**Expected · Actual:** Expected a silent refresh on resume (POLISH 4.5). Actual: focus refetch only happens for queries past their stale time; a frozen websocket is not noticed until the heartbeat times out, and only then does the re-subscribe invalidate.
**Cause:** resume handling relies on `staleTime` and socket rejoin.
**Evidence:** Reproduced: perf spec, balanced run: 1,000 tasks inserted in the database, the page reloaded, and the All tab still showed only the old tasks 30 s later (persisted cache trusted for 5 minutes, no refetch on load) · code: apps/web/lib/client/cache.ts:30-34; apps/web/lib/client/realtime.ts:159-172; apps/web/lib/client/data/hooks.ts:40-44 · code review, confidence medium
**Status:** Open

### P1-237 · Shell · Firefox
**Firefox page crashes while walking the Tasks screens with the seeded data**

**What / Repro:** Firefox, seeded instance: open Home, then Tasks, open a task, the date picker, All.
**Expected · Actual:** Expected no crash. Actual: Playwright reports 'Page crashed' during the scan; the run stops at the Tasks steps.
**Cause:** Not yet traced (WebGL context churn is the suspect: Firefox also logs 'WebGL context was lost' on every load).
**Evidence:** scan spec on firefox-desktop (docs/polish/data has no scan-firefox-desktop.json because of it)
**Status:** Open

### P1-238 · Performance · iPhone PWA
**Main-thread blocking and LCP are far from the SPEC §12 budget under mobile throttling**

**What / Repro:** Lighthouse mobile (4× CPU, slow 4G) on the seeded instance, signed in.
**Expected · Actual:** Expected LCP < 1.5 s and a responsive main thread. Actual: performance score 25–81; total blocking time 0.8–2.1 s on every route (up to 7.5 s on Goals in one run); LCP 7.5 s on Tasks, Focus and Settings and 3.6 s on Goals, although FCP is 0.78 s everywhere.
**Cause:** The shell paints fast, then hydration, the persisted-cache restore and per-row motion/drag components run as long tasks; LCP waits for data-bound content.
**Evidence:** docs/polish/data/lighthouse-before.json
**Status:** Open

### P1-246 · Tasks · Web + PWA
**A thousand tasks render as about 9,300 DOM nodes and drop frames while scrolling**

**What / Repro:** Insert 1,000 dated tasks, open Tasks → All, scroll.
**Expected · Actual:** Expected the list promptly and smooth scrolling. Actual with the main thread throttled 4× (phone proxy): 13.7 s before All shows the new rows on iphone-15-pro, 16,634 DOM nodes, frame p95 33–50 ms while scrolling.
**Cause:** No windowing; every row is a motion layout component.
**Evidence:** docs/polish/PERF.md (interaction timings, 1,000 extra tasks)
**Status:** Open

## P2 (123)

### P2-040 · Auth · Web (keyboard)
**Digits typed quickly into the PIN screen are dropped**

**What / Repro:** 1) /lock on desktop 2) type six digits about 15 ms apart (a paste-speed typist, a password manager, or a slow machine)
**Expected · Actual:** Expected six dots and Unlock enabled. Actual: fewer digits are registered, Unlock stays disabled.
**Cause:** PinPad reads `value` from a ref that is refreshed in an effect after render; two keydowns before the next commit both append to the same stale value.
**Evidence:** e2e/02-auth.spec.ts:64 times out on firefox-desktop (every run) and on desktop Chromium under load: the 6th digit never registers, button stays disabled · code: apps/web/components/auth/pin-pad.tsx:39-58
**Status:** Open

### P2-041 · Universe · iPhone PWA
**The universe canvas is replaced after navigating on a small WebKit phone**

**What / Repro:** 1) iPhone SE size, WebKit 2) open Home, wait for the 3D sky 3) go to Tasks and back
**Expected · Actual:** Expected the same canvas element throughout (SPEC §7.1: never remounted). Actual: the canvas is a different element.
**Cause:** Likely the frame governor stepping the tier down and remounting (see the governor findings).
**Evidence:** e2e/08-universe.spec.ts:95 fails on webkit-iphone-se
**Status:** Open

### P2-042 · Shell (landscape) · iPhone PWA (landscape)
**Landscape phone gets a rail layout several flows were never exercised in**

**What / Repro:** Run the suite at 852×393 with touch input.
**Expected · Actual:** Expected every flow to pass. Actual: 11 specs fail: PIN step hint, export download, task lists panel missing on Tasks, quick add date picker, calendar reschedule, swipe actions, Life link to Settings, routine past-day panel. Each needs triage into product bug or test assumption in Phase 2.
**Cause:** The 768–1023 rail layout assumes a tall tablet with a mouse; at 393px height with touch, desktop-only affordances and phone-only sheets mix.
**Evidence:** baseline run of webkit-iphone-15-pro-landscape: 32 passed, 11 failed
**Status:** Open

### P2-043 · Shell · Web + PWA
**React hydration mismatch (#418) when the app opens offline from the service worker**

**What / Repro:** 1) visit the app, let the worker install 2) go offline 3) reload
**Expected · Actual:** Expected a clean hydration. Actual: 'Minified React error #418' (text mismatch) is thrown and React re-renders the tree on the client.
**Cause:** Server-rendered text that depends on time, locale or local storage differs from the first client render.
**Evidence:** sweep log: 6 pageerror entries on webkit-iphone-15-pro, landscape and firefox-desktop in 'opens offline from the service worker'
**Status:** Open

### P2-044 · Service worker · Firefox
**Service worker fails icon requests on the lock screen**

**What / Repro:** 1) Firefox, signed out, /lock
**Expected · Actual:** Expected icons to load. Actual: 'A ServiceWorker intercepted the request and encountered an unexpected error' for /icons/favicon-32.png and /icons/icon-192.png.
**Cause:** The runtime-cache handler rejects instead of falling back to the network.
**Evidence:** sweep log, firefox-desktop, 'signed-out visitors land on the lock screen' · code: apps/web/sw/sw.ts
**Status:** Open

### P2-045 · Outbox · Web + PWA
**Exception in the success handler removes the next, unsent op**

**What / Repro:** Unit test: `configureOutbox({ onSuccess: () => { throw new Error("x") }, ... })`, enqueue two ops.
**Expected · Actual:** Expected second op still sent. Actual: op 1 is shifted at line 260, `onSuccess` throws inside the same `try`, the `catch` falls through to line 283 and shifts op 2 without sending it, then reports op 2 as rejected. (If the thrown error is a `TypeError`, it is treated as "offline" instead.)
**Cause:** handler call sits inside the try that classifies transport errors.
**Evidence:** code: apps/web/lib/client/outbox.ts:258-286 · code review, confidence low (needs `onSuccess` to throw)
**Status:** Open

### P2-046 · Optimistic cache vs refetch / Realtime · Web + PWA
**Rollback after a rejected op only reloads the op's own table**

**What / Repro:** Force the `sp_routines` update/delete (or `sp_task_lists` soft delete) to return 400. Edit a routine's schedule / delete a list.
**Expected · Actual:** Expected everything restored. Actual: the routine/list comes back, but the logs (or the list's tasks/goals) that were removed locally stay missing until an unrelated refetch.
**Cause:** `onError` invalidates `keys.table(op.table)` only; the dependent collections were mutated with `setRows`.
**Evidence:** code: apps/web/lib/client/data/core.ts:267-286; apps/web/lib/client/data/routines.ts:71-95; apps/web/lib/client/data/tasks.ts:160-171; apps/web/lib/client/data/goals.ts:47-60 · code review, confidence high
**Status:** Open

### P2-047 · Optimistic cache vs refetch / Realtime · Web + PWA
**`useCollection` has no error state: a failed first load shows the skeleton forever**

**What / Repro:** Cold cache, make `GET /rest/v1/sp_tasks` return 400/403. Open Tasks.
**Expected · Actual:** Expected an error/offline state with retry (POLISH 4.7). Actual: `loading: q.data === undefined` stays true; non-network errors are never retried.
**Cause:** hook drops `q.error` / `q.isError`.
**Evidence:** code: apps/web/lib/client/data/hooks.ts:18-28; apps/web/lib/client/cache.ts:35 · code review, confidence high
**Status:** Open

### P2-048 · Optimistic cache vs refetch / Realtime · Web + PWA
**Settings and quotes changes from another device never arrive live**

**What / Repro:** Two tabs. Change time zone / week start / lock timeout in tab A, or add a quote.
**Expected · Actual:** Expected tab B to follow within a second. Actual: `sp_settings` and `sp_quotes` are not in the Realtime set; settings have a 30-minute stale time, so tab B keeps the old "today" boundary, week start and lock timeout.
**Cause:** tables missing from publication/subscription.
**Evidence:** code: packages/db/src/index.ts:63-74; apps/web/lib/client/data/hooks.ts:30-38 · code review, confidence high
**Status:** Open

### P2-050 · Tasks / goals / routines data layer · Web + PWA
**"All" with Show completed renders several "Overdue" groups with the same key**

**What / Repro:** Two past dates, each with one completed and one open task. All tab, Show completed on.
**Expected · Actual:** Expected one Overdue section. Actual: one per run of adjacent overdue rows; only the first is moved to the top; duplicate React keys.
**Cause:** grouping is by adjacency after a date sort, but "overdue" spans dates.
**Evidence:** Reproduced: apps/web/e2e/audit/adversarial.spec.ts ADV-42: two regions named Overdue in All with Show completed · code: packages/shared/src/task-views.ts:91-110 · code review, confidence high (reproduced with a node snippet: keys `overdue, d:2026-11-20, d:2026-11-21, overdue`)
**Status:** Open

### P2-051 · Tasks / goals / routines data layer · Web + PWA
**Today's "completed" list omits overdue tasks completed today**

**What / Repro:** Today tab, Show completed on, complete an overdue task.
**Expected · Actual:** Expected it to appear struck through under completed. Actual: it disappears (only tasks whose `due_date === today` are kept), so after the 5 s Undo it cannot be re-opened from Today.
**Cause:** filter uses due date, not `completed_at`.
**Evidence:** code: packages/shared/src/task-views.ts:61-66 · code review, confidence medium (intent per the field comment "Tasks completed today")
**Status:** Open

### P2-052 · Tasks / goals / routines data layer · Web + PWA
**Before settings load, "today" is computed in UTC**

**What / Repro:** Cold cache, device zone America/Los_Angeles at 17:00 local, slow network. Open Tasks; or press Cmd+K and add a task "due today" before settings arrive.
**Expected · Actual:** Expected the local date. Actual: tomorrow's date is used until `sp_bootstrap` returns: today's tasks show as Overdue, and the new task is stored with tomorrow's (UTC) date.
**Cause:** fallback is the literal `"UTC"`.
**Evidence:** code: apps/web/lib/client/data/core.ts:28-35; apps/web/lib/client/data/hooks.ts:94-97 · code review, confidence high · also reported as U:A37
**Status:** Open

### P2-053 · Tasks / goals / routines data layer · Web + PWA
**Rebalance refetches on a fixed 1.2 s timer, not when the RPC has run**

**What / Repro:** Offline (or slow), reorder the same two rows ~30 times until `needsRebalance`, keep reordering, go online.
**Expected · Actual:** Expected ranks to be refreshed after the server rebalance. Actual: the refetch fires before the queued RPC is sent; later moves are computed from pre-rebalance ranks and land in the wrong place once the server has respaced.
**Cause:** `setTimeout(invalidate, 1200)` independent of the outbox.
**Evidence:** code: apps/web/components/tasks/lists.tsx:207-214 · code review, confidence medium
**Status:** Open

### P2-054 · Focus timer · Web + PWA
**`focus_complete` fires more than once, and again when a timer button is pressed within 20 s of a completion**

**What / Repro:** (a) Block Realtime so the client fallback advances a focus phase. (b) Let the server complete a focus phase with auto-start breaks, then press Pause within 20 s.
**Expected · Actual:** Expected one celebration per completed focus phase. Actual: (a) `timerAction("advance")` emits, the ticker effect emits again for the same state change (the comment says local advances are skipped; nothing skips them), and a third time when the server row replaces the optimistic one. (b) Pause re-serialises `last_completed_at` from `...+00:00` (microseconds) to `...000Z`, the string differs from the previous one, and the effect emits again.
**Cause:** completion is detected by string inequality of timestamps that are round-tripped through `Date`; no dedupe between the two emitters.
**Evidence:** code: apps/web/components/shell/focus-ticker.tsx:35-48; apps/web/lib/client/data/focus.ts:26-27, 46-62, 102 · code review, confidence high (logic), medium (whether the EventDirector coalesces it)
**Status:** Open

### P2-055 · Focus timer · Web + PWA
**Server-time skew is taken from two different clocks and without latency correction**

**What / Repro:** Run the app server with its clock 30 s off the database's, or throttle to Slow 3G. Watch the countdown while completing tasks (each triggers a universe refetch).
**Expected · Actual:** Expected a steady countdown (POLISH 4.8: never drifts by more than 1 s). Actual: `/auth/session` sets skew from the Node server's clock, every RPC sets it from Postgres; bootstrap, universe and timer results call `setServerSkew(t)` with `localAt = Date.now()` at arrival, so skew is biased by the response latency. The countdown jumps by the clock difference / latency each time a different call lands.
**Cause:** last-writer-wins skew from mixed sources.
**Evidence:** code: apps/web/lib/client/session.ts:48-51, 99-101; apps/web/lib/client/data/core.ts:127, 216; apps/web/lib/client/data/hooks.ts:50; apps/web/app/api/v1/auth/session/route.ts (server_time = app server clock) · code review, confidence high
**Status:** Open

### P2-056 · Persisted cache · Web + PWA
**Cache writes are throttled 1 s with no flush on hide: a change made just before the app is killed is missing after an offline relaunch**

**What / Repro:** Offline, add a task, close the page within 1 s, reopen offline.
**Expected · Actual:** Expected the task to be there. Actual: the outbox has the op but the cached list does not, so the task is invisible until it syncs; the user is likely to add it again.
**Cause:** trailing `setTimeout` write only.
**Evidence:** code: apps/web/lib/client/persist.ts:10-27 · code review, confidence medium
**Status:** Open

### P2-057 · Persisted cache · Web + PWA
**The whole query cache is structured-cloned to IndexedDB after every change**

**What / Repro:** 5 000 tasks + a year of logs; complete 10 tasks quickly while recording long tasks.
**Expected · Actual:** Expected no long tasks >50 ms (POLISH 4.6). Actual: every cache event dehydrates all queries and, once a second, clones the full payload into one IndexedDB value.
**Cause:** single-blob persister.
**Evidence:** code: apps/web/lib/client/persist.ts:15-27; apps/web/components/shell/providers.tsx:65-75 · code review, confidence medium (cost not measured)
**Status:** Open

### P2-058 · Service worker / PWA · Web + PWA
**While the update toast is ignored, the old worker caches new HTML it cannot serve offline**

**What / Repro:** Deploy v2, do not tap Reload, navigate once (background refresh stores v2 HTML), go offline, reload.
**Expected · Actual:** Expected the app to open offline. Actual: v2 HTML is served by the v1 worker whose precache has only v1 chunks; the new chunks need the network, so the page fails to boot.
**Cause:** same decoupling, opposite direction; `WARM_SHELL` does the same on each launch.
**Evidence:** code: apps/web/sw/sw.ts:65-83, 112-124 · code review, confidence medium
**Status:** Open

### P2-059 · Service worker / PWA · Web + PWA
**The "New version available" toast can be lost for good**

**What / Repro:** With an update waiting, trigger three other toasts (complete tasks, delete something). Or leave the app open for an hour.
**Expected · Actual:** Expected the update prompt to persist until acted on. Actual: toasts are capped at three (`slice(-3)`) so the oldest, the update prompt, is evicted; it also expires after 60 minutes. `updatefound` does not fire again for the same waiting worker, so it is never re-offered. A hard-reloaded page (no controller) never gets the prompt either.
**Cause:** update prompt shares the transient toast queue.
**Evidence:** code: apps/web/lib/client/toast.ts:43; apps/web/components/shell/service-worker.tsx:16-26, 46-51 · code review, confidence high
**Status:** Open

### P2-060 · Service worker / PWA · Web + PWA
**Offline tab switches fall back to full page loads**

**What / Repro:** Open the app, go offline, wait >5 minutes, tap between tabs.
**Expected · Actual:** Expected instant client-side tab switches (POLISH 4.3 "No full page reloads during in-app navigation, ever"). Actual: the RSC fetch for the route is not handled by the worker and fails; Next logs "Failed to fetch RSC payload" and does a hard navigation, served from the cached shell (white-flash reload, console error).
**Cause:** RSC requests are neither cached nor answered offline.
**Evidence:** code: apps/web/sw/sw.ts:97-106 (only `mode === "navigate"` is handled) · code review, confidence medium (Next router behaviour from memory)
**Status:** Open

### P2-061 · Service worker / PWA · Web + PWA
**`/lock` and `/setup` are never served by the worker**

**What / Repro:** Signed out (or redirected to lock), go offline, open the PWA.
**Expected · Actual:** Expected a designed offline state. Actual: the browser's own offline error page.
**Cause:** explicit bypass with no fallback.
**Evidence:** code: apps/web/sw/sw.ts:103-104 · code review, confidence high
**Status:** Open

### P2-062 · Service worker / PWA · Web + PWA
**Notification click always navigates an open window (full reload), picking the first window found**

**What / Repro:** App open on `/focus` with a sheet or draft; phase-end push arrives; click it.
**Expected · Actual:** Expected the app to be focused in place. Actual: `client.navigate(target)` reloads the page even when it is already on the target, dropping in-memory state; with several windows the first one (possibly `/lock`) is used.
**Cause:** unconditional `navigate`.
**Evidence:** code: apps/web/sw/sw.ts:158-174 · code review, confidence high
**Status:** Open

### P2-063 · Service worker / PWA · Web + PWA
**Phase-end notifications are always silent; subscription changes are not handled**

**What / Repro:** Android/desktop: let a focus phase end with the app closed. Separately: rotate VAPID keys or let the browser rotate the subscription.
**Expected · Actual:** Expected an audible/vibrating alert and continued delivery. Actual: `silent: true` suppresses sound and vibration; there is no `pushsubscriptionchange` handler; `enablePush` reuses an existing subscription even if it was created with a different server key; if the POST to register fails the browser stays subscribed and `pushStatus` reports `subscribed: true`.
**Cause:** see lines.
**Evidence:** code: apps/web/sw/sw.ts:146-155; apps/web/lib/client/push.ts:72-84 · code review, confidence medium (silence may be intended; not documented in DECISIONS)
**Status:** Open

### P2-064 · bugs · Web + PWA
**Older Undo toasts are evicted when a fourth toast arrives**

**What / Repro:** swipe-delete four tasks within 5 s.
**Expected · Actual:** Expected each delete to stay undoable for 5 s. Actual: the first "Task deleted · Undo" is dropped as soon as the fourth toast is pushed. The hour-long "New version available · Reload" toast is lost the same way and is not offered again until the next update check.
**Cause:** `.slice(-3)` drops the oldest toast regardless of whether it carries an undo/action.
**Evidence:** code: lib/client/toast.ts:78 · code review, confidence high
**Status:** Open

### P2-065 · bugs · Web + PWA
**Stepper hold-repeat can keep firing after the button disables itself at the minimum**

**What / Repro:** hold "−" on a progress goal until it reaches 0, keep holding, release.
**Expected · Actual:** Expected the repeat to stop. Actual: the button becomes `disabled` at `value <= min` while the pointer is down; if pointerup/leave/cancel are not dispatched to the disabled element the 90 ms interval keeps calling `onStep` until another press or unmount. For goals each tick enqueues `sp_goal_increment(-1)` (goals.ts:incrementGoal enqueues even when clamped), flooding the outbox.
**Cause:** the interval is stopped only by events on the button itself; no window-level pointerup, no stop when `disabled` flips, no clamp before calling `onStep`.
**Evidence:** code: components/ui/stepper.tsx:59-69, 87-99; callers components/goals/goal-list-detail.tsx:126-131, components/focus/settings-sheet.tsx:63-78, components/routines/day-panel.tsx:103-110 · code review, confidence medium (depends on whether the browser delivers pointerup to a disabled button; WebKit/Firefox historically do not)
**Status:** Open

### P2-066 · bugs · Web + PWA
**Back buttons push a new history entry instead of popping**

**What / Repro:** Tasks → open a list → tap the chevron Back → use the browser/Android back button or the iOS edge-swipe.
**Expected · Actual:** Expected to leave Tasks (or stay). Actual: you are taken back into the list you just left; history grows by two entries per visit. After deleting a list, back lands on `?list=<deleted>` which silently renders the Today tab.
**Cause:** `onBack` calls `navigate({ list: null })` / `router.push(pathname)`.
**Evidence:** code: components/tasks/tasks-page.tsx:57-73, 100; components/goals/goals-page.tsx:29 · code review, confidence high
**Status:** Open

### P2-067 · bugs · Web + PWA
**False empty states while data is still loading (Home, Routines, list detail)**

**What / Repro:** cold start (or first load without a warm cache).
**Expected · Actual:** Expected a skeleton or nothing. Actual: Home shows "Clear skies. Nothing left in orbit today." and "0 / 0"; Routines shows "No routines yet. Add one below."; a list shows "Nothing here yet." until the collections arrive.
**Cause:** these read `rows` and ignore `loading` from `useCollection` (Today/All tabs do check it, views.tsx:94, 140).
**Evidence:** code: components/home/home.tsx:210-213, 190-207; components/routines/day-panel.tsx:150-155; components/routines/routines-page.tsx:93-113; components/tasks/list-detail.tsx:85-92 · code review, confidence high
**Status:** Open

### P2-068 · bugs · Web + PWA
**Fullscreen timer: Space does nothing, the page shows through, and focus is not contained**

**What / Repro:** Focus → Fullscreen → press Space; on iPhone look behind the ring; press Tab.
**Expected · Actual:** Expected Space to start/pause, "just the ring over the sky", and focus kept inside. Actual: Space is ignored; on devices without the Fullscreen API (iPhone) the page, stats and tab bar remain visible at ~45% through the overlay; Tab walks into the hidden page.
**Cause:** the Space handler bails on `document.querySelector('[role="dialog"]')`, and the overlay itself is `role="dialog"`. The overlay background is `rgba(7,6,21,0.55)` with nothing hiding the page, and there is no focus trap or initial focus.
**Evidence:** code: components/focus/focus-page.tsx:43, 164-184 · code review, confidence high (Space, focus); medium (show-through, visual)
**Status:** Open

### P2-069 · bugs · Web + PWA
**Long block-list names overflow the Blocking card and the page**

**What / Repro:** create a block list with a 120-character name; open Focus on a phone.
**Expected · Actual:** Expected an ellipsis. Actual: the chip is `whitespace-nowrap shrink-0` with no max-width, so it is wider than the card and causes horizontal overflow.
**Cause:** no `max-w-full`/`truncate` on the chip label.
**Evidence:** code: components/focus/blocking.tsx:90-105; components/ui/chip.tsx:27 · code review, confidence high
**Status:** Open

### P2-070 · bugs · Web + PWA
**Reschedule swipe action is a silent no-op where no handler is passed**

**What / Repro:** iPhone: on the Universe home Today card (or the "Completed" group on Today) swipe a task left and tap Reschedule.
**Expected · Actual:** Expected a date picker (or no button). Actual: the row closes and nothing happens.
**Cause:** the button is rendered whenever the row is a touch row; `onReschedule?.(task)` is undefined there.
**Evidence:** code: components/tasks/task-row.tsx:150-164; components/home/home.tsx:215-217; components/tasks/views.tsx:100-106 · code review, confidence high
**Status:** Open

### P2-071 · bugs · Web + PWA
**Opaque row background breaks the glass card on touch devices**

**What / Repro:** iPhone: look at any task group, especially the Today card on Home (rows have `-mx-2` inside a padded hero card).
**Expected · Actual:** Expected translucent glass rows as on desktop. Actual: each row is a solid `#110e2b` rectangle (needed to cover the swipe actions), so the nebula does not show through and the Home card shows darker bands that stop short of the card edges.
**Cause:** hard-coded opaque colour on the draggable layer.
**Evidence:** code: components/tasks/task-row.tsx:188; components/tasks/list-detail.tsx:111; components/goals/goal-list-detail.tsx:245 · code review, confidence high (code); visual impact medium
**Status:** Open

### P2-072 · bugs · Web + PWA
**Only one swipe row open at a time / close on scroll is not implemented**

**What / Repro:** swipe row A left, then row B left, then scroll.
**Expected · Actual:** Expected A to close when B opens and both to close on scroll. Actual: every row keeps its own `open` state; all stay open.
**Cause:** no shared "open row id" and no scroll listener.
**Evidence:** code: components/tasks/task-row.tsx:55, 62-67 · code review, confidence high
**Status:** Open

### P2-073 · bugs · Web + PWA
**Time wheel can yank back under a paused finger**

**What / Repro:** drag a wheel and hold the finger still between two rows for >90 ms.
**Expected · Actual:** Expected the wheel to follow the finger. Actual: the 90 ms settle timer fires `onIndex`, the parent re-renders, and the `[index]` effect sees `scrollTop` more than 2 px from `index*36` and calls `scrollTo`, snapping the wheel while it is still held.
**Cause:** "settled" is inferred from a scroll-event gap, not from `scrollend`/touchend. Also the `programmatic` timeout (120 ms) and settle timeout are not cleared on unmount.
**Evidence:** code: components/ui/date-picker.tsx:242-261 · code review, confidence medium
**Status:** Open

### P2-074 · bugs · Web + PWA
**"1,000" is read as 1 in every amount field**

**What / Repro:** new progress goal, Total = `1,000`.
**Expected · Actual:** Expected 1000 (or a validation message). Actual: `Number("1.000")` → 1. `1,234.5` → NaN: the sheet shows a generic error; Stepper/AmountLabel discard it silently. There is no upper bound either (`999999999999999999999999` is accepted and sent).
**Cause:** `replace(",", ".")` treats the first comma as a decimal point; no max; no feedback on rejection.
**Evidence:** code: components/goals/goal-sheet.tsx:43; components/routines/routine-sheet.tsx:100; components/ui/stepper.tsx:81; components/ui/amount.tsx:22 · code review, confidence high
**Status:** Open

### P2-075 · bugs · Web + PWA
**Form sheets reset what you are typing when the edited row changes underneath**

**What / Repro:** edit a routine/goal/list in one tab; while the sheet is open change that row in another tab/device (or let any Realtime update for it arrive).
**Expected · Actual:** Expected the draft to survive. Actual: all fields snap back to the server values.
**Cause:** the seeding effects depend on the row object (`[open, goal]`, `[open, routine]`, `[open, list, defaultEmoji]`); the cache replaces the object on every update.
**Evidence:** code: components/goals/goal-sheet.tsx:29-37; components/routines/routine-sheet.tsx:62-78; components/tasks/lists.tsx:118-123 · code review, confidence medium-high
**Status:** Open

### P2-076 · bugs · Web + PWA
**Quick add keeps a deleted list selected**

**What / Repro:** choose a list in the List chip, delete that list from another tab/the right column, then add the task.
**Expected · Actual:** Expected the chip to reset. Actual: `list` is null (chip reads "List", looks unset) but `listId` is still set, so the due-date chip stays disabled and the task is created with a dead `list_id` (rejected by the server or invisible).
**Cause:** `listId` is never reconciled with `lists`.
**Evidence:** code: components/tasks/quick-add.tsx:49, 66-81 · code review, confidence medium
**Status:** Open

### P2-077 · bugs · Web + PWA
**Inactivity lock: content is shown before the lock engages on a cold start, and it cannot be cleared offline**

**What / Repro:** set "Lock after 5 minutes", close the PWA, reopen a day later; also try unlocking in airplane mode.
**Expected · Actual:** Expected the PIN screen first. Actual: the effect waits for `useSettings()` (async IndexedDB restore/network), so the shell and cached data paint first and the overlay appears afterwards. Offline, `/api/v1/auth/unlock` fails with "Something went wrong" and the offline-capable app stays locked.
**Cause:** lock state is derived only after settings load; unlock is network-only.
**Evidence:** code: components/shell/inactivity-lock.tsx:31-49; components/auth/lock-screen.tsx:80-96 · code review, confidence medium
**Status:** Open

### P2-078 · bugs · Web + PWA
**Segmented control: arrow keys change the value but focus stays on the old segment**

**What / Repro:** Tab to a segmented control, press →.
**Expected · Actual:** Expected focus (and the focus ring) to move with the selection. Actual: the previously focused button now has `tabIndex=-1` and still holds focus and the ring.
**Cause:** roving tabindex without `.focus()` on the new radio.
**Evidence:** code: components/ui/segmented.tsx:42-53, 69-76 · code review, confidence high
**Status:** Open

### P2-079 · bugs · Web + PWA
**Firefox: extension Download button is a `<button>` inside an `<a>`**

**What / Repro:** Firefox desktop → Settings → Extension → Download.
**Expected · Actual:** Expected the zip to download. Actual (per the HTML activation rules that Firefox follows): the click's activation target is the inner button (type=button, no action), so the link is not followed. The anchor is also `display: contents` with the button at `tabIndex=-1`, so keyboard users may have no focusable target.
**Evidence:** code: components/settings/extension.tsx:71-81 · code review, confidence medium
**Status:** Open

### P2-080 · bugs · Web + PWA
**Settings has no back affordance on phones; About → OpenAPI leaves the app shell**

**What / Repro:** iPhone PWA: gear on Universe home → Settings. Then About → OpenAPI.
**Expected · Actual:** Expected a back chevron as on other pushed screens. Actual: no back control and no highlighted tab; the only way out is a tab tap. The OpenAPI link is a plain same-origin `<a>` that replaces the app with raw JSON inside the standalone window, with no UI to return.
**Evidence:** code: components/settings/settings.tsx:26-56; components/home/home.tsx:158-164; components/settings/about.tsx:28-30 · code review, confidence high (no back button); medium (stranding in standalone)
**Status:** Open

### P2-081 · bugs · Web + PWA
**Enter with an IME commits half-composed text**

**What / Repro:** type with a Japanese/Chinese IME in the command bar and press Enter to confirm a candidate.
**Expected · Actual:** Expected the candidate to be confirmed. Actual: the handler runs the command / blurs / adds immediately.
**Cause:** no `e.nativeEvent.isComposing` (or keyCode 229) check.
**Evidence:** code: components/shell/command-bar-impl.tsx:153-156; components/tasks/task-sheet.tsx:73; components/focus/blocking.tsx:231-236; components/ui/stepper.tsx:126-129; components/ui/amount.tsx:40-43 · code review, confidence medium
**Status:** Open

### P2-082 · bugs · Web + PWA
**1000 tasks: no virtualisation, every row is a motion layout + drag component**

**What / Repro:** All tab with 1000 tasks on an iPhone; complete one.
**Expected · Actual:** Expected smooth scroll and <50 ms tasks. Actual (by construction): 1000 `m.div layout="position"` rows inside AnimatePresence (FLIP measures every row on each list change), each with its own `useMotionValue`/two `useTransform`s and a drag recogniser, each group a separate `backdrop-filter` surface.
**Evidence:** code: components/tasks/task-group.tsx:41-66; components/tasks/task-row.tsx:54-60, 180-191; components/tasks/views.tsx:125-139 · code review, confidence medium-high (from code; not profiled)
**Status:** Open

### P2-083 · bugs · Web + PWA
**Quick add re-focuses itself on every later mount once "N" or the New-task shortcut has been used**

**What / Repro:** press N once (or launch from the home-screen "New task" shortcut, `?new=1`). Then switch to another tab and back to Tasks, or go Today → Lists → Today on a phone.
**Expected · Actual:** Expected focus only in response to the shortcut. Actual: the quick-add input takes focus every time it mounts for the rest of the session (on phones this can raise the keyboard and it pauses the universe, which treats a focused field as "typing").
**Cause:** `quickAddNonce` only ever increases and the effect runs on mount whenever `nonce > 0`; it does not compare against the nonce seen at mount.
**Evidence:** code: components/tasks/quick-add.tsx:54, 62-64; lib/client/ui-store.ts:22-23; components/tasks/tasks-page.tsx:76-81, 90, 153-163; components/shell/shortcuts.tsx:29-34 · code review, confidence high
**Status:** Open

### P2-084 · Native feel §4.1 Touch & feedback · iPhone PWA
**Pressed feedback on pointerdown within one frame**

**What:** POLISH_SPEC §4.1 Touch & feedback requirement is partly. Feedback is CSS `:active` with a 100 ms transition, not pointerdown-driven: ui/button.tsx:54, 127; ui/chip.tsx:28; focus/timer.tsx:138; auth/pin-pad.tsx:158. No pressed state at all on: task row body (tasks/task-row.tsx:93-98), list cards (tasks/lists.tsx:58-63, goals/goal-lists.tsx:78-83), goal rows (goals/goal-list-detail.tsx:63-68, 97-104), routine rows (routines/manage.tsx:76-80, hover only), ListRow on touch (ui/grouped-list.tsx:61 fill only), Switch (ui/switch.tsx:24-27), segmented (ui/segmented.tsx:77-83), date cells (ui/date-picker.tsx:155), calendar cells (tasks/calendar-tab.tsx:165-173), tab bar (shell/nav.tsx:59-62: fill on inactive tabs only), toast Undo (ui/toaster.tsx:42), stepper (fill only, ui/stepper.tsx:98).
**Evidence:** code review, confidence high
**Status:** Open

### P2-085 · Native feel §4.1 Touch & feedback · iPhone PWA
**touch-callout none + user-select none on chrome**

**What:** POLISH_SPEC §4.1 Touch & feedback requirement is not met. No `-webkit-touch-callout` anywhere. `select-none` only on ui/button.tsx:53, ui/stepper.tsx:107, ui/date-picker.tsx:103, ui/emoji-grid.tsx:65, home/home.tsx:252. Tab bar links, IconButton, Chip, rows, cards, headers and nav are all selectable.
**Evidence:** code review, confidence high
**Status:** Open

### P2-086 · Native feel §4.1 Touch & feedback · iPhone PWA
**Long-press never triggers selection/callout; reserved for our actions**

**What:** POLISH_SPEC §4.1 Touch & feedback requirement is not met. Tab bar and sidebar are `<a>` (shell/nav.tsx:55, 122, 142; home/home.tsx:158, 182) with no callout suppression or `draggable={false}`; row text is selectable; drag handles have `touch-none` but no callout/user-select rules (tasks/lists.tsx:80). Long-press reorder does not exist on rows (A06).
**Evidence:** code review, confidence high
**Status:** Open

### P2-087 · Native feel §4.1 Touch & feedback · iPhone PWA
**Touch targets ≥ 44×44**

**What:** POLISH_SPEC §4.1 Touch & feedback requirement is not met. Sheet close 32 px (ui/sheet-impl.tsx:191) and 24 px grabber (121); IconButton 36: ui/date-picker.tsx:117, 120, 190; tasks/calendar-tab.tsx:327, 336; tasks/lists.tsx:240; goals/goal-lists.tsx:43; shell/install-hint.tsx:36. IconButton 40: tasks/list-detail.tsx:56, 71; goals/goal-list-detail.tsx:160, 170; routines/routines-page.tsx:84, 87; focus/blocking.tsx:197. Button `sm` 36 px (ui/button.tsx:28): "Move all to today", calendar "Today", "Add goal", Revoke, Export/Import/Send, Download. Chip 36/32 px (ui/chip.tsx:29): quick-add chips, date quick picks, block-list chips; weekday chips 40 (routines/routine-sheet.tsx:243). Segmented 38/32 px (ui/segmented.tsx:79). Switch 51×31 (ui/switch.tsx:25). Date cells 40 px (ui/date-picker.tsx:155), wheel rows 36 (222). Drag handles 36 (tasks/lists.tsx:80, goals/goal-lists.tsx:113). Toast Undo 36 (ui/toaster.tsx:42). Settings section chips 36 (settings/settings.tsx:38). "See all"/"Edit lists" 36 (home/home.tsx:184, focus/blocking.tsx:75). Site remove 32 (focus/blocking.tsx:281). Amount tap-to-type ~38×~20 (ui/amount.tsx:54); progress-goal name button ~22 px tall (goals/goal-list-detail.tsx:97-104). Emoji search 40, recents 40 (ui/emoji-grid.tsx:29, 48).
**Evidence:** code review, confidence high
**Status:** Open

### P2-088 · Native feel §4.1 Touch & feedback · iPhone PWA
**Haptics**

**What:** POLISH_SPEC §4.1 Touch & feedback requirement is not met. No `navigator.vibrate`, no native `<input type="checkbox" switch>`; Switch and Checkbox are buttons (ui/switch.tsx:16, ui/checkbox.tsx:26). Nothing in DECISIONS.md.
**Evidence:** code review, confidence high
**Status:** Open

### P2-089 · Native feel §4.2 Gestures · iPhone PWA
**Edge swipe back on pushed screens**

**What:** POLISH_SPEC §4.2 Gestures requirement is not met. No gesture code. Pushed screens are query-param states of the same route (tasks/tasks-page.tsx:49-73, goals/goals-page.tsx:21-37) with a chevron button that pushes history (A11); Settings has no back at all (A26).
**Evidence:** code review, confidence high
**Status:** Open

### P2-090 · Native feel §4.2 Gestures · iPhone PWA
**Sheets: detents, velocity fling, rubber-band, scroll hand-off**

**What:** POLISH_SPEC §4.2 Gestures requirement is partly. ui/sheet-impl.tsx:98-119. Has drag-to-dismiss with distance/velocity thresholds (51-53) and downward elasticity. Missing: detents are static CSS (`auto` vs `h-[92dvh]`, 101), no medium↔large dragging; upward elasticity is 0 (117); drag starts only from the 24 px grabber (`dragListener={false}`, 115-122), so there is no hand-off from the inner scroller at scrollTop 0; reduced-motion disables drag entirely (113).
**Evidence:** code review, confidence high
**Status:** Open

### P2-091 · Native feel §4.2 Gestures · iPhone PWA
**Swipe actions: finger tracking, rubber-band, full swipe commits, spring back, one open, close on scroll**

**What:** POLISH_SPEC §4.2 Gestures requirement is partly. tasks/task-row.tsx:180-191. Finger tracking, elastic ends and spring settle exist. Missing: full left swipe does not commit delete; right-swipe logic is wrong from the open state (A03); several rows can be open and scrolling does not close them (A17); Reschedule no-op in places (A15).
**Evidence:** code review, confidence high
**Status:** Open

### P2-092 · Native feel §4.2 Gestures · iPhone PWA
**All gesture animations interruptible**

**What:** POLISH_SPEC §4.2 Gestures requirement is partly. Row and sheet use motion drag on the same motion value, so a grab takes over. Sheet enter/exit and the row `settle` spring are not driven from a shared position for the non-drag areas (the sheet body cannot be grabbed), and there is no page-level gesture to interrupt.
**Evidence:** code review, confidence high
**Status:** Open

### P2-093 · Native feel §4.3 Scrolling & navigation · iPhone PWA
**Native momentum only; overscroll contain on inner scrollers; no chaining; no double scrollbars**

**What:** POLISH_SPEC §4.3 Scrolling & navigation requirement is partly. No JS scroll hijack. `overscroll-contain` on sheet bodies and wheels (ui/sheet-impl.tsx:92, 135; ui/date-picker.tsx:281). Missing on: command list (shell/command-bar-impl.tsx:199), quick-add list chooser (tasks/quick-add.tsx:121), emoji viewport (ui/emoji-grid.tsx:57), horizontal chip scrollers (ui/date-picker.tsx:104, tasks/quick-add.tsx:210, settings/settings.tsx:32), lock overlay (shell/inactivity-lock.tsx:66). Home's `touch-none` stage (home/home.tsx:252) blocks page scroll over most of the screen.
**Evidence:** code review, confidence high
**Status:** Open

### P2-094 · Native feel §4.3 Scrolling & navigation · iPhone PWA
**Large title collapses into a compact glass nav bar**

**What:** POLISH_SPEC §4.3 Scrolling & navigation requirement is not met. Static `h1.text-large-title` in the flow: ui/page.tsx:40-47, tasks/tasks-page.tsx:137-141, routines/routines-page.tsx:81-91, focus/focus-page.tsx:101-104, home/home.tsx:145. No sticky bar, no scroll observer.
**Evidence:** code review, confidence high
**Status:** Open

### P2-095 · Native feel §4.3 Scrolling & navigation · iPhone PWA
**Tab state preserved; re-tap scrolls to top then pops to root**

**What:** POLISH_SPEC §4.3 Scrolling & navigation requirement is not met. Each tab is its own Next route under one layout (`app/(app)/layout.tsx:4-6` → shell/app-shell.tsx:18); page components unmount on switch. Local state is lost (tasks-page.tsx:39-41 open sheet/calendar date; calendar-tab.tsx:237 cursor; routines-page.tsx:57-59; manage.tsx:34; stats.tsx:63). Tab links are bare paths (shell/nav.tsx:26-32), so `?tab=`/`?list=` are dropped and scroll resets. Tasks/Goals render `null` first (Suspense fallback, `app/(app)/tasks/page.tsx:10`) then gate on `mounted` (tasks-page.tsx:164), so a switch flashes empty. No re-tap handler on the tab bar (nav.tsx:55-66).
**Evidence:** code review, confidence high
**Status:** Open

### P2-096 · Native feel §4.3 Scrolling & navigation · iPhone PWA
**Push/pop transitions via View Transitions; no slide for tabs**

**What:** POLISH_SPEC §4.3 Scrolling & navigation requirement is not met. No `startViewTransition`/`viewTransition` usage anywhere; list detail swaps in place with no animation (tasks-page.tsx:93-102, goals-page.tsx:31-37).
**Evidence:** code review, confidence high
**Status:** Open

### P2-097 · Native feel §4.3 Scrolling & navigation · iPhone PWA
**No full reloads in-app; prefetch likely routes**

**What:** POLISH_SPEC §4.3 Scrolling & navigation requirement is partly. Navigation uses `next/link`/`router` (default prefetch). Full loads remain at: lock success (`app/lock/lock-route.tsx:15`), sign-out (settings/security.tsx:43), setup finish (setup/wizard.tsx:935), SW update (shell/service-worker.tsx:32), and plain anchors (settings/about.tsx:28, settings/settings.tsx:35-41 hash links). No explicit prefetch of list-detail states (same route).
**Evidence:** code review, confidence high
**Status:** Open

### P2-098 · Native feel §4.4 Keyboard & forms · iPhone PWA
**visualViewport: quick-add and sheets sit above the keyboard; no jump/gap**

**What:** POLISH_SPEC §4.4 Keyboard & forms requirement is partly. `--kb` is maintained (ui/use-media.ts:35-60) and used by sheets (ui/sheet-impl.tsx:107) and toasts (ui/toaster.tsx:71) only. The quick-add bar is an in-flow card at the top of the page (tasks/quick-add.tsx:181-188, tasks-page.tsx:153-163) and does not follow the keyboard. The sheet uses padding rather than translating by `offsetTop`, updated one rAF late, so iOS's own viewport pan can still move it. `--kb` is only wired inside the signed-in shell (shell/providers.tsx:26), and pinch-zoom is misread as a keyboard. `data-keyboard` is set but never used (tab bar is not hidden).
**Evidence:** code review, confidence high
**Status:** Open

### P2-099 · Native feel §4.4 Keyboard & forms · iPhone PWA
**Inputs ≥ 16 px; inputmode / enterkeyhint / autocapitalize / autocomplete; decimal keypad**

**What:** POLISH_SPEC §4.4 Keyboard & forms requirement is partly. 16 px floor: app/globals.css:110-115 (exceptions: read-only SQL textareas at 12 px, settings/connection.tsx:219, setup/wizard.tsx:632). Decimal keypad present: ui/stepper.tsx:121, ui/amount.tsx:34, goals/goal-sheet.tsx:105, routines/routine-sheet.tsx:183; numeric: routine-sheet.tsx:255, settings/general.tsx:93. Missing `enterKeyHint`/`autoComplete="off"` on: task sheet name (tasks/task-sheet.tsx:67-74), list name (tasks/lists.tsx:146-153), goal name/unit (goals/goal-sheet.tsx:66-73, 110-117), routine name/unit (routines/routine-sheet.tsx:147-154, 188-195), quotes (settings/quotes.tsx:40-60), stepper/amount inputs, emoji search (ui/emoji-grid.tsx:26-30), block-site textarea (focus/blocking.tsx:223-252: has autocapitalize none but no `inputMode="url"`/`enterKeyHint`). Units should be `autoCapitalize="none"`. Only quick-add sets `enterKeyHint`/`autoComplete` (tasks/quick-add.tsx:200-201).
**Evidence:** code review, confidence high
**Status:** Open

### P2-100 · Native feel §4.4 Keyboard & forms · iPhone PWA
**Enter in quick-add submits and keeps focus; scrolling dismisses the keyboard**

**What:** POLISH_SPEC §4.4 Keyboard & forms requirement is partly. Submit + refocus: tasks/quick-add.tsx:69-88, 181-185. No blur-on-scroll anywhere.
**Evidence:** code review, confidence high
**Status:** Open

### P2-101 · Native feel §4.4 Keyboard & forms · iPhone PWA
**Focus moves correctly on sheet open/close; no focus traps**

**What:** POLISH_SPEC §4.4 Keyboard & forms requirement is partly. Radix Dialog handles focus in/out for sheets and the command bar. Initial focus lands on the 32 px Close button unless a field has `autoFocus`. Custom overlays have no focus management: fullscreen timer (focus/focus-page.tsx:164-184), inactivity lock (A01). Segmented/date-grid roving focus bugs (A24).
**Evidence:** code review, confidence high
**Status:** Open

### P2-102 · Native feel §4.5 Launch, resume & state restoration · iPhone PWA
**First frame is the real shell with cached data; skeletons only when uncached**

**What:** POLISH_SPEC §4.5 Launch, resume & state restoration requirement is partly. Shell and nav are server-rendered, cache is persisted (shell/providers.tsx:65-78). But page bodies wait for hydration (`mounted &&`: tasks-page.tsx:164, routines-page.tsx:93, focus-page.tsx:93, 106; Suspense `fallback={null}` on Tasks/Goals), there are no skeletons at all, and several screens show false empty states while loading (A12).
**Evidence:** code review, confidence high
**Status:** Open

### P2-103 · Native feel §4.5 Launch, resume & state restoration · iPhone PWA
**Restore last route, tab, scroll, open sheet and drafts after a kill**

**What:** POLISH_SPEC §4.5 Launch, resume & state restoration requirement is not met. Nothing is persisted except view toggles (`sp-show-completed:*`, `sp-calendar-mode`, lib/client/prefs.ts) and recent emoji. `start_url` is "/" (app/manifest.ts:9). Quick-add text, description drafts, open sheet ids and scroll positions live in `useState` only (tasks/quick-add.tsx:46-51, tasks/task-sheet.tsx:28-29).
**Evidence:** code review, confidence high
**Status:** Open

### P2-104 · Native feel §4.5 Launch, resume & state restoration · iPhone PWA
**Resume: silent refresh, timer from phase_ends_at, no stale Overdue/day**

**What:** POLISH_SPEC §4.5 Launch, resume & state restoration requirement is partly. `refetchOnWindowFocus` (lib/client/cache.ts:33, but only for queries older than the 5 min staleTime), minute tick on `visibilitychange` (lib/client/data/hooks.ts:70-83) so Today/Overdue roll over, timer derives from `phase_ends_at` (focus/timer.tsx:71-79). Gaps: stale-`now` frame on resume (A35), stats not live (A34), fallback advance fires once (A36), UTC-until-settings (A37).
**Evidence:** code review, confidence high
**Status:** Open

### P2-105 · Native feel §4.6 Smoothness · iPhone PWA
**Animate only transform/opacity; no layout thrash; cap backdrop-filter**

**What:** POLISH_SPEC §4.6 Smoothness requirement is not met. Height: tasks/task-group.tsx:47-49, goals/goal-list-detail.tsx:235-237, focus/stats.tsx:140. Width: ui/progress.tsx:41, goals/cards.tsx:132 (width+height+box-shadow), setup/wizard.tsx:158 (`transition-all` on width). Box-shadow: tasks/lists.tsx:52, goals/goal-lists.tsx:72. Filter: ui/button.tsx:54 (`filter` for hover brightness), app/globals.css:416-418 (blur on the full-screen canvas), ui/timer-ring.tsx:42 (drop-shadow on an SVG whose `stroke-dashoffset` transitions 4×/s, line 65), ui/progress.tsx:111. Layout reads: `layout="position"` on every task row (task-group.tsx:46). Backdrop stacking: every group/card/pill is its own 28 px blur (`glass` in ui/grouped-list.tsx:9, task-group.tsx:39, ui/segmented.tsx:61, ui/button.tsx:128, ui/sync-indicator.tsx:17, tasks/quick-add.tsx:186); nested blur-in-blur: segmented inside GroupedList (settings/general.tsx:51), segmented/steppers inside `glass-strong` sheets, chips row inside cards, IconButton `glass` over glass cards; tab bar blurs behind a 98.5%-opaque fill (shell/nav.tsx:44); sidebar `backdrop-blur-xl` (nav.tsx:97); lock overlay `backdrop-blur-2xl` over everything (shell/inactivity-lock.tsx:66).
**Evidence:** code review, confidence high
**Status:** Open

### P2-106 · Native feel §4.6 Smoothness · iPhone PWA
**Universe yields to interaction**

**What:** POLISH_SPEC §4.6 Smoothness requirement is partly. Host pauses only when hidden or while a field is focused on a coarse pointer (universe/universe-host.tsx:128-149). No signal for scrolling, row/sheet dragging or sheet animation is sent from the UI.
**Evidence:** code review, confidence high
**Status:** Open

### P2-107 · Native feel §4.6 Smoothness · iPhone PWA
**No long tasks > 50 ms; INP/frame timings recorded**

**What:** POLISH_SPEC §4.6 Smoothness requirement is not met (unmeasured). No PERF.md; A28 describes the obvious risk.
**Evidence:** code review, confidence high
**Status:** Open

### P2-108 · Native feel §4.6 Smoothness · iPhone PWA
**Cosmic events never drop a UI frame**

**What:** POLISH_SPEC §4.6 Smoothness requirement is unverified. Overlay is outside this area; UI side completes tasks synchronously with layout animation on every row (task-group.tsx).
**Evidence:** code review, confidence high
**Status:** Open

### P2-109 · Native feel §4.7 Visual consistency · iPhone PWA
**Safe areas re-verified after gesture/sheet changes**

**What:** POLISH_SPEC §4.7 Visual consistency requirement is partly. Insets come from variables everywhere (ui/page.tsx:21, ui/sheet-impl.tsx:104-108, 136, 143, shell/nav.tsx:45-50, ui/toaster.tsx:70-74). Gaps: phone sheet has no top inset limit other than 92dvh (landscape), fullscreen overlay pads top/bottom but not left/right for the centred content (focus/focus-page.tsx:171), command bar width ignores side insets (shell/command-bar-impl.tsx:170).
**Evidence:** code review, confidence high
**Status:** Open

### P2-110 · Native feel §4.7 Visual consistency · iPhone PWA
**Respect iOS text size (rem / -apple-system-body)**

**What:** POLISH_SPEC §4.7 Visual consistency requirement is not met. All type is px: packages/ui-tokens/css/theme.css text tokens, app/globals.css:77-78, 113, 205, and dozens of `text-[NNpx]` utilities; `-webkit-text-size-adjust: 100%` (globals.css:64).
**Evidence:** code review, confidence high
**Status:** Open

### P2-111 · Native feel §4.7 Visual consistency · iPhone PWA
**Designed loading, empty, error and offline states for every screen and sheet**

**What:** POLISH_SPEC §4.7 Visual consistency requirement is partly. Empty states exist (ui/page.tsx:52-73 and callers). Loading: none anywhere (blank until data; false empties per A12; "…" placeholders in settings). Error: none for collections, stats (focus/stats.tsx:65-70), devices, connection, about, older-log/older-task queries. Offline: only the SyncIndicator on Focus and Settings (focus/focus-page.tsx:103, settings/settings.tsx:29); Tasks, Goals, Routines and Home show no offline/pending indication.
**Evidence:** code review, confidence high
**Status:** Open

### P2-112 · Native feel §4.7 Visual consistency · iPhone PWA
**Long text truncates; spacing from tokens; no hard-coded colours**

**What:** POLISH_SPEC §4.7 Visual consistency requirement is not met. Truncation gaps: A14, A29, A30. Hard-coded colours outside ui-tokens (count per file): goals/cards.tsx (13, planet hues), ui/button.tsx:23-24, 128; ui/switch.tsx:26, 31; tasks/task-row.tsx:160, 174, 188; shell/nav.tsx:44, 97; ui/timer-ring.tsx:51-52; ui/sheet-impl.tsx:62, 125; ui/progress.tsx:98, 137, 158; ui/page.tsx:66; ui/emoji-grid.tsx:29, 68; tasks/list-detail.tsx:111; goals/goal-list-detail.tsx:245; shell/command-bar-impl.tsx:166, 170; ui/field.tsx:53; ui/amount.tsx:44; ui/toaster.tsx:27; ui/sync-indicator.tsx:25; ui/segmented.tsx:89; ui/popover-impl.tsx:40; tasks/lists.tsx:53; tasks/calendar-tab.tsx:117; settings/appearance.tsx:54; goals/goal-lists.tsx:73; focus/timer.tsx:141; focus/focus-page.tsx:170; app/globals.css:152, 183, 189, 192, 259, 279, 473. Off-grid sizes are common (`rounded-[14px]`, `rounded-[16px]`, `rounded-[6px]`, `gap-[3px]`, `h-[38px]`, `p-[3px]`).
**Evidence:** code review, confidence high
**Status:** Open

### P2-113 · Native feel §4.8 Desktop web & extension · iPhone PWA
**Hover, visible focus, ⌘K and shortcuts, drag reorder with mouse and keyboard, right-click menus**

**What:** POLISH_SPEC §4.8 Desktop web & extension requirement is partly. Hover states and a global `:focus-visible` ring exist (app/globals.css:130-137); ⌘K (shell/command-bar.tsx:17-26), N / 1-5 (shell/shortcuts.tsx), Space (focus/focus-page.tsx:34-51); dnd-kit mouse + keyboard sensors (ui/sortable.tsx:37-41). Gaps: no context menus anywhere (the only `onContextMenu` is a preventDefault in ui/stepper.tsx:97); shortcut issues A13, A32; focus-ring issues A24; ⌘K works under the lock (A01); Firefox download (A25).
**Evidence:** code review, confidence high
**Status:** Open

### P2-114 · Native feel §4.8 Desktop web & extension · Extension
**Extension popup opens instantly and mirrors changes within 1 s**

**What:** POLISH_SPEC §4.8 Desktop web & extension requirement is n/a. Outside this audit area (apps/extension).
**Evidence:** code review, confidence high
**Status:** Open

### P2-115 · Native feel §4.8 Desktop web & extension · Extension
**Block page countdown and "Focus complete" handoff**

**What:** POLISH_SPEC §4.8 Desktop web & extension requirement is n/a. Outside this audit area (apps/extension).
**Evidence:** code review, confidence high
**Status:** Open

### P2-116 · Server · Server / API
**PIN lockout is checked before the hash and recorded after it, so parallel guesses all get through**

**What / Repro:** send N `POST /api/v1/auth/pin` requests concurrently, each with a different PIN. Every handler runs `readLockout()` (not locked) and then awaits `verifyPin` (argon2, tens of ms, 4 libuv threads). All N are evaluated; `recordFailure()` only runs afterwards. A correct PIN anywhere in the burst succeeds and calls `clearLockout()`, even though 5+ failures were already recorded.
**Expected · Actual:** expected at most 5 guesses before a lock. Actual: N guesses per lock window, where N is bounded only by the per-IP limiter (20/min per IP, and see finding 4). After the burst the lock is capped at 1 hour, so the attacker gets N guesses per hour. `/api/v1/auth/unlock` and `/auth/pin/change` share the same path.
**Cause:** check-then-act across an `await`, with no serialisation and no re-check after the hash.
**Evidence:** Not reproduced with 25 parallel requests (apps/web/e2e/audit/adversarial.spec.ts ADV-60 passes: at most 5 were evaluated on this machine); the race window exists in code but argon2 verification serialises enough here. Severity lowered to P2. · code: apps/web/lib/server/auth.ts:71-84; apps/web/lib/server/lockout.ts:65-69 · code review, confidence high for the race (traced); medium for practical scale
**Status:** Open

### P2-117 · Server · Server / API
**Rate limiting and the audit log trust the client-supplied `X-Forwarded-For`**

**What / Repro:** `curl -H 'X-Forwarded-For: 1.2.3.<n>' …/api/v1/auth/pin` with a new value per request. Each request lands in a fresh bucket. DECISIONS.md line 44 notes the e2e suite relies on exactly this.
**Expected · Actual:** expected the limiter to key on the real peer. Actual: the left-most XFF entry is used verbatim, so any deployment where the header is not overwritten by a trusted proxy (direct port exposure, a proxy that appends) has no per-IP limit, which removes the cap on finding 3. The spoofed value is also what is stored in `sp_auth_events.ip`. With no header at all, every client shares the bucket `"unknown"`.
**Cause:** `req.headers.get("x-forwarded-for")?.split(",")[0]`.
**Evidence:** code: apps/web/lib/server/http.ts:152-155; used at auth.ts:61-62, 192; setup-guard.ts:12; app/api/setup/pin/route.ts:22; app/api/v1/push/test/route.ts:12 · code review, confidence high (traced); impact depends on the proxy in front
**Status:** Open

### P2-118 · Server · Server / API
**Global lockout never decays, so one wrong guess per lock window keeps the owner locked out**

**What / Repro:** anyone who can reach the app sends 5 wrong PINs, then one wrong PIN each time the lock expires. `failures` only resets on a successful PIN, so the lock goes 30s, 60s, … 1h and stays at 1h per single request.
**Expected · Actual:** the global lock is a documented decision (DECISIONS.md line 37), but the counter has no time-based decay, so an anonymous party can hold the instance locked indefinitely at one request per hour; the owner's correct PIN is rejected during a lock.
**Cause:** `nextOnFailure` increments forever; `lastFailureAt` is stored but never used.
**Evidence:** code: apps/web/lib/server/lockout.ts:22-32; apps/web/lib/server/auth.ts:71-84 · code review, confidence high (traced)
**Status:** Open

### P2-119 · Server · Server / API
**`authenticate()` does not verify the JWT signature; routes that then act with the service role trust a forged token**

**What / Repro:** craft an unsigned JWT with `sub = <owner uuid>` and a future `exp`; send it as `Authorization: Bearer …`.
**Expected · Actual:** expected a forged token to be rejected with 401 everywhere. Actual: only the routes that forward the token to PostgREST are protected, by PostgREST.
**Cause:** `decodeJwt` + `sub`/`exp` comparison only, unless the caller opts into `verify`.
**Evidence:** code: apps/web/lib/server/supabase.ts:123-135; callers without `verify: true`: app/api/v1/push/test/route.ts:11, app/api/setup/connection/route.ts:13, app/api/v1/auth/logout/route.ts:11-18, app/api/v1/auth/unlock/route.ts:10, lib/server/resource.ts:52-53 · code review, confidence high (traced); exploitation needs the owner's user id
**Status:** Open

### P2-120 · Server · Server / API
**Revoked devices and "Sign out everywhere" keep working for the life of the access token**

**What / Repro:** sign in from the extension (bearer tokens). Revoke that device, or press "Sign out everywhere". Keep calling `/api/v1/tasks` etc. with the old access token.
**Expected · Actual:** expected the device to be cut off. Actual: `guard()` never uses `verify`, and PostgREST only checks signature and `exp`, so the token keeps full read/write access until it expires (Supabase default 1 hour). Only `/auth/session`, `/devices/:id`, logout-everywhere and PIN change check the session server-side.
**Cause:** stateless JWT acceptance on every data route.
**Evidence:** code: apps/web/lib/server/supabase.ts:126-135; apps/web/lib/server/auth.ts:235-284; lib/server/resource.ts:51-61 · code review, confidence high (traced)
**Status:** Open

### P2-121 · Server · Server / API
**No security headers at all**

**What / Repro:** `curl -I https://<app>/lock` — no `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`.
**Expected · Actual:** the PIN keypad and the whole signed-in app can be framed by any site (clickjacking); no CSP backstop for the page that holds an in-memory access token.
**Cause:** no `headers()` in the Next config and none set in the proxy.
**Evidence:** code: apps/web/next.config.ts:4-13; apps/web/proxy.ts:22-50 · code review, confidence high (grep over apps/web for CSP / X-Frame-Options / HSTS / nosniff found nothing)
**Status:** Open

### P2-122 · Server · Server / API
**Cookie-authenticated mutating routes have no CSRF defence beyond SameSite=Lax**

**What / Repro:** from any page on a sibling subdomain of the app (same registrable domain, e.g. another app on the same Dokploy host), submit `fetch("https://planner.example.com/api/v1/auth/logout-everywhere", {method:"POST", credentials:"include", mode:"no-cors", headers:{"Content-Type":"text/plain"}, body:"{}"})`, or POST to `/api/v1/import`, `/tasks`, `/auth/pin/change` (needs PIN).
**Expected · Actual:** expected a cross-origin write to be refused. Actual: same-site requests carry the Lax cookies, `readJson` parses the body regardless of `Content-Type` (so no preflight is forced), and no handler checks `Origin`; CORS only stops the attacker reading the response.
**Cause:** no Origin / Fetch-Metadata check, and JSON accepted from "simple" content types.
**Evidence:** code: apps/web/lib/server/http.ts:141-150, 157-161; apps/web/lib/server/supabase.ts:61-68 · code review, confidence medium (traced; relies on a same-site attacker origin)
**Status:** Open

### P2-123 · Server · Server / API
**Saving a changed connection after setup locks the instance out (and never re-keys the owner)**

**What / Repro:** on a configured instance, authenticated `POST /api/setup/connect` with a rotated anon/service key or a different URL and `dryRun` omitted.
**Expected · Actual:** expected the new connection to be saved and re-verified. Actual: `changed` sets `schemaVerified: false`, which puts the app in the same dead state as finding 1 (503 everywhere, setup endpoints 403). If the URL points at a different instance, `ownerUserId` / `ownerPassword` still refer to the old one and nothing recreates the owner, because `createPin` refuses once a PIN exists.
**Cause:** the first-run "re-verify" rule applied to a completed setup.
**Evidence:** code: apps/web/app/api/setup/connect/route.ts:54-67; apps/web/lib/server/setup-guard.ts:19-22 · code review, confidence high (traced; the Settings UI only sends `dryRun: true`, so this is reached through the API)
**Status:** Open

### P2-124 · Server · Server / API
**`PUBLIC_APP_URL` without a scheme makes every browser write fail with a bare 500**

**What / Repro:** set `PUBLIC_APP_URL=planner.example.com`. Any request carrying an `Origin` header (every POST/PUT/PATCH/DELETE from a browser, every extension call) reaches `new URL(configured).origin`, which throws.
**Expected · Actual:** expected the value to be normalised or ignored. Actual: `withCors` throws inside `api()`'s `try`, and then throws again inside the `catch` (`withCors(req, toErrorResponse(err))`), so the route rejects with an unhandled error: a framework 500 with no error envelope. `isSecure()` (cookie flags in `pinLogin`) throws the same way, so sign-in fails too.
**Cause:** unvalidated env value passed to `new URL` on the hot path, including in the error path.
**Evidence:** code: apps/web/lib/server/http.ts:86-87, 100-102, 113-121, 141-149 · code review, confidence high (traced)
**Status:** Open

### P2-125 · Server · Server / API
**Request bodies are read without a size limit, before any rate limit, on unauthenticated routes**

**What / Repro:** `POST /api/v1/auth/pin` with a multi-hundred-MB body. `readJson` buffers the whole body with `req.text()` and `JSON.parse`s it; the zod `max(64)` and the per-IP limiter in `checkPin` only run afterwards.
**Expected · Actual:** expected an early 413. Actual: an anonymous caller can make the single Node process allocate arbitrarily large strings.
**Cause:** no `Content-Length` check or streaming cap in `readJson`.
**Evidence:** code: apps/web/lib/server/http.ts:157-161; apps/web/app/api/v1/auth/pin/route.ts:13; app/api/v1/auth/refresh/route.ts:10; app/api/setup/pin/route.ts:29 (limiter runs first there), app/api/setup/connect/route.ts:21 · code review, confidence medium (traced; not exercised)
**Status:** Open

### P2-126 · Server · Server / API
**Editing a routine's type/total lets the same day be awarded again and again**

**What / Repro:** complete today's instance of a todo routine (+5 `routine_instance`). `PATCH /routines/:id {type:"progress", total_amount:5}`, then `PATCH {type:"todo"}`, then complete today again. Query result: two `routine_instance` +5 events for the same routine and date, no reversal between them.
**Expected · Actual:** DECISIONS.md line 24 says structural rewrites never touch the ledger and that awards are never given twice. Actual: the rewrite resets logs to `completed = false` with scoring skipped, so the next completion is a fresh false→true transition and awards again. Repeatable without limit. (The +20 day bonus is reconciled by state and is not duplicated.)
**Cause:** instance awards are edge-triggered on the log row, while the reset is silent.
**Evidence:** code: packages/db/migrations/0004_routines.sql:122-132; 0006_universe.sql:151-165 · code review, confidence high (confirmed by query)
**Status:** Open

### P2-127 · Server · Server / API
**Site changes inside a block list are invisible to REST delta sync**

**What / Repro:** `GET /api/v1/block-lists` (store `server_time`). `POST /api/v1/block-lists/:id/sites {patterns:["example.com"]}`. `GET /api/v1/block-lists?updated_since=<server_time>` → `data: []`.
**Expected · Actual:** expected the list (with its new `sites`) to come back. Actual: sites are only embedded for lists whose own row changed, inserting or deleting a site does not touch the parent row, and site tombstones are filed under `sp_block_list_sites`, which no endpoint reports. A delta-syncing client never learns of added or removed sites.
**Cause:** no touch-parent trigger and no sites delta in the facade.
**Evidence:** code: apps/web/app/api/v1/block-lists/route.ts:9-42; packages/db/migrations/0005_focus.sql:158-182 · code review, confidence high (confirmed by query that adding a site leaves the list's `updated_at` unchanged)
**Status:** Open

### P2-128 · Server · Server / API
**List endpoints silently truncate at 5,000 rows, and delta sync then skips the rest for good**

**What / Repro:** accumulate more than 5,000 live tasks (completed tasks are never removed), or point at a Supabase whose PostgREST `max-rows` is lower (hosted default 1,000). `GET /api/v1/tasks` returns the first N by `sort_order` with no indication more exist. In delta mode the query is still ordered by `sort_order`, not `updated_at`, so the cut is arbitrary, and the response still advances `server_time`, so the dropped changes are never delivered. Tombstones have the same 5,000 cap.
**Expected · Actual:** expected pagination or an explicit "more" signal.
**Cause:** fixed `.limit(5000)`, no cursor, no ordering by `updated_at` for deltas.
**Evidence:** code: apps/web/lib/server/resource.ts:123-127, 136-144 · code review, confidence medium (traced; row counts not reached in test)
**Status:** Open

### P2-129 · Server · Server / API
**A token PostgREST rejects comes back as 403 or 502 instead of 401**

**What / Repro:** call any data route with a token that passes the local `sub`/`exp` check but is refused upstream (app clock a few seconds behind the database at expiry, rotated JWT secret, forged token).
**Expected · Actual:** expected 401 `unauthorized` so clients refresh or prompt for the PIN. Actual: `fail()` maps `PGRST301` to 403 "Not allowed."; newer PostgREST codes (PGRST302/303) and the routes that build their own error fall through to 502 `upstream_error`.
**Cause:** JWT errors are folded into the permission/upstream branches.
**Evidence:** code: apps/web/lib/server/resource.ts:68-76; app/api/v1/settings/route.ts:14-16, 26; app/api/v1/devices/route.ts:17; app/api/v1/export/route.ts:12; app/api/v1/push/subscriptions/route.ts:29, 41, 52 · code review, confidence medium (traced; PostgREST codes from knowledge, not exercised)
**Status:** Open

### P2-130 · Server · Server / API
**Migration runner assumes a session-mode connection (advisory lock, startup parameter)**

**What / Repro:** give the wizard the transaction-mode pooler string from the official bundle (port 6543). `select pg_advisory_lock($1)` is taken on whichever backend served that statement; later statements and `pg_advisory_unlock` can land on a different backend. The lock is then never released (it belongs to a pooled server connection that stays open), and the next boot waits on it until the 120s `statement_timeout`, failing migrations on every start. Separately, `statement_timeout` is sent as a startup parameter, which PgBouncer-style poolers reject unless whitelisted.
**Expected · Actual:** expected migrations to work with whichever connection string the owner pastes, or a clear message.
**Cause:** session-level advisory lock and startup options over a transaction pooler.
**Evidence:** code: packages/db/src/runner.ts:38, 88, 137 · code review, confidence medium (reasoned about Supavisor/PgBouncer transaction mode; only a direct connection was available to test)
**Status:** Open

### P2-131 · Server · Server / API
**Mixing migration routes can leave objects owned by a role later migrations cannot alter**

**What / Repro:** first-run migrates through pg-meta (`/pg/query`, which connects as `supabase_admin` in the official compose file). Later the owner adds `DATABASE_URL` (user `postgres`) to enable device revoke. The next release's migration runs at boot as `postgres` and hits `must be owner of table/function …` on any `create or replace function`, `alter table`, `drop policy`, `drop trigger` against objects created by `supabase_admin`.
**Expected · Actual:** expected updates to apply regardless of which route created the schema.
**Cause:** object ownership follows whichever role ran the first migration.
**Evidence:** code: apps/web/lib/server/setup.ts:139-161; packages/db/src/runner.ts:92-103 · code review, confidence low (inferred from the official bundle's roles; not reproduced)
**Status:** Open

### P2-132 · Server · Server / API
**An unwritable `/data` silently falls back to a directory inside the container**

**What / Repro:** mount `/data` as a host bind mount owned by root (common in Dokploy). The process runs as `node`, `accessSync("/data", W_OK)` fails, and `dataDir()` falls through to `process.cwd()/.data`, i.e. `/app/apps/web/.data`, which is writable because the standalone tree is copied with `--chown=node:node`.
**Expected · Actual:** expected a hard error naming the volume. Actual: setup appears to work, then the config, secret and lockout state vanish on the next redeploy and the instance returns to the open first-run wizard (with env-supplied Supabase keys, whoever opens it first can set a PIN and take over the existing owner account through `ensureOwner`).
**Cause:** the development fallback is active in production.
**Evidence:** code: apps/web/lib/server/paths.ts:13-27; Dockerfile:41-48 · code review, confidence medium (traced; container not built)
**Status:** Open

### P2-133 · Extension · Extension (Chrome + Firefox)
**`apply()` is not serialized; rule bookkeeping (`sp.rules`) can diverge from installed rules**

**What / Repro:** Any worker start triggered by a message or alarm: `wake()` runs `apply()` on the cached snapshot while the triggering event runs `resync() → apply(fresh)`. `onInstalled`/`onStartup` also call `wake` in addition to the direct `wake()` at line 241, so two `apply()` calls run at once on install and browser start.
**Expected · Actual:** Expected one consistent rule set. Actual: both read `getRulesKey()` before either writes; both may call `getDynamicRules` + `updateDynamicRules` with ids starting at 1 (the second can reject with a duplicate-id error, unhandled), and the two `setRulesKey` writes can land in the opposite order to the rule updates. Result: rules installed with key `""` (stay installed after focus ends until the next focus) or key set with no rules (no blocking until the key changes).
**Cause:** No mutex around read-key → install → write-key; the key is a cached fingerprint rather than derived from `getDynamicRules()`.
**Evidence:** code: apps/extension/lib/background.ts:82-101,67-75,221-230,241 · code review, confidence medium (interleaving traced in code; timing-dependent)
**Status:** Open

### P2-134 · Extension · Extension (Chrome + Firefox)
**`resync()` de-duplication returns a stale in-flight run to callers that need a fresh one**

**What / Repro:** (a) Click Pause in the popup while a resync that started before the action is still in flight (30 s alarm or Realtime-triggered). `act()` awaits the old promise and responds; the popup shows the pre-action state and version. (b) Popup sends `connected` right after storing the session while a resync that already read "no session" is in flight; that run writes `needs_pin` and the `connected` message is absorbed.
**Expected · Actual:** Expected the state after the action. Actual: stale state until the next Realtime event or the 30 s alarm; the next click then gets a silent `version_conflict` (E6).
**Cause:** `if (resyncing) return resyncing;` with no "run again afterwards" flag.
**Evidence:** code: apps/extension/lib/background.ts:146-147,211-213,233-234 · code review, confidence high (code alone)
**Status:** Open

### P2-135 · Extension · Extension (Chrome + Firefox)
**A version conflict silently drops the user's click**

**What / Repro:** Change the timer from another device, then click a popup control before the cached snapshot updates (up to 30 s if Realtime is down, see E5/E11).
**Expected · Actual:** Expected the action to apply or a message. Actual: `timerAction` is sent with the cached `version`, the server answers `version_conflict`, and the popup sets the error to `null`. The button appears to do nothing.
**Cause:** The cached version is used without a refetch and conflicts are mapped to no message.
**Evidence:** code: apps/extension/entrypoints/popup/main.tsx:285-292; apps/extension/lib/background.ts:207-213 · code review, confidence high (code alone)
**Status:** Open

### P2-136 · Extension · Extension (Chrome + Firefox)
**Block rule is bypassed by a trailing-dot hostname (and possibly `user@host`)**

**What / Repro:** During focus with `youtube.com` blocked, open `https://youtube.com./`.
**Expected · Actual:** Expected redirect ("hard block, no bypass"). Actual: the regex requires `(:[0-9]+)?([/?#].*)?$` straight after the domain, so `youtube.com./` does not match. `hostMatchesPattern` strips the trailing dot, so only the open-tab sweep catches it, and that runs only when rules change.
**Cause:** Regex does not allow an optional `\.` after the domain or `[^/@]*@` before the host.
**Evidence:** code: apps/extension/lib/rules.ts:23-25 (compare packages/shared/src/normalize.ts:38-41) · code review, confidence high for trailing dot (code alone); low for userinfo (needs verification of what URL Chrome matches)
**Status:** Open

### P2-137 · Extension · Extension (Chrome + Firefox)
**"Focus complete → Continue" can bounce back to the block page**

**What / Repro:** Stay on the block page until the countdown reaches 0, click "Continue" at once.
**Expected · Actual:** Expected the site. Actual: the page flips to "Focus complete" from its own clock, but rules are removed only when the worker's `sp-unblock` alarm fires, a Realtime event arrives (server scheduler ticks every 2 s) or the 30 s resync runs. Clicking in that gap is redirected back. Each 30 s resync recreates the alarm, so the last creation is usually under 30 s before the end; Chrome delays such alarms to at least 30 s after creation for packed extensions, which matters most offline.
**Cause:** The page never tells the background that the phase ended; it only sends `resync` on load and on window focus.
**Evidence:** code: apps/extension/entrypoints/blocked/main.tsx:23-28,32-35,60-64; apps/extension/lib/background.ts:93-96 · code review, confidence medium (code; the 30 s clamp on `alarms.create({when})` needs verification against current Chrome docs)
**Status:** Open

### P2-138 · Extension · Extension (Chrome + Firefox)
**Back button on an already-open tab can restore the blocked site**

**What / Repro:** Have a blocked site open, start focus (tab is sent to the block page with `tabs.update`), press Back.
**Expected · Actual:** Expected the block page. Actual (if the page is bfcache-eligible): the site is restored from bfcache and stays usable for the phase; the sweep only reruns when the rule key changes.
**Cause:** `tabs.update({url})` pushes a history entry and leaves the original one behind; there is no `tabs.onUpdated`/`webNavigation` check.
**Evidence:** code: apps/extension/lib/background.ts:53-65 · code review, confidence low (needs verification: bfcache restores make no network request, so DNR does not run)
**Status:** Open

### P2-139 · Extension · Extension (Chrome + Firefox)
**Firefox: the Realtime socket does not keep the event page alive**

**What / Repro:** Firefox, connected, idle.
**Expected · Actual:** Expected sub-second sync and steady presence. Likely actual: the event page is stopped after about 30 s idle regardless of WebSocket traffic, then woken by the 30 s alarm, so the channel joins and leaves repeatedly. Changes land within up to 30 s, and the app's "N devices in sync" count flaps.
**Cause:** The keep-alive relies on a Chrome-specific rule (WebSocket activity resets the service-worker idle timer).
**Evidence:** code: apps/extension/lib/client.ts:26; apps/extension/lib/background.ts:103-134,221-224; docs/DECISIONS.md Phase 10 "Realtime keep-alive" · code review, confidence low-medium (needs verification of Firefox event-page idle rules)
**Status:** Open

### P2-140 · Extension · Extension (Chrome + Firefox)
**An old Supabase client keeps auto-refreshing after disconnect and can destroy the next session**

**What / Repro:** Disconnect, connect to a different instance (different Supabase URL) without the worker restarting, wait until the new access token nears expiry.
**Expected · Actual:** Expected one client. Actual: `forgetClient()` only drops the reference. The old client's 30 s auto-refresh timer keeps reading the shared storage key `sp.auth`, finds the new session, sends its refresh token to the old Supabase URL, gets a non-retryable error and removes the session from storage. The user lands on `needs_pin`, and a refresh token has been sent to the wrong server. Reconnecting to the same instance leaves two clients refreshing the same token.
**Cause:** The client is never stopped (`auth.stopAutoRefresh()`), and the storage key is not scoped to the instance.
**Evidence:** code: apps/extension/lib/client.ts:8-39; apps/extension/lib/background.ts:183-202; apps/extension/lib/storage.ts:9 · code review, confidence medium (code + auth-js behaviour; needs the worker to stay alive across the reconnect)
**Status:** Open

### P2-141 · Extension · Extension (Chrome + Firefox)
**Explicit `http://` address that redirects to https passes discovery but fails at the PIN step**

**What / Repro:** Type `http://planner.example.com` for an instance whose proxy redirects to https.
**Expected · Actual:** Expected connection, or a hint. Actual: the GET follows the redirect and "Found Stellar Planner" shows, but `appUrl` stays `http://…`. The POST to `/api/v1/auth/pin` is redirected and becomes a GET, giving 405 with no JSON body and the message "That didn't work. Try again." however often the PIN is retried.
**Cause:** `findInstance` returns the typed origin instead of the origin of `res.url`.
**Evidence:** code: apps/extension/lib/api.ts:28-49,65-71 · code review, confidence medium (code; depends on the proxy answering 301/302 rather than 308)
**Status:** Open

### P2-142 · Extension · Extension (Chrome + Firefox)
**Single-label and IPv6 hosts are rejected; other private addresses default to https**

**What / Repro:** Enter `nas:3000`, `http://raspberrypi:3000`, `[::1]:3000` or `172.20.0.5:3000`.
**Expected · Actual:** Expected these self-hosted addresses to work. Actual: hostnames without a dot (other than `localhost`) fail with "That doesn't look like a web address."; IPv6 literals fail the same check; `172.16–31.x` and `.local` names get `https://` and end in "Can't reach …" with no suggestion to try `http://`.
**Cause:** The `hostname.includes(".")` gate and the short local-prefix list in `withScheme`.
**Evidence:** code: packages/shared/src/normalize.ts:87-92,137-139 (used by apps/extension/lib/api.ts:26 and popup/main.tsx:53) · code review, confidence high (code alone)
**Status:** Open

### P2-143 · Extension · Extension (Chrome + Firefox)
**Redirect to the extension page through `regexSubstitution` on Firefox is unverified**

**What / Repro:** Firefox 128+, start focus, open a blocked site.
**Expected · Actual:** Expected a redirect to `moz-extension://<uuid>/blocked.html?site=…#<url>`. To verify: that Firefox accepts `\0` in `regexSubstitution`, allows a substitution result on the `moz-extension:` scheme (given the `web_accessible_resources` entry), and compiles the regex with its own engine.
**Cause:** Chrome-oriented rule shape; POLISH_SPEC §2.2 asks for Firefox parity.
**Evidence:** Verified in a real Firefox 159 with apps/extension/scripts/firefox-smoke.mjs: the regexSubstitution redirect to moz-extension://…/blocked.html works, the countdown runs and the Continue handoff appears (7/7 checks) · code: apps/extension/lib/rules.ts:41-48,52-60 · code review, confidence low (needs verification; nothing in the repo tests it — the unit tests cover the rule builder only)
**Status:** Won't fix. Not a bug: the redirect works in a real Firefox (see evidence)

### P2-144 · Universe · Web + PWA
**No handling of WebGL context loss; the sky can stay empty after resume**

**What / Repro:** iOS Safari or the PWA: background the app for a while, then return.
**Expected · Actual:** Expected the scene to return or the CSS starfield to take over. Actual: nothing listens for `webglcontextlost`/`webglcontextrestored`. `ready` stays true, so `data-sky="3d"` keeps the CSS stars at opacity 0, and the loop keeps calling `advance()` on a dead context. If the browser does not restore the context, the background is blank until reload.
**Cause:** Recovery is left entirely to three.js; no fallback state.
**Evidence:** code: packages/universe/src/canvas.tsx:58-99,110-141; apps/web/components/universe/universe-host.tsx:108-111,160 · code review, confidence medium-low (no handler in the repo — grep for `contextlost` is empty; whether three's built-in restore covers iOS needs device verification)
**Status:** Open

### P2-145 · Universe · Web + PWA
**Glow-sprite textures are never disposed on rebuild**

**What / Repro:** Add, complete or move goals (any change to the structure key), or change era, repeatedly over a long session.
**Expected · Actual:** Expected GPU textures to be released. Actual: `clearGroup` disposes geometry and material but not `material.map`. Every planet halo, moon and neighbour-galaxy sprite owns its own 128×128 `CanvasTexture`; each `buildPlanets`/`buildLayers` leaks one per sprite, and `dispose()` leaks them again on a tier change.
**Cause:** No `material.map?.dispose()` in `clearGroup`; textures are not shared per colour.
**Evidence:** code: packages/universe/src/scene-core.ts:442-453 (clearGroup), 122-149 (radialTexture/glowSprite), 485-494, 546, 583, 889-891 · code review, confidence high (code alone)
**Status:** Open

### P2-146 · Universe · Web + PWA
**Every snapshot rebuilds all constellations and refills every star buffer**

**What / Repro:** Complete one task, or receive any Realtime update that produces a new snapshot object.
**Expected · Actual:** Expected "cheap when nothing structural changed". Actual: `buildConstellations` always clears `sky` and creates, per routine, a new geometry with five attributes, a ShaderMaterial, a line geometry and a LineBasicMaterial. `fillStars` rehashes every seed with `placeStar` (up to 20,000 on Cinematic), rebuilds a Set of all seeds and marks all five attributes for re-upload. This runs on the main thread at the moment the user completed a task, alongside the event effect (POLISH_SPEC §4.6).
**Cause:** No per-constellation diff; no cache of star placements.
**Evidence:** code: packages/universe/src/scene-core.ts:387,398,403-427,632-686 · code review, confidence high (code alone)
**Status:** Open

### P2-147 · Universe · Web + PWA
**The frame governor overrides an explicit quality setting, never steps back up and is not remembered**

**What / Repro:** Set Quality to Cinematic and run in a mode where requestAnimationFrame is capped at 30 fps, or hit three seconds of slow frames for any reason (the governor measures the rAF cadence of the whole main thread).
**Expected · Actual:** SPEC §7.1 puts the automatic drop under Auto and DECISIONS says an explicit setting is honoured. Actual: `tier` is stepped down whatever `setting` is (33 ms is above the 22.2 ms Cinematic budget), and can go on to Minimal, which unmounts WebGL. Nothing raises the tier again in the session. Nothing is stored, so each cold start on a weak device mounts Cinematic, janks for 3 s or more, tears down the context and mounts Balanced.
**Cause:** The governor ignores `setting`; the result lives only in memory.
**Evidence:** code: packages/universe/src/canvas.tsx:74-76; packages/universe/src/quality.ts:67-69,117-156; apps/web/components/universe/universe-host.tsx:79-106 · code review, confidence high (code alone; the 30 fps cap in iOS Low Power Mode and Chrome Energy Saver needs verification)
**Status:** Open

### P2-148 · Universe · Web + PWA
**The render loop does not yield to scrolling, dragging or sheet animations**

**What / Repro:** Scroll a long task list or open a sheet on Cinematic.
**Expected · Actual:** POLISH_SPEC §4.6 expects the universe to pause or drop its rate during interaction. Actual: the only pauses are a hidden tab and a focused text field on a coarse pointer. Cinematic has `idleFps: 60`, so the full scene with bloom at DPR 2 renders every frame on every page; on non-home pages the wrapper also has `filter: blur(1.5px)` and opacity 0.55, so the browser re-blurs a full-screen canvas each frame.
**Cause:** No interaction signal reaches the loop; Cinematic has no idle throttle; the dimming is done with a CSS filter over a live canvas.
**Evidence:** code: packages/universe/src/canvas.tsx:65-93; packages/universe/src/quality.ts:21-41; apps/web/components/universe/universe-host.tsx:129-149,159-162 · code review, confidence high (code alone)
**Status:** Open

### P2-149 · Universe · Web + PWA
**The canvas React tree re-renders on navigation and on hover**

**What / Repro:** Navigate between `/` and another page, or move the mouse over planets on the home.
**Expected · Actual:** SPEC §12 requires zero React re-renders of the canvas on navigation; DECISIONS says the host re-renders only when the tier changes. Actual: the host subscribes to `mode`, `ready`, `hover` and `setting`; each change re-renders it and its unmemoised `<Canvas />` child. `UniverseCanvas` passes fresh `gl`, `camera`, `dpr` and `style` objects, and R3F's Canvas calls `root.configure` and `root.render` on every render. Hover does this each time the label moves by more than 2 px.
**Cause:** Store subscriptions for unrelated UI live in the same component as the canvas; no `React.memo`; inline prop objects.
**Evidence:** code: apps/web/components/universe/universe-host.tsx:69-73,164; packages/universe/src/canvas.tsx:105-141; packages/universe/src/store.ts:97-107 · code review, confidence high (code + R3F 9.8.2 source)
**Status:** Open

### P2-150 · Universe · Web + PWA
**Chunk import failures are unhandled and never retried**

**What / Repro:** Open the PWA offline, or right after a deploy, when the universe or overlay chunk cannot be fetched.
**Expected · Actual:** Expected a quiet fallback and a later retry. Actual: `void import(...).then(...)` has no catch, so there is an unhandled rejection (a finding under POLISH_SPEC §2.1). `Canvas`/`Overlay` stay null and the effect dependencies do not change, so there is no universe and no events for the session.
**Cause:** Missing `.catch` and retry.
**Evidence:** code: apps/web/components/universe/universe-host.tsx:114-126 · code review, confidence high (code alone)
**Status:** Open

### P2-151 · Universe · Web + PWA
**Tier is resolved twice at start-up when the saved setting is not Auto**

**What / Repro:** Save Quality = Balanced or Minimal, then cold start on a capable device.
**Expected · Actual:** Expected one canvas at the saved tier. Actual: the store starts at `setting: "auto"`, so `readSignals` picks Cinematic and the three.js chunk may load and mount (even for a user who chose Minimal). When settings arrive the tier changes and `key={tier}` builds a second context and scene. Each `readSignals` also creates and discards a probe WebGL context.
**Cause:** The tier is resolved before the saved setting is known; GPU detection is not cached.
**Evidence:** code: apps/web/components/universe/universe-host.tsx:79-89,123-126; apps/web/components/universe/universe-bridge.tsx:42-44; packages/universe/src/store.ts:41 · code review, confidence medium (code alone; depends on when settings arrive)
**Status:** Open

### P2-152 · Universe · Web + PWA
**Every iPhone classifies as the top GPU tier**

**What / Repro:** Auto on an older iPhone.
**Expected · Actual:** Expected Balanced on old devices. Actual: `apple gpu` maps to tier 3, `deviceMemory` is undefined (defaults to 8) and cores ≥ 4, so Auto picks Cinematic (bloom, DPR 2, 20k stars) and relies on the governor on every launch (see U6).
**Cause:** The renderer string cannot tell iPhones apart and no other signal is used.
**Evidence:** code: packages/universe/src/quality.ts:98,82-85 · code review, confidence medium (code; Safari's masked renderer string "Apple GPU" and missing `deviceMemory` need device verification)
**Status:** Open

### P2-153 · Universe · Web + PWA
**The overlay canvas keeps a full-viewport DPR-2 backing store and layer while idle, and reallocates on every resize**

**What / Repro:** Idle app; resize the window or scroll in iOS Safari (the URL bar fires `resize`).
**Expected · Actual:** DECISIONS says events "cost nothing while idle". Actual: a canvas of `innerWidth × innerHeight × min(2, dpr)` stays allocated (about 5 MB on a phone, 59 MB at 2560×1440 @2x) as a fixed layer at z-index 75 above the UI. Every `resize` event reassigns `canvas.width/height`, which reallocates and clears it, with no debounce and even when idle. A DPR change without a resize is not picked up.
**Cause:** The backing store is sized at mount and on every resize rather than when an effect starts.
**Evidence:** code: packages/universe/src/overlay.ts:527-533; packages/universe/src/event-overlay.tsx:110,114,127; apps/web/app/globals.css:433-444 · code review, confidence medium (code alone; cost depends on the device)
**Status:** Open

### P2-154 · Universe · Web + PWA
**Heavy per-frame canvas work in the large effects**

**What / Repro:** Trigger focus start, focus complete or a new Era on a phone and record frame times.
**Expected · Actual:** POLISH_SPEC §4.6 says events never drop a frame of interaction. Actual: each frame creates one gradient object per particle (96 linear for warp, about 75 radial for supernova, about 95 for new era, plus a full-screen fill) with `lighter` compositing on a DPR-2 full-screen canvas, and a new seeded RNG per effect and per origin.
**Cause:** Immediate-mode gradients instead of a pre-rendered glow sprite with `drawImage` and `globalAlpha`.
**Evidence:** code: packages/universe/src/overlay.ts:35-45,65-86,338-364 (warp), 367-406 (supernova), 409-439 (new era), 101-142 · code review, confidence low (code alone; needs measurement on a phone)
**Status:** Open

### P2-155 · Universe · Web + PWA
**Wheel zoom ignores delta size and cannot stop the page scrolling**

**What / Repro:** Two-finger scroll on a trackpad over the home sky.
**Expected · Actual:** Expected a gentle proportional zoom. Actual: every wheel event applies a fixed ±8% whatever `deltaY` is, and a trackpad sends dozens per gesture including inertia, so zoom hits the limit at once and each event resets the return timer. React's `onWheel` is passive, so the page also scrolls when it is scrollable, and ctrl+wheel pinch also zooms the browser.
**Cause:** A step zoom on a passive synthetic listener.
**Evidence:** code: apps/web/components/home/home.tsx:302 · code review, confidence high (code alone)
**Status:** Open

### P2-239 · Accessibility · Web + PWA
**Emoji picker grid has invalid ARIA values (axe critical)**

**What / Repro:** Open any emoji picker and run axe.
**Expected · Actual:** Expected no critical violations. Actual: aria-valid-attr-value on the grid rows and cells (aria-rowindex="0" and friends; ARIA indices start at 1), 12 nodes.
**Cause:** Row/column indices are zero-based.
**Evidence:** docs/polish/data/scan-summary.md, every project · code: apps/web/components/ui/emoji-grid.tsx
**Status:** Open

### P2-240 · Accessibility · Web + PWA
**An element carries aria-label without a role on almost every screen (axe serious)**

**What / Repro:** Run axe on Home, Tasks, Goals, Routines, Focus or Settings.
**Expected · Actual:** Expected none. Actual: aria-prohibited-attr on a `.pointer-events-none` div (11–12 screens) and on a `.inset-x-0` div in Settings. Lighthouse reports the same on every route.
**Cause:** A decorative/status wrapper has aria-label but no role.
**Evidence:** docs/polish/data/scan-summary.md; docs/polish/data/lighthouse-before.json
**Status:** Open

### P2-241 · Accessibility · Web + PWA
**Buttons whose accessible name does not contain their visible text (axe serious)**

**What / Repro:** Run axe on Tasks, Goals, list detail, block lists.
**Expected · Actual:** Expected the visible text to be part of the name (voice control users say what they see). Actual: label-content-name-mismatch on task rows ("Edit “name”" vs name + description + date), list cards ("Open Groceries" vs "Groceries 6 tasks"), block-list rows.
**Cause:** aria-label replaces the content instead of extending it.
**Evidence:** docs/polish/data/scan-summary.md (7–8 screens per project)
**Status:** Open

### P2-242 · Accessibility · Web + PWA
**Out-of-month days in the task calendar fail contrast (axe serious)**

**What / Repro:** Tasks → Calendar.
**Expected · Actual:** Expected ≥4.5:1 (SPEC §13). Actual: `text-fg-2/45` day numbers fail color-contrast.
**Cause:** 45% opacity secondary text on glass.
**Evidence:** docs/polish/data/scan-summary.md · code: apps/web/components/tasks/calendar-tab.tsx
**Status:** Open

### P2-243 · Routines · iPhone PWA
**The routine sheet is wider than the screen on iPhones**

**What / Repro:** Routines → Manage routines → Add routine on an iPhone-sized WebKit viewport.
**Expected · Actual:** Expected no horizontal overflow. Actual: the document is 9px (393 wide) to 27px (375 wide) wider than the viewport while the sheet is open.
**Cause:** Not yet traced (segmented controls / weekday chips sizing to content).
**Evidence:** docs/polish/data/scan-summary.md: webkit-iphone-15-pro and webkit-iphone-se
**Status:** Open

### P2-244 · Shell (landscape) · iPhone PWA (landscape)
**The screen scan cannot complete in landscape**

**What / Repro:** Run the scan spec at 852×393.
**Expected · Actual:** Expected all 20 screens and sheets to open. Actual: the run times out after five minutes part-way through Tasks.
**Cause:** Sheets and pickers in the rail layout at 393px height (see the landscape entries).
**Evidence:** scan spec on webkit-iphone-15-pro-landscape timed out
**Status:** Open

### P2-245 · Settings · Web + PWA
**Settings shifts layout heavily while loading (CLS 0.84)**

**What / Repro:** Open /settings cold.
**Expected · Actual:** Expected CLS under 0.02. Actual: 0.839; sections pop in as devices, connection status and extension availability resolve. Home 0.045 and Tasks 0.035 are also over the 0.02 line.
**Cause:** Sections render nothing until their data arrives instead of reserving their space.
**Evidence:** docs/polish/data/lighthouse-before.json
**Status:** Open

### P2-248 · Shell · Web + PWA
**Layout shifts while pages load: Setup 0.70, Settings 0.42, Tasks 0.24**

**What / Repro:** Run the e2e suite with the layout-shift listener (Chromium).
**Expected · Actual:** Expected CLS ≤ 0.02 on every route. Actual maxima: /setup 0.70, /settings 0.42, /tasks 0.24, / 0.03, /goals 0.02.
**Cause:** Content mounts after hydration without reserved space (wizard steps, settings sections, task groups and the lists column).
**Evidence:** docs/polish/data/sweep-baseline.txt (20 cls entries on desktop, iphone-15-pro, iphone-se)
**Status:** Open

## P3 (83)

### P3-156 · Universe · Firefox
**Every page load in Firefox logs 'WebGL context was lost' and a WEBGL_debug_renderer_info deprecation warning**

**What / Repro:** Open any page in Firefox with the console open.
**Expected · Actual:** Expected a clean console. Actual: two warnings per load (79 each across the Firefox baseline run).
**Cause:** GPU tier detection creates a throwaway WebGL context, reads the deprecated extension, then drops the context.
**Evidence:** sweep log, firefox-desktop · code: packages/universe/src/quality.ts
**Status:** Open

### P3-157 · Universe · Web + PWA
**three.js logs 'THREE.Clock is deprecated, use THREE.Timer' whenever the 3D sky loads**

**What / Repro:** Open Home with a 3D tier.
**Expected · Actual:** Expected a clean console. Actual: one deprecation warning per load.
**Cause:** scene uses THREE.Clock.
**Evidence:** sweep log: 23 entries on WebKit and Firefox
**Status:** Open

### P3-158 · Service worker · Web + PWA
**Service worker registration fails noisily while the instance is unconfigured**

**What / Repro:** Open /setup on a fresh instance.
**Expected · Actual:** Expected no registration attempt (or a quiet skip). Actual: '[sw] registration failed … sw.js load failed' because /sw.js is redirected to /setup.
**Cause:** The proxy redirects every path, including /sw.js, and the page registers the worker regardless.
**Evidence:** sweep log on webkit-iphone-se and landscape
**Status:** Open

### P3-159 · Shell · Safari / iPhone
**Uncaught 'Fetch API cannot load …?_rsc=… due to access control checks' when leaving a page in WebKit**

**What / Repro:** In WebKit, trigger a full navigation (sign in, finish setup) while route prefetches are in flight.
**Expected · Actual:** Expected no uncaught errors. Actual: one uncaught error per aborted prefetch.
**Cause:** Prefetches are aborted by the hard navigation and their rejections are unhandled.
**Evidence:** sweep log: 6 pageerror entries on WebKit projects
**Status:** Open

### P3-160 · Shell · Firefox
**Inter is preloaded but never used on Apple and Firefox-on-Mac**

**What / Repro:** Open any page in Firefox on a Mac.
**Expected · Actual:** Expected no wasted download. Actual: 'preloaded with link preload was not used within a few seconds' for the Inter woff2 (system font wins in the stack).
**Cause:** next/font preloads the fallback font on every platform.
**Evidence:** sweep log, firefox-desktop, 10 entries · code: apps/web/app/layout.tsx:11-16
**Status:** Open

### P3-161 · Tasks / goals / routines data layer · Web + PWA
**Amount setters accept NaN/Infinity, which the server turns into 0**

**What / Repro:** Unit test `setGoalAmount(id, NaN)` / `incrementGoal(id, NaN)`.
**Expected · Actual:** Expected a no-op. Actual: cache holds `NaN`; JSON sends `null`; `greatest(current_amount + null, 0)` / `coalesce(null, 0)` stores 0, wiping the goal's progress.
**Cause:** `Math.max(0, NaN)` is NaN and `delta === 0` does not catch it.
**Evidence:** code: apps/web/lib/client/data/goals.ts:142-163, 166-180; apps/web/lib/client/data/routines.ts:150-152 · code review, confidence high (latent; current steppers validate with `Number.isFinite`)
**Status:** Open

### P3-162 · Tasks / goals / routines data layer · Web + PWA
**Local completion uses float sums, server uses numeric**

**What / Repro:** Progress goal total 0.8, step 0.1, tap + eight times.
**Expected · Actual:** Expected completion and its celebration on the eighth tap. Actual: local sum is 0.7999999999999999, so no completion event; the goal flips to complete only when the server row arrives.
**Cause:** binary float accumulation.
**Evidence:** code: apps/web/lib/client/data/goals.ts:142-163 · code review, confidence medium
**Status:** Open

### P3-163 · Focus timer · Web + PWA
**Fallback advance is scheduled once and never re-armed if it fires "early"**

**What / Repro:** Make skew shift by more than 2.5 s between scheduling and firing (see the skew entry), with Realtime blocked.
**Expected · Actual:** Expected the phase to advance. Actual: `isDue` is false at fire time, nothing reschedules, the timer sits at 00:00 until a refetch.
**Cause:** single `setTimeout`, effect only re-runs when `state` changes.
**Evidence:** code: apps/web/components/shell/focus-ticker.tsx:27-32 · code review, confidence low
**Status:** Open

### P3-164 · Session / lock · Web + PWA
**Inactivity lock ignores scroll/touch-move as activity and renders data before settings hydrate**

**What / Repro:** 5-minute lock; read/scroll a long list with the wheel for 5 minutes. Separately: relaunch after the limit passed.
**Expected · Actual:** Expected no lock while actively scrolling, and a locked first frame on relaunch. Actual: only `pointerdown`/`keydown` count; on relaunch `minutes` is undefined until the persisted cache restores, so content is visible for a moment.
**Cause:** narrow activity events; lock decision waits on async settings.
**Evidence:** code: apps/web/components/shell/inactivity-lock.tsx:31-61 · code review, confidence medium
**Status:** Open

### P3-165 · Service worker / PWA · Web + PWA
**Offline fallback for an uncached path is the Home document**

**What / Repro:** Clear `stellar-pages-v1` except `/`, go offline, open `/settings`.
**Expected · Actual:** Expected Settings. Actual: Home's HTML (its RSC tree) is returned under the `/settings` URL; whether the router recovers or shows Home at the wrong URL is not verified.
**Cause:** "any app route can boot from the home shell" assumes a route-agnostic shell.
**Evidence:** code: apps/web/sw/sw.ts:86-89 · code review, confidence low
**Status:** Open

### P3-166 · Service worker / PWA · Web + PWA
**Listeners and timers that are never removed**

**What / Repro:** Mount/unmount the root repeatedly (dev StrictMode, tests) and count listeners.
**Expected · Actual:** Expected balanced add/remove. Actual: one leaked listener/interval per mount cycle. Small in production (single mount).
**Cause:** cleanup omissions.
**Evidence:** code: apps/web/components/shell/service-worker.tsx:56 (`visibilitychange` added inside `register`, not removed in cleanup; `load` listener likewise); apps/web/lib/client/data/hooks.ts:70-83 (interval and `visibilitychange` never cleared when the last subscriber leaves) · code review, confidence high
**Status:** Open

### P3-167 · Shell · Web + PWA
**Enter during IME composition runs the selected command**

**What / Repro:** Cmd+K, type with a Japanese/Chinese IME, press Enter to confirm the composition.
**Expected · Actual:** Expected the composition to be confirmed. Actual: "Add task" runs with the half-composed text and the palette closes.
**Cause:** no `e.nativeEvent.isComposing` check.
**Evidence:** code: apps/web/components/shell/command-bar-impl.tsx:146-156 · code review, confidence medium
**Status:** Open

### P3-168 · Shell · Web + PWA
**Version conflicts and dropped timer actions give no feedback**

**What / Repro:** Two tabs, press Pause in both within the same second.
**Expected · Actual:** Expected consistent state (met) with some indication. Actual: the losing tab's UI silently snaps to the server state; `timerAction` returning `false` is ignored by callers.
**Cause:** `ok === false` only invalidates.
**Evidence:** code: apps/web/lib/client/data/core.ts:214-228; apps/web/lib/client/data/focus.ts:80-91 · code review, confidence high
**Status:** Open

### P3-169 · bugs · Web + PWA
**Universe hover label has no width limit**

**What / Repro:** a goal-list/routine with a long name produces a `white-space: nowrap` label wider than the screen, centred on the planet, clipped on both sides.
**Evidence:** code: app/globals.css:498-515; components/universe/universe-host.tsx:166-176 · code review, confidence high
**Status:** Open

### P3-170 · bugs · Web + PWA
**Unbroken long strings overflow (quotes, dialog titles, toasts, units, URLs)**

**Cause:** no `break-words`/`overflow-wrap:anywhere`/line-clamp on user-supplied text.
**Evidence:** code: components/goals/cards.tsx:28-30 (quote, card has no overflow clip → page overflow); components/settings/quotes.tsx:71; components/ui/sheet-impl.tsx:179 (titles such as `Delete “<200-char name>”?`, confirm.tsx:28); components/ui/toaster.tsx:34; components/ui/amount.tsx:29 (`whitespace-nowrap` with a 40-char unit); components/ui/grouped-list.tsx:48 (subtitle, e.g. Supabase URL in connection.tsx:127); components/settings/security.tsx:235-241 ("This device" badge inside a truncated line is clipped) · code review, confidence medium-high
**Status:** Open

### P3-171 · bugs · Web + PWA
**RTL text is not handled**

**What / Repro:** Arabic/Hebrew names are left-aligned with the ellipsis on the wrong end; mixed-direction names with punctuation reorder oddly.
**Evidence:** code: all user-text spans (e.g. components/tasks/task-row.tsx:100-110, components/tasks/lists.tsx:70); no `dir="auto"` anywhere in components/ · code review, confidence high
**Status:** Open

### P3-172 · bugs · Web + PWA
**Holding Enter on a submit reopens the sheet**

**What / Repro:** after submit Radix returns focus to the trigger ("Add goal"); key-repeat Enter then clicks the trigger, reopening the sheet with an empty name and a validation error.
**Evidence:** code: components/goals/goal-sheet.tsx:39-56 with components/goals/goal-list-detail.tsx:196-203 (same shape for routines/lists) · code review, confidence low-medium
**Status:** Open

### P3-173 · bugs · Web + PWA
**FocusStats "Today"/"All time" do not move during a running phase**

**What / Repro:** `liveMinutes` is memoised on `[state]` and reads `serverNow()` once, so it only changes when the state row changes (Home uses the minute tick instead, home.tsx:114-129). While stats load, Today shows "0m" rather than "…".
**Evidence:** code: components/focus/stats.tsx:79-86 · code review, confidence high
**Status:** Open

### P3-174 · bugs · Web + PWA
**Timer face flashes a wrong time for one frame on resume**

**What / Repro:** `useTick` stops updating `now` while paused; on resume the first render computes `remaining` from the new `phase_ends_at` and the stale `now` before the effect refreshes it.
**Evidence:** code: components/focus/timer.tsx:72-79; lib/client/data/hooks.ts:114-122 · code review, confidence medium
**Status:** Open

### P3-175 · bugs · Web + PWA
**Remote "focus complete" celebration depends on the device clock**

**What / Repro:** uses `Date.now()` instead of `serverNow()`; with ±2 min skew the 20 s window never (or always) matches. Also the fallback `advance` is fired once with no retry if the request fails (lines 24-33).
**Evidence:** code: components/shell/focus-ticker.tsx:41-47 · code review, confidence medium · also reported as C:31
**Status:** Open

### P3-176 · bugs · Web + PWA
**Routines month straddling the 400-day cache boundary shows empty rings**

**What / Repro:** older logs are fetched only when the whole month is older than 400 days (`to < today-400`); for the boundary month the days before the window render as 0%.
**Evidence:** code: components/routines/routines-page.tsx:21-26 · code review, confidence medium
**Status:** Open

### P3-177 · bugs · Web + PWA
**Calendar: stepping the month keeps a now-invisible selected day**

**What / Repro:** after "next month" the agenda and the quick-add default date still belong to the previously selected day in a month that is no longer shown. `useOlderCompleted` errors are never surfaced.
**Evidence:** code: components/tasks/calendar-tab.tsx:275-284; components/tasks/tasks-page.tsx:91 · code review, confidence high
**Status:** Open

### P3-178 · bugs · Web + PWA
**"Starts" date picker offers a "No date" quick pick that does nothing**

**What / Repro:** `allowClear` defaults to true and the caller ignores null, so the chip closes the popover without effect. Quick picks also bypass `min`/`max` (date-picker.tsx:78-82, no current caller passes them).
**Evidence:** code: components/routines/routine-sheet.tsx:203-210; components/ui/date-picker.tsx:85-90 · code review, confidence high
**Status:** Open

### P3-179 · bugs · Web + PWA
**Sheet content flashes while closing**

**Evidence:** code: components/tasks/tasks-page.tsx:180-193 (Reschedule sheet value becomes "no date" as soon as `rescheduleId` is cleared — the exiting tree is frozen, so this only shows if the picker re-renders from state); components/shell/command-bar-impl.tsx:44-49 (previous query is rendered for one frame on reopen because the reset happens in an effect) · code review, confidence medium
**Status:** Open

### P3-180 · bugs · Web + PWA
**Command bar / Escape handling details**

**What / Repro:** Escape inside the inline amount input (routine day sheet, focus settings sheet) also closes the whole sheet, because Radix listens for Escape on the document in capture.
**Evidence:** code: components/ui/stepper.tsx:126-129; components/ui/amount.tsx:40-43 · code review, confidence medium
**Status:** Open

### P3-181 · bugs · Web + PWA
**Devices / Connection / About have no error or offline state**

**Evidence:** code: components/settings/security.tsx:257-261 (a failed or offline fetch reads "No devices yet."); components/settings/connection.tsx:121 ("Checking" forever); components/settings/about.tsx:21 ("…" forever); components/settings/general.tsx:28 and appearance.tsx:38 (sections render nothing until settings load, so the section chips scroll to nothing) · code review, confidence high
**Status:** Open

### P3-182 · bugs · Web + PWA
**Accessibility odds and ends**

**Evidence:** code review, confidence high
**Status:** Open

### P3-183 · bugs · Web + PWA
**PinPad listeners stack when two pads are mounted**

**What / Repro:** if the inactivity lock fires while the Change PIN sheet is open, both window handlers receive every digit and Enter, so the unlock PIN is also fed into the Change PIN step.
**Evidence:** code: components/auth/pin-pad.tsx:60-78; components/settings/security.tsx:122-129; components/shell/inactivity-lock.tsx:69 · code review, confidence medium
**Status:** Open

### P3-184 · bugs · Web + PWA
**Small state/cleanup issues**

**Evidence:** code review, confidence medium
**Status:** Open

### P3-185 · Server · Server / API
**`end` writes the abandoned phase's session row with `session_id = null`**

**What / Repro:** `sp_timer_action('start', v)` then `sp_timer_action('end', v+1)`; the new `sp_focus_sessions` row has `session_id` null while the sitting had an id.
**Expected · Actual:** every phase of one sitting should share its `session_id`.
**Cause:** `s.session_id := null` is applied (and re-read via `returning t.* into s`) before the insert uses `s.session_id`.
**Evidence:** code: packages/db/migrations/0005_focus.sql:350-357, 409-423 · code review, confidence high (confirmed by query)
**Status:** Open

### P3-186 · Server · Server / API
**`NaN` / `Infinity` amounts are accepted by the RPCs and stick permanently**

**What / Repro:** `select sp_goal_increment(<id>, 'NaN'::numeric)` (PostgREST accepts `"NaN"` for a numeric argument). Result: `current_amount = NaN`, `completed = true`, +50/+100/+250 stardust; a later `-5` still returns NaN.
**Expected · Actual:** expected rejection. The REST facade blocks it (`z.number().finite()`), but the web app and extension call Supabase directly, and the database is the stated authority.
**Cause:** in Postgres numeric, NaN compares greater than everything, so `greatest(NaN, 0)`, `>= 0` and `>= total_amount` all pass.
**Evidence:** code: packages/db/migrations/0003_goals.sql:38, 100-103, 155-169; 0004_routines.sql:47, 161-163 · code review, confidence high (confirmed by query)
**Status:** Open

### P3-187 · Server · Server / API
**Rows can be created in, or edited inside, soft-deleted parents; soft-deleted rows accept PATCH**

**What / Repro:** soft-delete a task list, then `POST /tasks {name, list_id:<that list>}` → 201 with `deleted_at: null`. The task is in no view, cannot be restored with the list (timestamps differ), and is hard-deleted by the cascade when the list is purged. `PATCH /tasks/:id {completed:true}` on a soft-deleted task succeeds and awards +10. `POST /block-lists/:id/sites` on a deleted list inserts the sites and then answers 404.
**Cause:** ownership checks ignore `deleted_at`; `update()` has no `deleted_at is null` filter; the sites route checks the list after writing.
**Evidence:** code: packages/db/migrations/0002_tasks.sql:95-98; 0003_goals.sql:96-98; apps/web/lib/server/resource.ts:187-189; apps/web/app/api/v1/block-lists/[id]/sites/route.ts:40-47 · code review, confidence high (task-in-deleted-list confirmed by query; the rest traced)
**Status:** Open

### P3-188 · Server · Server / API
**Routine logs: `completed:true` on a progress routine is silently dropped, and far-future days can be completed for points**

**What / Repro:** `PUT /routines/:id/logs/<today> {completed:true}` on a progress routine → 200 with `completed:false, amount:0`. `PUT …/logs/<today+300> {amount:<total>}` → `completed:true` and +5 stardust.
**Expected · Actual:** the first should be a 400 (or set the amount to the total); the app shows future days read-only (DECISIONS.md line 68) but the database accepts them.
**Cause:** the trigger derives `completed` from `amount` and only checks "scheduled", not "≤ today".
**Evidence:** code: packages/db/migrations/0004_routines.sql:158-166, 305-320; packages/shared/src/schemas.ts:375-377 · code review, confidence high (confirmed by query)
**Status:** Open

### P3-189 · Server · Server / API
**Purged rows leave no tombstone**

**What / Repro:** a client syncs, a task is soft-deleted, the client stays offline past the 30-day purge, then asks `?updated_since=<old cursor>`. The row is gone and `sp_tasks`, `sp_task_lists`, `sp_goals`, `sp_goal_lists`, `sp_block_lists` write no tombstone on hard delete, so the id is never reported and the client keeps the task.
**Evidence:** code: packages/db/migrations/0007_sync_and_maintenance.sql:103-112; 0002_tasks.sql, 0003_goals.sql, 0005_focus.sql:70-82 · code review, confidence high (traced: no tombstone trigger exists on these tables)
**Status:** Open

### P3-190 · Server · Server / API
**`POST /focus/actions` conflict responses do not use the error envelope**

**What / Repro:** send a stale `expectedVersion` → HTTP 409 with `{ok:false, error:"version_conflict", state, …}`.
**Expected · Actual:** SPEC §11 says errors are `{error:{code,message}}`. Here `error` is a string, so a client that reads `body.error.code` on any non-2xx gets `undefined`.
**Evidence:** code: apps/web/app/api/v1/focus/actions/route.ts:16-20 · code review, confidence high (traced)
**Status:** Open

### P3-191 · Server · Server / API
**Any server-side `SyntaxError` is reported as "The request body is not valid JSON"**

**What / Repro:** truncate `/data/config.json`, or have the gateway answer `/rest/v1/sp_schema_version` or `/pg/query` with HTML. Every route then returns 400 `bad_request` blaming the caller's body.
**Expected · Actual:** expected 500/502 with an accurate message; a corrupt config in particular is undiagnosable from the UI.
**Evidence:** code: apps/web/lib/server/http.ts:73-74; sources: lib/server/config.ts:79, lib/server/setup.ts:55, 103, 110 · code review, confidence high (traced)
**Status:** Open

### P3-192 · Server · Server / API
**`DELETE /api/v1/quotes` with a JSON `null` body returns 500**

**What / Repro:** `DELETE /api/v1/quotes` with body `null` (no `?id`). `(await readJson(req)).id` throws a TypeError → `internal_error`.
**Evidence:** code: apps/web/app/api/v1/quotes/route.ts:25 · code review, confidence high (traced)
**Status:** Open

### P3-193 · Server · Server / API
**`PUT /api/v1/settings {}` returns 502**

**What / Repro:** send an empty object. Unlike `update()` and focus settings there is no "send at least one field" check; the empty PATCH returns no row, `.single()` errors, and the handler maps it to `upstream_error`.
**Evidence:** code: apps/web/app/api/v1/settings/route.ts:20-38 · code review, confidence medium (traced; PostgREST behaviour for an empty patch not exercised)
**Status:** Open

### P3-194 · Server · Server / API
**`GET /focus/sessions?from=&to=` interprets dates in UTC, not the owner's time zone**

**What / Repro:** owner in UTC−5 asks for `from=2026-11-23&to=2026-11-23`. `from` is compared as midnight UTC and `to` as `23:59:59.999Z`, so evening sessions are missing and the previous evening's are included; `/focus/stats` uses the owner's zone, so the two disagree.
**Evidence:** code: apps/web/app/api/v1/focus/sessions/route.ts:16-20 · code review, confidence high (traced)
**Status:** Open

### P3-195 · Server · Server / API
**`/api/setup/state` and `/api/health` expose setup state to anonymous callers after setup**

**What / Repro:** unauthenticated GET returns `stage`, `pinReset`, `resetPinEnv`, `fromEnv`, `hasDatabaseUrl`, `appSecretSource`. `pinReset: true` tells a scanner the instance currently accepts a new PIN from anyone.
**Evidence:** code: apps/web/app/api/setup/state/route.ts:10-26; apps/web/app/api/health/route.ts:8-29 · code review, confidence high (traced)
**Status:** Open

### P3-196 · Server · Server / API
**CORS reflects any browser-extension origin with credentials**

**What / Repro:** a request with `Origin: chrome-extension://<any id>` gets `Access-Control-Allow-Origin` echoed and `Allow-Credentials: true`, including on `GET /api/v1/auth/session`, which returns the access token.
**Expected · Actual:** SPEC §11 says "the app origin + extension origins"; this allows every extension, not Stellar's. An extension that has host access to the app's origin can read the token cross-origin.
**Evidence:** code: apps/web/lib/server/http.ts:83, 113-120 · code review, confidence medium (traced; SameSite=Lax limits what it enables)
**Status:** Open

### P3-197 · Server · Server / API
**Lockout file edge cases: corrupt file locks forever, failed write means failures are not counted**

**What / Repro:** (a) make `/data/lockout.json` unparseable: every read returns a fresh `now + 30s` lock, and a locked `checkPin` never writes, so the file is never repaired and sign-in is locked until someone deletes it. (b) make `/data` read-only or full: `recordFailure()` throws after the hash, the caller gets 500, and no failure is ever recorded, so guesses are unlimited.
**Evidence:** code: apps/web/lib/server/lockout.ts:48-55, 58-69; apps/web/lib/server/auth.ts:71-78 · code review, confidence high (traced)
**Status:** Open

### P3-198 · Server · Server / API
**In-memory rate limiter grows without bound and scans the whole map per request once large**

**What / Repro:** with spoofable XFF (finding 4), send requests from more than 5,000 distinct "IPs" inside one window. Nothing is evictable yet, so each further request iterates every bucket and the map keeps growing.
**Evidence:** code: apps/web/lib/server/rate-limit.ts:19-36 · code review, confidence high (traced)
**Status:** Open

### P3-199 · Server · Server / API
**Scheduler stalls behind one hung request while health still reports it running**

**What / Repro:** Supabase stops answering mid-request (gateway restart, network drop). `admin.rpc("sp_scheduler_tick")` and the push sends have no timeout, `running` stays true, and every 2s tick returns early until the socket times out (minutes). Timers are not advanced and no pushes are sent in that window; `/api/health` reports `scheduler: true` because it only checks that the interval exists.
**Evidence:** code: apps/web/lib/server/scheduler.ts:27-62, 83-85; apps/web/app/api/health/route.ts:25 · code review, confidence medium (traced; relies on default fetch timeouts)
**Status:** Open

### P3-200 · Server · Server / API
**Extension / iOS sign-ins add a new device row every time and never retire the old one**

**What / Repro:** sign in from the extension twice. Only cookie clients pass an existing device id, so each bearer sign-in inserts a row; earlier rows keep `revoked_at = null` and a dead `auth_session_id`, and show as live devices in Settings → Security.
**Evidence:** code: apps/web/lib/server/auth.ts:125-140, 165-167 · code review, confidence high (traced)
**Status:** Open

### P3-201 · Server · Server / API
**`authenticated` keeps default privileges the migrations meant to withhold**

**What / Repro:** as the owner, `delete from sp_settings` through PostgREST succeeds (the `for all` policy allows it) although only select/insert/update are granted in the migration; the time zone then falls back to UTC until the next bootstrap. `sp_schema_version` is protected only by having no write policy.
**Cause:** `revoke all … from anon` leaves the platform's default grants to `authenticated` in place.
**Evidence:** code: packages/db/migrations/0001_core.sql:12-14, 94-96; 0005_focus.sql:207-212 · code review, confidence high (confirmed by query: `authenticated` has DELETE and TRUNCATE on `sp_schema_version`, `sp_settings`, `sp_focus_settings`, …; deleting the owner's `sp_settings` row succeeded)
**Status:** Open

### P3-202 · Server · Server / API
**`sp__timezone(uuid)` / `sp__today(uuid, …)` are SECURITY DEFINER and callable by any authenticated user**

**What / Repro:** on a Supabase instance shared with other projects (SPEC §3.2), any signed-in user can `rpc("sp__timezone", {p_user:<owner uuid>})` and read the owner's time zone.
**Evidence:** code: packages/db/migrations/0001_core.sql:99-119 · code review, confidence high (traced)
**Status:** Open

### P3-203 · Server · Server / API
**Delta cursor can miss a row committed by a transaction that started before the cursor was read**

**What / Repro:** a long write (`sp_import`, `sp_rebalance`, a large list soft-delete) stamps `updated_at = now()`, which is its transaction start. A list request reads `sp_now()` (`clock_timestamp()`) after that start but before the commit: the rows are not visible yet and their `updated_at` is already older than the cursor handed back.
**Evidence:** code: packages/db/migrations/0001_core.sql:17-23 (and each `*_before` trigger); 0009_server_time.sql:7-10; apps/web/lib/server/resource.ts:121-136 · code review, confidence low (traced; window is milliseconds)
**Status:** Open

### P3-204 · Server · Server / API
**PATCH validation relies on raw constraint errors for cross-field rules**

**What / Repro:** `PATCH /goals/:id {type:"progress"}` (no total), `PATCH /routines/:id {frequency:"weekdays"}` (no weekdays), `PATCH /routines/:id {end_date:<before the stored start>}`. zod passes because the partner field is absent; Postgres rejects, and the client sees 400 with text like `new row for relation "sp_goals" violates check constraint "sp_goals_total_chk"`.
**Evidence:** code: packages/shared/src/schemas.ts:259-269, 306-342, 366; apps/web/lib/server/resource.ts:73-74 · code review, confidence medium (traced)
**Status:** Open

### P3-205 · Server · Server / API
**Secure-cookie decision follows `PUBLIC_APP_URL`, not the request**

**What / Repro:** `PUBLIC_APP_URL=https://…` is set but the owner opens the app over plain HTTP on the LAN. Cookies are issued `Secure`, the browser drops them, and a correct PIN loops back to the lock screen with no error.
**Evidence:** code: apps/web/lib/server/http.ts:100-102, 164-166; apps/web/lib/server/supabase.ts:61-79 · code review, confidence medium (traced)
**Status:** Open

### P3-206 · Server · Server / API
**Owner-password desync surfaces as "Could not reach Supabase"**

**What / Repro:** restore a `/data` backup taken before a "Sign out everywhere", or have `updateStoredConfig` fail after `updateUserById` succeeded. The stored hidden password no longer matches; every correct PIN returns 502 "Could not reach Supabase to sign in", which points the owner at the wrong problem. Recovery (RESET_PIN re-keys the owner) is not suggested.
**Evidence:** code: apps/web/lib/server/auth.ts:154-164, 273-278 · code review, confidence medium (traced)
**Status:** Open

### P3-207 · Server · Server / API
**Boot waits on migrations before the server answers anything**

**What / Repro:** `register()` awaits `boot()`, which awaits `runMigrations`. A slow or lock-blocked database (see finding 17: up to the 120s statement timeout) delays readiness past the health check's 20s start period plus three 30s retries, so the orchestrator can mark the container unhealthy and roll back.
**Evidence:** code: apps/web/instrumentation.ts:7-8; apps/web/lib/server/boot.ts:24-35; Dockerfile:51-52 · code review, confidence low (traced; not exercised)
**Status:** Open

### P3-208 · Server · Server / API
**First-run `/api/setup/connect` is an unauthenticated URL prober**

**What / Repro:** before setup completes, anyone can POST `{url:"http://10.0.0.5:8080", dryRun:true}` and learn from the check messages whether the host answered, timed out or refused, and the HTTP status of `/auth/v1/health`, at 40 requests/min per (spoofable) IP.
**Evidence:** code: apps/web/app/api/setup/connect/route.ts:19-52; apps/web/lib/server/probe.ts:28-45, 91-126 · code review, confidence medium (traced)
**Status:** Open

### P3-209 · Extension · Extension (Chrome + Firefox)
**A dead Realtime channel is never rebuilt while the worker stays alive**

**What / Repro:** Channel ends in `CHANNEL_ERROR`, `TIMED_OUT` or `CLOSED` (sleep, token expiry during a disconnect).
**Expected · Actual:** Expected a new subscription. Actual: `subscribe()` returns early while `channel && channelFor === db`; the status callback only handles `SUBSCRIBED`. Sync falls back to the 30 s alarm.
**Cause:** No handling of error states and no recreation.
**Evidence:** code: apps/extension/lib/background.ts:103-105,122-131 · code review, confidence medium (code alone; realtime-js rejoin behaviour not exercised)
**Status:** Open

### P3-210 · Extension · Extension (Chrome + Firefox)
**Popup and background run separate auth clients on the same storage with no shared lock**

**What / Repro:** Connect and keep the popup open (for example with devtools) until the token nears expiry.
**Expected · Actual:** Expected a single refresher. Actual: the popup's client also has `autoRefreshToken: true`, so both contexts can rotate the refresh token at the same moment. Supabase's reuse interval usually tolerates it.
**Cause:** The popup creates a full client only to call `setSession`.
**Evidence:** code: apps/extension/entrypoints/popup/main.tsx:99-102; apps/extension/lib/client.ts:15-30 · code review, confidence medium (auth-js 2.119.2 has no navigator-lock default; impact limited to the popup staying open near token expiry)
**Status:** Open

### P3-211 · Extension · Extension (Chrome + Firefox)
**Instance down behind a proxy is reported as "isn't Stellar Planner"**

**What / Repro:** Stop the app container so the proxy answers 502/503, then try to connect.
**Expected · Actual:** Expected "Your planner isn't responding". Actual: "That address answered, but it isn't Stellar Planner."
**Cause:** Every `!res.ok` maps to `not_found`.
**Evidence:** code: apps/extension/lib/api.ts:38-39 · code review, confidence high (code alone)
**Status:** Open

### P3-212 · Extension · Extension (Chrome + Firefox)
**PIN lockout: `retry_after_seconds` is read but never used**

**What / Repro:** Enter wrong PINs until locked.
**Expected · Actual:** Expected a countdown and a disabled keypad. Actual: a static server message; the keypad stays active and every further attempt is another request.
**Cause:** `ApiError.retryAfterSeconds` is never read by the popup.
**Evidence:** code: apps/extension/lib/api.ts:81-85; apps/extension/entrypoints/popup/main.tsx:111-115 · code review, confidence high (code alone)
**Status:** Open

### P3-213 · Extension · Extension (Chrome + Firefox)
**A failed `setSession` leaves a half-connection that later flips the popup into reconnect mode**

**What / Repro:** Connect to an instance whose advertised Supabase URL is not reachable from the browser (internal hostname). `setConnection` succeeds, `setSession` fails.
**Expected · Actual:** Expected a clean error. Actual: the connection stays in storage; within 30 s the background sets `needs_pin`; because `Connect` is keyed by status, it remounts and clears what the user is typing, now without "Use a different address". The same remount can happen mid-login if a resync lands between `setConnection` and `setSession`.
**Cause:** The connection is written before the session is verified; `key={status}` remounts on status changes.
**Evidence:** code: apps/extension/entrypoints/popup/main.tsx:98-108,512; apps/extension/lib/background.ts:156-162 · code review, confidence high (code alone)
**Status:** Open

### P3-214 · Extension · Extension (Chrome + Firefox)
**Enter with fewer than 6 digits re-clicks the focused keypad button**

**What / Repro:** Click "1" with the mouse (it keeps focus), type more digits on the keyboard, press Enter or Space before reaching 6.
**Expected · Actual:** Expected nothing or submit. Actual: the window keydown handler calls `onSubmit` (ignored below 6 digits) and the browser also activates the focused button, adding an extra "1".
**Cause:** A global keydown listener without `preventDefault`, alongside focusable keypad buttons.
**Evidence:** code: apps/extension/entrypoints/popup/main.tsx:217-225,228-238 · code review, confidence medium (code alone)
**Status:** Open

### P3-215 · Extension · Extension (Chrome + Firefox)
**Message handlers have no error path; a throw leaves the popup waiting**

**What / Repro:** Make `disconnect()` or `resync()` throw (for example `updateDynamicRules` rejecting, see E3).
**Expected · Actual:** Expected an `{ ok: false }` reply. Actual: `void disconnect().then(respond)` and `void resync().then(...)` never respond and leave an unhandled rejection; the listener returned `true`, so the popup's `send()` stays pending (Disconnect button stuck) until the channel is torn down. `void apply().then(() => resync())` in `wake` and the alarm handler are also uncaught.
**Cause:** No `.catch` on background promises.
**Evidence:** code: apps/extension/lib/background.ts:232-239,183-202,224,229-230,240 · code review, confidence medium (code alone)
**Status:** Open

### P3-216 · Extension · Extension (Chrome + Firefox)
**Badge minutes lag by up to 30 s and ignore link status**

**What / Repro:** Watch the badge next to the popup clock during focus.
**Expected · Actual:** Expected the minute to change when the clock crosses it. Actual: the badge is recomputed only in `apply()` (30 s alarm or a state change), so it can read "5" with 3:31 left. It shows nothing for `needs_pin`/`offline`.
**Cause:** No alarm aligned to the minute boundary.
**Evidence:** code: apps/extension/lib/background.ts:42-50,100,223; apps/extension/lib/blocking.ts:60-71 · code review, confidence high (code alone)
**Status:** Open

### P3-217 · Extension · Extension (Chrome + Firefox)
**Patterns beyond 4,500 are dropped silently**

**What / Repro:** Activate lists with more than 4,500 domains.
**Expected · Actual:** Expected a notice. Actual: `slice(0, MAX_RULES)` after sorting drops the alphabetically last domains; the popup still shows the full site count. Whether 4,500 redirect rules fit Chrome's limit for "unsafe" dynamic rules and Firefox's dynamic-rule limit is unverified; if not, the whole install fails as in E3.
**Cause:** Hard cap with no feedback.
**Evidence:** code: apps/extension/lib/rules.ts:12-13,33-35,66-68 · code review, confidence high (code alone; browser rule limits need verification)
**Status:** Open

### P3-218 · Extension · Extension (Chrome + Firefox)
**Internationalised domains can only be blocked in punycode**

**What / Repro:** Add `münchen.de` to a block list.
**Expected · Actual:** Expected conversion to `xn--mnchen-3ya.de`. Actual: rejected as "isn't a valid website address".
**Cause:** `LABEL_RE` is ASCII-only with no IDNA conversion.
**Evidence:** code: packages/shared/src/normalize.ts:5,28-30; apps/extension/lib/rules.ts:23-25 · code review, confidence high (code alone)
**Status:** Open

### P3-219 · Extension · Extension (Chrome + Firefox)
**`blocked.html` is web-accessible to every site**

**What / Repro:** Any page can load `chrome-extension://<id>/blocked.html?site=evil.com#https://evil.com/x` in a frame or by navigation.
**Expected · Actual:** Expected the page to be reachable only through the redirect. Actual: the extension is detectable on Chrome (fixed id); the page shows "Focus complete … Continue to evil.com" linking to a host the attacker chose (http/https only, text escaped by React, so no script injection); each load sends `resync` to the background and causes a request to the instance.
**Cause:** `matches: ["<all_urls>"]` without `use_dynamic_url`; `site` is not checked against the cached patterns when not blocking.
**Evidence:** code: apps/extension/wxt.config.ts:19; apps/extension/lib/rules.ts:88-106; apps/extension/entrypoints/blocked/main.tsx:23-28,60-64 · code review, confidence medium (code alone; exposure is limited)
**Status:** Open

### P3-220 · Extension · Extension (Chrome + Firefox)
**Popup shows "Fetching your timer…" indefinitely when linked but offline with no snapshot**

**What / Repro:** Connect, lose the network before the first snapshot (or the first `sp_focus_get` fails).
**Expected · Actual:** Expected an offline message with a retry. Actual: the loading line stays; status is not shown in that branch.
**Cause:** No error or offline state for `snapshot === null`.
**Evidence:** code: apps/extension/entrypoints/popup/main.tsx:515-521 · code review, confidence high (code alone)
**Status:** Open

### P3-221 · Extension · Extension (Chrome + Firefox)
**Block page keeps the tab title "Blocked · Stellar Planner" and shows "Focus complete" for unrelated states**

**What / Repro:** Let the phase end, or open the block page while disconnected or for a site that is not in the active lists.
**Expected · Actual:** Expected the title to change and a neutral message when there is no state. Actual: the title never changes; every non-blocking case (including `snapshot === null` and a session ended early) reads "Focus complete".
**Cause:** One fallback branch for all non-blocking cases; static title.
**Evidence:** code: apps/extension/entrypoints/blocked/index.html:7; apps/extension/entrypoints/blocked/main.tsx:40-58 · code review, confidence high (code alone)
**Status:** Open

### P3-222 · Extension · Extension (Chrome + Firefox)
**Firefox host-permission prompt from the popup; failures are treated as granted**

**What / Repro:** On Firefox, revoke "Access your data for all websites", then reconnect.
**Expected · Actual:** Expected a prompt and a clear error on denial. Actual: the reconnect path calls `permissions.request` from a `useEffect` (no user gesture), which throws and is turned into `true`; discovery then fails with "Can't reach …". From the click path, Firefox's permission prompt may close the popup and lose the typed address. The background never checks `permissions.contains`, so a later revocation looks like "Offline" with no blocking.
**Cause:** `.catch(() => true)`; no permission check in the background.
**Evidence:** Real Firefox 159, temporary add-on: `<all_urls>` reports granted at install. A signed, permanently installed build may differ, so the permission prompt stays on the device checklist · code: apps/extension/entrypoints/popup/main.tsx:59-66,75-78 · code review, confidence low (needs verification on Firefox)
**Status:** Open

### P3-223 · Universe · Web + PWA
**`clearGroup` disposes three's shared Sprite geometry**

**What / Repro:** Any `clearGroup` call on a group that contains sprites (systems, layers).
**Expected · Actual:** Expected only owned geometries to be disposed. Actual: `m.geometry.dispose()` also runs for `THREE.Sprite`, whose geometry is one module-level object shared by every sprite, including the core and nebulae.
**Cause:** The guard excludes only `planetGeometry`.
**Evidence:** code: packages/universe/src/scene-core.ts:445-447 · code review, confidence medium (code; three recreates the buffers on the next render, so the cost is re-upload churn)
**Status:** Open

### P3-224 · Universe · Web + PWA
**Tier step-down does not reset `ready`: the new canvas is shown before its first frame**

**What / Repro:** Let the governor step Cinematic down to Balanced.
**Expected · Actual:** Expected a cross-fade as on first load. Actual: `key={tier}` remounts the Canvas while `ready` is still true, so the wrapper stays at full opacity and `data-sky="3d"` keeps the CSS stars hidden while the new context has drawn nothing: a visible blink. Only the `readSignals` path sets `ready: false`.
**Cause:** `ready` is not tied to the canvas instance.
**Evidence:** code: packages/universe/src/canvas.tsx:75,93,111; apps/web/components/universe/universe-host.tsx:84-88,110,160 · code review, confidence medium (code alone)
**Status:** Open

### P3-225 · Universe · Web + PWA
**Reduced motion with an explicit tier still animates several things, at 8 fps**

**What / Repro:** Quality = Cinematic or Balanced with the OS "Reduce motion" on.
**Expected · Actual:** Expected a still scene. Actual: `sceneSignals.now` keeps advancing and those paths are not gated by `motion`, so moons orbit, cluster stars twinkle, nebulae pulse and a rekindled constellation strobes, all at 8 fps.
**Cause:** The `motion` flag is applied to only some of the time-driven terms.
**Evidence:** code: packages/universe/src/scene-core.ts:714-719 (nebula pulse), 736-745 (moons), 763 (rekindle flicker), 771-778 (cluster layer keeps `uTwinkle` 0.45), 47 (birth flare); packages/universe/src/canvas.tsx:86,91 · code review, confidence high (code alone)
**Status:** Open

### P3-226 · Universe · Web + PWA
**One completed task ignites two stars once there are more than 240, and old stars move**

**What / Repro:** With more than 240 completed tasks, complete another.
**Expected · Actual:** Expected one new star and fixed positions. Actual: the new id enters `recent` and the oldest recent id drops out; in the monthly fill the newest month's count grows by one, so a new seed `"<month>:<n>"` appears. Both seeds are unknown, so two stars flare in different places. The task that left `recent` changes from its id seed to a month seed, so its star moves.
**Cause:** The month seed space is indexed by a count that shifts with the recent window; "fresh" means any unseen seed.
**Evidence:** code: packages/universe/src/layout.ts:47-76; packages/universe/src/scene-core.ts:419-423; packages/db/migrations/0006_universe.sql:237-243 (recent limit 240) · code review, confidence medium (code alone)
**Status:** Open

### P3-227 · Universe · Web + PWA
**`sceneSignals.ignite` and `rekindle` grow without bound when no 3D scene exists**

**What / Repro:** Minimal tier (or before the canvas has loaded): complete tasks over a long session.
**Expected · Actual:** Expected the lists to be bounded. Actual: the overlay pushes an id per event and only `UniverseScene.setSnapshot` empties them. With a scene, the ids are consumed by whichever snapshot arrives next, even one that does not contain the star yet, so the timed flare can be lost.
**Cause:** An unbounded hand-off queue with a single consumer.
**Evidence:** code: packages/universe/src/event-overlay.tsx:100-101; packages/universe/src/scene-core.ts:410,634 · code review, confidence high (code alone)
**Status:** Open

### P3-228 · Universe · Web + PWA
**An overlay effect keeps the animation loop running for 3 s after a 1.2 s (or 0.45 s) visual**

**What / Repro:** Complete one task, in particular on Minimal or with reduced motion.
**Expected · Actual:** Expected the loop to stop when the visual ends. Actual: `prune` keeps an effect active for `max(duration, coalesce window)`, so `idle` stays false and the overlay clears a full-screen canvas for another 1.8–2.5 s per event.
**Cause:** One list serves both "mergeable" and "needs drawing".
**Evidence:** code: packages/universe/src/director.ts:141-146,152-154; packages/universe/src/event-overlay.tsx:83-96 · code review, confidence high (code alone)
**Status:** Open

### P3-229 · Universe · Web + PWA
**Events that arrive while the tab is hidden play inconsistently on return**

**What / Repro:** A focus phase ends, or a new Era syncs from another device, while the tab is hidden; return some seconds later.
**Expected · Actual:** Expected the event to be skipped or played whole. Actual: (a) an event started while hidden uses hidden wall-clock time and is pruned unseen, but `signal()` already set `flashAt` on the scene clock, which only advances while rendering, so the 3D core flash plays on return with no overlay effect; (b) the Era title is shown and removed by a timer while hidden, so it is never seen; (c) exclusive events that were queued behind another one start on the first frame after return and play one after another.
**Cause:** Two clocks (`performance.now()` and the scene clock) and no hidden-tab policy.
**Evidence:** code: packages/universe/src/event-overlay.tsx:70-81,98-113; packages/universe/src/director.ts:108-112,131-139; packages/universe/src/canvas.tsx:68-72 · code review, confidence high (code alone)
**Status:** Open

### P3-230 · Universe · Web + PWA
**First Light (and any early event) is dropped if the overlay chunk takes more than 4 s to load**

**What / Repro:** Finish setup on a slow connection; the app emits `first_light` on arrival.
**Expected · Actual:** Expected the 4 s cinematic. Actual: the overlay is imported from an idle callback (up to 2.5 s) and then downloaded; backlog entries older than 4 s are discarded. If it does arrive in time while `tier` is still the store default `"minimal"` (before `readSignals` resolves), it plays as the 450 ms reduced glow.
**Cause:** A fixed 4 s backlog life; the tier defaults to Minimal before detection.
**Evidence:** code: packages/universe/src/bus.ts:32,46-48; apps/web/components/universe/universe-host.tsx:15-16,114-122; packages/universe/src/event-overlay.tsx:65-68; packages/universe/src/store.ts:42 · code review, confidence medium (code alone)
**Status:** Open

### P3-231 · Universe · Web + PWA
**Ending a pinch counts as a tap; the label is not tracked afterwards**

**What / Repro:** (a) Pinch to zoom and lift both fingers. (b) Hover a planet and keep the mouse still, or drag with the mouse.
**Expected · Actual:** (a) Expected no selection; actual: `moved` is reset on each pointerdown and is not increased during a pinch, so the last pointerup has `moved < 8` and `pickAt` may show a label. (b) Expected the label to follow or hide; actual: `hover.x/y` update only on pointermove and not while dragging, so the label stays put while the planet orbits or the camera eases back.
**Cause:** Tap detection ignores multi-touch; the label position is a snapshot.
**Evidence:** code: apps/web/components/home/home.tsx:256-294; packages/universe/src/store.ts:77-109 · code review, confidence high (code alone)
**Status:** Open

### P3-232 · Universe · Web + PWA
**The home sky area blocks vertical page scrolling**

**What / Repro:** Phone in landscape or with large text, where the home content is taller than the viewport; swipe up starting on the sky.
**Expected · Actual:** Expected the page to scroll. Actual: `touch-none` with pointer capture consumes the swipe as an orbit.
**Cause:** `touch-action: none` on a flex-1 region.
**Evidence:** code: apps/web/components/home/home.tsx:251 · code review, confidence medium (code alone; depends on whether the home page overflows)
**Status:** Open

### P3-233 · Universe · Web + PWA
**Resizing while the loop is paused leaves a cleared canvas**

**What / Repro:** On a tablet or phone, focus a text field (the loop pauses), then rotate the device or let the viewport resize.
**Expected · Actual:** Expected the last frame to be redrawn at the new size. Actual: R3F resizes the renderer (and, with bloom, the composer's render targets), which clears the canvas; with `frameloop="never"` and `paused` true nothing draws until the field loses focus, and the CSS stars are hidden.
**Cause:** Pause is unconditional; there is no "render one frame after resize".
**Evidence:** code: packages/universe/src/canvas.tsx:68-72,112; apps/web/components/universe/universe-host.tsx:137-140 · code review, confidence medium (code; setting the drawing-buffer size clears the canvas)
**Status:** Open

### P3-234 · Universe · Web + PWA
**The typing pause triggers for any `<input>` and stays until blur**

**What / Repro:** On a touch device, tap a checkbox, switch or range input (anything with tag `INPUT`).
**Expected · Actual:** Expected a pause only for text entry (keyboard up). Actual: `isField` matches every `INPUT` type, so the universe freezes until focus moves. `(pointer: coarse)` is read once at mount, so hybrid devices are misjudged.
**Cause:** A tag-name check without an input-type filter.
**Evidence:** code: apps/web/components/universe/universe-host.tsx:130-140 · code review, confidence high (code alone)
**Status:** Open

### P3-235 · Universe · Web + PWA
**R3F's default measure adds scroll listeners and layout reads the fixed canvas does not need**

**What / Repro:** Scroll any page with the canvas mounted.
**Expected · Actual:** Expected no layout reads from the universe during scroll. Actual: react-use-measure listens to scroll and calls `getBoundingClientRect` on the container (debounced 50 ms); resize is not debounced, so each iOS URL-bar resize event resizes the renderer and the bloom targets.
**Cause:** The `resize` prop is not set.
**Evidence:** code: packages/universe/src/canvas.tsx:110-126 · code review, confidence medium (R3F 9.8.2 source: `useMeasure({ scroll: true, debounce: { scroll: 50, resize: 0 } })`)
**Status:** Open

### P3-236 · Universe · Web + PWA
**Small per-frame and per-projection allocations in the hot path**

**What / Repro:** Profile allocations on the home.
**Expected · Actual:** Expected an allocation-free frame. Actual: a temporary array and closures per frame, `setViewOffset` (which recomputes the projection matrix) every frame even when nothing changed, and every 0.2 s two new `Vector3`s, a closure and one object per target pushed into `screenTargets`, on non-hover devices too.
**Cause:** Convenience allocations.
**Evidence:** code: packages/universe/src/scene-core.ts:722,714,834,852,858,863-884 · code review, confidence high (code alone)
**Status:** Open

### P3-247 · Auth · Web + PWA
**Lighthouse cannot measure /lock: nothing paints for it**

**What / Repro:** Lighthouse mobile on /lock signed out.
**Expected · Actual:** Expected a first contentful paint. Actual: NO_FCP in both runs; the lock content starts at opacity 0 inside an entrance animation.
**Cause:** `animate-fade-up` on the whole lock card.
**Evidence:** docs/polish/data/lighthouse-before.json · code: apps/web/components/auth/lock-screen.tsx:113
**Status:** Open

### P3-249 · Performance · Web + PWA
**Memory baseline: no growth trend, but WebGL resource counts cannot be observed**

**What / Repro:** 30-minute scripted session (214 rounds over every tab).
**Expected · Actual:** Expected a flat heap and observable GPU resource counts. Actual: heap 12.7 MB after load → 15.2 MB at 30 min, flat for the last 10 minutes (+0.1 MB while 60 more tasks entered the cache); DOM nodes and listeners constant. The scene exposes no renderer.info, so texture/geometry disposal could not be measured.
**Cause:** No diagnostics hook for renderer statistics.
**Evidence:** docs/polish/PERF.md (memory) · docs/polish/data/memory-before-desktop.json · code: packages/universe/src/store.ts:70
**Status:** Open

## Native-feel requirements already met

- §4.1 Touch & feedback: tap-highlight transparent; touch-action manipulation; no 300 ms delay. app/globals.css:66, 80, 92-99. Note: `manipulation` still allows pinch-zoom, which also makes `useKeyboardInset` report a false keyboard (ui/use-media.ts:43, vv.height shrinks when zoomed).
- §4.5 Launch, resume & state restoration: No white flash; #070615 everywhere. app/globals.css:60-62, 242-249; app/layout.tsx:39-45, 26; app/manifest.ts:13-14.

