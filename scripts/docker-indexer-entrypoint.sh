#!/bin/sh
# Inject env-based RPC fallbacks and HyperSync URLs, re-codegen if config changed, then start Envio.
set -eu

cd /envio-indexer

CONFIG_FILE="${CONFIG_FILE:-config.yaml}"
needs_codegen=""

for script in /opt/envio-scripts/ensure-base-rpc-fallbacks.mjs /opt/envio-scripts/ensure-hypersync-url.mjs; do
  if [ -f "$script" ] && [ -f "$CONFIG_FILE" ]; then
    if [ "$(node "$script" "$CONFIG_FILE")" = "patched" ]; then
      echo "$(basename "$script") updated $CONFIG_FILE from env"
      needs_codegen=1
    fi
  fi
done

if [ -n "$needs_codegen" ]; then
  echo "running envio codegen..."
  npx envio codegen
  npm run build
fi

# Envio v2.26+: prefer ENVIO_TUI=false (TUI_OFF still honored in generated code paths)
export ENVIO_TUI="${ENVIO_TUI:-false}"

exec npx envio start
