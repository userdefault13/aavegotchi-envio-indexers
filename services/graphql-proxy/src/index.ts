import express from "express";
import {
  buildMetaResponse,
  isIntrospectionQuery,
  translateSubgraphToHasura,
  wrapHasuraResponse,
} from "./translator.js";

const PORT = parseInt(process.env.PROXY_PORT ?? "8787", 10);
const CORE_HASURA_URL = process.env.CORE_HASURA_URL ?? "http://127.0.0.1:8080/v1/graphql";
const GV_HASURA_URL = process.env.GV_HASURA_URL ?? "http://127.0.0.1:8081/v1/graphql";
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET ?? process.env.HASURA_GRAPHQL_ADMIN_SECRET ?? "testing";

type Backend = "core" | "gotchiverse";

function resolveBackend(path: string, query: string): Backend {
  if (path.includes("gotchiverse") || query.includes("installationTypes") || query.includes("equippedInstallations")) {
    return "gotchiverse";
  }
  return "core";
}

async function queryHasura(url: string, hasuraQuery: string): Promise<Record<string, unknown>> {
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
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Hasura: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Hasura returned no data");
  return json.data;
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aavegotchi-graphql-proxy" });
});

async function handleGraphql(req: express.Request, res: express.Response) {
  try {
    const { query, variables } = req.body as { query?: string; variables?: Record<string, unknown> };
    if (!query) {
      res.status(400).json({ errors: [{ message: "Missing query" }] });
      return;
    }

    if (query.includes("_meta")) {
      res.json({ data: buildMetaResponse() });
      return;
    }

    if (isIntrospectionQuery(query)) {
      const backend = resolveBackend(req.path, query);
      const hasuraUrl = backend === "gotchiverse" ? GV_HASURA_URL : CORE_HASURA_URL;
      const introRes = await fetch(hasuraUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
        },
        body: JSON.stringify({ query, variables }),
      });
      const introJson = await introRes.json();
      res.status(introRes.status).json(introJson);
      return;
    }

    const backend = resolveBackend(req.path, query);
    const hasuraUrl = backend === "gotchiverse" ? GV_HASURA_URL : CORE_HASURA_URL;

    const { hasuraQuery, rootField, originalRootField } = translateSubgraphToHasura(query, variables ?? {});
    const hasuraData = await queryHasura(hasuraUrl, hasuraQuery);
    const data = wrapHasuraResponse(hasuraData, rootField, originalRootField);

    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ errors: [{ message }] });
  }
}

app.post("/subgraphs/name/aavegotchi-core-base", handleGraphql);
app.post("/subgraphs/name/aavegotchi-core-base/*", handleGraphql);
app.post("/subgraphs/name/gotchiverse-base", handleGraphql);
app.post("/subgraphs/name/gotchiverse-base/*", handleGraphql);
app.post("/", handleGraphql);

app.listen(PORT, () => {
  console.log(`GraphQL compat proxy listening on :${PORT}`);
  console.log(`  Core Hasura: ${CORE_HASURA_URL}`);
  console.log(`  GV Hasura:   ${GV_HASURA_URL}`);
});
