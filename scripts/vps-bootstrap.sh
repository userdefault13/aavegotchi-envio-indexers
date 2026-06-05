#!/usr/bin/env bash
# First-time setup on a fresh Ubuntu VPS. Run as a user with sudo.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "${USER:-root}" || true
  echo "Log out and back in so 'docker' works without sudo, then re-run deploy."
fi

if ! command -v git >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y git
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — edit ENVIO_API_TOKEN, ENVIO_PG_PASSWORD, HASURA_GRAPHQL_ADMIN_SECRET, ALCHEMY_API_KEY"
  exit 1
fi

echo "Starting production stack..."
docker compose -f docker/production/docker-compose.yaml --env-file .env up -d --build

echo "Done. Check: docker compose -f docker/production/docker-compose.yaml ps"
echo "Proxy (local): curl -s http://127.0.0.1:8787/health"
