#!/usr/bin/env bash
# Start aarcade-cartridge-base indexer + wire into Envio graphql-proxy (Docker Desktop on home iMac).
#
# Env:
#   SUBGRAPH_PROXY_SECRET   required; sent as X-Subgraph-Proxy-Key to graphql-proxy (never printed)
#   GRAPHQL_PROXY_HOST      default 127.0.0.1
#   GRAPHQL_PROXY_PORT      default 8786 (graphql-proxy; the edge on :8787 wants a Bearer token)
#   ALLOW_PATCH_LIVE_PROXY  set to 1 to docker cp over a graphql-proxy that is already running/answering
set -euo pipefail
set +x # never trace: this script handles SUBGRAPH_PROXY_SECRET

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AARCADE_ROOT="${AARCADE_ROOT:-$ROOT/../AarcadeGh-t}"
cd "$ROOT"

GRAPHQL_PROXY_HOST="${GRAPHQL_PROXY_HOST:-127.0.0.1}"
GRAPHQL_PROXY_PORT="${GRAPHQL_PROXY_PORT:-8786}"
PROXY_BASE="http://${GRAPHQL_PROXY_HOST}:${GRAPHQL_PROXY_PORT}"

if [ -z "${SUBGRAPH_PROXY_SECRET:-}" ]; then
  echo "SUBGRAPH_PROXY_SECRET is not set; graphql-proxy requires X-Subgraph-Proxy-Key. Aborting." >&2
  exit 1
fi

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

# Guard: never docker cp over a live graphql-proxy (e.g. the M1) unless explicitly allowed.
LIVE_PROXY_CONTAINER="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'graphql-proxy' | head -1 || true)"
LIVE_PROXY_HEALTH=""
if curl -fsS -m 3 "$PROXY_BASE/health" >/dev/null 2>&1; then
  LIVE_PROXY_HEALTH="$PROXY_BASE/health"
fi
if { [ -n "$LIVE_PROXY_CONTAINER" ] || [ -n "$LIVE_PROXY_HEALTH" ]; } && [ "${ALLOW_PATCH_LIVE_PROXY:-}" != "1" ]; then
  echo "Refusing to patch a live graphql-proxy:" >&2
  [ -n "$LIVE_PROXY_CONTAINER" ] && echo "  running container: $LIVE_PROXY_CONTAINER" >&2
  [ -n "$LIVE_PROXY_HEALTH" ] && echo "  answering: $LIVE_PROXY_HEALTH" >&2
  echo "This script docker-cps dist/index.js over it and restarts it. Set ALLOW_PATCH_LIVE_PROXY=1 to override." >&2
  exit 2
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
# Key goes in via a header file (printf is a builtin), so it is never on curl's argv or in output.
curl -sS -X POST "$PROXY_BASE/subgraphs/name/aarcade-cartridge-base" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://aarcadeghst.com' \
  -H @<(printf 'X-Subgraph-Proxy-Key: %s\n' "$SUBGRAPH_PROXY_SECRET") \
  -d '{"query":"{ _meta { block { number } } }"}' | head -c 400
echo ""

echo "Done. Cartridge Hasura: http://127.0.0.1:${CARTRIDGE_HASURA_PORT:-8089}/console"
