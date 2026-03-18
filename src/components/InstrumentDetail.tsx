'use client';

import { useEffect, useState } from 'react';
import {
  deriveMarketDataDisplayStatus,
} from '@/lib/ibkr/display-status';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { useIBKRMarketData } from '@/lib/ibkr/useIBKRWebSocket';
import { useMarketSchedule } from '@/lib/ibkr/useMarketSchedule';
import { formatAdaptivePrice, formatLargeNumber, formatPercentString } from '@/lib/utils';
import type { HistoricalBar } from '@/lib/ibkr/types';
import { InstrumentHeader } from './InstrumentHeader';
import { OrderPanel } from './OrderPanel';
import { PriceChart } from './charts/PriceChart';

interface SessionStats {
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
}

export function InstrumentDetail() {
  const selectedConid = useWatchlistStore((s) => s.selectedConid);
  const items = useWatchlistStore((s) => s.items);
  const polledPrice = useWatchlistStore((s) =>
    selectedConid ? s.prices[selectedConid] : null
  );
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  // Real-time streaming price — supplements polled data
  const streamPrice = useIBKRMarketData(selectedConid);

  const instrument = items.find((i) => i.conid === selectedConid);
  const { state: marketScheduleState } = useMarketSchedule(
    selectedConid,
    instrument?.exchange
  );
  const needsSessionStats =
    !!selectedConid &&
    (
      (polledPrice?.open ?? 0) <= 0 ||
      (polledPrice?.dayLow ?? 0) <= 0 ||
      (polledPrice?.dayHigh ?? 0) <= 0 ||
      (polledPrice?.prevClose ?? 0) <= 0
    );

  useEffect(() => {
    if (!selectedConid) {
      setSessionStats(null);
      return;
    }

    if (!needsSessionStats) {
      setSessionStats(null);
      return;
    }

    let cancelled = false;

    const fetchSessionStats = async () => {
      try {
        const res = await fetch(
          `/api/ibkr/chart-feed?conid=${selectedConid}&timeframe=1D&resolution=1h`,
          { cache: 'no-store' }
        );
        const payload = await res.json();
        const bars = Array.isArray(payload?.historyBars) ? payload.historyBars : [];
        if (cancelled || bars.length === 0) return;

        const first = bars[0];
        const latest = bars[bars.length - 1];
        const low = bars.reduce(
          (current: number, bar: HistoricalBar) =>
            typeof bar.low === 'number' ? Math.min(current, bar.low) : current,
          Number.POSITIVE_INFINITY
        );
        const high = bars.reduce(
          (current: number, bar: HistoricalBar) =>
            typeof bar.high === 'number' ? Math.max(current, bar.high) : current,
          Number.NEGATIVE_INFINITY
        );
        const snapshotPrevClose =
          typeof payload?.snapshot?.prevClose === 'number' ? payload.snapshot.prevClose : 0;

        setSessionStats({
          open: first?.open ?? 0,
          high: Number.isFinite(high) ? high : 0,
          low: Number.isFinite(low) ? low : 0,
          close: latest.close ?? 0,
          prevClose: snapshotPrevClose > 0 ? snapshotPrevClose : latest.close ?? 0,
        });
      } catch {
        if (!cancelled) {
          setSessionStats(null);
        }
      }
    };

    fetchSessionStats();
    const interval = setInterval(fetchSessionStats, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [needsSessionStats, selectedConid]);

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

  // Prefer streaming data, fall back to polled snapshot
  const marketDataStatus =
    polledPrice?.marketDataStatus ??
    ((streamPrice?.last ?? 0) > 0 ||
    (streamPrice?.bid ?? 0) > 0 ||
    (streamPrice?.ask ?? 0) > 0
      ? 'live'
      : 'unknown');
  const marketDisplayStatus = deriveMarketDataDisplayStatus({
    marketDataStatus,
    sessionPhase: marketScheduleState?.phase,
    updated: polledPrice?.updated,
    lastActivityMs: streamPrice?.updated,
    hasHistory: !!sessionStats || (polledPrice?.last ?? 0) > 0,
  });
  const last =
    streamPrice?.displayPrice ||
    polledPrice?.displayPrice ||
    streamPrice?.last ||
    polledPrice?.last ||
    sessionStats?.close ||
    0;
  const bid = streamPrice?.bid || polledPrice?.bid || 0;
  const bidSize = streamPrice?.bidSize || polledPrice?.bidSize || 0;
  const ask = streamPrice?.ask || polledPrice?.ask || 0;
  const askSize = streamPrice?.askSize || polledPrice?.askSize || 0;
  const change =
    streamPrice?.displayChange ??
    polledPrice?.displayChange ??
    streamPrice?.change ??
    polledPrice?.change ??
    0;
  const changePct =
    streamPrice?.displayChangePct ||
    polledPrice?.displayChangePct ||
    streamPrice?.changePct ||
    polledPrice?.changePct ||
    '';
  const volume = streamPrice?.volume || polledPrice?.volume || 0;
  const dayLow = streamPrice?.dayLow || polledPrice?.dayLow || sessionStats?.low || 0;
  const dayHigh = streamPrice?.dayHigh || polledPrice?.dayHigh || sessionStats?.high || 0;
  const open = polledPrice?.open || sessionStats?.open || 0;
  const prevClose = polledPrice?.prevClose || sessionStats?.prevClose || 0;

  const isPositive = change >= 0;
  const spread = ask && bid ? ask - bid : 0;
  const hasDayRange = dayLow > 0 && dayHigh > dayLow;
  const dayRange = hasDayRange
    ? `${formatAdaptivePrice(dayLow)} — ${formatAdaptivePrice(dayHigh)}`
    : '—';

  const rangePosition =
    last && hasDayRange
      ? ((last - dayLow) / (dayHigh - dayLow)) * 100
      : 50;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0">
        <InstrumentHeader
          conid={selectedConid}
          exchange={instrument.exchange}
          symbol={instrument.symbol}
          name={instrument.name}
          price={last || null}
          changePct={changePct || null}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden border-t border-border lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <div className="grid min-h-0 grid-rows-[minmax(300px,1fr)_auto] overflow-hidden bg-card lg:grid-rows-[minmax(0,1fr)_minmax(180px,220px)] lg:border-r lg:border-border">
          <div className="min-h-0 min-w-0 overflow-hidden">
            <PriceChart
              conid={selectedConid}
              symbol={instrument.symbol}
              exchange={instrument.exchange}
              className="h-full"
              color="#00e676"
              stateScope="primary-chart"
              snapshotLast={polledPrice?.displayPrice ?? polledPrice?.last}
              snapshotUpdatedAt={polledPrice?.updated}
              snapshotMarketDataStatus={polledPrice?.marketDataStatus}
            />
          </div>

          <div className="min-h-0 border-t border-border px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Session Stats
              </h3>
              <span className="text-[10px] text-muted-foreground">{instrument.exchange}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Bid</span>
                <span className="font-mono text-sm text-[var(--color-pulse-green)]">
                  {bid ? formatAdaptivePrice(bid) : '—'}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    x{bidSize || '—'}
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Ask</span>
                <span className="font-mono text-sm text-[var(--color-pulse-red)]">
                  {ask ? formatAdaptivePrice(ask) : '—'}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    x{askSize || '—'}
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Spread</span>
                <span className="font-mono text-sm">
                  {spread ? formatAdaptivePrice(spread) : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Volume</span>
                <span className="font-mono text-sm">
                  {volume ? formatLargeNumber(volume) : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Open</span>
                <span className="font-mono text-sm">
                  {open ? formatAdaptivePrice(open) : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Prev Close</span>
                <span className="font-mono text-sm">
                  {prevClose ? formatAdaptivePrice(prevClose) : '—'}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Day Range</span>
                <span>{dayRange}</span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-[var(--color-pulse-red)] via-muted-foreground to-[var(--color-pulse-green)]"
                  style={{ width: '100%' }}
                />
                <div
                  className="absolute top-[-1px] h-[8px] w-[3px] rounded-sm bg-white"
                  style={{
                    left: `${Math.min(Math.max(rangePosition, 2), 98)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-hidden border-b border-border bg-card lg:border-b-0">
          <div className="h-full min-h-0 overflow-y-auto">
            <OrderPanel conid={selectedConid} instrument={instrument} />
          </div>
        </div>
      </div>
    </div>
  );
}
