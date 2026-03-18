import type { HistoricalBar } from './types';

const HISTORY_TTL_MS = 60_000;

interface HistoryCacheEntry {
  bars: HistoricalBar[];
  expiresAt: number;
}

const historyCache = new Map<string, HistoryCacheEntry>();
const inflightHistory = new Map<string, Promise<HistoricalBar[]>>();

export function getHistoryCache(key: string): HistoricalBar[] | null {
  const entry = historyCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    historyCache.delete(key);
    return null;
  }
  return entry.bars;
}

export function setHistoryCache(key: string, bars: HistoricalBar[]) {
  historyCache.set(key, {
    bars,
    expiresAt: Date.now() + HISTORY_TTL_MS,
  });
}

export function getInflightHistory(key: string): Promise<HistoricalBar[]> | null {
  return inflightHistory.get(key) ?? null;
}

export function setInflightHistory(key: string, promise: Promise<HistoricalBar[]>) {
  inflightHistory.set(key, promise);
}

export function clearInflightHistory(key: string) {
  inflightHistory.delete(key);
}
