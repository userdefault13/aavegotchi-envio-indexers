#!/usr/bin/env node
/**
 * Skip past a HyperSync block-hash deadlock on empty block ranges.
 *
 * Symptom: latest_processed_block frozen, buffer full, fetch concurrency 0,
 * logs show "HyperSync get block hash query" TypeError (undefined.length).
 *
 * Usage:
 *   node scripts/unstick-monolith-sync.mjs [--dry-run]
 *
 * Env: reads aavegotchi-envio-indexers/.env for Postgres; uses mainnet.base.org for block metadata.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnv() {
  const env = { ...process.env };
  const path = resolve(ROOT, ".env");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

function psql(env, sql) {
  const container = "aavegotchi-monolith-base-envio-postgres-1";
  const db = env.MONOLITH_PG_DATABASE || "envio-monolith";
  const user = env.ENVIO_PG_USER || "postgres";
  const cmd = `docker exec ${container} psql -U ${user} -d ${db} -t -A -c ${JSON.stringify(sql)}`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

async function rpcBlock(n) {
  const hex = "0x" + n.toString(16);
  const res = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [hex, false],
      id: 1,
    }),
  });
  const json = await res.json();
  if (!json.result) throw new Error(`RPC block ${n}: ${JSON.stringify(json.error)}`);
  return {
    number: n,
    hash: json.result.hash,
    timestamp: parseInt(json.result.timestamp, 16),
  };
}

async function main() {
  const env = loadEnv();
  const row = psql(
    env,
    "SELECT latest_processed_block, latest_fetched_block_number FROM envio.chain_metadata WHERE chain_id = 8453;",
  );
  const [processed, fetched] = row.split("|").map(Number);
  if (!processed || !fetched) throw new Error(`Unexpected chain_metadata: ${row}`);
  if (fetched <= processed) {
    console.log(`Nothing to skip (processed=${processed}, fetched=${fetched})`);
    return;
  }

  const skipTo = fetched;
  const nextBlock = skipTo + 1;
  const nextMeta = await rpcBlock(nextBlock);
  const boundary = await rpcBlock(skipTo);

  console.log(`Skipping empty deadlock range: ${processed + 1}..${skipTo} (${skipTo - processed} blocks)`);
  console.log(`  next event cursor: block ${nextBlock}, ts ${nextMeta.timestamp}`);

  if (DRY_RUN) {
    console.log("[dry-run] Would stop indexer, update DB, restart");
    return;
  }

  execSync("docker stop aavegotchi-monolith-base-envio-indexer-1", { stdio: "inherit" });

  psql(
    env,
    `UPDATE envio.chain_metadata SET latest_processed_block = ${skipTo}, latest_fetched_block_number = ${skipTo} WHERE chain_id = 8453;`,
  );
  psql(
    env,
    `UPDATE envio.event_sync_state SET block_number = ${nextBlock}, log_index = 0, block_timestamp = ${nextMeta.timestamp} WHERE chain_id = 8453;`,
  );
  psql(env, "DELETE FROM envio.end_of_block_range_scanned_data WHERE chain_id = 8453;");
  psql(
    env,
    `INSERT INTO envio.end_of_block_range_scanned_data (chain_id, block_number, block_hash) VALUES (8453, ${skipTo}, '${boundary.hash}');`,
  );

  const verify = psql(
    env,
    "SELECT latest_processed_block, latest_fetched_block_number FROM envio.chain_metadata;",
  );
  console.log(`Updated chain_metadata: ${verify}`);

  execSync(
    "ENVIO_MAX_PARTITION_CONCURRENCY=29 BASE_MAINNET_RPC= docker compose -f docker/monolith-base/docker-compose.yaml --env-file .env up -d envio-indexer",
    { cwd: ROOT, stdio: "inherit" },
  );
  console.log("Indexer restarted.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
