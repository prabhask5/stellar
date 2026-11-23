# Stellar Planner — Hard Polish Pass (Pass 1)

> Goal: find and fix every bug and rough edge you can across the web app, the iPhone PWA and the browser extension, and make the PWA feel as close to a native iOS app as the web platform allows.
> This is **not** a feature pass. Do not add features, change the data model, or change the visual design direction (SPEC.md §6 is still the design source of truth). Every change must make an existing thing work better, feel better, or fail more gracefully.

---

## 0. Ground rules

- Work on a branch `polish/pass-1`. Never push to `main`, because the owner deploys from it.
- **Never touch the owner's production instance or data.** Run everything against a local stack (§1).
- Fix bugs at the root cause, not the symptom. Every bug fixed gets a regression test (unit or e2e) that fails before the fix and passes after.
- Schema changes are allowed **only** when a bug can't be fixed otherwise. In that case: a new numbered migration, idempotent, noted in `docs/DECISIONS.md`.
- Keep the performance budgets in SPEC.md §12. Never trade feel for weight without measuring.
- Record everything in `docs/polish/` (below). The owner reads these files to see what happened.

---

## 1. Phase 0 — Test environment

### Known gaps from the original build (from `docs/PROGRESS.md` → Deviations)
These are the highest-yield places to look for bugs. Close each one in this pass:
- **The phone e2e projects run in Chromium, not WebKit** (`apps/web/playwright.config.ts`; DECISIONS: "WebKit is not required"). Nothing has ever run in Safari's engine, which is what the iPhone PWA actually uses.
- **Never run in Firefox.** That covers both the web app and the Firefox extension, which was only built and unit-tested.
- **Never run against the official Supabase bundle.** Tests use the slim `dev/supabase` stack. The owner's production runs the official self-hosted bundle (Envoy gateway, Supavisor pooler, official Realtime).
- **SPEC §12 performance targets (LCP, INP, frame rate) were never measured.**
- **Push delivery was never observed** beyond the send path.

### Setup
1. **Use the existing dev stack:** `pnpm stack:up` starts `dev/supabase/docker-compose.yml` (gateway on `127.0.0.1:54321`, Postgres on `127.0.0.1:54322`, dev keys in `dev/supabase/dev.env`). The e2e suite already expects it (`apps/web/e2e/global-setup.ts`) and serves the standalone build on port 3100 with its own data dir. Keep that setup; extend it, don't replace it. `pnpm stack:down` wipes the dev volumes; that's fine for the dev stack only.
   - **Second target, the official bundle:** also bring up the official Supabase local stack with the Supabase CLI (`supabase start`, which uses the official images) on non-conflicting ports, and run a smoke subset of e2e against it: setup wizard, PIN login, a task create/complete with Realtime sync between two tabs, a focus start with extension sync. Record any behaviour that differs from the dev stack as findings, since that's what production runs. If the CLI can't run, record it and continue.
   - Never point anything at the owner's production Supabase.
2. Run the web app locally against it, go through the setup wizard with a test PIN, and seed realistic data with a dev-only script `scripts/seed-polish.ts`:
   - ~150 tasks across Overdue/Today/upcoming/undated, incl. long names, emoji, multi-line descriptions
   - 8 task lists, 6 goal lists with mixed todo/progress goals (incl. 0%, partial, 100%, over-100% input attempts)
   - 6 routines covering every frequency, with logs spanning 90 days incl. streak breaks
   - 60 days of focus sessions, 3 block lists with ~20 sites
   - enough completed history to reach Era III, so the universe is dense
3. Build the extension for Chrome and Firefox, pointed at the local instance.
4. **Playwright projects:** keep the existing `desktop`, `iphone-15-pro` and `iphone-se` (Chromium) projects so nothing regresses. Add:
   - **`webkit-iphone-15-pro`**, **`webkit-iphone-se`** and **`webkit-iphone-15-pro-landscape`** (`browserName: "webkit"` with the iPhone descriptors). WebKit with iPhone emulation is the closest automated proxy for iOS Safari: treat these as the **primary mobile target**. Every e2e spec must pass on them.
   - **`firefox-desktop`** (1280×800).
   - Update DECISIONS.md: WebKit is now required.
5. **Firefox extension:** load the built Firefox package into a real Firefox (e.g. `web-ext run` or a Firefox profile driven by Playwright/Selenium, whichever works), and run the extension flows (connect, block during focus, block page, popup controls) against the local stack. If Firefox automation of extensions isn't possible here, record exactly what was and wasn't verified and mark the flows **Needs device check**.
6. If Docker is unavailable, record that in `docs/polish/PROGRESS.md` and continue with everything that doesn't need a live backend (static audit, unit tests, component tests with mocked data). Do not stop.

---

## 2. Phase 1 — Audit (find everything before fixing anything)

Write all findings to **`docs/polish/AUDIT.md`**, one entry per issue:

```
### P1-014 · Tasks · iPhone PWA
**What:** Completing a task then quickly completing a second one reverts the first.
**Repro:** 1) Today tab 2) tap two checkboxes within 300 ms
**Expected:** both stay complete · **Actual:** first one un-completes after ~1 s
**Cause (if known):** optimistic update overwritten by stale realtime echo
**Evidence:** docs/polish/shots/P1-014.png
```

Severity scale:
- **P0:** crash, data loss/corruption, security problem, can't complete a core flow
- **P1:** a feature is broken or wrong
- **P2:** friction: works, but feels slow, janky, confusing or un-native
- **P3:** cosmetic

### 2.1 Automated sweep
- `typecheck`, `lint`, all tests. Treat warnings as findings.
- Run every e2e flow with listeners that log any **console error/warning, unhandled rejection, failed network request (4xx/5xx), React key/hydration warning, or layout shift (CLS > 0.02)** as a finding.
- axe-core accessibility scan of every screen, plus every sheet and dialog opened.
- Lighthouse (mobile) for the main routes: record perf, PWA installability, a11y.
- Bundle analysis: confirm the universe/Three.js code is only in the lazy chunk, and record route JS sizes.
- **Memory:** a 30-minute scripted session navigating all tabs and triggering events. Record heap growth, detached nodes, and WebGL resources not disposed (geometries, materials, textures, render targets).

### 2.2 Scripted adversarial pass (write these as Playwright tests; keep the useful ones)
- **Rapid input:** double/triple taps on every button, rapid check/uncheck, double-submit of every form, holding Enter in quick-add.
- **Concurrency:** two tabs plus the extension at once. Edit the same task in both. Delete something that's open in the other tab. Start/pause/skip the timer from all three within 1 s and verify a single consistent state and correct `version` handling.
- **Network:** offline → make 20 changes → online; check outbox order, no duplicates, no lost edits. Slow 3G throttling, a request timing out mid-mutation, Supabase Realtime disconnecting and reconnecting.
- **Time:** midnight rollover while the app is open (Today/Overdue, routine day, Day progress bar), DST transitions, timezone setting ≠ device timezone, week-start setting, a focus phase ending while the tab is hidden or the device "sleeps" (page lifecycle freeze/resume), clock skew of ±2 min.
- **Data edges:** 0, negative, decimal, huge and non-numeric amounts in progress goals and steppers. 500-char names, RTL text, emoji-only names, empty lists, 1000 tasks. Routine edits that change frequency/type (rewrite semantics, SPEC §5.3). Deleting a list with tasks.
- **Auth:** session expiry mid-use, refresh token revoked, PIN lockout escalation, lock-screen timeout, `RESET_PIN`.
- **PWA lifecycle:** cold start, reload on every route, back/forward, the app being killed and relaunched (simulate by closing the page and reopening the start URL), service worker update while the app is open.
- **Extension:** connect flow errors (wrong URL, wrong PIN, instance down), already-open tabs get redirected when focus starts, the browser restarts mid-focus, offline mid-focus, block page countdown accuracy, badge accuracy, Firefox parity.

### 2.3 Native-feel audit (iPhone WebKit projects)
For each item in §4, record whether it's met and how far off it is. Back it with recordings (Playwright video) and screenshots.

**Stop after the audit and commit it** (`polish: audit`), then continue.

---

## 3. Phase 2 — Fix P0 and P1
All of them, each with a regression test. Commit in logical groups.

---

## 4. Phase 3 — Native-feel PWA polish

Make each of these true on the iPhone WebKit projects, and verify on desktop that nothing regressed.

### 4.1 Touch & feedback
- Every tappable element shows pressed feedback on **pointerdown within one frame** (scale 0.97 and/or a fill change), not on click.
- `-webkit-tap-highlight-color: transparent`; `touch-action: manipulation` on the app shell. No 300 ms delay anywhere.
- `-webkit-touch-callout: none` and `user-select: none` on UI chrome (buttons, tabs, rows, cards, nav). Keep selection in inputs, descriptions, quotes and other real content.
- Long-press never triggers the browser's text selection or link callout on UI. Long-press is reserved for our own actions (reorder, context actions).
- Touch targets ≥ 44×44 everywhere; audit and fix any smaller ones.
- **Haptics:** research what current iOS Safari actually exposes for haptic feedback (for example, whether the native `switch` checkbox control produces system haptics in home-screen web apps). Use any legitimate path you find for toggles/completions, and use the Vibration API where supported (Android). Document what works in `DECISIONS.md`. Do not fake it.

### 4.2 Gestures
- **Edge swipe back:** on pushed screens (list detail, task detail, settings subpages), a swipe from the left edge (~20 px) drags the page interactively, with the previous screen parallaxing underneath. Releasing past ~35% or with velocity completes the back navigation; otherwise it springs back. Make sure it doesn't fight the iOS system gesture in standalone mode.
- **Sheets:** draggable with detents (medium/large), velocity-aware fling, rubber-banding past the limits, and drag-to-dismiss that hands off correctly to the sheet's inner scroll (drag down at scrollTop 0 = dismiss; otherwise scroll).
- **Swipe actions on rows:** finger-tracking, rubber-band resistance, a full swipe commits, and a spring back on cancel. Only one row is open at a time; scrolling closes open rows.
- All gesture animations are **interruptible**: grabbing mid-animation takes over from the current position, never jumps.

### 4.3 Scrolling & navigation
- Native momentum scrolling only, no JS scroll hijacking. `overscroll-behavior: contain` on inner scrollers; no scroll chaining into the shell; no double scrollbars.
- iOS large-title behaviour on top-level pages: the large title collapses into a compact glass nav bar as you scroll.
- **Tab state is preserved:** switching tabs keeps each tab's scroll position, open segment and filters (keep-alive), and is instant with no refetch flash. Re-tapping the active tab scrolls to top, then pops to that tab's root.
- Route transitions: push/pop slide and cross-fade via the View Transitions API where WebKit supports it, with a graceful fallback. Tab switches have no slide.
- No full page reloads during in-app navigation, ever. Prefetch likely next routes.

### 4.4 Keyboard & forms
- Use `visualViewport` so the quick-add bar and sheets sit directly above the keyboard. No page jump, no content hidden behind the keyboard, no leftover gap after it closes.
- Inputs ≥ 16 px (no zoom). Correct `inputmode`, `enterkeyhint`, `autocapitalize`, `autocomplete="off"` where appropriate. Number fields use a decimal keypad.
- Enter in quick-add submits and keeps focus for rapid entry. Scrolling a list dismisses the keyboard.
- Focus moves correctly when sheets open/close; there are no focus traps.

### 4.5 Launch, resume & state restoration
- No white flash at any point: set the `html`/`body` background, manifest `background_color` and splash screens to `#070615`.
- The first frame shows the real app shell with cached data (from the persisted query cache), never a blank page or spinner. Use skeletons only for data that is genuinely uncached.
- When iOS kills and relaunches the PWA, restore the last route, tab, scroll position, open sheet and any unsaved draft text (quick-add, descriptions) from storage.
- When resuming from background: silently refresh data, reconcile the timer from `phase_ends_at`, and never show stale "Overdue" or day state after midnight passed while the app was backgrounded.

### 4.6 Smoothness
- Animate only `transform` and `opacity`. Remove layout-thrashing reads/writes and expensive `backdrop-filter` stacking during scroll (cap blur layers, promote layers carefully).
- **The universe yields to interaction:** pause or drop the render rate while the user is scrolling, dragging, typing or a sheet is animating, and resume afterwards. Use `requestAnimationFrame` cadence and never block input.
- Target: no long tasks > 50 ms during navigation, scrolling or completing tasks. Record INP and frame timings before and after (Playwright trace / Performance API) in `docs/polish/PERF.md`.
- Cosmic events never drop a frame of UI interaction; measure this while completing 10 tasks rapidly.

### 4.7 Visual consistency
- Re-verify safe areas on all iPhone projects (portrait and landscape) after every gesture/sheet change.
- Respect iOS text-size settings where feasible (`-apple-system-body` / rem-based scale), without breaking layouts.
- Every screen and sheet has designed **loading, empty, error and offline** states, matching SPEC §6 voice.
- Long text truncates gracefully (ellipsis or line-clamp), no overflow, consistent spacing from tokens only, and no hard-coded colours outside `ui-tokens`.

### 4.8 Desktop web & extension
- Desktop: hover states, visible keyboard focus everywhere, ⌘K and every shortcut working, drag-to-reorder with mouse and keyboard, right-click context menus on rows/cards where natural.
- Extension popup: opens instantly with the last known state (no loading flash), and its controls reflect changes made elsewhere within 1 s.
- Block page: the countdown never drifts by more than 1 s, and the "Focus complete" handoff works.

---

## 5. Phase 4 — Fix P2 and P3
Everything left in `AUDIT.md`. Anything you deliberately won't fix gets an entry explaining why (for example, a platform limitation).

---

## 6. Phase 5 — Verify & hand off

1. Full test matrix green: typecheck, lint, unit, e2e on every Playwright project (existing Chromium ones + the new WebKit and Firefox ones), `docker build .` succeeds.
2. Re-run the Phase 1 automated sweep. It must produce **zero console errors**, zero failed requests in normal flows and zero axe violations of serious/critical level, and show no memory growth trend over 30 minutes.
3. `docs/polish/PERF.md`: before/after table (route JS sizes, Lighthouse scores, INP, long tasks, frame timings, memory).
4. `docs/polish/AUDIT.md`: every entry marked **Fixed** (with commit hash), **Won't fix** (with reason), or **Needs device check** (anything only a real iPhone can confirm).
5. `docs/polish/IPHONE_CHECKLIST.md`: a short, ordered manual test script (about 20 minutes) for the owner to run on their real iPhone (home-screen PWA) and in Chrome/Firefox with the extension. Cover every "Needs device check" item and every native-feel item in §4, with what "good" looks like for each.
6. `docs/polish/PROGRESS.md`: final summary of what changed, by area.

Commit, then push the branch `polish/pass-1`. Do **not** merge it.
