import { AavegotchiDiamond, type HandlerContext } from "generated";
import { AAVEGOTCHI_BRIDGE_VAULT_ADDRESS } from "./utils/constants";
import { blockRef } from "./utils/event";
import {
  getOrCreateAavegotchi,
  refreshAavegotchiSvgFromChain,
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
