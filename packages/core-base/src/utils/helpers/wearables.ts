import type { HandlerContext } from "generated";
import {
  fetchWearableSets,
  findWearableSets,
  fetchWearablesConfig,
} from "../contractEffects";
import type { BlockRef } from "../event";
import { STATUS_AAVEGOTCHI } from "../constants";
import { getOrCreateAavegotchi, getOrCreateUser } from "./aavegotchi";

export type Context = HandlerContext;

type AavegotchiEntity = NonNullable<
  Awaited<ReturnType<Context["Aavegotchi"]["get"]>>
>;
type UserEntity = NonNullable<Awaited<ReturnType<Context["User"]["get"]>>>;
type EquippedWearableOwnerEntity = NonNullable<
  Awaited<ReturnType<Context["EquippedWearableOwner"]["get"]>>
>;
type WearablesConfigEntity = NonNullable<
  Awaited<ReturnType<Context["WearablesConfig"]["get"]>>
>;

export function calculateBaseRarityScore(numericTraits: number[]): number {
  let rarityScore = 0;
  for (const element of numericTraits) {
    if (element < 50) rarityScore += 100 - element;
    else rarityScore += element + 1;
  }
  return rarityScore;
}

export function applyEquippedWearablesFromEvent(
  gotchi: AavegotchiEntity,
  newWearables: readonly bigint[] | readonly number[],
): AavegotchiEntity {
  return {
    ...gotchi,
    equippedWearables: [...newWearables].map(Number),
  };
}

export async function updateAavegotchiWearables(
  context: Context,
  gotchi: AavegotchiEntity,
  block: BlockRef,
): Promise<AavegotchiEntity> {
  const equippedSets = await findWearableSets(
    gotchi.equippedWearables,
    block.number,
  );

  if (!equippedSets) {
    return {
      ...gotchi,
      withSetsRarityScore: gotchi.modifiedRarityScore,
      withSetsNumericTraits: gotchi.modifiedNumericTraits,
    };
  }

  if (equippedSets.length === 0) {
    return {
      ...gotchi,
      equippedSetID: undefined,
      equippedSetName: "",
      withSetsRarityScore: gotchi.modifiedRarityScore,
      withSetsNumericTraits: gotchi.modifiedNumericTraits,
      possibleSets: 0n,
    };
  }

  const setTypes = await fetchWearableSets(block.number);
  if (!setTypes) {
    return {
      ...gotchi,
      withSetsRarityScore: gotchi.modifiedRarityScore,
      withSetsNumericTraits: gotchi.modifiedNumericTraits,
    };
  }

  let bestSetID = 0;
  let longestSetLength = 0;
  for (const setID of equippedSets) {
    const setInfo = setTypes[setID];
    if (!setInfo) continue;
    const setLength = setInfo.wearableIds.length;
    if (setLength >= longestSetLength) {
      longestSetLength = setLength;
      bestSetID = setID;
    }
  }

  const bestSet = setTypes[bestSetID];
  if (!bestSet) {
    return gotchi;
  }

  const setBonuses = bestSet.traitsBonuses;
  const brsBonus = setBonuses[0] ?? 0;
  const beforeSetBonus = calculateBaseRarityScore(gotchi.modifiedNumericTraits);
  const withSetsNumericTraits = [...gotchi.modifiedNumericTraits];

  for (let index = 0; index < 4; index++) {
    withSetsNumericTraits[index] =
      withSetsNumericTraits[index] + (setBonuses[index + 1] ?? 0);
  }

  const afterSetBonus = calculateBaseRarityScore(withSetsNumericTraits);
  const bonusDifference = afterSetBonus - beforeSetBonus;

  return {
    ...gotchi,
    withSetsNumericTraits,
    withSetsRarityScore:
      gotchi.modifiedRarityScore +
      BigInt(bonusDifference) +
      BigInt(brsBonus),
    equippedSetID: BigInt(bestSetID),
    equippedSetName: bestSet.name,
    possibleSets: BigInt(equippedSets.length),
  };
}

function equippedWearableId(
  gotchiId: string,
  slotPosition: number,
  wearableId: number,
  isDelegated: boolean,
): string {
  return `${gotchiId}-${slotPosition}-${wearableId}${
    isDelegated ? "-delegated" : ""
  }`;
}

export async function handleWearableEquipping(
  context: Context,
  gotchiId: string,
  slotPosition: number,
  wearableId: number,
  owner: UserEntity,
  timestamp: bigint,
  isDelegated = false,
  depositId = 0n,
): Promise<void> {
  const id = equippedWearableId(gotchiId, slotPosition, wearableId, isDelegated);
  const record: EquippedWearableOwnerEntity = {
    id,
    gotchi_id: gotchiId,
    gotchiId: BigInt(gotchiId),
    wearableId,
    slotPosition,
    owner_id: owner.id,
    ownerAddress: owner.id,
    equippedAt: timestamp,
    isDelegated,
    depositId,
    isCurrentlyEquipped: true,
    unequippedAt: undefined,
  };
  context.EquippedWearableOwner.set(record);
}

export async function handleWearableUnequipping(
  context: Context,
  gotchiId: string,
  slotPosition: number,
  wearableId: number,
  timestamp: bigint,
  isDelegated = false,
): Promise<void> {
  const id = equippedWearableId(gotchiId, slotPosition, wearableId, isDelegated);
  const record = await context.EquippedWearableOwner.get(id);
  if (!record) return;
  context.EquippedWearableOwner.set({
    ...record,
    unequippedAt: timestamp,
    isCurrentlyEquipped: false,
  });
}

export async function handleWearableReplacing(
  context: Context,
  gotchiId: string,
  slotPosition: number,
  oldWearableId: number,
  newWearableId: number,
  owner: UserEntity,
  timestamp: bigint,
  isDelegated = false,
  depositId = 0n,
): Promise<void> {
  await handleWearableUnequipping(
    context,
    gotchiId,
    slotPosition,
    oldWearableId,
    timestamp,
    isDelegated,
  );
  await handleWearableEquipping(
    context,
    gotchiId,
    slotPosition,
    newWearableId,
    owner,
    timestamp,
    isDelegated,
    depositId,
  );
}

export async function createOrUpdateWearablesConfig(
  context: Context,
  owner: string,
  tokenId: bigint,
  wearablesConfigId: number,
  block: BlockRef,
): Promise<WearablesConfigEntity | undefined> {
  const user = await getOrCreateUser(context, owner);
  context.User.set(user);

  const gotchi = await getOrCreateAavegotchi(
    context,
    tokenId.toString(),
    block,
    false,
  );
  if (!gotchi) return undefined;

  const info = await fetchWearablesConfig(
    user.id,
    tokenId,
    wearablesConfigId,
    block.number,
  );
  if (!info) return undefined;

  const id = `${user.id}-${tokenId}-${wearablesConfigId}`;
  const config: WearablesConfigEntity = {
    id,
    wearablesConfigId,
    gotchi_id: gotchi.id,
    gotchiTokenId: tokenId,
    owner_id: user.id,
    ownerAddress: user.id,
    name: info.name,
    wearables: info.wearables,
  };
  context.WearablesConfig.set(config);
  return config;
}
