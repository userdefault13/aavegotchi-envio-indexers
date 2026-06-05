import { AavegotchiDiamond } from "generated";
import { blockRef } from "../utils/event";
import { getOrCreateUser } from "../utils/helpers/aavegotchi";
import {
  createTokenCommitment,
  getTokenCommitment,
  updateRoleAssignmentExpiration,
  upsertRoleAssignment,
} from "../utils/helpers/erc7589";
import { toAddressId } from "../utils/ids";

AavegotchiDiamond.TokensCommitted.handler(async ({ event, context }) => {
  const grantor = await getOrCreateUser(context, event.params._grantor);
  context.User.set(grantor);
  await createTokenCommitment(
    context,
    toAddressId(event.srcAddress),
    event.params._commitmentId,
    grantor,
    event.params._tokenAddress,
    event.params._tokenId,
    event.params._tokenAmount,
  );
});

AavegotchiDiamond.TokensReleased.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const registryAddress = toAddressId(event.srcAddress);
  const commitment = await getTokenCommitment(
    context,
    registryAddress,
    event.params._commitmentId,
  );
  if (!commitment) return;

  context.TokenCommitment.set({ ...commitment, isReleased: true });
});

AavegotchiDiamond.RoleGranted.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const registryAddress = toAddressId(event.srcAddress);
  const commitment = await getTokenCommitment(
    context,
    registryAddress,
    event.params._commitmentId,
  );
  if (!commitment) return;

  const grantor = await getOrCreateUser(context, commitment.grantor_id);
  const grantee = await getOrCreateUser(context, event.params._grantee);
  context.User.set(grantor);
  context.User.set(grantee);

  await upsertRoleAssignment(
    context,
    event.params._role,
    registryAddress,
    grantor,
    grantee,
    commitment.tokenAddress,
    commitment.tokenId,
    block.timestamp,
    BigInt(event.params._expirationDate),
    event.params._data,
    event.params._revocable,
    commitment.id,
  );
});

AavegotchiDiamond.RoleRevoked.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const registryAddress = toAddressId(event.srcAddress);
  const commitment = await getTokenCommitment(
    context,
    registryAddress,
    event.params._commitmentId,
  );
  if (!commitment) return;

  const grantee = await getOrCreateUser(context, event.params._grantee);
  context.User.set(grantee);

  const roleAssignmentId = `${registryAddress}-${commitment.id}-${grantee.id}-${event.params._role}`;
  await updateRoleAssignmentExpiration(
    context,
    roleAssignmentId,
    block.timestamp,
  );
});
