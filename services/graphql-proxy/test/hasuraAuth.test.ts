import assert from "node:assert/strict";
import { test } from "node:test";
import { HasuraConfigError, hasuraAuthConfigFromEnv, hasuraHeadersFor } from "../src/hasuraAuth.js";

const CORE = "http://core:8080/v1/graphql";
const CPNL = "http://omarchywin:8080/v1/graphql";

test("every fetch runs as the public role, never admin", () => {
  const cfg = hasuraAuthConfigFromEnv({ HASURA_PUBLIC_AUTH: "secret-with-role", HASURA_ADMIN_SECRET: "s1" });
  const h = hasuraHeadersFor(CORE, cfg);
  assert.equal(h["x-hasura-role"], "public");
});

test("unauthorized-role mode sends no admin secret at all", () => {
  const cfg = hasuraAuthConfigFromEnv({ HASURA_PUBLIC_AUTH: "unauthorized-role", HASURA_ADMIN_SECRET: "s1" });
  const h = hasuraHeadersFor(CORE, cfg);
  assert.equal(h["x-hasura-admin-secret"], undefined);
  assert.equal(h["x-hasura-role"], "public");
});

test("default is unauthorized-role: no admin secret sent even when one is set", () => {
  for (const env of [{}, { HASURA_ADMIN_SECRET: "s1", CRYPTOPNL_HASURA_URL: CPNL, CRYPTOPNL_HASURA_ADMIN_SECRET: "cp" }]) {
    const cfg = hasuraAuthConfigFromEnv(env);
    assert.equal(cfg.mode, "unauthorized-role");
    for (const url of [CORE, CPNL]) {
      const h = hasuraHeadersFor(url, cfg);
      assert.equal(h["x-hasura-admin-secret"], undefined);
      assert.equal(h["x-hasura-role"], "public");
    }
  }
});

test("legacy secret-with-role: no 'testing' fallback, unset secret fails closed", () => {
  const cfg = hasuraAuthConfigFromEnv({ HASURA_PUBLIC_AUTH: "secret-with-role" });
  assert.equal(cfg.adminSecret, "");
  assert.throws(() => hasuraHeadersFor(CORE, cfg), HasuraConfigError);
});

test("legacy mode: cryptoPnL upstream uses its own secret, still as public; fails closed if unset", () => {
  const cfg = hasuraAuthConfigFromEnv({ HASURA_PUBLIC_AUTH: "secret-with-role", HASURA_ADMIN_SECRET: "core", CRYPTOPNL_HASURA_URL: CPNL, CRYPTOPNL_HASURA_ADMIN_SECRET: "cp" });
  const h = hasuraHeadersFor(CPNL, cfg);
  assert.equal(h["x-hasura-admin-secret"], "cp");
  assert.equal(h["x-hasura-role"], "public");
  assert.equal(hasuraHeadersFor(CORE, cfg)["x-hasura-admin-secret"], "core");
  const noCp = hasuraAuthConfigFromEnv({ HASURA_PUBLIC_AUTH: "secret-with-role", HASURA_ADMIN_SECRET: "core", CRYPTOPNL_HASURA_URL: CPNL });
  assert.throws(() => hasuraHeadersFor(CPNL, noCp), HasuraConfigError);
});
