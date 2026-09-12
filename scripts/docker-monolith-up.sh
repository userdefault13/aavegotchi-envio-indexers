#!/usr/bin/env bash
# Start monolith stack with URL-encoded Hasura DATABASE_URL (passwords with / @ # break raw URLs).
# Host ports are STATIC from .env — never auto-bump (that drifts Cloudflare / edge proxy / SOP).
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
# 8786 = Envio graphql-proxy (internal). 8787 reserved for Aarcade edge / CF tunnel.
export PROXY_PORT="${PROXY_PORT:-8786}"

port_in_use() {
  command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

if port_in_use "$MONOLITH_PG_PORT"; then
  echo "ERROR: MONOLITH_PG_PORT=$MONOLITH_PG_PORT is already in use." >&2
  echo "  Stop the other listener or set MONOLITH_PG_PORT in .env (static contract: 5436)." >&2
  echo "  Diagnose: npm run docker:ports" >&2
  exit 1
fi

if port_in_use "$PROXY_PORT"; then
  echo "ERROR: PROXY_PORT=$PROXY_PORT is already in use." >&2
  echo "  Stop the other proxy or set PROXY_PORT in .env (static contract: 8786 for Envio; 8787 is Aarcade edge)." >&2
  echo "  Diagnose: npm run docker:ports" >&2
  exit 1
fi

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
