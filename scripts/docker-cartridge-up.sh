#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Docker runtime: Colima (preferred) or Docker Desktop — not OrbStack.
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:${PATH:-}"
if colima status >/dev/null 2>&1; then
  docker context use colima >/dev/null 2>&1 || true
elif docker context ls 2>/dev/null | grep -q desktop-linux; then
  docker context use desktop-linux >/dev/null 2>&1 || true
fi

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

export CARTRIDGE_HASURA_DATABASE_URL
CARTRIDGE_HASURA_DATABASE_URL="$(node -e "
const u = process.env.ENVIO_PG_USER || 'postgres';
const p = process.env.ENVIO_PG_PASSWORD || 'testing';
const db = process.env.CARTRIDGE_PG_DATABASE || 'envio-cartridge';
console.log(
  'postgres://' +
    encodeURIComponent(u) +
    ':' +
    encodeURIComponent(p) +
    '@envio-postgres:5432/' +
    db
);
")"

exec docker compose -f docker/aarcade-cartridge-base/docker-compose.yaml --env-file .env "$@"
