import { RealmDiamond } from "generated";
import { getOrCreateUser } from "../utils/helpers/aavegotchi";
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
  const user = await getOrCreateUser(context, event.params._to);
  context.User.set(user);

  const parcel = await context.Parcel.get(event.params._tokenId.toString());
  if (parcel) {
    context.Parcel.set({ ...parcel, owner_id: user.id });
  }
});

RealmDiamond.ResyncParcel.handler(async ({ event, context }) => {
  const parcel = await context.Parcel.get(event.params._tokenId.toString());
  if (!parcel) return;

  const updated = await getOrCreateParcelAtBlock(
    context,
    event.params._tokenId,
    parcel.owner_id,
    BigInt(event.block.number),
  );
  context.Parcel.set(updated);
});
