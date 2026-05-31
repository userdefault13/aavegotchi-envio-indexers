# Client Cutover Guide

Replace Goldsky URLs with self-hosted proxy URLs after parity validation.

## 1. Validate

```bash
npm run parity
```

Ensure indexers are synced and proxy returns data for canonical queries.

## 2. Production URLs (via Cloudflare)

After Cloudflare tunnel is live (see [docs/CLOUDFLARE.md](./CLOUDFLARE.md)):

| Variable | Self-hosted value |
|---|---|
| `VITE_BAAZAAR_SUBGRAPH_URL` | `https://core-subgraph.yourdomain.com/subgraphs/name/aavegotchi-core-base` |
| `VITE_GOLDSKY_LENDING_URL` | same as core URL |
| `CORE_SUBGRAPH_URL` | same as core URL |
| `GOTCHIVERSE_SUBGRAPH_URL` | `https://gotchiverse-subgraph.yourdomain.com/subgraphs/name/gotchiverse-base` |

## 3. Dual-read period

Keep Goldsky env vars as `_GOLDSKY_FALLBACK` and compare responses in staging before flipping production.

## 4. Rollback

Point env vars back to Goldsky URLs:

```
https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn
https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/gotchiverse-base/prod/gn
```

No application code changes required when using the compat proxy.
