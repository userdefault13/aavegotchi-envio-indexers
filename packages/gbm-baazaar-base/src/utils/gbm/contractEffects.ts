import { Contract, FetchRequest, JsonRpcProvider } from "ethers";
import gbmAbi from "../../../abis/GbmContract.json";
import { GBM_CONTRACT_ADDRESS } from "./constants";
import { getOrFetchRpc, rpcCacheKey } from "../rpcCache";

function resolveRpcUrl(): string {
  if (process.env.BASE_MAINNET_RPC) return process.env.BASE_MAINNET_RPC;
  return "https://mainnet.base.org";
}

const RPC_URL = resolveRpcUrl();
const fetchRequest = new FetchRequest(RPC_URL);
fetchRequest.timeout = 30_000;
const provider = new JsonRpcProvider(fetchRequest, undefined, { batchMaxCount: 10, batchStallTime: 25 });
const gbmContract = new Contract(GBM_CONTRACT_ADDRESS, gbmAbi, provider);

function toBigInt(value: bigint | number | { toString(): string }): bigint {
  if (typeof value === "bigint") return value;
  return BigInt(value.toString());
}

export type GbmAuctionInfoOnChain = {
  owner: string;
  highestBid: bigint;
  highestBidder: string;
  auctionDebt: bigint;
  dueIncentives: bigint;
  claimed: boolean;
  category: number;
  startTime: bigint;
  endTime: bigint;
  tokenAmount: bigint;
  tokenKind: string;
  tokenID: bigint;
  buyItNowPrice: bigint;
  startingBid: bigint;
  incMin: bigint;
  incMax: bigint;
  bidMultiplier: bigint;
  stepMin: bigint;
  bidDecimals: bigint;
};

async function fetchAuctionInfoUncached(
  auctionId: bigint,
  blockNumber: bigint,
): Promise<GbmAuctionInfoOnChain | undefined> {
  try {
    const result = await gbmContract.getAuctionInfo.staticCall(auctionId, {
      blockTag: Number(blockNumber),
    });
    const info = result.info;
    const presets = result.presets;
    return {
      owner: String(result.owner).toLowerCase(),
      highestBid: toBigInt(result.highestBid),
      highestBidder: String(result.highestBidder).toLowerCase(),
      auctionDebt: toBigInt(result.auctionDebt),
      dueIncentives: toBigInt(result.dueIncentives),
      claimed: Boolean(result.claimed),
      category: Number(info.category),
      startTime: toBigInt(info.startTime),
      endTime: toBigInt(info.endTime),
      tokenAmount: toBigInt(info.tokenAmount),
      tokenKind: String(info.tokenKind),
      tokenID: toBigInt(info.tokenID),
      buyItNowPrice: toBigInt(info.buyItNowPrice),
      startingBid: toBigInt(info.startingBid),
      incMin: toBigInt(presets.incMin),
      incMax: toBigInt(presets.incMax),
      bidMultiplier: toBigInt(presets.bidMultiplier),
      stepMin: toBigInt(presets.stepMin),
      bidDecimals: toBigInt(presets.bidDecimals),
    };
  } catch {
    return undefined;
  }
}

export async function fetchAuctionInfo(
  auctionId: bigint,
  blockNumber: bigint,
): Promise<GbmAuctionInfoOnChain | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("gbmAuctionInfo", blockNumber, auctionId),
    () => fetchAuctionInfoUncached(auctionId, blockNumber),
  );
}

async function fetchHammerTimeUncached(blockNumber: bigint): Promise<bigint | undefined> {
  try {
    const result = await gbmContract.getAuctionHammerTimeDuration.staticCall({
      blockTag: Number(blockNumber),
    });
    return toBigInt(result);
  } catch {
    return undefined;
  }
}

export async function fetchAuctionHammerTimeDuration(
  blockNumber: bigint,
): Promise<bigint | undefined> {
  return getOrFetchRpc(rpcCacheKey("gbmHammerTime", blockNumber), () =>
    fetchHammerTimeUncached(blockNumber),
  );
}
