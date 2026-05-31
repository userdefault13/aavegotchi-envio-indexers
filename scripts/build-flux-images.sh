#!/usr/bin/env bash
# Build and push Docker images for RunOnFlux deployment.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[ -f "$ROOT/.env" ] && source "$ROOT/.env"

USER="${DOCKERHUB_USER:-userdefault13}"
TAG="${1:-latest}"
ENVIO_TOKEN="${ENVIO_API_TOKEN:-development}"

echo "Building core indexer..."
docker build \
  --build-arg "ENVIO_API_TOKEN=$ENVIO_TOKEN" \
  -t "$USER/aavegotchi-core-envio:$TAG" \
  "$ROOT/packages/core-base"

echo "Building gotchiverse indexer..."
docker build \
  --build-arg "ENVIO_API_TOKEN=$ENVIO_TOKEN" \
  -t "$USER/aavegotchi-gotchiverse-envio:$TAG" \
  "$ROOT/packages/gotchiverse-base"

echo "Building graphql proxy..."
docker build \
  -t "$USER/aavegotchi-graphql-proxy:$TAG" \
  "$ROOT/services/graphql-proxy"

if [ "${PUSH:-0}" = "1" ]; then
  docker push "$USER/aavegotchi-core-envio:$TAG"
  docker push "$USER/aavegotchi-gotchiverse-envio:$TAG"
  docker push "$USER/aavegotchi-graphql-proxy:$TAG"
  echo "Pushed all images to Docker Hub"
else
  echo "Built locally. Set PUSH=1 to push to Docker Hub."
fi
