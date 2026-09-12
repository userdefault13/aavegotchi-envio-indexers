#!/usr/bin/env node
/**
 * Fix Parcel.owner_id from on-chain ownerOf for zero-address / wrong owners.
 *
 * Usage:
 *   npm run backfill:parcels
 *   npm run backfill:parcels:dry
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");
const coreDir = join(root, "packages/core-base");
const envPath = join(root, ".env");
const REALM = "0x4B0040c3646D3c44B8a28Ad7055cfCF536c05372";
const ZERO = "0x0000000000000000000000000000000000000000";

const ABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

function resolveEthersRequire() {
  for (const pkgPath of [
    join(coreDir, "package.json"),
    join(root, "packages/aavegotchi-monolith-base/package.json"),
  ]) {
    if (!existsSync(pkgPath)) continue;
    try {
      const req = createRequire(pkgPath);
      req.resolve("ethers");
      return req;
    } catch {
      /* next */
    }
  }
  throw new Error("Cannot find ethers");
}

function parseArgs(argv) {
  const opts = {
    target: "docker",
    stack: "monolith",
    concurrency: 8,
    delayMs: 40,
    dryRun: false,
    limit: 0,
    mode: "zero", // zero | all
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--mode" && argv[i + 1]) opts.mode = argv[++i];
    else if (a === "--limit" && argv[i + 1]) opts.limit = Number(argv[++i]);
    else if (a === "--concurrency" && argv[i + 1]) opts.concurrency = Number(argv[++i]);
    else if (a === "--delay-ms" && argv[i + 1]) opts.delayMs = Number(argv[++i]);
  }
  return opts;
}

function loadEnvFile() {
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[t.slice(0, eq).trim()] = val;
  }
  return env;
}

function resolveRpcUrl(env) {
  if (env.BASE_MAINNET_RPC?.trim()) return env.BASE_MAINNET_RPC.trim();
  if (env.ALCHEMY_API_KEY?.trim()) {
    return `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY.trim()}`;
  }
  return env.BASE_RPC_FALLBACK_URLS?.split(",")[0]?.trim() || "https://mainnet.base.org";
}

function runPsql(env, sql) {
  const user = env.ENVIO_PG_USER ?? "postgres";
  const db = env.MONOLITH_PG_DATABASE ?? "envio-monolith";
  const result = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      join(root, "docker/monolith-base/docker-compose.yaml"),
      "--env-file",
      envPath,
      "exec",
      "-T",
      "envio-postgres",
      "psql",
      "-U",
      user,
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "psql failed");
  return result.stdout;
}

function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlAddr(v) {
  return sqlStr(String(v).toLowerCase());
}

function ensureUserSql(schema, owner) {
  return `INSERT INTO ${schema}."User" (
    id, "gotchisLentOut", "gotchisBorrowed", "fakeGotchis",
    "amountFakeGotchis", "currentUniqueFakeGotchisOwned",
    "currentUniqueFakeGotchisOwnedArray", "totalFakeGotchisOwnedArray",
    "totalUniqueFakeGotchisOwned", "totalUniqueFakeGotchisOwnedArray"
  ) VALUES (
    ${sqlAddr(owner)}, '{}', '{}', '{}', 0, 0, '{}', '{}', 0, '{}'
  ) ON CONFLICT (id) DO NOTHING;`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadEnvFile();
  const require = resolveEthersRequire();
  const { Contract, JsonRpcProvider, FetchRequest } = require("ethers");
  const rpcUrl = resolveRpcUrl(env);
  const fetchRequest = new FetchRequest(rpcUrl);
  fetchRequest.timeout = 20_000;
  const provider = new JsonRpcProvider(fetchRequest);
  const realm = new Contract(REALM, ABI, provider);
  const schema = (env.ENVIO_PG_PUBLIC_SCHEMA ?? "envio").trim() || "envio";

  const where =
    opts.mode === "all"
      ? ""
      : `WHERE owner_id IS NULL OR owner_id = ${sqlAddr(ZERO)}`;

  console.log("=== Parcel owner backfill ===");
  console.log(`mode=${opts.mode} dry=${opts.dryRun} rpc=${rpcUrl.replace(/\/v2\/[^/]+$/, "/v2/***")}`);

  let ids = runPsql(env, `SELECT id FROM ${schema}."Parcel" ${where} ORDER BY id::bigint;`)
    .trim()
    .split("\n")
    .filter(Boolean);
  if (opts.limit > 0) ids = ids.slice(0, opts.limit);
  console.log(`candidates=${ids.length}`);

  let patched = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += opts.concurrency) {
    const batch = ids.slice(i, i + opts.concurrency);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          const owner = String(await realm.ownerOf(BigInt(id))).toLowerCase();
          return { id, owner, err: null };
        } catch (err) {
          return { id, owner: null, err };
        }
      }),
    );
    for (const { id, owner, err } of results) {
      if (err || !owner) {
        failed += 1;
        console.warn(`fail ${id}: ${err?.message ?? "no owner"}`);
        continue;
      }
      if (owner === ZERO) {
        skipped += 1;
        continue;
      }
      console.log(`${opts.dryRun ? "would-patch" : "patch"} parcel ${id} -> ${owner}`);
      if (!opts.dryRun) {
        runPsql(
          env,
          `${ensureUserSql(schema, owner)}
           UPDATE ${schema}."Parcel" SET owner_id = ${sqlAddr(owner)} WHERE id = ${sqlStr(id)};
           UPDATE ${schema}."Tile" SET owner = ${sqlAddr(owner)}
             WHERE parcel = ${sqlStr(id)} AND (owner IS NULL OR owner = '' OR owner = ${sqlAddr(ZERO)});`,
        );
      }
      patched += 1;
    }
    if (opts.delayMs && i + opts.concurrency < ids.length) await sleep(opts.delayMs);
  }
  console.log(`done patched=${patched} skipped_zero=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
