#!/usr/bin/env bash
# Compare expected static host ports (.env) vs live docker ps publishes.
# Exit 0 when running containers match; 1 on drift / missing required proxy.
# Optional: --write-env updates PROXY_PORT in .env from the live monolith proxy publish.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WRITE_ENV=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --write-env) WRITE_ENV=1 ;;
    --fix) DRY_RUN=1 ;;
    -h|--help)
      echo "Usage: $0 [--write-env] [--fix]"
      echo "  Compare .env expected ports to docker publishes."
      echo "  --write-env  if PROXY drifted, rewrite PROXY_PORT in .env (backup .env.bak)"
      echo "  --fix     with --write-env, print change only"
      exit 0
      ;;
  esac
done

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

PROXY_PORT="${PROXY_PORT:-8786}"
MONOLITH_PG_PORT="${MONOLITH_PG_PORT:-5436}"
MONOLITH_HASURA_PORT="${MONOLITH_HASURA_PORT:-8083}"
CARTRIDGE_PG_PORT="${CARTRIDGE_PG_PORT:-5442}"
CARTRIDGE_HASURA_PORT="${CARTRIDGE_HASURA_PORT:-8089}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not in PATH" >&2
  exit 1
fi

# name_substr|label|expected_port
EXPECTATIONS=(
  "graphql-proxy|Envio graphql-proxy|$PROXY_PORT"
  "monolith-base-envio-postgres|Monolith Postgres|$MONOLITH_PG_PORT"
  "monolith-base-hasura|Monolith Hasura|$MONOLITH_HASURA_PORT"
  "aarcade-cartridge-base-envio-postgres|Cartridge Postgres|$CARTRIDGE_PG_PORT"
  "aarcade-cartridge-base-hasura|Cartridge Hasura|$CARTRIDGE_HASURA_PORT"
)

REQUIRED_LABELS=("Envio graphql-proxy")

host_port_for() {
  local name_sub="$1" line ports
  line="$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | awk -F'\t' -v s="$name_sub" 'index($1,s){print; exit}')"
  if [ -z "$line" ]; then
    echo ""
    return 0
  fi
  ports="${line#*$'\t'}"
  echo "$ports" | grep -oE '([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:)?[0-9]+->' | head -1 | sed -E 's/.*:([0-9]+)->/\1/; s/^([0-9]+)->/\1/'
}

printf "%-28s %-10s %-10s %s\n" "SERVICE" "EXPECTED" "ACTUAL" "STATUS"
printf "%-28s %-10s %-10s %s\n" "-------" "--------" "------" "------"

DRIFT=0
MISSING_REQUIRED=0
PROXY_ACTUAL=""

for row in "${EXPECTATIONS[@]}"; do
  IFS='|' read -r name_sub label expected <<<"$row"
  actual="$(host_port_for "$name_sub")"
  status="OK"
  if [ -z "$actual" ]; then
    status="MISSING"
    for req in "${REQUIRED_LABELS[@]}"; do
      if [ "$label" = "$req" ]; then
        MISSING_REQUIRED=1
        status="MISSING*"
      fi
    done
  elif [ "$actual" != "$expected" ]; then
    status="DRIFT"
    DRIFT=1
  fi
  if [ "$label" = "Envio graphql-proxy" ] && [ -n "$actual" ]; then
    PROXY_ACTUAL="$actual"
  fi
  printf "%-28s %-10s %-10s %s\n" "$label" "$expected" "${actual:--}" "$status"
done

echo
echo "Contract: Envio proxy=$PROXY_PORT (static), edge/CF keep 8787 free for Aarcade."
echo "Diagnose live listeners: lsof -nP -iTCP:$PROXY_PORT -sTCP:LISTEN"

if [ "$WRITE_ENV" = 1 ]; then
  if [ -z "$PROXY_ACTUAL" ]; then
    echo "--write-env: no live Envio graphql-proxy publish found; not rewriting .env" >&2
  elif [ "$PROXY_ACTUAL" = "$PROXY_PORT" ]; then
    echo "--write-env: PROXY_PORT already matches live ($PROXY_ACTUAL)"
  elif [ ! -f .env ]; then
    echo "ERROR: no .env to rewrite" >&2
    exit 1
  else
    msg="PROXY_PORT=$PROXY_PORT -> $PROXY_ACTUAL"
    if [ "$DRY_RUN" = 1 ]; then
      echo "--fix --write-env would set $msg"
    else
      cp .env .env.bak
      if grep -qE '^PROXY_PORT=' .env; then
        sed -i.bak2 -E "s/^PROXY_PORT=.*/PROXY_PORT=$PROXY_ACTUAL/" .env
        rm -f .env.bak2
      else
        printf '\nPROXY_PORT=%s\n' "$PROXY_ACTUAL" >> .env
      fi
      echo "Updated .env: $msg (backup .env.bak)"
      echo "Restart dependents that hardcode the old port (aarcade-subgraph-api upstream, etc.)."
    fi
  fi
fi

if [ "$MISSING_REQUIRED" = 1 ] || [ "$DRIFT" = 1 ]; then
  echo
  echo "FAIL: port contract drift or required container missing." >&2
  echo "  Prefer fixing publishes to match .env (static), not rewriting consumers." >&2
  echo "  Last resort: $0 --write-env   # only rewrites PROXY_PORT in .env" >&2
  exit 1
fi

echo
echo "OK: running containers match static .env ports."
exit 0
