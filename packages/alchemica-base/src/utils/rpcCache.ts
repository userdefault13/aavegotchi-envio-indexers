const MAX_CACHE_ENTRIES = 50_000;

const cache = new Map<string, unknown>();
const insertionOrder: string[] = [];

function evictIfNeeded(): void {
  while (insertionOrder.length > MAX_CACHE_ENTRIES) {
    const oldest = insertionOrder.shift();
    if (oldest) cache.delete(oldest);
  }
}

export function rpcCacheKey(...parts: Array<string | number | bigint>): string {
  return parts.map((part) => part.toString()).join(":");
}

export async function getOrFetchRpc<T>(
  key: string,
  fetch: () => Promise<T>,
): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;

  const result = await fetch();
  if (!cache.has(key)) {
    insertionOrder.push(key);
    evictIfNeeded();
  }
  cache.set(key, result);
  return result;
}
