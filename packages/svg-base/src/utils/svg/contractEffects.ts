import { Contract, FetchRequest, JsonRpcProvider, encodeBytes32String } from "ethers";
import aavegotchiDiamondAbi from "../../../abis/AavegotchiDiamond.json";
import { CORE_DIAMOND_ADDRESS } from "../constants";
import { getOrFetchRpc, rpcCacheKey } from "../rpcCache";

function resolveRpcUrl(): string {
  if (process.env.BASE_MAINNET_RPC) return process.env.BASE_MAINNET_RPC;
  return "https://mainnet.base.org";
}

const fetchRequest = new FetchRequest(resolveRpcUrl());
fetchRequest.timeout = 30_000;
const provider = new JsonRpcProvider(fetchRequest, undefined, { batchMaxCount: 10, batchStallTime: 25 });
const diamond = new Contract(
  CORE_DIAMOND_ADDRESS,
  aavegotchiDiamondAbi,
  provider,
);

export async function fetchAavegotchiSvg(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("aavegotchiSvg", blockNumber, tokenId),
    async () => {
      try {
        const result = await diamond.getAavegotchiSvg.staticCall(tokenId, {
          blockTag: Number(blockNumber),
        });
        return String(result);
      } catch {
        return undefined;
      }
    },
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
    ITEM_SVG_TYPES.map((svgType) =>
      getOrFetchRpc(rpcCacheKey("itemSvg", svgType, blockNumber, svgId), async () => {
        try {
          const result = String(
            await diamond.getSvg.staticCall(encodeBytes32String(svgType), svgId, {
              blockTag: Number(blockNumber),
            }),
          );
          return result || undefined;
        } catch {
          return undefined;
        }
      }),
    ),
  );
}

export async function fetchAavegotchiSideSvgs(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<string[] | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("aavegotchiSideSvgs", blockNumber, tokenId),
    async () => {
      try {
        const result = await diamond.getAavegotchiSideSvgs.staticCall(tokenId, {
          blockTag: Number(blockNumber),
        });
        return [...result].map((s) => String(s));
      } catch {
        return undefined;
      }
    },
  );
}
