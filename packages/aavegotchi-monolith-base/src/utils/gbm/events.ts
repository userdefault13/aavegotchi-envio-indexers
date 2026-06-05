import type { HandlerContext } from "generated";
import { getOrCreateGbmUser } from "./helpers";

export type GbmContext = HandlerContext;

type GbmTransactionEntity = NonNullable<
  Awaited<ReturnType<GbmContext["GbmTransaction"]["get"]>>
>;

export type GbmLogEvent = {
  block: { number: number | bigint; timestamp: number | bigint };
  transaction: { hash: string; from?: string | null };
  logIndex: number;
};

export function gbmLogEventId(event: GbmLogEvent): string {
  return `${event.block.number}-${event.logIndex}`;
}

function txId(txHash: string): string {
  return txHash.toLowerCase();
}

export async function getOrCreateGbmTransaction(
  context: GbmContext,
  event: GbmLogEvent,
): Promise<GbmTransactionEntity> {
  const id = txId(event.transaction.hash);
  const existing = await context.GbmTransaction.get(id);
  if (existing) return existing;

  const entity: GbmTransactionEntity = {
    id,
    timestamp: BigInt(event.block.timestamp),
    blockNumber: BigInt(event.block.number),
    txHash: id,
  };
  context.GbmTransaction.set(entity);
  return entity;
}

async function baseEventFields(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
): Promise<{
  id: string;
  emitter_id: string;
  transaction_id: string;
  timestamp: bigint;
}> {
  const emitter = await getOrCreateGbmUser(context, emitterAddress);
  const transaction = await getOrCreateGbmTransaction(context, event);
  return {
    id: gbmLogEventId(event),
    emitter_id: emitter.id,
    transaction_id: transaction.id,
    timestamp: BigInt(event.block.timestamp),
  };
}

export async function recordAuctionBidPlaced(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  bidder: string,
  bidAmount: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_BidPlaced.set({
    ...base,
    auctionId,
    bidder: bidder.toLowerCase(),
    bidAmount,
  });
}

export async function recordAuctionBidRemoved(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  bidder: string,
  bidAmount: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_BidRemoved.set({
    ...base,
    auctionId,
    bidder: bidder.toLowerCase(),
    bidAmount,
  });
}

export async function recordAuctionEndTimeUpdated(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  endTime: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_EndTimeUpdated.set({
    ...base,
    auctionId,
    endTime,
  });
}

export async function recordAuctionIncentivePaid(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  earner: string,
  incentiveAmount: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_IncentivePaid.set({
    ...base,
    auctionId,
    earner: earner.toLowerCase(),
    incentiveAmount,
  });
}

export async function recordAuctionInitialized(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  params: {
    auctionId: bigint;
    tokenID: bigint;
    tokenAmount: bigint;
    contractAddress: string;
    tokenKind: string;
    presetID: bigint;
  },
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_Initialized.set({
    ...base,
    auctionId: params.auctionId,
    tokenID: params.tokenID,
    tokenAmount: params.tokenAmount,
    contractAddress: params.contractAddress.toLowerCase(),
    tokenKind: params.tokenKind,
    presetID: params.presetID,
  });
}

export async function recordAuctionStartTimeUpdated(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  startTime: bigint,
  endTime: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_StartTimeUpdated.set({
    ...base,
    auctionId,
    startTime,
    endTime,
  });
}

export async function recordAuctionItemClaimed(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_ItemClaimed.set({
    ...base,
    auctionId,
  });
}

export async function recordAuctionBuyItNowUpdated(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  buyNowPrice: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_BuyItNowUpdated.set({
    ...base,
    auctionId,
    buyNowPrice,
  });
}

export async function recordAuctionStartingPriceUpdated(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  startBidPrice: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_StartingPriceUpdated.set({
    ...base,
    auctionId,
    startBidPrice,
  });
}

export async function recordAuctionBoughtNow(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Auction_BoughtNow.set({
    ...base,
    auctionId,
  });
}

export async function recordAuctionCancelled(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  auctionId: bigint,
  tokenId: bigint,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.AuctionCancelled.set({
    ...base,
    auctionId,
    tokenId,
  });
}

export async function recordContractBiddingAllowed(
  context: GbmContext,
  event: GbmLogEvent,
  emitterAddress: string,
  contract: string,
  biddingAllowed: boolean,
): Promise<void> {
  const base = await baseEventFields(context, event, emitterAddress);
  context.Contract_BiddingAllowed.set({
    ...base,
    contract: contract.toLowerCase(),
    biddingAllowed,
  });
}
