import type { HandlerContext } from "generated";
import type { Parcel, ParcelAccessRight } from "generated";
import { getOrCreateParcelAtBlock } from "../../utils/helpers/realm";
import { toAddressId } from "../../utils/ids";
import { parcelAccessRightId } from "./ids";

type ParcelContext = Pick<HandlerContext, "Parcel" | "ParcelAccessRight">;

export async function getOrCreateParcel(
  context: ParcelContext,
  realmId: bigint,
  blockNumber: bigint,
): Promise<Parcel> {
  const id = realmId.toString();
  const existing = await context.Parcel.get(id);
  const ownerId = existing?.owner_id ?? toAddressId("0x0000000000000000000000000000000000000000");

  return getOrCreateParcelAtBlock(
    context as Parameters<typeof getOrCreateParcelAtBlock>[0],
    realmId,
    ownerId,
    blockNumber,
  );
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
