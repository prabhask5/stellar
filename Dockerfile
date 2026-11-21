# syntax=docker/dockerfile:1.7
# Stellar Planner: Next.js standalone server, with the browser-extension
# packages baked in. Starts with no environment variables; state lives in /data.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    WXT_DISABLE_TELEMETRY=1 \
    CI=1
RUN corepack enable
WORKDIR /repo

# ── dependencies (cached until a manifest or the lockfile changes) ───────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY packages/universe/package.json packages/universe/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    corepack prepare --activate && pnpm install --frozen-lockfile

# ── build the extension zips, then the web app that serves them ──────────────
FROM deps AS build
COPY . .
RUN pnpm exec turbo run build --filter=@stellar/web

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# /data holds the encrypted config and generated secrets. Mount a volume here.
RUN mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
