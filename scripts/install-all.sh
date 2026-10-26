#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null
fi

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error("需要 Node.js >= 22.13 才能运行 pnpm 11，当前是 " + process.version); process.exit(1) }'

projects=(
  apps/console
  apps/api
  apps/gateway
  apps/worker
  packages/schema
  packages/sdk
)

echo "Node $(node -v) / pnpm $(pnpm -v)"
echo "安装各工程依赖：${projects[*]}"
exec pnpm install
