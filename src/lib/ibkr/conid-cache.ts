// ─── Contract ID Cache ─────────────────────────────────────────────
// Caches conid → contract info to reduce redundant API calls

import type { ContractInfo, SearchResult } from './types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — contract info rarely changes
const SEARCH_CACHE_VERSION = 'v3';

class ConIdCache {
  private contractCache = new Map<number, CacheEntry<ContractInfo>>();
  private searchCache = new Map<string, CacheEntry<SearchResult[]>>();

  getContract(conid: number): ContractInfo | null {
    const entry = this.contractCache.get(conid);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.contractCache.delete(conid);
      return null;
    }
    return entry.data;
  }

  setContract(conid: number, info: ContractInfo): void {
    this.contractCache.set(conid, { data: info, timestamp: Date.now() });
  }

  getSearch(query: string, secType?: string): SearchResult[] | null {
    const key = buildSearchKey(query, secType);
    const entry = this.searchCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.searchCache.delete(key);
      return null;
    }
    return entry.data;
  }

  setSearch(query: string, results: SearchResult[], secType?: string): void {
    this.searchCache.set(buildSearchKey(query, secType), {
      data: results,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.contractCache.clear();
    this.searchCache.clear();
  }
}

export const conidCache = new ConIdCache();

function buildSearchKey(query: string, secType?: string): string {
  return `${SEARCH_CACHE_VERSION}::${query.toLowerCase()}::${(secType || '').toUpperCase()}`;
}
