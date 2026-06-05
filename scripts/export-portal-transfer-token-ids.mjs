#!/usr/bin/env node
/**
 * Writes packages/portal-base/portal-transfer-token-ids.json from envio."Portal".
 *
 * Prefer docker (no host password): portal stack running via docker-portal-up.sh
 *   npm run portal:export-transfer-ids
 *
 * Host psql fallback (loads .env):
 *   PGHOST=127.0.0.1 PGPORT=5438 npm run portal:export-transfer-ids
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(
  root,
  "packages/portal-base/portal-transfer-token-ids.json",
);
const envPath = join(root, ".env");
const composeFile = join(root, "docker/portal-base/docker-compose.yaml");

const sql = 'SELECT id FROM envio."Portal" ORDER BY id::bigint;';

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

function parseRows(stdout) {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean);
}

function exportViaDocker(env) {
  const pgUser = env.ENVIO_PG_USER ?? "postgres";
  const pgDb = env.PORTAL_PG_DATABASE ?? "envio-portal";
  const args = [
    "compose",
    "-f",
    composeFile,
    "--env-file",
    envPath,
    "exec",
    "-T",
    "envio-postgres",
    "psql",
    "-U",
    pgUser,
    "-d",
    pgDb,
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
    return null;
  }
  return parseRows(result.stdout ?? "");
}

function exportViaHostPsql(env) {
  const pgHost = env.PGHOST ?? "127.0.0.1";
  const pgPort = env.PGPORT ?? env.PORTAL_PG_PORT ?? "5438";
  const pgUser = env.PGUSER ?? env.ENVIO_PG_USER ?? "postgres";
  const pgDb = env.PGDATABASE ?? env.PORTAL_PG_DATABASE ?? "envio-portal";
  const pgPassword = env.PGPASSWORD ?? env.ENVIO_PG_PASSWORD ?? "testing";

  const stdout = execFileSync(
    "psql",
    [
      "-h",
      pgHost,
      "-p",
      String(pgPort),
      "-U",
      pgUser,
      "-d",
      pgDb,
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, ...env, PGPASSWORD: pgPassword },
    },
  );
  return parseRows(stdout);
}

const env = loadEnvFile();
let rows = null;
let via = "";

if (existsSync(envPath)) {
  rows = exportViaDocker(env);
  if (rows !== null) via = "docker compose exec";
}

if (rows === null) {
  try {
    rows = exportViaHostPsql(env);
    via = "host psql";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "Failed to export portal token ids.\n\n" +
        "1) Start portal: npm run docker:portal\n" +
        "2) Retry: npm run portal:export-transfer-ids\n\n" +
        "Or set credentials from .env for host psql:\n" +
        "  export ENVIO_PG_PASSWORD='your-password'\n" +
        "  export PGPORT=5438\n" +
        "  npm run portal:export-transfer-ids\n\n" +
        `Error: ${message}`,
    );
    process.exit(1);
  }
}

if (rows.length === 0) {
  console.error(
    "No rows in envio.Portal. Sync portal with PortalOpened/OpenPortals first, then re-run.",
  );
  process.exit(1);
}

writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");
console.log(`Wrote ${rows.length} portal token ids to ${outPath} (${via})`);
