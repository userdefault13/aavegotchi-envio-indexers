import { AavegotchiDiamond } from "generated";
import { blockRef } from "./utils/event";
import { refreshPortalSvgsFromChain } from "./utils/portal/helpers";
import {
  buildPortalTransferEventFilters,
  getPortalTransferTokenIdSet,
} from "./utils/portal/transferEventFilters";

const portalTransferTokenIds = getPortalTransferTokenIdSet();
const portalTransferEventFilters = buildPortalTransferEventFilters();

AavegotchiDiamond.PortalOpened.handler(async ({ event, context }) => {
  await refreshPortalSvgsFromChain(
    context,
    event.params.tokenId,
    blockRef(event).number,
  );
});

AavegotchiDiamond.OpenPortals.handler(async ({ event, context }) => {
  const blockNumber = blockRef(event).number;
  for (const tokenId of event.params._tokenIds) {
    await refreshPortalSvgsFromChain(context, tokenId, blockNumber);
  }
});

if (portalTransferEventFilters) {
  AavegotchiDiamond.Transfer.handler(
    async ({ event, context }) => {
      const tokenId = event.params._tokenId;
      const id = tokenId.toString();
      if (!portalTransferTokenIds.has(id)) {
        const existing = await context.Portal.get(id);
        if (!existing) return;
      }
      await refreshPortalSvgsFromChain(
        context,
        tokenId,
        blockRef(event).number,
      );
    },
    { eventFilters: portalTransferEventFilters },
  );
}
