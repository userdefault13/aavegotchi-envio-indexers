# RunOnFlux deployment guide

Deploy **seven split indexers** (core, gotchiverse, svg, portal, alchemica, GLTR staking, GBM) plus the **GraphQL compatibility proxy** as eight Flux apps.

## Architecture

```
Clients → Cloudflare Tunnel → graphql-proxy (Flux app 8)
                                    ├→ https://aavegotchicorev2_8080.app.runonflux.io
                                    ├→ https://gotchiversebase_8080.app.runonflux.io
                                    ├→ https://aavegotchisvgbase_8080.app.runonflux.io
                                    ├→ https://aavegotchiportalbase_8080.app.runonflux.io
                                    ├→ https://aavegotchialchemicabase_8080.app.runonflux.io
                                    ├→ https://aavegotchigltrstakingbase_8080.app.runonflux.io
                                    └→ https://aavegotchigbmbase_8080.app.runonflux.io

Flux app 1 (aavegotchicorev2):           postgres + hasura + envio-indexer
Flux app 2 (gotchiversebase):            postgres + hasura + envio-indexer
Flux app 3 (aavegotchisvgbase):          postgres + hasura + envio-indexer
Flux app 4 (aavegotchiportalbase):       postgres + hasura + envio-indexer
Flux app 5 (aavegotchialchemicabase):    postgres + hasura + envio-indexer
Flux app 6 (aavegotchigltrstakingbase):  postgres + hasura + envio-indexer
Flux app 7 (aavegotchigbmbase):          postgres + hasura + envio-indexer
Flux app 8 (aavegotchisubgraphproxy):    proxy :8787
```

- **`instances: 1`** per app (default) — one Postgres per indexer. Do not use `3` unless you understand Flux data sync.
- Hasura is **not** exposed publicly on indexer apps by default in older specs; the **proxy** (separate Flux app) reaches Hasura via public Flux URLs `https://<appname>_8080.app.runonflux.io` after you expose hasura port **8080** on each indexer.
- Internal DNS `fluxhasura_<appname>` only works **within the same Flux app** (postgres ↔ hasura ↔ indexer), not from the proxy app.

**Alternative:** deploy `flux/out/monolith-base-spec.json` as a single app (`aavegotchimonolithbase`) with postgres + hasura + indexer + proxy — simpler ops, heavier sync.

## Prerequisites

1. [Zelcore](https://zelcore.io) wallet with FLUX for monthly renewals.
2. [Envio API token](https://envio.dev/app/api-tokens) → `ENVIO_API_TOKEN`
3. Docker Hub account → `DOCKERHUB_USER`
4. Strong secrets in `.env` (see `.env.example`)

## 1. Configure `.env`

```bash
cp .env.example .env
```

Required for Flux:

```bash
FLUX_ZELID=your_zelid
ENVIO_PG_PASSWORD=long-random-password   # Postgres DB password (you generate)
HASURA_GRAPHQL_ADMIN_SECRET=long-random-secret
ENVIO_API_TOKEN=your_envio_token           # from envio.dev only
DOCKERHUB_USER=your_dockerhub_user
ALCHEMY_API_KEY=your_key          # recommended for RPC fallback
```

Optional app name overrides (must match what you register in FluxOS):

```bash
FLUX_CORE_APP_NAME=aavegotchicorev2
FLUX_GV_APP_NAME=gotchiversebase
FLUX_SVG_APP_NAME=aavegotchisvgbase
FLUX_PORTAL_APP_NAME=aavegotchiportalbase
FLUX_ALCHEMICA_APP_NAME=aavegotchialchemicabase
FLUX_STAKING_APP_NAME=aavegotchigltrstakingbase
FLUX_GBM_APP_NAME=aavegotchigbmbase
FLUX_INSTANCES=1                  # default; use 1 for production
FLUX_IMAGE_TAG=latest
FLUX_CONTACT_EMAIL=you@example.com
FLUX_GEOLOCATION=na               # na, eu, as (comma-separated)
BASE_MAINNET_RPC=                  # overrides Alchemy URL for indexers
```

## 2. Test locally before Flux (saves FLUX on bad updates)

Flux charges for register/update — validate on your Mac first:

```bash
# Fast: check .env + generated flux/out/*.json (all 8 split-stack specs)
npm run flux:preflight

# Full: same 3 containers as Flux core app (postgres + hasura + indexer)
npm run flux:test:core
```

**One Postgres password:** `ENVIO_PG_PASSWORD` in `.env` is used for local Docker and for `flux:prepare` (Flux postgres + indexer + hasura URL). Not your Envio account password or Flux wallet.

**What preflight catches:** `REPLACE_*` in specs, mismatched Postgres password across postgres/indexer/hasura, missing RPC, wrong owner/repotag, all seven Hasura URLs in graphql-proxy.

**Local per-indexer smoke tests** (one Envio indexer at a time on free tier):

```bash
npm run docker:svg && npm run docker:svg:down
npm run docker:portal && npm run docker:portal:down
npm run docker:alchemica && npm run docker:alchemica:down
npm run docker:staking && npm run docker:staking:down
npm run docker:gbm && npm run docker:gbm:down
```

## 3. Build and push images

Flux nodes run **linux/amd64**. On a Mac (arm64), you must build for amd64 (the script does this automatically):

```bash
chmod +x scripts/build-flux-images.sh
ENVIO_API_TOKEN=your_token PUSH=1 ./scripts/build-flux-images.sh
```

Or:

```bash
PUSH=1 npm run flux:build:push
```

**Verify architecture** (Flux needs `linux/amd64`):

```bash
docker buildx imagetools inspect $DOCKERHUB_USER/aavegotchi-svg-envio:latest
```

Images pushed:

- `$DOCKERHUB_USER/aavegotchi-core-envio:latest`
- `$DOCKERHUB_USER/aavegotchi-gotchiverse-envio:latest`
- `$DOCKERHUB_USER/aavegotchi-svg-envio:latest`
- `$DOCKERHUB_USER/aavegotchi-portal-envio:latest`
- `$DOCKERHUB_USER/aavegotchi-alchemica-envio:latest`
- `$DOCKERHUB_USER/aavegotchi-gltr-staking-envio:latest`
- `$DOCKERHUB_USER/aavegotchi-gbm-envio:latest`
- `$DOCKERHUB_USER/aavegotchi-graphql-proxy:latest`

The portal image includes `portal-transfer-token-ids.json` (baked at build time from `packages/portal-base/`). Re-export locally with `npm run portal:export-transfer-ids` before pushing if you need an updated whitelist.

## 4. Prepare Flux JSON specs

```bash
npm run flux:prepare
```

Writes filled specs to `flux/out/` (gitignored). Review before uploading.

```bash
npm run flux:print-env -- svg-base   # optional: copy env for FluxOS Update
```

## 5. Register apps on FluxOS

Open [home.runonflux.io](https://home.runonflux.io) → **Applications** → **Register New App**.

**Order matters** — deploy all seven indexers before the proxy:

| Step | File | Default app name |
|------|------|------------------|
| 1 | `flux/out/core-base-spec.json` | `aavegotchicorev2` |
| 2 | `flux/out/gotchiverse-base-spec.json` | `gotchiversebase` |
| 3 | `flux/out/svg-base-spec.json` | `aavegotchisvgbase` |
| 4 | `flux/out/portal-base-spec.json` | `aavegotchiportalbase` |
| 5 | `flux/out/alchemica-base-spec.json` | `aavegotchialchemicabase` |
| 6 | `flux/out/gltr-staking-base-spec.json` | `aavegotchigltrstakingbase` |
| 7 | `flux/out/gbm-baazaar-base-spec.json` | `aavegotchigbmbase` |
| 8 | `flux/out/graphql-proxy-spec.json` | `aavegotchisubgraphproxy` |

For each app:

1. Paste or upload the JSON from `flux/out/`.
2. Confirm the **FLUX/month** estimate in the UI.
3. Approve the transaction in Zelcore.
4. Wait until status shows **running** before deploying the next app.

**First deploy only:** Postgres starts empty; Envio will historical-sync from `start_block` in each `config.yaml` (hours per indexer). Monitor logs in FluxOS.

### Reset Postgres on an existing app

If you see `password authentication failed` after fixing env vars, Postgres was initialized with an **old** password. Updating `POSTGRES_PASSWORD` in the UI does **not** change data already on disk.

**Option A — New deploy with fresh Postgres (recommended):**

1. Register a **new app name** (e.g. `aavegotchisvgbasev2`), paste the spec with `"name"` updated.
2. Update **graphql-proxy** env to point at `fluxhasura_<newappname>` for that stack.
3. Cancel or let the old subscription expire.

**Option C — Match the old password:** only to recover access; plan Option A with a strong password from `openssl rand -hex 32`.

See earlier core-specific notes in git history if you need Container Data Path details.

## 6. Verify on Flux

After each indexer app is syncing:

- FluxOS → app → **Logs** → `indexer` component — no crash loop.
- SVG/portal: confirm filtered `Transfer` handlers are not stuck mid-chain.

After proxy is up:

```bash
curl -s "https://YOUR_PROXY_FLUX_URL/health"
curl -s "https://YOUR_PROXY_FLUX_URL/subgraphs/name/aavegotchi-svg-base" \
  -H 'content-type: application/json' \
  --data '{"query":"{ __schema { queryType { name } } }"}'
```

Subgraph names exposed by the proxy include: `aavegotchi-core-base`, `gotchiverse-base`, `aavegotchi-svg-base`, `aavegotchi-portal-base`, `aavegotchi-alchemica-base`, `aavegotchi-gltr-staking-base`.

## 7. Cloudflare (production TLS)

See [CLOUDFLARE.md](./CLOUDFLARE.md). Point tunnel at the **proxy** Flux URL.

## 8. Parity and cutover

From your laptop (proxy reachable):

```bash
PROXY_URL=https://YOUR_PROXY_FLUX_URL npm run parity
```

Then update clients per [CUTOVER.md](./CUTOVER.md).

## Monthly renewal

Flux apps bill in **FLUX** per month. Renew **each** app in FluxOS before expiry. Budget ~350–500 FLUX/month for the full eight-app split stack at 1 instance each (varies with Flux pricing).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Proxy `fetch failed` on subgraph query | Split Flux apps cannot use internal `fluxhasura_*` DNS across apps. Expose **hasura port 8080** on each indexer app, then point proxy at `https://<appname>_8080.app.runonflux.io/v1/graphql` (see below) |
| Proxy cannot reach Hasura | Deploy all seven indexers **before** proxy; Hasura must be on public port **8080** per app; proxy env uses `https://*_8080.app.runonflux.io` URLs (including `GBM_HASURA_URL`) |
| Portal/SVG stuck syncing | Ensure latest images with filtered Transfer handlers; check indexer logs |
| Indexer OOM | Increase `ram` on `indexer` component in spec (FluxOS edit / redeploy) |
| HyperSync TLS / 429 errors | Set `ALCHEMY_API_KEY` in `.env`, re-run `npm run flux:prepare`, redeploy indexer |
| Wrong subgraph data | Ensure `instances: 1`; never run multiple Postgres without sync |
| `architecture amd64 not supported` | Rebuild with `PUSH=1` on linux/amd64 via `build-flux-images.sh` |

## Cost reference

Split stack (7 apps × 1 instance) costs more FLUX/month than the monolith single-app option. See infra notes in [INFRA_SETUP.md](./INFRA_SETUP.md).
