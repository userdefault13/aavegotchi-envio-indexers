import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import installationDiamondAbi from "../../../abis/InstallationDiamond.json";
import realmDiamondAbi from "../../../abis/RealmDiamond.json";
import tileDiamondAbi from "../../../abis/TileDiamond.json";
import {
  INSTALLATION_DIAMOND_ADDRESS,
  REALM_DIAMOND_ADDRESS,
  TILE_DIAMOND_ADDRESS,
} from "./constants";

function resolveRpcUrl(): string {
  if (process.env.BASE_MAINNET_RPC) return process.env.BASE_MAINNET_RPC;
  return "https://mainnet.base.org";
}

const publicClient = createPublicClient({
  chain: base,
  transport: http(resolveRpcUrl(), { timeout: 30_000 }),
});

export type ParcelOnChain = {
  parcelId: string;
  coordinateX: bigint;
  coordinateY: bigint;
  district: bigint;
  parcelAddress: string;
  boost: bigint[];
  size: bigint;
};

export type InstallationTypeOnChain = {
  width: number;
  height: number;
  installationType: number;
  level: number;
  alchemicaType: number;
  spillRadius: bigint;
  spillRate: number;
  upgradeQueueBoost: number;
  craftTime: bigint;
  nextLevelId: bigint;
  deprecated: boolean;
  alchemicaCost: bigint[];
  harvestRate: bigint;
  capacity: bigint;
  prerequisites: bigint[];
  name: string;
};

export type TileTypeOnChain = {
  alchemicaCost: bigint[];
  craftTime: bigint;
  deprecated: boolean;
  height: number;
  width: number;
  name: string;
  tileType: number;
};

export async function fetchParcelInfo(
  tokenId: bigint,
  blockNumber: bigint,
): Promise<ParcelOnChain | undefined> {
  try {
    const result = (await publicClient.readContract({
      address: REALM_DIAMOND_ADDRESS as Address,
      abi: realmDiamondAbi,
      functionName: "getParcelInfo",
      args: [tokenId],
      blockNumber,
    })) as ParcelOnChain;

    return {
      parcelId: result.parcelId,
      coordinateX: result.coordinateX,
      coordinateY: result.coordinateY,
      district: result.district,
      parcelAddress: result.parcelAddress,
      boost: result.boost.map((b) => BigInt(b)),
      size: result.size,
    };
  } catch {
    return undefined;
  }
}

export async function fetchInstallationType(
  installationTypeId: bigint,
  blockNumber: bigint,
): Promise<InstallationTypeOnChain | undefined> {
  try {
    const result = (await publicClient.readContract({
      address: INSTALLATION_DIAMOND_ADDRESS as Address,
      abi: installationDiamondAbi,
      functionName: "getInstallationType",
      args: [installationTypeId],
      blockNumber,
    })) as InstallationTypeOnChain;

    return {
      width: result.width,
      height: result.height,
      installationType: result.installationType,
      level: result.level,
      alchemicaType: result.alchemicaType,
      spillRadius: result.spillRadius,
      spillRate: result.spillRate,
      upgradeQueueBoost: result.upgradeQueueBoost,
      craftTime: result.craftTime,
      nextLevelId: result.nextLevelId,
      deprecated: result.deprecated,
      alchemicaCost: result.alchemicaCost.map((v) => BigInt(v)),
      harvestRate: result.harvestRate,
      capacity: result.capacity,
      prerequisites: result.prerequisites.map((v) => BigInt(v)),
      name: result.name,
    };
  } catch {
    return undefined;
  }
}

export async function fetchTileType(
  tileId: bigint,
  blockNumber: bigint,
): Promise<TileTypeOnChain | undefined> {
  try {
    const result = (await publicClient.readContract({
      address: TILE_DIAMOND_ADDRESS as Address,
      abi: tileDiamondAbi,
      functionName: "getTileType",
      args: [tileId],
      blockNumber,
    })) as TileTypeOnChain;

    return {
      alchemicaCost: result.alchemicaCost.map((v) => BigInt(v)),
      craftTime: result.craftTime,
      deprecated: result.deprecated,
      height: result.height,
      width: result.width,
      name: result.name,
      tileType: result.tileType,
    };
  } catch {
    return undefined;
  }
}
