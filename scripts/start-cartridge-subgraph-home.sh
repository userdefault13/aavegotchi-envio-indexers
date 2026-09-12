#!/usr/bin/env bash
# Start aarcade-cartridge-base indexer + wire into Envio graphql-proxy (Docker Desktop on home iMac).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AARCADE_ROOT="${AARCADE_ROOT:-$ROOT/../AarcadeGh-t}"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:${PATH:-}"
if colima status >/dev/null 2>&1; then
  docker context use colima >/dev/null 2>&1 || true
elif docker context ls 2>/dev/null | grep -q desktop-linux; then
  docker context use desktop-linux >/dev/null 2>&1 || true
fi

if ! docker info >/dev/null 2>&1; then
  echo "No Docker daemon. Start Colima (colima start) or Docker Desktop — not OrbStack." >&2
  exit 1
fi

echo "==> Codegen aarcade-cartridge-base"
npm run codegen:cartridge

echo "==> Build graphql-proxy (cartridge route)"
npm run build:proxy

echo "==> Start cartridge indexer stack"
npm run docker:cartridge

echo "==> Restart Envio graphql-proxy with CARTRIDGE_HASURA_URL"
export CARTRIDGE_HASURA_PORT="${CARTRIDGE_HASURA_PORT:-8089}"
PROXY_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'graphql-proxy' | head -1 || true)"
if [ -n "$PROXY_CONTAINER" ]; then
  docker cp "$ROOT/services/graphql-proxy/dist/index.js" "$PROXY_CONTAINER:/app/dist/index.js"
  docker restart "$PROXY_CONTAINER" >/dev/null
  echo "Patched and restarted $PROXY_CONTAINER"
else
  echo "No graphql-proxy container — start monolith or docker:proxy first."
fi

if [ -f "$AARCADE_ROOT/scripts/subgraph-edge-proxy-deploy.sh" ]; then
  echo "==> Redeploy edge proxy (adds aarcade-cartridge-base to allowlist)"
  bash "$AARCADE_ROOT/scripts/subgraph-edge-proxy-deploy.sh"
fi

echo "==> Smoke: aarcade-cartridge-base _meta"
sleep 3
curl -sS -X POST "http://127.0.0.1:8787/subgraphs/name/aarcade-cartridge-base" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://aarcadeghst.com' \
  -d '{"query":"{ _meta { block { number } } }"}' | head -c 400
echo ""

echo "Done. Cartridge Hasura: http://127.0.0.1:${CARTRIDGE_HASURA_PORT:-8089}/console"
