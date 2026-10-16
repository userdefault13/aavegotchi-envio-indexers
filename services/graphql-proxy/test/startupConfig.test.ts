import assert from "node:assert/strict";
import { test } from "node:test";
import { hasuraAuthConfigFromEnv } from "../src/hasuraAuth.js";
import { startupConfigErrors } from "../src/startupConfig.js";

const errs = (env: NodeJS.ProcessEnv) => startupConfigErrors(env, hasuraAuthConfigFromEnv(env));

test("refuses to start when SUBGRAPH_PROXY_SECRET is unset or blank", () => {
  for (const env of [{}, { SUBGRAPH_PROXY_SECRET: "" }, { SUBGRAPH_PROXY_SECRET: "   " }]) {
    const e = errs(env);
    assert.equal(e.length, 1);
    assert.match(e[0], /SUBGRAPH_PROXY_SECRET is unset/);
  }
});

test("starts with SUBGRAPH_PROXY_SECRET set (default unauthorized-role needs nothing else)", () => {
  assert.deepEqual(errs({ SUBGRAPH_PROXY_SECRET: "k" }), []);
});

test("legacy secret-with-role still requires HASURA_ADMIN_SECRET", () => {
  const e = errs({ SUBGRAPH_PROXY_SECRET: "k", HASURA_PUBLIC_AUTH: "secret-with-role" });
  assert.equal(e.length, 1);
  assert.match(e[0], /HASURA_ADMIN_SECRET/);
});
