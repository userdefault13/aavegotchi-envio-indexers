# Cloudflare in Front of Indexers

Production GraphQL endpoints should not expose raw Flux/Hasura HTTP. Use Cloudflare for TLS and routing.

## Home PC / monolith (recommended for Aarcade)

One hostname in front of the compat proxy only (never Hasura):

- `subgraph.aarcadeghst.com` → `http://127.0.0.1:8787`

Require `X-Subgraph-Proxy-Key: $SUBGRAPH_PROXY_SECRET` on the proxy (set in `.env`). Aarcade server-side `/api/subgraph` forwards the same secret; browsers stay on same-origin `/api/subgraph/*`.

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: subgraph.aarcadeghst.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

```bash
# AarcadeGh-t (Vercel — never VITE_*)
AAVEGOTCHI_SUBGRAPH_PROXY_URL=https://subgraph.aarcadeghst.com/subgraphs/name
SUBGRAPH_PROXY_SECRET=...   # same as home .env
```

## Split hostnames (legacy Flux)

1. In Cloudflare Zero Trust → **Networks** → **Tunnels**, create a tunnel
2. Install `cloudflared` on a bridge host (or co-locate with proxy on Flux)
3. Route hostnames:
   - `core-subgraph.yourdomain.com` → `http://localhost:8787` (proxy core route)
   - `gotchiverse-subgraph.yourdomain.com` → `http://localhost:8787` (proxy gv route)

Or use path-based routing on one hostname:

- `https://subgraph.yourdomain.com/core` → core backend
- `https://subgraph.yourdomain.com/gotchiverse` → gotchiverse backend

## Example `cloudflared` config (split)

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: core-subgraph.yourdomain.com
    service: http://127.0.0.1:8787
  - hostname: gotchiverse-subgraph.yourdomain.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Set env vars after tunnel is live:

```bash
CORE_SUBGRAPH_PUBLIC_URL=https://core-subgraph.yourdomain.com
GOTCHIVERSE_SUBGRAPH_PUBLIC_URL=https://gotchiverse-subgraph.yourdomain.com
```

## Client cutover

Prefer server-side proxy URL (Aarcade). Direct SPA URLs (legacy):

```bash
VITE_BAAZAAR_SUBGRAPH_URL=https://core-subgraph.yourdomain.com/subgraphs/name/aavegotchi-core-base
CORE_SUBGRAPH_URL=https://core-subgraph.yourdomain.com/subgraphs/name/aavegotchi-core-base
GOTCHIVERSE_SUBGRAPH_URL=https://gotchiverse-subgraph.yourdomain.com/subgraphs/name/gotchiverse-base
```

Run dual-read validation with `npm run parity` before switching production traffic.

## Security

- Enable SSL/TLS mode **Full (strict)** when origin supports HTTPS
- Set `SUBGRAPH_PROXY_SECRET` and require `X-Subgraph-Proxy-Key` on GraphQL routes
- Optional: rate limit POST `/subgraphs/*` (GraphQL)
- Do not expose Hasura console publicly in production
