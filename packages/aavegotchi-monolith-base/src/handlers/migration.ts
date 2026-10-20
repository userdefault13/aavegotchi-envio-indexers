import { AavegotchiDiamond } from "generated";
import { PORTAL_STATUS_CLAIMED, STATUS_AAVEGOTCHI, ZERO_ADDRESS } from "../utils/constants";
import { fetchAavegotchi } from "../utils/contractEffects";
import {
  getOrCreateAavegotchi,
  getOrCreatePortal,
  getOrCreateUser,
  updateAavegotchiInfo,
} from "../utils/helpers/aavegotchi";
import { blockRef } from "../utils/event";
import { refreshAavegotchiSvgFromChain } from "../utils/svg/helpers";

/**
 * Base migration: mintAavegotchiBridged emits Transfer while the token is still a portal, then
 * setMetadata makes it a gotchi without emitting anything, so the Transfer handler never creates
 * the Aavegotchi row. The bridge then emitted ResyncAavegotchis for every migrated gotchi
 * (~18.5k ids, several times each); load the gotchi from chain when it is summoned at that block.
 */
AavegotchiDiamond.ResyncAavegotchis.handler(async ({ event, context }) => {
  const tokenId = event.params._tokenId;
  const id = tokenId.toString();
  const block = blockRef(event);

  const onChain = await fetchAavegotchi(tokenId, block.number);
  if (!onChain || onChain.status !== STATUS_AAVEGOTCHI) return;

  const existing = await getOrCreateAavegotchi(context, id, block, true);
  if (!existing) return;
  let gotchi = await updateAavegotchiInfo(context, existing, tokenId, block);
  // Each id was resynced several times; SVGs only need loading once.
  if (!gotchi.svg) {
    gotchi = await refreshAavegotchiSvgFromChain(gotchi, tokenId, block.number);
  }
  context.Aavegotchi.set(gotchi);

  const portal = await getOrCreatePortal(context, id, true);
  if (portal && portal.status !== PORTAL_STATUS_CLAIMED) {
    const zeroUser = await getOrCreateUser(context, ZERO_ADDRESS);
    context.User.set(zeroUser);
    context.Portal.set({
      ...portal,
      gotchi_id: gotchi.id,
      status: PORTAL_STATUS_CLAIMED,
      owner_id: zeroUser.id,
    });
  }
});
