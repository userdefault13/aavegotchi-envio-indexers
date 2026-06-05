import { AavegotchiDiamond } from "generated";
import type { AavegotchiDiamond_AddItemType_eventArgs } from "generated/src/Types.gen";
import { getOrCreateItemType, getOrCreateWearableSet } from "../utils/helpers/items";

type ItemTypeTuple = AavegotchiDiamond_AddItemType_eventArgs["_itemType"];

function slotPositionsFromBools(slots: readonly boolean[]): number[] {
  return [...slots]
    .map((slot, index) => (slot ? index : -1))
    .filter((index) => index >= 0);
}

function mapItemTypeTuple(itemInfo: ItemTypeTuple) {
  return {
    name: itemInfo[0],
    desc: itemInfo[1],
    author: itemInfo[2],
    traitModifiers: itemInfo[3].map(Number),
    slotPositions: slotPositionsFromBools(itemInfo[4]),
    ghstPrice: itemInfo[7],
    maxQuantity: itemInfo[8],
    totalQuantity: itemInfo[9],
    svgId: itemInfo[10],
    rarityScoreModifier: Number(itemInfo[11]),
    canPurchaseWithGhst: itemInfo[12],
    minLevel: Number(itemInfo[13]),
    canBeTransferred: itemInfo[14],
    category: Number(itemInfo[15]),
    kinshipBonus: Number(itemInfo[16]),
    experienceBonus: itemInfo[17],
  };
}

AavegotchiDiamond.AddItemType.handler(async ({ event, context }) => {
  const fields = mapItemTypeTuple(event.params._itemType);
  const itemType = await getOrCreateItemType(context, fields.svgId.toString());
  if (!itemType) return;
  context.ItemType.set({ ...itemType, ...fields });
});

AavegotchiDiamond.UpdateItemType.handler(async ({ event, context }) => {
  const fields = mapItemTypeTuple(event.params._itemType);
  const itemType = await getOrCreateItemType(context, fields.svgId.toString());
  if (!itemType) return;
  context.ItemType.set({ ...itemType, ...fields });
});

AavegotchiDiamond.ItemTypeMaxQuantity.handler(async ({ event, context }) => {
  const itemIds = event.params._itemIds;
  const quantities = event.params._maxQuanities;
  for (let index = 0; index < itemIds.length; index++) {
    const itemType = await getOrCreateItemType(
      context,
      itemIds[index].toString(),
    );
    if (!itemType) continue;
    context.ItemType.set({ ...itemType, maxQuantity: quantities[index] });
  }
});

async function incrementTotalQuantity(
  context: Parameters<typeof getOrCreateItemType>[0],
  itemIds: readonly bigint[],
  quantities: readonly bigint[],
) {
  for (let index = 0; index < itemIds.length; index++) {
    const itemType = await getOrCreateItemType(context, itemIds[index].toString());
    if (!itemType) continue;
    context.ItemType.set({
      ...itemType,
      totalQuantity: itemType.totalQuantity + quantities[index],
    });
  }
}

AavegotchiDiamond.PurchaseItemsWithGhst.handler(async ({ event, context }) => {
  await incrementTotalQuantity(
    context,
    event.params._itemIds,
    event.params._quantities,
  );
});

AavegotchiDiamond.PurchaseItemsWithVouchers.handler(async ({ event, context }) => {
  await incrementTotalQuantity(
    context,
    event.params._itemIds,
    event.params._quantities,
  );
});

AavegotchiDiamond.MigrateVouchers.handler(async ({ event, context }) => {
  await incrementTotalQuantity(context, event.params._ids, event.params._values);
});

AavegotchiDiamond.AddWearableSet.handler(async ({ event, context }) => {
  const setInfo = event.params._wearableSet;
  const set = await getOrCreateWearableSet(context, setInfo[0]);
  if (!set) return;
  context.WearableSet.set({
    ...set,
    name: setInfo[0],
    allowedCollaterals: setInfo[1].map(Number),
    wearableIds: setInfo[2].map(Number),
    traitBonuses: setInfo[3].map(Number),
  });
});

AavegotchiDiamond.UpdateWearableSet.handler(async ({ event, context }) => {
  const setInfo = event.params._wearableSet;
  const set = await getOrCreateWearableSet(context, setInfo[0]);
  if (!set) return;
  context.WearableSet.set({
    ...set,
    name: setInfo[0],
    allowedCollaterals: setInfo[1].map(Number),
    wearableIds: setInfo[2].map(Number),
    traitBonuses: setInfo[3].map(Number),
  });
});

AavegotchiDiamond.ItemModifiersSet.handler(async ({ event, context }) => {
  const itemType = await getOrCreateItemType(
    context,
    event.params._wearableId.toString(),
  );
  if (!itemType) return;
  context.ItemType.set({
    ...itemType,
    traitModifiers: event.params._traitModifiers.map(Number),
    rarityScoreModifier: Number(event.params._rarityScoreModifier),
  });
});

AavegotchiDiamond.WearableSlotPositionsSet.handler(async ({ event, context }) => {
  const itemType = await getOrCreateItemType(
    context,
    event.params._wearableId.toString(),
  );
  if (!itemType) return;
  context.ItemType.set({
    ...itemType,
    slotPositions: slotPositionsFromBools(event.params._slotPositions),
  });
});

AavegotchiDiamond.UpdateItemPrice.handler(async ({ event, context }) => {
  const itemType = await getOrCreateItemType(
    context,
    event.params._itemId.toString(),
  );
  if (!itemType) return;
  context.ItemType.set({
    ...itemType,
    ghstPrice: event.params._priceInWei,
  });
});
