/**
 * GBM auction handlers — port of aavegotchi-baazaar-gbm-subgraph (Base).
 */
import { GbmContract } from "generated";
import { BIGINT_ONE, BIGINT_ZERO, ZERO_ADDRESS } from "../utils/constants";
import { GBM_CONTRACT_ADDRESS } from "../utils/gbm/constants";
import { fetchAuctionHammerTimeDuration } from "../utils/gbm/contractEffects";
import {
  applyAuctionInfoFromChain,
  getOrCreateAuction,
  getOrCreateBid,
  getOrCreateContractStatistic,
  getOrCreateGlobalStatistic,
  getOrCreateGbmUser,
  getOrCreateIncentive,
  calculateIncentives,
  tokenKindToAuctionType,
  updateProceeds,
  type BlockRef,
} from "../utils/gbm/helpers";
import {
  BIGINT_CANCELLATION_PERIOD_IN_SECONDS,
  BIGINT_STARTING_BID_FEE_PERCENT,
} from "../utils/gbm/constants";
import {
  recordAuctionBidPlaced,
  recordAuctionBidRemoved,
  recordAuctionBoughtNow,
  recordAuctionBuyItNowUpdated,
  recordAuctionCancelled,
  recordAuctionEndTimeUpdated,
  recordAuctionIncentivePaid,
  recordAuctionInitialized,
  recordAuctionItemClaimed,
  recordAuctionStartTimeUpdated,
  recordAuctionStartingPriceUpdated,
  recordContractBiddingAllowed,
  type GbmLogEvent,
} from "../utils/gbm/events";

function blockRef(event: {
  block: { number: number | bigint; timestamp: number | bigint };
}): BlockRef {
  return {
    number: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  };
}

function emitterAddress(event: {
  transaction: { from?: string | null };
}): string {
  return (event.transaction.from ?? ZERO_ADDRESS).toLowerCase();
}

function logEvent(event: {
  block: { number: number | bigint; timestamp: number | bigint };
  transaction: { hash: string; from?: string | null };
  logIndex: number;
}): GbmLogEvent {
  return {
    block: event.block,
    transaction: event.transaction,
    logIndex: event.logIndex,
  };
}

GbmContract.Auction_Initialized.handler(async ({ event, context }) => {
  await recordAuctionInitialized(
    context,
    logEvent(event),
    emitterAddress(event),
    {
      auctionId: event.params._auctionID,
      tokenID: event.params._tokenID,
      tokenAmount: event.params._tokenAmount,
      contractAddress: event.params._contractAddress,
      tokenKind: String(event.params._tokenKind),
      presetID: event.params._presetID,
    },
  );

  const block = blockRef(event);
  const auctionId = event.params._auctionID;

  const emitter = await getOrCreateGbmUser(context, emitterAddress(event));

  const stats = await getOrCreateGlobalStatistic(context);
  const auctionType = tokenKindToAuctionType(String(event.params._tokenKind));

  let orderId = 0n;
  if (auctionType === "erc1155") {
    orderId = stats.erc1155Auctions + 1n;
    context.GbmStatistic.set({
      ...stats,
      erc1155Auctions: stats.erc1155Auctions + 1n,
    });
  } else {
    orderId = stats.erc721Auctions + 1n;
    context.GbmStatistic.set({
      ...stats,
      erc721Auctions: stats.erc721Auctions + 1n,
    });
  }

  let auction = await getOrCreateAuction(
    context,
    auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );

  auction = {
    ...auction,
    orderId,
    auctionType,
    contractAddress: event.params._contractAddress.toLowerCase(),
    tokenId: event.params._tokenID,
    presetId: Number(event.params._presetID),
    totalBids: BIGINT_ZERO,
    claimed: false,
    lastBidTime: BIGINT_ZERO,
    highestBid: BIGINT_ZERO,
    highestBidder: ZERO_ADDRESS,
    cancelled: false,
    buyNowPrice: BIGINT_ZERO,
    startBidPrice: BIGINT_ZERO,
    startBidFeePercent: BIGINT_STARTING_BID_FEE_PERCENT,
    isBought: false,
    quantity: event.params._tokenAmount,
    cancellationPeriodDuration: BIGINT_CANCELLATION_PERIOD_IN_SECONDS,
  };

  auction = await applyAuctionInfoFromChain(auction, block);

  const hammerTime = await fetchAuctionHammerTimeDuration(block.number);
  if (hammerTime !== undefined) {
    auction = { ...auction, hammerTimeDuration: hammerTime };
  }

  auction = updateProceeds(auction);
  context.Auction.set(auction);

  const tokenContractId = event.params._contractAddress.toLowerCase();
  const contractEntity = await context.GbmContract.get(tokenContractId);
  if (!contractEntity) {
    context.GbmContract.set({
      id: tokenContractId,
      biddingAllowed: false,
    });
  }

  context.GbmUser.set({
    ...emitter,
    totalAuctionsCreated: emitter.totalAuctionsCreated + BIGINT_ONE,
  });
});

GbmContract.Auction_BidPlaced.handler(async ({ event, context }) => {
  await recordAuctionBidPlaced(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionID,
    event.params._bidder,
    event.params._bidAmount,
  );

  const block = blockRef(event);
  const auctionId = event.params._auctionID;
  const bidAmount = event.params._bidAmount;
  const bidder = event.params._bidder.toLowerCase();

  let auction = await getOrCreateAuction(
    context,
    auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );

  const bid = getOrCreateBid(bidder, bidAmount, auction, block);

  auction = {
    ...auction,
    totalBids: auction.totalBids + 1n,
    lastBidTime: block.timestamp,
    highestBid: bidAmount,
    highestBidder: bidder,
    totalBidsVolume: auction.totalBidsVolume + bidAmount,
    dueIncentives: calculateIncentives(auction, bidAmount),
  };
  auction = updateProceeds(auction);

  const bidderUser = await getOrCreateGbmUser(context, bidder);
  context.GbmUser.set({
    ...bidderUser,
    bids: bidderUser.bids + 1n,
    bidAmount: bidderUser.bidAmount + bidAmount,
  });

  const globalStats = await getOrCreateGlobalStatistic(context);
  context.GbmStatistic.set({
    ...globalStats,
    totalBidsVolume: globalStats.totalBidsVolume + bidAmount,
  });

  const contractStats = await getOrCreateContractStatistic(
    context,
    auction.contractAddress,
  );
  context.GbmStatistic.set({
    ...contractStats,
    totalBidsVolume: contractStats.totalBidsVolume + bidAmount,
  });

  context.Bid.set(bid);
  context.Auction.set(auction);
});

GbmContract.Auction_BidRemoved.handler(async ({ event, context }) => {
  await recordAuctionBidRemoved(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionID,
    event.params._bidder,
    event.params._bidAmount,
  );

  const block = blockRef(event);
  const auction = await getOrCreateAuction(
    context,
    event.params._auctionID,
    GBM_CONTRACT_ADDRESS,
    block,
  );

  const bid = getOrCreateBid(
    event.params._bidder.toLowerCase(),
    event.params._bidAmount,
    auction,
    block,
  );
  context.Bid.set({ ...bid, outbid: true });

  const user = await getOrCreateGbmUser(context, event.params._bidder);
  context.GbmUser.set({ ...user, outbids: user.outbids + 1n });
});

GbmContract.Auction_EndTimeUpdated.handler(async ({ event, context }) => {
  await recordAuctionEndTimeUpdated(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionID,
    event.params._endTime,
  );

  const block = blockRef(event);
  const auction = await getOrCreateAuction(
    context,
    event.params._auctionID,
    GBM_CONTRACT_ADDRESS,
    block,
  );
  context.Auction.set({
    ...auction,
    endsAt: event.params._endTime,
    cancellationPeriodDuration: BIGINT_CANCELLATION_PERIOD_IN_SECONDS,
  });
});

GbmContract.Auction_IncentivePaid.handler(async ({ event, context }) => {
  await recordAuctionIncentivePaid(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionID,
    event.params._earner,
    event.params._incentiveAmount,
  );

  const block = blockRef(event);
  const auctionId = event.params._auctionID;

  let auction = await getOrCreateAuction(
    context,
    auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );

  auction = {
    ...auction,
    auctionDebt: auction.auctionDebt + event.params._incentiveAmount,
  };
  context.Auction.set(auction);

  const incentive = getOrCreateIncentive(
    auction,
    event.params._earner.toLowerCase(),
    event.params._incentiveAmount,
    block,
  );
  context.Incentive.set(incentive);

  const user = await getOrCreateGbmUser(context, event.params._earner);
  context.GbmUser.set({
    ...user,
    payouts: user.payouts + 1n,
    payoutAmount: user.payoutAmount + event.params._incentiveAmount,
  });
});

GbmContract.Auction_StartTimeUpdated.handler(async ({ event, context }) => {
  await recordAuctionStartTimeUpdated(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionID,
    event.params._startTime,
    event.params._endTime,
  );

  const block = blockRef(event);
  const auction = await getOrCreateAuction(
    context,
    event.params._auctionID,
    GBM_CONTRACT_ADDRESS,
    block,
  );
  const endsAt = event.params._endTime;
  context.Auction.set({
    ...auction,
    startsAt: event.params._startTime,
    endsAt,
    endsAtOriginal: endsAt,
  });
});

GbmContract.Contract_BiddingAllowed.handler(async ({ event, context }) => {
  await recordContractBiddingAllowed(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._contract,
    event.params._biddingAllowed,
  );

  const id = event.params._contract.toLowerCase();
  context.GbmContract.set({
    id,
    biddingAllowed: event.params._biddingAllowed,
  });
});

GbmContract.Auction_ItemClaimed.handler(async ({ event, context }) => {
  await recordAuctionItemClaimed(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionID,
  );

  const block = blockRef(event);
  const auctionId = event.params._auctionID;

  let auction = await getOrCreateAuction(
    context,
    auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );

  auction = {
    ...auction,
    claimed: true,
    claimAt: block.timestamp,
  };

  const bid = getOrCreateBid(
    auction.highestBidder,
    auction.highestBid,
    auction,
    block,
  );
  context.Bid.set({ ...bid, claimed: true });

  const winner = await getOrCreateGbmUser(context, auction.highestBidder);
  context.GbmUser.set({ ...winner, wins: winner.wins + 1n });

  const globalStats = await getOrCreateGlobalStatistic(context);
  context.GbmStatistic.set({
    ...globalStats,
    totalSalesVolume: globalStats.totalSalesVolume + auction.highestBid,
  });

  const contractStats = await getOrCreateContractStatistic(
    context,
    auction.contractAddress,
  );
  context.GbmStatistic.set({
    ...contractStats,
    totalSalesVolume: contractStats.totalSalesVolume + auction.highestBid,
  });

  context.Auction.set(auction);
});

GbmContract.AuctionCancelled.handler(async ({ event, context }) => {
  await recordAuctionCancelled(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionId,
    event.params._tokenId,
  );

  const block = blockRef(event);
  const auction = await getOrCreateAuction(
    context,
    event.params._auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );
  context.Auction.set({
    ...auction,
    cancellationTime: block.timestamp,
    cancelled: true,
  });
});

GbmContract.Auction_BuyItNowUpdated.handler(async ({ event, context }) => {
  await recordAuctionBuyItNowUpdated(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionId,
    event.params._buyItNowPrice,
  );

  const block = blockRef(event);
  const auction = await getOrCreateAuction(
    context,
    event.params._auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );
  context.Auction.set({
    ...auction,
    buyNowPrice: event.params._buyItNowPrice,
  });
});

GbmContract.Auction_StartingPriceUpdated.handler(async ({ event, context }) => {
  await recordAuctionStartingPriceUpdated(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionId,
    event.params._startPrice,
  );

  const block = blockRef(event);
  const auction = await getOrCreateAuction(
    context,
    event.params._auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );
  context.Auction.set({
    ...auction,
    startBidPrice: event.params._startPrice,
  });
});

GbmContract.Auction_BoughtNow.handler(async ({ event, context }) => {
  await recordAuctionBoughtNow(
    context,
    logEvent(event),
    emitterAddress(event),
    event.params._auctionId,
  );

  const block = blockRef(event);
  const auctionId = event.params._auctionId;

  let auction = await getOrCreateAuction(
    context,
    auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );

  auction = {
    ...auction,
    claimed: true,
    claimAt: block.timestamp,
    isBought: true,
  };

  const bid = getOrCreateBid(
    auction.highestBidder,
    auction.highestBid,
    auction,
    block,
  );
  context.Bid.set({ ...bid, outbid: true });

  const user = await getOrCreateGbmUser(context, auction.highestBidder);
  context.GbmUser.set({ ...user, outbids: user.outbids + 1n });

  const globalStats = await getOrCreateGlobalStatistic(context);
  context.GbmStatistic.set({
    ...globalStats,
    totalSalesVolume: globalStats.totalSalesVolume + auction.buyNowPrice,
  });

  const contractStats = await getOrCreateContractStatistic(
    context,
    auction.contractAddress,
  );
  context.GbmStatistic.set({
    ...contractStats,
    totalSalesVolume: contractStats.totalSalesVolume + auction.buyNowPrice,
  });

  context.Auction.set(auction);
});

GbmContract.RoyaltyPaid.handler(async ({ event, context }) => {
  const block = blockRef(event);
  let auction = await getOrCreateAuction(
    context,
    event.params._auctionId,
    GBM_CONTRACT_ADDRESS,
    block,
  );

  auction = {
    ...auction,
    royaltyFees: auction.royaltyFees + event.params._amount,
  };
  auction = updateProceeds(auction);
  context.Auction.set(auction);
});
