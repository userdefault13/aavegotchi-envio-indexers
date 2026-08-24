import { AavegotchiDiamond } from "generated";
import type { HandlerContext } from "generated";
import { BIGINT_ONE, BIGINT_ZERO } from "../utils/constants";
import {
  getOrCreateERC1155Listing,
  getOrCreateERC1155Purchase,
  getStatisticEntity,
  updateERC1155ListingInfo,
} from "../utils/helpers/aavegotchi";
import { itemMaxQuantityToRarity } from "../utils/decimals";
import { toAddressId } from "../utils/ids";
import { blockRef } from "../utils/event";

AavegotchiDiamond.ERC1155ListingAdd.handler(async ({ event, context }) => {
  const block = blockRef(event);
  let listing = await getOrCreateERC1155Listing(
    context,
    event.params.listingId.toString(),
  );
  listing = await updateERC1155ListingInfo(
    context,
    listing,
    event.params.listingId,
    block,
  );
  context.ERC1155Listing.set(listing);
});

AavegotchiDiamond.ERC1155ExecutedListing.handler(async ({ event, context }) => {
  const block = blockRef(event);
  let listing = await getOrCreateERC1155Listing(
    context,
    event.params.listingId.toString(),
  );
  listing = await updateERC1155ListingInfo(
    context,
    listing,
    event.params.listingId,
    block,
  );
  context.ERC1155Listing.set(listing);

  const purchaseId = `${event.params.listingId}_${toAddressId(event.params.buyer)}_${event.block.timestamp}`;
  let purchase = await getOrCreateERC1155Purchase(context, purchaseId);
  const basePurchase = {
    ...purchase,
    category: event.params.category,
    listingID: event.params.listingId,
    erc1155TokenAddress: event.params.erc1155TokenAddress,
    erc1155TypeId: event.params.erc1155TypeId,
    seller: toAddressId(event.params.seller),
    timeLastPurchased: BigInt(event.params.time),
    priceInWei: event.params.priceInWei,
    quantity: event.params._quantity,
    buyer: toAddressId(event.params.buyer),
    recipient: toAddressId(event.params.buyer),
  };

  if (basePurchase.category === 3n) {
    purchase = { ...basePurchase, rarityLevel: event.params.erc1155TypeId };
  } else {
    const itemType = await context.ItemType.get(
      event.params.erc1155TypeId.toString(),
    );
    purchase = {
      ...basePurchase,
      rarityLevel: itemType
        ? itemMaxQuantityToRarity(itemType.maxQuantity)
        : basePurchase.rarityLevel,
    };
  }
  context.ERC1155Purchase.set(purchase);

  const stats = await getStatisticEntity(context);
  const volume = event.params.priceInWei * event.params._quantity;
  const category = Number(listing.category);
  context.Statistic.set({
    ...stats,
    erc1155TotalVolume: stats.erc1155TotalVolume + volume,
    totalWearablesVolume:
      category === 0 ? stats.totalWearablesVolume + volume : stats.totalWearablesVolume,
    totalConsumablesVolume:
      category === 2
        ? stats.totalConsumablesVolume + volume
        : stats.totalConsumablesVolume,
    totalTicketsVolume:
      category === 3 ? stats.totalTicketsVolume + volume : stats.totalTicketsVolume,
  });
});

async function syncERC1155ListingFromChain(
  context: HandlerContext,
  listingId: bigint,
  block: { number: bigint; timestamp: bigint },
): Promise<void> {
  let listing = await getOrCreateERC1155Listing(context, listingId.toString());
  listing = await updateERC1155ListingInfo(context, listing, listingId, block);
  context.ERC1155Listing.set(listing);
}

AavegotchiDiamond.ERC1155ListingCancelled.handler(async ({ event, context }) => {
  await syncERC1155ListingFromChain(
    context,
    event.params.listingId,
    blockRef(event),
  );
});

AavegotchiDiamond.ERC1155ListingRemoved.handler(async ({ event, context }) => {
  await syncERC1155ListingFromChain(
    context,
    event.params.listingId,
    blockRef(event),
  );
});

AavegotchiDiamond.UpdateERC1155Listing.handler(async ({ event, context }) => {
  await syncERC1155ListingFromChain(
    context,
    event.params.listingId,
    blockRef(event),
  );
});

AavegotchiDiamond.ERC1155ListingPriceUpdate.handler(async ({ event, context }) => {
  const listing = await getOrCreateERC1155Listing(
    context,
    event.params.listingId.toString(),
  );
  context.ERC1155Listing.set({
    ...listing,
    priceInWei: event.params.priceInWei,
    priceUpdatedAt: event.params.time,
  });
});

AavegotchiDiamond.ERC1155ExecutedToRecipient.handler(async ({ event, context }) => {
  const block = blockRef(event);
  await syncERC1155ListingFromChain(context, event.params.listingId, block);

  const purchaseId = `${event.params.listingId}_${toAddressId(event.params.buyer)}_${event.block.timestamp}`;
  let purchase = await getOrCreateERC1155Purchase(context, purchaseId);
  const listing = await getOrCreateERC1155Listing(
    context,
    event.params.listingId.toString(),
  );

  const basePurchase = {
    ...purchase,
    buyer: toAddressId(event.params.buyer),
    recipient: toAddressId(event.params.recipient),
    listingID: event.params.listingId,
    category: listing.category,
    erc1155TokenAddress: listing.erc1155TokenAddress,
    erc1155TypeId: listing.erc1155TypeId,
    quantity: (purchase.quantity ?? BIGINT_ZERO) + BIGINT_ONE,
    priceInWei: listing.priceInWei,
    timeLastPurchased: BigInt(event.block.timestamp),
    seller: listing.seller,
  };

  if (listing.category === 3n) {
    purchase = { ...basePurchase, rarityLevel: listing.erc1155TypeId };
  } else {
    const itemType = await context.ItemType.get(listing.erc1155TypeId.toString());
    purchase = {
      ...basePurchase,
      rarityLevel: itemType
        ? itemMaxQuantityToRarity(itemType.maxQuantity)
        : basePurchase.rarityLevel,
    };
  }

  context.ERC1155Purchase.set(purchase);
});
