'use client';

import type { DragEventHandler } from 'react';
import { X } from 'lucide-react';
import { deriveSnapshotDisplayStatus } from '@/lib/ibkr/display-status';
import type {
  MarketDataSnapshot,
  MarketSchedule,
} from '@/lib/ibkr/types';
import { formatAdaptivePrice, formatPercentString } from '@/lib/utils';
import { MarketSessionText } from './MarketSessionText';

type PriceLike = Pick<
  MarketDataSnapshot,
  | 'last'
  | 'displayPrice'
  | 'displayChange'
  | 'displayChangePct'
  | 'change'
  | 'changePct'
  | 'marketDataStatus'
  | 'updated'
  | 'open'
  | 'prevClose'
  | 'dayLow'
  | 'dayHigh'
>;

interface InstrumentListRowItem {
  conid: number;
  symbol: string;
  name: string;
  exchange: string;
}

interface InstrumentListRowProps {
  item: InstrumentListRowItem;
  price?: PriceLike | null;
  schedule?: MarketSchedule | null;
  active: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  accentColor?: string;
  nowMs: number;
  draggable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
}

export function InstrumentListRow({
  item,
  price,
  schedule,
  active,
  onSelect,
  onRemove,
  accentColor,
  nowMs,
  draggable = false,
  dragging = false,
  dropTarget = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: InstrumentListRowProps) {
  const change = price?.displayChange ?? price?.change ?? 0;
  const isPositive = change >= 0;
  const displayStatus = price
    ? deriveSnapshotDisplayStatus(price, schedule?.state.phase)
    : 'unknown';

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group flex w-full items-center justify-between gap-1.5 px-3 py-2 text-left transition-[background-color,border-color,opacity] cursor-pointer ${
        active
          ? 'bg-accent border-l-2 border-l-primary'
          : 'hover:bg-accent/50 border-l-2 border-l-transparent'
      } ${dragging ? 'opacity-50' : ''} ${dropTarget ? 'border-l-primary/60 bg-accent/40' : ''}`}
    >
      <div className="min-w-0 flex-1 pr-1">
        <div className="flex items-center justify-between gap-2">
          <div
            className="min-w-0 flex items-center gap-2 overflow-hidden"
            title={item.name ? `${item.name} (${item.symbol})` : item.symbol}
          >
            {accentColor && (
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
            )}
            <span className="truncate font-mono text-sm font-semibold">
              {item.symbol}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{item.exchange}</span>
          </div>
        </div>
        <MarketSessionText
          schedule={schedule}
          nowMs={nowMs}
          status={displayStatus}
          sessionPhase={schedule?.state.phase}
          showStatusMark
          className="mt-0.5 block pr-1"
        />
      </div>

      <div className="ml-0.5 flex shrink-0 items-center gap-1">
        <div className="text-right leading-tight">
          <div className="font-mono text-sm font-medium tabular-nums">
            {price?.displayPrice ? formatAdaptivePrice(price.displayPrice) : '—'}
          </div>
          <div
            className={`font-mono text-[11px] tabular-nums ${
              isPositive ? 'text-[var(--color-pulse-green)]' : 'text-[var(--color-pulse-red)]'
            }`}
          >
            {price?.displayChangePct
              ? formatPercentString(price.displayChangePct)
              : price?.changePct
                ? formatPercentString(price.changePct)
                : '—'}
          </div>
        </div>

        {onRemove && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
