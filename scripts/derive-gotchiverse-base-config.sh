#!/usr/bin/env bash
# Derive Gotchiverse Base config from matic template + on-chain deployment blocks.
set -euo pipefail

RPC="${BASE_MAINNET_RPC:-https://mainnet.base.org}"
OUT="${1:-$(dirname "$0")/../packages/gotchiverse-base/config/base.json}"

REALM="0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372"
INSTALLATION="0xebba5b725A2889f7f089a6cAE0246A32cad4E26b"
TILE="0x617fdB8093b309e4699107F48812b407A7c37938"

find_deploy_block() {
  local addr="$1"
  python3 - "$addr" "$RPC" <<'PY'
import json, subprocess, sys
addr, rpc = sys.argv[1], sys.argv[2]

def eth_call(method, params):
    r = subprocess.run([
        "curl", "-s", rpc,
        "-H", "content-type: application/json",
        "--data", json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params})
    ], capture_output=True, text=True)
    return json.loads(r.stdout)["result"]

def has_code(block, address):
    code = eth_call("eth_getCode", [address, hex(block)])
    return code not in ("0x", "0x0")

latest = int(eth_call("eth_blockNumber", []), 16)
lo, hi = 0, latest
while lo < hi:
    mid = (lo + hi) // 2
    if has_code(mid, addr):
        hi = mid
    else:
        lo = mid + 1
print(lo)
PY
}

echo "Resolving deployment blocks on Base..."
REALM_BLOCK=$(find_deploy_block "$REALM")
INSTALLATION_BLOCK=$(find_deploy_block "$INSTALLATION")
TILE_BLOCK=$(find_deploy_block "$TILE")

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<JSON
{
  "network": "base",
  "networkId": 8453,
  "realmDiamondAddress": "$REALM",
  "realmStartBlock": $REALM_BLOCK,
  "installationDiamondAddress": "$INSTALLATION",
  "installationStartBlock": $INSTALLATION_BLOCK,
  "tileDiamondAddress": "$TILE",
  "tileStartBlock": $TILE_BLOCK
}
JSON

echo "Wrote $OUT"
cat "$OUT"
