#!/usr/bin/env bash
# Deploy services/graphql-proxy to the monolith stack on the home box (omarchyM1), safely.
#
#   scripts/deploy-graphql-proxy.sh                 deploy this checkout's proxy to omarchyM1
#   scripts/deploy-graphql-proxy.sh --dry-run       preflight only; change nothing
#   scripts/deploy-graphql-proxy.sh --smoke         only smoke-test the running proxy (read-only)
#   DEPLOY_HOST=user@box DEPLOY_DIR='~/Dev/envio-park' scripts/deploy-graphql-proxy.sh
#
# Why this exists: the stack's secrets (HASURA_GRAPHQL_ADMIN_SECRET, SUBGRAPH_PROXY_SECRET, PROXY_BIND…)
# live in the *repo-root* .env. Running `docker compose up` from docker/monolith-base/ doesn't read it,
# so HASURA_ADMIN_SECRET silently falls back to "testing" and every subgraph query 500s
# ("invalid x-hasura-admin-secret"). That caused a ~4 min outage on 2026-09-28. This script always uses
# the same compose invocation as scripts/docker-monolith-up.sh (from the repo root, --env-file .env).
#
# Steps: local tests → remote preflight → backup (src + image tag) → rsync → rebuild only graphql-proxy
#        → smoke test from inside the container → automatic rollback if the smoke test fails.
set -euo pipefail

HOST="${DEPLOY_HOST:-user_default@omarchym1}"
DIR="${DEPLOY_DIR:-~/Dev/envio-park}"
SERVICE=graphql-proxy
CONTAINER=aavegotchi-monolith-base-graphql-proxy-1
IMAGE=aavegotchi-monolith-base-graphql-proxy
# Identical to scripts/docker-monolith-up.sh's compose call. Keep them in sync.
COMPOSE="docker compose -f docker/monolith-base/docker-compose.yaml --env-file .env"
DRY_RUN=0
SMOKE_ONLY=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1
[ "${1:-}" = "--smoke" ] && SMOKE_ONLY=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
say() { printf '\n== %s\n' "$*"; }
remote() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "cd $DIR && $1"; }

# Query the proxy from inside its own container with its own env, so this tests exactly what callers
# get: the admin secret must work (a real block number, not 0) and a plain entity query must return rows.
smoke() {
  remote "
    for i in \$(seq 30); do docker inspect -f '{{.State.Running}}' $CONTAINER 2>/dev/null | grep -q true && break; sleep 1; done
    docker exec $CONTAINER node -e '
      const url = \"http://127.0.0.1:8787/subgraphs/name/aavegotchi-core-base\";
      const headers = { \"Content-Type\": \"application/json\", \"X-Subgraph-Proxy-Key\": process.env.SUBGRAPH_PROXY_SECRET || \"\" };
      const q = async (query) => { const r = await fetch(url, { method: \"POST\", headers, body: JSON.stringify({ query }) }); return [r.status, await r.json().catch(() => ({}))]; };
      (async () => {
        const [s1, meta] = await q(\"{ _meta { block { number } } }\");
        const [s2, users] = await q(\"{ users(first: 1) { id } }\");
        const block = meta?.data?._meta?.block?.number;
        const ok = s1 === 200 && block > 0 && s2 === 200 && users?.data?.users?.length === 1;
        console.log(ok ? \`smoke ok: block \${block}, users query returns rows\` : \`smoke FAILED: _meta \${s1} block=\${block} \${JSON.stringify(meta).slice(0, 160)} | users \${s2} \${JSON.stringify(users).slice(0, 160)}\`);
        process.exit(ok ? 0 : 1);
      })().catch((e) => { console.log(\"smoke FAILED:\", e.message); process.exit(1); });
    '
  "
}

if [ "$SMOKE_ONLY" = 1 ]; then
  say "smoke test (read-only) against $HOST"
  smoke
  exit $?
fi

say "local: tests and type-check ($ROOT/services/$SERVICE)"
(cd "$ROOT/services/$SERVICE" && npm test --silent && npx --no-install tsc --noEmit)

say "remote preflight: $HOST:$DIR"
remote "
  set -e
  test -f docker/monolith-base/docker-compose.yaml || { echo 'no docker/monolith-base/docker-compose.yaml here'; exit 1; }
  test -f .env || { echo 'no repo-root .env: refusing (the proxy would start with default secrets)'; exit 1; }
  for key in HASURA_GRAPHQL_ADMIN_SECRET SUBGRAPH_PROXY_SECRET; do
    grep -q \"^\$key=.\" .env || { echo \"\$key is not set in .env: refusing\"; exit 1; }
  done
  docker inspect -f '{{.State.Status}}' $CONTAINER >/dev/null
  echo 'ok: compose file, .env with secrets (values not shown), running $CONTAINER'
"
if [ "$DRY_RUN" = 1 ]; then
  say "dry run: stopping before any change"
  exit 0
fi

say "backup: services/$SERVICE/src.bak-$STAMP and image tag $IMAGE:pre-$STAMP"
remote "cp -a services/$SERVICE/src services/$SERVICE/src.bak-$STAMP && docker tag $IMAGE:latest $IMAGE:pre-$STAMP"

say "sync source"
rsync -a --delete --exclude node_modules --exclude dist --exclude 'src.bak-*' \
  "$ROOT/services/$SERVICE/src/" "$HOST:$DIR/services/$SERVICE/src/"
for f in package.json package-lock.json tsconfig.json Dockerfile; do
  [ -f "$ROOT/services/$SERVICE/$f" ] && rsync -a "$ROOT/services/$SERVICE/$f" "$HOST:$DIR/services/$SERVICE/$f"
done

say "rebuild and recreate $SERVICE only"
remote "$COMPOSE up -d --build --no-deps $SERVICE"

say "smoke test"
if smoke; then
  say "deployed. Rollback if needed later: restore services/$SERVICE/src.bak-$STAMP, then"
  echo "  ssh $HOST 'cd $DIR && docker tag $IMAGE:pre-$STAMP $IMAGE:latest && $COMPOSE up -d --no-build --no-deps $SERVICE'"
  exit 0
fi

say "smoke test failed: rolling back to $IMAGE:pre-$STAMP"
remote "
  rm -rf services/$SERVICE/src && mv services/$SERVICE/src.bak-$STAMP services/$SERVICE/src
  docker tag $IMAGE:pre-$STAMP $IMAGE:latest
  $COMPOSE up -d --no-build --no-deps $SERVICE
"
if smoke; then
  say "rolled back; the previous version is serving again. The new build did not pass; see above."
else
  say "ROLLBACK SMOKE TEST ALSO FAILED: check the proxy on $HOST now (docker logs $CONTAINER)."
fi
exit 1
