import type { Block_t } from "generated/src/Types.gen";

export function blockNumberFrom(block: Block_t): bigint {
  return BigInt(block.number);
}

export function blockTimestampFrom(block: Block_t): bigint {
  return BigInt(block.timestamp);
}
