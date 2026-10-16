#!/usr/bin/env node
// One-time snapshot of Polygon-era / migration fields from Goldsky's public
// aavegotchi-core-base subgraph. Output is committed and read at index time,
// so indexing stays deterministic and offline.
//
// Usage: node scripts/fetch-gotchi-seed.mjs [outFile]
// Env:   GOLDSKY_CORE_BASE_URL (optional override)
import { writeFileSync } from "node:fs";

const ENDPOINT =
  process.env.GOLDSKY_CORE_BASE_URL ??
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";
const OUT = process.argv[2] ?? new URL("../seed/gotchi-polygon-seed.json", import.meta.url).pathname;
const PAGE = 1000;

async function gql(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && !json.errors) return json.data;
    if (attempt >= 5) throw new Error(`goldsky error: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const meta = await gql("{ _meta { block { number } } }");
const atBlock = meta._meta.block.number;
const rows = {};
let lastId = "";
for (;;) {
  const data = await gql(`{ aavegotchis(first: ${PAGE}, orderBy: id, orderDirection: asc,
      where: { id_gt: "${lastId}" }, block: { number: ${atBlock} }) {
      id createdAt createdAtPolygon claimedAt claimedAtPolygon claimedTime } }`);
  const page = data.aavegotchis;
  for (const g of page) {
    // [createdAt, createdAtPolygon, claimedAt, claimedAtPolygon, claimedTime]
    rows[g.id] = [g.createdAt, g.createdAtPolygon, g.claimedAt, g.claimedAtPolygon, g.claimedTime];
  }
  if (page.length < PAGE) break;
  lastId = page[page.length - 1].id;
}

const sorted = Object.fromEntries(
  Object.entries(rows).sort((a, b) => Number(a[0]) - Number(b[0])),
);
writeFileSync(
  OUT,
  JSON.stringify({
    source: "goldsky:aavegotchi-core-base",
    atBlock,
    fields: ["createdAt", "createdAtPolygon", "claimedAt", "claimedAtPolygon", "claimedTime"],
    count: Object.keys(sorted).length,
    gotchis: sorted,
  }) + "\n",
);
console.log(`wrote ${Object.keys(sorted).length} gotchis at block ${atBlock} -> ${OUT}`);
