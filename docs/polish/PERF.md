# Performance and smoothness — polish pass 1

Measured on the production standalone build against the local stack with the seed data (`scripts/seed-polish.mts`). **Before** = `4edf013` (no product change). **After** is filled in as phases land.

How to reproduce: `AUDIT=1 PERF_LABEL=before|after pnpm --filter @stellar/web exec playwright test e2e/audit/perf.spec.ts --project=iphone-15-pro --project=desktop`, `node scripts/polish/lighthouse.mjs before|after`, `pnpm budgets`, then `node scripts/polish/build-perf.mjs`.

Caveats: these are Chromium numbers with the main thread throttled 4× as a phone proxy; headless Chromium renders WebGL in software (SwiftShader), so the Balanced tier figures overstate GPU cost and Cinematic was not measured. Real-device smoothness is on `IPHONE_CHECKLIST.md`.

## Route JavaScript (gzip, initial scripts; three.js must stay in the lazy chunk)

| Route | Before | After | Limit |
|---|---|---|---|
| `/` | 199.2 KB | — | 200 KB |
| `/tasks` | 224.3 KB | — | 230 KB |
| `/goals` | 218.6 KB | — | 230 KB |
| `/routines` | 203.5 KB | — | 230 KB |
| `/focus` | 222.4 KB | — | 230 KB |
| `/settings` | 201.1 KB | — | 230 KB |
| `/lock` | 153.2 KB | — | 200 KB |
| `/setup` | 166 KB | — | 200 KB |

three.js in initial scripts: no.

## Lighthouse (mobile emulation, 4× CPU, slow 4G, signed in)

| Route | Perf | A11y | LCP | TBT | CLS |
|---|---|---|---|---|---|
| `/` | 73 → — | 95 → — | 0.8 s → — | 1712 ms → — | 0.045 → — |
| `/tasks` | 54 → — | 96 → — | 7.5 s → — | 1010 ms → — | 0.035 → — |
| `/goals` | 64 → — | 96 → — | 3.6 s → — | 1500 ms → — | 0 → — |
| `/routines` | 81 → — | 96 → — | 0.8 s → — | 813 ms → — | 0.019 → — |
| `/focus` | 47 → — | 96 → — | 7.5 s → — | 2075 ms → — | 0.005 → — |
| `/settings` | 25 → — | 97 → — | 7.4 s → — | 1677 ms → — | 0.839 → — |
| `/lock` | not measurable before (nothing painted for Lighthouse) → — | — | — | — | — |

Installability is no longer a Lighthouse audit; the manifest, icons, service worker and offline start are asserted in `e2e/09-pwa.spec.ts`.

## Interaction timings · iphone-15-pro · minimal tier (CPU 4×)

Each cell is before → after.

| Scenario | Long tasks (>50 ms) | Longest task | Slowest interaction (INP-style) | Frame p95 | Worst frame | Frames >33 ms |
|---|---|---|---|---|---|---|
| Home idle, 3 s | 0 → — | 0 ms → — | 0 ms → — | 16.8 ms → — | 16.8 ms → — | 0/198 → — |
| Six tab switches | 1 → — | 144 ms → — | 32 ms → — | 16.8 ms → — | 166.7 ms → — | 3/187 → — |
| Complete 10 tasks rapidly (events playing) | 0 → — | 0 ms → — | 40 ms → — | 16.7 ms → — | 33.3 ms → — | 0/303 → — |
| Scroll All | 0 → — | 0 ms → — | 0 ms → — | 16.8 ms → — | 33.3 ms → — | 0/145 → — |
| Open and close task sheet | 1 → — | 80 ms → — | 56 ms → — | 16.8 ms → — | 66.7 ms → — | 2/100 → — |
| Type in quick add | 0 → — | 0 ms → — | 32 ms → — | 16.8 ms → — | 16.8 ms → — | 0/84 → — |
| Scroll All with 1,000 extra tasks | 0 → — | 0 ms → — | 0 ms → — | 33.3 ms → — | 33.4 ms → — | 3/114 → — |

1,000 extra tasks: time to show All 13655 ms → —; DOM nodes 16634 → —.

## Interaction timings · iphone-15-pro · balanced tier (CPU 4×)

Each cell is before → after.

| Scenario | Long tasks (>50 ms) | Longest task | Slowest interaction (INP-style) | Frame p95 | Worst frame | Frames >33 ms |
|---|---|---|---|---|---|---|
| Home idle, 3 s | 0 → — | 0 ms → — | 0 ms → — | 16.8 ms → — | 33.4 ms → — | 1/194 → — |
| Six tab switches | 1 → — | 78 ms → — | 48 ms → — | 16.8 ms → — | 116.7 ms → — | 1/191 → — |
| Complete 10 tasks rapidly (events playing) | 0 → — | 0 ms → — | 88 ms → — | 16.8 ms → — | 50 ms → — | 1/295 → — |
| Scroll All | 2 → — | 52 ms → — | 0 ms → — | 33.3 ms → — | 66.7 ms → — | 2/143 → — |
| Open and close task sheet | 2 → — | 89 ms → — | 112 ms → — | 33.4 ms → — | 83.4 ms → — | 6/93 → — |
| Type in quick add | 0 → — | 0 ms → — | 40 ms → — | 16.7 ms → — | 16.8 ms → — | 0/85 → — |
| Scroll All with 1,000 extra tasks | 3 → — | 78 ms → — | 0 ms → — | 50 ms → — | 100 ms → — | 9/115 → — |

1,000 extra tasks: time to show All 1152 ms → —; DOM nodes 5235 → —.

## Interaction timings · desktop · minimal tier (CPU 4×)

Each cell is before → after.

| Scenario | Long tasks (>50 ms) | Longest task | Slowest interaction (INP-style) | Frame p95 | Worst frame | Frames >33 ms |
|---|---|---|---|---|---|---|
| Home idle, 3 s | 0 → — | 0 ms → — | 0 ms → — | 16.7 ms → — | 33.4 ms → — | 1/198 → — |
| Six tab switches | 3 → — | 208 ms → — | 80 ms → — | 16.8 ms → — | 233.4 ms → — | 4/192 → — |
| Complete 10 tasks rapidly (events playing) | 1 → — | 88 ms → — | 56 ms → — | 16.8 ms → — | 66.7 ms → — | 2/292 → — |
| Scroll All | 0 → — | 0 ms → — | 0 ms → — | 16.7 ms → — | 33.3 ms → — | 0/144 → — |
| Open and close task sheet | 1 → — | 98 ms → — | 64 ms → — | 16.8 ms → — | 133.4 ms → — | 1/98 → — |
| Type in quick add | 0 → — | 0 ms → — | 56 ms → — | 16.8 ms → — | 33.3 ms → — | 0/92 → — |
| Scroll All with 1,000 extra tasks | 1 → — | 89 ms → — | 0 ms → — | 33.4 ms → — | 83.3 ms → — | 8/120 → — |

1,000 extra tasks: time to show All never shown: the reload kept the cached list → —; DOM nodes 10320 → —.

## Interaction timings · desktop · balanced tier (CPU 4×)

Each cell is before → after.

| Scenario | Long tasks (>50 ms) | Longest task | Slowest interaction (INP-style) | Frame p95 | Worst frame | Frames >33 ms |
|---|---|---|---|---|---|---|
| Home idle, 3 s | 2 → — | 62 ms → — | 0 ms → — | 33.4 ms → — | 49.9 ms → — | 7/172 → — |
| Six tab switches | 21 → — | 162 ms → — | 168 ms → — | 100 ms → — | 233.3 ms → — | 29/103 → — |
| Complete 10 tasks rapidly (events playing) | 40 → — | 137 ms → — | 200 ms → — | 100 ms → — | 150 ms → — | 71/131 → — |
| Scroll All | 11 → — | 87 ms → — | 0 ms → — | 66.6 ms → — | 133.3 ms → — | 31/122 → — |
| Open and close task sheet | 7 → — | 228 ms → — | 168 ms → — | 116.7 ms → — | 249.9 ms → — | 16/53 → — |
| Type in quick add | 1 → — | 100 ms → — | 144 ms → — | 50 ms → — | 100.1 ms → — | 10/74 → — |
| Scroll All with 1,000 extra tasks | 17 → — | 694 ms → — | 0 ms → — | 116.7 ms → — | 783.3 ms → — | 34/98 → — |

1,000 extra tasks: time to show All 810 ms → —; DOM nodes 1647 → —.

## Memory, 30-minute scripted session (before)

All tabs visited in a loop; each round adds and completes a task, opens a sheet, steps a goal and every other round starts and ends a focus phase. Heap after forced GC.

| Minute | Rounds | JS heap | DOM nodes | Event listeners |
|---|---|---|---|---|
| 0 | — | 8.9 MB | 300 | 409 |
| 1.1 | 8 | 13.2 MB | 323 | 588 |
| 5.1 | 36 | 13.7 MB | 323 | 588 |
| 10.2 | 72 | 14.4 MB | 323 | 588 |
| 14.7 | 104 | 14.8 MB | 323 | 588 |
| 19.8 | 140 | 15 MB | 323 | 588 |
| 24.8 | 176 | 15.1 MB | 323 | 588 |
| 30 | 214 | 15.2 MB | 323 | 588 |

Trend over the last 10 minutes: 0.2 MB (74 rounds, each of which adds a task to the cache). Detached-node proxy: DOM node count 323 → 323; listeners 588 → 588.

## Notes

- **WebGL resources.** The scene exposes no renderer statistics at baseline, so geometry/texture counts could not be sampled during the memory run; the undisposed-texture and rebuild findings in AUDIT.md come from code review. Phase 3 adds a read-only counter to `window.__stellarUniverse` and the after-run records it.
- **SPEC §12 targets vs baseline.** First contentful paint is about 0.78 s under Lighthouse's slow-4G profile, but LCP waits for data-bound content (up to 7.5 s) and the main thread is blocked for 0.8–2.1 s during start-up. Those are the numbers Phase 3 §4.5/§4.6 has to move.

