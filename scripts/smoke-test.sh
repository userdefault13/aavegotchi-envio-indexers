#!/usr/bin/env bash
# Smoke all 8 GraphQL compat paths (monolith or split proxy on :8787).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a

PROXY="${PROXY_URL:-http://127.0.0.1:${PROXY_PORT:-8787}}"
AUTH_ARGS=()
if [ -n "${SUBGRAPH_PROXY_SECRET:-}" ]; then
  AUTH_ARGS=(-H "X-Subgraph-Proxy-Key: ${SUBGRAPH_PROXY_SECRET}")
fi

# name|probe — aligned with AarcadeGh-t src/constants/fluxSubgraphs.ts where possible
SUBGRAPHS=(
  'aavegotchi-core-base|{ _meta { block { number } } statistic(id: "0") { id } }'
  'gotchiverse-base|{ _meta { block { number } } installations(first: 1) { id } }'
  'aavegotchi-gbm-baazaar-base|{ _meta { block { number } } auctions(first: 1) { id } }'
  'aavegotchi-svg-base|{ _meta { block { number } } aavegotchis(first: 1) { id } }'
  'aavegotchi-portal-base|{ _meta { block { number } } portals(first: 1) { id } }'
  'aavegotchi-alchemica-base|{ _meta { block { number } } AlchemicaAccount(first: 1) { id } }'
  'socket-bridge-base|{ _meta { block { number } } claimedTokens(first: 1) { id } }'
  'aavegotchi-gltr-staking-base|{ _meta { block { number } } StakingPool(first: 1) { id } }'
)

echo "Smoke: proxy health ($PROXY)"
curl -sf "$PROXY/health" | python3 -m json.tool

# Auth gate (only when secret is configured)
if [ -n "${SUBGRAPH_PROXY_SECRET:-}" ]; then
  echo "Smoke: reject missing X-Subgraph-Proxy-Key"
  code=$(curl -s -o /tmp/smoke-unauth.json -w '%{http_code}' -X POST \
    "$PROXY/subgraphs/name/aavegotchi-core-base" \
    -H 'content-type: application/json' \
    --data '{"query":"{ __typename }"}')
  if [ "$code" != "401" ]; then
    echo "Expected 401 without key, got $code" >&2
    cat /tmp/smoke-unauth.json >&2 || true
    exit 1
  fi
fi

fail=0
for entry in "${SUBGRAPHS[@]}"; do
  name="${entry%%|*}"
  probe="${entry#*|}"
  echo "Smoke: $name"
  # Prefer data probe; fall back to schema so early sync still passes.
  if ! curl -sf "$PROXY/subgraphs/name/$name" \
    -H 'content-type: application/json' \
    "${AUTH_ARGS[@]}" \
    --data "$(python3 -c 'import json,sys; print(json.dumps({"query":sys.argv[1]}))' "$probe")" \
    >/tmp/smoke-"$name".json 2>/tmp/smoke-"$name".err; then
    echo "  data probe failed; trying schema..."
    if ! curl -sf "$PROXY/subgraphs/name/$name" \
      -H 'content-type: application/json' \
      "${AUTH_ARGS[@]}" \
      --data '{"query":"{ __schema { queryType { name } } }"}' \
      >/tmp/smoke-"$name".json 2>/tmp/smoke-"$name".err; then
      echo "FAIL: $name" >&2
      cat /tmp/smoke-"$name".err >&2 || true
      cat /tmp/smoke-"$name".json >&2 || true
      fail=1
      continue
    fi
  fi
  python3 - <<PY
import json
d=json.load(open("/tmp/smoke-$name.json"))
if "errors" in d and not d.get("data"):
    raise SystemExit(f"GraphQL errors for $name: {d['errors']}")
print("  ok:", list((d.get("data") or d).keys())[:5])
PY
done

if [ "$fail" -ne 0 ]; then
  echo "Some subgraph smokes failed" >&2
  exit 1
fi

echo "All 8 subgraph smoke checks passed"
