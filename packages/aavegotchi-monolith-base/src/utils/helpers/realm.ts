import type { HandlerContext } from "generated";
import { BIGINT_ZERO } from "../constants";
import { fetchParcelInfo } from "../contractEffects";
import { toAddressId } from "../ids";
import { getOrCreateUser } from "./aavegotchi";

const ZERO_REMAINING_ALCHEMICA: readonly [bigint, bigint, bigint, bigint] = [
  0n,
  0n,
  0n,
  0n,
];

export type Context = HandlerContext;
type ParcelEntity = NonNullable<Awaited<ReturnType<Context["Parcel"]["get"]>>>;

function emptyParcel(
  id: string,
  tokenId: bigint,
  owner: string,
): ParcelEntity {
  return {
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
    equippedInstallations: [],
    equippedTiles: [],
    remainingAlchemica: [...ZERO_REMAINING_ALCHEMICA],
    surveyRound: 0,
    lastChanneledAlchemica: undefined,
    lastClaimedAlchemica: undefined,
  };
}

function hasParcelMetadata(parcel: ParcelEntity): boolean {
  return parcel.parcelId !== "";
}

function applyParcelInfo(
  parcel: ParcelEntity,
  tokenId: bigint,
  ownerId: string,
  info: NonNullable<Awaited<ReturnType<typeof fetchParcelInfo>>>,
): ParcelEntity {
  return {
    ...parcel,
    parcelId: info.parcelId,
    tokenId,
    owner_id: ownerId,
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

export async function getOrCreateParcel(
  context: Context,
  tokenId: bigint,
  owner: string,
  updateParcelInfo = true,
): Promise<ParcelEntity> {
  const id = tokenId.toString();
  const existing = await context.Parcel.get(id);
  let parcel = existing ?? emptyParcel(id, tokenId, owner);

  if (!updateParcelInfo) {
    if (!existing) context.Parcel.set(parcel);
    return parcel;
  }

  if (existing && hasParcelMetadata(existing)) {
    return existing;
  }

  const info = await fetchParcelInfo(tokenId, 0n);
  if (info) {
    const user = await getOrCreateUser(context, owner);
    context.User.set(user);
    parcel = applyParcelInfo(parcel, tokenId, user.id, info);
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
  const user = await getOrCreateUser(context, owner);
  context.User.set(user);

  if (existing && hasParcelMetadata(existing)) {
    if (existing.owner_id !== user.id) {
      const updated = { ...existing, owner_id: user.id };
      context.Parcel.set(updated);
      return updated;
    }
    return existing;
  }

  let parcel = existing ?? emptyParcel(id, tokenId, owner);
  const info = await fetchParcelInfo(tokenId, blockNumber);

  if (info) {
    parcel = applyParcelInfo(parcel, tokenId, user.id, info);
  } else if (!existing) {
    parcel = { ...parcel, owner_id: user.id };
  }

  context.Parcel.set(parcel);
  return parcel;
}
