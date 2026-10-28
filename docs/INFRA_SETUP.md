# Infrastructure Setup

Provision these accounts before first production deploy.

## 1. Envio API token

1. Sign up at [envio.dev](https://envio.dev)
2. Open **API Tokens** and create a token
3. Set `ENVIO_API_TOKEN` in `.env` (required for HyperSync on Base, even when self-hosting)

## 2. Base RPC

Start with public RPC:

```bash
BASE_MAINNET_RPC=https://mainnet.base.org
```

Upgrade to a paid archive endpoint (Alchemy, QuickNode, etc.) if sync stalls or rate-limits.

Both indexers use **HyperSync as primary** and **RPC `for: fallback`** when head polling stalls (~20s) or HyperSync errors (e.g. TLS close_notify). `config.yaml` includes public Base fallbacks; set `ALCHEMY_API_KEY` or `BASE_MAINNET_RPC` in `.env` so Docker entrypoint prepends your paid RPC before `envio start`. Optional: `BASE_RPC_FALLBACK_URLS` (comma-separated).

See [Envio RPC fallback guide](https://docs.envio.dev/docs/HyperIndex/rpc-sync).

## 3. Production VPS (recommended)

See **[VPS_DEPLOY.md](./VPS_DEPLOY.md)** — Hetzner/OVH ~**$50–80/mo** for the full stack.

```bash
npm run docker:prod
```

## 4. Cloudflare

See [CLOUDFLARE.md](./CLOUDFLARE.md) for tunnel setup in front of the GraphQL proxy.

## Local quick start

```bash
cp .env.example .env
# edit ENVIO_API_TOKEN (runtime-only; codegen/build don't need it)

cd packages/core-base && npm install && npm run codegen && npm run build
cd ../gotchiverse-base && npm install && npm run codegen && npm run build

cd ../..
npm run docker:core
npm run docker:gv
npm run docker:proxy
npm run smoke
```
