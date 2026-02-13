'use client';

import { useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WatchlistItem } from './WatchlistItem';
import { useWatchlistStore } from '@/lib/store/watchlist';

export function Watchlist() {
  const items = useWatchlistStore((s) => s.items);
  const setItems = useWatchlistStore((s) => s.setItems);
  const updatePrices = useWatchlistStore((s) => s.updatePrices);

  // Load saved watchlist on mount
  useEffect(() => {
    fetch('/api/watchlist')
      .then((r) => r.json())
      .then((data) => {
        if (data?.items?.length > 0) {
          setItems(data.items);
        }
      })
      .catch(() => {});
  }, [setItems]);

  // Fetch price snapshots for watchlist items
  const fetchPrices = useCallback(async () => {
    if (items.length === 0) return;
    const conids = items.map((i) => i.conid).join(',');

    try {
      const res = await fetch(`/api/ibkr/marketdata?conids=${conids}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        updatePrices(data);
      }
    } catch {
      // Silently fail — will retry on next interval
    }
  }, [items, updatePrices]);

  // Poll for prices every 3 seconds (mock mode)
  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 3000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Persist watchlist changes
  useEffect(() => {
    if (items.length === 0) return;
    // Debounce save
    const timeout = setTimeout(() => {
      fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items[items.length - 1]),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [items]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Watchlist
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {items.length} instrument{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ScrollArea className="flex-1">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <p>No instruments</p>
            <p className="text-xs mt-1">Search and add with /</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {items.map((item) => (
              <WatchlistItem key={item.conid} item={item} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
