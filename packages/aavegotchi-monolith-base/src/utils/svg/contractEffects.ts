import { Contract, FetchRequest, JsonRpcProvider } from "ethers";
import aavegotchiDiamondAbi from "../../../abis/AavegotchiDiamond.json";
import { CORE_DIAMOND_ADDRESS } from "../constants";
import { getOrFetchRpc, rpcCacheKey } from "../rpcCache";

function resolveRpcUrl(): string {
  if (process.env.BASE_MAINNET_RPC) return process.env.BASE_MAINNET_RPC;
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey) return `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  return "https://mainnet.base.org";
}

const fetchRequest = new FetchRequest(resolveRpcUrl());
fetchRequest.timeout = 30_000;
const provider = new JsonRpcProvider(fetchRequest);
const diamond = new Contract(
  CORE_DIAMOND_ADDRESS,
  aavegotchiDiamondAbi,
  provider,
);

async function fetchAavegotchiSvgUncached(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string | undefined> {
  try {
    const result = await diamond.getAavegotchiSvg.staticCall(tokenId, {
      blockTag: Number(blockNumber),
    });
    return String(result);
  } catch {
    return undefined;
  }
}

export async function fetchAavegotchiSvg(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("aavegotchiSvg", blockNumber, tokenId),
    () => fetchAavegotchiSvgUncached(tokenId, blockNumber),
  );
}

async function fetchAavegotchiSideSvgsUncached(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string[] | undefined> {
  try {
    const result = await diamond.getAavegotchiSideSvgs.staticCall(tokenId, {
      blockTag: Number(blockNumber),
    });
    return [...result].map((s) => String(s));
  } catch {
    return undefined;
  }
}

export async function fetchAavegotchiSideSvgs(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string[] | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("aavegotchiSideSvgs", blockNumber, tokenId),
    () => fetchAavegotchiSideSvgsUncached(tokenId, blockNumber),
  );
}
