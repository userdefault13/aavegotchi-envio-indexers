import { decodeBytes32String } from "ethers";
import { AavegotchiDiamond, type HandlerContext } from "generated";
import { AAVEGOTCHI_BRIDGE_VAULT_ADDRESS } from "./utils/constants";
import { blockRef } from "./utils/event";
import { ITEM_SVG_TYPES } from "./utils/svg/contractEffects";
import {
  getOrCreateAavegotchi,
  refreshAavegotchiSvgFromChain,
  refreshItemTypeSvgs,
} from "./utils/svg/helpers";

async function updateGotchiSvg(
  context: HandlerContext,
  tokenId: bigint,
  blockNumber: bigint,
): Promise<void> {
  const id = tokenId.toString();
  const gotchi = await getOrCreateAavegotchi(context, id);
  const updated = await refreshAavegotchiSvgFromChain(
    gotchi,
    tokenId,
    blockNumber,
  );
  if (updated) {
    context.Aavegotchi.set(updated);
  }
}

AavegotchiDiamond.ClaimAavegotchi.handler(async ({ event, context }) => {
  await updateGotchiSvg(context, event.params._tokenId, blockRef(event).number);
});

AavegotchiDiamond.EquipWearables.handler(async ({ event, context }) => {
  await updateGotchiSvg(context, event.params._tokenId, blockRef(event).number);
});

// ItemType tuple: 0 name · 10 svgId · 15 category (see abis/AavegotchiDiamond.json).
AavegotchiDiamond.AddItemType.handler(async ({ event, context }) => {
  const item = event.params._itemType;
  await refreshItemTypeSvgs(context, BigInt(item[10]), blockRef(event).number, {
    svgId: BigInt(item[10]),
    name: item[0],
    category: Number(item[15]),
  });
});

AavegotchiDiamond.UpdateItemType.handler(async ({ event, context }) => {
  const item = event.params._itemType;
  await refreshItemTypeSvgs(context, event.params._itemId, blockRef(event).number, {
    svgId: BigInt(item[10]),
    name: item[0],
    category: Number(item[15]),
  });
});

// UpdateSvg reports svg ids; on Base every item's svgId equals its item id.
AavegotchiDiamond.UpdateSvg.handler(async ({ event, context }) => {
  const itemTypes: readonly string[] = ITEM_SVG_TYPES;
  const ids = new Set<bigint>();
  for (const [svgType, svgIds] of event.params._typesAndIdsAndSizes) {
    let type: string;
    try {
      type = decodeBytes32String(svgType);
    } catch {
      continue;
    }
    if (!itemTypes.includes(type)) continue;
    for (const id of svgIds) ids.add(BigInt(id));
  }
  for (const id of ids) {
    await refreshItemTypeSvgs(context, id, blockRef(event).number);
  }
});

// Port of aavegotchi-svg-subgraph handleTransfer: only bridge vault sends refresh SVG.
AavegotchiDiamond.Transfer.handler(
  async ({ event, context }) => {
    await updateGotchiSvg(
      context,
      event.params._tokenId,
      blockRef(event).number,
    );
  },
  {
    eventFilters: {
      _from: AAVEGOTCHI_BRIDGE_VAULT_ADDRESS,
    },
  },
);
