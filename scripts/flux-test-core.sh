#!/usr/bin/env bash
# Run core Flux stack locally (postgres + hasura + indexer) with FLUX_PG_PASSWORD.
# Catches REPLACE_* mistakes and Postgres password mismatches before Flux charges.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$ROOT/docker/core-base/docker-compose.yaml"
MAX_WAIT="${FLUX_TEST_MAX_WAIT:-300}"

cd "$ROOT"
node scripts/flux-preflight.mjs

# shellcheck source=/dev/null
source "$ROOT/.env"

if [ -z "${ENVIO_PG_PASSWORD:-}" ]; then
  echo "ENVIO_PG_PASSWORD is required in .env (your Postgres password, not Envio account)"
  exit 1
fi

if [ -n "${FLUX_PG_PASSWORD:-}" ] && [ "$FLUX_PG_PASSWORD" != "$ENVIO_PG_PASSWORD" ]; then
  echo "WARN: FLUX_PG_PASSWORD != ENVIO_PG_PASSWORD — using ENVIO_PG_PASSWORD"
fi
export ENVIO_PG_PASSWORD
export ENVIO_PG_USER="${ENVIO_PG_USER:-postgres}"
export CORE_PG_DATABASE="${CORE_PG_DATABASE:-envio-core}"
export HASURA_GRAPHQL_ENABLE_CONSOLE="${HASURA_GRAPHQL_ENABLE_CONSOLE:-false}"
export TUI_OFF="${TUI_OFF:-true}"

echo ""
echo "Starting local Flux-equivalent core stack (fresh Postgres volume)..."
docker compose -f "$COMPOSE" --env-file "$ROOT/.env" down -v 2>/dev/null || true
docker compose -f "$COMPOSE" --env-file "$ROOT/.env" up --build -d

echo "Waiting up to ${MAX_WAIT}s for indexer (checking logs)..."
deadline=$((SECONDS + MAX_WAIT))
while [ "$SECONDS" -lt "$deadline" ]; do
  logs=$(docker compose -f "$COMPOSE" logs envio-indexer 2>&1 | tail -80 || true)

  if echo "$logs" | grep -q "REPLACE_BASE_RPC_URL\|REPLACE_PG_PASSWORD\|REPLACE_ENVIO"; then
    echo "$logs"
    echo ""
    echo "FAIL: REPLACE_* still in runtime config"
    docker compose -f "$COMPOSE" logs --tail=50
    exit 1
  fi

  if echo "$logs" | grep -q "password authentication failed"; then
    echo "$logs"
    echo ""
    echo "FAIL: Postgres password mismatch (postgres vs indexer vs hasura URL)"
    echo "Ensure FLUX_PG_PASSWORD matches in all three Flux components."
    exit 1
  fi

  if echo "$logs" | grep -q "EE109: The RPC url"; then
    echo "$logs"
    echo ""
    echo "FAIL: Invalid BASE_MAINNET_RPC"
    exit 1
  fi

  if echo "$logs" | grep -qiE "HyperSync|Processed block|block [0-9]|chainHeight|syncing"; then
    echo ""
    echo "OK: Indexer is running and syncing."
    docker compose -f "$COMPOSE" ps
    echo ""
    echo "Hasura (local): http://127.0.0.1:${CORE_HASURA_PORT:-8082}/v1/graphql"
    echo "Stop: docker compose -f docker/core-base/docker-compose.yaml down"
    echo "Stop + wipe DB: docker compose -f docker/core-base/docker-compose.yaml down -v"
    exit 0
  fi

  if echo "$logs" | grep -q "Failed at initialization"; then
    sleep 5
    logs=$(docker compose -f "$COMPOSE" logs envio-indexer 2>&1 | tail -30)
    if echo "$logs" | grep -q "password authentication failed\|EE109"; then
      echo "$logs"
      exit 1
    fi
  fi

  sleep 10
done

echo "Timeout — last indexer logs:"
docker compose -f "$COMPOSE" logs envio-indexer --tail=40
echo ""
echo "Indexer may still be starting (codegen on first run). Try:"
echo "  docker compose -f docker/core-base/docker-compose.yaml logs -f envio-indexer"
exit 1
