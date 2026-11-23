# Official Supabase bundle (local)

The e2e suite normally runs against the lean stack in `dev/supabase`. Production runs the
official self-hosted bundle, so polish pass 1 also smoke-tests against the official images
started by the Supabase CLI, on ports 553xx so both stacks can run side by side.

```sh
cd dev/supabase-official
npx supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,mailpit
./write-env.sh                      # writes official.env (git-ignored) from `supabase status`
cd ../../apps/web
E2E_STACK_ENV=../../dev/supabase-official/official.env E2E_DATA_DIR=.tmp/data-official E2E_PORT=3200 \
  pnpm exec playwright test --project=desktop -g "full flow|signed-out visitors|two devices|connects with URL"
npx supabase stop --no-backup       # from dev/supabase-official, when done
```

Needs about 6 GB of free disk for the images. Local-only keys; never point this at production.
