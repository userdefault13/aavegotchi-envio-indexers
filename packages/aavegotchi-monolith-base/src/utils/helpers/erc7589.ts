import type { HandlerContext } from "generated";
import { joinId } from "../ids";
import { getOrCreateUser } from "./aavegotchi";

export type Context = HandlerContext;

type RolesRegistryEntity = NonNullable<
  Awaited<ReturnType<Context["RolesRegistry"]["get"]>>
>;
type RoleEntity = NonNullable<Awaited<ReturnType<Context["Role"]["get"]>>>;
type RoleAssignmentEntity = NonNullable<
  Awaited<ReturnType<Context["RoleAssignment"]["get"]>>
>;
type TokenCommitmentEntity = NonNullable<
  Awaited<ReturnType<Context["TokenCommitment"]["get"]>>
>;
type UserEntity = NonNullable<Awaited<ReturnType<Context["User"]["get"]>>>;

export function generateTokenCommitmentId(
  rolesRegistryAddress: string,
  depositId: bigint,
): string {
  return `${rolesRegistryAddress.toLowerCase()}-${depositId}`;
}

export function generateRoleId(
  rolesRegistryId: string,
  roleHash: string,
  depositId: string,
): string {
  return `${rolesRegistryId}-${depositId}-${roleHash}`;
}

export function generateRoleAssignmentId(
  rolesRegistryId: string,
  granteeId: string,
  roleHash: string,
  tokenCommitmentId: string,
): string {
  return `${rolesRegistryId}-${tokenCommitmentId}-${granteeId}-${roleHash}`;
}

export async function findOrCreateRolesRegistry(
  context: Context,
  rolesRegistryAddress: string,
): Promise<RolesRegistryEntity> {
  const id = rolesRegistryAddress.toLowerCase();
  const existing = await context.RolesRegistry.get(id);
  if (existing) return existing;
  const registry: RolesRegistryEntity = { id };
  context.RolesRegistry.set(registry);
  return registry;
}

export async function findOrCreateRole(
  context: Context,
  rolesRegistry: RolesRegistryEntity,
  tokenAddress: string,
  tokenId: bigint,
  roleHash: string,
  tokenCommitmentId: string,
): Promise<RoleEntity> {
  const roleId = generateRoleId(rolesRegistry.id, roleHash, tokenCommitmentId);
  const existing = await context.Role.get(roleId);
  if (existing) return existing;
  const role: RoleEntity = {
    id: roleId,
    roleHash,
    tokenAddress: tokenAddress.toLowerCase(),
    tokenId,
    rolesRegistry_id: rolesRegistry.id,
    tokenCommitment_id: tokenCommitmentId,
  };
  context.Role.set(role);
  return role;
}

export async function upsertRoleAssignment(
  context: Context,
  roleHash: string,
  rolesRegistryAddress: string,
  grantor: UserEntity,
  grantee: UserEntity,
  tokenAddress: string,
  tokenId: bigint,
  timestamp: bigint,
  expirationDate: bigint,
  data: string,
  revocable: boolean,
  tokenCommitmentId: string,
): Promise<RoleAssignmentEntity> {
  const rolesRegistry = await findOrCreateRolesRegistry(
    context,
    rolesRegistryAddress,
  );
  const role = await findOrCreateRole(
    context,
    rolesRegistry,
    tokenAddress,
    tokenId,
    roleHash,
    tokenCommitmentId,
  );
  const roleAssignmentId = generateRoleAssignmentId(
    rolesRegistry.id,
    grantee.id,
    roleHash,
    tokenCommitmentId,
  );

  const existing = await context.RoleAssignment.get(roleAssignmentId);
  const roleAssignment: RoleAssignmentEntity = {
    id: roleAssignmentId,
    role_id: role.id,
    tokenAddress: tokenAddress.toLowerCase(),
    tokenId,
    grantor_id: grantor.id,
    grantee_id: grantee.id,
    createdAt: existing?.createdAt ?? timestamp,
    expirationDate,
    revocable,
    data,
    updatedAt: timestamp,
    tokenCommitment_id: tokenCommitmentId,
  };
  context.RoleAssignment.set(roleAssignment);
  return roleAssignment;
}

export async function updateRoleAssignmentExpiration(
  context: Context,
  roleAssignmentId: string,
  blockTimestamp: bigint,
): Promise<void> {
  const roleAssignment = await context.RoleAssignment.get(roleAssignmentId);
  if (!roleAssignment) return;
  if (blockTimestamp > roleAssignment.expirationDate) return;
  context.RoleAssignment.set({
    ...roleAssignment,
    expirationDate: blockTimestamp,
    updatedAt: blockTimestamp,
  });
}

export async function getTokenCommitment(
  context: Context,
  rolesRegistryAddress: string,
  depositId: bigint,
): Promise<TokenCommitmentEntity | undefined> {
  return context.TokenCommitment.get(
    generateTokenCommitmentId(rolesRegistryAddress, depositId),
  );
}

export async function createTokenCommitment(
  context: Context,
  rolesRegistryAddress: string,
  depositId: bigint,
  grantor: UserEntity,
  tokenAddress: string,
  tokenId: bigint,
  amount: bigint,
): Promise<TokenCommitmentEntity> {
  const rolesRegistry = await findOrCreateRolesRegistry(
    context,
    rolesRegistryAddress,
  );
  const id = generateTokenCommitmentId(rolesRegistryAddress, depositId);
  const commitment: TokenCommitmentEntity = {
    id,
    rolesRegistry_id: rolesRegistry.id,
    depositId,
    grantor_id: grantor.id,
    tokenAddress: tokenAddress.toLowerCase(),
    tokenId,
    amount,
    usedBalance: 0n,
    isReleased: false,
  };
  context.TokenCommitment.set(commitment);
  return commitment;
}

export { joinId };
