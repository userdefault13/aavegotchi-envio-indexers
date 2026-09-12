import type { HandlerContext } from "generated";
import { BIGINT_ONE, BIGINT_ZERO, ZERO_ADDRESS } from "../constants";
import {
  BIGINT_CANCELLATION_PERIOD_IN_SECONDS,
  BIGINT_STARTING_BID_FEE_PERCENT,
  ERC1155_TOKEN_KIND_HEX,
  GBM_STATISTIC_GLOBAL_ID,
} from "./constants";
import { fetchAuctionInfo } from "./contractEffects";

export type GbmContext = HandlerContext;

type AuctionEntity = NonNullable<Awaited<ReturnType<GbmContext["Auction"]["get"]>>>;
type BidEntity = NonNullable<Awaited<ReturnType<GbmContext["Bid"]["get"]>>>;
type GbmUserEntity = NonNullable<Awaited<ReturnType<GbmContext["GbmUser"]["get"]>>>;
type GbmStatisticEntity = NonNullable<
  Awaited<ReturnType<GbmContext["GbmStatistic"]["get"]>>
>;
type IncentiveEntity = NonNullable<Awaited<ReturnType<GbmContext["Incentive"]["get"]>>>;

export type BlockRef = { number: bigint; timestamp: bigint };

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

export function auctionIdStr(auctionId: bigint): string {
  return auctionId.toString();
}

export function tokenKindToAuctionType(tokenKind: string): "erc1155" | "erc721" {
  const hex = tokenKind.toLowerCase().replace(/^0x/, "");
  return hex.includes(ERC1155_TOKEN_KIND_HEX) ? "erc1155" : "erc721";
}

export function defaultGbmUser(id: string): GbmUserEntity {
  return {
    id: normalizeAddress(id),
    bids: BIGINT_ZERO,
    bidAmount: BIGINT_ZERO,
    outbids: BIGINT_ZERO,
    payouts: BIGINT_ZERO,
    payoutAmount: BIGINT_ZERO,
    wins: BIGINT_ZERO,
    totalAuctionsCreated: BIGINT_ZERO,
  };
}

export async function getOrCreateGbmUser(
  context: GbmContext,
  address: string,
): Promise<GbmUserEntity> {
  const id = normalizeAddress(address);
  const existing = await context.GbmUser.get(id);
  if (existing) return existing;
  const user = defaultGbmUser(id);
  context.GbmUser.set(user);
  return user;
}

export function defaultGlobalStatistic(): GbmStatisticEntity {
  return {
    id: GBM_STATISTIC_GLOBAL_ID,
    erc1155Auctions: BIGINT_ZERO,
    erc721Auctions: BIGINT_ZERO,
    totalBidsVolume: BIGINT_ZERO,
    totalSalesVolume: BIGINT_ZERO,
  };
}

export async function getOrCreateGlobalStatistic(
  context: GbmContext,
): Promise<GbmStatisticEntity> {
  const existing = await context.GbmStatistic.get(GBM_STATISTIC_GLOBAL_ID);
  if (existing) return existing;
  const stats = defaultGlobalStatistic();
  context.GbmStatistic.set(stats);
  return stats;
}

export async function getOrCreateContractStatistic(
  context: GbmContext,
  contractAddress: string,
): Promise<GbmStatisticEntity> {
  const id = normalizeAddress(contractAddress);
  const existing = await context.GbmStatistic.get(id);
  if (existing) return existing;
  const stats: GbmStatisticEntity = {
    id,
    erc1155Auctions: BIGINT_ZERO,
    erc721Auctions: BIGINT_ZERO,
    totalBidsVolume: BIGINT_ZERO,
    totalSalesVolume: BIGINT_ZERO,
  };
  context.GbmStatistic.set(stats);
  return stats;
}

function emptyAuction(id: string, contractAddress: string): AuctionEntity {
  return {
    id,
    orderId: BIGINT_ZERO,
    auctionType: "erc721",
    tokenId: BIGINT_ZERO,
    contractAddress: normalizeAddress(contractAddress),
    highestBid: BIGINT_ZERO,
    highestBidder: ZERO_ADDRESS,
    lastBidTime: BIGINT_ZERO,
    totalBids: BIGINT_ZERO,
    claimed: false,
    bidDecimals: BIGINT_ZERO,
    stepMin: BIGINT_ZERO,
    incMin: BIGINT_ZERO,
    incMax: BIGINT_ZERO,
    bidMultiplier: BIGINT_ZERO,
    seller: undefined,
    createdAt: undefined,
    startsAt: undefined,
    endsAt: undefined,
    endsAtOriginal: undefined,
    claimAt: undefined,
    quantity: undefined,
    presetId: undefined,
    cancelled: false,
    totalBidsVolume: BIGINT_ZERO,
    cancellationPeriodDuration: BIGINT_ZERO,
    cancellationTime: undefined,
    auctionDebt: BIGINT_ZERO,
    sellerProceeds: BIGINT_ZERO,
    platformFees: BIGINT_ZERO,
    gbmFees: BIGINT_ZERO,
    royaltyFees: BIGINT_ZERO,
    category: 0,
    buyNowPrice: BIGINT_ZERO,
    startBidPrice: BIGINT_ZERO,
    startBidFeePercent: BIGINT_STARTING_BID_FEE_PERCENT,
    isBought: false,
    hammerTimeDuration: undefined,
    dueIncentives: undefined,
  };
}

export async function applyAuctionInfoFromChain(
  auction: AuctionEntity,
  block: BlockRef,
): Promise<AuctionEntity> {
  const auctionId = BigInt(auction.id);
  const info = await fetchAuctionInfo(auctionId, block.number);
  if (!info) return auction;

  return {
    ...auction,
    category: info.category,
    auctionDebt: info.auctionDebt,
    claimed: info.claimed,
    bidDecimals: info.bidDecimals,
    bidMultiplier: info.bidMultiplier,
    incMax: info.incMax,
    incMin: info.incMin,
    stepMin: info.stepMin,
    seller: info.owner,
    createdAt: block.timestamp,
    dueIncentives: info.dueIncentives,
    startsAt: info.startTime,
    endsAt: info.endTime,
    endsAtOriginal: info.endTime,
    highestBidder: info.highestBidder,
    buyNowPrice: info.buyItNowPrice,
    startBidPrice: info.startingBid,
    auctionType: tokenKindToAuctionType(info.tokenKind),
    tokenId: info.tokenID,
    contractAddress: normalizeAddress(auction.contractAddress),
  };
}

export async function getOrCreateAuction(
  context: GbmContext,
  auctionId: bigint,
  contractAddress: string,
  block: BlockRef,
): Promise<AuctionEntity> {
  const id = auctionIdStr(auctionId);
  const existing = await context.Auction.get(id);
  const base =
    existing ?? emptyAuction(id, contractAddress);
  const updated = await applyAuctionInfoFromChain(base, block);
  context.Auction.set(updated);
  return updated;
}

export function calculateIncentives(
  auction: AuctionEntity,
  newBidValue: bigint,
): bigint {
  const bidDecimals = auction.bidDecimals;
  const bidIncMax = auction.incMax;

  // Empty/unknown auctions (RPC miss) default bidDecimals to 0 — skip incentives.
  if (bidDecimals === BIGINT_ZERO) {
    return BIGINT_ZERO;
  }

  let baseBid =
    (auction.highestBid * (bidDecimals + auction.stepMin)) / bidDecimals;
  if (baseBid === BIGINT_ZERO) {
    baseBid = BIGINT_ONE;
  }

  const ratioDenom = baseBid + auction.incMin * bidDecimals;
  if (ratioDenom === BIGINT_ZERO) {
    return BIGINT_ZERO;
  }

  let decimaledRatio =
    (bidDecimals *
      auction.bidMultiplier *
      (newBidValue - baseBid)) /
    ratioDenom;

  const maxRatio = bidDecimals * bidIncMax;
  if (decimaledRatio > maxRatio) {
    decimaledRatio = maxRatio;
  }

  return (newBidValue * decimaledRatio) / (bidDecimals * bidDecimals);
}

export function updateProceeds(auction: AuctionEntity): AuctionEntity {
  const proceeds = auction.highestBid;
  const zeroFivePct = proceeds / 200n;
  const gbmShare = zeroFivePct * 2n;
  const pixelcraftShare = zeroFivePct;
  const daoShare = zeroFivePct * 3n;
  const treasuryShare = zeroFivePct * 2n;

  return {
    ...auction,
    platformFees: pixelcraftShare + daoShare + treasuryShare,
    gbmFees: gbmShare,
    sellerProceeds:
      proceeds -
      auction.auctionDebt -
      (pixelcraftShare + daoShare + treasuryShare) -
      gbmShare -
      auction.royaltyFees,
  };
}

export function getOrCreateBid(
  bidder: string,
  bidAmount: bigint,
  auction: AuctionEntity,
  block: BlockRef,
): BidEntity {
  const bidId = `${auction.id}_${normalizeAddress(bidder)}_${bidAmount.toString()}`;
  const endsAt = auction.endsAt ?? BIGINT_ZERO;

  return {
    id: bidId,
    bidder: normalizeAddress(bidder),
    amount: bidAmount,
    auctionID: BigInt(auction.id),
    outbid: false,
    bidTime: block.timestamp,
    claimed: false,
    previousBid: auction.highestBid,
    previousBidder: auction.highestBidder,
    tokenId: auction.tokenId,
    contractAddress: auction.contractAddress,
    bidType: auction.auctionType,
    auctionTimeLeft: endsAt > block.timestamp ? endsAt - block.timestamp : BIGINT_ZERO,
    auctionOrderId: auction.orderId,
    auctionEndTime: endsAt,
    bidMultiplier: auction.bidMultiplier,
    auctionCreatedAt: auction.createdAt ?? block.timestamp,
    category: auction.category,
    presetId: auction.presetId,
  };
}

export function getOrCreateIncentive(
  auction: AuctionEntity,
  earner: string,
  amount: bigint,
  block: BlockRef,
): IncentiveEntity {
  const incentiveId = `${auction.id}_${normalizeAddress(earner)}_${amount.toString()}`;
  return {
    id: incentiveId,
    amount,
    earner: normalizeAddress(earner),
    auctionID: BigInt(auction.id),
    tokenId: auction.tokenId,
    contractAddress: auction.contractAddress,
    incentiveType: auction.auctionType,
    auctionOrderId: auction.orderId,
    receiveTime: block.timestamp,
    bidMultiplier: auction.bidMultiplier,
    auctionCreatedAt: auction.createdAt ?? block.timestamp,
    presetId: auction.presetId,
  };
}
