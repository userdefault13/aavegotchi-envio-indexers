import type { HandlerContext } from "generated";
import { BIGINT_ONE, BIGINT_ZERO } from "../constants";

export type Context = HandlerContext;

type UserEntity = NonNullable<Awaited<ReturnType<Context["User"]["get"]>>>;
type StatisticEntity = NonNullable<
  Awaited<ReturnType<Context["Statistic"]["get"]>>
>;

function parseJsonRecord(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      result[key] = Number(entry);
    }
    return result;
  } catch {
    return {};
  }
}

function stringifyJsonRecord(record: Record<string, number>): string {
  return JSON.stringify(record);
}

export function updateAccountStatsFrom(
  account: UserEntity,
  metadataId: string,
): UserEntity {
  const current = parseJsonRecord(account.currentUniqueFakeGotchisOwnedArray);
  const existing = current[metadataId] ?? 0;
  const newAmount = Math.max(existing - 1, 0);
  if (newAmount === 0 && existing > 0) {
    account = {
      ...account,
      currentUniqueFakeGotchisOwned: account.currentUniqueFakeGotchisOwned - 1,
    };
  }
  current[metadataId] = newAmount;
  return {
    ...account,
    currentUniqueFakeGotchisOwnedArray: stringifyJsonRecord(current),
  };
}

export function updateAccountStatsTo(
  account: UserEntity,
  metadataId: string,
): UserEntity {
  const total = parseJsonRecord(account.totalUniqueFakeGotchisOwnedArray);
  const current = parseJsonRecord(account.currentUniqueFakeGotchisOwnedArray);

  const existingCurrent = current[metadataId] ?? 0;
  const newAmount = existingCurrent + 1;

  if (!(metadataId in total)) {
    account = {
      ...account,
      totalUniqueFakeGotchisOwned: account.totalUniqueFakeGotchisOwned + 1,
    };
    total[metadataId] = newAmount;
  }

  if (newAmount === 1) {
    account = {
      ...account,
      currentUniqueFakeGotchisOwned: account.currentUniqueFakeGotchisOwned + 1,
    };
  }

  current[metadataId] = newAmount;

  return {
    ...account,
    totalUniqueFakeGotchisOwnedArray: stringifyJsonRecord(total),
    currentUniqueFakeGotchisOwnedArray: stringifyJsonRecord(current),
  };
}

export function updateTotalStatsMint(
  stats: StatisticEntity,
  metadataId: string,
): StatisticEntity {
  const circulating = parseJsonRecord(stats.totalEditionsCirculatingArray);
  const existing = circulating[metadataId] ?? 0;
  const newAmount = existing + 1;
  if (newAmount === 1) {
    stats = {
      ...stats,
      totalEditionsCirculating: stats.totalEditionsCirculating + 1,
      totalEditionsMinted: stats.totalEditionsMinted + 1,
    };
  }
  circulating[metadataId] = newAmount;
  return {
    ...stats,
    totalEditionsCirculatingArray: stringifyJsonRecord(circulating),
    totalNFTs: (stats.totalNFTs ?? 0) + 1,
  };
}

export function updateTotalStatsBurn(
  stats: StatisticEntity,
  metadataId: string,
): StatisticEntity {
  const circulating = parseJsonRecord(stats.totalEditionsCirculatingArray);
  const existing = circulating[metadataId] ?? 0;
  const newAmount = Math.max(existing - 1, 0);
  if (newAmount === 0 && existing > 0) {
    stats = {
      ...stats,
      totalEditionsCirculating: stats.totalEditionsCirculating - 1,
    };
  }
  circulating[metadataId] = newAmount;
  return {
    ...stats,
    totalEditionsCirculatingArray: stringifyJsonRecord(circulating),
    totalNFTs: (stats.totalNFTs ?? 0) - 1,
    burnedNFTs: (stats.burnedNFTs ?? 0) + 1,
  };
}

export function addToOwnersIfNotExists(
  stats: StatisticEntity,
  owner: string,
): StatisticEntity {
  const owners = [...stats.totalFakeGotchiOwnersArray];
  const normalized = owner.toLowerCase();
  if (!owners.includes(normalized)) {
    owners.push(normalized);
    return {
      ...stats,
      totalFakeGotchiOwnersArray: owners,
      totalFakeGotchiOwners: owners.length,
    };
  }
  return stats;
}

export function removeFromOwnersIfExistsAndBalanceNotZero(
  stats: StatisticEntity,
  owner: string,
  amount: number,
): StatisticEntity {
  if (amount > 0) return stats;
  const normalized = owner.toLowerCase();
  const owners = stats.totalFakeGotchiOwnersArray.filter((o) => o !== normalized);
  if (owners.length === stats.totalFakeGotchiOwnersArray.length) return stats;
  return {
    ...stats,
    totalFakeGotchiOwnersArray: owners,
    totalFakeGotchiOwners: owners.length,
  };
}

export { BIGINT_ONE, BIGINT_ZERO };
