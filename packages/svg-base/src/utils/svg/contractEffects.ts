import { Contract, FetchRequest, JsonRpcProvider, encodeBytes32String, isError } from "ethers";
import aavegotchiDiamondAbi from "../../../abis/AavegotchiDiamond.json";
import { CORE_DIAMOND_ADDRESS } from "../constants";
import { getOrFetchRpc, rpcCacheKey } from "../rpcCache";

function resolveRpcUrl(): string {
  if (process.env.BASE_MAINNET_RPC) return process.env.BASE_MAINNET_RPC;
  return "https://aarcadeghst.com/api/base-rpc";
}

// SVG views are read at latest state: the keyless Base RPCs refuse archive calls
// or rate-limit heavy ones, and the Aarcade RPC rejects JSON-RPC batches.
const fetchRequest = new FetchRequest(resolveRpcUrl());
fetchRequest.timeout = 30_000;
const provider = new JsonRpcProvider(fetchRequest, 8453, { staticNetwork: true, batchMaxCount: 1 });
const diamond = new Contract(
  CORE_DIAMOND_ADDRESS,
  aavegotchiDiamondAbi,
  provider,
);

// A backfill batch starts thousands of handlers at once; unbounded, the RPC drops calls.
const MAX_IN_FLIGHT = Number(process.env.SVG_RPC_MAX_IN_FLIGHT || 16);
const MAX_ATTEMPTS = 3;
let inFlight = 0;
const waiting: Array<() => void> = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight < MAX_IN_FLIGHT) inFlight++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else inFlight--;
  }
}

/** Cached view call; a revert or exhausted retries is undefined and is not cached. */
async function viewCall<T>(key: string, call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await getOrFetchRpc(key, () =>
      limited(async () => {
        for (let attempt = 1; ; attempt++) {
          try {
            return await call();
          } catch (err) {
            if (attempt >= MAX_ATTEMPTS || isError(err, "CALL_EXCEPTION")) throw err;
            await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
          }
        }
      }),
    );
  } catch (err) {
    if (!isError(err, "CALL_EXCEPTION")) {
      console.warn(`[svg-rpc] ${key} failed: ${(err as Error)?.message?.slice(0, 200)}`);
    }
    return undefined;
  }
}

export async function fetchAavegotchiSvg(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string | undefined> {
  return viewCall(rpcCacheKey("aavegotchiSvg", blockNumber, tokenId), async () =>
    String(await diamond.getAavegotchiSvg.staticCall(tokenId)),
  );
}

/** Diamond SVG layers for items: front, then the three side views. */
export const ITEM_SVG_TYPES = [
  "wearables",
  "wearables-left",
  "wearables-right",
  "wearables-back",
] as const;

/** [front, left, right, back] for one svg id; a view that reverts or is empty is undefined. */
export async function fetchItemSvgs(
  svgId: bigint,
  blockNumber: bigint,
): Promise<Array<string | undefined>> {
  return Promise.all(
    ITEM_SVG_TYPES.map(async (svgType) => {
      const svg = await viewCall(rpcCacheKey("itemSvg", svgType, blockNumber, svgId), async () =>
        String(await diamond.getSvg.staticCall(encodeBytes32String(svgType), svgId)),
      );
      return svg || undefined;
    }),
  );
}

export async function fetchAavegotchiSideSvgs(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string[] | undefined> {
  return viewCall(rpcCacheKey("aavegotchiSideSvgs", blockNumber, tokenId), async () =>
    [...(await diamond.getAavegotchiSideSvgs.staticCall(tokenId))].map((s) => String(s)),
  );
}
