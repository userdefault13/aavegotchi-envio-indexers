import { Contract, FetchRequest, JsonRpcProvider } from "ethers";
import aavegotchiDiamondAbi from "../../../abis/AavegotchiDiamond.json";
import { CORE_DIAMOND_ADDRESS } from "../constants";

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

export async function fetchPortalSvgs(
  portalId: bigint,
  blockNumber: bigint,
): Promise<string[]> {
  try {
    const result = await diamond.portalAavegotchisSvg.staticCall(portalId, {
      blockTag: Number(blockNumber),
    });
    return [...result].map((s) => String(s));
  } catch {
    return [];
  }
}
