import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entityId,
  LogMeta,
  onBuyOrderAdded,
  onBuyOrderCanceled,
  onBuyOrderExecuted,
  onListingAdd,
  onListingClosed,
  onListingExecuted,
  onListingPriceUpdate,
  onListingRecipient,
  onTransfer,
  ZERO_ADDRESS,
} from "../src/market";

const DIAMOND = "0x86979152855A431befb2e2CFa78961d72e22Acb3";
const SELLER = "0xAAaaAaAAaaaaAAaaaAaaaaaaAAAAaaaAaAaaaaAa";
const BUYER = "0xBbBBbbBBbBbbbbBbbbbbBBBbbbbbbbBbBbbBbBBb";
const m = (logIndex = 0, ts = 1_000n, block = 60_035_100n): LogMeta => ({
  chainId: 43113,
  blockNumber: block,
  timestamp: ts,
  txHash: "0xtx",
  logIndex,
});

const add = () =>
  onListingAdd(m(1), {
    listingId: 1n,
    seller: SELLER,
    erc721TokenAddress: DIAMOND,
    erc721TokenId: 26002n,
    category: 0n,
    time: 2_500_000n, // contract emits price in the `time` field
  });

test("ids are chain-scoped", () => {
  assert.equal(entityId(43113, 7n), "43113-7");
  assert.notEqual(entityId(43113, 7n), entityId(43114, 7n));
});

test("ListingAdd reads price from the `time` field and lowercases addresses", () => {
  const { listing, activity } = add();
  assert.equal(listing.id, "43113-1");
  assert.equal(listing.priceInWei, 2_500_000n);
  assert.equal(listing.timeCreated, 1_000n);
  assert.equal(listing.status, "active");
  assert.equal(listing.seller, SELLER.toLowerCase());
  assert.equal(listing.erc721TokenAddress, DIAMOND.toLowerCase());
  assert.equal(activity.kind, "listing_add");
  assert.equal(activity.priceInWei, 2_500_000n);
  assert.equal(activity.id, "43113-60035100-1");
});

test("ExecutedListing marks sold, records buyer, then recipient overrides", () => {
  const { listing } = add();
  const sold = onListingExecuted(m(2, 2_000n), listing, {
    listingId: 1n,
    seller: SELLER,
    buyer: BUYER,
    erc721TokenAddress: DIAMOND,
    erc721TokenId: 26002n,
    category: 0n,
    priceInWei: 2_500_000n,
    time: 2_000n,
  });
  assert.equal(sold.listing.status, "sold");
  assert.equal(sold.listing.buyer, BUYER.toLowerCase());
  assert.equal(sold.listing.timePurchased, 2_000n);
  assert.equal(sold.activity.kind, "listing_sale");
  assert.equal(sold.activity.from, SELLER.toLowerCase());
  assert.equal(sold.activity.to, BUYER.toLowerCase());
  const withRecipient = onListingRecipient(sold.listing, { recipient: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" });
  assert.equal(withRecipient?.recipient, "0xcccccccccccccccccccccccccccccccccccccccc");
  assert.equal(onListingRecipient(undefined, { recipient: BUYER }), undefined);
});

test("ExecutedListing without a prior entity still produces a sold listing", () => {
  const r = onListingExecuted(m(), undefined, {
    listingId: 9n, seller: SELLER, buyer: BUYER, erc721TokenAddress: DIAMOND,
    erc721TokenId: 26001n, category: 3n, priceInWei: 1_000_000n, time: 5n,
  });
  assert.equal(r.listing.id, "43113-9");
  assert.equal(r.listing.status, "sold");
});

test("cancel and remove only transition active listings", () => {
  const { listing } = add();
  const c = onListingClosed(m(3, 3_000n), listing, { listingId: 1n, category: 0n, time: 3_000n }, "listing_cancel");
  assert.equal(c.listing?.status, "cancelled");
  assert.equal(c.listing?.timeCancelled, 3_000n);
  assert.equal(c.activity.kind, "listing_cancel");
  assert.equal(c.activity.tokenId, 26002n);

  const r = onListingClosed(m(4), listing, { listingId: 1n, category: 0n, time: 1n }, "listing_removed");
  assert.equal(r.listing?.status, "removed");

  const sold = { ...listing, status: "sold" };
  const noop = onListingClosed(m(5), sold, { listingId: 1n, category: 0n, time: 1n }, "listing_removed");
  assert.equal(noop.listing, undefined, "sold listing is never downgraded");
  assert.equal(noop.activity.kind, "listing_removed");

  const unknown = onListingClosed(m(6), undefined, { listingId: 99n, category: 2n, time: 1n }, "listing_cancel");
  assert.equal(unknown.listing, undefined);
  assert.equal(unknown.activity.listingId, 99n);
});

test("price update changes price and logs activity", () => {
  const { listing } = add();
  const u = onListingPriceUpdate(m(7, 4_000n), listing, { listingId: 1n, priceInWei: 3_000_000n, time: 4_000n });
  assert.equal(u.listing?.priceInWei, 3_000_000n);
  assert.equal(u.listing?.timeUpdated, 4_000n);
  assert.equal(u.activity.kind, "listing_price");
  assert.equal(onListingPriceUpdate(m(), undefined, { listingId: 2n, priceInWei: 1n, time: 1n }).listing, undefined);
});

test("buy order lifecycle: add -> execute; add -> cancel", () => {
  const added = onBuyOrderAdded(m(1), {
    buyOrderId: 1n, buyer: BUYER, erc721TokenAddress: DIAMOND, erc721TokenId: 26002n,
    category: 0n, priceInWei: 1_500_000n, duration: 0n, validationHash: "0xhash", time: 10n,
  });
  assert.equal(added.order.status, "active");
  assert.equal(added.order.id, "43113-1");
  assert.equal(added.activity.kind, "offer_add");
  assert.equal(added.activity.to, BUYER.toLowerCase());

  const ex = onBuyOrderExecuted(m(2), added.order, {
    buyOrderId: 1n, buyer: BUYER, seller: SELLER, erc721TokenAddress: DIAMOND,
    erc721TokenId: 26002n, priceInWei: 1_500_000n, time: 20n,
  });
  assert.equal(ex.order.status, "executed");
  assert.equal(ex.order.seller, SELLER.toLowerCase());
  assert.equal(ex.order.category, 0n, "category carried from the add event");
  assert.equal(ex.activity.kind, "offer_accept");

  const cx = onBuyOrderCanceled(m(3), added.order, { buyOrderId: 1n, time: 30n });
  assert.equal(cx.order?.status, "cancelled");
  assert.equal(cx.order?.timeCancelled, 30n);
  assert.equal(cx.activity.kind, "offer_cancel");
  assert.equal(onBuyOrderCanceled(m(4), ex.order, { buyOrderId: 1n, time: 40n }).order, undefined);
});

test("transfer tracks owner, mint time and transfer count", () => {
  const minted = onTransfer(m(0, 100n), undefined, { from: ZERO_ADDRESS, to: SELLER, tokenId: 26002n });
  assert.equal(minted.token.owner, SELLER.toLowerCase());
  assert.equal(minted.token.transfers, 0);
  assert.equal(minted.token.mintedAt, 100n);
  const moved = onTransfer(m(1, 200n), minted.token, { from: SELLER, to: BUYER, tokenId: 26002n });
  assert.equal(moved.token.owner, BUYER.toLowerCase());
  assert.equal(moved.token.transfers, 1);
  assert.equal(moved.token.mintedAt, 100n);
  assert.equal(moved.activity.kind, "transfer");
});
