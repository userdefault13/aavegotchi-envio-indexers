#!/usr/bin/env bash
# Envio codegen installs generated/ deps with pnpm. Corepack shims on Node 22 often
# fail with "Cannot find matching keyid" — use a real global pnpm instead.
set -euo pipefail

if pnpm --version >/dev/null 2>&1; then
  exit 0
fi

echo "pnpm not usable (Corepack signature error?). Installing pnpm@9.7.1 globally..."
if command -v corepack >/dev/null 2>&1; then
  corepack disable 2>/dev/null || true
fi
npm install -g pnpm@9.7.1
pnpm --version
