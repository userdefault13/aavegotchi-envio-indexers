import type { HandlerContext } from "generated";
import { BIGINT_ZERO } from "../constants";
import { getParcelInfoEffect, type ParcelOnChain } from "../contractEffects";
import { toAddressId } from "../ids";
import { getOrCreateUser } from "./aavegotchi";

export type Context = HandlerContext;
type ParcelEntity = NonNullable<Awaited<ReturnType<Context["Parcel"]["get"]>>>;

export async function getOrCreateParcel(
  context: Context,
  tokenId: bigint,
  owner: string,
  updateParcelInfo = true,
): Promise<ParcelEntity> {
  const id = tokenId.toString();
  const existing = await context.Parcel.get(id);
  let parcel: ParcelEntity = existing ?? {
    id,
    tokenId,
    parcelId: "",
    owner_id: toAddressId(owner),
    coordinateX: BIGINT_ZERO,
    coordinateY: BIGINT_ZERO,
    district: BIGINT_ZERO,
    parcelHash: "",
    fudBoost: BIGINT_ZERO,
    fomoBoost: BIGINT_ZERO,
    alphaBoost: BIGINT_ZERO,
    kekBoost: BIGINT_ZERO,
    size: BIGINT_ZERO,
    timesTraded: BIGINT_ZERO,
    historicalPrices: [],
    activeListing: undefined,
    auctionId: undefined,
  };

  if (!updateParcelInfo) {
    if (!existing) context.Parcel.set(parcel);
    return parcel;
  }

  const info = await context.effect(getParcelInfoEffect, {
    tokenId,
    blockNumber: 0n,
  });

  if (info) {
    const user = await getOrCreateUser(context, owner);
    context.User.set(user);
    parcel = {
      ...parcel,
      parcelId: info.parcelId,
      tokenId,
      owner_id: user.id,
      coordinateX: info.coordinateX,
      coordinateY: info.coordinateY,
      district: info.district,
      parcelHash: info.parcelAddress,
      fudBoost: info.boost[0] ?? BIGINT_ZERO,
      fomoBoost: info.boost[1] ?? BIGINT_ZERO,
      alphaBoost: info.boost[2] ?? BIGINT_ZERO,
      kekBoost: info.boost[3] ?? BIGINT_ZERO,
      size: info.size,
    };
  }

  context.Parcel.set(parcel);
  return parcel;
}

export async function getOrCreateParcelAtBlock(
  context: Context,
  tokenId: bigint,
  owner: string,
  blockNumber: bigint,
): Promise<ParcelEntity> {
  const id = tokenId.toString();
  const existing = await context.Parcel.get(id);
  let parcel: ParcelEntity = existing ?? {
    id,
    tokenId,
    parcelId: "",
    owner_id: toAddressId(owner),
    coordinateX: BIGINT_ZERO,
    coordinateY: BIGINT_ZERO,
    district: BIGINT_ZERO,
    parcelHash: "",
    fudBoost: BIGINT_ZERO,
    fomoBoost: BIGINT_ZERO,
    alphaBoost: BIGINT_ZERO,
    kekBoost: BIGINT_ZERO,
    size: BIGINT_ZERO,
    timesTraded: BIGINT_ZERO,
    historicalPrices: [],
    activeListing: undefined,
    auctionId: undefined,
  };

  const info = await context.effect(getParcelInfoEffect, {
    tokenId,
    blockNumber,
  });

  if (info) {
    const user = await getOrCreateUser(context, owner);
    context.User.set(user);
    parcel = {
      ...parcel,
      parcelId: info.parcelId,
      tokenId,
      owner_id: user.id,
      coordinateX: info.coordinateX,
      coordinateY: info.coordinateY,
      district: info.district,
      parcelHash: info.parcelAddress,
      fudBoost: info.boost[0] ?? BIGINT_ZERO,
      fomoBoost: info.boost[1] ?? BIGINT_ZERO,
      alphaBoost: info.boost[2] ?? BIGINT_ZERO,
      kekBoost: info.boost[3] ?? BIGINT_ZERO,
      size: info.size,
    };
  }

  context.Parcel.set(parcel);
  return parcel;
}
