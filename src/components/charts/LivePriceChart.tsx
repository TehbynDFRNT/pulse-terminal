'use client';

// ─── Live Price Chart ─────────────────────────────────────────────
// Real-time streaming price chart using Liveline + IBKR WebSocket.
// Loads historical data as seed, then streams live updates on top.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Liveline } from 'liveline';
import type { LivelinePoint } from 'liveline';
import { useIBKRMarketData, useIBKRConnection } from '@/lib/ibkr/useIBKRWebSocket';

interface LivePriceChartProps {
  conid: number;
  symbol?: string;
  color?: string;
  height?: number;
  className?: string;
}

const TIME_WINDOWS = [
  { label: '1m', secs: 60 },
  { label: '5m', secs: 300 },
  { label: '15m', secs: 900 },
  { label: '1h', secs: 3600 },
];

export function LivePriceChart({
  conid,
  symbol,
  color = '#00e676',
  height = 200,
  className,
}: LivePriceChartProps) {
  const { connected } = useIBKRConnection();
  const streamData = useIBKRMarketData(conid);

  const [data, setData] = useState<LivelinePoint[]>([]);
  const [value, setValue] = useState(0);
  const [windowSecs, setWindowSecs] = useState(300); // default 5m
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const lastPriceRef = useRef(0);

  // Load historical data as seed (via API route → IBKR gateway)
  useEffect(() => {
    let cancelled = false;
    setHistoryLoaded(false);
    setHistoryError(false);
    setData([]);

    const loadHistory = async () => {
      try {
        const res = await fetch(
          `/api/ibkr/marketdata?history=${conid}&period=1d&bar=1min`
        );
        const bars = await res.json();

        if (cancelled) return;

        if (Array.isArray(bars) && bars.length > 0) {
          // bars come as { time, open, high, low, close, volume }
          // Convert to LivelinePoint using close price and unix seconds
          const points: LivelinePoint[] = bars.map((b: { time: number; close: number }) => ({
            time: Math.floor(b.time / 1000), // ms → seconds
            value: b.close,
          }));
          setData(points);
          const lastClose = points[points.length - 1].value;
          setValue(lastClose);
          lastPriceRef.current = lastClose;
        }
        setHistoryLoaded(true);
      } catch {
        if (!cancelled) {
          setHistoryLoaded(true);
          setHistoryError(true);
        }
      }
    };

    loadHistory();
    return () => { cancelled = true; };
  }, [conid]);

  // Append streaming prices as new data points
  useEffect(() => {
    if (!streamData || streamData.last <= 0) return;

    const price = streamData.last;
    if (price === lastPriceRef.current) return;
    lastPriceRef.current = price;

    const now = Math.floor(Date.now() / 1000);
    setValue(price);
    setData((prev) => [...prev, { time: now, value: price }]);
  }, [streamData]);

  const formatPrice = useCallback((v: number) => {
    if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (v >= 10) return v.toFixed(2);
    return v.toFixed(4);
  }, []);

  const loading = !historyLoaded && !connected;

  return (
    <div className={className} style={{ height }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2">
          {symbol && (
            <span className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">
              {symbol}
            </span>
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
        </div>
        {historyError && (
          <span className="text-[9px] text-amber-500/70 uppercase">History unavailable</span>
        )}
      </div>

      {/* Chart */}
      <div style={{ height: height - 32 }}>
        <Liveline
          data={data}
          value={value}
          color={color}
          theme="dark"
          window={windowSecs}
          windows={TIME_WINDOWS}
          onWindowChange={setWindowSecs}
          windowStyle="text"
          grid
          badge
          momentum
          fill
          scrub
          showValue
          valueMomentumColor
          pulse={connected}
          loading={loading}
          emptyText={connected ? 'Waiting for data...' : 'Connecting...'}
          formatValue={formatPrice}
          exaggerate
        />
      </div>
    </div>
  );
}
