import { experimental_createEffect, S } from "envio";
import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import installationDiamondAbi from "../../abis/InstallationDiamond.json";
import realmDiamondAbi from "../../abis/RealmDiamond.json";
import tileDiamondAbi from "../../abis/TileDiamond.json";
import {
  INSTALLATION_DIAMOND_ADDRESS,
  REALM_DIAMOND_ADDRESS,
  TILE_DIAMOND_ADDRESS,
} from "./constants";

const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

export type ParcelOnChain = {
  parcelId: string;
  coordinateX: bigint;
  coordinateY: bigint;
  district: bigint;
  parcelAddress: string;
  boost: readonly bigint[];
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
  alchemicaCost: readonly bigint[];
  harvestRate: bigint;
  capacity: bigint;
  prerequisites: readonly bigint[];
  name: string;
};

export type TileTypeOnChain = {
  alchemicaCost: readonly bigint[];
  craftTime: bigint;
  deprecated: boolean;
  height: number;
  width: number;
  name: string;
  tileType: number;
};

export const getParcelInfoEffect = experimental_createEffect(
  {
    name: "getParcelInfo",
    input: S.object((s) => ({
      tokenId: s.field("tokenId", S.bigint),
      blockNumber: s.field("blockNumber", S.bigint),
    })),
    output: S.nullable(
      S.object((s) => ({
        parcelId: s.field("parcelId", S.string),
        coordinateX: s.field("coordinateX", S.bigint),
        coordinateY: s.field("coordinateY", S.bigint),
        district: s.field("district", S.bigint),
        parcelAddress: s.field("parcelAddress", S.string),
        boost: s.field("boost", S.array(S.bigint)),
        size: s.field("size", S.bigint),
      })),
    ),
    cache: true,
  },
  async ({ input }) => {
    try {
      const result = (await publicClient.readContract({
        address: REALM_DIAMOND_ADDRESS as Address,
        abi: realmDiamondAbi,
        functionName: "getParcelInfo",
        args: [input.tokenId],
        blockNumber: input.blockNumber,
      })) as ParcelOnChain;

      return {
        parcelId: result.parcelId,
        coordinateX: result.coordinateX,
        coordinateY: result.coordinateY,
        district: result.district,
        parcelAddress: result.parcelAddress,
        boost: [...result.boost],
        size: result.size,
      };
    } catch {
      return undefined;
    }
  },
);

export const getInstallationTypeEffect = experimental_createEffect(
  {
    name: "getInstallationType",
    input: S.object((s) => ({
      installationTypeId: s.field("installationTypeId", S.bigint),
      blockNumber: s.field("blockNumber", S.bigint),
    })),
    output: S.nullable(
      S.object((s) => ({
        width: s.field("width", S.number),
        height: s.field("height", S.number),
        installationType: s.field("installationType", S.number),
        level: s.field("level", S.number),
        alchemicaType: s.field("alchemicaType", S.number),
        spillRadius: s.field("spillRadius", S.bigint),
        spillRate: s.field("spillRate", S.number),
        upgradeQueueBoost: s.field("upgradeQueueBoost", S.number),
        craftTime: s.field("craftTime", S.bigint),
        nextLevelId: s.field("nextLevelId", S.bigint),
        deprecated: s.field("deprecated", S.boolean),
        alchemicaCost: s.field("alchemicaCost", S.array(S.bigint)),
        harvestRate: s.field("harvestRate", S.bigint),
        capacity: s.field("capacity", S.bigint),
        prerequisites: s.field("prerequisites", S.array(S.bigint)),
        name: s.field("name", S.string),
      })),
    ),
    cache: true,
  },
  async ({ input }) => {
    try {
      const result = (await publicClient.readContract({
        address: INSTALLATION_DIAMOND_ADDRESS as Address,
        abi: installationDiamondAbi,
        functionName: "getInstallationType",
        args: [input.installationTypeId],
        blockNumber: input.blockNumber,
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
        alchemicaCost: [...result.alchemicaCost],
        harvestRate: result.harvestRate,
        capacity: result.capacity,
        prerequisites: [...result.prerequisites],
        name: result.name,
      };
    } catch {
      return undefined;
    }
  },
);

export const getTileTypeEffect = experimental_createEffect(
  {
    name: "getTileType",
    input: S.object((s) => ({
      tileId: s.field("tileId", S.bigint),
      blockNumber: s.field("blockNumber", S.bigint),
    })),
    output: S.nullable(
      S.object((s) => ({
        alchemicaCost: s.field("alchemicaCost", S.array(S.bigint)),
        craftTime: s.field("craftTime", S.bigint),
        deprecated: s.field("deprecated", S.boolean),
        height: s.field("height", S.number),
        width: s.field("width", S.number),
        name: s.field("name", S.string),
        tileType: s.field("tileType", S.number),
      })),
    ),
    cache: true,
  },
  async ({ input }) => {
    try {
      const result = (await publicClient.readContract({
        address: TILE_DIAMOND_ADDRESS as Address,
        abi: tileDiamondAbi,
        functionName: "getTileType",
        args: [input.tileId],
        blockNumber: input.blockNumber,
      })) as TileTypeOnChain;

      return {
        alchemicaCost: [...result.alchemicaCost],
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
  },
);
