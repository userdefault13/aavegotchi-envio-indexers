#!/usr/bin/env bash
# Build and push Docker images for RunOnFlux deployment.
# Flux nodes are amd64 — build with linux/amd64 even on Apple Silicon Macs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[ -f "$ROOT/.env" ] && source "$ROOT/.env"

DOCKER_USER="${DOCKERHUB_USER:-userdefault13}"
TAG="${1:-latest}"
ENVIO_TOKEN="${ENVIO_API_TOKEN:-development}"
PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

docker buildx inspect flux-builder >/dev/null 2>&1 || docker buildx create --name flux-builder --use
docker buildx use flux-builder

build_indexer_image() {
  local name="$1"
  local dockerfile="$2"
  local context="$3"
  local image="${DOCKER_USER}/${name}:${TAG}"

  echo "Building ${image} for ${PLATFORM}..."
  if [ "${PUSH:-0}" = "1" ]; then
    docker buildx build \
      --platform "$PLATFORM" \
      --build-arg "ENVIO_API_TOKEN=$ENVIO_TOKEN" \
      -t "$image" \
      -f "$dockerfile" \
      --push \
      "$context"
  else
    docker buildx build \
      --platform "$PLATFORM" \
      --build-arg "ENVIO_API_TOKEN=$ENVIO_TOKEN" \
      -t "$image" \
      -f "$dockerfile" \
      --load \
      "$context"
  fi
}

build_proxy_image() {
  local image="${DOCKER_USER}/aavegotchi-graphql-proxy:${TAG}"
  echo "Building ${image} for ${PLATFORM}..."
  if [ "${PUSH:-0}" = "1" ]; then
    docker buildx build \
      --platform "$PLATFORM" \
      -t "$image" \
      -f "$ROOT/services/graphql-proxy/Dockerfile" \
      --push \
      "$ROOT/services/graphql-proxy"
  else
    docker buildx build \
      --platform "$PLATFORM" \
      -t "$image" \
      -f "$ROOT/services/graphql-proxy/Dockerfile" \
      --load \
      "$ROOT/services/graphql-proxy"
  fi
}

# BUILD_ONLY=gbm,proxy  (comma-separated) — skip images already on Hub
ONLY="${BUILD_ONLY:-}"
should_build() {
  [ -z "$ONLY" ] && return 0
  local key="$1"
  case ",${ONLY}," in
    *,"${key}",*) return 0 ;;
    *) return 1 ;;
  esac
}

if should_build core; then
  build_indexer_image "aavegotchi-core-envio" "$ROOT/packages/core-base/Dockerfile" "$ROOT"
fi
if should_build gv; then
  build_indexer_image "aavegotchi-gotchiverse-envio" "$ROOT/packages/gotchiverse-base/Dockerfile" "$ROOT"
fi
if should_build svg; then
  build_indexer_image "aavegotchi-svg-envio" "$ROOT/packages/svg-base/Dockerfile" "$ROOT"
fi
if should_build portal; then
  build_indexer_image "aavegotchi-portal-envio" "$ROOT/packages/portal-base/Dockerfile" "$ROOT"
fi
if should_build alchemica; then
  build_indexer_image "aavegotchi-alchemica-envio" "$ROOT/packages/alchemica-base/Dockerfile" "$ROOT"
fi
if should_build staking; then
  build_indexer_image "aavegotchi-gltr-staking-envio" "$ROOT/packages/gltr-staking-base/Dockerfile" "$ROOT"
fi
if should_build gbm; then
  build_indexer_image "aavegotchi-gbm-envio" "$ROOT/packages/gbm-baazaar-base/Dockerfile" "$ROOT"
fi
if should_build monolith; then
  build_indexer_image "aavegotchi-monolith-envio" "$ROOT/packages/aavegotchi-monolith-base/Dockerfile" "$ROOT"
fi
if should_build proxy; then
  build_proxy_image
fi

if [ "${PUSH:-0}" = "1" ]; then
  echo "Pushed all images to Docker Hub (${DOCKER_USER}/*:${TAG}, platform=${PLATFORM})"
else
  echo "Built locally (${PLATFORM}). Set PUSH=1 to push to Docker Hub."
fi
