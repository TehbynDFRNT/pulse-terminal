'use client';

import { useCallback, useMemo, useState } from 'react';
import { Liveline } from 'liveline';
import {
  PORTFOLIO_PERFORMANCE_TIMEFRAMES,
  getPortfolioPerformanceTimeframe,
} from '@/lib/ibkr/portfolio-performance';
import { usePortfolioPerformanceFeed } from '@/lib/ibkr/usePortfolioPerformanceFeed';
import { usePortfolioStore } from '@/lib/store/portfolio';
import { useThemeStore } from '@/lib/store/theme';
import { cn, formatPrice } from '@/lib/utils';

function formatChartTime(windowSecs: number, time: number) {
  const date = new Date(time * 1000);
  if (windowSecs >= 180 * 24 * 60 * 60) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function PortfolioPerformancePanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [timeframeKey, setTimeframeKey] = useState('1M');
  const theme = useThemeStore((s) => s.theme);
  const timeframe = getPortfolioPerformanceTimeframe(timeframeKey);
  const {
    bootstrap,
    baseCurrency,
    connected,
    displayStatus,
    line,
    value,
    netLiquidity,
  } = usePortfolioPerformanceFeed(timeframe.key);
  const summary = usePortfolioStore((s) => s.summary);
  const pnl = usePortfolioStore((s) => s.pnl);
  const positions = usePortfolioStore((s) => s.positions);

  const startValue = line[0]?.value ?? 0;
  const absoluteChange = value - startValue;
  const pctChange = startValue > 0 ? (absoluteChange / startValue) * 100 : 0;
  const chartColor = absoluteChange >= 0 ? '#00e676' : '#ef4444';
  const loading = !bootstrap.loaded && line.length === 0;

  const cards = useMemo(
    () => [
      {
        label: 'Net Liq',
        value: `${baseCurrency} ${formatPrice(netLiquidity, -1)}`,
      },
      {
        label: 'Change',
        value: `${absoluteChange >= 0 ? '+' : ''}${formatPrice(absoluteChange, -1)}`,
        tone: absoluteChange >= 0 ? 'text-emerald-400' : 'text-red-400',
      },
      {
        label: 'Change %',
        value: `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`,
        tone: pctChange >= 0 ? 'text-emerald-400' : 'text-red-400',
      },
      {
        label: 'Daily P&L',
        value:
          pnl != null
            ? `${pnl.dailyPnL >= 0 ? '+' : ''}${formatPrice(pnl.dailyPnL, -1)}`
            : '—',
        tone:
          pnl != null
            ? pnl.dailyPnL >= 0
              ? 'text-emerald-400'
              : 'text-red-400'
            : '',
      },
      {
        label: 'Cash',
        value:
          summary != null
            ? `${baseCurrency} ${formatPrice(summary.totalCash, -1)}`
            : '—',
      },
      {
        label: 'Positions',
        value: String(positions.length),
      },
    ],
    [absoluteChange, baseCurrency, netLiquidity, pctChange, pnl, positions.length, summary]
  );

  const formatValue = useCallback(
    (next: number) => `${baseCurrency} ${formatPrice(next, -1)}`,
    [baseCurrency]
  );
  const formatTime = useCallback(
    (time: number) => formatChartTime(timeframe.windowSecs, time),
    [timeframe.windowSecs]
  );

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden', embedded ? 'border-b border-border/50' : 'h-full')}>
      {!embedded ? (
        <div className="grid grid-cols-2 gap-2 border-b border-border/60 px-3 py-3 lg:grid-cols-6">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded border border-border/70 bg-background/80 px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {card.label}
              </div>
              <div className={cn('mt-1 font-mono text-sm text-foreground', card.tone)}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Performance</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
              displayStatus === 'live'
                ? 'bg-emerald-500/10 text-emerald-400'
                : displayStatus === 'historical'
                  ? 'bg-secondary text-muted-foreground'
                  : 'bg-secondary text-muted-foreground/80'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                displayStatus === 'live'
                  ? 'bg-emerald-400'
                  : displayStatus === 'historical'
                    ? 'bg-muted-foreground'
                    : 'bg-muted-foreground/60'
              )}
            />
            {displayStatus === 'live'
              ? 'Live'
              : displayStatus === 'historical'
                ? 'Historical'
                : connected
                  ? 'Awaiting data'
                  : 'Offline'}
          </span>
          {bootstrap.error ? (
            <span className="text-amber-500/70">History unavailable</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          {PORTFOLIO_PERFORMANCE_TIMEFRAMES.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              onClick={() => setTimeframeKey(candidate.key)}
              className={cn(
                'rounded px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors',
                timeframe.key === candidate.key
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('min-h-0 overflow-hidden', embedded ? 'h-56' : 'flex-1')}>
        <Liveline
          data={line}
          value={value}
          color={chartColor}
          theme={theme}
          window={timeframe.windowSecs}
          grid
          badge
          momentum
          fill={false}
          scrub
          showValue
          valueMomentumColor
          pulse={displayStatus === 'live'}
          loading={loading}
          emptyText={connected ? 'Waiting for portfolio data...' : 'Connecting...'}
          formatValue={formatValue}
          formatTime={formatTime}
        />
      </div>
    </div>
  );
}
