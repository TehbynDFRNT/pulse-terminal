'use client';

import { useMemo } from 'react';
import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import type { WatchlistHeatmapBoardWidget } from '@/lib/dashboard/widgets';
import { cn, formatAdaptivePrice, formatPercentString } from '@/lib/utils';
import { useWatchlistStore } from '@/lib/store/watchlist';

interface HeatmapBoardWidgetProps {
  widget: WatchlistHeatmapBoardWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

function getHeatmapTone(change: number) {
  if (!Number.isFinite(change) || change === 0) {
    return 'border-border/80 bg-muted/80 text-foreground';
  }

  if (change > 0) {
    if (change >= 2) {
      return 'border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-500/24 dark:text-emerald-100';
    }
    if (change >= 1) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/18 dark:text-emerald-50';
    }
    return 'border-emerald-200 bg-emerald-50/85 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-50';
  }

  if (change <= -2) {
    return 'border-red-300 bg-red-100 text-red-950 dark:border-red-400/50 dark:bg-red-500/24 dark:text-red-100';
  }
  if (change <= -1) {
    return 'border-red-200 bg-red-50 text-red-900 dark:border-red-400/40 dark:bg-red-500/18 dark:text-red-50';
  }
  return 'border-red-200 bg-red-50/85 text-red-900 dark:border-red-400/30 dark:bg-red-500/12 dark:text-red-50';
}

function formatChangePct(value: string, numeric: number) {
  if (value) return formatPercentString(value, 5);
  return formatPercentString(String(numeric), 5);
}

function parseChangePct(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace('%', '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function HeatmapBoardWidget({
  widget,
  onRemove,
  onEdit,
}: HeatmapBoardWidgetProps) {
  const items = useWatchlistStore((state) => state.items);
  const prices = useWatchlistStore((state) => state.prices);
  const selectInstrument = useWatchlistStore((state) => state.selectInstrument);

  const instruments = useMemo(
    () =>
      widget.conids
        .map((conid) => {
          const item = items.find((candidate) => candidate.conid === conid);
          if (!item) return null;
          return {
            ...item,
            price: prices[conid],
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, widget.maxItems),
    [items, prices, widget.conids, widget.maxItems]
  );

  return (
    <BoardWidgetCard
      title={widget.title}
      subtitle={`${instruments.length} instrument${instruments.length === 1 ? '' : 's'} · live watchlist feed`}
      onEdit={() => onEdit(widget.id)}
      onRemove={() => onRemove(widget.id)}
    >
      <div className="h-full overflow-auto p-2">
        {instruments.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/40 px-4 text-center text-xs text-muted-foreground">
            Add watchlist instruments to this heatmap to surface multi-symbol price change at a glance.
          </div>
        ) : (
          <div
            className="grid content-start gap-1.5"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))',
            }}
          >
            {instruments.map((item) => {
              const price = item.price;
              const displayPrice = price?.displayPrice ?? 0;
              const change = parseChangePct(price?.displayChangePct || price?.changePct);
              const tone = getHeatmapTone(change);

              return (
                <button
                  key={item.conid}
                  type="button"
                  onClick={() => selectInstrument(item.conid)}
                  className={cn(
                    'flex min-h-[5.5rem] flex-col rounded-md border px-2 py-1.5 text-left transition-colors hover:brightness-[0.98] dark:hover:bg-accent/40 dark:hover:brightness-100',
                    tone
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-medium uppercase tracking-[0.18em]">
                        {item.symbol}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-current/70">
                        {item.exchange}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-1.5">
                    <div className="flex items-end justify-between gap-2">
                      <div className="truncate font-mono text-lg text-current">
                        {displayPrice > 0 ? formatAdaptivePrice(displayPrice) : '—'}
                      </div>
                      <div className="shrink-0 pb-0.5 font-mono text-[10px] text-current/70">
                        {formatChangePct(price?.displayChangePct ?? '', change)}
                      </div>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-current/70">
                      {item.name}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </BoardWidgetCard>
  );
}
