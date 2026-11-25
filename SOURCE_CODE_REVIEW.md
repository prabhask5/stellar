# Stellar Focus: building from source (for add-on reviewers)

This archive is the complete source of the **Stellar Focus** browser extension. The
extension is one app in a pnpm workspace; the archive holds that app, the three workspace
packages it imports, and the lockfile. Nothing is fetched at build time except the npm
packages pinned in `pnpm-lock.yaml`.

## What is here

| Path                                                      | What it is                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/extension/`                                         | The extension: popup, block page, background script, manifest (`wxt.config.ts`) |
| `packages/shared/`                                        | Shared TypeScript: the timer state machine, date helpers, site normalisation    |
| `packages/db/`                                            | Generated TypeScript types of the database tables (types only at build time)    |
| `packages/ui-tokens/`                                     | Design tokens as CSS variables                                                  |
| `pnpm-lock.yaml`                                          | Exact versions of every dependency                                              |
| `apps/web/package.json`, `packages/universe/package.json` | Present only so the lockfile matches the workspace; not part of the extension   |

## Requirements

- Node.js 22 or newer (built and tested with Node 24).
- pnpm 12.21.0, the version named in `package.json` → `packageManager`. Node ships with
  Corepack, which downloads exactly that version; nothing else needs installing.
- Any OS. No commercial or web-based tools are used. The bundler is
  [WXT](https://wxt.dev) (open source, built on Vite), with its own minifier.

## Build

From the root of the extracted archive:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @stellar/extension exec wxt build -b firefox --mv3
```

The built add-on is in `apps/extension/.output/firefox-mv3/`. Its files are identical to
the contents of the submitted package.

To produce the zip itself instead of the folder:

```bash
corepack pnpm --filter @stellar/extension exec wxt zip -b firefox --mv3
# → apps/extension/.output/stellar-focus-<version>-firefox.zip
```

## Notes

- There is no obfuscation. The output is bundled and minified by Vite; source maps are not shipped.
- The extension runs no remote code. Every script it executes is in the package.
- `@supabase/supabase-js` is the one sizeable third-party library in the bundle; it is
  the client for the user's own database and realtime connection.
