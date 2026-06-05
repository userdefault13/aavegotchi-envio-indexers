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

export function getRpcCache<T>(key: string): T | null {
  if (!cache.has(key)) return null;
  return cache.get(key) as T;
}

export function setRpcCache<T>(key: string, value: T): void {
  if (!cache.has(key)) {
    insertionOrder.push(key);
    evictIfNeeded();
  }
  cache.set(key, value);
}

const inflight = new Map<string, Promise<unknown>>();

export async function getOrFetchRpc<T>(
  key: string,
  fetch: () => Promise<T>,
): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, pending);
  }

  const result = await pending;
  setRpcCache(key, result);
  return result;
}
