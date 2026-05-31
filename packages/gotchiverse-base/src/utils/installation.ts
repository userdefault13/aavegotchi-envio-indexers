import type { HandlerContext } from "generated";
import type { Installation, InstallationType } from "generated";
import { BIGINT_ZERO } from "./constants";
import { getInstallationTypeEffect } from "./contractEffects";
import { installationInstanceId, toAddressId } from "./ids";

type InstallationContext = Pick<
  HandlerContext,
  "Installation" | "InstallationType" | "effect"
>;

function emptyInstallationType(id: string): InstallationType {
  return {
    id,
    amount: BIGINT_ZERO,
    deprecatedAt: BIGINT_ZERO,
    alchemicaCost: undefined,
    alchemicaType: undefined,
    amountPrerequisites: undefined,
    capacity: undefined,
    craftTime: undefined,
    deprecated: undefined,
    harvestRate: undefined,
    height: undefined,
    installationType: undefined,
    level: undefined,
    name: undefined,
    nextLevelId: undefined,
    prerequisites: undefined,
    spillRadius: undefined,
    spillRate: undefined,
    upgradeQueueBoost: undefined,
    uri: undefined,
    width: undefined,
  };
}

export async function getOrCreateInstallationType(
  context: InstallationContext,
  typeId: bigint,
  blockNumber: bigint,
): Promise<InstallationType> {
  const id = typeId.toString();
  const existing = await context.InstallationType.get(id);

  if (existing) {
    return existing;
  }

  let installationType = emptyInstallationType(id);
  installationType = await refreshInstallationType(
    context,
    installationType,
    blockNumber,
  );
  context.InstallationType.set(installationType);
  return installationType;
}

export async function refreshInstallationType(
  context: InstallationContext,
  installationType: InstallationType,
  blockNumber: bigint,
): Promise<InstallationType> {
  const onChain = await context.effect(getInstallationTypeEffect, {
    installationTypeId: BigInt(installationType.id),
    blockNumber,
  });

  if (!onChain) {
    return installationType;
  }

  return {
    ...installationType,
    width: onChain.width,
    height: onChain.height,
    installationType: onChain.installationType,
    level: onChain.level,
    alchemicaType: onChain.alchemicaType,
    spillRadius: onChain.spillRadius,
    spillRate: onChain.spillRate,
    upgradeQueueBoost: onChain.upgradeQueueBoost,
    craftTime: onChain.craftTime,
    nextLevelId: onChain.nextLevelId,
    deprecated: onChain.deprecated,
    alchemicaCost: onChain.alchemicaCost,
    harvestRate: onChain.harvestRate,
    capacity: onChain.capacity,
    prerequisites: onChain.prerequisites,
    amountPrerequisites: onChain.prerequisites.length,
    name: onChain.name,
  };
}

export async function getOrCreateInstallation(
  context: InstallationContext,
  installationId: bigint,
  realmId: bigint,
  x: bigint,
  y: bigint,
  owner: string,
): Promise<Installation> {
  const id = installationInstanceId(installationId, realmId, x, y);
  const existing = await context.Installation.get(id);

  if (existing) {
    return existing;
  }

  const installation: Installation = {
    id,
    typeId: installationId.toString(),
    x,
    y,
    equipped: true,
    parcel: realmId.toString(),
    owner: toAddressId(owner),
  };

  context.Installation.set(installation);
  return installation;
}
