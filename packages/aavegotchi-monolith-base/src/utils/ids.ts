/** Normalize Ethereum addresses to lowercase for entity IDs. */
export function toAddressId(address: string): string {
  return address.toLowerCase();
}

/** Build composite IDs from parts. */
export function joinId(...parts: (string | number | bigint)[]): string {
  return parts.map(String).join("-");
}
