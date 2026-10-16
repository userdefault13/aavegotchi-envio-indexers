import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceModeFromEnv, proxyKeyDecision } from "../src/proxyKey.js";

test("SUBGRAPH_PROXY_ENFORCE defaults to hard; only 'warn' opts out", () => {
  assert.equal(enforceModeFromEnv({}), "hard");
  assert.equal(enforceModeFromEnv({ SUBGRAPH_PROXY_ENFORCE: "" }), "hard");
  assert.equal(enforceModeFromEnv({ SUBGRAPH_PROXY_ENFORCE: "1" }), "hard");
  assert.equal(enforceModeFromEnv({ SUBGRAPH_PROXY_ENFORCE: "off" }), "hard");
  assert.equal(enforceModeFromEnv({ SUBGRAPH_PROXY_ENFORCE: "WARN" }), "warn");
});

test("hard (default): missing or wrong key is rejected, right key allowed", () => {
  const mode = enforceModeFromEnv({});
  assert.equal(proxyKeyDecision(undefined, "s3cret", mode), "reject");
  assert.equal(proxyKeyDecision("", "s3cret", mode), "reject");
  assert.equal(proxyKeyDecision("nope", "s3cret", mode), "reject");
  assert.equal(proxyKeyDecision("s3cre", "s3cret", mode), "reject");
  assert.equal(proxyKeyDecision(" s3cret ", "s3cret", mode), "allow");
});

test("warn: unkeyed callers pass but are flagged", () => {
  assert.equal(proxyKeyDecision(undefined, "s3cret", "warn"), "warn");
  assert.equal(proxyKeyDecision("s3cret", "s3cret", "warn"), "allow");
});

test("no secret configured fails closed even in warn mode", () => {
  assert.equal(proxyKeyDecision("", "", "warn"), "reject");
  assert.equal(proxyKeyDecision("anything", "", "hard"), "reject");
});
