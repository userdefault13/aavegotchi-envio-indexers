import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchema } from "graphql";
import {
  containsIntrospectionField,
  isNativeHasuraQuery,
  prepareNativeHasuraQuery,
} from "../src/hasuraNative.js";
import { rootFieldMapForSubgraphPath, translateSubgraphToHasura } from "../src/translator.js";

/** Public-role schema shaped like Envio/Hasura. raw_events is NOT exposed to public. */
const SCHEMA = buildSchema(`
  enum order_by { asc desc desc_nulls_last asc_nulls_first }
  input Bid_order_by { bidTime: order_by id: order_by }
  input String_cmp { _eq: String _gt: String }
  input Bid_bool_exp { id: String_cmp bidTime: String_cmp }
  type Auction { id: String! bids(limit: Int, offset: Int): [Bid!]! tags: [String!] }
  type Bid { id: String! bidTime: String auction: Auction }
  type Bid_aggregate_fields { count: Int! }
  type Bid_aggregate { aggregate: Bid_aggregate_fields nodes: [Bid!]! }
  type Token { id: String! symbol: String }
  type query_root {
    Bid(limit: Int, offset: Int, order_by: [Bid_order_by!], where: Bid_bool_exp): [Bid!]!
    Bid_by_pk(id: String!): Bid
    Bid_aggregate(limit: Int, where: Bid_bool_exp): Bid_aggregate!
    Auction(limit: Int, offset: Int): [Auction!]!
    Token(limit: Int): [Token!]!
    unbounded: [Bid!]!
  }
  schema { query: query_root }
`);
const prep = (q: string, v: Record<string, unknown> = {}) => prepareNativeHasuraQuery(q, v, SCHEMA);
const okQuery = (q: string, v: Record<string, unknown> = {}) => {
  const r = prep(q, v);
  assert.ok(r.ok, r.ok ? "" : r.message);
  return r.ok ? r.query : "";
};
const rejected = (q: string, status = 400, v: Record<string, unknown> = {}) => {
  const r = prep(q, v);
  assert.equal(r.ok, false, `expected rejection: ${q}`);
  if (!r.ok) assert.equal(r.status, status);
  return r.ok ? "" : r.message;
};

// (1) public role: non-public tables are unknown fields → rejected
test("raw_events and other non-public tables are rejected (public-role schema)", () => {
  assert.match(rejected("{ raw_events(limit: 1) { event_id } }"), /raw_events/);
  assert.match(rejected("{ chain_metadata(limit: 1) { block_height } }"), /chain_metadata/);
});

// (2) read-only gate first, then introspection at any depth
test("mutations/subscriptions rejected before anything else", () => {
  rejected("mutation { delete_Bid(where: {}) { affected_rows } }", 403);
  rejected("subscription { Bid { id } }", 403);
  rejected("mutation { __schema { types { name } } }", 403);
});
test("__schema/__type rejected at any depth, incl. fragments", () => {
  assert.match(rejected("{ Bid(limit: 1) { id } __schema { types { name } } }"), /Introspection/);
  assert.match(rejected('{ Bid(limit: 1) { id ...F } } fragment F on Bid { __type(name: "Bid") { name } }'), /Introspection/);
  assert.match(rejected('{ Bid(limit: 1) { ... on Bid { __type(name: "x") { name } } } }'), /Introspection/);
  assert.ok(containsIntrospectionField('{ a { b { __type(name:"x") { name } } } }'));
  assert.ok(!containsIntrospectionField("{ Bid { id __typename } }"));
  okQuery("{ Bid(limit: 1) { id __typename } }");
});

// (3) clamping everywhere
test("root limits default 100 and cap at 1000", () => {
  const q = okQuery("{ a: Bid(limit: 5000) { id } b: Auction { id } }");
  assert.match(q, /a: Bid\(limit: 1000\)/);
  assert.match(q, /b: Auction\(limit: 100\)/);
});
test("nested list fields are clamped", () => {
  const q = okQuery("{ Auction(limit: 2) { id bids(limit: 9999) { id } } }");
  assert.match(q, /bids\(limit: 1000\)/);
  assert.match(okQuery("{ Auction(limit: 2) { bids { id } } }"), /bids\(limit: 100\)/);
});
test("fragment spreads and inline fragments are clamped", () => {
  const q = okQuery("{ ...R } fragment R on query_root { Bid(limit: 4000) { id } ... on query_root { Auction { bids(limit: 2000) { id } } } }");
  assert.match(q, /Bid\(limit: 1000\)/);
  assert.match(q, /Auction\(limit: 100\)/);
  assert.match(q, /bids\(limit: 1000\)/);
});
test("_aggregate nodes are clamped (nodes bounded by parent)", () => {
  const q = okQuery("{ Bid_aggregate(limit: 50000) { aggregate { count } nodes { id } } }");
  assert.match(q, /Bid_aggregate\(limit: 1000\)/);
  assert.match(okQuery("{ Bid_aggregate { aggregate { count } } }"), /Bid_aggregate\(limit: 100\)/);
});
test("variable limits are clamped and inlined", () => {
  assert.match(okQuery("query Q($n: Int) { Bid(limit: $n) { id } }", { n: 2 }), /Bid\(limit: 2\)/);
  assert.match(okQuery("query Q($n: Int) { Bid(limit: $n) { id } }", { n: 10 ** 9 }), /Bid\(limit: 1000\)/);
  assert.match(okQuery("query Q($n: Int) { Bid(limit: $n) { id } }"), /Bid\(limit: 100\)/);
});
test("unclampable lists and bad limits are rejected", () => {
  assert.match(rejected("{ unbounded { id } }"), /Cannot bound/);
  rejected("query Q($n: Int) { Bid(limit: $n) { id } }", 400, { n: -5 });
  rejected("query Q($n: Int) { Bid(limit: $n) { id } }", 400, { n: 1.5 });
  okQuery("{ Auction(limit: 1) { tags } }"); // scalar arrays are column values, fine
});

// (4) the 1-row fix
test("Hasura syntax is detected and passed through intact", () => {
  for (const q of [
    "{ Bid(limit: 3, order_by: {bidTime: desc_nulls_last}) { id } }",
    '{ Bid_by_pk(id: "x") { id } }',
    "{ Bid_aggregate { aggregate { count } } }",
    '{ Bid(where: {id: {_eq: "1"}}) { id } }',
    "{ a: Bid(offset: 2) { id } b: Auction(limit: 1) { id } }",
  ]) assert.ok(isNativeHasuraQuery(q), q);
  const q = okQuery('{ a: Bid(limit: 3, order_by: {bidTime: desc_nulls_last}) { id } b: Bid_by_pk(id: "x") { id } }');
  assert.match(q, /a: Bid\(limit: 3, order_by: \{bidTime: desc_nulls_last\}\)/);
  assert.match(q, /b: Bid_by_pk\(id: "x"\)/);
  assert.doesNotMatch(q, /offset/);
});
test("The Graph syntax still goes to the translator", () => {
  assert.ok(!isNativeHasuraQuery("{ aavegotchis(first: 5, orderBy: id, orderDirection: desc) { id } }"));
  assert.ok(!isNativeHasuraQuery('{ aavegotchi(id: "1") { id } }'));
  assert.ok(!isNativeHasuraQuery("{ _meta { block { number } } }"));
});

// (6) cryptoPnL second Hasura
test("cryptoPnL path: root map, translator and native queries", () => {
  const map = rootFieldMapForSubgraphPath("/subgraphs/name/cryptopnl-tokens-base");
  assert.equal(map.tokens, "Token");
  const t = translateSubgraphToHasura("{ tokens(first: 2) { id symbol } }", {}, map, "/subgraphs/name/cryptopnl-tokens-base");
  assert.equal(t.rootField, "Token");
  assert.match(t.hasuraQuery, /Token\(limit: 2/);
  assert.match(okQuery("{ Token(limit: 5000) { id symbol } }"), /Token\(limit: 1000\)/);
});
