import { AavegotchiDiamond } from "generated";
import { STATUS_AAVEGOTCHI } from "../utils/constants";
import { blockRef } from "../utils/event";
import {
  getOrCreateAavegotchi,
  getOrCreateUser,
} from "../utils/helpers/aavegotchi";
import {
  applyEquippedWearablesFromEvent,
  createOrUpdateWearablesConfig,
  handleWearableEquipping,
  handleWearableReplacing,
  handleWearableUnequipping,
  updateAavegotchiWearables,
} from "../utils/helpers/wearables";
import {
  getTokenCommitment,
} from "../utils/helpers/erc7589";
import { toAddressId } from "../utils/ids";
import { refreshAavegotchiSvgFromChain } from "../utils/svg/helpers";

AavegotchiDiamond.EquipWearables.handler(async ({ event, context }) => {
  const block = blockRef(event);
  let gotchi = await getOrCreateAavegotchi(
    context,
    event.params._tokenId.toString(),
    block,
  );
  if (!gotchi) return;

  gotchi = applyEquippedWearablesFromEvent(gotchi, event.params._newWearables);
  gotchi = await updateAavegotchiWearables(context, gotchi, block);

  if (gotchi.status !== STATUS_AAVEGOTCHI) return;

  const oldWearables = event.params._oldWearables;
  const newWearables = event.params._newWearables;
  const owner = await getOrCreateUser(context, gotchi.owner_id ?? "");
  context.User.set(owner);

  for (let i = 0; i < oldWearables.length; i++) {
    const oldWearableId = Number(oldWearables[i]);
    const newWearableId = Number(newWearables[i]);

    if (oldWearableId !== 0 && newWearableId === 0) {
      await handleWearableUnequipping(
        context,
        gotchi.id,
        i,
        oldWearableId,
        block.timestamp,
      );
    } else if (oldWearableId === 0 && newWearableId !== 0) {
      await handleWearableEquipping(
        context,
        gotchi.id,
        i,
        newWearableId,
        owner,
        block.timestamp,
      );
    } else if (
      oldWearableId !== 0 &&
      newWearableId !== 0 &&
      oldWearableId !== newWearableId
    ) {
      await handleWearableReplacing(
        context,
        gotchi.id,
        i,
        oldWearableId,
        newWearableId,
        owner,
        block.timestamp,
      );
    }
  }

  gotchi = await refreshAavegotchiSvgFromChain(
    gotchi,
    event.params._tokenId,
    block.number,
  );
  context.Aavegotchi.set(gotchi);
});

AavegotchiDiamond.EquipDelegatedWearables.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const gotchi = await getOrCreateAavegotchi(
    context,
    event.params._tokenId.toString(),
    block,
  );
  if (!gotchi || gotchi.status !== STATUS_AAVEGOTCHI) return;

  const oldDepositIds = event.params._oldCommitmentIds;
  const newDepositIds = event.params._newCommitmentIds;
  const registryAddress = toAddressId(event.srcAddress);

  for (let i = 0; i < oldDepositIds.length; i++) {
    if (oldDepositIds[i] === newDepositIds[i]) continue;

    if (oldDepositIds[i] !== 0n) {
      const oldCommitment = await getTokenCommitment(
        context,
        registryAddress,
        oldDepositIds[i],
      );
      if (oldCommitment) {
        context.TokenCommitment.set({
          ...oldCommitment,
          usedBalance: oldCommitment.usedBalance - 1n,
        });
        await handleWearableUnequipping(
          context,
          gotchi.id,
          i,
          Number(oldCommitment.tokenId),
          block.timestamp,
          true,
        );
      }
    }

    if (newDepositIds[i] !== 0n) {
      const newCommitment = await getTokenCommitment(
        context,
        registryAddress,
        newDepositIds[i],
      );
      if (newCommitment) {
        context.TokenCommitment.set({
          ...newCommitment,
          usedBalance: newCommitment.usedBalance + 1n,
        });
        const grantor = await getOrCreateUser(
          context,
          newCommitment.grantor_id,
        );
        context.User.set(grantor);
        await handleWearableEquipping(
          context,
          gotchi.id,
          i,
          Number(newCommitment.tokenId),
          grantor,
          block.timestamp,
          true,
          newDepositIds[i],
        );
      }
    }
  }

  const withDelegated = {
    ...gotchi,
    equippedDelegatedWearables: newDepositIds.map((id: bigint) => Number(id)),
  };
  context.Aavegotchi.set(
    await refreshAavegotchiSvgFromChain(
      withDelegated,
      event.params._tokenId,
      block.number,
    ),
  );
});

AavegotchiDiamond.WearablesConfigCreated.handler(async ({ event, context }) => {
  await createOrUpdateWearablesConfig(
    context,
    event.params.owner,
    event.params.tokenId,
    Number(event.params.wearablesConfigId),
    blockRef(event),
  );
});

AavegotchiDiamond.WearablesConfigUpdated.handler(async ({ event, context }) => {
  await createOrUpdateWearablesConfig(
    context,
    event.params.owner,
    event.params.tokenId,
    Number(event.params.wearablesConfigId),
    blockRef(event),
  );
});
