#!/usr/bin/env bash
# Verify FAKE Gotchi entities after core indexer sync (local Hasura or Flux proxy).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[ -f "$ROOT/.env" ] && source "$ROOT/.env"

MODE="${1:-local}"
HASURA_SECRET="${HASURA_GRAPHQL_ADMIN_SECRET:-testing}"

if [ "$MODE" = "local" ]; then
  URL="http://127.0.0.1:${CORE_HASURA_PORT:-8082}/v1/graphql"
  HDR=(-H "x-hasura-admin-secret: $HASURA_SECRET")
elif [ "$MODE" = "flux" ]; then
  URL="${FLUX_PROXY_URL:-https://aavegotchisubgraphproxy.app.runonflux.io}/subgraphs/name/aavegotchi-core-base"
  HDR=(-H "content-type: application/json")
else
  echo "Usage: $0 [local|flux]"
  exit 1
fi

query_hasura() {
  curl -s "$URL" "${HDR[@]}" -H 'content-type: application/json' \
    --data "{\"query\":$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$1")}"
}

query_proxy() {
  curl -s "$URL" -H 'content-type: application/json' \
    --data "{\"query\":$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<<"$1")}"
}

run_query() {
  if [ "$MODE" = "local" ]; then
    query_hasura "$1"
  else
    query_proxy "$1"
  fi
}

HASURA_Q='query { FakeGotchiStatistic_aggregate { aggregate { count } } MetadataActionLog_aggregate { aggregate { count } } Generation_by_pk(id: "0") { amount } Statistic_by_pk(id: "0") { totalFakeGotchiPieces totalFakeGotchiOwners } FakeGotchiStatistic(limit: 3, order_by: {id: desc}) { id totalSupply metadata { name status minted } } }'

PROXY_Q='query { fakeGotchiStatistics(first: 3, orderBy: id, orderDirection: desc, where: { metadata_not: null }) { id totalSupply metadata { name status minted } } metadataActionLogs(first: 3, where: { minted: true }) { id name status } statistic(id: "0") { totalFakeGotchiPieces totalFakeGotchiOwners } generations(first: 1) { id amount } }'

echo "=== FAKE Gotchi sync check ($MODE) ==="
if [ "$MODE" = "local" ]; then
  echo "Hasura: $URL"
  resp=$(run_query "$HASURA_Q")
else
  echo "Proxy: $URL"
  resp=$(run_query "$PROXY_Q")
fi

python3 - "$resp" <<'PY'
import json, sys
raw = json.loads(sys.argv[1])
if raw.get("errors"):
    print("ERROR:", raw["errors"][0]["message"])
    sys.exit(1)
d = raw.get("data") or {}
if "FakeGotchiStatistic_aggregate" in d:
    count = d["FakeGotchiStatistic_aggregate"]["aggregate"]["count"]
    meta = d["MetadataActionLog_aggregate"]["aggregate"]["count"]
    stat = d.get("Statistic_by_pk") or {}
    gen = d.get("Generation_by_pk") or {}
    samples = d.get("FakeGotchiStatistic") or []
    print(f"FakeGotchiStatistic count: {count}")
    print(f"MetadataActionLog count: {meta}")
    print(f"totalFakeGotchiPieces: {stat.get('totalFakeGotchiPieces')}")
    print(f"totalFakeGotchiOwners: {stat.get('totalFakeGotchiOwners')}")
    print(f"Generation 0 cards: {gen.get('amount')}")
    for row in samples[:3]:
        m = row.get("metadata") or {}
        print(f"  - #{row.get('id')}: {m.get('name')} (supply {row.get('totalSupply')})")
    indexed = count
elif "fakeGotchiStatistics" in d:
    stats = d["fakeGotchiStatistics"]
    stat = d.get("statistic") or {}
    gen = (d.get("generations") or [{}])[0]
    print(f"fakeGotchiStatistics sample: {len(stats)} rows")
    print(f"totalFakeGotchiPieces: {stat.get('totalFakeGotchiPieces')}")
    print(f"totalFakeGotchiOwners: {stat.get('totalFakeGotchiOwners')}")
    print(f"Generation 0 cards: {gen.get('amount')}")
    for row in stats[:3]:
        m = row.get("metadata") or {}
        print(f"  - #{row.get('id')}: {m.get('name')} (supply {row.get('totalSupply')})")
    indexed = len(stats)
else:
    print("Unexpected response:", json.dumps(d, indent=2)[:500])
    sys.exit(1)
if indexed == 0:
    print("")
    print("WARN: No FAKE art indexed yet — sync may still be running or volume needs wipe + reindex.")
    sys.exit(2)
print("OK")
PY
