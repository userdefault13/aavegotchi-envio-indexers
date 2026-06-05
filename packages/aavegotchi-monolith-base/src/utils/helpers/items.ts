import type { HandlerContext } from "generated";
import { BIGINT_ZERO } from "../constants";

export type Context = HandlerContext;

type ItemTypeEntity = NonNullable<Awaited<ReturnType<Context["ItemType"]["get"]>>>;
type WearableSetEntity = NonNullable<
  Awaited<ReturnType<Context["WearableSet"]["get"]>>
>;

function defaultItemType(id: string): ItemTypeEntity {
  return {
    id,
    name: "",
    svgId: BigInt(id),
    canBeTransferred: false,
    canPurchaseWithGhst: false,
    category: 0,
    consumed: BIGINT_ZERO,
    ghstPrice: BIGINT_ZERO,
    maxQuantity: BIGINT_ZERO,
    totalQuantity: BIGINT_ZERO,
    rarityScoreModifier: 0,
    author: undefined,
    desc: undefined,
    traitModifiers: undefined,
    slotPositions: undefined,
    minLevel: undefined,
    kinshipBonus: undefined,
    experienceBonus: undefined,
  };
}

export async function getOrCreateItemType(
  context: Context,
  id: string,
  createIfNotFound = true,
): Promise<ItemTypeEntity | undefined> {
  const existing = await context.ItemType.get(id);
  if (existing) return existing;
  if (!createIfNotFound) return undefined;
  const itemType = defaultItemType(id);
  context.ItemType.set(itemType);
  return itemType;
}

export async function getOrCreateWearableSet(
  context: Context,
  id: string,
  createIfNotFound = true,
): Promise<WearableSetEntity | undefined> {
  const existing = await context.WearableSet.get(id);
  if (existing) return existing;
  if (!createIfNotFound) return undefined;
  const set: WearableSetEntity = {
    id,
    name: id,
    allowedCollaterals: undefined,
    traitBonuses: undefined,
    wearableIds: undefined,
  };
  context.WearableSet.set(set);
  return set;
}
