import type { HandlerContext } from "generated";
import {
  BASE_GLTR_STAKING_POOLS,
  BIGINT_ZERO,
  type StakingPoolMeta,
} from "./constants";

export type GltrStakingContext = HandlerContext;

type StakingPoolEntity = NonNullable<
  Awaited<ReturnType<GltrStakingContext["StakingPool"]["get"]>>
>;
type PoolPositionEntity = NonNullable<
  Awaited<ReturnType<GltrStakingContext["PoolPosition"]["get"]>>
>;
type StakingUserEntity = NonNullable<
  Awaited<ReturnType<GltrStakingContext["StakingUser"]["get"]>>
>;
type StakingPoolStatEntity = NonNullable<
  Awaited<ReturnType<GltrStakingContext["StakingPoolStat"]["get"]>>
>;

export type BlockRef = { number: bigint; timestamp: bigint };

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

function poolMeta(pid: bigint): StakingPoolMeta {
  const key = pid.toString();
  return (
    BASE_GLTR_STAKING_POOLS[key] ?? {
      name: `pool-${key}`,
      lpToken: "0x0000000000000000000000000000000000000000",
    }
  );
}

export function eventEntityId(blockNumber: bigint, logIndex: number): string {
  return `${blockNumber}-${logIndex}`;
}

export async function getOrCreateStakingPool(
  context: GltrStakingContext,
  pid: bigint,
): Promise<StakingPoolEntity> {
  const id = pid.toString();
  const existing = await context.StakingPool.get(id);
  if (existing) return existing;

  const meta = poolMeta(pid);
  const pool: StakingPoolEntity = {
    id,
    name: meta.name,
    lpToken: normalizeAddress(meta.lpToken),
    balance: BIGINT_ZERO,
  };
  context.StakingPool.set(pool);
  return pool;
}

export async function getOrCreateStakingUser(
  context: GltrStakingContext,
  address: string,
): Promise<StakingUserEntity> {
  const id = normalizeAddress(address);
  const existing = await context.StakingUser.get(id);
  if (existing) return existing;

  const user: StakingUserEntity = {
    id,
    gltrHarvested: BIGINT_ZERO,
  };
  context.StakingUser.set(user);
  return user;
}

export async function getOrCreatePoolPosition(
  context: GltrStakingContext,
  pool: StakingPoolEntity,
  user: StakingUserEntity,
): Promise<PoolPositionEntity> {
  const id = `${pool.id}-${user.id}`;
  const existing = await context.PoolPosition.get(id);
  if (existing) return existing;

  const position: PoolPositionEntity = {
    id,
    user_id: user.id,
    pool_id: pool.id,
    balance: BIGINT_ZERO,
  };
  context.PoolPosition.set(position);
  return position;
}

export async function getOrCreatePoolStat(
  context: GltrStakingContext,
  pool: StakingPoolEntity,
): Promise<StakingPoolStatEntity> {
  const existing = await context.StakingPoolStat.get(pool.id);
  if (existing) return existing;

  const stats: StakingPoolStatEntity = {
    id: pool.id,
    pool_id: pool.id,
    numberOfCurrentPositions: BIGINT_ZERO,
    numberOfTotalPositions: BIGINT_ZERO,
    listOfCurrentPositions: [],
    listOfTotalPositions: [],
    lpStaked: BIGINT_ZERO,
  };
  context.StakingPoolStat.set(stats);
  return stats;
}

function updatePoolBalance(
  pool: StakingPoolEntity,
  delta: bigint,
): StakingPoolEntity {
  return { ...pool, balance: pool.balance + delta };
}

function updatePositionBalance(
  position: PoolPositionEntity,
  delta: bigint,
): PoolPositionEntity {
  return { ...position, balance: position.balance + delta };
}

function updatePoolStatsForPosition(
  stats: StakingPoolStatEntity,
  position: PoolPositionEntity,
): StakingPoolStatEntity {
  let listOfTotalPositions = [...stats.listOfTotalPositions];
  let listOfCurrentPositions = [...stats.listOfCurrentPositions];

  if (!listOfTotalPositions.includes(position.id)) {
    listOfTotalPositions = [...listOfTotalPositions, position.id];
  }

  const hasBalance = position.balance > BIGINT_ZERO;
  const inCurrent = listOfCurrentPositions.includes(position.id);

  if (hasBalance && !inCurrent) {
    listOfCurrentPositions = [...listOfCurrentPositions, position.id];
  } else if (!hasBalance && inCurrent) {
    listOfCurrentPositions = listOfCurrentPositions.filter((p) => p !== position.id);
  }

  return {
    ...stats,
    listOfTotalPositions,
    listOfCurrentPositions,
    numberOfTotalPositions: BigInt(listOfTotalPositions.length),
    numberOfCurrentPositions: BigInt(listOfCurrentPositions.length),
  };
}

export async function applyDeposit(
  context: GltrStakingContext,
  pid: bigint,
  userAddress: string,
  amount: bigint,
  block: BlockRef,
  txHash: string,
  logIndex: number,
): Promise<void> {
  const pool = await getOrCreateStakingPool(context, pid);
  const user = await getOrCreateStakingUser(context, userAddress);
  let position = await getOrCreatePoolPosition(context, pool, user);

  const updatedPool = updatePoolBalance(pool, amount);
  position = updatePositionBalance(position, amount);

  context.StakingPool.set(updatedPool);
  context.PoolPosition.set(position);

  let stats = await getOrCreatePoolStat(context, updatedPool);
  stats = {
    ...updatePoolStatsForPosition(stats, position),
    lpStaked: (stats.lpStaked ?? BIGINT_ZERO) + amount,
  };
  context.StakingPoolStat.set(stats);

  const eventId = eventEntityId(block.number, logIndex);
  context.StakingDeposit.set({
    id: `deposit-${eventId}`,
    timestamp: block.timestamp,
    from_id: user.id,
    to_id: pool.id,
    amount,
    txHash: txHash.toLowerCase(),
  });
}

export async function applyWithdraw(
  context: GltrStakingContext,
  pid: bigint,
  userAddress: string,
  amount: bigint,
  block: BlockRef,
  txHash: string,
  logIndex: number,
): Promise<void> {
  const pool = await getOrCreateStakingPool(context, pid);
  const user = await getOrCreateStakingUser(context, userAddress);
  let position = await getOrCreatePoolPosition(context, pool, user);

  const delta = -amount;
  const updatedPool = updatePoolBalance(pool, delta);
  position = updatePositionBalance(position, delta);

  context.StakingPool.set(updatedPool);
  context.PoolPosition.set(position);

  let stats = await getOrCreatePoolStat(context, updatedPool);
  const lpStaked = stats.lpStaked ?? BIGINT_ZERO;
  stats = {
    ...updatePoolStatsForPosition(stats, position),
    lpStaked: lpStaked > amount ? lpStaked - amount : BIGINT_ZERO,
  };
  context.StakingPoolStat.set(stats);

  const eventId = eventEntityId(block.number, logIndex);
  context.StakingWithdraw.set({
    id: `withdraw-${eventId}`,
    timestamp: block.timestamp,
    from_id: pool.id,
    to_id: user.id,
    amount,
    txHash: txHash.toLowerCase(),
  });
}

export async function applyHarvest(
  context: GltrStakingContext,
  userAddress: string,
  amount: bigint,
  block: BlockRef,
  txHash: string,
  logIndex: number,
): Promise<void> {
  const user = await getOrCreateStakingUser(context, userAddress);
  context.StakingUser.set({
    ...user,
    gltrHarvested: user.gltrHarvested + amount,
  });

  const eventId = eventEntityId(block.number, logIndex);
  context.StakingHarvest.set({
    id: `harvest-${eventId}`,
    timestamp: block.timestamp,
    to_id: user.id,
    amount,
    txHash: txHash.toLowerCase(),
  });
}

export async function applyEmergencyWithdraw(
  context: GltrStakingContext,
  pid: bigint,
  userAddress: string,
  amount: bigint,
  block: BlockRef,
  txHash: string,
  logIndex: number,
): Promise<void> {
  const pool = await getOrCreateStakingPool(context, pid);
  const user = await getOrCreateStakingUser(context, userAddress);
  let position = await getOrCreatePoolPosition(context, pool, user);

  const delta = -amount;
  const updatedPool = updatePoolBalance(pool, delta);
  position = updatePositionBalance(position, delta);

  context.StakingPool.set(updatedPool);
  context.PoolPosition.set(position);

  let stats = await getOrCreatePoolStat(context, updatedPool);
  stats = updatePoolStatsForPosition(stats, position);
  context.StakingPoolStat.set(stats);

  const eventId = eventEntityId(block.number, logIndex);
  context.StakingEmergencyWithdraw.set({
    id: `ewithdraw-${eventId}`,
    timestamp: block.timestamp,
    from_id: pool.id,
    to_id: user.id,
    amount,
    txHash: txHash.toLowerCase(),
  });
}
