import {
  AarcadeCartridgeDiamond,
  Cartridge,
  CartridgeHero,
  CartridgeCheckpoint,
  PocketBalance,
  CartridgeWearable,
} from "generated";

AarcadeCartridgeDiamond.CartridgeMinted.handler(async ({ event, context }) => {
  const id = event.params.cartridgeId.toString();
  context.Cartridge.set({
    id,
    gameId: event.params.gameId,
    owner: event.params.player.toLowerCase(),
    originConsole: event.params.originConsole.toLowerCase(),
    rulesVersion: 1,
    rulesUri: event.params.rulesUri,
    rulesHash: event.params.rulesHash,
    lineAPaid: false,
    checkpointNonce: 0,
    checkpointHash: "0x0",
    checkpointUri: "",
    activeHeroId: undefined,
    mintedAt: BigInt(event.block.timestamp),
    updatedAt: BigInt(event.block.timestamp),
  });
});

AarcadeCartridgeDiamond.LineAPaid.handler(async ({ event, context }) => {
  const id = event.params.cartridgeId.toString();
  const row = await context.Cartridge.get(id);
  if (!row) return;
  context.Cartridge.set({
    ...row,
    lineAPaid: true,
    updatedAt: BigInt(event.block.timestamp),
  });
});

AarcadeCartridgeDiamond.CAavegotchiBound.handler(async ({ event, context }) => {
  const cartridgeId = event.params.cartridgeId.toString();
  const heroEntityId = `${cartridgeId}-${event.params.heroId}`;
  context.CartridgeHero.set({
    id: heroEntityId,
    cartridge_id: cartridgeId,
    heroId: event.params.heroId,
    bindType: event.params.bindType.toString(),
    sourceTokenId: event.params.sourceTokenId,
    traits: [50, 50, 50, 50, 50, 50],
    level: 1,
    kinship: 0,
    experience: 0,
    equippedWearables: [],
  });
  const row = await context.Cartridge.get(cartridgeId);
  if (row) {
    context.Cartridge.set({
      ...row,
      activeHeroId: event.params.heroId,
      updatedAt: BigInt(event.block.timestamp),
    });
  }
});

AarcadeCartridgeDiamond.CheckpointSaved.handler(async ({ event, context }) => {
  const cartridgeId = event.params.cartridgeId.toString();
  const cpId = `${cartridgeId}-${event.params.nonce}`;
  context.CartridgeCheckpoint.set({
    id: cpId,
    cartridge_id: cartridgeId,
    nonce: Number(event.params.nonce),
    stateHash: event.params.stateHash,
    stateUri: event.params.stateUri,
    savedAt: BigInt(event.block.timestamp),
  });
  const row = await context.Cartridge.get(cartridgeId);
  if (row) {
    context.Cartridge.set({
      ...row,
      checkpointNonce: Number(event.params.nonce),
      checkpointHash: event.params.stateHash,
      checkpointUri: event.params.stateUri,
      updatedAt: BigInt(event.block.timestamp),
    });
  }
});

AarcadeCartridgeDiamond.PocketCredited.handler(async ({ event, context }) => {
  const cartridgeId = event.params.cartridgeId.toString();
  const currency = event.params.currency;
  const pocketId = `${cartridgeId}-${currency}`;
  const existing = await context.PocketBalance.get(pocketId);
  const balance = (existing?.balance || 0n) + event.params.amount;
  context.PocketBalance.set({
    id: pocketId,
    cartridge_id: cartridgeId,
    currency,
    balance,
  });
});

AarcadeCartridgeDiamond.PocketSpent.handler(async ({ event, context }) => {
  const cartridgeId = event.params.cartridgeId.toString();
  const currency = event.params.currency;
  const pocketId = `${cartridgeId}-${currency}`;
  const existing = await context.PocketBalance.get(pocketId);
  const balance = (existing?.balance || 0n) - event.params.amount;
  context.PocketBalance.set({
    id: pocketId,
    cartridge_id: cartridgeId,
    currency,
    balance: balance < 0n ? 0n : balance,
  });
});

AarcadeCartridgeDiamond.WearableMinted.handler(async ({ event, context }) => {
  const cartridgeId = event.params.cartridgeId.toString();
  context.CartridgeWearable.set({
    id: `${cartridgeId}-${event.params.cWearableId}`,
    cartridge_id: cartridgeId,
    cWearableId: event.params.cWearableId,
    itemTypeId: Number(event.params.itemTypeId),
    slotIndex: 0,
    equipped: false,
  });
});

AarcadeCartridgeDiamond.WearableEquipped.handler(async ({ event, context }) => {
  const id = `${event.params.cartridgeId}-${event.params.cWearableId}`;
  const row = await context.CartridgeWearable.get(id);
  if (!row) return;
  context.CartridgeWearable.set({
    ...row,
    slotIndex: Number(event.params.slotIndex),
    equipped: true,
  });
});

AarcadeCartridgeDiamond.WearableUnequipped.handler(async ({ event, context }) => {
  const id = `${event.params.cartridgeId}-${event.params.cWearableId}`;
  const row = await context.CartridgeWearable.get(id);
  if (!row) return;
  context.CartridgeWearable.set({
    ...row,
    equipped: false,
  });
});

AarcadeCartridgeDiamond.Transfer.handler(async ({ event, context }) => {
  if (event.params.to === "0x0000000000000000000000000000000000000000") return;
  const id = event.params.tokenId.toString();
  const row = await context.Cartridge.get(id);
  if (!row) return;
  context.Cartridge.set({
    ...row,
    owner: event.params.to.toLowerCase(),
    updatedAt: BigInt(event.block.timestamp),
  });
});
