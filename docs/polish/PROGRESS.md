# Polish pass 1 — progress

Source of truth: `docs/polish/POLISH_SPEC.md`. Branch: `polish/pass-1` (never merged, never pushed to `main`).
Findings: `docs/polish/AUDIT.md`. Measurements: `docs/polish/PERF.md`. Decisions: `docs/DECISIONS.md` → "Polish pass 1".

Legend: `[ ]` open · `[~]` in progress · `[x]` done and verified · `[!]` blocked / could not verify (reason given)

## Phase 0 — Test environment

- [x] Dev stack up (`pnpm stack:up`), standalone build served on :3100
- [x] Official Supabase bundle (`supabase start`, ports 553xx) + smoke subset on desktop: 01-setup, 02-auth, 03-shell, 04-tasks, 07-focus, 10-extension all pass; no behaviour differs from the dev stack
- [x] Setup through the wizard spec and the API helper with the test PIN
- [x] `scripts/seed-polish.mts` (implementation in `apps/web/e2e/seed-polish.ts`): 274 tasks (12 overdue, 9 today, 40 upcoming, 15 undated, 48 in 8 lists, 150 completed history), 6 goal lists, 6 routines with 90 days of logs, 60 days of focus sessions, 3 block lists with 20 sites; 3,131 stardust = Era III
- [x] Extension built for Chrome and Firefox (`apps/extension/.output`)
- [x] Playwright projects: `desktop`, `iphone-15-pro`, `iphone-se` kept; `webkit-iphone-15-pro`, `webkit-iphone-se`, `webkit-iphone-15-pro-landscape`, `firefox-desktop` added
- [x] DECISIONS.md: WebKit is now required
- [x] Firefox extension loaded into a real Firefox 159 (`pnpm --filter @stellar/extension smoke:firefox`): 7/7 checks pass (install, host permission, wrong address, connect, rules + badge, redirect + live countdown, end + handoff)
- [x] Commit `polish: phase 0`

## Phase 1 — Audit (no product code changes)

### 2.1 Automated sweep

- [x] typecheck, lint, unit tests, build: clean, no warnings
- [x] Every e2e flow with listeners on all seven projects → `docs/polish/data/sweep-baseline.txt` (1,051 entries, 134 distinct)
- [x] axe-core on 20 screens and sheets per project → `docs/polish/data/scan-summary.md` (Firefox crashed mid-scan and landscape timed out; both are findings)
- [x] Lighthouse (mobile) on seven routes → `docs/polish/data/lighthouse-before.json`
- [x] Bundle analysis: three.js only in the lazy chunk; route sizes in PERF.md
- [x] Memory: 30-minute scripted session → no growth trend (PERF.md)

### 2.2 Scripted adversarial pass (`apps/web/e2e/audit/adversarial.spec.ts`)

- [x] Rapid input (ADV-01…04)
- [x] Concurrency, two tabs + API (ADV-14, 20, 21, 22); extension concurrency is covered by code review and the two extension runs
- [x] Network: offline edits, 20 offline changes with a relaunch, a hung request (ADV-10…13). Slow-3G and Realtime drop were reviewed in code, not scripted
- [x] Time: owner zone ≠ device zone, midnight rollover (ADV-40, 41). DST, week start, hidden-tab phase end and clock skew were reviewed in code and unit tests, not scripted
- [x] Data edges: seed data (500-char names, RTL, emoji-only, over-100% goals) through the scan; 1,000 tasks in the perf spec; amounts reviewed in code
- [~] Auth: lockout race (ADV-60) scripted; the inactivity-lock test (ADV-30) did not trigger the lock and is fixed in Phase 2 with the lock isolation bug; session expiry and RESET_PIN reviewed in code
- [x] PWA lifecycle: existing 09-pwa specs on all engines plus code review of the worker
- [x] Extension: Chromium spec, real-Firefox script, code review

### 2.3 Native-feel audit

- [x] Every POLISH_SPEC §4 bullet scored (AUDIT.md "Native feel" entries) with scan data per iPhone project. Recordings are taken in Phase 3, when there is a before/after to show

- [x] `docs/polish/AUDIT.md` written (248 findings: 3 P0, 40 P1); commit `polish: audit`

## Phase 2 — Fix P0 and P1

- [ ] Every P0 fixed with a regression test
- [ ] Every P1 fixed with a regression test
- [ ] Checks + affected e2e green; commits `polish: phase 2 …`

## Phase 3 — Native-feel PWA polish

- [ ] 4.1 Touch & feedback (pointerdown press state, callout/selection, 44px targets, haptics research)
- [ ] 4.2 Gestures (edge swipe back, sheet detents, swipe rows, interruptible)
- [ ] 4.3 Scrolling & navigation (overscroll, large titles, tab keep-alive, view transitions, prefetch)
- [ ] 4.4 Keyboard & forms (visualViewport, input attributes, rapid entry, focus management)
- [ ] 4.5 Launch, resume & state restoration
- [ ] 4.6 Smoothness (transform/opacity only, universe yields, long tasks, INP)
- [ ] 4.7 Visual consistency (safe areas, text size, loading/empty/error/offline states, truncation, tokens)
- [ ] 4.8 Desktop web & extension
- [ ] Checks + e2e green; commits `polish: phase 3 …`

## Phase 4 — Fix P2 and P3

- [ ] Every remaining AUDIT entry Fixed or Won't fix (with reason)
- [ ] Checks + e2e green; commit `polish: phase 4`

## Phase 5 — Verify & hand off

- [ ] Full matrix green: typecheck, lint, unit, e2e on every project, `docker build .`
- [ ] Phase 1 sweep re-run: zero console errors, zero failed requests in normal flows, no serious/critical axe violations, no memory growth trend
- [ ] `docs/polish/PERF.md` before/after table
- [ ] `docs/polish/AUDIT.md` statuses final
- [ ] `docs/polish/IPHONE_CHECKLIST.md`
- [ ] Final summary below
- [ ] Branch `polish/pass-1` pushed, not merged

## Environment notes

- **Docker:** Docker Desktop was not running at the start; it was started for this pass. The dev stack (`pnpm stack:up`) is the backend for everything.
- **Disk:** the machine had well under 1 GB free. Pulling the official Supabase images filled the disk, Docker's VM went read-only and the dev database dropped mid-run. Docker Desktop was restarted and the baseline e2e matrix re-run. The Playwright browser cache was cleared during the clean-up and reinstalled.
- **Official Supabase bundle:** ran after the owner freed about 15 GB; the leftover images from the failed first attempt were removed. See DECISIONS.
- **Playwright traces/videos** are off for the big runs to save disk.
- **Baseline before any change:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (339 unit/SQL tests) and `pnpm build` all pass with no warnings.

## Summary

(written in Phase 5)
