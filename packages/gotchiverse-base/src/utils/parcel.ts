import type { HandlerContext } from "generated";
import type { Parcel, ParcelAccessRight } from "generated";
import { BIGINT_ZERO, ZERO_REMAINING_ALCHEMICA } from "./constants";
import { getParcelInfoEffect } from "./contractEffects";
import { parcelAccessRightId } from "./ids";

type ParcelContext = Pick<HandlerContext, "Parcel" | "ParcelAccessRight" | "effect">;

function emptyParcel(id: string, realmId: bigint): Parcel {
  return {
    id,
    equippedInstallations: [],
    equippedTiles: [],
    remainingAlchemica: [...ZERO_REMAINING_ALCHEMICA],
    surveyRound: 0,
    tokenId: realmId,
    alphaBoost: undefined,
    coordinateX: undefined,
    coordinateY: undefined,
    district: undefined,
    fomoBoost: undefined,
    fudBoost: undefined,
    kekBoost: undefined,
    lastChanneledAlchemica: undefined,
    lastClaimedAlchemica: undefined,
    owner: undefined,
    parcelHash: undefined,
    parcelId: undefined,
    size: undefined,
  };
}

export async function updateParcelInfo(
  context: ParcelContext,
  parcel: Parcel,
  blockNumber: bigint,
): Promise<Parcel> {
  const tokenId = BigInt(parcel.id);
  const parcelInfo = await context.effect(getParcelInfoEffect, {
    tokenId,
    blockNumber,
  });

  if (!parcelInfo) {
    return parcel;
  }

  return {
    ...parcel,
    tokenId,
    parcelId: parcelInfo.parcelId,
    coordinateX: parcelInfo.coordinateX,
    coordinateY: parcelInfo.coordinateY,
    district: parcelInfo.district,
    parcelHash: parcelInfo.parcelAddress,
    size: parcelInfo.size,
    fudBoost: parcelInfo.boost[0] ?? BIGINT_ZERO,
    fomoBoost: parcelInfo.boost[1] ?? BIGINT_ZERO,
    alphaBoost: parcelInfo.boost[2] ?? BIGINT_ZERO,
    kekBoost: parcelInfo.boost[3] ?? BIGINT_ZERO,
  };
}

export async function getOrCreateParcel(
  context: ParcelContext,
  realmId: bigint,
  blockNumber: bigint,
): Promise<Parcel> {
  const id = realmId.toString();
  const existing = await context.Parcel.get(id);

  if (existing) {
    return existing;
  }

  let parcel = emptyParcel(id, realmId);
  parcel = await updateParcelInfo(context, parcel, blockNumber);
  context.Parcel.set(parcel);
  return parcel;
}

export function addParcelInstallation(parcel: Parcel, installationId: bigint): Parcel {
  const id = installationId.toString();
  if (parcel.equippedInstallations.includes(id)) {
    return parcel;
  }

  return {
    ...parcel,
    equippedInstallations: [...parcel.equippedInstallations, id],
  };
}

export function removeParcelInstallation(
  parcel: Parcel,
  installationId: bigint,
): Parcel {
  const id = installationId.toString();
  return {
    ...parcel,
    equippedInstallations: parcel.equippedInstallations.filter(
      (item: string) => item !== id,
    ),
  };
}

export function addParcelTile(parcel: Parcel, tileId: bigint): Parcel {
  const id = tileId.toString();
  if (parcel.equippedTiles.includes(id)) {
    return parcel;
  }

  return {
    ...parcel,
    equippedTiles: [...parcel.equippedTiles, id],
  };
}

export function removeParcelTile(parcel: Parcel, tileId: bigint): Parcel {
  const id = tileId.toString();
  return {
    ...parcel,
    equippedTiles: parcel.equippedTiles.filter((item: string) => item !== id),
  };
}

export async function getOrCreateParcelAccessRight(
  context: ParcelContext,
  realmId: bigint,
  actionRight: bigint,
): Promise<ParcelAccessRight> {
  const id = parcelAccessRightId(realmId, actionRight);
  const existing = await context.ParcelAccessRight.get(id);

  if (existing) {
    return existing;
  }

  const entity: ParcelAccessRight = {
    id,
    parcel: realmId.toString(),
    accessRight: 0,
    actionRight: Number(actionRight),
    whitelistId: undefined,
  };

  context.ParcelAccessRight.set(entity);
  return entity;
}
