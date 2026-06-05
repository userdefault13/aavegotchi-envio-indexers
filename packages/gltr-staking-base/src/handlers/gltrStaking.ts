/**
 * GLTR staking farm handlers (port of aavegotchi-gltr-staking-subgraph, Base).
 */
import { GltrStaking } from "generated";
import type { BlockRef } from "../utils/gltrStaking/helpers";
import {
  applyDeposit,
  applyEmergencyWithdraw,
  applyHarvest,
  applyWithdraw,
} from "../utils/gltrStaking/helpers";

function blockRef(event: {
  block: { number: number | bigint; timestamp: number | bigint };
}): BlockRef {
  return {
    number: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  };
}

GltrStaking.Deposit.handler(async ({ event, context }) => {
  await applyDeposit(
    context,
    event.params.pid,
    event.params.user,
    event.params.amount,
    blockRef(event),
    event.transaction.hash,
    event.logIndex,
  );
});

GltrStaking.Withdraw.handler(async ({ event, context }) => {
  await applyWithdraw(
    context,
    event.params.pid,
    event.params.user,
    event.params.amount,
    blockRef(event),
    event.transaction.hash,
    event.logIndex,
  );
});

GltrStaking.Harvest.handler(async ({ event, context }) => {
  await applyHarvest(
    context,
    event.params.user,
    event.params.amount,
    blockRef(event),
    event.transaction.hash,
    event.logIndex,
  );
});

GltrStaking.EmergencyWithdraw.handler(async ({ event, context }) => {
  await applyEmergencyWithdraw(
    context,
    event.params.pid,
    event.params.user,
    event.params.amount,
    blockRef(event),
    event.transaction.hash,
    event.logIndex,
  );
});
