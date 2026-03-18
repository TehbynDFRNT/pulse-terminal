'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getMarketSnapshots } from './gateway-client';
import {
  aggregateMarketDataDisplayStatus,
  deriveSnapshotDisplayStatus,
} from './display-status';
import { normalizeWatchlistItems } from './normalize-instrument';
import { useMarketSchedules } from './useMarketSchedules';
import { useIBKRMarketDataMulti } from './useIBKRWebSocket';
import { useGatewayStore } from '@/lib/store/gateway';
import { useWatchlistStore } from '@/lib/store/watchlist';

const WATCHLIST_ORDER_STORAGE_KEY = 'pulse.watchlist.order.v1';

export function useWatchlistSync() {
  const SNAPSHOT_POLL_MS = 10_000;
  const items = useWatchlistStore((s) => s.items);
  const selectedConid = useWatchlistStore((s) => s.selectedConid);
  const setItems = useWatchlistStore((s) => s.setItems);
  const selectInstrument = useWatchlistStore((s) => s.selectInstrument);
  const updateLivePrices = useWatchlistStore((s) => s.updateLivePrices);
  const updatePrices = useWatchlistStore((s) => s.updatePrices);
  const prices = useWatchlistStore((s) => s.prices);
  const setMarketDataMode = useGatewayStore((s) => s.setMarketDataMode);
  const streamPrices = useIBKRMarketDataMulti(items.map((item) => item.conid));
  const { states: scheduleStates } = useMarketSchedules(
    items.map((item) => ({ conid: item.conid, exchange: item.exchange }))
  );

  const hydratedRef = useRef(false);
  const loadedFromServerRef = useRef(false);
  const persistedItemsRef = useRef('[]');
  const inflightRef = useRef(false);
  const hasHydratedNonEmptyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/watchlist', { cache: 'no-store' });
        const data = await res.json();
        const normalized = normalizeWatchlistItems(data?.items ?? []);
        let initialPrices = Array.isArray(data?.prices) ? data.prices : [];

        if (initialPrices.length === 0 && normalized.length > 0) {
          try {
            initialPrices = await getMarketSnapshots(
              normalized.map((item) => item.conid)
            );
          } catch {
            // Initial snapshot bootstrap is best-effort; polling will retry.
          }
        }

        if (cancelled) return;

        const ordered = applyStoredWatchlistOrder(normalized);
        persistedItemsRef.current = JSON.stringify(ordered);
        hasHydratedNonEmptyRef.current = ordered.length > 0;
        if (initialPrices.length > 0) {
          updatePrices(initialPrices);
        }
        setItems(ordered);
        loadedFromServerRef.current = true;
      } catch {
        // Preserve any in-memory state if bootstrap fails. Do not persist an
        // empty list back to disk just because the initial load errored.
      } finally {
        hydratedRef.current = true;
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [setItems, updatePrices]);

  useEffect(() => {
    if (items.length === 0) {
      if (selectedConid !== null) {
        selectInstrument(null);
      }
      return;
    }

    if (!items.some((item) => item.conid === selectedConid)) {
      selectInstrument(items[0].conid);
    }
  }, [items, selectedConid, selectInstrument]);

  const fetchPrices = useCallback(async () => {
    if (items.length === 0 || inflightRef.current) return;
    inflightRef.current = true;
    try {
      const snapshots = await getMarketSnapshots(items.map((item) => item.conid));
      updatePrices(snapshots);
    } catch {
      setMarketDataMode('unknown');
    } finally {
      inflightRef.current = false;
    }
  }, [items, setMarketDataMode, updatePrices]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void fetchPrices();
    }, SNAPSHOT_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  useEffect(() => {
    if (items.length === 0) {
      setMarketDataMode('unknown');
      return;
    }

    const statuses = items.map((item) => {
      const price = prices[item.conid];
      if (!price) return 'unknown';
      return deriveSnapshotDisplayStatus(price, scheduleStates[item.conid]?.phase);
    });

    setMarketDataMode(aggregateMarketDataDisplayStatus(statuses));
  }, [items, prices, scheduleStates, setMarketDataMode]);

  useEffect(() => {
    if (streamPrices.size === 0) return;

    const nextUpdates: Record<number, Parameters<typeof updateLivePrices>[0][number]> = {};

    for (const [conid, price] of streamPrices.entries()) {
      nextUpdates[conid] = {
        last: price.last,
        bid: price.bid,
        bidSize: price.bidSize,
        ask: price.ask,
        askSize: price.askSize,
        change: price.change,
        changePct: price.changePct,
        volume: price.volume,
        dayLow: price.dayLow,
        dayHigh: price.dayHigh,
        updated: price.updated,
      };
    }
    updateLivePrices(nextUpdates);
  }, [streamPrices, updateLivePrices]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    persistWatchlistOrder(items);
  }, [items]);

  useEffect(() => {
    if (!hydratedRef.current || !loadedFromServerRef.current) return;

    const normalized = normalizeWatchlistItems(items);
    const serialized = JSON.stringify(normalized);
    if (serialized === persistedItemsRef.current) return;
    if (
      normalized.length === 0 &&
      hasHydratedNonEmptyRef.current &&
      persistedItemsRef.current !== '[]'
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error('Watchlist persist failed');
          }
          persistedItemsRef.current = serialized;
        })
        .catch(() => {});
    }, 300);

    return () => clearTimeout(timeout);
  }, [items]);
}

function applyStoredWatchlistOrder(items: ReturnType<typeof normalizeWatchlistItems>) {
  const order = loadStoredWatchlistOrder();
  if (order.length === 0 || items.length <= 1) {
    return items;
  }

  const rank = new Map<number, number>();
  order.forEach((conid, index) => {
    rank.set(conid, index);
  });

  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.conid);
    const rightRank = rank.get(right.conid);
    if (leftRank == null && rightRank == null) return 0;
    if (leftRank == null) return 1;
    if (rightRank == null) return -1;
    return leftRank - rightRank;
  });
}

function loadStoredWatchlistOrder(): number[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(WATCHLIST_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function persistWatchlistOrder(items: ReturnType<typeof normalizeWatchlistItems>) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      WATCHLIST_ORDER_STORAGE_KEY,
      JSON.stringify(items.map((item) => item.conid))
    );
  } catch {
    // Keep local order persistence best-effort.
  }
}
