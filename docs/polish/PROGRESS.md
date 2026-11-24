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

### 2.2 Scripted adversarial pass (`apps/web/e2e/12-regressions.spec.ts`)

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

- [x] All three P0s fixed with regression tests (`a65a919`): offline edits lost, one failing change blocking sync for good, Verify taking a configured instance out of service
- [x] P1s fixed with regression tests (`a65a919`, `85dca7b`, `cfe0bcc`, `c13595b`); the ones that turned out to be test artefacts or by design are closed as Won't fix with the reason in AUDIT.md
- [x] The adversarial audit tests became `apps/web/e2e/12-regressions.spec.ts`
- [x] Checks and e2e green

## Phase 3 — Native-feel PWA polish

- [x] 4.1 Touch & feedback: pressed state on pointerdown, no selection or callout on chrome, 44px hit areas, haptics by the paths the platforms expose
- [x] 4.2 Gestures: edge-swipe back, sheet drag with detents and scroll hand-off, row swipes (one open, close on scroll, full swipe), interruptible
- [x] 4.3 Scrolling & navigation: large-title bar, tab memory and re-tap, push/pop view transitions, back pops history
- [x] 4.4 Keyboard & forms: input attributes everywhere, dragging a list dismisses the keyboard, lock and fullscreen focus handling
- [x] 4.5 Launch, resume & state restoration: cached first frame then revalidation, restore of place, scroll and draft, refresh on return
- [x] 4.6 Smoothness: the universe yields to interaction; measured before and after (PERF.md)
- [x] 4.7 Visual consistency: safe-area matrix green after the changes, loading/empty/error/offline states, truncation. **Not done:** Dynamic Type and moving hard-coded colours into tokens (both Won't fix with reasons)
- [x] 4.8 Desktop web & extension: context menu, focus handling; extension verified in Chromium and a real Firefox
- [x] New tests in `apps/web/e2e/13-native-feel.spec.ts`

## Phase 4 — Fix P2 and P3

- [x] Every remaining AUDIT entry is Fixed, Won't fix (with reason) or Needs device check: 123 Fixed · 112 Won't fix · 14 Needs device check
- [x] Commit `578204a`

## Phase 5 — Verify & hand off

- [x] `docs/polish/PERF.md` before/after table (re-measured in a clean state; see its notes)
- [x] `docs/polish/AUDIT.md` statuses final
- [x] `docs/polish/IPHONE_CHECKLIST.md`
- [ ] Full matrix on the final build, final sweep, `docker build .` (results recorded in the summary below)
- [ ] Branch `polish/pass-1` pushed, not merged

## Environment notes

- **Docker:** Docker Desktop was not running at the start; it was started for this pass. The dev stack (`pnpm stack:up`) is the backend for everything.
- **Disk:** the machine had well under 1 GB free. Pulling the official Supabase images filled the disk, Docker's VM went read-only and the dev database dropped mid-run. Docker Desktop was restarted and the baseline e2e matrix re-run. The Playwright browser cache was cleared during the clean-up and reinstalled.
- **Official Supabase bundle:** ran after the owner freed about 15 GB; the leftover images from the failed first attempt were removed. See DECISIONS.
- **Playwright traces/videos** are off for the big runs to save disk.
- **Baseline before any change:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (339 unit/SQL tests) and `pnpm build` all pass with no warnings.

## Summary

(written in Phase 5)
