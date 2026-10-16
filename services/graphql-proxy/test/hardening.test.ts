import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildSchema, parse } from "graphql";
import {
  DENIED_ROOTS,
  isNativeHasuraQuery,
  prepareNativeHasuraQuery,
} from "../src/hasuraNative.js";
import { translateSubgraphToHasura } from "../src/translator.js";

const SCHEMA = buildSchema(`
  enum order_by { asc desc desc_nulls_last }
  input S { _eq: String _gt: String _lt: String }
  input Bid_bool_exp { id: S bidTime: S }
  input Bid_order_by { bidTime: order_by }
  type Bid { id: String! bidTime: String auction: Auction }
  type Auction { id: String! bids(limit: Int): [Bid!]! }
  type Bid_aggregate_fields { count: Int! }
  type Bid_aggregate { aggregate: Bid_aggregate_fields nodes: [Bid!]! }
  type raw_events { event_id: String }
  type query_root {
    Bid(limit: Int, offset: Int, order_by: [Bid_order_by!], where: Bid_bool_exp): [Bid!]!
    Bid_by_pk(id: String!): Bid
    Bid_aggregate(limit: Int, where: Bid_bool_exp): Bid_aggregate!
    Auction(limit: Int): [Auction!]!
    raw_events(limit: Int): [raw_events!]!
    raw_events_by_pk(event_id: String!): raw_events
    raw_events_aggregate(limit: Int): Bid_aggregate!
  }
  schema { query: query_root }
`);
const prep = (q: string, v: Record<string, unknown> = {}, opts = {}) => prepareNativeHasuraQuery(q, v, SCHEMA, opts);

// (2) inlined variables are removed from definitions and sent variables
test("inlined limit variable is dropped from definitions and variables", () => {
  const r = prep("query Q($n: Int, $w: Bid_bool_exp) { Bid(limit: $n, where: $w) { id } }", { n: 5000, w: { id: { _eq: "1" } } });
  assert.ok(r.ok, r.ok ? "" : r.message);
  if (!r.ok) return;
  assert.match(r.query, /Bid\(limit: 1000, where: \$w\)/);
  assert.doesNotMatch(r.query, /\$n/);
  assert.deepEqual(r.variables, { w: { id: { _eq: "1" } } });
});
test("a limit variable also used elsewhere keeps its definition", () => {
  const r = prep("query Q($n: Int) { Bid(limit: $n) { id } Auction(limit: 3) { bids(limit: $n) { id } } }", { n: 2 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.variables, {});
});

// (3) operationName
test("multiple named operations: only the chosen one is validated/clamped/sent", () => {
  const doc = "query A { Bid(limit: 9999) { id } } query B { Auction(limit: 5000) { id } } query Bad { nope { id } }";
  const r = prep(doc, {}, { operationName: "B" });
  assert.ok(r.ok, r.ok ? "" : r.message);
  if (!r.ok) return;
  assert.equal(r.operationName, "B");
  assert.match(r.query, /query B/);
  assert.doesNotMatch(r.query, /query A|query Bad/);
  assert.match(r.query, /Auction\(limit: 1000\)/);
  assert.equal(prep(doc).ok, false); // ambiguous without operationName
  assert.equal(prep(doc, {}, { operationName: "Z" }).ok, false);
});
test("unused fragments of other operations are dropped", () => {
  const r = prep("query A { ...F } query B { ...G } fragment F on query_root { Bid { id } } fragment G on query_root { Auction { id } }", {}, { operationName: "A" });
  assert.ok(r.ok, r.ok ? "" : r.message);
  if (r.ok) assert.doesNotMatch(r.query, /fragment G/);
});

// (4) every path capped
test("where:$w with Hasura operators routes native, not to the translator", () => {
  assert.ok(isNativeHasuraQuery("query Q($w: Bid_bool_exp) { Bid(where: $w) { id } }", { w: { id: { _eq: "1" } } }));
  assert.ok(isNativeHasuraQuery("{ Bid { id } }")); // PascalCase entity
  assert.ok(isNativeHasuraQuery("{ a: aavegotchis(first: 1) { id } b: aavegotchis(first: 1) { id } }")); // multi-root
});
test("translator path caps first at 1000 and default 100", () => {
  const t = translateSubgraphToHasura("{ aavegotchis(first: 5000) { id } }");
  assert.match(t.hasuraQuery, /limit: 1000/);
  assert.match(translateSubgraphToHasura("{ aavegotchis { id } }").hasuraQuery, /limit: 100/);
  assert.match(translateSubgraphToHasura("query Q($n: Int) { aavegotchis(first: $n) { id } }", { n: 3112 }).hasuraQuery, /limit: 1000/);
  assert.match(translateSubgraphToHasura("{ aavegotchis(first: -1, skip: -5) { id } }").hasuraQuery, /limit: 100, offset: 0/);
});

// (5) depth and root/alias caps
test("depth cap (default 8, configurable)", () => {
  const deep = "{ Auction(limit:1) { bids { auction { bids { auction { bids { auction { bids { id } } } } } } } } }"; // 9 levels
  assert.match((prep(deep) as { message: string }).message, /depth/);
  assert.ok(prep(deep, {}, { caps: { maxDepth: 12, maxRootFields: 10 } }).ok);
});
test("root field / alias cap (default 10, counted through fragments)", () => {
  const roots = Array.from({ length: 11 }, (_, i) => `a${i}: Bid(limit: 1) { id }`).join(" ");
  assert.match((prep(`{ ${roots} }`) as { message: string }).message, /root fields/);
  assert.match((prep(`{ ...F } fragment F on query_root { ${roots} }`) as { message: string }).message, /root fields/);
  assert.ok(prep(`{ ${roots} }`, {}, { caps: { maxDepth: 8, maxRootFields: 11 } }).ok);
});

// (6) denylist, incl. _by_pk/_aggregate and aliases/fragments, even if the schema exposes them
test("Envio internal tables are denied in every form", () => {
  assert.deepEqual([...DENIED_ROOTS].sort(), ["dynamic_contract_registry", "end_of_block_range_scanned_data", "event_sync_state", "persisted_state", "raw_events"]);
  for (const q of [
    "{ raw_events(limit: 1) { event_id } }",
    '{ raw_events_by_pk(event_id: "1") { event_id } }',
    "{ raw_events_aggregate { aggregate { count } } }",
    "{ x: raw_events(limit: 1) { event_id } }",
    "{ ...F } fragment F on query_root { raw_events(limit: 1) { event_id } }",
    "{ persisted_state(limit: 1) { id } }",
    "{ event_sync_state_aggregate { aggregate { count } } }",
    "{ end_of_block_range_scanned_data(limit: 1) { id } }",
    "{ dynamic_contract_registry_by_pk(id: \"x\") { id } }",
  ]) {
    const r = prep(q);
    assert.equal(r.ok, false, q);
    if (!r.ok) assert.match(r.message, /not available/, q);
  }
});

// (7) cryptoPnL auth_p0.py fixtures
const FX = JSON.parse(readFileSync(new URL("./fixtures/auth_p0.json", import.meta.url), "utf8")) as {
  entities: Record<string, { cursor: string; fields: string[] }>;
  queries: Array<{ entity: string; query: string; expectLimit: number; expectOffset?: number }>;
};
const FX_SCHEMA = buildSchema(`
  enum order_by { asc desc desc_nulls_last }
  input S { _eq: String _gt: String _lt: String }
  ${Object.entries(FX.entities).map(([e, { fields }]) => {
    const all = [...new Set([...fields, "id", "highestBid", "totalBids", "claimed"])];
    return `type ${e} { ${all.map((f) => `${f}: String`).join(" ")} }
      input ${e}_bool_exp { ${all.map((f) => `${f}: S`).join(" ")} }
      input ${e}_order_by { ${all.map((f) => `${f}: order_by`).join(" ")} }`;
  }).join("\n")}
  type query_root {
    ${Object.keys(FX.entities).map((e) => `${e}(limit: Int, offset: Int, order_by: [${e}_order_by!], where: ${e}_bool_exp): [${e}!]!
      ${e}_by_pk(id: String!): ${e}`).join("\n")}
  }
  schema { query: query_root }
`);
test(`auth_p0.py fixtures (${FX.queries.length} queries) go native, intact, no offset injection`, () => {
  for (const { entity, query, expectLimit, expectOffset } of FX.queries) {
    assert.ok(isNativeHasuraQuery(query), query);
    const r = prepareNativeHasuraQuery(query, {}, FX_SCHEMA);
    assert.ok(r.ok, `${query}: ${r.ok ? "" : r.message}`);
    if (!r.ok) continue;
    assert.match(r.query, new RegExp(`${entity}\\([^)]*limit: ${expectLimit}\\b`));
    if (expectOffset != null) assert.match(r.query, new RegExp(`offset: ${expectOffset}`));
    else assert.doesNotMatch(r.query, /offset/);
    if (/desc_nulls_last/.test(query)) assert.match(r.query, /desc_nulls_last/);
    parse(r.query);
  }
  // multi-root + aliases + _by_pk, which the old proxy collapsed to one row
  const r = prepareNativeHasuraQuery('{ a: Bid(limit: 3) { id } b: Auction_by_pk(id: "1") { id } }', {}, FX_SCHEMA);
  assert.ok(r.ok, r.ok ? "" : r.message);
});
