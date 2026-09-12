import express from "express";
import {
  enrichAlchemicaErc20Balances,
  enrichSocketBridgeTransfers,
  enrichStakingPoolPositions,
} from "./enrich.js";
import {
  buildMetaResponse,
  isIntrospectionQuery,
  mapAlchemicaRowsForSubgraph,
  mapGbmRowsForSubgraph,
  mapGotchiverseStringEntities,
  mapRelationFkScalarsForSubgraph,
  mapSocketRowsForSubgraph,
  mapStakingRowsForSubgraph,
  rootFieldMapForSubgraphPath,
  translateSubgraphToHasura,
  wrapHasuraResponse,
} from "./translator.js";

const PORT = parseInt(process.env.PROXY_PORT ?? "8787", 10);
const HASURA_URL =
  process.env.HASURA_URL ??
  process.env.CORE_HASURA_URL ??
  "http://127.0.0.1:8080/v1/graphql";
const HASURA_ADMIN_SECRET =
  process.env.HASURA_ADMIN_SECRET ??
  process.env.HASURA_GRAPHQL_ADMIN_SECRET ??
  "testing";

/** Split-stack Hasura endpoints (core, gotchiverse, svg, portal). */
const GV_HASURA_URL = process.env.GV_HASURA_URL;
const SVG_HASURA_URL = process.env.SVG_HASURA_URL;
const PORTAL_HASURA_URL = process.env.PORTAL_HASURA_URL;
const ALCHEMICA_HASURA_URL = process.env.ALCHEMICA_HASURA_URL;
const STAKING_HASURA_URL =
  process.env.STAKING_HASURA_URL ?? process.env.GLTR_STAKING_HASURA_URL;
const GBM_HASURA_URL = process.env.GBM_HASURA_URL;
const CARTRIDGE_HASURA_URL = process.env.CARTRIDGE_HASURA_URL;
const CORE_HASURA_URL = process.env.CORE_HASURA_URL ?? HASURA_URL;

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
] as const;

function resolveHasuraUrl(path: string, query: string): string {
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
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
    },
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
const SUBGRAPH_PROXY_ENFORCE = String(process.env.SUBGRAPH_PROXY_ENFORCE || "").trim();
/** warn = log missing key; hard = reject */
const SUBGRAPH_PROXY_ENFORCE_MODE =
  SUBGRAPH_PROXY_ENFORCE === "hard" || SUBGRAPH_PROXY_ENFORCE === "1"
    ? "hard"
    : SUBGRAPH_PROXY_ENFORCE === "warn"
      ? "warn"
      : "";

function assertSubgraphProxyKey(req: express.Request, res: express.Response): boolean {
  if (!SUBGRAPH_PROXY_SECRET || !SUBGRAPH_PROXY_ENFORCE_MODE) return true;
  const key = String(req.headers["x-subgraph-proxy-key"] || "").trim();
  if (key === SUBGRAPH_PROXY_SECRET) return true;
  const msg = "Missing or invalid X-Subgraph-Proxy-Key";
  if (SUBGRAPH_PROXY_ENFORCE_MODE === "warn") {
    console.warn("[graphql-proxy] auth warn:", msg, req.ip);
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
    const { query, variables } = req.body as {
      query?: string;
      variables?: Record<string, unknown>;
    };
    if (!query) {
      res.status(400).json({ errors: [{ message: "Missing query" }] });
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
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
        },
        body: JSON.stringify({ query: workingQuery, variables }),
      });
      const introJson = await introRes.json();
      res.status(introRes.status).json(introJson);
      return;
    }

    const fieldMap = rootFieldMapForSubgraphPath(req.path);
    const {
      hasuraQuery,
      rootField,
      originalRootField,
      wrapStringAsEntity,
      wrapStringListAsEntity,
    } = translateSubgraphToHasura(
      workingQuery,
      variables ?? {},
      fieldMap,
      req.path,
    );
    const hasuraData = await queryHasura(hasuraUrl, hasuraQuery);
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

app.listen(PORT, () => {
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
  console.log(`  Subgraph paths: ${SUBGRAPH_PATHS.join(", ")}`);
});
