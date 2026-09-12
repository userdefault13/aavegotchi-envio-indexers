#!/usr/bin/env node
/**
 * Backfill Aavegotchi rows missing after Transfer only updated Portal.owner.
 *
 * Finds Portal rows whose on-chain token is a claimed gotchi (status=3) but
 * envio."Aavegotchi" is missing or not status=3, then upserts Aavegotchi +
 * marks the Portal Claimed.
 *
 * Usage:
 *   npm run backfill:gotchis:dry
 *   npm run backfill:gotchis
 *   node scripts/backfill-missing-gotchis.mjs --owner 0x2127… --dry-run
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
const ZERO = "0x0000000000000000000000000000000000000000";
const STATUS_AAVEGOTCHI = 3n;

function loadDiamondAbi() {
  const candidates = [
    join(root, "packages/aavegotchi-monolith-base/abis/AavegotchiDiamond.json"),
    join(root, "packages/core-base/abis/AavegotchiDiamond.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  }
  throw new Error("AavegotchiDiamond.json ABI not found");
}

function resolveEthersRequire() {
  const candidates = [
    join(coreDir, "package.json"),
    join(root, "packages/aavegotchi-monolith-base/package.json"),
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
      // try next
    }
  }
  throw new Error("Cannot find ethers — run from repo root with packages installed");
}

function parseArgs(argv) {
  const opts = {
    target: "docker",
    stack: "monolith",
    concurrency: 6,
    delayMs: 40,
    dryRun: false,
    limit: 0,
    owner: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--target" && argv[i + 1]) opts.target = argv[++i];
    else if (a === "--stack" && argv[i + 1]) opts.stack = argv[++i];
    else if (a === "--concurrency" && argv[i + 1])
      opts.concurrency = Number(argv[++i]);
    else if (a === "--delay-ms" && argv[i + 1]) opts.delayMs = Number(argv[++i]);
    else if (a === "--limit" && argv[i + 1]) opts.limit = Number(argv[++i]);
    else if (a === "--owner" && argv[i + 1]) opts.owner = argv[++i].toLowerCase();
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/backfill-missing-gotchis.mjs [options]

Options:
  --target docker|env
  --stack monolith|core
  --owner 0x…            only portals currently owned by this address
  --concurrency N
  --delay-ms N
  --limit N
  --dry-run
`);
      process.exit(0);
    }
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

function composeFile(stack) {
  return stack === "monolith"
    ? join(root, "docker/monolith-base/docker-compose.yaml")
    : join(root, "docker/core-base/docker-compose.yaml");
}

function pgSchema(env) {
  return (env.ENVIO_PG_PUBLIC_SCHEMA ?? "envio").trim() || "envio";
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

function resolveRpcUrl(env) {
  if (env.BASE_MAINNET_RPC?.trim()) return env.BASE_MAINNET_RPC.trim();
  if (env.ALCHEMY_API_KEY?.trim()) {
    return `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY.trim()}`;
  }
  const fallback = env.BASE_RPC_FALLBACK_URLS?.split(",")[0]?.trim();
  if (fallback) return fallback;
  return "https://mainnet.base.org";
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

  const host = env.ENVIO_PG_HOST ?? "127.0.0.1";
  const port = String(env.ENVIO_PG_PORT ?? "5432");
  const result = spawnSync(
    "psql",
    [
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
    ],
    {
      encoding: "utf8",
      env: { ...process.env, ...env, PGPASSWORD: pass },
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return result.stdout;
}

function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlAddr(v) {
  return sqlStr(String(v).toLowerCase());
}

function sqlIntArr(arr) {
  return `ARRAY[${arr.map((n) => Number(n)).join(",")}]::integer[]`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureUserSql(schema, owner) {
  return `
INSERT INTO ${schema}."User" (
  id, "gotchisLentOut", "gotchisBorrowed", "fakeGotchis",
  "amountFakeGotchis", "currentUniqueFakeGotchisOwned",
  "currentUniqueFakeGotchisOwnedArray", "totalFakeGotchisOwnedArray",
  "totalUniqueFakeGotchisOwned", "totalUniqueFakeGotchisOwnedArray"
) VALUES (
  ${sqlAddr(owner)}, '{}', '{}', '{}',
  0, 0, '{}', '{}', 0, '{}'
) ON CONFLICT (id) DO NOTHING;
`.trim();
}

function upsertGotchiSql(schema, id, info, createdAt) {
  const owner = String(info.owner).toLowerCase();
  const name = info.name ?? "";
  const traits = [...info.numericTraits].map(Number);
  const modTraits = [...info.modifiedNumericTraits].map(Number);
  const wearables = [...info.equippedWearables].map(Number);
  return `
${ensureUserSql(schema, owner)}
${ensureUserSql(schema, ZERO)}
INSERT INTO ${schema}."Aavegotchi" (
  id, "gotchiId", name, "nameLowerCase", "randomNumber", status,
  "numericTraits", "modifiedNumericTraits", "equippedWearables",
  collateral, escrow, "stakedAmount", "minimumStake", kinship,
  "lastInteracted", experience, "toNextLevel", "usedSkillPoints", level,
  "hauntId", "baseRarityScore", "modifiedRarityScore", locked,
  "baseEnergy", "baseAggression", "baseSpookiness", "baseBrain",
  "eyeShape", "eyeColor",
  "modifiedEnergy", "modifiedAggression", "modifiedSpookiness", "modifiedBrain",
  "withSetsRarityScore", "withSetsNumericTraits", "timesTraded",
  owner_id, "originalOwner_id", "createdAt"
) VALUES (
  ${sqlStr(id)}, ${id}, ${sqlStr(name)}, ${sqlStr(name.toLowerCase())},
  ${info.randomNumber.toString()}, ${info.status.toString()},
  ${sqlIntArr(traits)}, ${sqlIntArr(modTraits)}, ${sqlIntArr(wearables)},
  ${sqlAddr(info.collateral)}, ${sqlAddr(info.escrow)},
  ${info.stakedAmount.toString()}, ${info.minimumStake.toString()},
  ${info.kinship.toString()}, ${info.lastInteracted.toString()},
  ${info.experience.toString()}, ${info.toNextLevel.toString()},
  ${info.usedSkillPoints.toString()}, ${info.level.toString()},
  ${info.hauntId.toString()}, ${info.baseRarityScore.toString()},
  ${info.modifiedRarityScore.toString()}, ${info.locked ? "true" : "false"},
  ${traits[0] ?? 0}, ${traits[1] ?? 0}, ${traits[2] ?? 0}, ${traits[3] ?? 0},
  ${traits[4] ?? 0}, ${traits[5] ?? 0},
  ${modTraits[0] ?? 0}, ${modTraits[1] ?? 0}, ${modTraits[2] ?? 0}, ${modTraits[3] ?? 0},
  ${info.modifiedRarityScore.toString()}, ${sqlIntArr(modTraits)}, 0,
  ${sqlAddr(owner)}, ${sqlAddr(owner)}, ${createdAt}
)
ON CONFLICT (id) DO UPDATE SET
  "gotchiId" = EXCLUDED."gotchiId",
  name = EXCLUDED.name,
  "nameLowerCase" = EXCLUDED."nameLowerCase",
  "randomNumber" = EXCLUDED."randomNumber",
  status = EXCLUDED.status,
  "numericTraits" = EXCLUDED."numericTraits",
  "modifiedNumericTraits" = EXCLUDED."modifiedNumericTraits",
  "equippedWearables" = EXCLUDED."equippedWearables",
  collateral = EXCLUDED.collateral,
  escrow = EXCLUDED.escrow,
  "stakedAmount" = EXCLUDED."stakedAmount",
  "minimumStake" = EXCLUDED."minimumStake",
  kinship = EXCLUDED.kinship,
  "lastInteracted" = EXCLUDED."lastInteracted",
  experience = EXCLUDED.experience,
  "toNextLevel" = EXCLUDED."toNextLevel",
  "usedSkillPoints" = EXCLUDED."usedSkillPoints",
  level = EXCLUDED.level,
  "hauntId" = EXCLUDED."hauntId",
  "baseRarityScore" = EXCLUDED."baseRarityScore",
  "modifiedRarityScore" = EXCLUDED."modifiedRarityScore",
  locked = EXCLUDED.locked,
  "baseEnergy" = EXCLUDED."baseEnergy",
  "baseAggression" = EXCLUDED."baseAggression",
  "baseSpookiness" = EXCLUDED."baseSpookiness",
  "baseBrain" = EXCLUDED."baseBrain",
  "eyeShape" = EXCLUDED."eyeShape",
  "eyeColor" = EXCLUDED."eyeColor",
  "modifiedEnergy" = EXCLUDED."modifiedEnergy",
  "modifiedAggression" = EXCLUDED."modifiedAggression",
  "modifiedSpookiness" = EXCLUDED."modifiedSpookiness",
  "modifiedBrain" = EXCLUDED."modifiedBrain",
  "withSetsRarityScore" = EXCLUDED."withSetsRarityScore",
  "withSetsNumericTraits" = EXCLUDED."withSetsNumericTraits",
  owner_id = EXCLUDED.owner_id,
  "originalOwner_id" = COALESCE(${schema}."Aavegotchi"."originalOwner_id", EXCLUDED."originalOwner_id");

UPDATE ${schema}."Portal"
SET status = 'Claimed',
    gotchi_id = ${sqlStr(id)},
    owner_id = ${sqlAddr(ZERO)}
WHERE id = ${sqlStr(id)};
`.trim();
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
  const diamond = new Contract(DIAMOND, loadDiamondAbi(), provider);

  const schema = pgSchema(env);
  const portalTable = `${schema}."Portal"`;
  const gotchiTable = `${schema}."Aavegotchi"`;

  const ownerFilter = opts.owner
    ? `AND lower(p.owner_id) = ${sqlAddr(opts.owner)}`
    : `AND p.owner_id IS NOT NULL AND p.owner_id <> ${sqlAddr(ZERO)}`;

  console.log("=== Backfill missing Aavegotchi rows ===");
  console.log(
    `target=${opts.target} stack=${opts.stack} db=${pgDatabase(env, opts.target, opts.stack)} rpc=${rpcUrl.replace(/\/v2\/[^/]+$/, "/v2/***")}`,
  );
  if (opts.owner) console.log(`owner filter: ${opts.owner}`);
  if (opts.dryRun) console.log("(dry-run — no postgres writes)");

  const out = runPsql(
    env,
    `SELECT p.id
     FROM ${portalTable} p
     LEFT JOIN ${gotchiTable} a ON a.id = p.id AND a.status = 3
     WHERE a.id IS NULL
       ${ownerFilter}
     ORDER BY p.id::bigint;`,
    opts,
  );

  let ids = out
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
          const info = await diamond.getAavegotchi(BigInt(id));
          return { id, info, err: null };
        } catch (err) {
          return { id, info: null, err };
        }
      }),
    );

    for (const { id, info, err } of results) {
      if (err || !info) {
        failed += 1;
        console.warn(`fail ${id}: ${err?.message ?? "no data"}`);
        continue;
      }
      const status = BigInt(info.status);
      if (status !== STATUS_AAVEGOTCHI) {
        skipped += 1;
        continue;
      }
      const owner = String(info.owner).toLowerCase();
      console.log(
        `${opts.dryRun ? "would-patch" : "patch"} ${id} owner=${owner} name=${JSON.stringify(info.name)}`,
      );
      if (!opts.dryRun) {
        runPsql(
          env,
          upsertGotchiSql(schema, id, info, "0"),
          opts,
        );
      }
      patched += 1;
    }

    if (opts.delayMs > 0 && i + opts.concurrency < ids.length) {
      await sleep(opts.delayMs);
    }
  }

  console.log(
    `done patched=${patched} skipped_not_claimed=${skipped} failed=${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
