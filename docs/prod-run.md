# Production-shaped local run

Runs **apps + data plane** via Docker. Full public HTTPS host setup is **not** required;
put Caddy or nginx with TLS in front when you expose the stack.

## Prerequisites

- Docker + Compose v2
- Repo checkout with `pnpm-lock.yaml`
- Copy env: `cp .env.example .env` and change secrets

## Start

```bash
# from repository root
cp -n .env.example .env

# optional: set real tokens / passwords in .env
# AFM_PROJECT_TOKENS={"demo":"afm-demo-token","acme":"…"}

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Include the optional Demo static page:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile demo up -d --build
```

## Ports (defaults)

| Service | Host port | Notes |
|---------|-----------|--------|
| Console | `8080` | nginx; proxies `/api/` → `api:3000` |
| API | `3000` | Nest Fastify |
| Gateway ingest | `3001` | `POST /ingest` |
| Demo | `8081` | profile `demo` only |
| Postgres | `5432` | from base compose |
| ClickHouse HTTP | `8123` | |
| Redpanda Kafka | `9092` | advertise overridden to `redpanda:9092` in prod file |
| Redis | `6379` | |
| MinIO | `9100` / `9101` | |

Auth / rate limit / redaction: see [project-token-contract.md](./project-token-contract.md).

## HTTPS reverse proxy (notes only)

Terminate TLS on the host or a sibling container; proxy to Console + Gateway.

**Caddy example** (`Caddyfile`):

```caddy
monitor.example.com {
  reverse_proxy console:80
}

ingest.example.com {
  reverse_proxy gateway:3001
}
```

**nginx sketch**:

```nginx
server {
  listen 443 ssl http2;
  server_name monitor.example.com;
  # ssl_certificate …; ssl_certificate_key …;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 443 ssl http2;
  server_name ingest.example.com;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Point SDK `endpoint` at `https://ingest.example.com/ingest` and keep sending
`x-project-token` + `projectId`.

## Stop

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile demo down
# add -v only if you intend to wipe data volumes
```

## Images

| App | Dockerfile |
|-----|------------|
| api | `apps/api/Dockerfile` |
| gateway | `apps/gateway/Dockerfile` |
| worker | `apps/worker/Dockerfile` |
| console | `apps/console/Dockerfile` (+ `apps/console/nginx.conf`) |
| demo | `apps/demo/Dockerfile` |
