// ─── Contract ID Cache ─────────────────────────────────────────────
// Caches conid → contract info to reduce redundant API calls

import type { ContractInfo, SearchResult } from './types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — contract info rarely changes

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

  getSearch(query: string): SearchResult[] | null {
    const entry = this.searchCache.get(query.toLowerCase());
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.searchCache.delete(query.toLowerCase());
      return null;
    }
    return entry.data;
  }

  setSearch(query: string, results: SearchResult[]): void {
    this.searchCache.set(query.toLowerCase(), { data: results, timestamp: Date.now() });
  }

  clear(): void {
    this.contractCache.clear();
    this.searchCache.clear();
  }
}

export const conidCache = new ConIdCache();
