# gotchi-polygon-seed.json

One-time snapshot of Polygon-era / migration fields for all 20,544 Aavegotchis,
taken from Goldsky's public `aavegotchi-core-base` subgraph
(`https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn`),
pinned to the subgraph block recorded in `atBlock`.

Row layout: `[createdAt, createdAtPolygon, claimedAt, claimedAtPolygon, claimedTime]`.

Used by `src/utils/polygonSeed.ts` when an `Aavegotchi` entity is first created:
- `createdAt` is replaced with the seed value (33201946, the Base migration block, for migrated gotchis) instead of the block of first touch.
- `createdAtPolygon`, `claimedAt`, `claimedAtPolygon`, `claimedTime` fill gaps only; a Base `ClaimAavegotchi` event still sets its own values.

Regenerate: `npm run seed:fetch` (network needed only for this step; indexing stays offline).
Takes effect only for entities created after deploy, i.e. needs a fresh core-base re-index.
