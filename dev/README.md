# Local Supabase stacks

Stellar Planner needs a Supabase to talk to. These two stacks are for development and tests only. **Their keys are public, dev-only values: never point them at production data, and never reuse them.**

## `supabase/`: the lean stack (default)

Postgres 15, GoTrue (auth), PostgREST, Realtime and pg-meta behind one nginx gateway. Same APIs as the full Supabase distribution at a fraction of the disk and start-up time. Tests and day-to-day development use it.

| What     | Where                                                   |
| -------- | ------------------------------------------------------- |
| API      | `http://127.0.0.1:54321`                                |
| Postgres | `postgres://postgres:postgres@127.0.0.1:54322/postgres` |
| Keys     | [`supabase/dev.env`](supabase/dev.env)                  |

```bash
pnpm stack:up      # build and start, waits until healthy
pnpm stack:down    # stop and delete its data
```

Use the values in `dev.env` in the setup wizard when running `pnpm dev`.

## `supabase-official/`: the official images

A Supabase CLI project that runs the official Kong, GoTrue, PostgREST, Realtime and Postgres images, which is what a production self-hosted Supabase runs. Use it to smoke-test against the real thing before a release; it is not part of CI. It listens on ports 553xx, so both stacks can run side by side, and needs about 6 GB of disk for the images.

```bash
cd dev/supabase-official
npx supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,mailpit
./write-env.sh                      # writes official.env (git-ignored) from `supabase status`
cd ../..
E2E_STACK_ENV=dev/supabase-official/official.env E2E_DATA_DIR=.tmp/data-official E2E_PORT=3200 \
  pnpm test:e2e --project=desktop -g "full flow|signed-out visitors|two devices|connects with URL"
(cd dev/supabase-official && npx supabase stop --no-backup)
```
