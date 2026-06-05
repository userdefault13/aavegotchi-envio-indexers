import { Contract, FetchRequest, JsonRpcProvider } from "ethers";
import erc20Abi from "../../../abis/ERC20.json";
import type { AlchemicaTokenMeta } from "./constants";
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

async function fetchTokenMetaUncached(
  address: string,
): Promise<AlchemicaTokenMeta | undefined> {
  try {
    const token = new Contract(address, erc20Abi, provider);
    const [name, symbol, decimals] = await Promise.all([
      token.name.staticCall() as Promise<string>,
      token.symbol.staticCall() as Promise<string>,
      token.decimals.staticCall() as Promise<number>,
    ]);
    return {
      name: String(name),
      symbol: String(symbol),
      decimals: Number(decimals),
    };
  } catch {
    return undefined;
  }
}

export async function fetchTokenMeta(
  address: string,
): Promise<AlchemicaTokenMeta | undefined> {
  return getOrFetchRpc(rpcCacheKey("erc20Meta", 0n, address), () =>
    fetchTokenMetaUncached(address),
  );
}
