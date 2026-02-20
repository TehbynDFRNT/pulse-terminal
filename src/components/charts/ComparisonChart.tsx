'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries } from 'lightweight-charts';
import type { IChartApi, LineData, Time } from 'lightweight-charts';

const COLORS = [
  '#00e676', // green
  '#ff9100', // amber
  '#448aff', // blue
  '#e040fb', // purple
  '#ff1744', // red
  '#ffea00', // yellow
  '#00e5ff', // cyan
  '#ff6d00', // deep orange
];

interface ComparisonChartProps {
  symbols: { symbol: string; label: string }[];
  title?: string;
  start?: string;
  height?: number;
}

export function ComparisonChart({
  symbols,
  title = 'Performance Comparison',
  start = '2024-01-01',
  height = 350,
}: ComparisonChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ label: string; color: string; value: number }[]>([]);

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

    // 100 baseline
    const baselineSeries = chart.addSeries(LineSeries, {
      color: 'rgba(100, 100, 120, 0.3)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    const symbolStr = symbols.map((s) => s.symbol).join(',');

    fetch(`/api/market/multi?symbols=${encodeURIComponent(symbolStr)}&start=${start}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
          setLoading(false);
          return;
        }

        const legendItems: { label: string; color: string; value: number }[] = [];
        let maxLen = 0;
        let longestKey = '';

        // Find longest series for baseline
        for (const sym of symbols) {
          const series = data[sym.symbol];
          if (Array.isArray(series) && series.length > maxLen) {
            maxLen = series.length;
            longestKey = sym.symbol;
          }
        }

        symbols.forEach((sym, i) => {
          const series = data[sym.symbol];
          if (!Array.isArray(series)) return;

          const color = COLORS[i % COLORS.length];
          const lineSeries = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
          });

          const lineData: LineData<Time>[] = series.map(
            (d: { time: string; value: number }) => ({
              time: d.time as Time,
              value: d.value,
            })
          );

          lineSeries.setData(lineData);

          const lastVal = series[series.length - 1]?.value ?? 100;
          legendItems.push({
            label: sym.label,
            color,
            value: lastVal,
          });
        });

        // Draw 100 baseline
        if (longestKey && Array.isArray(data[longestKey])) {
          baselineSeries.setData(
            data[longestKey].map((d: { time: string }) => ({
              time: d.time as Time,
              value: 100,
            }))
          );
        }

        chart.timeScale().fitContent();
        setLegend(legendItems);
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
  }, [JSON.stringify(symbols), start]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          {title}
        </span>
        <div className="flex items-center gap-4">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-0.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[10px] text-zinc-400">{item.label}</span>
              <span
                className="text-[10px] font-medium"
                style={{
                  color: item.value >= 100 ? '#00e676' : '#ff1744',
                }}
              >
                {item.value >= 100 ? '+' : ''}{(item.value - 100).toFixed(1)}%
              </span>
            </div>
          ))}
          {loading && (
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Loading...</span>
          )}
          {error && (
            <span className="text-[10px] text-red-500 uppercase tracking-wider">Error</span>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
