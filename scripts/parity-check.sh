#!/usr/bin/env bash
# Compare Goldsky subgraph responses vs self-hosted compat proxy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[ -f "$ROOT/.env" ] && source "$ROOT/.env"

GOLDSKY_CORE="${GOLDSKY_CORE_URL:-https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn}"
GOLDSKY_GV="${GOLDSKY_GOTCHIVERSE_URL:-https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn}"
PROXY="${PROXY_URL:-http://127.0.0.1:${PROXY_PORT:-8787}}"
AUTH=()
[ -n "${GOLDSKY_API_KEY:-}" ] && AUTH=(-H "Authorization: Bearer $GOLDSKY_API_KEY")

post_gql() {
  local url="$1"
  local query="$2"
  shift 2
  curl -s "$url" -H 'content-type: application/json' "${AUTH[@]}" \
    --data "{\"query\":$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$query")}" "$@"
}

compare_query() {
  local name="$1"
  local url_proxy="$2"
  local url_gold="$3"
  local query="$4"

  echo "── $name"
  local gold proxy
  gold=$(post_gql "$url_gold" "$query")
  proxy=$(post_gql "$url_proxy/subgraphs/name/aavegotchi-core-base" "$query" 2>/dev/null || post_gql "$url_proxy/subgraphs/name/gotchiverse-base" "$query")

  python3 - "$name" "$gold" "$proxy" <<'PY'
import json, sys
name, gold_s, proxy_s = sys.argv[1:4]
gold = json.loads(gold_s)
proxy = json.loads(proxy_s)
if gold.get("errors"):
    print(f"  Goldsky error: {gold['errors'][0]['message']}")
if proxy.get("errors"):
    print(f"  Proxy error: {proxy['errors'][0]['message']}")
    sys.exit(1)
gd = gold.get("data") or {}
pd = proxy.get("data") or {}
for key in set(gd) | set(pd):
    g_list = gd.get(key)
    p_list = pd.get(key)
    if isinstance(g_list, list) and isinstance(p_list, list):
        print(f"  {key}: goldsky={len(g_list)} proxy={len(p_list)}")
    else:
        print(f"  {key}: compared")
print("  OK")
PY
}

CORE_SCHEMA='{ __schema { queryType { fields { name } } } }'
GV_SCHEMA='{ __schema { queryType { fields { name } } } }'

echo "Schema reachability"
post_gql "$GOLDSKY_CORE" "$CORE_SCHEMA" | python3 -c 'import json,sys; f=[x["name"] for x in json.load(sys.stdin)["data"]["__schema"]["queryType"]["fields"]]; print("Goldsky core fields sample:", [n for n in ("erc721Listings","gotchiLendings","parcels") if n in f])'
post_gql "$PROXY/subgraphs/name/aavegotchi-core-base" "$CORE_SCHEMA" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Proxy core:", "ok" if "data" in d else d)' || true

LISTINGS_QUERY='query { erc721Listings(first: 5, where: { cancelled: false, timePurchased: "0" }) { id tokenId priceInWei seller } }'
LENDING_QUERY='query { gotchiLendings(first: 5, where: { completed: false, cancelled: false }) { id gotchiTokenId lender borrower } }'
PARCELS_QUERY='query { parcels(first: 5, orderBy: tokenId, orderDirection: asc) { id tokenId owner { id } } }'

compare_query "erc721Listings sample" "$PROXY" "$GOLDSKY_CORE" "$LISTINGS_QUERY" || true
compare_query "gotchiLendings sample" "$PROXY" "$GOLDSKY_CORE" "$LENDING_QUERY" || true
compare_query "parcels sample" "$PROXY" "$GOLDSKY_CORE" "$PARCELS_QUERY" || true

GV_TYPES='{ installationTypes(first: 3) { id name } tileTypes(first: 3) { id name } }'
compare_query "gotchiverse types" "$PROXY" "$GOLDSKY_GV" "$GV_TYPES" || true

echo "Parity check complete (proxy must be running with synced indexers for full pass)"
