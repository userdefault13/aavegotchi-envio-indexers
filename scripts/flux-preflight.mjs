#!/usr/bin/env node
/**
 * Validate Flux deploy config before paying for Flux updates.
 * Usage: node scripts/flux-preflight.mjs [--no-prepare]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const outDir = path.join(root, "flux", "out");

function loadEnv() {
  const env = { ...process.env };
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
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

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function envVal(env, key) {
  const v = env[key]?.trim();
  return v && !v.startsWith("REPLACE_") ? v : "";
}

function parseEnvLine(line) {
  const i = line.indexOf("=");
  if (i === -1) return null;
  return { key: line.slice(0, i), value: line.slice(i + 1) };
}

function getParam(container, key) {
  for (const line of container.environmentParameters || []) {
    const p = parseEnvLine(line);
    if (p?.key === key) return p.value;
  }
  return undefined;
}

function passwordFromHasuraUrl(url) {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.password || "");
  } catch {
    return null;
  }
}

function checkIndexerSpec(name, expectedDb, env) {
  const file = path.join(outDir, `${name}-spec.json`);
  if (!fs.existsSync(file)) fail(`Missing ${file} — run: npm run flux:prepare`);

  const raw = fs.readFileSync(file, "utf8");
  if (raw.includes("REPLACE_")) {
    fail(`${file} still contains REPLACE_* — fix .env and run flux:prepare`);
  }

  const spec = JSON.parse(raw);
  if (spec.owner !== env.FLUX_ZELID?.trim()) {
    fail(`${name}: owner in spec does not match FLUX_ZELID`);
  }

  const pg = spec.compose.find((c) => c.name === "postgres");
  const hasura = spec.compose.find((c) => c.name === "hasura");
  const indexer = spec.compose.find((c) => c.name === "indexer");
  if (!pg || !hasura || !indexer) {
    fail(`${name}: missing postgres/hasura/indexer in compose`);
  }

  const pgPass = getParam(pg, "POSTGRES_PASSWORD");
  const envioPass = getParam(indexer, "ENVIO_PG_PASSWORD");
  const dbUrl = getParam(hasura, "HASURA_GRAPHQL_DATABASE_URL");
  const urlPass = passwordFromHasuraUrl(dbUrl);

  if (!pgPass || !envioPass || !urlPass) {
    fail(`${name}: missing postgres password in one of postgres/indexer/hasura`);
  }
  if (pgPass !== envioPass) {
    fail(`${name}: POSTGRES_PASSWORD must match indexer ENVIO_PG_PASSWORD`);
  }
  if (urlPass !== null && pgPass !== urlPass) {
    fail(
      `${name}: Hasura DATABASE_URL password must match ENVIO_PG_PASSWORD (special chars like / must be URL-encoded in the URL)`,
    );
  }

  const rpc = getParam(indexer, "BASE_MAINNET_RPC");
  if (rpc && !/^https?:\/\//.test(rpc)) {
    fail(`${name}: BASE_MAINNET_RPC must start with http:// or https://`);
  }

  if (getParam(pg, "POSTGRES_DB") !== expectedDb) {
    fail(`${name}: POSTGRES_DB should be ${expectedDb}`);
  }

  if (!indexer.repotag?.includes(env.DOCKERHUB_USER || "userdefault")) {
    fail(`${name}: indexer repotag should use DOCKERHUB_USER`);
  }

  ok(`${name}-spec.json`);
  return spec;
}

function checkProxySpec(env) {
  const file = path.join(outDir, "graphql-proxy-spec.json");
  if (!fs.existsSync(file)) fail(`Missing ${file} — run: npm run flux:prepare`);

  const raw = fs.readFileSync(file, "utf8");
  if (raw.includes("REPLACE_")) {
    fail(`${file} still contains REPLACE_* — fix .env and run flux:prepare`);
  }

  const spec = JSON.parse(raw);
  const proxy = spec.compose.find((c) => c.name === "proxy");
  if (!proxy) fail("graphql-proxy: missing proxy component");

  for (const key of [
    "CORE_HASURA_URL",
    "GV_HASURA_URL",
    "SVG_HASURA_URL",
    "PORTAL_HASURA_URL",
    "ALCHEMICA_HASURA_URL",
    "STAKING_HASURA_URL",
    "GBM_HASURA_URL",
  ]) {
    const url = getParam(proxy, key);
    if (!url || !url.startsWith("https://") || !url.includes(".app.runonflux.io")) {
      fail(`graphql-proxy: missing or invalid ${key} (expected https://<app>_8080.app.runonflux.io/v1/graphql)`);
    }
  }

  ok("graphql-proxy-spec.json");
  return spec;
}

function checkSpec(name, env) {
  const dbs = {
    "core-base": "envio-core",
    "gotchiverse-base": "envio-gv",
    "svg-base": "envio-svg",
    "portal-base": "envio-portal",
    "alchemica-base": "envio-alchemica",
    "gltr-staking-base": "envio-staking",
    "gbm-baazaar-base": "envio-gbm",
  };
  if (name === "graphql-proxy") return checkProxySpec(env);
  if (dbs[name]) return checkIndexerSpec(name, dbs[name], env);
  fail(`Unknown spec: ${name}`);
}

const noPrepare = process.argv.includes("--no-prepare");
const env = loadEnv();

console.log("Flux preflight — validate before deploy\n");

if (!envVal(env, "FLUX_ZELID")) fail("Missing or placeholder .env: FLUX_ZELID");
ok(".env FLUX_ZELID");

const pgPass = envVal(env, "ENVIO_PG_PASSWORD") || envVal(env, "FLUX_PG_PASSWORD");
if (!pgPass) {
  fail(
    "Missing ENVIO_PG_PASSWORD (random Postgres password you create — not Envio or wallet)",
  );
}
ok(".env ENVIO_PG_PASSWORD (Postgres)");

if (
  envVal(env, "ENVIO_PG_PASSWORD") &&
  envVal(env, "FLUX_PG_PASSWORD") &&
  env.ENVIO_PG_PASSWORD.trim() !== env.FLUX_PG_PASSWORD.trim()
) {
  fail("ENVIO_PG_PASSWORD and FLUX_PG_PASSWORD must be the same (or remove FLUX_PG_PASSWORD)");
}

for (const key of [
  "HASURA_GRAPHQL_ADMIN_SECRET",
  "ENVIO_API_TOKEN",
  "DOCKERHUB_USER",
]) {
  if (!envVal(env, key)) fail(`Missing or placeholder .env: ${key}`);
  ok(`.env ${key}`);
}

if (!envVal(env, "BASE_MAINNET_RPC") && !envVal(env, "ALCHEMY_API_KEY")) {
  fail("Set BASE_MAINNET_RPC or ALCHEMY_API_KEY in .env (RPC required for indexer)");
}
ok(".env RPC (BASE_MAINNET_RPC or ALCHEMY_API_KEY)");

if (!noPrepare) {
  const r = spawnSync("node", ["scripts/prepare-flux-specs.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) fail("flux:prepare failed");
}

checkSpec("core-base", env);
checkSpec("gotchiverse-base", env);
checkSpec("svg-base", env);
checkSpec("portal-base", env);
checkSpec("alchemica-base", env);
checkSpec("gltr-staking-base", env);
checkSpec("gbm-baazaar-base", env);
checkSpec("graphql-proxy", env);

console.log(`
All preflight checks passed.

Next — test locally (one indexer at a time on free Envio tier):
  npm run docker:svg && npm run docker:svg:down
  npm run docker:portal && npm run docker:portal:down
  npm run docker:alchemica && npm run docker:alchemica:down
  npm run docker:staking && npm run docker:staking:down
  npm run docker:gbm && npm run docker:gbm:down

Or full core smoke test:
  npm run flux:test:core

Deploy to Flux (after images are pushed):
  PUSH=1 npm run flux:build:push
  npm run flux:prepare
  Upload flux/out/*.json in FluxOS — order:
    core → gotchiverse → svg → portal → alchemica → staking → gbm → graphql-proxy
  npm run flux:print-env -- svg-base   # optional: paste env into FluxOS Update
`);
