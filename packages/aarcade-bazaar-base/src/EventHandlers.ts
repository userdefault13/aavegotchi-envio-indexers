import { AarcadeBazaarDiamond } from "generated";

const ZERO = "0x0000000000000000000000000000000000000000";
const BAZAAR_ID = "bazaar";

const lower = (a: string) => a.toLowerCase();
const orNull = (a: string) => (a === ZERO ? undefined : a.toLowerCase());

/** Unique per log: a transaction can settle several sales / bids. */
function logId(event: { transaction: { hash?: string }; block: { number: number }; logIndex: number }): string {
  return `${event.transaction.hash ?? event.block.number}-${event.logIndex}`;
}

const ts = (event: { block: { timestamp: number } }) => BigInt(event.block.timestamp);

// ------------------------------------------------------------------ admin

const BAZAAR_DEFAULTS = {
  id: BAZAAR_ID,
  treasury: ZERO,
  feeBps: 0,
  maxRoyaltyBps: 0,
  paused: false,
  // initBazaar's defaults; AuctionParamsUpdated only fires when the owner changes them.
  minAuctionDuration: 3600n,
  maxAuctionDuration: 2592000n,
  minIncrementBps: 500,
  extensionWindow: 600n,
  updatedAt: 0n,
};

AarcadeBazaarDiamond.BazaarInitialized.handler(async ({ event, context }) => {
  context.Bazaar.set({
    ...BAZAAR_DEFAULTS,
    treasury: lower(event.params.treasury),
    feeBps: Number(event.params.feeBps),
    maxRoyaltyBps: Number(event.params.maxRoyaltyBps),
    updatedAt: ts(event),
  });
});

AarcadeBazaarDiamond.FeeBpsUpdated.handler(async ({ event, context }) => {
  const b = (await context.Bazaar.get(BAZAAR_ID)) ?? BAZAAR_DEFAULTS;
  context.Bazaar.set({ ...b, feeBps: Number(event.params.feeBps), updatedAt: ts(event) });
});

AarcadeBazaarDiamond.MaxRoyaltyBpsUpdated.handler(async ({ event, context }) => {
  const b = (await context.Bazaar.get(BAZAAR_ID)) ?? BAZAAR_DEFAULTS;
  context.Bazaar.set({ ...b, maxRoyaltyBps: Number(event.params.maxRoyaltyBps), updatedAt: ts(event) });
});

AarcadeBazaarDiamond.TreasuryUpdated.handler(async ({ event, context }) => {
  const b = (await context.Bazaar.get(BAZAAR_ID)) ?? BAZAAR_DEFAULTS;
  context.Bazaar.set({ ...b, treasury: lower(event.params.treasury), updatedAt: ts(event) });
});

AarcadeBazaarDiamond.PausedSet.handler(async ({ event, context }) => {
  const b = (await context.Bazaar.get(BAZAAR_ID)) ?? BAZAAR_DEFAULTS;
  context.Bazaar.set({ ...b, paused: event.params.paused, updatedAt: ts(event) });
});

AarcadeBazaarDiamond.AuctionParamsUpdated.handler(async ({ event, context }) => {
  const b = (await context.Bazaar.get(BAZAAR_ID)) ?? BAZAAR_DEFAULTS;
  context.Bazaar.set({
    ...b,
    minAuctionDuration: event.params.minDuration,
    maxAuctionDuration: event.params.maxDuration,
    minIncrementBps: Number(event.params.minIncrementBps),
    extensionWindow: event.params.extensionWindow,
    updatedAt: ts(event),
  });
});

AarcadeBazaarDiamond.CollectionSet.handler(async ({ event, context }) => {
  const id = lower(event.params.token);
  const existing = await context.Collection.get(id);
  context.Collection.set({
    id,
    enabled: event.params.enabled,
    standard: Number(event.params.standard),
    tokenBound: event.params.tokenBound,
    category: Number(event.params.category),
    royaltyBps: existing?.royaltyBps ?? 0,
    royaltyReceiver: existing?.royaltyReceiver,
    updatedAt: ts(event),
  });
});

AarcadeBazaarDiamond.CollectionRoyaltySet.handler(async ({ event, context }) => {
  const id = lower(event.params.token);
  const existing = await context.Collection.get(id);
  if (!existing) return; // the diamond requires the collection to be registered first
  context.Collection.set({
    ...existing,
    royaltyBps: Number(event.params.royaltyBps),
    royaltyReceiver: orNull(event.params.receiver),
    updatedAt: ts(event),
  });
});

AarcadeBazaarDiamond.CurrencySet.handler(async ({ event, context }) => {
  context.Currency.set({
    id: lower(event.params.currency),
    enabled: event.params.enabled,
    minPrice: event.params.minPrice,
    updatedAt: ts(event),
  });
});

// ------------------------------------------------------------------ sales

AarcadeBazaarDiamond.SaleSettled.handler(async ({ event, context }) => {
  const currency = lower(event.params.currency);
  const { gross, fee, royalty } = event.params;
  context.Sale.set({
    id: logId(event),
    kind: Number(event.params.kind),
    refId: event.params.id,
    currency,
    seller: lower(event.params.seller),
    gross,
    fee,
    royaltyReceiver: orNull(event.params.royaltyReceiver),
    royalty,
    sellerProceeds: gross - fee - royalty,
    at: ts(event),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash ?? "",
  });
  const stat = (await context.CurrencyStat.get(currency)) ?? { id: currency, sales: 0, volume: 0n, fees: 0n, royalties: 0n };
  context.CurrencyStat.set({
    ...stat,
    sales: stat.sales + 1,
    volume: stat.volume + gross,
    fees: stat.fees + fee,
    royalties: stat.royalties + royalty,
  });
});

// ------------------------------------------------------- ERC-721 listings

AarcadeBazaarDiamond.ERC721ListingAdd.handler(async ({ event, context }) => {
  context.ERC721Listing.set({
    id: event.params.listingId.toString(),
    listingId: event.params.listingId,
    seller: lower(event.params.seller),
    erc721TokenAddress: lower(event.params.token),
    tokenId: event.params.tokenId,
    category: Number(event.params.category),
    currency: lower(event.params.currency),
    priceInWei: event.params.priceInWei,
    timeCreated: ts(event),
    blockCreated: BigInt(event.block.number),
    priceUpdatedAt: undefined,
    cancelled: false,
    timePurchased: undefined,
    buyer: undefined,
    recipient: undefined,
    active: true,
    txHash: event.transaction.hash ?? "",
  });
});

AarcadeBazaarDiamond.ERC721ListingPriceUpdate.handler(async ({ event, context }) => {
  const l = await context.ERC721Listing.get(event.params.listingId.toString());
  if (!l) return;
  context.ERC721Listing.set({ ...l, priceInWei: event.params.priceInWei, priceUpdatedAt: ts(event) });
});

// Also fired when a relist, an accepted offer or an auction escrow clears a live listing.
AarcadeBazaarDiamond.ERC721ListingCancelled.handler(async ({ event, context }) => {
  const l = await context.ERC721Listing.get(event.params.listingId.toString());
  if (!l) return;
  context.ERC721Listing.set({ ...l, cancelled: true, active: false });
});

AarcadeBazaarDiamond.ERC721ExecutedListing.handler(async ({ event, context }) => {
  const l = await context.ERC721Listing.get(event.params.listingId.toString());
  if (!l) return;
  context.ERC721Listing.set({
    ...l,
    timePurchased: ts(event),
    buyer: lower(event.params.buyer),
    recipient: lower(event.params.recipient),
    active: false,
  });
});

// ------------------------------------------------------ ERC-1155 listings

AarcadeBazaarDiamond.ERC1155ListingAdd.handler(async ({ event, context }) => {
  context.ERC1155Listing.set({
    id: event.params.listingId.toString(),
    listingId: event.params.listingId,
    seller: lower(event.params.seller),
    erc1155TokenAddress: lower(event.params.token),
    erc1155TypeId: event.params.typeId,
    category: Number(event.params.category),
    quantity: event.params.quantity,
    currency: lower(event.params.currency),
    priceInWei: event.params.priceInWei,
    timeCreated: ts(event),
    blockCreated: BigInt(event.block.number),
    timeLastPurchased: undefined,
    sold: false,
    cancelled: false,
    active: true,
    txHash: event.transaction.hash ?? "",
  });
});

// The seller edited the listing in place, or a prune shrank it to the seller's balance.
AarcadeBazaarDiamond.ERC1155ListingUpdated.handler(async ({ event, context }) => {
  const l = await context.ERC1155Listing.get(event.params.listingId.toString());
  if (!l) return;
  context.ERC1155Listing.set({
    ...l,
    quantity: event.params.quantity,
    currency: lower(event.params.currency),
    priceInWei: event.params.priceInWei,
  });
});

AarcadeBazaarDiamond.ERC1155ListingCancelled.handler(async ({ event, context }) => {
  const l = await context.ERC1155Listing.get(event.params.listingId.toString());
  if (!l) return;
  context.ERC1155Listing.set({ ...l, cancelled: true, active: false });
});

AarcadeBazaarDiamond.ERC1155ExecutedListing.handler(async ({ event, context }) => {
  const listingId = event.params.listingId.toString();
  context.ERC1155Purchase.set({
    id: logId(event),
    listing_id: listingId,
    seller: lower(event.params.seller),
    buyer: lower(event.params.buyer),
    recipient: lower(event.params.recipient),
    erc1155TokenAddress: lower(event.params.token),
    erc1155TypeId: event.params.typeId,
    quantity: event.params.quantity,
    currency: lower(event.params.currency),
    priceInWei: event.params.priceInWei,
    timePurchased: ts(event),
    txHash: event.transaction.hash ?? "",
  });
  const l = await context.ERC1155Listing.get(listingId);
  if (!l) return;
  const remaining = l.quantity > event.params.quantity ? l.quantity - event.params.quantity : 0n;
  context.ERC1155Listing.set({
    ...l,
    quantity: remaining,
    timeLastPurchased: ts(event),
    sold: remaining === 0n,
    active: remaining !== 0n,
  });
});

// -------------------------------------------------------------- buy orders

AarcadeBazaarDiamond.ERC721BuyOrderAdded.handler(async ({ event, context }) => {
  context.ERC721BuyOrder.set({
    id: event.params.orderId.toString(),
    orderId: event.params.orderId,
    buyer: lower(event.params.buyer),
    erc721TokenAddress: lower(event.params.token),
    tokenId: event.params.tokenId,
    currency: lower(event.params.currency),
    priceInWei: event.params.priceInWei,
    expiresAt: event.params.expiresAt,
    expectedAccountState: event.params.expectedAccountState,
    createdAt: ts(event),
    cancelled: false,
    executedAt: undefined,
    seller: undefined,
    active: true,
    txHash: event.transaction.hash ?? "",
  });
});

AarcadeBazaarDiamond.ERC721BuyOrderCancelled.handler(async ({ event, context }) => {
  const o = await context.ERC721BuyOrder.get(event.params.orderId.toString());
  if (!o) return;
  context.ERC721BuyOrder.set({ ...o, cancelled: true, active: false });
});

AarcadeBazaarDiamond.ERC721BuyOrderExecuted.handler(async ({ event, context }) => {
  const o = await context.ERC721BuyOrder.get(event.params.orderId.toString());
  if (!o) return;
  context.ERC721BuyOrder.set({ ...o, executedAt: ts(event), seller: lower(event.params.seller), active: false });
});

AarcadeBazaarDiamond.ERC1155BuyOrderAdded.handler(async ({ event, context }) => {
  context.ERC1155BuyOrder.set({
    id: event.params.orderId.toString(),
    orderId: event.params.orderId,
    buyer: lower(event.params.buyer),
    erc1155TokenAddress: lower(event.params.token),
    erc1155TypeId: event.params.typeId,
    quantity: event.params.quantity,
    quantityFilled: 0n,
    currency: lower(event.params.currency),
    priceInWei: event.params.priceInWei,
    expiresAt: event.params.expiresAt,
    createdAt: ts(event),
    lastExecutedAt: undefined,
    completed: false,
    cancelled: false,
    active: true,
    txHash: event.transaction.hash ?? "",
  });
});

AarcadeBazaarDiamond.ERC1155BuyOrderCancelled.handler(async ({ event, context }) => {
  const o = await context.ERC1155BuyOrder.get(event.params.orderId.toString());
  if (!o) return;
  context.ERC1155BuyOrder.set({ ...o, cancelled: true, active: false });
});

AarcadeBazaarDiamond.ERC1155BuyOrderExecuted.handler(async ({ event, context }) => {
  const orderId = event.params.orderId.toString();
  context.ERC1155BuyOrderExecution.set({
    id: logId(event),
    buyOrder_id: orderId,
    buyer: lower(event.params.buyer),
    seller: lower(event.params.seller),
    erc1155TokenAddress: lower(event.params.token),
    erc1155TypeId: event.params.typeId,
    quantity: event.params.quantity,
    currency: lower(event.params.currency),
    priceInWei: event.params.priceInWei,
    executedAt: ts(event),
    txHash: event.transaction.hash ?? "",
  });
  const o = await context.ERC1155BuyOrder.get(orderId);
  if (!o) return;
  const remaining = o.quantity > event.params.quantity ? o.quantity - event.params.quantity : 0n;
  context.ERC1155BuyOrder.set({
    ...o,
    quantity: remaining,
    quantityFilled: o.quantityFilled + event.params.quantity,
    lastExecutedAt: ts(event),
    completed: remaining === 0n,
    active: remaining !== 0n,
  });
});

// ---------------------------------------------------------------- auctions

AarcadeBazaarDiamond.AuctionCreated.handler(async ({ event, context }) => {
  const token = lower(event.params.token);
  const collection = await context.Collection.get(token);
  context.Auction.set({
    id: event.params.auctionId.toString(),
    auctionId: event.params.auctionId,
    seller: lower(event.params.seller),
    tokenAddress: token,
    tokenId: event.params.tokenId,
    quantity: event.params.quantity,
    standard: Number(event.params.standard),
    category: collection?.category ?? 0,
    currency: lower(event.params.currency),
    startPrice: event.params.startPrice,
    buyNowPrice: event.params.buyNowPrice,
    startTime: event.params.startTime,
    endTime: event.params.endTime,
    highestBidder: undefined,
    highestBid: 0n,
    highestBidId: undefined,
    bidCount: 0,
    boughtNow: false,
    settled: false,
    cancelled: false,
    winner: undefined,
    itemPendingTo: undefined,
    active: true,
    createdAt: ts(event),
    settledAt: undefined,
    txHash: event.transaction.hash ?? "",
  });
});

AarcadeBazaarDiamond.AuctionBid.handler(async ({ event, context }) => {
  const auctionId = event.params.auctionId.toString();
  const bidId = logId(event);
  context.Bid.set({
    id: bidId,
    auction_id: auctionId,
    bidder: lower(event.params.bidder),
    amount: event.params.amount,
    endTimeAfter: event.params.endTime,
    outbid: false,
    at: ts(event),
    txHash: event.transaction.hash ?? "",
  });
  const a = await context.Auction.get(auctionId);
  if (!a) return;
  if (a.highestBidId) {
    const previous = await context.Bid.get(a.highestBidId);
    if (previous) context.Bid.set({ ...previous, outbid: true });
  }
  context.Auction.set({
    ...a,
    highestBidder: lower(event.params.bidder),
    highestBid: event.params.amount,
    highestBidId: bidId,
    bidCount: a.bidCount + 1,
    endTime: event.params.endTime,
  });
});

// Followed in the same transaction by AuctionSettled, which closes the auction.
AarcadeBazaarDiamond.AuctionBoughtNow.handler(async ({ event, context }) => {
  const a = await context.Auction.get(event.params.auctionId.toString());
  if (!a) return;
  if (a.highestBidId) {
    const previous = await context.Bid.get(a.highestBidId);
    if (previous) context.Bid.set({ ...previous, outbid: true });
  }
  context.Auction.set({
    ...a,
    boughtNow: true,
    highestBidder: lower(event.params.buyer),
    highestBid: event.params.priceInWei,
    highestBidId: undefined,
    endTime: ts(event),
  });
});

AarcadeBazaarDiamond.AuctionCancelled.handler(async ({ event, context }) => {
  const a = await context.Auction.get(event.params.auctionId.toString());
  if (!a) return;
  context.Auction.set({ ...a, cancelled: true, active: false, settledAt: ts(event) });
});

AarcadeBazaarDiamond.AuctionSettled.handler(async ({ event, context }) => {
  const a = await context.Auction.get(event.params.auctionId.toString());
  if (!a) return;
  context.Auction.set({
    ...a,
    settled: true,
    active: false,
    winner: orNull(event.params.winner),
    settledAt: ts(event),
  });
});

AarcadeBazaarDiamond.AuctionItemPending.handler(async ({ event, context }) => {
  const a = await context.Auction.get(event.params.auctionId.toString());
  if (!a) return;
  context.Auction.set({ ...a, itemPendingTo: lower(event.params.to) });
});

AarcadeBazaarDiamond.AuctionItemWithdrawn.handler(async ({ event, context }) => {
  const a = await context.Auction.get(event.params.auctionId.toString());
  if (!a) return;
  context.Auction.set({ ...a, itemPendingTo: undefined });
});

// ----------------------------------------------------------------- credits

AarcadeBazaarDiamond.CreditAdded.handler(async ({ event, context }) => {
  const wallet = lower(event.params.user);
  const currency = lower(event.params.currency);
  const id = `${wallet}-${currency}`;
  const c = await context.PendingCredit.get(id);
  context.PendingCredit.set({ id, wallet, currency, amount: (c?.amount ?? 0n) + event.params.amount, updatedAt: ts(event) });
});

AarcadeBazaarDiamond.CreditWithdrawn.handler(async ({ event, context }) => {
  const wallet = lower(event.params.user);
  const currency = lower(event.params.currency);
  const id = `${wallet}-${currency}`;
  const c = await context.PendingCredit.get(id);
  const amount = c && c.amount > event.params.amount ? c.amount - event.params.amount : 0n;
  context.PendingCredit.set({ id, wallet, currency, amount, updatedAt: ts(event) });
});
