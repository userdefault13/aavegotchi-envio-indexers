#!/usr/bin/env bash
# Start monolith stack with URL-encoded Hasura DATABASE_URL (passwords with / @ # break raw URLs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

export MONOLITH_PG_PORT="${MONOLITH_PG_PORT:-5436}"
export PROXY_PORT="${PROXY_PORT:-8787}"

port_in_use() {
  command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

if port_in_use "$MONOLITH_PG_PORT"; then
  if [ "$MONOLITH_PG_PORT" = "5434" ] && ! port_in_use 5436; then
    echo "WARN: MONOLITH_PG_PORT=5434 is in use (gotchiverse-base?). Using 5436 for monolith." >&2
    export MONOLITH_PG_PORT=5436
  else
    echo "ERROR: MONOLITH_PG_PORT=$MONOLITH_PG_PORT is already in use." >&2
    echo "  Set MONOLITH_PG_PORT to a free port in .env (default is now 5436)." >&2
    exit 1
  fi
fi

if port_in_use "$PROXY_PORT"; then
  if [ "$PROXY_PORT" = "8787" ] && ! port_in_use 8788; then
    echo "WARN: PROXY_PORT=8787 is in use. Using 8788 for monolith proxy." >&2
    export PROXY_PORT=8788
  else
    echo "ERROR: PROXY_PORT=$PROXY_PORT is already in use." >&2
    echo "  Stop the other proxy or set PROXY_PORT in .env." >&2
    exit 1
  fi
fi

USER="${ENVIO_PG_USER:-postgres}"
PASS="${ENVIO_PG_PASSWORD:-testing}"
DB="${MONOLITH_PG_DATABASE:-envio-monolith}"

export MONOLITH_HASURA_DATABASE_URL
MONOLITH_HASURA_DATABASE_URL="$(node -e "
const u = process.env.ENVIO_PG_USER || 'postgres';
const p = process.env.ENVIO_PG_PASSWORD || 'testing';
const db = process.env.MONOLITH_PG_DATABASE || 'envio-monolith';
console.log(
  'postgres://' +
    encodeURIComponent(u) +
    ':' +
    encodeURIComponent(p) +
    '@envio-postgres:5432/' +
    db
);
")"

# Exported shell vars override duplicate keys in --env-file .env (Compose precedence).
exec docker compose -f docker/monolith-base/docker-compose.yaml --env-file .env "$@"
