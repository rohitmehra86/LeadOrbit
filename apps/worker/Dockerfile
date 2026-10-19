# Multi-stage worker image for Fly/Railway/Render.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/api-contracts/package.json packages/api-contracts/
COPY packages/observability/package.json packages/observability/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @leadorbit/worker...

FROM base AS runner
ENV NODE_ENV=production
ENV LEADORBIT_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages ./packages
COPY apps/worker ./apps/worker
COPY package.json pnpm-workspace.yaml ./
WORKDIR /app/apps/worker
EXPOSE 43128
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
