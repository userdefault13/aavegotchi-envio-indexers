import { AavegotchiDiamond } from "generated";
import { BIGINT_ZERO } from "../utils/constants";
import { blockRef } from "../utils/event";
import {
  createOrUpdateWhitelist,
  getOrCreateWhitelist,
} from "../utils/helpers/whitelists";
import {
  getOrCreateERC721Listing,
  getOrCreateERC1155Listing,
} from "../utils/helpers/aavegotchi";

AavegotchiDiamond.WhitelistCreated.handler(async ({ event, context }) => {
  await createOrUpdateWhitelist(
    context,
    event.params.whitelistId,
    blockRef(event),
  );
});

AavegotchiDiamond.WhitelistUpdated.handler(async ({ event, context }) => {
  await createOrUpdateWhitelist(
    context,
    event.params.whitelistId,
    blockRef(event),
  );
});

AavegotchiDiamond.WhitelistOwnershipTransferred.handler(
  async ({ event, context }) => {
    await createOrUpdateWhitelist(
      context,
      event.params.whitelistId,
      blockRef(event),
    );
  },
);

AavegotchiDiamond.WhitelistAccessRightSet.handler(async ({ event, context }) => {
  const whitelist = await getOrCreateWhitelist(
    context,
    event.params.whitelistId,
    blockRef(event),
  );
  if (!whitelist) return;

  if (event.params.actionRight === BIGINT_ZERO) {
    context.Whitelist.set({
      ...whitelist,
      maxBorrowLimit: Number(event.params.accessRight),
    });
  }
});

AavegotchiDiamond.ERC721ListingWhitelistSet.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const listing = await getOrCreateERC721Listing(
    context,
    event.params.listingId.toString(),
  );
  const whitelist = await getOrCreateWhitelist(
    context,
    event.params.whitelistId,
    block,
  );
  if (!whitelist) return;
  context.ERC721Listing.set({
    ...listing,
    whitelist_id: whitelist.id,
  });
});

AavegotchiDiamond.ERC1155ListingWhitelistSet.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const listing = await getOrCreateERC1155Listing(
    context,
    event.params.listingId.toString(),
  );
  const whitelist = await getOrCreateWhitelist(
    context,
    event.params.whitelistId,
    block,
  );
  if (!whitelist) return;
  context.ERC1155Listing.set({
    ...listing,
    whitelist_id: whitelist.id,
  });
});
