// Wired test: real EventHandlers.ts through Envio's generated MockDb (needs `envio codegen` first).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TestHelpers } from "generated";
import "../src/EventHandlers";

const { MockDb, AavegotchiH1Diamond } = TestHelpers;

const DIAMOND = "0x86979152855A431befb2e2CFa78961d72e22Acb3";
const SELLER = "0x2127AA7265D573Aa467f1D73554D17890b872E76";
const BUYER = "0x75Ea6EE00AE1097c7DeF2a18760D8f8ea1d5DA9e";
const data = (logIndex: number, ts = 1_761_500_000, number = 60_040_000) => ({
  chainId: 43113,
  logIndex,
  srcAddress: DIAMOND,
  block: { number, timestamp: ts },
  transaction: { hash: `0x${String(logIndex).padStart(64, "0")}` },
});

test("listing add -> cancel, and add -> sale + recipient, land in the DB with activity", async () => {
  let db = MockDb.createMockDb();
  db = await AavegotchiH1Diamond.ERC721ListingAdd.processEvent({
    event: AavegotchiH1Diamond.ERC721ListingAdd.createMockEvent({
      listingId: 1n, seller: SELLER, erc721TokenAddress: DIAMOND, erc721TokenId: 26002n,
      category: 0n, time: 2_000_000n, mockEventData: data(1),
    }),
    mockDb: db,
  });
  const l1 = db.entities.ERC721Listing.get("43113-1");
  assert.equal(l1?.priceInWei, 2_000_000n);
  assert.equal(l1?.status, "active");
  assert.equal(l1?.seller, SELLER.toLowerCase());

  db = await AavegotchiH1Diamond.ERC721ListingCancelled.processEvent({
    event: AavegotchiH1Diamond.ERC721ListingCancelled.createMockEvent({
      listingId: 1n, category: 0n, time: 1_761_500_100n, mockEventData: data(2),
    }),
    mockDb: db,
  });
  assert.equal(db.entities.ERC721Listing.get("43113-1")?.status, "cancelled");

  db = await AavegotchiH1Diamond.ERC721ListingAdd.processEvent({
    event: AavegotchiH1Diamond.ERC721ListingAdd.createMockEvent({
      listingId: 2n, seller: SELLER, erc721TokenAddress: DIAMOND, erc721TokenId: 26002n,
      category: 0n, time: 3_000_000n, mockEventData: data(3),
    }),
    mockDb: db,
  });
  db = await AavegotchiH1Diamond.ERC721ExecutedListing.processEvent({
    event: AavegotchiH1Diamond.ERC721ExecutedListing.createMockEvent({
      listingId: 2n, seller: SELLER, buyer: BUYER, erc721TokenAddress: DIAMOND, erc721TokenId: 26002n,
      category: 0n, priceInWei: 3_000_000n, time: 1_761_500_200n, mockEventData: data(4),
    }),
    mockDb: db,
  });
  db = await AavegotchiH1Diamond.ERC721ExecutedToRecipient.processEvent({
    event: AavegotchiH1Diamond.ERC721ExecutedToRecipient.createMockEvent({
      listingId: 2n, buyer: BUYER, recipient: SELLER, mockEventData: data(5),
    }),
    mockDb: db,
  });
  const l2 = db.entities.ERC721Listing.get("43113-2");
  assert.equal(l2?.status, "sold");
  assert.equal(l2?.buyer, BUYER.toLowerCase());
  assert.equal(l2?.recipient, SELLER.toLowerCase());

  const kinds = db.entities.MarketActivity.getAll().map((a) => a.kind).sort();
  assert.deepEqual(kinds, ["listing_add", "listing_add", "listing_cancel", "listing_sale"]);
});

test("buy order add -> execute, transfer updates owner", async () => {
  let db = MockDb.createMockDb();
  db = await AavegotchiH1Diamond.ERC721BuyOrderAdded.processEvent({
    event: AavegotchiH1Diamond.ERC721BuyOrderAdded.createMockEvent({
      buyOrderId: 1n, buyer: BUYER, erc721TokenAddress: DIAMOND, erc721TokenId: 26002n, category: 0n,
      priceInWei: 1_500_000n, duration: 0n,
      validationHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      time: 1_761_500_000n, mockEventData: data(1),
    }),
    mockDb: db,
  });
  assert.equal(db.entities.ERC721BuyOrder.get("43113-1")?.status, "active");
  db = await AavegotchiH1Diamond.ERC721BuyOrderExecuted.processEvent({
    event: AavegotchiH1Diamond.ERC721BuyOrderExecuted.createMockEvent({
      buyOrderId: 1n, buyer: BUYER, seller: SELLER, erc721TokenAddress: DIAMOND, erc721TokenId: 26002n,
      priceInWei: 1_500_000n, time: 1_761_500_300n, mockEventData: data(2),
    }),
    mockDb: db,
  });
  const o = db.entities.ERC721BuyOrder.get("43113-1");
  assert.equal(o?.status, "executed");
  assert.equal(o?.seller, SELLER.toLowerCase());

  db = await AavegotchiH1Diamond.Transfer.processEvent({
    event: AavegotchiH1Diamond.Transfer.createMockEvent({
      _from: SELLER, _to: BUYER, _tokenId: 26002n, mockEventData: data(3),
    }),
    mockDb: db,
  });
  assert.equal(db.entities.H1Token.get("43113-26002")?.owner, BUYER.toLowerCase());
});

test("buy order cancel marks cancelled", async () => {
  let db = MockDb.createMockDb();
  db = await AavegotchiH1Diamond.ERC721BuyOrderAdded.processEvent({
    event: AavegotchiH1Diamond.ERC721BuyOrderAdded.createMockEvent({
      buyOrderId: 5n, buyer: BUYER, erc721TokenAddress: DIAMOND, erc721TokenId: 26001n, category: 3n,
      priceInWei: 1_000_000n, duration: 86_400n,
      validationHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      time: 1_761_500_000n, mockEventData: data(1),
    }),
    mockDb: db,
  });
  db = await AavegotchiH1Diamond.ERC721BuyOrderCanceled.processEvent({
    event: AavegotchiH1Diamond.ERC721BuyOrderCanceled.createMockEvent({
      buyOrderId: 5n, time: 1_761_500_050n, mockEventData: data(2),
    }),
    mockDb: db,
  });
  assert.equal(db.entities.ERC721BuyOrder.get("43113-5")?.status, "cancelled");
});
