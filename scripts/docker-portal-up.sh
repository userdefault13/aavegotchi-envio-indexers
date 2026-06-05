#!/usr/bin/env bash
# Start portal stack with URL-encoded Hasura DATABASE_URL (passwords with / @ # break raw URLs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

export PORTAL_HASURA_DATABASE_URL
PORTAL_HASURA_DATABASE_URL="$(node -e "
const u = process.env.ENVIO_PG_USER || 'postgres';
const p = process.env.ENVIO_PG_PASSWORD || 'testing';
const db = process.env.PORTAL_PG_DATABASE || 'envio-portal';
console.log(
  'postgres://' +
    encodeURIComponent(u) +
    ':' +
    encodeURIComponent(p) +
    '@envio-postgres:5432/' +
    db
);
")"

exec docker compose -f docker/portal-base/docker-compose.yaml --env-file .env "$@"
