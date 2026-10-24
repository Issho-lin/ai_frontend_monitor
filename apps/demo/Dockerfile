# Build context: repository root (optional smoke UI)
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
RUN echo 'registry=https://registry.npmmirror.com' > .npmrc
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/demo ./apps/demo
RUN pnpm install --frozen-lockfile --filter @ai-frontend-monitor/demo...
RUN pnpm --filter @ai-frontend-monitor/schema build \
 && pnpm --filter @ai-frontend-monitor/sdk build \
 && pnpm --filter @ai-frontend-monitor/demo build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/demo/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
