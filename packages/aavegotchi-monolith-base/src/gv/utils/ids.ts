/** Normalize Ethereum addresses to lowercase for entity IDs. */
export function toAddressId(address: string): string {
  return address.toLowerCase();
}

/** Build composite IDs from parts. */
export function joinId(...parts: (string | number | bigint)[]): string {
  return parts.map(String).join("-");
}

export function installationInstanceId(
  installationId: bigint,
  realmId: bigint,
  x: bigint,
  y: bigint,
): string {
  return joinId(installationId, realmId, x, y);
}

export function tileInstanceId(
  parcelId: string,
  tileTypeId: string,
  x: bigint,
  y: bigint,
): string {
  return joinId(parcelId, tileTypeId, x, y);
}

export function parcelAccessRightId(
  realmId: bigint,
  actionRight: bigint,
): string {
  return joinId(realmId, actionRight);
}
