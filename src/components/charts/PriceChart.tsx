'use client';

// ─── PriceChart ──────────────────────────────────────────────────
// Unified price chart using Liveline. Supports both line and candle
// modes with live WebSocket streaming from IBKR gateway.
// Fetches historical data on mount, then appends real-time ticks.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Liveline } from 'liveline';
import type { LivelinePoint } from 'liveline';
import { useIBKRMarketData, useIBKRConnection } from '@/lib/ibkr/useIBKRWebSocket';

// ─── Types ───────────────────────────────────────────────────────

interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface PriceChartProps {
  conid: number;
  symbol?: string;
  color?: string;
  height?: number;
  className?: string;
  /** Initial mode */
  defaultMode?: 'line' | 'candle';
  /** Reference line (e.g. alert target) */
  referenceLine?: { value: number; label?: string };
}

// ─── Time Windows ────────────────────────────────────────────────

const TIME_WINDOWS = [
  { label: '1m', secs: 60 },
  { label: '5m', secs: 300 },
  { label: '15m', secs: 900 },
  { label: '1h', secs: 3600 },
  { label: '4h', secs: 14400 },
  { label: '1D', secs: 86400 },
  { label: '1W', secs: 604800 },
];

// Map time windows to IBKR history params
const WINDOW_TO_HISTORY: Record<number, { period: string; bar: string }> = {
  60: { period: '1d', bar: '1min' },
  300: { period: '1d', bar: '1min' },
  900: { period: '1d', bar: '1min' },
  3600: { period: '1d', bar: '5min' },
  14400: { period: '2d', bar: '5min' },
  86400: { period: '5d', bar: '5min' },
  604800: { period: '1M', bar: '1h' },
};

// ─── Component ───────────────────────────────────────────────────

export function PriceChart({
  conid,
  symbol,
  color = '#00e676',
  height = 300,
  className,
  defaultMode = 'line',
  referenceLine,
}: PriceChartProps) {
  const { connected } = useIBKRConnection();
  const streamData = useIBKRMarketData(conid);

  const [mode, setMode] = useState<'line' | 'candle'>(defaultMode);
  const [lineData, setLineData] = useState<LivelinePoint[]>([]);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [liveCandle, setLiveCandle] = useState<CandlePoint | null>(null);
  const [value, setValue] = useState(0);
  const [windowSecs, setWindowSecs] = useState(300);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const lastPriceRef = useRef(0);
  const candleBarSecs = useRef(60); // seconds per candle bar

  // ─── Fetch historical data ─────────────────────────────────

  const fetchHistory = useCallback(async (secs: number) => {
    setHistoryLoaded(false);
    setHistoryError(false);

    const params = WINDOW_TO_HISTORY[secs] || { period: '1d', bar: '1min' };

    try {
      const res = await fetch(
        `/api/ibkr/marketdata?history=${conid}&period=${params.period}&bar=${params.bar}`
      );
      const bars = await res.json();

      if (Array.isArray(bars) && bars.length > 0) {
        // Line data: close prices
        const points: LivelinePoint[] = bars.map(
          (b: { time: number; close: number }) => ({
            time: Math.floor(b.time / 1000),
            value: b.close,
          })
        );
        setLineData(points);

        // Candle data: full OHLC
        const ohlc: CandlePoint[] = bars.map(
          (b: { time: number; open: number; high: number; low: number; close: number }) => ({
            time: Math.floor(b.time / 1000),
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })
        );
        setCandles(ohlc);

        // Infer bar width from data
        if (bars.length >= 2) {
          candleBarSecs.current = Math.floor(
            (bars[1].time - bars[0].time) / 1000
          );
        }

        const lastClose = points[points.length - 1].value;
        setValue(lastClose);
        lastPriceRef.current = lastClose;
        setLiveCandle(null);
      }
      setHistoryLoaded(true);
    } catch {
      setHistoryLoaded(true);
      setHistoryError(true);
    }
  }, [conid]);

  // Load on mount and when conid changes
  useEffect(() => {
    fetchHistory(windowSecs);
  }, [conid, fetchHistory, windowSecs]);

  // ─── Append streaming prices ───────────────────────────────

  useEffect(() => {
    if (!streamData || streamData.last <= 0) return;

    const price = streamData.last;
    if (price === lastPriceRef.current) return;
    lastPriceRef.current = price;

    const now = Math.floor(Date.now() / 1000);
    setValue(price);

    // Line: append point
    setLineData((prev) => [...prev, { time: now, value: price }]);

    // Candle: update live candle
    setLiveCandle((prev) => {
      if (!prev) {
        return { time: now, open: price, high: price, low: price, close: price };
      }
      // If we've exceeded the bar width, start a new candle
      const elapsed = now - prev.time;
      if (elapsed >= candleBarSecs.current) {
        // Push completed candle into history
        setCandles((c) => [...c, prev]);
        return { time: now, open: price, high: price, low: price, close: price };
      }
      return {
        ...prev,
        high: Math.max(prev.high, price),
        low: Math.min(prev.low, price),
        close: price,
      };
    });
  }, [streamData]);

  // ─── Window change ─────────────────────────────────────────

  const handleWindowChange = useCallback(
    (secs: number) => {
      setWindowSecs(secs);
    },
    []
  );

  // ─── Format ────────────────────────────────────────────────

  const formatPrice = useCallback((v: number) => {
    if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (v >= 10) return v.toFixed(2);
    return v.toFixed(4);
  }, []);

  const loading = !historyLoaded;

  // ─── Render ────────────────────────────────────────────────

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
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-emerald-500' : 'bg-zinc-600'
            }`}
          />
          {historyError && (
            <span className="text-[9px] text-amber-500/70 uppercase">
              History unavailable
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          <button
            onClick={() => setMode(mode === 'line' ? 'candle' : 'line')}
            className="px-2 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors rounded"
          >
            {mode === 'line' ? 'Candles' : 'Line'}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: height - 32 }}>
        {mode === 'line' ? (
          <Liveline
            data={lineData}
            value={value}
            color={color}
            theme="dark"
            window={windowSecs}
            windows={TIME_WINDOWS}
            onWindowChange={handleWindowChange}
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
            referenceLine={referenceLine}
          />
        ) : (
          <Liveline
            mode="candle"
            candles={candles}
            candleWidth={candleBarSecs.current}
            liveCandle={liveCandle ?? undefined}
            lineData={lineData}
            lineValue={value}
            data={lineData}
            value={value}
            color={color}
            theme="dark"
            window={windowSecs}
            windows={TIME_WINDOWS}
            onWindowChange={handleWindowChange}
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
            referenceLine={referenceLine}
          />
        )}
      </div>
    </div>
  );
}
