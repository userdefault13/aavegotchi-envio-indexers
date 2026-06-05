/** Normalize Envio block fields to bigint for on-chain reads and entity storage. */
export function blockRef(event: {
  block: { number: number | bigint; timestamp: number | bigint };
}) {
  return {
    number: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  };
}

export type BlockRef = ReturnType<typeof blockRef>;
