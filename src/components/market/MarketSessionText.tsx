'use client';

import { useMemo } from 'react';
import {
  getMarketDataDisplayBadgeClass,
  getMarketDataDisplayLabel,
  getMarketDataDisplayMark,
  type MarketDataDisplayStatus,
} from '@/lib/ibkr/display-status';
import {
  getMarketSessionPresentation,
  getMarketSessionVerbosePresentation,
} from '@/lib/ibkr/market-schedule';
import type { MarketSchedule, MarketSessionPhase } from '@/lib/ibkr/types';
import { cn } from '@/lib/utils';

interface MarketSessionTextProps {
  schedule?: Pick<MarketSchedule, 'days' | 'state' | 'timezone'> | null;
  nowMs: number;
  className?: string;
  status?: MarketDataDisplayStatus;
  sessionPhase?: MarketSessionPhase;
  showStatusMark?: boolean;
}

export function MarketSessionText({
  schedule,
  nowMs,
  className,
  status = 'unknown',
  sessionPhase = 'unknown',
  showStatusMark = false,
}: MarketSessionTextProps) {
  const displayTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      return undefined;
    }
  }, []);
  const presentation = getMarketSessionPresentation(schedule, nowMs, displayTimeZone);
  const verbose = getMarketSessionVerbosePresentation(schedule, nowMs, displayTimeZone);

  if (!presentation) return null;

  const countdownClassName =
    presentation.countdownTone === 'open'
      ? 'text-emerald-400'
      : sessionPhase === 'extended'
        ? 'text-sky-400'
        : 'text-red-400';

  return (
    <div
      className={cn(
        'group/session relative flex min-w-0 items-center gap-1.5 text-[9px] leading-none',
        className
      )}
    >
      {showStatusMark && (
        <span
          className={cn(
            'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] leading-none tracking-none',
            getMarketDataDisplayBadgeClass(status)
          )}
          aria-label={getMarketDataDisplayLabel(status)}
        >
          {getMarketDataDisplayMark(status, sessionPhase)}
        </span>
      )}
      <span
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground"
      >
        {presentation.rangeText}
      </span>
      {presentation.countdownText && presentation.countdownTone && (
        <span
          className={cn(
            'shrink-0 font-mono tabular-nums',
            countdownClassName
          )}
        >
          {presentation.countdownText}
        </span>
      )}

      {verbose && (
        <div className="pointer-events-none absolute left-0 top-full z-30 hidden w-max max-w-[calc(100vw-1rem)] rounded-md border border-border bg-popover p-2.5 text-[10px] leading-relaxed text-popover-foreground shadow-xl group-hover/session:block">
          <div className="font-mono text-[11px] text-popover-foreground">
            {verbose.phaseLabel}
          </div>
          {verbose.currentRangeText && (
            <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              <span className="text-muted-foreground">{verbose.rangeLabel}</span>
              <span className="min-w-0 text-right font-mono text-popover-foreground">
                {verbose.currentRangeText}
              </span>
            </div>
          )}
          {verbose.primaryBoundaryLabel && verbose.primaryBoundaryText && (
            <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              <span className="text-muted-foreground">{verbose.primaryBoundaryLabel}</span>
              <span className="min-w-0 text-right font-mono text-popover-foreground">
                {verbose.primaryBoundaryText}
              </span>
            </div>
          )}
          {verbose.secondaryBoundaryLabel && verbose.secondaryBoundaryText && (
            <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              <span className="text-muted-foreground">{verbose.secondaryBoundaryLabel}</span>
              <span className="min-w-0 text-right font-mono text-popover-foreground">
                {verbose.secondaryBoundaryText}
              </span>
            </div>
          )}
          {verbose.exchangeTimezone && (
            <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              <span className="text-muted-foreground">Exchange TZ</span>
              <span className="min-w-0 text-right font-mono text-popover-foreground">
                {verbose.exchangeTimezone}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
