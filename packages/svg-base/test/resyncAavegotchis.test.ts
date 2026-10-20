import { test } from "node:test";
import assert from "node:assert/strict";
import { TestHelpers } from "generated";
import "../src/EventHandlers";

const { MockDb, AavegotchiDiamond } = TestHelpers;

// Last block of the Base migration's ResyncAavegotchis run; reads Base state at this block.
const RESYNC_BLOCK = 33297256;

test("ResyncAavegotchis loads SVGs for a migrated gotchi", async () => {
  const mockDb = MockDb.createMockDb();
  const event = AavegotchiDiamond.ResyncAavegotchis.createMockEvent({
    _tokenId: 23965n,
    mockEventData: { block: { number: RESYNC_BLOCK, timestamp: 1755000000 } },
  });
  const db = await AavegotchiDiamond.ResyncAavegotchis.processEvent({ event, mockDb });
  const gotchi = db.entities.Aavegotchi.get("23965");
  assert.ok(gotchi?.svg && gotchi.svg.startsWith("<svg"), "front SVG should be loaded");
});
