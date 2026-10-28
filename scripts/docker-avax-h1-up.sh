#!/usr/bin/env bash
# Start the Avalanche H1 market stack with URL-encoded Hasura DATABASE_URL (passwords with / @ # break raw URLs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

export AVAX_H1_HASURA_DATABASE_URL
AVAX_H1_HASURA_DATABASE_URL="$(node -e "
const u = process.env.ENVIO_PG_USER || 'postgres';
const p = process.env.ENVIO_PG_PASSWORD || 'testing';
const db = process.env.AVAX_H1_PG_DATABASE || 'envio-avax-h1';
console.log(
  'postgres://' +
    encodeURIComponent(u) +
    ':' +
    encodeURIComponent(p) +
    '@envio-postgres:5432/' +
    db
);
")"

exec docker compose -f docker/avax-h1-market/docker-compose.yaml --env-file .env "$@"
