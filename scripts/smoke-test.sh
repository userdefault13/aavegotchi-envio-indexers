#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[ -f "$ROOT/.env" ] && source "$ROOT/.env"

PROXY="${PROXY_URL:-http://127.0.0.1:${PROXY_PORT:-8786}}"

echo "Smoke: proxy health"
curl -sf "$PROXY/health" | python3 -m json.tool

echo "Smoke: core schema"
curl -sf "$PROXY/subgraphs/name/aavegotchi-core-base" \
  -H 'content-type: application/json' \
  --data '{"query":"{ __schema { queryType { name } } }"}' | python3 -m json.tool | head -20

echo "Smoke: gotchiverse schema"
curl -sf "$PROXY/subgraphs/name/gotchiverse-base" \
  -H 'content-type: application/json' \
  --data '{"query":"{ __schema { queryType { name } } }"}' | python3 -m json.tool | head -20

echo "All smoke checks passed"
