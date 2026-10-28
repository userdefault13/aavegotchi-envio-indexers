import express from "express";
import {
  enrichAlchemicaErc20Balances,
  enrichSocketBridgeTransfers,
  enrichStakingPoolPositions,
} from "./enrich.js";
import {
  capsFromEnv,
  checkShape,
  containsIntrospectionField,
  isNativeHasuraQuery,
  selectOperation,
  prepareNativeHasuraQuery,
} from "./hasuraNative.js";
import { startupConfigErrors } from "./startupConfig.js";
import { enforceModeFromEnv, proxyKeyDecision } from "./proxyKey.js";
import { HasuraConfigError, hasuraAuthConfigFromEnv, hasuraHeadersFor } from "./hasuraAuth.js";
import { parse, print, buildClientSchema, getIntrospectionQuery, type GraphQLSchema, type IntrospectionQuery } from "graphql";
import {
  buildMetaResponse,
  isIntrospectionQuery,
  queryOnlyError,
  mapAlchemicaRowsForSubgraph,
  mapGbmRowsForSubgraph,
  mapGotchiverseStringEntities,
  mapRelationFkScalarsForSubgraph,
  mapSocketRowsForSubgraph,
  mapStakingRowsForSubgraph,
  rootFieldMapForSubgraphPath,
  hasuraColumnsFromIntrospection,
  translateSubgraphToHasura,
  withHasuraColumns,
  wrapHasuraResponse,
  type HasuraColumns,
} from "./translator.js";

const PORT = parseInt(process.env.PROXY_PORT ?? "8787", 10);
const HASURA_URL =
  process.env.HASURA_URL ??
  process.env.CORE_HASURA_URL ??
  "http://127.0.0.1:8080/v1/graphql";
const HASURA_AUTH = hasuraAuthConfigFromEnv();
const QUERY_CAPS = capsFromEnv();

/** Split-stack Hasura endpoints (core, gotchiverse, svg, portal). */
const GV_HASURA_URL = process.env.GV_HASURA_URL;
const SVG_HASURA_URL = process.env.SVG_HASURA_URL;
const PORTAL_HASURA_URL = process.env.PORTAL_HASURA_URL;
const ALCHEMICA_HASURA_URL = process.env.ALCHEMICA_HASURA_URL;
const STAKING_HASURA_URL =
  process.env.STAKING_HASURA_URL ?? process.env.GLTR_STAKING_HASURA_URL;
const GBM_HASURA_URL = process.env.GBM_HASURA_URL;
const CARTRIDGE_HASURA_URL = process.env.CARTRIDGE_HASURA_URL;
const ACARTRIDGE_HASURA_URL = process.env.ACARTRIDGE_HASURA_URL;
const CORE_HASURA_URL = process.env.CORE_HASURA_URL ?? HASURA_URL;
/** Aavegotchi H1 on Avalanche (Fuji 43113 today): packages/avax-h1-market. */
const AVAX_H1_HASURA_URL = process.env.AVAX_H1_HASURA_URL;
/** cryptoPnL tokens indexer on omarchywin (own Hasura + admin secret). */
const CRYPTOPNL_HASURA_URL = process.env.CRYPTOPNL_HASURA_URL;

const SUBGRAPH_PATHS = [
  "aavegotchi-core-base",
  "gotchiverse-base",
  "aavegotchi-gbm-baazaar-base",
  "aavegotchi-svg-base",
  "aavegotchi-portal-base",
  "aavegotchi-alchemica-base",
  "socket-bridge-base",
  "aavegotchi-gltr-staking-base",
  "aarcade-cartridge-base",
  "aarcade-acartridge-base",
  "cryptopnl-tokens-base",
  "aavegotchi-avax-h1-market",
] as const;

function resolveHasuraUrl(path: string, query: string): string {
  if (path.includes("cryptopnl-tokens-base") && CRYPTOPNL_HASURA_URL) return CRYPTOPNL_HASURA_URL;
  // Avalanche H1 market has its own DB; checked before the generic "baazaar"/"portal" matches.
  if (path.includes("avax-h1") && AVAX_H1_HASURA_URL) return AVAX_H1_HASURA_URL;
  // aCartridge (agents) — checked first: "aarcade-acartridge-base" also matches "cartridge-base" below
  if (path.includes("acartridge") && ACARTRIDGE_HASURA_URL) {
    return ACARTRIDGE_HASURA_URL;
  }
  if (
    (path.includes("aarcade-cartridge") || path.includes("cartridge-base")) &&
    CARTRIDGE_HASURA_URL
  ) {
    return CARTRIDGE_HASURA_URL;
  }
  if (
    (path.includes("gbm") || path.includes("baazaar")) &&
    GBM_HASURA_URL
  ) {
    return GBM_HASURA_URL;
  }
  if (path.includes("svg") && SVG_HASURA_URL) return SVG_HASURA_URL;
  if (path.includes("portal") && PORTAL_HASURA_URL) return PORTAL_HASURA_URL;
  if (path.includes("alchemica") && ALCHEMICA_HASURA_URL) {
    return ALCHEMICA_HASURA_URL;
  }
  if (
    (path.includes("gltr-staking") || path.includes("gltr_staking")) &&
    STAKING_HASURA_URL
  ) {
    return STAKING_HASURA_URL;
  }
  if (
    GV_HASURA_URL &&
    (path.includes("gotchiverse") ||
      query.includes("installationTypes") ||
      query.includes("equippedInstallations"))
  ) {
    return GV_HASURA_URL;
  }
  if (
    GV_HASURA_URL ||
    SVG_HASURA_URL ||
    PORTAL_HASURA_URL ||
    ALCHEMICA_HASURA_URL ||
    STAKING_HASURA_URL ||
    GBM_HASURA_URL
  ) {
    return CORE_HASURA_URL;
  }
  return HASURA_URL;
}

async function queryHasura(
  url: string,
  hasuraQuery: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: hasuraHeadersFor(url, HASURA_AUTH),
    body: JSON.stringify({ query: hasuraQuery }),
  });
  if (!res.ok) {
    throw new Error(`Hasura HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`Hasura: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Hasura returned no data");
  return json.data;
}


/**
 * Each Hasura's entity columns, from introspection, so relation→FK remapping follows the real schema.
 * Cached per endpoint; on failure the translator falls back to its name-based rules and we retry soon.
 */
const COLUMNS_QUERY = `{ __schema { types { name kind fields { name type { kind ofType { kind ofType { kind } } } } } } }`;
const COLUMNS_TTL_MS = 10 * 60_000;
const COLUMNS_RETRY_MS = 60_000;
const columnsCache = new Map<string, { at: number; ttl: number; columns: HasuraColumns | null }>();

async function hasuraColumnsFor(hasuraUrl: string): Promise<HasuraColumns | null> {
  const cached = columnsCache.get(hasuraUrl);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.columns;
  try {
    const columns = hasuraColumnsFromIntrospection(await queryHasura(hasuraUrl, COLUMNS_QUERY));
    columnsCache.set(hasuraUrl, { at: Date.now(), ttl: COLUMNS_TTL_MS, columns });
    return columns;
  } catch (err) {
    console.warn(`[graphql-proxy] column introspection failed for ${hasuraUrl}; using name-based FK rules:`, (err as Error).message);
    columnsCache.set(hasuraUrl, { at: Date.now(), ttl: COLUMNS_RETRY_MS, columns: cached?.columns ?? null });
    return cached?.columns ?? null;
  }
}

/** Public-role schema per endpoint, for validating/clamping native queries. */
const SCHEMA_TTL_MS = 10 * 60_000;
const schemaCache = new Map<string, { at: number; schema: GraphQLSchema }>();
async function publicSchemaFor(hasuraUrl: string): Promise<GraphQLSchema> {
  const cached = schemaCache.get(hasuraUrl);
  if (cached && Date.now() - cached.at < SCHEMA_TTL_MS) return cached.schema;
  const data = await queryHasura(hasuraUrl, getIntrospectionQuery());
  const schema = buildClientSchema(data as unknown as IntrospectionQuery);
  schemaCache.set(hasuraUrl, { at: Date.now(), schema });
  return schema;
}

const CHAIN_META_QUERY = `{
  chain_metadata(limit: 1) {
    latest_processed_block
    latest_fetched_block_number
    block_height
  }
}`;

async function fetchIndexedBlock(hasuraUrl: string): Promise<number> {
  try {
    const data = await queryHasura(hasuraUrl, CHAIN_META_QUERY);
    const rows = data.chain_metadata;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || typeof row !== "object") return 0;
    const r = row as Record<string, unknown>;
    const candidates = [
      r.latest_processed_block,
      r.latest_fetched_block_number,
      r.block_height,
    ];
    for (const c of candidates) {
      const n = typeof c === "number" ? c : Number(c);
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
    return 0;
  } catch (err) {
    console.warn(
      "[graphql-proxy] chain_metadata lookup failed:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

const CORS_ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? "*";
const SUBGRAPH_PROXY_SECRET = String(process.env.SUBGRAPH_PROXY_SECRET || "").trim();
const SUBGRAPH_PROXY_ENFORCE_MODE = enforceModeFromEnv();

function assertSubgraphProxyKey(req: express.Request, res: express.Response): boolean {
  const decision = proxyKeyDecision(
    req.headers["x-subgraph-proxy-key"],
    SUBGRAPH_PROXY_SECRET,
    SUBGRAPH_PROXY_ENFORCE_MODE,
  );
  if (decision === "allow") return true;
  const msg = "Missing or invalid X-Subgraph-Proxy-Key";
  if (decision === "warn") {
    console.warn("[graphql-proxy] auth warn (SUBGRAPH_PROXY_ENFORCE=warn):", msg, req.path, req.ip);
    return true;
  }
  res.status(401).json({ errors: [{ message: msg }] });
  return false;
}

const app = express();

/** Browser clients (e.g. aarcadeghst.com) POST with Content-Type: application/json. */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Subgraph-Proxy-Key",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "aavegotchi-graphql-proxy",
    mode:
      GV_HASURA_URL ||
      SVG_HASURA_URL ||
      PORTAL_HASURA_URL ||
      ALCHEMICA_HASURA_URL ||
      STAKING_HASURA_URL ||
      GBM_HASURA_URL
        ? "split-hasura"
        : "monolith",
    coreHasuraUrl: CORE_HASURA_URL,
    gvHasuraUrl: GV_HASURA_URL,
    svgHasuraUrl: SVG_HASURA_URL,
    portalHasuraUrl: PORTAL_HASURA_URL,
    alchemicaHasuraUrl: ALCHEMICA_HASURA_URL,
    stakingHasuraUrl: STAKING_HASURA_URL,
    gbmHasuraUrl: GBM_HASURA_URL,
    subgraphPaths: SUBGRAPH_PATHS,
  });
});


function stripMetaSelection(query: string): { withoutMeta: string; onlyMeta: boolean } {
  const match = /_meta\s*\{/.exec(query);
  if (!match || match.index == null) {
    return { withoutMeta: query, onlyMeta: false };
  }
  const start = match.index;
  const braceStart = query.indexOf('{', start);
  let depth = 0;
  let end = braceStart;
  for (let j = braceStart; j < query.length; j++) {
    const ch = query[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = j + 1;
        break;
      }
    }
  }
  const withoutMeta = `${query.slice(0, start)} ${query.slice(end)}`;
  const onlyMeta = withoutMeta.replace(/[#\s,{}]/g, '').length === 0;
  return { withoutMeta, onlyMeta };
}

async function handleGraphql(req: express.Request, res: express.Response) {
  if (!assertSubgraphProxyKey(req, res)) return;
  try {
    const { query, variables, operationName } = req.body as {
      query?: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    };
    if (!query) {
      res.status(400).json({ errors: [{ message: "Missing query" }] });
      return;
    }
    const readOnlyErr = queryOnlyError(query);
    if (readOnlyErr) {
      console.warn("[graphql-proxy] rejected non-query:", readOnlyErr.slice(0, 120), req.path, req.ip);
      res.status(400).json({ errors: [{ message: readOnlyErr }] });
      return;
    }

    const hasuraUrl = resolveHasuraUrl(req.path, query);

    // The Graph clients expect `_meta.block.number`. Envio Hasura has no native
    // `_meta`, so we synthesize it from chain_metadata (not a hardcoded 0).
    let metaBlock: number | null = null;
    let workingQuery = query;
    if (query.includes("_meta")) {
      metaBlock = await fetchIndexedBlock(hasuraUrl);
      const { withoutMeta, onlyMeta } = stripMetaSelection(query);
      if (onlyMeta) {
        res.json({ data: buildMetaResponse(metaBlock) });
        return;
      }
      workingQuery = withoutMeta;
    }

    if (isIntrospectionQuery(workingQuery)) {
      const introRes = await fetch(hasuraUrl, {
        method: "POST",
        headers: hasuraHeadersFor(hasuraUrl, HASURA_AUTH),
        body: JSON.stringify({ query: workingQuery, variables }),
      });
      const introJson = await introRes.json();
      res.status(introRes.status).json(introJson);
      return;
    }

    // Introspection is only served as a pure introspection document (above, public role).
    if (containsIntrospectionField(workingQuery)) {
      res.status(400).json({ errors: [{ message: "Introspection fields (__schema/__type) are not allowed in data queries" }] });
      return;
    }

    // Hasura-syntax callers (limit/offset/order_by/_by_pk/_aggregate) pass through untranslated.
    if (isNativeHasuraQuery(workingQuery, variables ?? {}, operationName)) {
      const schema = await publicSchemaFor(hasuraUrl);
      const prepared = prepareNativeHasuraQuery(workingQuery, variables ?? {}, schema, {
        operationName,
        caps: QUERY_CAPS,
      });
      if (!prepared.ok) {
        res.status(prepared.status).json({ errors: [{ message: prepared.message }] });
        return;
      }
      const nativeRes = await fetch(hasuraUrl, {
        method: "POST",
        headers: hasuraHeadersFor(hasuraUrl, HASURA_AUTH),
        body: JSON.stringify({
          query: prepared.query,
          variables: prepared.variables,
          ...(prepared.operationName ? { operationName: prepared.operationName } : {}),
        }),
      });
      const nativeJson = (await nativeRes.json()) as { data?: Record<string, unknown> };
      if (metaBlock != null && nativeJson?.data) {
        Object.assign(nativeJson.data, buildMetaResponse(metaBlock));
      }
      res.status(nativeRes.status).json(nativeJson);
      return;
    }

    // Translator (The Graph syntax) path: same denylist/depth/root caps on the input...
    {
      let parsedDoc;
      try { parsedDoc = parse(workingQuery); } catch (e) {
        res.status(400).json({ errors: [{ message: `Invalid GraphQL: ${(e as Error).message}` }] });
        return;
      }
      const sel = selectOperation(parsedDoc, operationName);
      const shapeErr = sel.ok ? checkShape(sel.doc, sel.op, QUERY_CAPS) : sel.message;
      if (shapeErr || !sel.ok) {
        res.status(400).json({ errors: [{ message: shapeErr }] });
        return;
      }
      workingQuery = print(sel.doc); // translator sees only the selected operation
    }
    const fieldMap = rootFieldMapForSubgraphPath(req.path);
    const columns = await hasuraColumnsFor(hasuraUrl);
    const {
      hasuraQuery,
      rootField,
      originalRootField,
      wrapStringAsEntity,
      wrapStringListAsEntity,
    } = withHasuraColumns(columns, () =>
      translateSubgraphToHasura(workingQuery, variables ?? {}, fieldMap, req.path),
    );
    // ...and the generated Hasura query is clamped/validated like a native one (root + nested lists).
    const clamped = prepareNativeHasuraQuery(hasuraQuery, {}, await publicSchemaFor(hasuraUrl), {
      caps: { maxDepth: QUERY_CAPS.maxDepth + 2, maxRootFields: QUERY_CAPS.maxRootFields },
    });
    if (!clamped.ok) {
      res.status(clamped.status).json({ errors: [{ message: clamped.message }] });
      return;
    }
    const hasuraData = await queryHasura(hasuraUrl, clamped.query);
    let rows: unknown = hasuraData[rootField];
    const q = (subquery: string) => queryHasura(hasuraUrl, subquery);

    if (req.path.includes("alchemica") && originalRootField === "erc20Balances") {
      rows = await enrichAlchemicaErc20Balances(rows, query, q);
    }
    if (
      (req.path.includes("socket-bridge") || req.path.includes("socket_bridge")) &&
      originalRootField === "bridgeTransfers"
    ) {
      rows = await enrichSocketBridgeTransfers(rows, query, q);
    }
    if (
      (req.path.includes("gltr-staking") || req.path.includes("gltr_staking")) &&
      originalRootField === "poolPositions"
    ) {
      rows = await enrichStakingPoolPositions(rows, query, q);
    }

    rows = mapGotchiverseStringEntities(
      rows,
      wrapStringAsEntity,
      wrapStringListAsEntity,
    );

    // The Graph singular roots return one object; Hasura always returns a list.
    if (
      !originalRootField.endsWith("s") &&
      originalRootField !== "statistics" &&
      Array.isArray(rows)
    ) {
      rows = rows[0] ?? null;
    }

    let data = wrapHasuraResponse({ [rootField]: rows }, rootField, originalRootField);
    data = {
      [originalRootField]: mapRelationFkScalarsForSubgraph(data[originalRootField]),
    };
    if (req.path.includes("gbm") || req.path.includes("baazaar")) {
      data = {
        [originalRootField]: mapGbmRowsForSubgraph(data[originalRootField]),
      };
    }
    if (req.path.includes("alchemica")) {
      data = {
        [originalRootField]: mapAlchemicaRowsForSubgraph(data[originalRootField]),
      };
    }
    if (req.path.includes("socket-bridge") || req.path.includes("socket_bridge")) {
      data = {
        [originalRootField]: mapSocketRowsForSubgraph(data[originalRootField]),
      };
    }
    if (req.path.includes("gltr-staking") || req.path.includes("gltr_staking")) {
      data = {
        [originalRootField]: mapStakingRowsForSubgraph(data[originalRootField]),
      };
    }

    if (metaBlock != null) {
      Object.assign(data, buildMetaResponse(metaBlock));
    }
    res.json({ data });
  } catch (err) {
    if (err instanceof HasuraConfigError) {
      console.error("[graphql-proxy] misconfigured:", err.message);
      res.status(503).json({ errors: [{ message: "Subgraph backend not configured" }] });
      return;
    }
    const base = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? ` (${err.cause.message})`
        : "";
    res.status(500).json({ errors: [{ message: `${base}${cause}` }] });
  }
}

for (const subgraph of SUBGRAPH_PATHS) {
  app.post(`/subgraphs/name/${subgraph}`, handleGraphql);
  app.post(`/subgraphs/name/${subgraph}/*`, handleGraphql);
}
app.post("/", handleGraphql);

const startupErrors = startupConfigErrors(process.env, HASURA_AUTH);
if (startupErrors.length) {
  for (const e of startupErrors) console.error(`[graphql-proxy] FATAL: ${e}`);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`  X-Subgraph-Proxy-Key enforcement: ${SUBGRAPH_PROXY_ENFORCE_MODE}`);
  console.log(`GraphQL compat proxy listening on :${PORT}`);
  console.log(`  Hasura: ${HASURA_URL}`);
  if (GV_HASURA_URL) console.log(`  Core Hasura:   ${CORE_HASURA_URL}`);
  if (GV_HASURA_URL) console.log(`  GV Hasura:     ${GV_HASURA_URL}`);
  if (SVG_HASURA_URL) console.log(`  SVG Hasura:    ${SVG_HASURA_URL}`);
  if (PORTAL_HASURA_URL) console.log(`  Portal Hasura: ${PORTAL_HASURA_URL}`);
  if (ALCHEMICA_HASURA_URL) {
    console.log(`  Alchemica Hasura: ${ALCHEMICA_HASURA_URL}`);
  }
  if (STAKING_HASURA_URL) console.log(`  Staking Hasura: ${STAKING_HASURA_URL}`);
  if (GBM_HASURA_URL) console.log(`  GBM Hasura: ${GBM_HASURA_URL}`);
  if (CARTRIDGE_HASURA_URL) console.log(`  Cartridge Hasura: ${CARTRIDGE_HASURA_URL}`);
  if (ACARTRIDGE_HASURA_URL) console.log(`  aCartridge Hasura: ${ACARTRIDGE_HASURA_URL}`);
  if (AVAX_H1_HASURA_URL) console.log(`  Avalanche H1 Hasura: ${AVAX_H1_HASURA_URL}`);
  console.log(`  Subgraph paths: ${SUBGRAPH_PATHS.join(", ")}`);
});
