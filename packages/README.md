# Packages

Four internal workspace packages. Each exports its TypeScript source directly (`exports` → `./src/*.ts`); Next.js and WXT transpile them, so there is no build step and an edit shows up at once. Their tests are in [`tests/unit`](../tests/unit) and [`tests/db`](../tests/db).

## `shared`

Pure TypeScript with one dependency (zod): dates in the owner's time zone, routine recurrence and streaks, the focus timer state machine, goal and routine progress, task views, fractional ranks, site and URL normalisation, the zod schemas for every API boundary, and the OpenAPI document built from them.

- **Used by** the web app (client and server), the extension, `universe`, and the tests.
- **Why separate:** it is the single source of logic for the web app and the extension, so both make the same decision from the same state (for example, whether a site is blocked right now). It is also the TypeScript twin of the SQL functions; `fixtures.ts` holds the cases both sides are tested against.

## `db`

The SQL migrations (`migrations/`), the runner that applies them, `bundle.generated.ts` (the same SQL embedded as a module, so the standalone server needs no files at runtime) and `types.ts` (table types generated from a migrated database).

- **Used by** the web app's server (setup wizard, migrations on boot), both apps for row types, and the tests.
- **Why separate:** these are the migrations production applies. Keeping them apart from application code makes the rule visible: a migration that has shipped is never edited, only followed by a new one. After adding one, run `pnpm --filter @stellar/db bundle`.

## `ui-tokens`

`tokens.json` (colours, type ramp, spacing, radii, motion, layout) and the generator that turns it into `css/tokens.css` (CSS variables) and `css/theme.css` (Tailwind theme). The CSS is committed; `pnpm tokens` regenerates it.

- **Used by** the web app, the extension (popup and block page) and `universe` (scene colours).
- **Why separate:** one design source for both apps, so the extension cannot drift from the app.

## `universe`

The 3D universe (three.js through React Three Fiber), the 2D overlay that draws cosmic events, the event bus and director, the deterministic layout, and quality-tier selection.

- **Used by** the web app only.
- **Why separate:** it keeps three.js out of the initial JavaScript. The app imports the light parts (`bus`, `store`, `quality`) statically and loads `@stellar/universe/canvas` with a dynamic `import()` when the browser is idle; `pnpm budgets` fails if three.js reaches a page's initial scripts.
