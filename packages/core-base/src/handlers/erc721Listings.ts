import { AavegotchiDiamond } from "generated";
import type { HandlerContext } from "generated";
import {
  BIGINT_ONE,
  BIGINT_ZERO,
  SOCKET_VAULT_ADDRESS,
  ZERO_ADDRESS,
} from "../utils/constants";
import {
  clearActiveListingForERC721Category,
  getOrCreateAavegotchi,
  getOrCreateERC721Listing,
  getOrCreatePortal,
  getOrCreateUser,
  getStatisticEntity,
  updateAavegotchiInfo,
  updateERC721ListingInfo,
} from "../utils/helpers/aavegotchi";
import { getOrCreateParcelAtBlock } from "../utils/helpers/realm";
import { toAddressId } from "../utils/ids";
import { blockRef } from "../utils/event";

AavegotchiDiamond.Transfer.handler(async ({ event, context }) => {
  const id = event.params._tokenId.toString();
  const block = blockRef(event);
  const newOwner = await getOrCreateUser(context, event.params._to);
  context.User.set(newOwner);

  const gotchi = await getOrCreateAavegotchi(context, id, block, false);
  const portal = await getOrCreatePortal(context, id, true);

  if (gotchi) {
    let updated = gotchi;
    if (!updated.modifiedRarityScore) {
      updated = await updateAavegotchiInfo(
        context,
        updated,
        event.params._tokenId,
        block,
      );
    }

    const from = toAddressId(event.params._from);
    if (from === SOCKET_VAULT_ADDRESS) {
      updated = await updateAavegotchiInfo(
        context,
        updated,
        event.params._tokenId,
        block,
      );
    }

    context.Aavegotchi.set({
      ...updated,
      owner_id: newOwner.id,
      originalOwner_id: newOwner.id,
    });

    if (newOwner.id === ZERO_ADDRESS) {
      const stats = await getStatisticEntity(context);
      context.Statistic.set({
        ...stats,
        aavegotchisSacrificed: stats.aavegotchisSacrificed + BIGINT_ONE,
      });
    }
  } else if (portal) {
    context.Portal.set({ ...portal, owner_id: newOwner.id });
  }
});

AavegotchiDiamond.ClaimAavegotchi.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const tokenId = event.params._tokenId.toString();
  const portal = await getOrCreatePortal(context, tokenId);
  if (!portal) return;

  let gotchi = await getOrCreateAavegotchi(context, tokenId, block);
  if (!gotchi) return;

  gotchi = await updateAavegotchiInfo(
    context,
    gotchi,
    event.params._tokenId,
    block,
  );
  gotchi = {
    ...gotchi,
    claimedAt: BigInt(event.block.number),
    claimedTime: BigInt(event.block.timestamp),
    gotchiId: event.params._tokenId,
  };

  const zeroUser = await getOrCreateUser(context, ZERO_ADDRESS);
  context.User.set(zeroUser);

  if (portal.activeListing) {
    const listing = await context.ERC721Listing.get(
      portal.activeListing.toString(),
    );
    if (listing) {
      const updatedListing = await updateERC721ListingInfo(
        context,
        listing,
        portal.activeListing,
        block,
      );
      context.ERC721Listing.set({ ...updatedListing, cancelled: true });
    }
  }

  const stats = await getStatisticEntity(context);
  context.Statistic.set({
    ...stats,
    aavegotchisClaimed: stats.aavegotchisClaimed + BIGINT_ONE,
  });

  context.Portal.set({
    ...portal,
    gotchi_id: gotchi.id,
    owner_id: zeroUser.id,
    status: "Claimed",
    claimedAt: BigInt(event.block.number),
    claimedTime: BigInt(event.block.timestamp),
  });
  context.Aavegotchi.set(gotchi);
});

AavegotchiDiamond.ERC721ListingAdd.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const listingId = event.params.listingId.toString();
  let listing = await getOrCreateERC721Listing(context, listingId);
  listing = await updateERC721ListingInfo(
    context,
    listing,
    event.params.listingId,
    block,
  );

  if (listing.category === 3n) {
    listing = {
      ...listing,
      gotchi_id: event.params.erc721TokenId.toString(),
    };
    const gotchi = await getOrCreateAavegotchi(
      context,
      event.params.erc721TokenId.toString(),
      block,
    );
    if (gotchi) {
      context.Aavegotchi.set({
        ...gotchi,
        locked: true,
        activeListing: event.params.listingId,
      });
      listing = {
        ...listing,
        collateral: gotchi.collateral,
        nameLowerCase: gotchi.nameLowerCase,
        kinship: gotchi.kinship,
        ...(gotchi.withSetsNumericTraits?.length === 6
          ? {
              nrgTrait: BigInt(gotchi.withSetsNumericTraits[0]),
              aggTrait: BigInt(gotchi.withSetsNumericTraits[1]),
              spkTrait: BigInt(gotchi.withSetsNumericTraits[2]),
              brnTrait: BigInt(gotchi.withSetsNumericTraits[3]),
              eysTrait: BigInt(gotchi.withSetsNumericTraits[4]),
              eycTrait: BigInt(gotchi.withSetsNumericTraits[5]),
            }
          : {}),
      };
    }
  } else if (listing.category < 3n) {
    const portal = await getOrCreatePortal(
      context,
      event.params.erc721TokenId.toString(),
    );
    if (portal) {
      context.Portal.set({
        ...portal,
        activeListing: event.params.listingId,
      });
      listing = { ...listing, portal_id: event.params.erc721TokenId.toString() };
    }
  } else if (listing.category === 4n) {
    listing = { ...listing, parcel_id: event.params.erc721TokenId.toString() };
    const parcel = await context.Parcel.get(
      event.params.erc721TokenId.toString(),
    );
    if (parcel) {
      context.Parcel.set({
        ...parcel,
        activeListing: event.params.listingId,
      });
      listing = {
        ...listing,
        fudBoost: parcel.fudBoost,
        fomoBoost: parcel.fomoBoost,
        alphaBoost: parcel.alphaBoost,
        kekBoost: parcel.kekBoost,
        district: parcel.district,
        size: parcel.size,
        coordinateX: parcel.coordinateX,
        coordinateY: parcel.coordinateY,
        parcelHash: parcel.parcelHash,
      };
    }
  }

  context.ERC721Listing.set(listing);
});

AavegotchiDiamond.ERC721ExecutedListing.handler(async ({ event, context }) => {
  const block = blockRef(event);
  let listing = await getOrCreateERC721Listing(
    context,
    event.params.listingId.toString(),
  );
  listing = await updateERC721ListingInfo(
    context,
    listing,
    event.params.listingId,
    block,
  );
  listing = {
    ...listing,
    buyer: toAddressId(event.params.buyer),
    timePurchased: event.params.time,
  };
  context.ERC721Listing.set(listing);

  if (event.params.category < 3n) {
    const portal = await getOrCreatePortal(
      context,
      event.params.erc721TokenId.toString(),
    );
    if (portal) {
      const historicalPrices = [...(portal.historicalPrices ?? [])];
      historicalPrices.push(event.params.priceInWei);
      context.Portal.set({
        ...portal,
        timesTraded: portal.timesTraded + BIGINT_ONE,
        historicalPrices,
        activeListing: undefined,
      });
    }
  } else if (event.params.category === 3n) {
    const gotchi = await getOrCreateAavegotchi(
      context,
      event.params.erc721TokenId.toString(),
      block,
    );
    if (gotchi) {
      const historicalPrices = [...(gotchi.historicalPrices ?? [])];
      historicalPrices.push(event.params.priceInWei);
      context.Aavegotchi.set({
        ...gotchi,
        timesTraded: gotchi.timesTraded + BIGINT_ONE,
        historicalPrices,
        activeListing: undefined,
        locked: false,
      });
    }
  } else if (event.params.category === 4n) {
    const parcel = await getOrCreateParcelAtBlock(
      context,
      event.params.erc721TokenId,
      toAddressId(event.params.buyer),
      BigInt(event.block.number),
    );
    const historicalPrices = [...(parcel.historicalPrices ?? [])];
    historicalPrices.push(event.params.priceInWei);
    context.Parcel.set({
      ...parcel,
      timesTraded: parcel.timesTraded + BIGINT_ONE,
      activeListing: undefined,
      historicalPrices,
    });
  }

  const stats = await getStatisticEntity(context);
  context.Statistic.set({
    ...stats,
    erc721TotalVolume: stats.erc721TotalVolume + event.params.priceInWei,
  });
});

async function handleERC721ListingInactive(
  context: HandlerContext,
  listingId: bigint,
  block: { number: bigint; timestamp: bigint },
): Promise<void> {
  let listing = await getOrCreateERC721Listing(context, listingId.toString());
  listing = await updateERC721ListingInfo(context, listing, listingId, block);
  await clearActiveListingForERC721Category(context, listing, block);
  context.ERC721Listing.set({ ...listing, cancelled: true });
}

AavegotchiDiamond.ERC721ListingCancelled.handler(async ({ event, context }) => {
  await handleERC721ListingInactive(
    context,
    event.params.listingId,
    blockRef(event),
  );
});

AavegotchiDiamond.ERC721ListingRemoved.handler(async ({ event, context }) => {
  await handleERC721ListingInactive(
    context,
    event.params.listingId,
    blockRef(event),
  );
});

AavegotchiDiamond.ERC721ListingPriceUpdate.handler(async ({ event, context }) => {
  const listing = await getOrCreateERC721Listing(
    context,
    event.params.listingId.toString(),
  );
  context.ERC721Listing.set({
    ...listing,
    priceInWei: event.params.priceInWei,
    priceUpdatedAt: event.params.time,
  });
});

AavegotchiDiamond.ERC721ExecutedToRecipient.handler(async ({ event, context }) => {
  const block = blockRef(event);
  let listing = await getOrCreateERC721Listing(
    context,
    event.params.listingId.toString(),
  );
  listing = await updateERC721ListingInfo(
    context,
    listing,
    event.params.listingId,
    block,
  );
  context.ERC721Listing.set({
    ...listing,
    recipient: toAddressId(event.params.recipient),
    buyer: toAddressId(event.params.buyer),
  });
});
