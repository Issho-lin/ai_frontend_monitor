# Build context: repository root
FROM node:22.22.1-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway
RUN pnpm install --frozen-lockfile --filter @ai-frontend-monitor/gateway...
RUN pnpm --filter @ai-frontend-monitor/schema build \
 && pnpm --filter @ai-frontend-monitor/gateway build

FROM node:22.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY --from=build /app /app
WORKDIR /app/apps/gateway
EXPOSE 3001
CMD ["node", "dist/main.js"]
