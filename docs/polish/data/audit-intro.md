Written in Phase 1 of `docs/polish/POLISH_SPEC.md`, before any product code changed. Statuses are updated as the pass goes on.

**How the findings were produced**

- **Automated sweep (§2.1).** `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` are clean with no warnings. The whole e2e suite ran on seven Playwright projects (three Chromium, three WebKit iPhone, Firefox) with listeners for console errors and warnings, uncaught errors, failed and 4xx/5xx requests and layout shift; the aggregated log is `docs/polish/data/sweep-baseline.txt`. axe-core, overflow, touch-target and native-feel facts for every screen and sheet are in `docs/polish/data/scan-*.json`. Measurements are in `docs/polish/PERF.md`.
- **Scripted adversarial pass (§2.2).** `apps/web/e2e/audit/adversarial.spec.ts` (run with `AUDIT=1`). A failing test there is a finding; each becomes the regression test for its fix.
- **Code review.** Four independent read-throughs (client data and sync layer, UI components, server and SQL, extension and universe). These entries say "code review" in their evidence with a confidence; the ones reproduced in a browser say so and name the test. Code-review entries that have not been reproduced are still listed, because the brief was to assume bugs exist; any that turn out not to be real are closed as "Won't fix (not reproducible)" with the reason.
- **Native-feel audit (§2.3).** One entry per POLISH_SPEC §4 requirement that is not met or only partly met, with where and by how much.
- **Official Supabase bundle.** The smoke subset (setup wizard, PIN, shell, tasks with Realtime between two tabs, focus, extension) passes against the official CLI stack (Kong, official Realtime and Postgres images). No behaviour differed from the dev stack. The Supavisor pooler in transaction mode is not part of the CLI stack's default path, so the pooler finding stays a code-review entry.

**Baseline e2e before any change:** desktop 62/62 · iphone-15-pro 42/42 · iphone-se 42/42 (Chromium) · webkit-iphone-15-pro 40 passed, 2 failed · webkit-iphone-se 40 passed, 2 failed · webkit-iphone-15-pro-landscape 32 passed, 11 failed · firefox-desktop 37 passed, 5 failed.

Ids are stable; the prefix is the current severity. Entries are generated from `docs/polish/data/*.json` by `node scripts/polish/build-audit.mjs`.
