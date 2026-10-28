import { AavegotchiH1Diamond } from "generated";
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
} from "./market";

type AnyEvent = {
  chainId: number;
  logIndex: number;
  block: { number: number | bigint; timestamp: number | bigint };
  transaction: { hash: string };
};

const meta = (e: AnyEvent): LogMeta => ({
  chainId: e.chainId,
  blockNumber: BigInt(e.block.number),
  timestamp: BigInt(e.block.timestamp),
  txHash: e.transaction.hash,
  logIndex: e.logIndex,
});

// ------------------------------------------------------------- listings

AavegotchiH1Diamond.ERC721ListingAdd.handler(async ({ event, context }) => {
  const r = onListingAdd(meta(event), event.params);
  context.ERC721Listing.set(r.listing);
  context.MarketActivity.set(r.activity);
});

AavegotchiH1Diamond.ERC721ExecutedListing.handler(async ({ event, context }) => {
  const prev = await context.ERC721Listing.get(entityId(event.chainId, event.params.listingId));
  const r = onListingExecuted(meta(event), prev, event.params);
  context.ERC721Listing.set(r.listing);
  context.MarketActivity.set(r.activity);
});

AavegotchiH1Diamond.ERC721ExecutedToRecipient.handler(async ({ event, context }) => {
  const prev = await context.ERC721Listing.get(entityId(event.chainId, event.params.listingId));
  const next = onListingRecipient(prev, event.params);
  if (next) context.ERC721Listing.set(next);
});

AavegotchiH1Diamond.ERC721ListingCancelled.handler(async ({ event, context }) => {
  const prev = await context.ERC721Listing.get(entityId(event.chainId, event.params.listingId));
  const r = onListingClosed(meta(event), prev, event.params, "listing_cancel");
  if (r.listing) context.ERC721Listing.set(r.listing);
  context.MarketActivity.set(r.activity);
});

AavegotchiH1Diamond.ERC721ListingRemoved.handler(async ({ event, context }) => {
  const prev = await context.ERC721Listing.get(entityId(event.chainId, event.params.listingId));
  const r = onListingClosed(meta(event), prev, event.params, "listing_removed");
  if (r.listing) context.ERC721Listing.set(r.listing);
  context.MarketActivity.set(r.activity);
});

AavegotchiH1Diamond.ERC721ListingPriceUpdate.handler(async ({ event, context }) => {
  const prev = await context.ERC721Listing.get(entityId(event.chainId, event.params.listingId));
  const r = onListingPriceUpdate(meta(event), prev, event.params);
  if (r.listing) context.ERC721Listing.set(r.listing);
  context.MarketActivity.set(r.activity);
});

// ----------------------------------------------------------- buy orders

AavegotchiH1Diamond.ERC721BuyOrderAdded.handler(async ({ event, context }) => {
  const r = onBuyOrderAdded(meta(event), event.params);
  context.ERC721BuyOrder.set(r.order);
  context.MarketActivity.set(r.activity);
});

AavegotchiH1Diamond.ERC721BuyOrderExecuted.handler(async ({ event, context }) => {
  const prev = await context.ERC721BuyOrder.get(entityId(event.chainId, event.params.buyOrderId));
  const r = onBuyOrderExecuted(meta(event), prev, event.params);
  context.ERC721BuyOrder.set(r.order);
  context.MarketActivity.set(r.activity);
});

AavegotchiH1Diamond.ERC721BuyOrderCanceled.handler(async ({ event, context }) => {
  const prev = await context.ERC721BuyOrder.get(entityId(event.chainId, event.params.buyOrderId));
  const r = onBuyOrderCanceled(meta(event), prev, event.params);
  if (r.order) context.ERC721BuyOrder.set(r.order);
  context.MarketActivity.set(r.activity);
});

// ------------------------------------------------------------ transfers

AavegotchiH1Diamond.Transfer.handler(async ({ event, context }) => {
  const prev = await context.H1Token.get(entityId(event.chainId, event.params._tokenId));
  const r = onTransfer(meta(event), prev, {
    from: event.params._from,
    to: event.params._to,
    tokenId: event.params._tokenId,
  });
  context.H1Token.set(r.token);
  context.MarketActivity.set(r.activity);
});
