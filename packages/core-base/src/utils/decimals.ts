export function itemMaxQuantityToRarity(quantity: bigint): bigint {
  const q = Number(quantity);
  if (q >= 1000) return 0n;
  if (q >= 500) return 1n;
  if (q >= 250) return 2n;
  if (q >= 100) return 3n;
  if (q >= 10) return 4n;
  if (q >= 1) return 5n;
  return 0n;
}
