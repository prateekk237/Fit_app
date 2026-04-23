# syntax=docker/dockerfile:1.6
# Multi-stage build optimised for KVM 1 (4 GB, 2 vCPU) coexistence
# with AssetShield. Builds run OFF the VPS (GitHub Actions); the VPS
# only pulls the final `runner` image.

# ─────────────────────────────────────────────────────────────────────────────
# deps — install pnpm + all Node deps with a cacheable layer
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@10 --activate \
 && pnpm install --frozen-lockfile --prod=false

# ─────────────────────────────────────────────────────────────────────────────
# builder — generate Prisma client, compile Next.js standalone bundle
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && corepack prepare pnpm@10 --activate \
 && pnpm exec prisma generate
# GH Actions has plenty of RAM; give the Next build room to link chunks.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN pnpm build

# ─────────────────────────────────────────────────────────────────────────────
# runner — minimal production image under tight memory constraints
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat wget ca-certificates
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cap the Node heap so the container can't blow past its 500 MB budget.
ENV NODE_OPTIONS="--max-old-space-size=400"
ENV PORT=3000

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone bundle (Next.js) + static assets + Prisma schema.
# Next's standalone tracer already includes @prisma/client in the
# bundle, so we don't re-copy it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone        ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static            ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public                  ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma                  ./prisma

# Extra tooling needed by the `fit-migrate` one-shot container:
#   prisma CLI  — runs migrate deploy
#   tsx         — runs prisma/seed.ts
# These are pnpm-hoisted into the flat node_modules tree.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma     ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx        ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/tsx   ./node_modules/.bin/tsx

# Uploads directory (mounted in compose as a named volume in production).
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

# Use wget (in the container) so we don't need to bake a separate
# healthcheck image. /api/health is public per middleware.
HEALTHCHECK --interval=60s --timeout=10s --start-period=45s --retries=3 \
  CMD wget --spider -q http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
