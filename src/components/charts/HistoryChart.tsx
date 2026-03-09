'use client';

// ─── History Chart ────────────────────────────────────────────────
// Full candlestick chart using Lightweight Charts, powered by IBKR
// gateway historical data. Includes volume, crosshair, and scrubbing.

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts';

interface HistoryChartProps {
  conid: number;
  symbol?: string;
  period?: string;
  bar?: string;
  height?: number;
  className?: string;
}

export function HistoryChart({
  conid,
  symbol,
  period = '5d',
  bar = '5min',
  height = 400,
  className,
}: HistoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastChange, setLastChange] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: height - 36, // account for header
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0a' },
        textColor: '#6b7280',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 30, 40, 0.5)' },
        horzLines: { color: 'rgba(30, 30, 40, 0.5)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(100, 100, 120, 0.4)', style: 2, labelBackgroundColor: '#27272a' },
        horzLine: { color: 'rgba(100, 100, 120, 0.4)', style: 2, labelBackgroundColor: '#27272a' },
      },
      rightPriceScale: {
        borderColor: 'rgba(30, 30, 40, 0.8)',
      },
      timeScale: {
        borderColor: 'rgba(30, 30, 40, 0.8)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676',
      downColor: '#ff1744',
      borderUpColor: '#00e676',
      borderDownColor: '#ff1744',
      wickUpColor: '#00c853',
      wickDownColor: '#d50000',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // Fetch historical data from IBKR gateway
    setLoading(true);
    setError(null);

    fetch(`/api/ibkr/marketdata?history=${conid}&period=${period}&bar=${bar}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }

        if (Array.isArray(data) && data.length > 0) {
          // IBKR returns time in ms, Lightweight Charts needs seconds
          const candles: CandlestickData<Time>[] = data.map((b: { time: number; open: number; high: number; low: number; close: number }) => ({
            time: Math.floor(b.time / 1000) as Time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }));

          const volumes: HistogramData<Time>[] = data.map((b: { time: number; open: number; close: number; volume: number }) => ({
            time: Math.floor(b.time / 1000) as Time,
            value: b.volume,
            color: b.close >= b.open ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 23, 68, 0.3)',
          }));

          candleSeries.setData(candles);
          volumeSeries.setData(volumes);
          chart.timeScale().fitContent();

          const last = data[data.length - 1];
          setLastPrice(last.close);
          if (data.length >= 2) {
            const prev = data[data.length - 2];
            setLastChange(last.close - prev.close);
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load history');
        setLoading(false);
      });

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [conid, period, bar, height]);

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-3">
          {symbol && (
            <span className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">
              {symbol}
            </span>
          )}
          {lastPrice !== null && (
            <span className="text-[12px] text-zinc-200 font-medium tabular-nums">
              {lastPrice >= 1000
                ? lastPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : lastPrice.toFixed(2)}
            </span>
          )}
          {lastChange !== null && (
            <span className={`text-[10px] tabular-nums ${lastChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {lastChange >= 0 ? '+' : ''}{lastChange.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Loading...</span>
          )}
          {error && (
            <span className="text-[9px] text-red-500 uppercase tracking-wider" title={error}>
              Error
            </span>
          )}
          <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
            {period} / {bar}
          </span>
        </div>
      </div>
      {/* Chart container */}
      <div ref={containerRef} />
    </div>
  );
}
