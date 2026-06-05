#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

export ALCHEMICA_HASURA_DATABASE_URL
ALCHEMICA_HASURA_DATABASE_URL="$(node -e "
const u = process.env.ENVIO_PG_USER || 'postgres';
const p = process.env.ENVIO_PG_PASSWORD || 'testing';
const db = process.env.ALCHEMICA_PG_DATABASE || 'envio-alchemica';
console.log(
  'postgres://' +
    encodeURIComponent(u) +
    ':' +
    encodeURIComponent(p) +
    '@envio-postgres:5432/' +
    db
);
")"

exec docker compose -f docker/alchemica-base/docker-compose.yaml --env-file .env "$@"
