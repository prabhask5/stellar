# Stellar Planner

A self-hosted personal planner where finishing things builds a universe. Tasks, long-term goals, daily routines and a focus timer, in one calm, fast app that you run yourself on top of your own Supabase.

- **Web app and PWA.** Built iPhone-first: installable to the Home Screen, aware of the Dynamic Island, notch and home indicator, usable offline, with push notifications when a focus phase ends.
- **Browser extension** for Chrome and Firefox. The same timer in your toolbar, kept in sync in real time, and hard blocking of the sites you choose while a focus phase runs.
- **One owner, one PIN.** No accounts to manage. Your data lives in your Postgres, protected by row-level security.
- **REST API** with an OpenAPI description, ready for a native iOS app.

## Run it

You need Docker and a Supabase instance (self-hosted or cloud). No environment variables are required.

```bash
docker compose up -d --build
# open http://localhost:3000
```

The setup wizard asks for your Supabase URL and keys, creates the `sp_` tables, and has you choose a PIN. Everything it needs to remember is stored, encrypted, in the `/data` volume.

- Deploying on a server: [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)
- Deploying with Dokploy: [docs/DOKPLOY.md](docs/DOKPLOY.md)
- Installing the extension: [docs/EXTENSION.md](docs/EXTENSION.md)
- API: [docs/API.md](docs/API.md), [docs/openapi.json](docs/openapi.json)
- Building the iOS app: [docs/IOS_INTEGRATION.md](docs/IOS_INTEGRATION.md)

## What's inside

```
apps/web          Next.js app: UI, PWA service worker, setup wizard, /api/v1
apps/extension    WXT (Manifest V3) extension for Chrome and Firefox
packages/db       SQL migrations (idempotent, sp_ prefixed), migration runner, generated types
packages/shared   Dates, recurrence, timer state machine, zod schemas, OpenAPI builder
packages/ui-tokens  Design tokens → CSS variables, Tailwind theme, SwiftUI file
packages/universe The 3D universe (three.js), 2D event overlay, cosmic event bus
dev/supabase      A small Supabase-compatible stack for local development and tests
docs              Guides, decisions, progress, API description, design mockups
```

How it fits together:

- **Rules live in Postgres.** Recurrence, streaks and the focus timer's state machine are SQL functions and triggers, so the web app, the extension and any future client always agree. `packages/shared` mirrors them in TypeScript for instant optimistic UI, and parity tests run both against the same fixtures.
- **The browser talks to Supabase directly** for data and Realtime with a short-lived token. The refresh token never reaches page JavaScript: it stays in httpOnly cookies and is exchanged by the server.
- **Optimistic and offline.** Every change is applied locally at once and sent from an ordered outbox stored in IndexedDB, which survives reloads and loss of connectivity.
- **The universe** is a lazily loaded three.js scene behind every page. Completing things adds stars, planets and events; nothing in it blocks the interface.

## Development

Requirements: Node 22 or newer, Corepack (for pnpm), Docker.

```bash
corepack enable
pnpm install
pnpm stack:up        # local Postgres, auth, REST, Realtime on :54321 (keys in dev/supabase/dev.env)
pnpm dev             # http://localhost:3000, then run through /setup with those keys
```

| Command                                      | What it does                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Types, ESLint, unit and SQL tests (SQL tests need `pnpm stack:up`)                    |
| `pnpm build`                                 | Builds the extension for both browsers, zips it, then builds the web app              |
| `pnpm e2e`                                   | Playwright against the production build: desktop, iPhone 15 Pro, iPhone SE            |
| `pnpm budgets`                               | Checks the initial-JavaScript budget after a build                                    |
| `pnpm tokens`                                | Regenerates CSS, Tailwind theme and `docs/ios/StellarTokens.swift` from `tokens.json` |
| `pnpm openapi`                               | Regenerates `docs/openapi.json` from the zod schemas                                  |
| `pnpm stack:down`                            | Stops the local stack and deletes its data                                            |

After changing a migration in `packages/db/migrations`, run `node packages/db/scripts/bundle.ts` so the wizard ships the new SQL. Migrations must stay idempotent: they are re-run on every upgrade.

`docs/DECISIONS.md` records the non-obvious choices made while building, and `docs/PROGRESS.md` the plan and what was verified.
