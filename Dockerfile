# syntax=docker/dockerfile:1.7
#
# HDO Turnusplan production Docker image
#
# Three-stage build:
#   1. deps:    install npm packages (cached aggressively; rebuilds only when
#               package.json / package-lock.json change)
#   2. builder: copy source + node_modules, run `next build` to produce the
#               standalone output (.next/standalone/server.js + tracing)
#   3. runner:  minimal Alpine image with only the build output, Prisma
#               client, schema, and a non-root user. ~200 MB final size.
#
# Build:  docker build -t hdo-turnusplan .
# Run:    docker run --rm -p 4000:4000 --env-file .env.local hdo-turnusplan
#
# Required runtime env vars (passed via --env-file or -e at `docker run`):
#   DATABASE_URL, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
#   AZURE_REDIRECT_URI, SESSION_COOKIE_SECRET
# See .env.example for descriptions.

# Stage 1: dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# libc6-compat is needed by some npm modules with native bindings (Prisma
# query engine on Alpine). openssl is required by Prisma at install + runtime.
RUN apk add --no-cache libc6-compat openssl

# Copy only the manifests + Prisma schema so this layer caches independently
# of source changes. The postinstall hook (`prisma generate`) needs schema.
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# `npm ci` is reproducible and uses the lockfile. The postinstall hook runs
# `prisma generate` here, producing the typed Prisma client in node_modules.
RUN npm ci

# Stage 2: builder
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# `lib/auth/azureAd.ts` and `lib/auth/session.ts` validate env vars at
# module load. `next build` imports those modules during page-data collection
# for the callback route, so dummy values must be present at build time.
# Real secrets are provided to `docker run`, not baked into the image.
ARG AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000
ARG AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000
ARG AZURE_CLIENT_SECRET=build-time-placeholder-not-a-real-secret
ARG AZURE_REDIRECT_URI=http://localhost:4000/auth/azure/callback
ARG SESSION_COOKIE_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ARG DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
ENV AZURE_TENANT_ID=$AZURE_TENANT_ID \
    AZURE_CLIENT_ID=$AZURE_CLIENT_ID \
    AZURE_CLIENT_SECRET=$AZURE_CLIENT_SECRET \
    AZURE_REDIRECT_URI=$AZURE_REDIRECT_URI \
    SESSION_COOKIE_SECRET=$SESSION_COOKIE_SECRET \
    DATABASE_URL=$DATABASE_URL \
    NEXT_OUTPUT_STANDALONE=1

# Bypass the npm `build` script (which runs `prisma migrate deploy` first,
# and that needs a live DB). The Docker image is for runtime; migrations are
# applied at container startup by the entrypoint, not at image build.
# NEXT_OUTPUT_STANDALONE=1 toggles `output: 'standalone'` in next.config.js
# (off by default so local `npm run start` works without static-file routing
# gymnastics; on here because the runner stage needs the standalone bundle).
RUN npx next build

# Stage 3: runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user. Containers running as root inherit a wider
# blast radius if the process is compromised.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Standalone output: the server entrypoint + traced node_modules subset.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets (CSS, fonts, images, optimised builds).
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Public folder (favicon, robots.txt, etc.).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma needs the schema + generated client at runtime. The standalone trace
# may or may not include the Prisma client cleanly across versions, so we
# copy them explicitly to remove ambiguity.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 4000

# Apply pending DB migrations then start the standalone server. If a real
# operations setup prefers migrations as a separate job (recommended for
# multi-replica deploys to avoid a startup race), override CMD to
# `["node", "server.js"]` and run `npx prisma migrate deploy` separately.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
