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
| `services/graphql-proxy` | The Graph → Hasura translator | — |

## Quick start

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
npm run docker:proxy
npm run smoke
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/derive-gotchiverse-base-config.sh` | Derive Base start blocks via RPC |
| `scripts/parity-check.sh` | Compare Goldsky vs self-hosted proxy |
| `scripts/smoke-test.sh` | Health + schema smoke tests |
| `scripts/build-flux-images.sh` | Build (and `PUSH=1` push) Flux images |

## Production deploy

1. [Provision infra](docs/INFRA_SETUP.md) — Envio token, Flux wallet, Docker Hub
2. `PUSH=1 ENVIO_API_TOKEN=... ./scripts/build-flux-images.sh`
3. Edit `flux/*-spec.json` — replace `REPLACE_*` placeholders
4. Deploy via FluxOS dashboard
5. [Cloudflare tunnel](docs/CLOUDFLARE.md) for HTTPS
6. [Cut over clients](docs/CUTOVER.md)

## Goldsky parity endpoints (reference)

- Core: `https://api.goldsky.com/.../aavegotchi-core-base/prod/gn`
- Gotchiverse: `https://api.goldsky.com/.../gotchiverse-base/prod/gn`

## License

MIT — indexer handler logic derived from Aavegotchi subgraph repos (see upstream licenses).
