#!/bin/sh
# Writes official.env in the same shape as dev/supabase/dev.env, from the running CLI stack.
set -eu
cd "$(dirname "$0")"
eval "$(npx --yes supabase@latest status -o env 2>/dev/null)"
cat > official.env <<ENV
# Local-only values for the official Supabase CLI stack. Never use in production.
SUPABASE_URL=${API_URL}
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
DATABASE_URL=${DB_URL}
JWT_SECRET=${JWT_SECRET}
ENV
echo "wrote $(pwd)/official.env"
