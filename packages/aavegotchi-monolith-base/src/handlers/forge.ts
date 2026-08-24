/**
 * Forge diamond smelt / queue / claim events (Base ForgeDiamond).
 */
import { ForgeDiamond } from "generated";
import {
  recordForgeQueueAdd,
  recordForgeQueueClaim,
  recordInstantForge,
  recordSmelt,
} from "../utils/forge/helpers";

function eventMeta(event: {
  block: { number: number | bigint; timestamp: number | bigint };
  logIndex: number;
  transaction: { hash: string };
}) {
  return {
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
  };
}

ForgeDiamond.ItemSmelted.handler(async ({ event, context }) => {
  const meta = eventMeta(event);
  await recordSmelt(
    context,
    event.params.itemId,
    event.params.gotchiId,
    meta.blockNumber,
    meta.timestamp,
    meta.txHash,
    meta.logIndex,
  );
});

ForgeDiamond.AddedToQueue.handler(async ({ event, context }) => {
  const meta = eventMeta(event);
  await recordForgeQueueAdd(
    context,
    event.params.owner,
    event.params.itemId,
    event.params.gotchiId,
    BigInt(event.params.readyBlock),
    event.params.queueId,
    meta.blockNumber,
    meta.timestamp,
    meta.txHash,
    meta.logIndex,
  );
});

ForgeDiamond.ForgeQueueClaimed.handler(async ({ event, context }) => {
  const meta = eventMeta(event);
  await recordForgeQueueClaim(
    context,
    event.params.itemId,
    event.params.gotchiId,
    meta.blockNumber,
    meta.timestamp,
    meta.txHash,
    meta.logIndex,
  );
});

/** queueId 0 = forge completed instantly (alloy burned in same tx, no queue row). */
ForgeDiamond.ForgeTimeReduced.handler(async ({ event, context }) => {
  if (event.params.queueId !== 0n) return;
  const meta = eventMeta(event);
  await recordInstantForge(
    context,
    event.params.itemId,
    event.params.gotchiId,
    BigInt(event.params._blocksReduced),
    meta.blockNumber,
    meta.timestamp,
    meta.txHash,
    meta.logIndex,
  );
});
