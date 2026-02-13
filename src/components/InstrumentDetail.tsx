'use client';

import { useWatchlistStore } from '@/lib/store/watchlist';
import { formatPrice, formatLargeNumber } from '@/lib/utils';
import { OrderPanel } from './OrderPanel';

export function InstrumentDetail() {
  const selectedConid = useWatchlistStore((s) => s.selectedConid);
  const items = useWatchlistStore((s) => s.items);
  const price = useWatchlistStore((s) =>
    selectedConid ? s.prices[selectedConid] : null
  );

  const instrument = items.find((i) => i.conid === selectedConid);

  if (!instrument || !selectedConid) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center">
          <p className="text-lg mb-1">Select an instrument</p>
          <p className="text-xs">Click a watchlist item or search to add one</p>
        </div>
      </div>
    );
  }

  const change = price?.change ?? 0;
  const isPositive = change >= 0;
  const spread = price?.ask && price?.bid ? price.ask - price.bid : 0;
  const dayRange = price?.dayLow && price?.dayHigh
    ? `${formatPrice(price.dayLow)} — ${formatPrice(price.dayHigh)}`
    : '—';

  // Day range progress bar position
  const rangePosition =
    price?.last && price?.dayLow && price?.dayHigh && price.dayHigh > price.dayLow
      ? ((price.last - price.dayLow) / (price.dayHigh - price.dayLow)) * 100
      : 50;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold font-mono">
                {instrument.symbol}
              </h2>
              <span className="text-xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
                {instrument.type}
              </span>
              <span className="text-xs text-muted-foreground">
                {instrument.exchange}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {instrument.name}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold">
              {price?.last ? formatPrice(price.last) : '—'}
            </div>
            <div
              className={`font-mono text-sm font-medium ${
                isPositive
                  ? 'text-[var(--color-pulse-green)]'
                  : 'text-[var(--color-pulse-red)]'
              }`}
            >
              {isPositive ? '+' : ''}
              {change.toFixed(2)} ({price?.changePct || '—'})
            </div>
          </div>
        </div>
      </div>

      {/* Market Data Grid */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {/* Bid / Ask */}
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Bid</span>
            <span className="font-mono text-sm text-[var(--color-pulse-green)]">
              {price?.bid ? formatPrice(price.bid) : '—'}
              <span className="text-[10px] text-muted-foreground ml-1">
                x{price?.bidSize?.toLocaleString() || '—'}
              </span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Ask</span>
            <span className="font-mono text-sm text-[var(--color-pulse-red)]">
              {price?.ask ? formatPrice(price.ask) : '—'}
              <span className="text-[10px] text-muted-foreground ml-1">
                x{price?.askSize?.toLocaleString() || '—'}
              </span>
            </span>
          </div>

          {/* Spread */}
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Spread</span>
            <span className="font-mono text-sm">
              {spread ? formatPrice(spread) : '—'}
            </span>
          </div>

          {/* Volume */}
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Volume</span>
            <span className="font-mono text-sm">
              {price?.volume ? formatLargeNumber(price.volume) : '—'}
            </span>
          </div>

          {/* Open / Prev Close */}
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Open</span>
            <span className="font-mono text-sm">
              {price?.open ? formatPrice(price.open) : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Prev Close</span>
            <span className="font-mono text-sm">
              {price?.prevClose ? formatPrice(price.prevClose) : '—'}
            </span>
          </div>
        </div>

        {/* Day Range Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Day Range</span>
            <span>{dayRange}</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full relative overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--color-pulse-red)] via-muted-foreground to-[var(--color-pulse-green)] rounded-full"
              style={{ width: '100%' }}
            />
            <div
              className="absolute top-[-1px] h-[8px] w-[3px] bg-white rounded-sm"
              style={{ left: `${Math.min(Math.max(rangePosition, 2), 98)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Order Panel */}
      <OrderPanel conid={selectedConid} instrument={instrument} />
    </div>
  );
}
