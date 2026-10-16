import { strict as assert } from "assert";
import { test } from "node:test";
import { applyGotchiSeed, getGotchiSeed, loadSeed } from "../src/utils/polygonSeed";

test("seed covers all 20,544 gotchis with claimedTime", () => {
  const rows = Object.values(loadSeed());
  assert.equal(rows.length, 20544);
  assert.ok(rows.every((r) => r[4] !== null));
});

test("migrated gotchi gets Goldsky values (gotchi 3)", () => {
  assert.deepEqual(getGotchiSeed("3"), {
    createdAt: 33201946n,
    createdAtPolygon: 11518440n,
    claimedAt: 33201946n,
    claimedAtPolygon: 11518440n,
    claimedTime: 1614699431n,
  });
});

test("apply overrides first-touch createdAt but keeps on-chain claim values", () => {
  const g = applyGotchiSeed("3", {
    createdAt: 35000000n,
    claimedAt: 40000000n,
    claimedTime: 1750000000n,
    createdAtPolygon: undefined,
    claimedAtPolygon: undefined,
  });
  assert.equal(g.createdAt, 33201946n);
  assert.equal(g.claimedAt, 40000000n);
  assert.equal(g.claimedTime, 1750000000n);
  assert.equal(g.createdAtPolygon, 11518440n);
});

test("unknown id is untouched", () => {
  const g = { createdAt: 1n };
  assert.equal(applyGotchiSeed("999999999", g), g);
});
