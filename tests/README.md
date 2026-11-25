# Tests

Every test in the repository lives here. CI fails if a `*.test.*` or `*.spec.*` file exists anywhere else.

```
tests/
  vitest.config.ts       Vitest projects: unit, db
  playwright.config.ts   Playwright projects (browsers and devices)
  tsconfig.json          typechecks every test file; defines the import aliases
  support/               shared helpers: seed.ts, paths.ts, the screenshots tool
  unit/                  no services needed
    shared/  universe/  ui-tokens/  web/  extension/
  db/                    SQL behaviour, migrations, TypeScript ↔ SQL parity
    support/
  e2e/                   Playwright, one spec per feature
    support/             helpers, invariants, global setup, standalone server
  extension-firefox/     the extension in a real Firefox (Selenium + geckodriver)
```

## Running

| Command                           | Needs                                              | What runs                               |
| --------------------------------- | -------------------------------------------------- | --------------------------------------- |
| `pnpm test`                       | nothing                                            | `unit/**/*.test.ts`                     |
| `pnpm test:db`                    | `pnpm stack:up`                                    | `db/**/*.test.ts`                       |
| `pnpm test:e2e`                   | `pnpm stack:up`, `pnpm build`, Playwright browsers | every spec in every project             |
| `pnpm test:e2e --project=desktop` | same                                               | one project (any Playwright flag works) |
| `pnpm test:firefox`               | `pnpm stack:up`, `pnpm build`, Firefox             | `extension-firefox/smoke.mjs`           |
| `pnpm test:all`                   | all of the above                                   | everything                              |

Install the browsers once with `pnpm exec playwright install chromium webkit firefox`.

- **Unit and db** use Vitest. Pass a path or `-t` to narrow a run: `pnpm test tests/unit/shared/timer.test.ts`. Locally the db suites are skipped when no database is reachable; in CI that is an error.
- **e2e** starts the production standalone build itself (`e2e/support/serve-standalone.mjs`, port 3100) with its own data directory (`e2e/.tmp/data`), resets the instance before the run, and drives it against the local stack. Specs do not depend on each other or on their order. Tests run one at a time because they share one database.
- **The Firefox smoke test** starts its own server on port 3101, sets the instance up, seeds it and then drives the packaged add-on. `HEADED=1` shows the browser.

Environment knobs for e2e: `E2E_PORT`, `E2E_DATA_DIR` (relative to `tests/e2e`), `E2E_STACK_ENV` (another stack's env file, see [dev/README.md](../dev/README.md)), `E2E_DEV=1` (run against `next dev` instead of the build).

## Adding a test

Create a file in the right folder; it is picked up by its name. Nothing else needs editing, in the configs or in CI.

- Pure logic: `unit/<package or app>/<name>.test.ts`.
- Anything that needs Postgres: `db/<name>.test.ts`, using `db/support/helpers.ts` (`open`, `createUser`, `asUser`). Wrap the suite in `describe.skipIf(!available)`.
- A user flow: `e2e/<feature>.spec.ts`. Import `test` and `expect` from `./support/helpers`, not from Playwright: that `test` gives each test its own client address, simulates safe areas for the project, and checks the screen-wide invariants (`support/invariants.ts`) when the test ends. Start with `ensureConfigured(request)` in `beforeAll` and `wipeData()` + `signIn(context)` in `beforeEach`.
- A new browser or device: add a project to `playwright.config.ts`. CI reads the project list from that file.

`.only` fails the run in Vitest always and in Playwright on CI.

## Imports

Tests import the code under test through aliases, never through `../../..` chains:

| Import                        | Resolves to                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `@stellar/<package>`          | the package's entry, exactly as the apps import it                  |
| `@stellar/<package>/<module>` | `packages/<package>/src/<module>.ts` (the package's own export map) |
| `@web/<path>`                 | `apps/web/<path>`                                                   |
| `@extension/<path>`           | `apps/extension/<path>`                                             |

The `@stellar/*` packages are dev dependencies of the root package, so they resolve like any dependency. `@web/*` and `@extension/*` are `paths` in `tsconfig.json`; Vitest reads them from there (`resolve.tsconfigPaths`) and so does Playwright. Files on disk are located with `fromRoot()` from `support/paths.ts`.

## Other tools here

- `pnpm dev:seed` (`support/seed.ts`) fills the local instance with a realistic data set. It is also used by `e2e/screens.spec.ts` and the Firefox smoke test, and refuses any database that is not on this machine.
- `pnpm screenshots` (`support/screenshots.ts`) regenerates the README images from demo mode into `.github/assets/screenshots/`, and the extension's store images into `tests/.tmp/store/` (git-ignored). It is not a test and never runs in CI.
