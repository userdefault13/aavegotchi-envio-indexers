import { test } from "node:test";
import assert from "node:assert/strict";
import { TestHelpers } from "generated";
import "../src/EventHandlers";

const { MockDb, AavegotchiDiamond } = TestHelpers;

// Last block of the Base migration's ResyncAavegotchis run; reads Base state at this block
// (BASE_MAINNET_RPC, defaults to the public Base RPC).
const RESYNC_BLOCK = 33297256;
const OWNER = "0x2127aa7265d573aa467f1d73554d17890b872e76";

function resync(tokenId: bigint) {
  return AavegotchiDiamond.ResyncAavegotchis.createMockEvent({
    _tokenId: tokenId,
    mockEventData: { block: { number: RESYNC_BLOCK, timestamp: 1755000000 } },
  });
}

test("ResyncAavegotchis creates a migrated gotchi the Transfer handler skipped", async () => {
  const mockDb = MockDb.createMockDb();
  const db = await AavegotchiDiamond.ResyncAavegotchis.processEvent({ event: resync(23965n), mockDb });

  const gotchi = db.entities.Aavegotchi.get("23965");
  assert.ok(gotchi, "Aavegotchi 23965 should exist");
  assert.equal(gotchi.status, 3n);
  assert.equal(gotchi.owner_id, OWNER);
  assert.ok(gotchi.name.length > 0);
  assert.equal(gotchi.numericTraits.length, 6);
  assert.ok(gotchi.svg && gotchi.svg.startsWith("<svg"), "SVG should be loaded");

  const portal = db.entities.Portal.get("23965");
  assert.equal(portal?.status, "Claimed");
  assert.equal(portal?.gotchi_id, "23965");
});

test("ResyncAavegotchis ignores tokens that aren't summoned gotchis", async () => {
  const mockDb = MockDb.createMockDb();
  const db = await AavegotchiDiamond.ResyncAavegotchis.processEvent({ event: resync(999999999n), mockDb });
  assert.equal(db.entities.Aavegotchi.get("999999999"), undefined);
});
