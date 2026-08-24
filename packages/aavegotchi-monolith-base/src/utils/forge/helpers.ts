import type { HandlerContext } from "generated";
import { getOrCreateItemType } from "../helpers/items";
import {
  BIPS,
  FORGE_ALLOY_COST,
  FORGE_ESSENCE_COST,
  FORGE_GLOBAL_STAT_ID,
  SMELT_BURN_BIPS,
  SMELT_DAO_BIPS,
  SMELT_USER_BIPS,
} from "./constants";

export type ForgeContext = HandlerContext;

type ForgeRarityStatEntity = NonNullable<
  Awaited<ReturnType<ForgeContext["ForgeRarityStat"]["get"]>>
>;
type ForgeGlobalStatEntity = NonNullable<
  Awaited<ReturnType<ForgeContext["ForgeGlobalStat"]["get"]>>
>;

function defaultRarityStat(rsm: number): ForgeRarityStatEntity {
  return {
    id: String(rsm),
    rarityScoreModifier: rsm,
    smeltCount: 0n,
    alloyFromSmelting: 0n,
    alloyToUser: 0n,
    alloyToDao: 0n,
    alloyBurnedOnSmelt: 0n,
    forgeQueueCount: 0n,
    alloyUsedForging: 0n,
    essenceUsedForging: 0n,
    forgeClaimCount: 0n,
    instantForgeCount: 0n,
  };
}

function defaultGlobalStat(): ForgeGlobalStatEntity {
  return {
    id: FORGE_GLOBAL_STAT_ID,
    smeltCount: 0n,
    alloyFromSmelting: 0n,
    alloyToUser: 0n,
    alloyToDao: 0n,
    alloyBurnedOnSmelt: 0n,
    forgeQueueCount: 0n,
    alloyUsedForging: 0n,
    essenceUsedForging: 0n,
    forgeClaimCount: 0n,
    instantForgeCount: 0n,
  };
}

export async function resolveItemRsm(
  context: ForgeContext,
  itemId: bigint,
): Promise<number | undefined> {
  const itemType = await getOrCreateItemType(context, itemId.toString(), false);
  if (!itemType) return undefined;
  const rsm = Number(itemType.rarityScoreModifier);
  if (!FORGE_ALLOY_COST[rsm]) return undefined;
  return rsm;
}

export function smeltAlloyBreakdown(totalAlloy: bigint) {
  const alloyToDao = (totalAlloy * SMELT_DAO_BIPS) / BIPS;
  const alloyBurnedOnSmelt = (totalAlloy * SMELT_BURN_BIPS) / BIPS;
  const alloyToUser = totalAlloy - alloyToDao - alloyBurnedOnSmelt;
  const alloyFromSmelting = alloyToUser + alloyToDao;
  return { alloyToUser, alloyToDao, alloyBurnedOnSmelt, alloyFromSmelting };
}

async function getOrCreateRarityStat(
  context: ForgeContext,
  rsm: number,
): Promise<ForgeRarityStatEntity> {
  const existing = await context.ForgeRarityStat.get(String(rsm));
  if (existing) return existing;
  const stat = defaultRarityStat(rsm);
  context.ForgeRarityStat.set(stat);
  return stat;
}

async function getOrCreateGlobalStat(
  context: ForgeContext,
): Promise<ForgeGlobalStatEntity> {
  const existing = await context.ForgeGlobalStat.get(FORGE_GLOBAL_STAT_ID);
  if (existing) return existing;
  const stat = defaultGlobalStat();
  context.ForgeGlobalStat.set(stat);
  return stat;
}

async function bumpStats(
  context: ForgeContext,
  rsm: number,
  patch: Partial<
    Pick<
      ForgeRarityStatEntity,
      | "smeltCount"
      | "alloyFromSmelting"
      | "alloyToUser"
      | "alloyToDao"
      | "alloyBurnedOnSmelt"
      | "forgeQueueCount"
      | "alloyUsedForging"
      | "essenceUsedForging"
      | "forgeClaimCount"
      | "instantForgeCount"
    >
  >,
) {
  const rarity = await getOrCreateRarityStat(context, rsm);
  context.ForgeRarityStat.set({
    ...rarity,
    smeltCount: rarity.smeltCount + (patch.smeltCount ?? 0n),
    alloyFromSmelting: rarity.alloyFromSmelting + (patch.alloyFromSmelting ?? 0n),
    alloyToUser: rarity.alloyToUser + (patch.alloyToUser ?? 0n),
    alloyToDao: rarity.alloyToDao + (patch.alloyToDao ?? 0n),
    alloyBurnedOnSmelt: rarity.alloyBurnedOnSmelt + (patch.alloyBurnedOnSmelt ?? 0n),
    forgeQueueCount: rarity.forgeQueueCount + (patch.forgeQueueCount ?? 0n),
    alloyUsedForging: rarity.alloyUsedForging + (patch.alloyUsedForging ?? 0n),
    essenceUsedForging: rarity.essenceUsedForging + (patch.essenceUsedForging ?? 0n),
    forgeClaimCount: rarity.forgeClaimCount + (patch.forgeClaimCount ?? 0n),
    instantForgeCount: rarity.instantForgeCount + (patch.instantForgeCount ?? 0n),
  });

  const global = await getOrCreateGlobalStat(context);
  context.ForgeGlobalStat.set({
    ...global,
    smeltCount: global.smeltCount + (patch.smeltCount ?? 0n),
    alloyFromSmelting: global.alloyFromSmelting + (patch.alloyFromSmelting ?? 0n),
    alloyToUser: global.alloyToUser + (patch.alloyToUser ?? 0n),
    alloyToDao: global.alloyToDao + (patch.alloyToDao ?? 0n),
    alloyBurnedOnSmelt: global.alloyBurnedOnSmelt + (patch.alloyBurnedOnSmelt ?? 0n),
    forgeQueueCount: global.forgeQueueCount + (patch.forgeQueueCount ?? 0n),
    alloyUsedForging: global.alloyUsedForging + (patch.alloyUsedForging ?? 0n),
    essenceUsedForging: global.essenceUsedForging + (patch.essenceUsedForging ?? 0n),
    forgeClaimCount: global.forgeClaimCount + (patch.forgeClaimCount ?? 0n),
    instantForgeCount: global.instantForgeCount + (patch.instantForgeCount ?? 0n),
  });
}

export async function recordSmelt(
  context: ForgeContext,
  itemId: bigint,
  gotchiId: bigint,
  blockNumber: bigint,
  timestamp: bigint,
  txHash: string,
  logIndex: number,
) {
  const rsm = await resolveItemRsm(context, itemId);
  const totalAlloy = rsm != null ? FORGE_ALLOY_COST[rsm] : 0n;
  const breakdown =
    rsm != null ? smeltAlloyBreakdown(totalAlloy) : {
      alloyToUser: 0n,
      alloyToDao: 0n,
      alloyBurnedOnSmelt: 0n,
      alloyFromSmelting: 0n,
    };

  context.ForgeSmelt.set({
    id: `${txHash}-${logIndex}`,
    itemId,
    gotchiId,
    rarityScoreModifier: rsm ?? 0,
    alloyToUser: breakdown.alloyToUser,
    alloyToDao: breakdown.alloyToDao,
    alloyBurnedOnSmelt: breakdown.alloyBurnedOnSmelt,
    blockNumber,
    timestamp,
    txHash,
  });

  if (rsm == null) return;

  await bumpStats(context, rsm, {
    smeltCount: 1n,
    ...breakdown,
  });
}

export async function recordForgeQueueAdd(
  context: ForgeContext,
  owner: string,
  itemId: bigint,
  gotchiId: bigint,
  readyBlock: bigint,
  queueId: bigint,
  blockNumber: bigint,
  timestamp: bigint,
  txHash: string,
  logIndex: number,
) {
  const rsm = await resolveItemRsm(context, itemId);
  const alloyCost = rsm != null ? FORGE_ALLOY_COST[rsm] : 0n;
  const essenceCost = rsm != null ? await forgeEssenceCost(context, itemId, rsm) : 0n;

  context.ForgeQueueAdd.set({
    id: `${txHash}-${logIndex}`,
    owner,
    itemId,
    gotchiId,
    queueId,
    readyBlock,
    rarityScoreModifier: rsm ?? 0,
    alloyCost,
    essenceCost,
    blockNumber,
    timestamp,
    txHash,
  });

  if (rsm == null) return;

  await bumpStats(context, rsm, {
    forgeQueueCount: 1n,
    alloyUsedForging: alloyCost,
    essenceUsedForging: essenceCost,
  });
}

export async function recordForgeQueueClaim(
  context: ForgeContext,
  itemId: bigint,
  gotchiId: bigint,
  blockNumber: bigint,
  timestamp: bigint,
  txHash: string,
  logIndex: number,
) {
  const rsm = await resolveItemRsm(context, itemId);

  context.ForgeQueueClaim.set({
    id: `${txHash}-${logIndex}`,
    itemId,
    gotchiId,
    rarityScoreModifier: rsm ?? 0,
    blockNumber,
    timestamp,
    txHash,
  });

  if (rsm == null) return;

  await bumpStats(context, rsm, { forgeClaimCount: 1n });
}

export async function recordInstantForge(
  context: ForgeContext,
  itemId: bigint,
  gotchiId: bigint,
  gltrBlocksUsed: bigint,
  blockNumber: bigint,
  timestamp: bigint,
  txHash: string,
  logIndex: number,
) {
  const rsm = await resolveItemRsm(context, itemId);
  const alloyCost = rsm != null ? FORGE_ALLOY_COST[rsm] : 0n;
  const essenceCost = rsm != null ? await forgeEssenceCost(context, itemId, rsm) : 0n;

  context.ForgeInstantComplete.set({
    id: `${txHash}-${logIndex}`,
    itemId,
    gotchiId,
    gltrBlocksUsed,
    rarityScoreModifier: rsm ?? 0,
    alloyCost,
    essenceCost,
    blockNumber,
    timestamp,
    txHash,
  });

  if (rsm == null) return;

  await bumpStats(context, rsm, {
    instantForgeCount: 1n,
    alloyUsedForging: alloyCost,
    essenceUsedForging: essenceCost,
  });
}

const PET_SLOT_INDEX = 5;
const GODLIKE_RSM = 50;

async function forgeEssenceCost(
  context: ForgeContext,
  itemId: bigint,
  rsm: number,
): Promise<bigint> {
  const itemType = await getOrCreateItemType(context, itemId.toString(), false);
  if (!itemType?.slotPositions?.length) return 0n;
  const isPet = itemType.slotPositions?.includes(PET_SLOT_INDEX) ?? false;
  const isGodlike = rsm === GODLIKE_RSM;
  if (!isPet && !isGodlike) return 0n;
  return FORGE_ESSENCE_COST[rsm] ?? 0n;
}
