import type { HandlerContext } from "generated";
import { fetchWhitelist } from "../contractEffects";
import type { BlockRef } from "../event";
import { getOrCreateUser } from "./aavegotchi";

export type Context = HandlerContext;

type WhitelistEntity = NonNullable<Awaited<ReturnType<Context["Whitelist"]["get"]>>>;

export async function createOrUpdateWhitelist(
  context: Context,
  whitelistId: bigint,
  block: BlockRef,
): Promise<WhitelistEntity | undefined> {
  const info = await fetchWhitelist(whitelistId, block.number);
  if (!info) return undefined;

  const id = whitelistId.toString();
  const existing = await context.Whitelist.get(id);
  const owner = await getOrCreateUser(context, info.owner);
  context.User.set(owner);

  const whitelist: WhitelistEntity = {
    id,
    name: info.name,
    owner_id: owner.id,
    ownerAddress: info.owner,
    members: info.addresses,
    maxBorrowLimit: existing?.maxBorrowLimit ?? 1,
  };
  context.Whitelist.set(whitelist);
  return whitelist;
}

export async function getOrCreateWhitelist(
  context: Context,
  whitelistId: bigint,
  block: BlockRef,
): Promise<WhitelistEntity | undefined> {
  const id = whitelistId.toString();
  const existing = await context.Whitelist.get(id);
  if (existing) return existing;
  return createOrUpdateWhitelist(context, whitelistId, block);
}
