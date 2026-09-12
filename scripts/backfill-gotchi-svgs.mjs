#!/usr/bin/env node
/**
 * Backfill Aavegotchi.svg (and side views when available) from diamond RPC.
 *
 * Usage:
 *   npm run backfill:svgs
 *   npm run backfill:svgs:dry
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");
const envPath = join(root, ".env");
const DIAMOND = "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF";

function loadDiamondAbi() {
  for (const p of [
    join(root, "packages/aavegotchi-monolith-base/abis/AavegotchiDiamond.json"),
    join(root, "packages/core-base/abis/AavegotchiDiamond.json"),
  ]) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  }
  throw new Error("AavegotchiDiamond ABI missing");
}

function resolveEthersRequire() {
  for (const pkgPath of [
    join(root, "packages/core-base/package.json"),
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
    dryRun: false,
    limit: 0,
    concurrency: 4,
    delayMs: 80,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
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
  fetchRequest.timeout = 30_000;
  const provider = new JsonRpcProvider(fetchRequest);
  const diamond = new Contract(DIAMOND, loadDiamondAbi(), provider);
  const schema = (env.ENVIO_PG_PUBLIC_SCHEMA ?? "envio").trim() || "envio";

  console.log("=== Aavegotchi SVG backfill ===");
  console.log(`dry=${opts.dryRun} rpc=${rpcUrl.replace(/\/v2\/[^/]+$/, "/v2/***")}`);

  let ids = runPsql(
    env,
    `SELECT id FROM ${schema}."Aavegotchi"
     WHERE status = 3 AND (svg IS NULL OR svg = '')
     ORDER BY id::bigint;`,
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  if (opts.limit > 0) ids = ids.slice(0, opts.limit);
  console.log(`candidates=${ids.length}`);

  let patched = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += opts.concurrency) {
    const batch = ids.slice(i, i + opts.concurrency);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          let svg;
          let left;
          let right;
          let back;
          try {
            const sides = await diamond.getAavegotchiSideSvgs(BigInt(id));
            if (sides && sides.length >= 4) {
              svg = String(sides[0] ?? "");
              left = String(sides[1] ?? "");
              right = String(sides[2] ?? "");
              back = String(sides[3] ?? "");
            }
          } catch {
            /* fall through to front svg */
          }
          if (!svg) {
            svg = String(await diamond.getAavegotchiSvg(BigInt(id)));
          }
          return { id, svg, left, right, back, err: null };
        } catch (err) {
          return { id, svg: null, err };
        }
      }),
    );

    for (const row of results) {
      if (row.err || !row.svg) {
        failed += 1;
        console.warn(`fail ${row.id}: ${row.err?.message ?? "empty svg"}`);
        continue;
      }
      console.log(`${opts.dryRun ? "would-patch" : "patch"} svg ${row.id} len=${row.svg.length}`);
      if (!opts.dryRun) {
        const sets = [`svg = ${sqlStr(row.svg)}`];
        if (row.left) sets.push(`"left" = ${sqlStr(row.left)}`);
        if (row.right) sets.push(`"right" = ${sqlStr(row.right)}`);
        if (row.back) sets.push(`back = ${sqlStr(row.back)}`);
        runPsql(
          env,
          `UPDATE ${schema}."Aavegotchi" SET ${sets.join(", ")} WHERE id = ${sqlStr(row.id)};`,
        );
      }
      patched += 1;
    }
    if (opts.delayMs && i + opts.concurrency < ids.length) await sleep(opts.delayMs);
  }
  console.log(`done patched=${patched} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
