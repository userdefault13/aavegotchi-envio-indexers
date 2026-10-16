// Polygon-era / migration fields for gotchis, snapshotted once from Goldsky's
// public aavegotchi-core-base subgraph (see scripts/fetch-gotchi-seed.mjs).
// Loaded lazily from disk so indexing stays deterministic and offline.
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

export const SEED_FILE = "seed/gotchi-polygon-seed.json";

type Row = [
  string | null, // createdAt (Base block; 33201946 for migrated gotchis)
  string | null, // createdAtPolygon
  string | null, // claimedAt (Base block)
  string | null, // claimedAtPolygon
  string | null, // claimedTime (unix seconds)
];

export type GotchiSeed = {
  createdAt?: bigint;
  createdAtPolygon?: bigint;
  claimedAt?: bigint;
  claimedAtPolygon?: bigint;
  claimedTime?: bigint;
};

let cache: Record<string, Row> | undefined;

function findSeedPath(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, SEED_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function loadSeed(path = findSeedPath()): Record<string, Row> {
  if (cache) return cache;
  if (!path) {
    console.warn(`[polygonSeed] ${SEED_FILE} not found; Polygon-era fields stay empty`);
    cache = {};
    return cache;
  }
  cache = JSON.parse(readFileSync(path, "utf8")).gotchis as Record<string, Row>;
  return cache;
}

export function resetSeedCache(): void {
  cache = undefined;
}

const big = (v: string | null | undefined) =>
  v === null || v === undefined ? undefined : BigInt(v);

export function getGotchiSeed(id: string): GotchiSeed | undefined {
  const row = loadSeed()[id];
  if (!row) return undefined;
  return {
    createdAt: big(row[0]),
    createdAtPolygon: big(row[1]),
    claimedAt: big(row[2]),
    claimedAtPolygon: big(row[3]),
    claimedTime: big(row[4]),
  };
}

type SeedTarget = {
  createdAt?: bigint;
  createdAtPolygon?: bigint;
  claimedAt?: bigint;
  claimedAtPolygon?: bigint;
  claimedTime?: bigint;
};

/** Applies seed values. createdAt is overridden (it would otherwise be the
 * block of first touch); the other fields only fill gaps so on-chain
 * ClaimAavegotchi values on Base always win. */
export function applyGotchiSeed<T extends SeedTarget>(id: string, gotchi: T): T {
  const s = getGotchiSeed(id);
  if (!s) return gotchi;
  return {
    ...gotchi,
    createdAt: s.createdAt ?? gotchi.createdAt,
    createdAtPolygon: gotchi.createdAtPolygon ?? s.createdAtPolygon,
    claimedAt: gotchi.claimedAt ?? s.claimedAt,
    claimedAtPolygon: gotchi.claimedAtPolygon ?? s.claimedAtPolygon,
    claimedTime: gotchi.claimedTime ?? s.claimedTime,
  };
}
