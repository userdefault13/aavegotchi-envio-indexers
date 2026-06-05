# Flux app specifications

Eight Flux apps for the split-stack deployment (deploy in order):

| Template | Default Flux app `name` | Contents |
|----------|-------------------------|----------|
| `core-base-spec.json` | `aavegotchicorev2` | Postgres + Hasura + core Envio indexer |
| `gotchiverse-base-spec.json` | `gotchiversebase` | Postgres + Hasura + gotchiverse Envio indexer |
| `svg-base-spec.json` | `aavegotchisvgbase` | Postgres + Hasura + SVG Envio indexer |
| `portal-base-spec.json` | `aavegotchiportalbase` | Postgres + Hasura + portal Envio indexer |
| `alchemica-base-spec.json` | `aavegotchialchemicabase` | Postgres + Hasura + alchemica Envio indexer |
| `gltr-staking-base-spec.json` | `aavegotchigltrstakingbase` | Postgres + Hasura + GLTR staking Envio indexer |
| `gbm-baazaar-base-spec.json` | `aavegotchigbmbase` | Postgres + Hasura + GBM Baazaar Envio indexer |
| `graphql-proxy-spec.json` | `aavegotchisubgraphproxy` | The Graph compatibility proxy (`:8787`) |

Optional single-app alternative: `monolith-base-spec.json` → `aavegotchimonolithbase` (postgres + hasura + indexer + proxy in one app).

Templates use `REPLACE_*` placeholders. **Do not upload templates directly.**

```bash
# From repo root, after .env is configured:
npm run flux:prepare
# → flux/out/*-spec.json (ready for FluxOS)

npm run flux:preflight   # validates all eight split-stack specs + proxy
npm run flux:print-env -- svg-base   # paste env into FluxOS Update
```

Override app names via `.env`: `FLUX_CORE_APP_NAME`, `FLUX_SVG_APP_NAME`, `FLUX_PORTAL_APP_NAME`, `FLUX_ALCHEMICA_APP_NAME`, `FLUX_STAKING_APP_NAME`, `FLUX_GBM_APP_NAME` (see `.env.example`).

Full guide: [docs/FLUX_DEPLOY.md](../docs/FLUX_DEPLOY.md).
