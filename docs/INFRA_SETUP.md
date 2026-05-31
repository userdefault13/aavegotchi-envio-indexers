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

## 3. RunOnFlux

1. Install [Zelcore](https://zelcore.io) and create a wallet
2. Copy your **ZELID** → `FLUX_ZELID`
3. Fund FLUX for deployments (minimum **3 instances** per app)
4. Deploy via [FluxOS](https://home.runonflux.io/) using specs in `flux/`

## 4. Docker Hub

1. Create account `userdefault13` (or your org user)
2. Set `DOCKERHUB_USER=userdefault13`
3. Build and push images:

```bash
docker build -t userdefault13/aavegotchi-core-envio:latest packages/core-base
docker push userdefault13/aavegotchi-core-envio:latest
```

## 5. Cloudflare

See [CLOUDFLARE.md](./CLOUDFLARE.md) for tunnel setup in front of Flux endpoints.

## Local quick start

```bash
cp .env.example .env
# edit ENVIO_API_TOKEN

cd packages/core-base && npm install && ENVIO_API_TOKEN=... npm run codegen && npm run build
cd ../gotchiverse-base && npm install && ENVIO_API_TOKEN=... npm run codegen && npm run build

cd ../..
npm run docker:core
npm run docker:gv
npm run docker:proxy
npm run smoke
```
