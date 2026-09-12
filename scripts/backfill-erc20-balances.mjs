#!/usr/bin/env node
/**
 * Reconcile envio."ERC20Balance" from on-chain balanceOf for negative / stale rows.
 *
 * Usage:
 *   npm run backfill:erc20
 *   npm run backfill:erc20:dry
 *   node scripts/backfill-erc20-balances.mjs --mode negative|all --dry-run
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

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

function resolveEthersRequire() {
  for (const pkgPath of [
    join(coreDir, "package.json"),
    join(root, "packages/aavegotchi-monolith-base/package.json"),
    join(process.cwd(), "package.json"),
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
    mode: "negative",
    concurrency: 8,
    delayMs: 40,
    dryRun: false,
    limit: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--target" && argv[i + 1]) opts.target = argv[++i];
    else if (a === "--stack" && argv[i + 1]) opts.stack = argv[++i];
    else if (a === "--mode" && argv[i + 1]) opts.mode = argv[++i];
    else if (a === "--concurrency" && argv[i + 1]) opts.concurrency = Number(argv[++i]);
    else if (a === "--delay-ms" && argv[i + 1]) opts.delayMs = Number(argv[++i]);
    else if (a === "--limit" && argv[i + 1]) opts.limit = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/backfill-erc20-balances.mjs [--mode negative|all] [--dry-run]`);
      process.exit(0);
    }
  }
  if (!["negative", "all"].includes(opts.mode)) throw new Error(`bad --mode ${opts.mode}`);
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

function composeFile(stack) {
  return stack === "monolith"
    ? join(root, "docker/monolith-base/docker-compose.yaml")
    : join(root, "docker/core-base/docker-compose.yaml");
}

function pgDatabase(env, target, stack) {
  if (target === "docker") {
    return stack === "monolith"
      ? (env.MONOLITH_PG_DATABASE ?? "envio-monolith")
      : (env.CORE_PG_DATABASE ?? "envio-core");
  }
  return env.ENVIO_PG_DATABASE ?? "envio-monolith";
}

function pgSchema(env) {
  return (env.ENVIO_PG_PUBLIC_SCHEMA ?? "envio").trim() || "envio";
}

function resolveRpcUrl(env) {
  if (env.BASE_MAINNET_RPC?.trim()) return env.BASE_MAINNET_RPC.trim();
  if (env.ALCHEMY_API_KEY?.trim()) {
    return `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY.trim()}`;
  }
  const fb = env.BASE_RPC_FALLBACK_URLS?.split(",")[0]?.trim();
  return fb || "https://mainnet.base.org";
}

function runPsql(env, sql, opts) {
  const user = env.ENVIO_PG_USER ?? "postgres";
  const db = pgDatabase(env, opts.target, opts.stack);
  if (opts.target === "docker") {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        composeFile(opts.stack),
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
  throw new Error("only --target docker supported here");
}

function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function toDecimalString(valueExact, decimals) {
  const neg = valueExact < 0n;
  const abs = neg ? -valueExact : valueExact;
  const s = abs.toString().padStart(decimals + 1, "0");
  const intPart = s.slice(0, -decimals) || "0";
  let frac = s.slice(-decimals).replace(/0+$/, "");
  const body = frac ? `${intPart}.${frac}` : intPart;
  return neg ? `-${body}` : body;
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
  const schema = pgSchema(env);

  console.log("=== ERC20 balance reconcile ===");
  console.log(`mode=${opts.mode} rpc=${rpcUrl.replace(/\/v2\/[^/]+$/, "/v2/***")} dry=${opts.dryRun}`);

  const where =
    opts.mode === "negative"
      ? `WHERE b."valueExact" < 0 AND b.account_id IS NOT NULL`
      : `WHERE b.account_id IS NOT NULL`;

  const out = runPsql(
    env,
    `SELECT b.id, b.contract_id, b.account_id, c.decimals
     FROM ${schema}."ERC20Balance" b
     JOIN ${schema}."ERC20Contract" c ON c.id = b.contract_id
     ${where}
     ORDER BY b.id;`,
    opts,
  );

  let rows = out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, contractId, accountId, decimals] = line.split("|");
      return { id, contractId, accountId, decimals: Number(decimals) };
    });
  if (opts.limit > 0) rows = rows.slice(0, opts.limit);
  console.log(`candidates=${rows.length}`);

  let patched = 0;
  let same = 0;
  let failed = 0;
  const contractCache = new Map();

  for (let i = 0; i < rows.length; i += opts.concurrency) {
    const batch = rows.slice(i, i + opts.concurrency);
    await Promise.all(
      batch.map(async (row) => {
        try {
          let token = contractCache.get(row.contractId);
          if (!token) {
            token = new Contract(row.contractId, ERC20_ABI, provider);
            contractCache.set(row.contractId, token);
          }
          const bal = BigInt(await token.balanceOf(row.accountId));
          const value = toDecimalString(bal, row.decimals);
          if (!opts.dryRun) {
            runPsql(
              env,
              `UPDATE ${schema}."ERC20Balance"
               SET "valueExact" = ${bal.toString()}, value = ${sqlStr(value)}
               WHERE id = ${sqlStr(row.id)};`,
              opts,
            );
          }
          patched += 1;
          if (patched <= 20 || patched % 100 === 0) {
            console.log(`${opts.dryRun ? "would-patch" : "patch"} ${row.id} -> ${bal}`);
          }
        } catch (err) {
          failed += 1;
          console.warn(`fail ${row.id}: ${err.message}`);
        }
      }),
    );
    if (opts.delayMs && i + opts.concurrency < rows.length) await sleep(opts.delayMs);
  }

  console.log(`done patched=${patched} same=${same} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
