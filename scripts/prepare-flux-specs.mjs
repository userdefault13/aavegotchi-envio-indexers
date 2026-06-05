#!/usr/bin/env node
/**
 * Fill flux/*-spec.json templates from .env and write flux/out/*.json for FluxOS upload.
 *
 * Usage: node scripts/prepare-flux-specs.mjs
 * Requires: FLUX_ZELID, ENVIO_PG_PASSWORD, HASURA_GRAPHQL_ADMIN_SECRET, ENVIO_API_TOKEN
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

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

function requireEnv(env, key) {
  const val = env[key]?.trim();
  if (!val) {
    console.error(`Missing required .env variable: ${key}`);
    process.exit(1);
  }
  return val;
}

function optional(env, key, fallback = "") {
  return env[key]?.trim() || fallback;
}

/** URL-encode password for postgres:// connection strings (handles / @ # in passwords). */
function postgresUrl(user, password, host, port, database) {
  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `postgres://${encUser}:${encPass}@${host}:${port}/${database}`;
}

function readSpec(name) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "flux", `${name}-spec.json`), "utf8"),
  );
}

function writeSpec(name, spec) {
  const outDir = path.join(root, "flux", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}-spec.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);
  return outPath;
}

const env = loadEnv();
const owner = requireEnv(env, "FLUX_ZELID");
const pgPassword =
  env.ENVIO_PG_PASSWORD?.trim() ||
  env.FLUX_PG_PASSWORD?.trim() ||
  (() => {
    console.error(
      "Missing ENVIO_PG_PASSWORD (Postgres password you choose — not Envio account or Flux wallet)",
    );
    process.exit(1);
  })();
if (
  env.ENVIO_PG_PASSWORD?.trim() &&
  env.FLUX_PG_PASSWORD?.trim() &&
  env.ENVIO_PG_PASSWORD.trim() !== env.FLUX_PG_PASSWORD.trim()
) {
  console.warn(
    "Warning: ENVIO_PG_PASSWORD and FLUX_PG_PASSWORD differ — using ENVIO_PG_PASSWORD for Flux spec",
  );
}
const hasuraSecret = requireEnv(env, "HASURA_GRAPHQL_ADMIN_SECRET");
const envioToken = requireEnv(env, "ENVIO_API_TOKEN");
const dockerUser = optional(env, "DOCKERHUB_USER", "userdefault13");
const imageTag = optional(env, "FLUX_IMAGE_TAG", "latest");
const instances = Number.parseInt(optional(env, "FLUX_INSTANCES", "1"), 10);
const contact = optional(env, "FLUX_CONTACT_EMAIL");
const alchemyKey = optional(env, "ALCHEMY_API_KEY");
let baseRpc = optional(env, "BASE_MAINNET_RPC");
if (baseRpc.startsWith("REPLACE_")) baseRpc = "";
if (!baseRpc && alchemyKey) {
  baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
}
if (!baseRpc) {
  baseRpc = "https://mainnet.base.org";
  console.warn(
    "BASE_MAINNET_RPC not set; using public fallback https://mainnet.base.org",
  );
}
const geolocation = optional(env, "FLUX_GEOLOCATION")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!Number.isFinite(instances) || instances < 1) {
  console.error("FLUX_INSTANCES must be a positive integer");
  process.exit(1);
}

const coreApp = optional(env, "FLUX_CORE_APP_NAME", "aavegotchicorev2");
const gvApp = optional(env, "FLUX_GV_APP_NAME", "gotchiversebase");
const svgApp = optional(env, "FLUX_SVG_APP_NAME", "aavegotchisvgbase");
const portalApp = optional(env, "FLUX_PORTAL_APP_NAME", "aavegotchiportalbase");
const alchemicaApp = optional(env, "FLUX_ALCHEMICA_APP_NAME", "aavegotchialchemicabase");
const stakingApp = optional(env, "FLUX_STAKING_APP_NAME", "aavegotchigltrstakingbase");
const gbmApp = optional(env, "FLUX_GBM_APP_NAME", "aavegotchigbmbase");
const monolithApp = optional(env, "FLUX_MONOLITH_APP_NAME", "aavegotchimonolithbase");

/** Public Hasura URL for split-stack Flux apps (proxy is a separate app). */
function fluxHasuraPublicUrl(appName) {
  return `https://${appName}_8080.app.runonflux.io/v1/graphql`;
}

function baseFields(spec) {
  spec.owner = owner;
  spec.instances = instances;
  spec.contacts = contact ? [contact] : [];
  spec.geolocation = geolocation;
  return spec;
}

// ── core-base ──
const core = baseFields(readSpec("core-base"));
core.name = coreApp;
for (const c of core.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-core",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-core")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-core-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-core",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
}

// ── gotchiverse-base ──
const gv = baseFields(readSpec("gotchiverse-base"));
gv.name = gvApp;
for (const c of gv.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-gv",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-gv")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-gotchiverse-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-gv",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
}

// ── svg-base ──
const svg = baseFields(readSpec("svg-base"));
svg.name = svgApp;
for (const c of svg.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-svg",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-svg")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-svg-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-svg",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
}

// ── portal-base ──
const portal = baseFields(readSpec("portal-base"));
portal.name = portalApp;
for (const c of portal.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-portal",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-portal")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-portal-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-portal",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
}

// ── alchemica-base ──
const alchemica = baseFields(readSpec("alchemica-base"));
alchemica.name = alchemicaApp;
for (const c of alchemica.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-alchemica",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-alchemica")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-alchemica-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-alchemica",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
}

// ── gltr-staking-base ──
const staking = baseFields(readSpec("gltr-staking-base"));
staking.name = stakingApp;
for (const c of staking.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-staking",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-staking")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-gltr-staking-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-staking",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
}

// ── gbm-baazaar-base ──
const gbm = baseFields(readSpec("gbm-baazaar-base"));
gbm.name = gbmApp;
for (const c of gbm.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-gbm",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-gbm")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-gbm-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-gbm",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
}

// ── graphql-proxy (split apps: use public Flux Hasura URLs on :8080) ──
const proxy = baseFields(readSpec("graphql-proxy"));
for (const c of proxy.compose) {
  if (c.name === "proxy") {
    c.repotag = `${dockerUser}/aavegotchi-graphql-proxy:${imageTag}`;
    c.environmentParameters = [
      "PROXY_PORT=8787",
      `CORE_HASURA_URL=${fluxHasuraPublicUrl(coreApp)}`,
      `GV_HASURA_URL=${fluxHasuraPublicUrl(gvApp)}`,
      `SVG_HASURA_URL=${fluxHasuraPublicUrl(svgApp)}`,
      `PORTAL_HASURA_URL=${fluxHasuraPublicUrl(portalApp)}`,
      `ALCHEMICA_HASURA_URL=${fluxHasuraPublicUrl(alchemicaApp)}`,
      `STAKING_HASURA_URL=${fluxHasuraPublicUrl(stakingApp)}`,
      `GBM_HASURA_URL=${fluxHasuraPublicUrl(gbmApp)}`,
      `HASURA_ADMIN_SECRET=${hasuraSecret}`,
    ];
  }
}

// ── monolith-base (single app: postgres + hasura + indexer + proxy) ──
const monolith = baseFields(readSpec("monolith-base"));
monolith.name = monolithApp;
for (const c of monolith.compose) {
  if (c.name === "postgres") {
    c.environmentParameters = [
      "POSTGRES_USER=postgres",
      "POSTGRES_DB=envio-monolith",
      `POSTGRES_PASSWORD=${pgPassword}`,
    ];
  }
  if (c.name === "hasura") {
    c.environmentParameters = [
      `HASURA_GRAPHQL_DATABASE_URL=${postgresUrl("postgres", pgPassword, "postgres", 5432, "envio-monolith")}`,
      "HASURA_GRAPHQL_ENABLE_CONSOLE=false",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true",
      "HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public",
    ];
  }
  if (c.name === "indexer") {
    c.repotag = `${dockerUser}/aavegotchi-monolith-envio:${imageTag}`;
    c.environmentParameters = [
      `ENVIO_API_TOKEN=${envioToken}`,
      "ENVIO_PG_HOST=postgres",
      "ENVIO_PG_PORT=5432",
      "ENVIO_PG_USER=postgres",
      `ENVIO_PG_PASSWORD=${pgPassword}`,
      "ENVIO_PG_DATABASE=envio-monolith",
      "HASURA_GRAPHQL_ENDPOINT=http://hasura:8080/v1/metadata",
      `HASURA_GRAPHQL_ADMIN_SECRET=${hasuraSecret}`,
      "HASURA_SERVICE_HOST=hasura",
      "HASURA_SERVICE_PORT=8080",
      "TUI_OFF=true",
      "ENVIO_TUI=false",
      "LOG_LEVEL=info",
      ...(alchemyKey ? [`ALCHEMY_API_KEY=${alchemyKey}`] : []),
      `BASE_MAINNET_RPC=${baseRpc}`,
    ];
  }
  if (c.name === "proxy") {
    c.repotag = `${dockerUser}/aavegotchi-graphql-proxy:${imageTag}`;
    c.environmentParameters = [
      "PROXY_PORT=8787",
      `HASURA_URL=http://fluxhasura_${monolithApp}:8080/v1/graphql`,
      `HASURA_ADMIN_SECRET=${hasuraSecret}`,
    ];
  }
}

const written = [
  writeSpec("core-base", core),
  writeSpec("gotchiverse-base", gv),
  writeSpec("svg-base", svg),
  writeSpec("portal-base", portal),
  writeSpec("alchemica-base", alchemica),
  writeSpec("gltr-staking-base", staking),
  writeSpec("gbm-baazaar-base", gbm),
  writeSpec("graphql-proxy", proxy),
  writeSpec("monolith-base", monolith),
];

console.log("Prepared Flux specs:");
for (const p of written) console.log(`  ${p}`);
console.log("");
console.log(`  owner=${owner}  instances=${instances}  imageTag=${imageTag}`);
console.log(
  "  Split-stack deploy: core → gotchiverse → svg → portal → alchemica → staking → gbm → graphql-proxy",
);
console.log(
  "  Monolith deploy: upload flux/out/monolith-base-spec.json only (replaces split stack)",
);
console.log("  Upload each JSON via https://home.runonflux.io → Register New App");
if (instances > 1) {
  console.warn(
    "\n  Warning: FLUX_INSTANCES > 1 creates multiple Postgres copies per app.",
  );
  console.warn(
    "  Use 1 for production indexers unless you enable Flux data sync.",
  );
}
