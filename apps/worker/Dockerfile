# Build context: repository root
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
RUN echo 'registry=https://registry.npmmirror.com' > .npmrc
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @ai-frontend-monitor/worker...
RUN pnpm --filter @ai-frontend-monitor/schema build \
 && pnpm --filter @ai-frontend-monitor/worker build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY --from=build /app /app
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
