import { test } from "node:test";
import assert from "node:assert/strict";

// Chain reads that fail for network reasons must stop the handler, not write an empty entity.
test("an unreachable RPC fails the handler instead of skipping the gotchi", async () => {
  process.env.BASE_MAINNET_RPC = "http://127.0.0.1:9";
  const { TestHelpers } = await import("generated");
  await import("../src/EventHandlers");
  const { MockDb, AavegotchiDiamond } = TestHelpers;
  const event = AavegotchiDiamond.ResyncAavegotchis.createMockEvent({
    _tokenId: 23965n,
    mockEventData: { block: { number: 33297256, timestamp: 1755000000 } },
  });
  await assert.rejects(
    AavegotchiDiamond.ResyncAavegotchis.processEvent({ event, mockDb: MockDb.createMockDb() }),
  );
});
