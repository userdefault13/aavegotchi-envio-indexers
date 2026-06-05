import {
  InstallationDiamond,
  RealmDiamond,
  TileDiamond,
} from "generated";
import { BIGINT_ONE, ZERO_ADDRESS } from "./utils/constants";
import {
  getOrCreateInstallation,
  getOrCreateInstallationType,
  refreshInstallationType,
} from "./utils/installation";
import { toAddressId } from "./utils/ids";
import {
  addParcelInstallation,
  addParcelTile,
  getOrCreateParcel,
  getOrCreateParcelAccessRight,
  removeParcelInstallation,
  removeParcelTile,
} from "./utils/parcel";
import { getOrCreateTile, getOrCreateTileType } from "./utils/tile";

import { blockNumberFrom, blockTimestampFrom } from "./utils/block";

RealmDiamond.MintParcel.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const parcel = await getOrCreateParcel(
    context,
    event.params._tokenId,
    blockNumber,
  );

  context.Parcel.set({
    ...parcel,
    owner: toAddressId(event.params._owner),
  });
});

RealmDiamond.Transfer.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const parcel = await getOrCreateParcel(
    context,
    event.params._tokenId,
    blockNumber,
  );

  context.Parcel.set({
    ...parcel,
    owner: toAddressId(event.params._to),
  });
});

RealmDiamond.SurveyParcel.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const parcel = await getOrCreateParcel(
    context,
    event.params._tokenId,
    blockNumber,
  );

  const alchemica = [...parcel.remainingAlchemica];
  for (let i = 0; i < event.params._alchemicas.length; i++) {
    alchemica[i] = alchemica[i] + event.params._alchemicas[i];
  }

  context.Parcel.set({
    ...parcel,
    surveyRound: parcel.surveyRound + 1,
    remainingAlchemica: alchemica,
  });
});

RealmDiamond.AlchemicaClaimed.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const parcel = await getOrCreateParcel(
    context,
    event.params._realmId,
    blockNumber,
  );

  const alchemica = [...parcel.remainingAlchemica];
  const alchemicaType = Number(event.params._alchemicaType);
  alchemica[alchemicaType] =
    alchemica[alchemicaType] - event.params._amount;

  context.Parcel.set({
    ...parcel,
    lastClaimedAlchemica: blockTimestampFrom(event.block),
    remainingAlchemica: alchemica,
  });
});

RealmDiamond.EquipInstallation.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  let parcel = await getOrCreateParcel(
    context,
    event.params._realmId,
    blockNumber,
  );
  parcel = addParcelInstallation(parcel, event.params._installationId);
  context.Parcel.set(parcel);

  const installation = await getOrCreateInstallation(
    context,
    event.params._installationId,
    event.params._realmId,
    event.params._x,
    event.params._y,
    event.transaction.from ?? ZERO_ADDRESS,
  );

  context.Installation.set({
    ...installation,
    equipped: true,
  });
});

RealmDiamond.UnequipInstallation.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  let parcel = await getOrCreateParcel(
    context,
    event.params._realmId,
    blockNumber,
  );
  parcel = removeParcelInstallation(parcel, event.params._installationId);
  context.Parcel.set(parcel);

  const installation = await getOrCreateInstallation(
    context,
    event.params._installationId,
    event.params._realmId,
    event.params._x,
    event.params._y,
    event.transaction.from ?? ZERO_ADDRESS,
  );

  context.Installation.set({
    ...installation,
    equipped: false,
  });
});

RealmDiamond.InstallationUpgraded.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);

  const nextType = await getOrCreateInstallationType(
    context,
    event.params._nextInstallationId,
    blockNumber,
  );
  context.InstallationType.set(nextType);

  let parcel = await getOrCreateParcel(
    context,
    event.params._realmId,
    blockNumber,
  );
  parcel = removeParcelInstallation(parcel, event.params._prevInstallationId);
  parcel = addParcelInstallation(parcel, event.params._nextInstallationId);
  context.Parcel.set(parcel);

  const prevInstallation = await getOrCreateInstallation(
    context,
    event.params._prevInstallationId,
    event.params._realmId,
    event.params._coordinateX,
    event.params._coordinateY,
    event.transaction.from ?? ZERO_ADDRESS,
  );
  context.Installation.set({
    ...prevInstallation,
    equipped: false,
  });

  const nextInstallation = await getOrCreateInstallation(
    context,
    event.params._nextInstallationId,
    event.params._realmId,
    event.params._coordinateX,
    event.params._coordinateY,
    event.transaction.from ?? ZERO_ADDRESS,
  );
  context.Installation.set({
    ...nextInstallation,
    equipped: true,
  });
});

RealmDiamond.EquipTile.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);

  const tileType = await getOrCreateTileType(
    context,
    event.params._tileId,
    blockNumber,
  );
  context.TileType.set(tileType);

  let parcel = await getOrCreateParcel(
    context,
    event.params._realmId,
    blockNumber,
  );
  parcel = addParcelTile(parcel, event.params._tileId);
  context.Parcel.set(parcel);

  const tile = await getOrCreateTile(
    context,
    parcel.id,
    tileType,
    event.params._x,
    event.params._y,
  );
  context.Tile.set({
    ...tile,
    equipped: true,
  });
});

RealmDiamond.UnequipTile.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);

  const tileType = await getOrCreateTileType(
    context,
    event.params._tileId,
    blockNumber,
  );
  context.TileType.set(tileType);

  let parcel = await getOrCreateParcel(
    context,
    event.params._realmId,
    blockNumber,
  );
  parcel = removeParcelTile(parcel, event.params._tileId);
  context.Parcel.set(parcel);

  const tile = await getOrCreateTile(
    context,
    parcel.id,
    tileType,
    event.params._x,
    event.params._y,
  );
  context.Tile.set({
    ...tile,
    equipped: false,
  });
});

RealmDiamond.ParcelAccessRightSet.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  await getOrCreateParcel(context, event.params._realmId, blockNumber);

  const entity = await getOrCreateParcelAccessRight(
    context,
    event.params._realmId,
    event.params._actionRight,
  );

  context.ParcelAccessRight.set({
    ...entity,
    accessRight: Number(event.params._accessRight),
  });
});

RealmDiamond.ParcelWhitelistSet.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  await getOrCreateParcel(context, event.params._realmId, blockNumber);

  const entity = await getOrCreateParcelAccessRight(
    context,
    event.params._realmId,
    event.params._actionRight,
  );

  context.ParcelAccessRight.set({
    ...entity,
    accessRight: 2,
    whitelistId: Number(event.params._whitelistId),
  });
});

// --- InstallationDiamond ---

InstallationDiamond.MintInstallation.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params._installationType,
    blockNumber,
  );

  context.InstallationType.set({
    ...installationType,
    amount: installationType.amount + BIGINT_ONE,
  });
});

InstallationDiamond.MintInstallations.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params._installationId,
    blockNumber,
  );
  const amount = BigInt(event.params._amount);

  context.InstallationType.set({
    ...installationType,
    amount: installationType.amount + amount,
  });
});

InstallationDiamond.AddInstallationType.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params._installationId,
    blockNumber,
  );
  context.InstallationType.set(installationType);
});

InstallationDiamond.EditInstallationType.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params._installationId,
    blockNumber,
  );

  context.InstallationType.set(
    await refreshInstallationType(context, installationType, blockNumber),
  );
});

InstallationDiamond.DeprecateInstallation.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params._installationId,
    blockNumber,
  );

  context.InstallationType.set({
    ...installationType,
    deprecatedAt: blockTimestampFrom(event.block),
    deprecated: true,
  });
});

InstallationDiamond.EditDeprecateTime.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params._installationId,
    blockNumber,
  );

  context.InstallationType.set({
    ...installationType,
    deprecatedAt: event.params._newDeprecatetime,
  });
});

InstallationDiamond.UpgradeInitiated.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params.installationId,
    blockNumber,
  );
  context.InstallationType.set(installationType);
});

InstallationDiamond.URI.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const installationType = await getOrCreateInstallationType(
    context,
    event.params._tokenId,
    blockNumber,
  );

  context.InstallationType.set({
    ...installationType,
    uri: event.params._value,
  });
});

// --- TileDiamond ---

TileDiamond.MintTile.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const tileType = await getOrCreateTileType(
    context,
    event.params._tileType,
    blockNumber,
  );

  context.TileType.set({
    ...tileType,
    amount: tileType.amount + BIGINT_ONE,
  });
});

TileDiamond.MintTiles.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const tileType = await getOrCreateTileType(
    context,
    event.params._tileId,
    blockNumber,
  );
  const amount = BigInt(event.params._amount);

  context.TileType.set({
    ...tileType,
    amount: tileType.amount + amount,
  });
});

TileDiamond.EditTileType.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const tileType = await getOrCreateTileType(
    context,
    event.params._tileId,
    blockNumber,
  );

  const tileData = event.params._1;

  context.TileType.set({
    ...tileType,
    width: Number(tileData[0]),
    height: Number(tileData[1]),
    deprecated: tileData[2],
    tileType: Number(tileData[3]),
    craftTime: tileData[4],
    alchemicaCost: [...tileData[5]],
    name: tileData[6],
  });
});

TileDiamond.EditDeprecateTime.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const tileType = await getOrCreateTileType(
    context,
    event.params._tileId,
    blockNumber,
  );

  context.TileType.set({
    ...tileType,
    deprecatedAt: event.params._newDeprecatetime,
  });
});

TileDiamond.URI.handler(async ({ event, context }) => {
  const blockNumber = blockNumberFrom(event.block);
  const tileType = await getOrCreateTileType(
    context,
    event.params._tokenId,
    blockNumber,
  );

  context.TileType.set({
    ...tileType,
    uri: event.params._value,
  });
});
