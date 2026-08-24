# Aavegotchi Envio Indexers

Self-hosted **Aavegotchi Core** and **Gotchiverse** GraphQL indexers on **Base mainnet**, built with [Envio HyperIndex](https://docs.envio.dev), **Docker**, and [RunOnFlux](https://runonflux.io).

Includes a **GraphQL compatibility proxy** so existing apps can keep using The Graph-style queries without code changes.

## Architecture

```
Base chain → Envio indexers → Hasura → Compat proxy → Apps (AarcadeGh-t, CLI, skills)
                ↑ Docker / RunOnFlux
```

| Package | Source | Chain |
|---------|--------|-------|
| `packages/core-base` | [aavegotchi-core-subgraph](https://github.com/aavegotchi/aavegotchi-core-subgraph) | Base (8453) |
| `packages/gotchiverse-base` | [gotchiverse-subgraph](https://github.com/aavegotchi/gotchiverse-subgraph) | Base (8453) |
| `packages/svg-base` | [aavegotchi-svg-subgraph](https://github.com/aavegotchi/aavegotchi-svg-subgraph) | Base (8453) |
| `packages/portal-base` | [aavegotchi-portal-svg-subgraph](https://github.com/aavegotchi/aavegotchi-portal-svg-subgraph) | Base (8453) |
| `packages/alchemica-base` | [aavegotchi-alchemica-subgraph](https://github.com/aavegotchi/aavegotchi-alchemica-subgraph) | Base (8453) |
| `packages/gltr-staking-base` | [aavegotchi-gltr-staking-subgraph](https://github.com/aavegotchi/aavegotchi-gltr-staking-subgraph) | Base (8453) |
| `services/graphql-proxy` | The Graph → Hasura translator | — |

## RPC fallback (HyperSync + Base RPC)

HyperSync is the default data source on Base. Set `ALCHEMY_API_KEY` or `BASE_MAINNET_RPC` in `.env`; the Docker entrypoint injects that URL as **`for: sync`** (RPC historical sync — use when HyperSync returns block-hash parse errors) plus public **`for: fallback`** endpoints. See [Envio RPC sync](https://docs.envio.dev/docs/HyperIndex/rpc-sync).

## Quick start

If `envio codegen` fails with **Cannot find matching keyid** (Corepack / pnpm), run once:

```bash
corepack disable 2>/dev/null || true
npm install -g pnpm@9.7.1
```

Or use `bash scripts/ensure-pnpm.sh` (also runs automatically before `npm run codegen:*`).

```bash
cp .env.example .env
# Set ENVIO_API_TOKEN from https://envio.dev

# Install & build indexers
cd packages/core-base && npm install && ENVIO_API_TOKEN=... npm run codegen && npm run build
cd ../gotchiverse-base && npm install && ENVIO_API_TOKEN=... npm run codegen && npm run build

# Build proxy
cd ../../services/graphql-proxy && npm install && npm run build

# Run stacks (requires Docker)
cd ../..
chmod +x scripts/*.sh
npm run docker:core
npm run docker:gv
npm run docker:svg
npm run docker:portal
npm run docker:alchemica
npm run docker:staking
npm run docker:proxy
npm run smoke
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/derive-gotchiverse-base-config.sh` | Derive Base start blocks via RPC |
| `scripts/parity-check.sh` | Compare Goldsky vs self-hosted proxy |
| `scripts/reconcile-erc1155-listings.mjs` | Patch stale ERC1155 listing sold/cancelled/qty from chain |
| `scripts/smoke-test.sh` | Health + schema smoke tests |
| `scripts/build-flux-images.sh` | Build (and `PUSH=1` push) Flux images |

## Production deploy (VPS — recommended)

Cheapest path without FLUX tokens: one server (e.g. **Hetzner ~$50/mo**).

1. [VPS guide](docs/VPS_DEPLOY.md) — create server, `.env`, `npm run docker:prod`
2. [Cloudflare tunnel](docs/CLOUDFLARE.md) for HTTPS
3. [Cut over clients](docs/CUTOVER.md)

Optional: [RunOnFlux](docs/FLUX_DEPLOY.md) if you can fund FLUX renewals.

## Goldsky parity endpoints (reference)

- Core: `https://api.goldsky.com/.../aavegotchi-core-base/prod/gn`
- Gotchiverse: `https://api.goldsky.com/.../gotchiverse-base/prod/gn`

## License

MIT — indexer handler logic derived from Aavegotchi subgraph repos (see upstream licenses).
