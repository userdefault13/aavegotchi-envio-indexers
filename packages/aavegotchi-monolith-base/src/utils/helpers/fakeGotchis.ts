import BigNumber from "bignumber.js";
import type { HandlerContext } from "generated";
import { BIGINT_ZERO, ZERO_ADDRESS } from "../constants";
import { toAddressId } from "../ids";
import { getOrCreateUser } from "./aavegotchi";

export type Context = HandlerContext;

type FakeGotchiCardBalanceEntity = NonNullable<
  Awaited<ReturnType<Context["FakeGotchiCardBalance"]["get"]>>
>;
type FakeGotchiNFTTokenEntity = NonNullable<
  Awaited<ReturnType<Context["FakeGotchiNFTToken"]["get"]>>
>;

export function toCardBalanceValue(valueExact: bigint): BigNumber {
  return new BigNumber(valueExact.toString()).dividedBy(
    new BigNumber(10).pow(18),
  );
}

function cardBalanceId(
  token: bigint,
  accountId: string | null,
): string {
  return `${token}/${accountId ?? "totalSupply"}`;
}

export async function fetchFakeGotchiCardBalance(
  context: Context,
  token: bigint,
  accountId: string | null,
  contract: string,
): Promise<FakeGotchiCardBalanceEntity> {
  const id = cardBalanceId(token, accountId);
  const existing = await context.FakeGotchiCardBalance.get(id);
  if (existing) return existing;

  const balance: FakeGotchiCardBalanceEntity = {
    id,
    contract: contract.toLowerCase(),
    token,
    account_id: accountId ?? undefined,
    valueExact: BIGINT_ZERO,
    value: toCardBalanceValue(BIGINT_ZERO),
  };
  context.FakeGotchiCardBalance.set(balance);
  return balance;
}

export async function getFakeGotchiNFTToken(
  context: Context,
  contract: string,
  identifier: bigint,
): Promise<FakeGotchiNFTTokenEntity | undefined> {
  const id = `${contract.toLowerCase()}/${identifier.toString()}`;
  return context.FakeGotchiNFTToken.get(id);
}

export async function fetchFakeGotchiNFTToken(
  context: Context,
  contract: string,
  identifier: bigint,
): Promise<FakeGotchiNFTTokenEntity> {
  const id = `${contract.toLowerCase()}/${identifier.toString()}`;
  const existing = await context.FakeGotchiNFTToken.get(id);
  if (existing) return existing;

  const zeroUser = await getOrCreateUser(context, ZERO_ADDRESS);
  context.User.set(zeroUser);

  const token: FakeGotchiNFTTokenEntity = {
    id,
    contract: contract.toLowerCase(),
    identifier,
    owner_id: zeroUser.id,
    approval_id: zeroUser.id,
    uri: "",
    artist_id: undefined,
    artistName: undefined,
    description: undefined,
    editions: undefined,
    externalLink: undefined,
    fileHash: undefined,
    metadata_id: undefined,
    name: undefined,
    publisher_id: undefined,
    publisherName: undefined,
    thumbnailHash: undefined,
    thumbnailType: undefined,
  };
  context.FakeGotchiNFTToken.set(token);
  return token;
}

export function isMint(from: string): boolean {
  return toAddressId(from) === ZERO_ADDRESS;
}

export function isBurn(to: string): boolean {
  const normalized = toAddressId(to);
  return normalized === ZERO_ADDRESS || normalized === "0x000000000000000000000000000000000000dead";
}

export function isTransfer(from: string, to: string): boolean {
  return !isMint(from) && !isBurn(to);
}

export async function getOrCreateFakeGotchiStatistic(
  context: Context,
  metadataId: string,
): Promise<NonNullable<Awaited<ReturnType<Context["FakeGotchiStatistic"]["get"]>>>> {
  const existing = await context.FakeGotchiStatistic.get(metadataId);
  if (existing) return existing;
  const stats = {
    id: metadataId,
    metadata_id: metadataId,
    amountHolder: 0,
    burned: 0,
    totalSupply: 0,
    tokenIds: [] as bigint[],
  };
  context.FakeGotchiStatistic.set(stats);
  return stats;
}

export async function getFakeGotchiHolder(
  context: Context,
  holderAddress: string,
  metadataId: string,
): Promise<NonNullable<Awaited<ReturnType<Context["FakeGotchiHolder"]["get"]>>>> {
  const holderId = toAddressId(holderAddress);
  const id = `${metadataId}-${holderId}`;
  const existing = await context.FakeGotchiHolder.get(id);
  if (existing) return existing;
  const holder = {
    id,
    fakeGotchiStats_id: metadataId,
    holder_id: holderId,
    amount: 0,
  };
  context.FakeGotchiHolder.set(holder);
  return holder;
}
