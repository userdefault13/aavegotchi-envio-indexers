#!/usr/bin/env bash
# Start core stack with URL-encoded Hasura DATABASE_URL (passwords with / @ # break raw URLs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

USER="${ENVIO_PG_USER:-postgres}"
PASS="${ENVIO_PG_PASSWORD:-testing}"
DB="${CORE_PG_DATABASE:-envio-core}"

export CORE_HASURA_DATABASE_URL
CORE_HASURA_DATABASE_URL="$(node -e "
const u = process.env.ENVIO_PG_USER || 'postgres';
const p = process.env.ENVIO_PG_PASSWORD || 'testing';
const db = process.env.CORE_PG_DATABASE || 'envio-core';
console.log(
  'postgres://' +
    encodeURIComponent(u) +
    ':' +
    encodeURIComponent(p) +
    '@envio-postgres:5432/' +
    db
);
")"

exec docker compose -f docker/core-base/docker-compose.yaml --env-file .env "$@"
