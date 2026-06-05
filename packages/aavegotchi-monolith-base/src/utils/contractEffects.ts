import { Contract, FetchRequest, JsonRpcProvider } from "ethers";
import aavegotchiDiamondAbi from "../../abis/AavegotchiDiamond.json";
import realmDiamondAbi from "../../abis/RealmDiamond.json";
import {
  CORE_DIAMOND_ADDRESS,
  REALM_DIAMOND_ADDRESS,
} from "./constants";
import { getOrFetchRpc, rpcCacheKey } from "./rpcCache";

function resolveRpcUrl(): string {
  if (process.env.BASE_MAINNET_RPC) return process.env.BASE_MAINNET_RPC;
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey) return `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  return "https://mainnet.base.org";
}

const RPC_URL = resolveRpcUrl();
const RPC_TIMEOUT_MS = 15_000;

function createProvider(): JsonRpcProvider {
  const fetchRequest = new FetchRequest(RPC_URL);
  fetchRequest.timeout = RPC_TIMEOUT_MS;
  return new JsonRpcProvider(fetchRequest);
}

const provider = createProvider();
const coreContract = new Contract(
  CORE_DIAMOND_ADDRESS,
  aavegotchiDiamondAbi,
  provider,
);
const realmContract = new Contract(
  REALM_DIAMOND_ADDRESS,
  realmDiamondAbi,
  provider,
);

function toBigInt(value: bigint | number | { toString(): string }): bigint {
  if (typeof value === "bigint") return value;
  return BigInt(value.toString());
}

export type AavegotchiOnChain = {
  owner: string;
  name: string;
  randomNumber: bigint;
  status: bigint;
  numericTraits: number[];
  modifiedNumericTraits: number[];
  equippedWearables: number[];
  collateral: string;
  escrow: string;
  stakedAmount: bigint;
  minimumStake: bigint;
  kinship: bigint;
  lastInteracted: bigint;
  experience: bigint;
  toNextLevel: bigint;
  usedSkillPoints: bigint;
  level: bigint;
  hauntId: bigint;
  baseRarityScore: bigint;
  modifiedRarityScore: bigint;
  locked: boolean;
};

export type ERC721ListingOnChain = {
  category: bigint;
  erc721TokenAddress: string;
  erc721TokenId: bigint;
  seller: string;
  timeCreated: bigint;
  timePurchased: bigint;
  priceInWei: bigint;
  cancelled: boolean;
};

export type ERC1155ListingOnChain = {
  category: bigint;
  erc1155TokenAddress: string;
  erc1155TypeId: bigint;
  seller: string;
  timeCreated: bigint;
  timeLastPurchased: bigint;
  priceInWei: bigint;
  sold: boolean;
  cancelled: boolean;
  quantity: bigint;
};

export type ParcelOnChain = {
  parcelId: string;
  coordinateX: bigint;
  coordinateY: bigint;
  district: bigint;
  parcelAddress: string;
  boost: bigint[];
  size: bigint;
};

export type WhitelistOnChain = {
  owner: string;
  name: string;
  addresses: string[];
};

export type WearableSetOnChain = {
  name: string;
  allowedCollaterals: number[];
  wearableIds: number[];
  traitsBonuses: number[];
};

export type WearablesConfigOnChain = {
  name: string;
  wearables: number[];
};

async function fetchAavegotchiUncached(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<AavegotchiOnChain | undefined> {
  try {
    const result = await coreContract.getAavegotchi.staticCall(tokenId, {
      blockTag: Number(blockNumber),
    });
    return {
      owner: String(result.owner).toLowerCase(),
      name: result.name,
      randomNumber: toBigInt(result.randomNumber),
      status: toBigInt(result.status),
      numericTraits: [...result.numericTraits].map(Number),
      modifiedNumericTraits: [...result.modifiedNumericTraits].map(Number),
      equippedWearables: [...result.equippedWearables].map(Number),
      collateral: String(result.collateral),
      escrow: String(result.escrow),
      stakedAmount: toBigInt(result.stakedAmount),
      minimumStake: toBigInt(result.minimumStake),
      kinship: toBigInt(result.kinship),
      lastInteracted: toBigInt(result.lastInteracted),
      experience: toBigInt(result.experience),
      toNextLevel: toBigInt(result.toNextLevel),
      usedSkillPoints: toBigInt(result.usedSkillPoints),
      level: toBigInt(result.level),
      hauntId: toBigInt(result.hauntId),
      baseRarityScore: toBigInt(result.baseRarityScore),
      modifiedRarityScore: toBigInt(result.modifiedRarityScore),
      locked: Boolean(result.locked),
    };
  } catch {
    return undefined;
  }
}

export async function fetchAavegotchi(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<AavegotchiOnChain | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("aavegotchi", blockNumber, tokenId),
    () => fetchAavegotchiUncached(tokenId, blockNumber),
  );
}

async function fetchERC721ListingUncached(
  listingId: bigint,
  blockNumber: bigint,
): Promise<ERC721ListingOnChain | undefined> {
  try {
    const result = await coreContract.getERC721Listing.staticCall(listingId, {
      blockTag: Number(blockNumber),
    });
    return {
      category: toBigInt(result.category),
      erc721TokenAddress: String(result.erc721TokenAddress).toLowerCase(),
      erc721TokenId: toBigInt(result.erc721TokenId),
      seller: String(result.seller).toLowerCase(),
      timeCreated: toBigInt(result.timeCreated),
      timePurchased: toBigInt(result.timePurchased),
      priceInWei: toBigInt(result.priceInWei),
      cancelled: Boolean(result.cancelled),
    };
  } catch {
    return undefined;
  }
}

export async function fetchERC721Listing(
  listingId: bigint,
  blockNumber: bigint,
): Promise<ERC721ListingOnChain | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("erc721Listing", blockNumber, listingId),
    () => fetchERC721ListingUncached(listingId, blockNumber),
  );
}

async function fetchERC1155ListingUncached(
  listingId: bigint,
  blockNumber: bigint,
): Promise<ERC1155ListingOnChain | undefined> {
  try {
    const result = await coreContract.getERC1155Listing.staticCall(listingId, {
      blockTag: Number(blockNumber),
    });
    return {
      category: toBigInt(result.category),
      erc1155TokenAddress: String(result.erc1155TokenAddress).toLowerCase(),
      erc1155TypeId: toBigInt(result.erc1155TypeId),
      seller: String(result.seller).toLowerCase(),
      timeCreated: toBigInt(result.timeCreated),
      timeLastPurchased: toBigInt(result.timeLastPurchased),
      priceInWei: toBigInt(result.priceInWei),
      sold: Boolean(result.sold),
      cancelled: Boolean(result.cancelled),
      quantity: toBigInt(result.quantity),
    };
  } catch {
    return undefined;
  }
}

export async function fetchERC1155Listing(
  listingId: bigint,
  blockNumber: bigint,
): Promise<ERC1155ListingOnChain | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("erc1155Listing", blockNumber, listingId),
    () => fetchERC1155ListingUncached(listingId, blockNumber),
  );
}

async function fetchParcelInfoUncached(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<ParcelOnChain | undefined> {
  try {
    const result = await realmContract.getParcelInfo.staticCall(tokenId, {
      blockTag: Number(blockNumber),
    });
    return {
      parcelId: result.parcelId,
      coordinateX: toBigInt(result.coordinateX),
      coordinateY: toBigInt(result.coordinateY),
      district: toBigInt(result.district),
      parcelAddress: result.parcelAddress,
      boost: [...result.boost].map(toBigInt),
      size: toBigInt(result.size),
    };
  } catch {
    return undefined;
  }
}

export async function fetchParcelInfo(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<ParcelOnChain | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("parcel", blockNumber, tokenId),
    () => fetchParcelInfoUncached(tokenId, blockNumber),
  );
}

async function fetchWhitelistUncached(
  whitelistId: bigint,
  blockNumber: bigint,
): Promise<WhitelistOnChain | undefined> {
  try {
    const result = await coreContract.getWhitelist.staticCall(whitelistId, {
      blockTag: Number(blockNumber),
    });
    return {
      owner: String(result.owner).toLowerCase(),
      name: result.name,
      addresses: [...result.addresses].map((a) => String(a).toLowerCase()),
    };
  } catch {
    return undefined;
  }
}

export async function fetchWhitelist(
  whitelistId: bigint,
  blockNumber: bigint,
): Promise<WhitelistOnChain | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("whitelist", blockNumber, whitelistId),
    () => fetchWhitelistUncached(whitelistId, blockNumber),
  );
}

async function findWearableSetsUncached(
  equippedWearables: number[],
  blockNumber: bigint,
): Promise<number[] | undefined> {
  try {
    const result = await coreContract.findWearableSets.staticCall(
      equippedWearables,
      { blockTag: Number(blockNumber) },
    );
    return [...result].map(Number);
  } catch {
    return undefined;
  }
}

export async function findWearableSets(
  equippedWearables: number[],
  blockNumber: bigint,
): Promise<number[] | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("findWearableSets", blockNumber, equippedWearables.join(",")),
    () => findWearableSetsUncached(equippedWearables, blockNumber),
  );
}

async function fetchWearableSetsUncached(
  blockNumber: bigint,
): Promise<WearableSetOnChain[] | undefined> {
  try {
    const result = await coreContract.getWearableSets.staticCall({
      blockTag: Number(blockNumber),
    });
    return result.map((set: {
      name: string;
      allowedCollaterals: number[] | readonly number[];
      wearableIds: number[] | readonly number[];
      traitsBonuses: number[] | readonly number[];
    }) => ({
      name: set.name,
      allowedCollaterals: [...set.allowedCollaterals].map(Number),
      wearableIds: [...set.wearableIds].map(Number),
      traitsBonuses: [...set.traitsBonuses].map(Number),
    }));
  } catch {
    return undefined;
  }
}

export async function fetchWearableSets(
  blockNumber: bigint,
): Promise<WearableSetOnChain[] | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("wearableSets", blockNumber),
    () => fetchWearableSetsUncached(blockNumber),
  );
}

async function fetchWearablesConfigUncached(
  owner: string,
  tokenId: bigint,
  configId: number,
  blockNumber: bigint,
): Promise<WearablesConfigOnChain | undefined> {
  try {
    const result = await coreContract.getWearablesConfig.staticCall(
      owner,
      tokenId,
      configId,
      { blockTag: Number(blockNumber) },
    );
    return {
      name: result.name,
      wearables: [...result.wearables].map(Number),
    };
  } catch {
    return undefined;
  }
}

export async function fetchWearablesConfig(
  owner: string,
  tokenId: bigint,
  configId: number,
  blockNumber: bigint,
): Promise<WearablesConfigOnChain | undefined> {
  return getOrFetchRpc(
    rpcCacheKey("wearablesConfig", blockNumber, owner, tokenId, configId),
    () => fetchWearablesConfigUncached(owner, tokenId, configId, blockNumber),
  );
}
