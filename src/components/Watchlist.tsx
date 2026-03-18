'use client';

import { useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarketStatusInline } from '@/components/market/MarketStatus';
import { InstrumentListRow } from '@/components/market/InstrumentListRow';
import { useMarketSchedules } from '@/lib/ibkr/useMarketSchedules';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { useGatewayStore } from '@/lib/store/gateway';
import { useWatchlistSync } from '@/lib/ibkr/useWatchlistSync';
import { useNow } from '@/lib/useNow';

export function Watchlist() {
  useWatchlistSync();
  const items = useWatchlistStore((s) => s.items);
  const prices = useWatchlistStore((s) => s.prices);
  const selectedConid = useWatchlistStore((s) => s.selectedConid);
  const selectInstrument = useWatchlistStore((s) => s.selectInstrument);
  const removeItem = useWatchlistStore((s) => s.removeItem);
  const reorderItems = useWatchlistStore((s) => s.reorderItems);
  const connected = useGatewayStore((s) => s.connected);
  const marketDataMode = useGatewayStore((s) => s.marketDataMode);
  const { schedules } = useMarketSchedules(
    items.map((item) => ({ conid: item.conid, exchange: item.exchange }))
  );
  const nowMs = useNow(30_000, items.length > 0);
  const [draggedConid, setDraggedConid] = useState<number | null>(null);
  const [dropTargetConid, setDropTargetConid] = useState<number | null>(null);

  const itemIndexByConid = useMemo(() => {
    const next = new Map<number, number>();
    items.forEach((item, index) => {
      next.set(item.conid, index);
    });
    return next;
  }, [items]);

  const moveDraggedItem = (targetConid: number) => {
    if (draggedConid == null || draggedConid === targetConid) return;

    const fromIndex = itemIndexByConid.get(draggedConid);
    const toIndex = itemIndexByConid.get(targetConid);
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) return;

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedItem);
    reorderItems(nextItems);
  };

  const clearDragState = () => {
    setDraggedConid(null);
    setDropTargetConid(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Watchlist
        </h2>
        <div className="flex items-center gap-2">
          {connected === true ? (
            <MarketStatusInline status={marketDataMode} textClassName="text-[10px]" />
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {connected === null ? 'Checking' : 'Offline'}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            · {items.length} instrument{items.length !== 1 ? 's' : ''}
          </span>
        </div>
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
              <InstrumentListRow
                key={item.conid}
                item={item}
                price={prices[item.conid]}
                schedule={schedules[item.conid]}
                active={selectedConid === item.conid}
                onSelect={() => selectInstrument(item.conid)}
                onRemove={() => removeItem(item.conid)}
                nowMs={nowMs}
                draggable
                dragging={draggedConid === item.conid}
                dropTarget={dropTargetConid === item.conid && draggedConid !== item.conid}
                onDragStart={(event) => {
                  setDraggedConid(item.conid);
                  setDropTargetConid(item.conid);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(item.conid));
                }}
                onDragOver={(event) => {
                  if (draggedConid == null || draggedConid === item.conid) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (dropTargetConid !== item.conid) {
                    setDropTargetConid(item.conid);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveDraggedItem(item.conid);
                  clearDragState();
                }}
                onDragEnd={clearDragState}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
