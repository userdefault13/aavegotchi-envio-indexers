import type { HandlerContext } from "generated";
import { ZERO_ADDRESS } from "../constants";
import { toAddressId } from "../ids";

export type Context = HandlerContext;

type ItemTypeOwnershipEntity = NonNullable<
  Awaited<ReturnType<Context["ItemTypeOwnership"]["get"]>>
>;

export async function updateOwnership(
  context: Context,
  itemTypeId: string,
  owner: string,
  amount: bigint,
  timestamp: bigint,
): Promise<void> {
  const ownerAddress = toAddressId(owner);
  const ownershipId = `${itemTypeId}-${ownerAddress}`;
  const existing = await context.ItemTypeOwnership.get(ownershipId);

  let balance = (existing?.balance ?? 0n) + amount;
  if (balance <= 0n) {
    if (existing) {
      context.ItemTypeOwnership.deleteUnsafe(ownershipId);
    }
    return;
  }

  const ownership: ItemTypeOwnershipEntity = {
    id: ownershipId,
    itemType_id: itemTypeId,
    owner: ownerAddress,
    balance,
    lastUpdated: timestamp,
  };
  context.ItemTypeOwnership.set(ownership);
}

export function isZeroAddress(address: string): boolean {
  return toAddressId(address) === ZERO_ADDRESS;
}
