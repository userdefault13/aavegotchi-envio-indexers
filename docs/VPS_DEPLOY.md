# VPS deployment (cheapest self-host)

Run **core + gotchiverse + GraphQL proxy** on one Linux server. No FLUX tokens required.

## Recommended providers (cheapest first)

| Provider | Example plan | RAM | Disk | ~USD/mo |
|----------|--------------|-----|------|---------|
| **[Hetzner](https://www.hetzner.com/cloud)** | CCX33 (dedicated) or CPX41 | 32 GB / 16 GB | 240+ GB | **~$50–65** |
| **[OVH](https://www.ovhcloud.com)** | VPS Elite / similar | 16–32 GB | 200+ GB | **~$50–80** |
| **[DigitalOcean](https://www.digitalocean.com)** | Memory-Optimized 4 vCPU | 32 GB | 100 GB + volume | **~$200+** |
| **[Vultr](https://www.vultr.com)** | High memory | 32 GB | 200+ GB | **~$80–120** |

**Pick Hetzner CCX33 (32 GB RAM)** if you want the best price for this stack (~29 GB RAM used at Flux spec sizes).

**Region:** US (Ashburn) or EU — close to your users and your RPC provider.

## What runs on the server

```
Internet → Cloudflare Tunnel (recommended) → graphql-proxy :8787
                ├→ core-hasura → core-postgres + core-indexer
                └→ gv-hasura    → gv-postgres    + gv-indexer
```

Only **8787** should be reachable from the internet (or only via Cloudflare Tunnel on `127.0.0.1`).

## 1. Create the VPS

- **OS:** Ubuntu 24.04 LTS  
- **SSH key** authentication (disable password login later)  
- **Disk:** ≥ 300 GB if you keep full indexer history on one volume  

## 2. Bootstrap the server

SSH in as root or sudo user:

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# log out and back in

# Firewall (SSH + optional local proxy only)
sudo ufw allow OpenSSH
sudo ufw enable
```

## 3. Deploy the repo

```bash
sudo mkdir -p /opt/aavegotchi-indexers
sudo chown "$USER:$USER" /opt/aavegotchi-indexers
git clone https://github.com/YOUR_ORG/aavegotchi-envio-indexers.git /opt/aavegotchi-indexers
cd /opt/aavegotchi-indexers
cp .env.example .env
nano .env   # secrets below
```

### Required `.env` on the server

```bash
ENVIO_API_TOKEN=...
ENVIO_PG_PASSWORD=...
HASURA_GRAPHQL_ADMIN_SECRET=...
ALCHEMY_API_KEY=...              # strongly recommended
HASURA_GRAPHQL_ENABLE_CONSOLE=false
PROXY_BIND=127.0.0.1             # only Cloudflare tunnel hits proxy
PROXY_PORT=8787
```

## 4. Start production stack

```bash
cd /opt/aavegotchi-indexers
npm run docker:prod
```

Or manually:

```bash
docker compose -f docker/production/docker-compose.yaml --env-file .env up -d --build
```

**First sync** from `start_block` can take many hours. Watch logs:

```bash
docker compose -f docker/production/docker-compose.yaml logs -f core-indexer
docker compose -f docker/production/docker-compose.yaml logs -f gv-indexer
```

Check sync:

```bash
docker compose -f docker/production/docker-compose.yaml exec core-postgres \
  psql -U postgres -d envio-core -c \
  "SELECT latest_processed_block, block_height FROM envio.chain_metadata;"
```

## 5. HTTPS with Cloudflare Tunnel

On the VPS:

```bash
# Install cloudflared — see https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
sudo cloudflared service install <TUNNEL_TOKEN>
```

Point hostnames at `http://127.0.0.1:8787` (see [CLOUDFLARE.md](./CLOUDFLARE.md)).

## 6. Verify and cut over

From your laptop:

```bash
PROXY_URL=https://core-subgraph.yourdomain.com npm run parity
```

Then [CUTOVER.md](./CUTOVER.md).

## Updates

```bash
cd /opt/aavegotchi-indexers
git pull
npm run docker:prod
```

## Backups

```bash
# Daily cron example — dump both DBs to /backup
docker compose -f docker/production/docker-compose.yaml exec -T core-postgres \
  pg_dump -U postgres envio-core | gzip > /backup/envio-core-$(date +%F).sql.gz
docker compose -f docker/production/docker-compose.yaml exec -T gv-postgres \
  pg_dump -U postgres envio-gv | gzip > /backup/envio-gv-$(date +%F).sql.gz
```

## Optional: expose proxy publicly (not recommended)

Set in `.env`:

```bash
PROXY_BIND=0.0.0.0
```

And `sudo ufw allow 8787/tcp` — prefer Cloudflare instead.

## Cost summary (monthly)

| Item | ~USD |
|------|------|
| Hetzner CCX33 (32 GB) | **~$52** |
| Envio API token | $0–? |
| Alchemy RPC | $0–49 |
| Cloudflare | $0 |
| **Total** | **~$55–110** |

vs Flux (~$7–12 in FLUX, but you need tokens) or Goldsky (~$100–500+).
