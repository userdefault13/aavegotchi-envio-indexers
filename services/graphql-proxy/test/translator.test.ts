import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasuraColumnsFromIntrospection,
  translateSubgraphToHasura,
  withHasuraColumns,
  type HasuraColumns,
} from "../src/translator.js";

/** Shaped like Hasura's introspection of the core-base Envio schema (trimmed to what matters). */
const scalar = (name: string) => ({ name, type: { kind: "NON_NULL", ofType: { kind: "SCALAR" } } });
const object = (name: string) => ({ name, type: { kind: "OBJECT", ofType: null } });
const INTROSPECTION = {
  __schema: {
    types: [
      { name: "ItemTypeOwnership", kind: "OBJECT", fields: [scalar("id"), scalar("owner"), scalar("balance"), object("itemType"), scalar("itemType_id")] },
      { name: "Aavegotchi", kind: "OBJECT", fields: [scalar("id"), object("owner"), scalar("owner_id"), object("originalOwner"), scalar("originalOwner_id")] },
      { name: "FakeGotchiNFTToken", kind: "OBJECT", fields: [scalar("id"), scalar("contract")] },
      { name: "__Type", kind: "OBJECT", fields: [scalar("name")] },
    ],
  },
};
const columns: HasuraColumns = hasuraColumnsFromIntrospection(INTROSPECTION);

const translate = (query: string, cols: HasuraColumns | null = columns) =>
  withHasuraColumns(cols, () =>
    translateSubgraphToHasura(query, { first: 1000, skip: 0 }, undefined, "/subgraphs/name/aavegotchi-core-base"),
  ).hasuraQuery;

test("introspection: scalars vs object relations, NON_NULL unwrapped, __ types skipped", () => {
  assert.deepEqual([...columns.get("ItemTypeOwnership")!.scalars].sort(), ["balance", "id", "itemType_id", "owner"]);
  assert.deepEqual([...columns.get("Aavegotchi")!.objects].sort(), ["originalOwner", "owner"]);
  assert.equal(columns.has("__Type"), false);
});

test("quorum's failing query: ItemTypeOwnership.owner (Bytes) stays `owner`, not `owner_id`", () => {
  const q = translate(`query($first: Int!, $skip: Int!) { itemTypeOwnerships(first: $first, skip: $skip, orderBy: id) { owner } }`);
  assert.match(q, /\bowner\b/);
  assert.doesNotMatch(q, /owner_id/);
});

test("a real relation selected as a scalar still maps to its FK (Aavegotchi.owner → owner_id)", () => {
  const q = translate(`{ aavegotchis(first: 5) { id owner originalOwner } }`);
  assert.match(q, /\bowner_id\b/);
  assert.match(q, /\boriginalOwner_id\b/);
});

test("where filters follow the schema too", () => {
  const scalarFilter = translate(`{ itemTypeOwnerships(where: { owner: "0xabc" }) { id } }`);
  assert.match(scalarFilter, /owner: \{\s*_eq: "0xabc"/);
  assert.doesNotMatch(scalarFilter, /owner_id/);
  const relationFilter = translate(`{ aavegotchis(where: { owner: "0xabc" }) { id } }`);
  assert.match(relationFilter, /owner_id: \{\s*_eq: "0xabc"/);
});

test("Bytes `contract` column is not remapped to contract_id", () => {
  const q = translate(`{ fakeGotchiNFTTokens(first: 1) { id contract } }`);
  assert.doesNotMatch(q, /contract_id/);
});

test("without introspection the previous name-based rules apply unchanged", () => {
  const q = translate(`{ aavegotchis(first: 5) { id owner } }`, null);
  assert.match(q, /\bowner_id\b/);
});
