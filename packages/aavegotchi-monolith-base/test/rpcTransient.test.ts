import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// A transient upstream failure (here one 502) is retried instead of crashing the indexer.
test("a transient RPC error is retried and the gotchi is still indexed", async () => {
  let requests = 0;
  const flaky = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    if (++requests === 1) {
      res.writeHead(502).end();
      return;
    }
    const upstream = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.concat(chunks),
    });
    res.writeHead(upstream.status, { "content-type": "application/json" });
    res.end(await upstream.text());
  });
  await new Promise<void>((r) => flaky.listen(0, "127.0.0.1", r));
  const { port } = flaky.address() as { port: number };

  process.env.BASE_MAINNET_RPC = `http://127.0.0.1:${port}`;
  process.env.RPC_RETRY_BASE_MS = "50";
  const { TestHelpers } = await import("generated");
  await import("../src/EventHandlers");
  const { MockDb, AavegotchiDiamond } = TestHelpers;
  const event = AavegotchiDiamond.ResyncAavegotchis.createMockEvent({
    _tokenId: 23965n,
    mockEventData: { block: { number: 33297256, timestamp: 1755000000 } },
  });
  try {
    const db = await AavegotchiDiamond.ResyncAavegotchis.processEvent({
      event,
      mockDb: MockDb.createMockDb(),
    });
    assert.equal(db.entities.Aavegotchi.get("23965")?.status, 3n);
    assert.ok(requests > 1, "the 502 should have been retried");
  } finally {
    flaky.close();
  }
});
