import assert from "node:assert/strict";
import { test } from "node:test";
import { isNativeHasuraQuery, prepareNativeHasuraQuery } from "../src/hasuraNative.js";

test("detects Hasura-syntax queries", () => {
  assert.ok(isNativeHasuraQuery('{ Bid(limit: 3, order_by: {bidTime: desc_nulls_last}) { id } }'));
  assert.ok(isNativeHasuraQuery('{ Bid_by_pk(id: "x") { id } }'));
  assert.ok(isNativeHasuraQuery("{ Bid_aggregate { aggregate { count } } }"));
  assert.ok(isNativeHasuraQuery('{ Auction(where: {id: {_eq: "1"}}) { id } }'));
  assert.ok(isNativeHasuraQuery("{ a: Bid(offset: 2) { id } b: Auction(limit: 1) { id } }"));
});

test("leaves The Graph-syntax queries to the translator", () => {
  assert.ok(!isNativeHasuraQuery("{ aavegotchis(first: 5, orderBy: id, orderDirection: desc) { id } }"));
  assert.ok(!isNativeHasuraQuery('{ aavegotchi(id: "1") { id } }'));
  assert.ok(!isNativeHasuraQuery('{ parcels(where: {owner: "0xabc"}) { id } }'));
  assert.ok(!isNativeHasuraQuery("{ _meta { block { number } } }"));
});

test("clamps and defaults root limits, keeps aliases/order_by/offset", () => {
  const r = prepareNativeHasuraQuery(
    "{ a: Bid(limit: 5000, offset: 2, order_by: {bidTime: desc_nulls_last}) { id } b: Auction { id } c: Bid_by_pk(id: \"x\") { id } }",
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.match(r.query, /a: Bid\(limit: 1000, offset: 2, order_by: \{bidTime: desc_nulls_last\}\)/);
  assert.match(r.query, /b: Auction\(limit: 100\)/);
  assert.match(r.query, /c: Bid_by_pk\(id: "x"\)/);
});

test("variable limits are clamped", () => {
  const r = prepareNativeHasuraQuery("query Q($n: Int) { Bid(limit: $n) { id } }", { n: 2 });
  assert.ok(r.ok && /Bid\(limit: 2\)/.test(r.query));
});

test("rejects mutations", () => {
  const r = prepareNativeHasuraQuery("mutation { delete_Bid(where: {}) { affected_rows } }");
  assert.deepEqual(r.ok, false);
  if (!r.ok) assert.equal(r.status, 403);
});
