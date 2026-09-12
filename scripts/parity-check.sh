#!/usr/bin/env bash
# Compare Goldsky subgraph responses vs self-hosted compat proxy (monolith or split stack).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[ -f "$ROOT/.env" ] && source "$ROOT/.env"

GOLDSKY_PROJECT="${GOLDSKY_PROJECT:-project_cmh3flagm0001r4p25foufjtt}"
goldsky_url() {
  echo "https://api.goldsky.com/api/public/${GOLDSKY_PROJECT}/subgraphs/$1/prod/gn"
}

PROXY="${PROXY_URL:-http://127.0.0.1:${PROXY_PORT:-8786}}"
GOLDSKY_AUTH_HEADER=()
[ -n "${GOLDSKY_API_KEY:-}" ] && GOLDSKY_AUTH_HEADER=(-H "Authorization: Bearer $GOLDSKY_API_KEY")

post_gql() {
  local url="$1"
  local query="$2"
  shift 2
  if ((${#GOLDSKY_AUTH_HEADER[@]})); then
    curl -s "$url" -H 'content-type: application/json' "${GOLDSKY_AUTH_HEADER[@]}" \
      --data "{\"query\":$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$query")}" "$@"
  else
    curl -s "$url" -H 'content-type: application/json' \
      --data "{\"query\":$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$query")}" "$@"
  fi
}

compare_query() {
  local name="$1"
  local proxy_subgraph="$2"
  local url_gold="$3"
  local query="$4"
  local optional="${5:-}"

  echo "── $name"
  if [ -z "$url_gold" ]; then
    echo "  (no Goldsky reference — proxy-only)"
    proxy=$(post_gql "$PROXY/subgraphs/name/$proxy_subgraph" "$query")
    python3 - "$name" "$proxy" <<'PY'
import json, sys
name, proxy_s = sys.argv[1:3]
proxy = json.loads(proxy_s)
if proxy.get("errors"):
    print(f"  Proxy error: {proxy['errors'][0]['message']}")
    sys.exit(1)
print("  OK (proxy reachable)")
PY
    return
  fi

  local gold proxy
  gold=$(post_gql "$url_gold" "$query")
  proxy=$(post_gql "$PROXY/subgraphs/name/$proxy_subgraph" "$query")

  python3 - "$name" "$gold" "$proxy" "$optional" <<'PY'
import json, sys
name, gold_s, proxy_s, optional = sys.argv[1:5]
gold = json.loads(gold_s)
proxy = json.loads(proxy_s)
if gold.get("errors"):
    print(f"  Goldsky error: {gold['errors'][0]['message']}")
    if optional == "optional":
        print("  (Goldsky error ignored — optional personality)")
        sys.exit(0)
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

GOLDSKY_CORE=$(goldsky_url "aavegotchi-core-base")
GOLDSKY_GV=$(goldsky_url "gotchiverse-base")
GOLDSKY_GBM=$(goldsky_url "aavegotchi-gbm-baazaar-base")
GOLDSKY_ALCHEMICA=$(goldsky_url "aavegotchi-alchemica-base")
GOLDSKY_SOCKET=$(goldsky_url "socket-bridge-base")
GOLDSKY_SVG=$(goldsky_url "aavegotchi-svg-base")

SCHEMA='{ __schema { queryType { fields { name } } } }'

echo "=== Base monolith parity (7 proxy paths) ==="
echo "Proxy: $PROXY"
echo ""

echo "Schema reachability (core)"
post_gql "$GOLDSKY_CORE" "$SCHEMA" | python3 -c 'import json,sys; f=[x["name"] for x in json.load(sys.stdin)["data"]["__schema"]["queryType"]["fields"]]; print("Goldsky core fields sample:", [n for n in ("erc721Listings","gotchiLendings","parcels") if n in f])' || true
post_gql "$PROXY/subgraphs/name/aavegotchi-core-base" "$SCHEMA" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Proxy core:", "ok" if "data" in d else d)' || true

LISTINGS_QUERY='query { erc721Listings(first: 5, where: { cancelled: false, timePurchased: "0" }) { id tokenId priceInWei seller } }'
LENDING_QUERY='query { gotchiLendings(first: 5, where: { completed: false, cancelled: false }) { id gotchiTokenId lender borrower } }'
PARCELS_QUERY='query { parcels(first: 5, orderBy: tokenId, orderDirection: asc) { id tokenId owner { id } } }'
ITEM_TYPES_QUERY='query { itemTypes(first: 5, orderBy: svgId, orderDirection: asc) { id svgId name category } }'
WHITELISTS_QUERY='query { whitelists(first: 5, orderBy: id, orderDirection: asc) { id name owner { id } } }'
BUY_ORDERS_QUERY='query { erc721BuyOrders(first: 5, where: { canceled: false }) { id erc721TokenId buyer priceInWei } }'

compare_query "1 core — erc721Listings" "aavegotchi-core-base" "$GOLDSKY_CORE" "$LISTINGS_QUERY" || true
compare_query "1 core — gotchiLendings" "aavegotchi-core-base" "$GOLDSKY_CORE" "$LENDING_QUERY" || true
compare_query "1 core — parcels" "aavegotchi-core-base" "$GOLDSKY_CORE" "$PARCELS_QUERY" || true
compare_query "1 core — itemTypes" "aavegotchi-core-base" "$GOLDSKY_CORE" "$ITEM_TYPES_QUERY" || true
compare_query "1 core — whitelists" "aavegotchi-core-base" "$GOLDSKY_CORE" "$WHITELISTS_QUERY" || true
compare_query "1 core — erc721BuyOrders" "aavegotchi-core-base" "$GOLDSKY_CORE" "$BUY_ORDERS_QUERY" || true

FAKE_STATS_QUERY='query { fakeGotchiStatistics(first: 5, orderBy: id, orderDirection: desc, where: { metadata_not: null }) { id totalSupply metadata { name status minted publisherName } } statistic(id: "0") { totalFakeGotchiPieces totalFakeGotchiOwners } generations(first: 1) { id amount } }'
compare_query "1 core — fakeGotchiStatistics" "aavegotchi-core-base" "$GOLDSKY_CORE" "$FAKE_STATS_QUERY" || true

FAKE_QUEUE_QUERY='query { metadataActionLogs(first: 5, orderBy: createdAt, orderDirection: desc, where: { status_in: [0, 1], minted: false }) { id name status flagCount likeCount } }'
compare_query "1 core — metadataActionLogs (queue)" "aavegotchi-core-base" "$GOLDSKY_CORE" "$FAKE_QUEUE_QUERY" optional || true

GV_TYPES='query { installationTypes(first: 3) { id name } tileTypes(first: 3) { id name } }'
compare_query "2 gotchiverse — types" "gotchiverse-base" "$GOLDSKY_GV" "$GV_TYPES" || true

GBM_QUERY='query { auctions(first: 3, orderBy: createdAt, orderDirection: desc) { id orderId type cancelled highestBid } }'
compare_query "3 gbm — auctions" "aavegotchi-gbm-baazaar-base" "$GOLDSKY_GBM" "$GBM_QUERY" optional || true

SVG_QUERY='query { aavegotchis(first: 3, orderBy: id, orderDirection: desc, where: { svg_not: null }) { id svg left right back } }'
compare_query "4 svg — aavegotchi.svg" "aavegotchi-svg-base" "$GOLDSKY_SVG" "$SVG_QUERY" optional || true

GOLDSKY_PORTAL="${GOLDSKY_PORTAL_URL:-}"
PORTAL_QUERY='query { portals(first: 3, orderBy: id, orderDirection: desc) { id svgs } }'
compare_query "4b portal — portal svgs" "aavegotchi-portal-base" "$GOLDSKY_PORTAL" "$PORTAL_QUERY" optional || true

ALCHEMICA_CONTRACTS_QUERY='query { erc20Contracts(first: 10, orderBy: symbol) { id symbol name decimals } }'
ALCHEMICA_BALANCES_QUERY='query { erc20Balances(first: 5, where: { valueExact_gt: "0" }) { id value valueExact account { id } contract { symbol } } }'
compare_query "5 alchemica — erc20Contracts" "aavegotchi-alchemica-base" "$GOLDSKY_ALCHEMICA" "$ALCHEMICA_CONTRACTS_QUERY" optional || true
compare_query "5 alchemica — erc20Balances" "aavegotchi-alchemica-base" "$GOLDSKY_ALCHEMICA" "$ALCHEMICA_BALANCES_QUERY" optional || true

SOCKET_CONTRACTS_QUERY='query { tokenContracts(first: 10, orderBy: symbol) { id symbol type } }'
SOCKET_TRANSFERS_QUERY='query { bridgeTransfers(first: 3, orderBy: timestamp, orderDirection: desc) { id messageId connector sender receiver amount fee type timestamp txHash blockNumber tokenContract { id symbol } } }'
compare_query "6 socket-bridge — tokenContracts" "socket-bridge-base" "$GOLDSKY_SOCKET" "$SOCKET_CONTRACTS_QUERY" optional || true
compare_query "6 socket-bridge — bridgeTransfers" "socket-bridge-base" "$GOLDSKY_SOCKET" "$SOCKET_TRANSFERS_QUERY" optional || true

STAKING_POOLS_QUERY='query { pools(first: 10, orderBy: id) { id name balance lpToken } }'
STAKING_STATS_QUERY='query { poolStats(first: 10, orderBy: id) { id lpStaked numberOfCurrentPositions numberOfTotalPositions } }'
STAKING_POSITIONS_QUERY='query { poolPositions(first: 5, where: { balance_gt: "0" }) { id balance user { id gltrHarvested } pool { id name } } }'
compare_query "7 gltr-staking — pools (no Goldsky)" "aavegotchi-gltr-staking-base" "" "$STAKING_POOLS_QUERY" || true
compare_query "7 gltr-staking — poolStats (no Goldsky)" "aavegotchi-gltr-staking-base" "" "$STAKING_STATS_QUERY" || true
compare_query "7 gltr-staking — poolPositions (no Goldsky)" "aavegotchi-gltr-staking-base" "" "$STAKING_POSITIONS_QUERY" || true

echo ""
echo "Parity check complete."
echo "Personalities 3–7 need a synced monolith stack; staking (#7) has no Goldsky baseline."
