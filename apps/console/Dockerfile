# Build context: repository root
FROM node:22.22.1-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY packages ./packages
COPY apps/console ./apps/console
RUN pnpm install --frozen-lockfile --filter @ai-frontend-monitor/console...
RUN pnpm --filter @ai-frontend-monitor/schema build \
 && pnpm --filter @ai-frontend-monitor/console build-only

FROM nginx:1.27-alpine AS runtime
COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/console/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
