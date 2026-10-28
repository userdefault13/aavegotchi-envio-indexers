/**
 * Pure state transitions for the H1 Baazaar indexer. No `generated` imports so
 * this module is unit-testable without Envio codegen; EventHandlers.ts wires it
 * to the Envio context.
 *
 * Contract quirks (aavegotchi-avax feat/avax-h1):
 * - ERC721ListingAdd: the last field is named `time` but is emitted with `_priceInWei`
 *   (ERC721MarketplaceFacet.sol:257).
 * - ERC721ListingCancelled: `time` is emitted with `block.number`, not a timestamp
 *   (LibERC721Marketplace.sol:61, ERC721MarketplaceFacet.sol:188). Use the log's block time.
 * - ERC721ListingPriceUpdate: the event fires but the stored price is NOT changed
 *   (the write is commented out in LibERC721Marketplace.updateERC721ListingPrice), and
 *   execution requires the stored price. So it's logged as activity only.
 */

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type ListingStatus = "active" | "sold" | "cancelled" | "removed";
export type BuyOrderStatus = "active" | "executed" | "cancelled";
export type ActivityKind =
  | "listing_add"
  | "listing_sale"
  | "listing_cancel"
  | "listing_removed"
  | "listing_price"
  | "offer_add"
  | "offer_accept"
  | "offer_cancel"
  | "transfer";

export interface Listing {
  readonly id: string;
  readonly chainId: number;
  readonly listingId: bigint;
  readonly category: bigint;
  readonly erc721TokenAddress: string;
  readonly tokenId: bigint;
  readonly seller: string;
  readonly buyer: string | undefined;
  readonly recipient: string | undefined;
  readonly priceInWei: bigint;
  readonly status: string;
  readonly timeCreated: bigint;
  readonly timeUpdated: bigint;
  readonly timePurchased: bigint | undefined;
  readonly timeCancelled: bigint | undefined;
  readonly blockCreated: bigint;
  readonly txCreated: string;
}

export interface BuyOrder {
  readonly id: string;
  readonly chainId: number;
  readonly buyOrderId: bigint;
  readonly buyer: string;
  readonly seller: string | undefined;
  readonly erc721TokenAddress: string;
  readonly tokenId: bigint;
  readonly category: bigint | undefined;
  readonly priceInWei: bigint;
  readonly duration: bigint;
  readonly validationHash: string;
  readonly status: string;
  readonly timeCreated: bigint;
  readonly timePurchased: bigint | undefined;
  readonly timeCancelled: bigint | undefined;
  readonly blockCreated: bigint;
  readonly txCreated: string;
}

export interface Activity {
  readonly id: string;
  readonly chainId: number;
  readonly kind: string;
  readonly listingId: bigint | undefined;
  readonly buyOrderId: bigint | undefined;
  readonly erc721TokenAddress: string | undefined;
  readonly tokenId: bigint | undefined;
  readonly category: bigint | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly priceInWei: bigint | undefined;
  readonly timestamp: bigint;
  readonly blockNumber: bigint;
  readonly txHash: string;
  readonly logIndex: number;
}

export interface H1Token {
  readonly id: string;
  readonly chainId: number;
  readonly tokenId: bigint;
  readonly owner: string;
  readonly transfers: number;
  readonly mintedAt: bigint | undefined;
  readonly lastTransferAt: bigint;
}

/** Normalized log metadata (Envio event -> plain values). */
export interface LogMeta {
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly timestamp: bigint;
  readonly txHash: string;
  readonly logIndex: number;
}

export const entityId = (chainId: number, onchainId: bigint): string =>
  `${chainId}-${onchainId.toString()}`;

export const activityId = (m: LogMeta): string =>
  `${m.chainId}-${m.blockNumber.toString()}-${m.logIndex}`;

const lc = (a: string): string => a.toLowerCase();

function activity(
  m: LogMeta,
  kind: ActivityKind,
  fields: Partial<Omit<Activity, "id" | "chainId" | "kind" | "timestamp" | "blockNumber" | "txHash" | "logIndex">>,
): Activity {
  return {
    id: activityId(m),
    chainId: m.chainId,
    kind,
    listingId: fields.listingId,
    buyOrderId: fields.buyOrderId,
    erc721TokenAddress: fields.erc721TokenAddress,
    tokenId: fields.tokenId,
    category: fields.category,
    from: fields.from,
    to: fields.to,
    priceInWei: fields.priceInWei,
    timestamp: m.timestamp,
    blockNumber: m.blockNumber,
    txHash: m.txHash,
    logIndex: m.logIndex,
  };
}

// ---------------------------------------------------------------- listings

export function onListingAdd(
  m: LogMeta,
  p: {
    listingId: bigint;
    seller: string;
    erc721TokenAddress: string;
    erc721TokenId: bigint;
    category: bigint;
    /** event field `time`, which actually holds the listing price */
    time: bigint;
  },
): { listing: Listing; activity: Activity } {
  const listing: Listing = {
    id: entityId(m.chainId, p.listingId),
    chainId: m.chainId,
    listingId: p.listingId,
    category: p.category,
    erc721TokenAddress: lc(p.erc721TokenAddress),
    tokenId: p.erc721TokenId,
    seller: lc(p.seller),
    buyer: undefined,
    recipient: undefined,
    priceInWei: p.time,
    status: "active",
    timeCreated: m.timestamp,
    timeUpdated: m.timestamp,
    timePurchased: undefined,
    timeCancelled: undefined,
    blockCreated: m.blockNumber,
    txCreated: m.txHash,
  };
  return {
    listing,
    activity: activity(m, "listing_add", {
      listingId: p.listingId,
      erc721TokenAddress: listing.erc721TokenAddress,
      tokenId: p.erc721TokenId,
      category: p.category,
      from: listing.seller,
      priceInWei: listing.priceInWei,
    }),
  };
}

export function onListingExecuted(
  m: LogMeta,
  prev: Listing | undefined,
  p: {
    listingId: bigint;
    seller: string;
    buyer: string;
    erc721TokenAddress: string;
    erc721TokenId: bigint;
    category: bigint;
    priceInWei: bigint;
    time: bigint;
  },
): { listing: Listing; activity: Activity } {
  const base: Listing = prev ?? {
    id: entityId(m.chainId, p.listingId),
    chainId: m.chainId,
    listingId: p.listingId,
    category: p.category,
    erc721TokenAddress: lc(p.erc721TokenAddress),
    tokenId: p.erc721TokenId,
    seller: lc(p.seller),
    buyer: undefined,
    recipient: undefined,
    priceInWei: p.priceInWei,
    status: "active",
    timeCreated: m.timestamp,
    timeUpdated: m.timestamp,
    timePurchased: undefined,
    timeCancelled: undefined,
    blockCreated: m.blockNumber,
    txCreated: m.txHash,
  };
  const listing: Listing = {
    ...base,
    buyer: lc(p.buyer),
    recipient: base.recipient ?? lc(p.buyer),
    priceInWei: p.priceInWei,
    status: "sold",
    timePurchased: p.time,
    timeUpdated: m.timestamp,
  };
  return {
    listing,
    activity: activity(m, "listing_sale", {
      listingId: p.listingId,
      erc721TokenAddress: listing.erc721TokenAddress,
      tokenId: p.erc721TokenId,
      category: p.category,
      from: lc(p.seller),
      to: lc(p.buyer),
      priceInWei: p.priceInWei,
    }),
  };
}

/** ERC721ExecutedToRecipient follows ERC721ExecutedListing in the same tx. */
export function onListingRecipient(
  prev: Listing | undefined,
  p: { recipient: string },
): Listing | undefined {
  if (!prev) return undefined;
  return { ...prev, recipient: lc(p.recipient) };
}

export function onListingClosed(
  m: LogMeta,
  prev: Listing | undefined,
  p: { listingId: bigint; category: bigint; time: bigint },
  kind: "listing_cancel" | "listing_removed",
): { listing: Listing | undefined; activity: Activity } {
  const status: ListingStatus = kind === "listing_cancel" ? "cancelled" : "removed";
  // Only an active listing transitions; never downgrade a sold one.
  const listing =
    prev && prev.status === "active"
      ? { ...prev, status, timeCancelled: m.timestamp, timeUpdated: m.timestamp }
      : undefined;
  return {
    listing,
    activity: activity(m, kind, {
      listingId: p.listingId,
      erc721TokenAddress: prev?.erc721TokenAddress,
      tokenId: prev?.tokenId,
      category: p.category,
      from: prev?.seller,
      priceInWei: prev?.priceInWei,
    }),
  };
}

/** Activity only: the contract emits this event without changing the stored price. */
export function onListingPriceUpdate(
  m: LogMeta,
  prev: Listing | undefined,
  p: { listingId: bigint; priceInWei: bigint; time: bigint },
): { listing: Listing | undefined; activity: Activity } {
  return {
    listing: undefined,
    activity: activity(m, "listing_price", {
      listingId: p.listingId,
      erc721TokenAddress: prev?.erc721TokenAddress,
      tokenId: prev?.tokenId,
      category: prev?.category,
      from: prev?.seller,
      priceInWei: p.priceInWei,
    }),
  };
}

// -------------------------------------------------------------- buy orders

export function onBuyOrderAdded(
  m: LogMeta,
  p: {
    buyOrderId: bigint;
    buyer: string;
    erc721TokenAddress: string;
    erc721TokenId: bigint;
    category: bigint;
    priceInWei: bigint;
    duration: bigint;
    validationHash: string;
    time: bigint;
  },
): { order: BuyOrder; activity: Activity } {
  const order: BuyOrder = {
    id: entityId(m.chainId, p.buyOrderId),
    chainId: m.chainId,
    buyOrderId: p.buyOrderId,
    buyer: lc(p.buyer),
    seller: undefined,
    erc721TokenAddress: lc(p.erc721TokenAddress),
    tokenId: p.erc721TokenId,
    category: p.category,
    priceInWei: p.priceInWei,
    duration: p.duration,
    validationHash: p.validationHash,
    status: "active",
    timeCreated: p.time,
    timePurchased: undefined,
    timeCancelled: undefined,
    blockCreated: m.blockNumber,
    txCreated: m.txHash,
  };
  return {
    order,
    activity: activity(m, "offer_add", {
      buyOrderId: p.buyOrderId,
      erc721TokenAddress: order.erc721TokenAddress,
      tokenId: p.erc721TokenId,
      category: p.category,
      to: order.buyer,
      priceInWei: p.priceInWei,
    }),
  };
}

export function onBuyOrderExecuted(
  m: LogMeta,
  prev: BuyOrder | undefined,
  p: {
    buyOrderId: bigint;
    buyer: string;
    seller: string;
    erc721TokenAddress: string;
    erc721TokenId: bigint;
    priceInWei: bigint;
    time: bigint;
  },
): { order: BuyOrder; activity: Activity } {
  const base: BuyOrder = prev ?? {
    id: entityId(m.chainId, p.buyOrderId),
    chainId: m.chainId,
    buyOrderId: p.buyOrderId,
    buyer: lc(p.buyer),
    seller: undefined,
    erc721TokenAddress: lc(p.erc721TokenAddress),
    tokenId: p.erc721TokenId,
    category: undefined,
    priceInWei: p.priceInWei,
    duration: 0n,
    validationHash: "",
    status: "active",
    timeCreated: p.time,
    timePurchased: undefined,
    timeCancelled: undefined,
    blockCreated: m.blockNumber,
    txCreated: m.txHash,
  };
  const order: BuyOrder = {
    ...base,
    seller: lc(p.seller),
    status: "executed",
    timePurchased: p.time,
  };
  return {
    order,
    activity: activity(m, "offer_accept", {
      buyOrderId: p.buyOrderId,
      erc721TokenAddress: order.erc721TokenAddress,
      tokenId: p.erc721TokenId,
      category: order.category,
      from: order.seller,
      to: order.buyer,
      priceInWei: p.priceInWei,
    }),
  };
}

export function onBuyOrderCanceled(
  m: LogMeta,
  prev: BuyOrder | undefined,
  p: { buyOrderId: bigint; time: bigint },
): { order: BuyOrder | undefined; activity: Activity } {
  const order =
    prev && prev.status === "active"
      ? { ...prev, status: "cancelled" as const, timeCancelled: p.time }
      : undefined;
  return {
    order,
    activity: activity(m, "offer_cancel", {
      buyOrderId: p.buyOrderId,
      erc721TokenAddress: prev?.erc721TokenAddress,
      tokenId: prev?.tokenId,
      category: prev?.category,
      to: prev?.buyer,
      priceInWei: prev?.priceInWei,
    }),
  };
}

// ---------------------------------------------------------------- transfers

export function onTransfer(
  m: LogMeta,
  prev: H1Token | undefined,
  p: { from: string; to: string; tokenId: bigint },
): { token: H1Token; activity: Activity } {
  const from = lc(p.from);
  const isMint = from === ZERO_ADDRESS;
  const token: H1Token = {
    id: entityId(m.chainId, p.tokenId),
    chainId: m.chainId,
    tokenId: p.tokenId,
    owner: lc(p.to),
    transfers: (prev?.transfers ?? 0) + (isMint ? 0 : 1),
    mintedAt: prev?.mintedAt ?? (isMint ? m.timestamp : undefined),
    lastTransferAt: m.timestamp,
  };
  return {
    token,
    activity: activity(m, "transfer", {
      tokenId: p.tokenId,
      from,
      to: token.owner,
    }),
  };
}
