'use client';

import { X } from 'lucide-react';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { formatPrice } from '@/lib/utils';
import type { WatchlistItem as WatchlistItemType } from '@/lib/ibkr/types';

interface Props {
  item: WatchlistItemType;
}

export function WatchlistItem({ item }: Props) {
  const price = useWatchlistStore((s) => s.prices[item.conid]);
  const selectedConid = useWatchlistStore((s) => s.selectedConid);
  const selectInstrument = useWatchlistStore((s) => s.selectInstrument);
  const removeItem = useWatchlistStore((s) => s.removeItem);
  const isSelected = selectedConid === item.conid;

  const change = price?.change ?? 0;
  const isPositive = change >= 0;

  return (
    <button
      onClick={() => selectInstrument(item.conid)}
      className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors group ${
        isSelected
          ? 'bg-accent border-l-2 border-l-primary'
          : 'hover:bg-accent/50 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-sm">{item.symbol}</span>
          <span className="text-[10px] text-muted-foreground">{item.exchange}</span>
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{item.name}</div>
      </div>

      <div className="flex items-center gap-3 ml-2">
        <div className="text-right">
          <div className="font-mono text-sm font-medium">
            {price?.last ? formatPrice(price.last) : '—'}
          </div>
          <div
            className={`font-mono text-[11px] ${
              isPositive ? 'text-[var(--color-pulse-green)]' : 'text-[var(--color-pulse-red)]'
            }`}
          >
            {price?.changePct || '—'}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            removeItem(item.conid);
          }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </button>
  );
}
