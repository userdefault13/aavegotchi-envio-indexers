#!/usr/bin/env node
/**
 * Reconcile envio."ERC1155Listing" sold/cancelled/quantity from on-chain getERC1155Listing.
 *
 * Fixes subgraph rows left stale when Baazaar buys used executeERC1155ListingToRecipient
 * (ERC1155ExecutedToRecipient) before the indexer handler synced listing state.
 *
 * Usage (home monolith Docker stack):
 *   npm run reconcile:erc1155
 *   npm run reconcile:erc1155:dry
 *
 * Usage (inside Flux/indexer container):
 *   node /opt/envio-scripts/reconcile-erc1155-listings.mjs --target env --stack monolith
 *
 * Env: ALCHEMY_API_KEY or BASE_MAINNET_RPC, ENVIO_PG_* (or .env for docker target)
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

const DIAMOND = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF";
const GET_ERC1155_LISTING_ABI = [
  {
    inputs: [{ name: "_listingId", type: "uint256" }],
    name: "getERC1155Listing",
    outputs: [
      {
        components: [
          { name: "listingId", type: "uint256" },
          { name: "seller", type: "address" },
          { name: "erc1155TokenAddress", type: "address" },
          { name: "erc1155TypeId", type: "uint256" },
          { name: "category", type: "uint256" },
          { name: "quantity", type: "uint256" },
          { name: "priceInWei", type: "uint256" },
          { name: "timeCreated", type: "uint256" },
          { name: "timeLastPurchased", type: "uint256" },
          { name: "sourceListingId", type: "uint256" },
          { name: "sold", type: "bool" },
          { name: "cancelled", type: "bool" },
        ],
        name: "listing_",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

function resolveEthersRequire() {
  const candidates = [
    join(coreDir, "package.json"),
    "/envio-indexer/package.json",
    join(process.cwd(), "package.json"),
  ];
  for (const pkgPath of candidates) {
    if (!existsSync(pkgPath)) continue;
    try {
      const req = createRequire(pkgPath);
      req.resolve("ethers");
      return req;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    "Cannot find ethers — run from repo root or Flux indexer container",
  );
}

function parseArgs(argv) {
  const opts = {
    target: "docker",
    stack: "monolith",
    mode: "active",
    concurrency: 8,
    delayMs: 30,
    dryRun: false,
    limit: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--target" && argv[i + 1]) opts.target = argv[++i];
    else if (a === "--stack" && argv[i + 1]) opts.stack = argv[++i];
    else if (a === "--mode" && argv[i + 1]) opts.mode = argv[++i];
    else if (a === "--concurrency" && argv[i + 1])
      opts.concurrency = Number(argv[++i]);
    else if (a === "--delay-ms" && argv[i + 1]) opts.delayMs = Number(argv[++i]);
    else if (a === "--limit" && argv[i + 1]) opts.limit = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/reconcile-erc1155-listings.mjs [options]

Options:
  --target docker|env   docker = local compose postgres (default); env = ENVIO_PG_*
  --stack monolith|core monolith = home stack (default); core = core-only stack
  --mode active|all     active = sold=false AND cancelled=false (default); all = every row
  --concurrency N       parallel RPC calls (default 8)
  --delay-ms N          pause between RPC batches (default 30)
  --limit N             stop after N writes (0 = unlimited)
  --dry-run             fetch RPC only; do not write postgres
`);
      process.exit(0);
    }
  }
  if (!["docker", "env"].includes(opts.target)) {
    throw new Error(`Unknown --target ${opts.target}`);
  }
  if (!["monolith", "core"].includes(opts.stack)) {
    throw new Error(`Unknown --stack ${opts.stack}`);
  }
  if (!["active", "all"].includes(opts.mode)) {
    throw new Error(`Unknown --mode ${opts.mode}`);
  }
  return opts;
}

function loadEnvFile() {
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function loadIndexerContainerEnv(env) {
  try {
    const raw = readFileSync("/proc/1/environ");
    for (const part of raw.toString("latin1").split("\0")) {
      if (!part) continue;
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.slice(0, eq);
      const val = part.slice(eq + 1);
      if (!(key in env) || !String(env[key] ?? "").trim()) {
        env[key] = val;
      }
    }
  } catch {
    // not in container
  }
  env.ENVIO_PG_HOST ??= "postgres";
  env.ENVIO_PG_PORT ??= "5432";
  env.ENVIO_PG_USER ??= "postgres";
  env.ENVIO_PG_DATABASE ??= "envio-monolith";
  env.ENVIO_PG_PUBLIC_SCHEMA ??= "envio";
  return env;
}

function composeFile(stack) {
  return stack === "monolith"
    ? join(root, "docker/monolith-base/docker-compose.yaml")
    : join(root, "docker/core-base/docker-compose.yaml");
}

function pgSchema(env) {
  return (env.ENVIO_PG_PUBLIC_SCHEMA ?? "envio").trim() || "envio";
}

function pgTable(env, entity) {
  return `${pgSchema(env)}."${entity}"`;
}

function resolveRpcUrl(env) {
  if (env.BASE_MAINNET_RPC?.trim()) return env.BASE_MAINNET_RPC.trim();
  if (env.ALCHEMY_API_KEY?.trim()) {
    return `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY.trim()}`;
  }
  return "https://mainnet.base.org";
}

function pgDatabase(env, target, stack) {
  if (target === "docker") {
    return stack === "monolith"
      ? (env.MONOLITH_PG_DATABASE ?? "envio-monolith")
      : (env.CORE_PG_DATABASE ?? "envio-core");
  }
  return (
    env.ENVIO_PG_DATABASE ??
    (stack === "monolith"
      ? (env.MONOLITH_PG_DATABASE ?? "envio-monolith")
      : (env.CORE_PG_DATABASE ?? "envio-core"))
  );
}

function runPsql(env, sql, { target, stack }) {
  const user = env.ENVIO_PG_USER ?? "postgres";
  const pass = env.ENVIO_PG_PASSWORD ?? "testing";
  const db = pgDatabase(env, target, stack);

  if (target === "docker") {
    const args = [
      "compose",
      "-f",
      composeFile(stack),
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
    ];
    const result = spawnSync("docker", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "psql failed");
    }
    return result.stdout;
  }

  const host = env.ENVIO_PG_HOST ?? (target === "env" ? "postgres" : "127.0.0.1");
  const port = String(env.ENVIO_PG_PORT ?? "5432");
  const args = [
    "-h",
    host,
    "-p",
    port,
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
  ];
  const result = spawnSync("psql", args, {
    encoding: "utf8",
    env: { ...process.env, ...env, PGPASSWORD: pass },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return result.stdout;
}

function queryRows(env, target, stack, sql) {
  const out = runPsql(env, sql, { target, stack });
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|"));
}

function normalizeOnChain(raw) {
  if (!raw) return null;
  return {
    sold: Boolean(raw.sold),
    cancelled: Boolean(raw.cancelled),
    quantity: BigInt(raw.quantity),
    timeLastPurchased: BigInt(raw.timeLastPurchased),
    priceInWei: BigInt(raw.priceInWei),
  };
}

function boolSql(v) {
  return v ? "true" : "false";
}

function updateListingSql(table, id, chain) {
  return `UPDATE ${table}
SET sold = ${boolSql(chain.sold)},
    cancelled = ${boolSql(chain.cancelled)},
    quantity = ${chain.quantity.toString()},
    "timeLastPurchased" = ${chain.timeLastPurchased.toString()},
    "priceInWei" = ${chain.priceInWei.toString()}
WHERE id = '${String(id).replace(/'/g, "''")}';`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let env = loadEnvFile();
  if (opts.target === "env") {
    env = loadIndexerContainerEnv(env);
  }
  const require = resolveEthersRequire();
  const { Contract, JsonRpcProvider, FetchRequest } = require("ethers");

  const rpcUrl = resolveRpcUrl(env);
  const fetchRequest = new FetchRequest(rpcUrl);
  fetchRequest.timeout = 20_000;
  const provider = new JsonRpcProvider(fetchRequest);
  const diamond = new Contract(DIAMOND, GET_ERC1155_LISTING_ABI, provider);

  const listingTable = pgTable(env, "ERC1155Listing");
  const where =
    opts.mode === "active"
      ? `WHERE sold = false AND cancelled = false`
      : "";

  console.log("=== ERC1155 listing reconcile ===");
  console.log(
    `target=${opts.target} stack=${opts.stack} mode=${opts.mode} db=${pgDatabase(env, opts.target, opts.stack)} rpc=${rpcUrl.replace(/\/v2\/[^/]+$/, "/v2/***")}`,
  );
  if (opts.dryRun) console.log("(dry-run — no postgres writes)");

  const rows = queryRows(
    env,
    opts.target,
    opts.stack,
    `SELECT id, sold, cancelled, quantity, "timeLastPurchased", "priceInWei"
     FROM ${listingTable}
     ${where}
     ORDER BY id::bigint;`,
  );

  let work = rows.map(([id, sold, cancelled, quantity, timeLastPurchased, priceInWei]) => ({
    id,
    db: {
      sold: sold === "t",
      cancelled: cancelled === "t",
      quantity: BigInt(quantity),
      timeLastPurchased: BigInt(timeLastPurchased || "0"),
      priceInWei: BigInt(priceInWei || "0"),
    },
  }));

  if (opts.limit > 0) work = work.slice(0, opts.limit);
  console.log(`candidates=${work.length}`);

  let patched = 0;
  let ok = 0;
  let failed = 0;
  let missing = 0;

  for (let i = 0; i < work.length; i += opts.concurrency) {
    const batch = work.slice(i, i + opts.concurrency);
    const chainRows = await Promise.all(
      batch.map(async ({ id }) => {
        try {
          const raw = await diamond.getERC1155Listing(BigInt(id));
          return { id, chain: normalizeOnChain(raw) };
        } catch {
          return { id, chain: null };
        }
      }),
    );

    for (const { id, chain } of chainRows) {
      if (!chain) {
        missing++;
        continue;
      }
      const dbRow = work.find((w) => w.id === id)?.db;
      if (!dbRow) continue;

      const mismatch =
        dbRow.sold !== chain.sold ||
        dbRow.cancelled !== chain.cancelled ||
        dbRow.quantity !== chain.quantity ||
        dbRow.timeLastPurchased !== chain.timeLastPurchased ||
        dbRow.priceInWei !== chain.priceInWei;

      if (!mismatch) {
        ok++;
        continue;
      }

      const msg = `#${id}: sold ${dbRow.sold}->${chain.sold} cancelled ${dbRow.cancelled}->${chain.cancelled} qty ${dbRow.quantity}->${chain.quantity}`;
      if (opts.dryRun) {
        console.log(`[dry-run] ${msg}`);
        patched++;
        continue;
      }

      try {
        runPsql(env, updateListingSql(listingTable, id, chain), {
          target: opts.target,
          stack: opts.stack,
        });
        console.log(msg);
        patched++;
      } catch (err) {
        failed++;
        console.error(`failed #${id}: ${err.message}`);
      }
    }

    if (opts.delayMs > 0 && i + opts.concurrency < work.length) {
      await sleep(opts.delayMs);
    }
  }

  console.log(
    `\nDone: patched=${patched} already_ok=${ok} missing_on_chain=${missing} failed=${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
