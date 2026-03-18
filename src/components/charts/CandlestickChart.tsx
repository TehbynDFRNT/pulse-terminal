'use client';

// ─── CandlestickChart ────────────────────────────────────────────
// Fetches OHLC history from yahoo-finance2 and renders via Liveline.
// Used on the Analytics page.

import { useState, useEffect, useCallback } from 'react';
import { Liveline } from 'liveline';
import type { LivelinePoint } from 'liveline';

interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlestickChartProps {
  symbol: string;
  title?: string;
  start?: string;
  height?: number;
  color?: string;
}

const TIME_WINDOWS = [
  { label: '1M', secs: 2_592_000 },
  { label: '3M', secs: 7_776_000 },
  { label: '6M', secs: 15_552_000 },
  { label: '1Y', secs: 31_536_000 },
  { label: '2Y', secs: 63_072_000 },
];

export function CandlestickChart({
  symbol,
  title,
  start = '2023-01-01',
  height = 400,
  color = '#00e676',
}: CandlestickChartProps) {
  const [lineData, setLineData] = useState<LivelinePoint[]>([]);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [value, setValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [windowSecs, setWindowSecs] = useState(31_536_000);

  useEffect(() => {
    setLoading(true);
    setError(false);

    fetch(`/api/market/history?symbol=${encodeURIComponent(symbol)}&start=${start}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || !Array.isArray(data) || data.length === 0) {
          setError(true);
          setLoading(false);
          return;
        }

        // Line data (close prices)
        const points: LivelinePoint[] = data.map(
          (d: { time: string; close: number }) => ({
            time: new Date(d.time).getTime() / 1000,
            value: d.close,
          })
        );
        setLineData(points);

        // Candle data
        const ohlc: CandlePoint[] = data.map(
          (d: { time: string; open: number; high: number; low: number; close: number }) => ({
            time: new Date(d.time).getTime() / 1000,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          })
        );
        setCandles(ohlc);

        setValue(points[points.length - 1].value);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [symbol, start]);

  const formatPrice = useCallback((v: number) => {
    if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (v >= 10) return v.toFixed(2);
    return v.toFixed(4);
  }, []);

  // Infer candle bar width
  const candleWidth = candles.length >= 2 ? candles[1].time - candles[0].time : 86400;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {title || symbol}
          </span>
          {value > 0 && (
            <span className="text-xs text-zinc-400 font-mono tabular-nums">
              {formatPrice(value)}
            </span>
          )}
        </div>
        {loading && (
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Loading...</span>
        )}
        {error && (
          <span className="text-[10px] text-red-500 uppercase tracking-wider">Error</span>
        )}
      </div>
      <div style={{ height }}>
        <Liveline
          mode="candle"
          candles={candles}
          candleWidth={candleWidth}
          lineData={lineData}
          lineValue={value}
          data={lineData}
          value={value}
          color={color}
          theme="dark"
          window={windowSecs}
          windows={TIME_WINDOWS}
          onWindowChange={setWindowSecs}
          windowStyle="text"
          grid
          badge
          scrub
          showValue
          loading={loading}
          emptyText={error ? 'Failed to load data' : 'Loading...'}
          formatValue={formatPrice}
        />
      </div>
    </div>
  );
}
