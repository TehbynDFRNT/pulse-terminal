/**
 * In-memory cache with TTL for market data routes.
 * Eliminates Python entirely — all data fetched natively in Node.js.
 */

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ttlMs) return null;
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, updatedAt: Date.now() });
}

export function getCacheAge(key: string): number | null {
  const entry = store.get(key);
  if (!entry) return null;
  return Math.round((Date.now() - entry.updatedAt) / 1000);
}

/** FRED API key from OpenBB config */
export const FRED_API_KEY = process.env.FRED_API_KEY || '4799d0af034bfca40db3bead15153163';
