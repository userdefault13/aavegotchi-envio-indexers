#!/bin/sh
# Inject env-based RPC fallbacks, re-codegen if config changed, then start Envio.
set -eu

cd /envio-indexer

PATCH_SCRIPT="/opt/envio-scripts/ensure-base-rpc-fallbacks.mjs"
CONFIG_FILE="${CONFIG_FILE:-config.yaml}"

if [ -f "$PATCH_SCRIPT" ] && [ -f "$CONFIG_FILE" ]; then
  patch_result=$(node "$PATCH_SCRIPT" "$CONFIG_FILE")
  if [ "$patch_result" = "patched" ]; then
    echo "RPC fallbacks updated from env; running envio codegen..."
    npx envio codegen
    npm run build
  fi
fi

# Envio v2.26+: prefer ENVIO_TUI=false (TUI_OFF still honored in generated code paths)
export ENVIO_TUI="${ENVIO_TUI:-false}"

exec npx envio start
