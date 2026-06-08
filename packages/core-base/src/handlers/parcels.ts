import { RealmDiamond } from "generated";
import { getOrCreateParcelAtBlock } from "../utils/helpers/realm";
import { toAddressId } from "../utils/ids";
import { blockRef } from "../utils/event";

RealmDiamond.MintParcel.handler(async ({ event, context }) => {
  const parcel = await getOrCreateParcelAtBlock(
    context,
    event.params._tokenId,
    toAddressId(event.params._owner),
    BigInt(event.block.number),
  );
  context.Parcel.set(parcel);
});

RealmDiamond.Transfer.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const parcel = await getOrCreateParcelAtBlock(
    context,
    event.params._tokenId,
    toAddressId(event.params._to),
    block.number,
  );
  context.Parcel.set(parcel);
});
