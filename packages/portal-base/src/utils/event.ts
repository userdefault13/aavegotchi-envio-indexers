export function blockRef(event: {
  block: { number: number | bigint; timestamp: number | bigint };
}): { number: bigint; timestamp: bigint } {
  return {
    number: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  };
}
