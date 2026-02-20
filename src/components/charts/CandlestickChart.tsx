'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';

interface CandlestickChartProps {
  symbol: string;
  title?: string;
  start?: string;
  height?: number;
}

export function CandlestickChart({
  symbol,
  title,
  start = '2023-01-01',
  height = 400,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
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
        vertLine: { color: 'rgba(100, 100, 120, 0.4)', style: 2 },
        horzLine: { color: 'rgba(100, 100, 120, 0.4)', style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(30, 30, 40, 0.8)',
      },
      timeScale: {
        borderColor: 'rgba(30, 30, 40, 0.8)',
        timeVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676',
      downColor: '#ff1744',
      borderUpColor: '#00e676',
      borderDownColor: '#ff1744',
      wickUpColor: '#00e676',
      wickDownColor: '#ff1744',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // Fetch data
    fetch(`/api/market/history?symbol=${encodeURIComponent(symbol)}&start=${start}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else if (Array.isArray(data) && data.length > 0) {
          series.setData(data as CandlestickData<Time>[]);
          chart.timeScale().fitContent();
          setLastPrice(data[data.length - 1].close);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, start]);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {title || symbol}
          </span>
          {lastPrice !== null && (
            <span className="text-xs text-zinc-400">
              {lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      {/* Chart */}
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
