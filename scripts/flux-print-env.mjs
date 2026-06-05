#!/usr/bin/env node
/**
 * Print Flux component env vars from flux/out (for manual paste in FluxOS).
 * Run after: npm run flux:prepare
 *
 * Usage:
 *   npm run flux:print-env              # all split-stack apps
 *   npm run flux:print-env -- svg-base  # one app
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "flux", "out");

const ALL_SPECS = [
  "core-base",
  "gotchiverse-base",
  "svg-base",
  "portal-base",
  "alchemica-base",
  "gltr-staking-base",
  "gbm-baazaar-base",
  "graphql-proxy",
];

const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const specs =
  requested.length > 0
    ? requested.map((name) => (name.endsWith("-spec.json") ? name.replace(/-spec\.json$/, "") : name))
    : ALL_SPECS;

for (const name of specs) {
  const file = path.join(outDir, `${name}-spec.json`);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file} — run: npm run flux:prepare`);
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`\n${"=".repeat(60)}`);
  console.log(`App: ${spec.name} (${name}-spec.json)`);
  console.log(`${"=".repeat(60)}`);
  console.log(`FluxOS → ${spec.name} → Update → Components\n`);

  for (const c of spec.compose) {
    console.log(`\n### ${c.name} ###`);
    for (const line of c.environmentParameters) {
      console.log(line);
    }
  }
}

console.log(`
IMPORTANT:
- HASURA_GRAPHQL_DATABASE_URL must use %2F for / in the password (already encoded above).
- HASURA_GRAPHQL_ADMIN_SECRET is NOT the Postgres password.
- If you still get "password authentication failed", Postgres was initialized with an OLD
  password on the Flux volume. Changing env vars does not change existing DB data.
  Fix: register a NEW app with this spec (fresh volume), or wipe postgres containerData.
- Deploy graphql-proxy LAST after all seven indexer apps are running.
`);
