'use client';

// ─── ComparisonChart ─────────────────────────────────────────────
// Fetches multi-symbol data from yahoo-finance2, rebased to 100,
// and renders via MultiLineChart (canvas).

import { useState, useEffect } from 'react';
import { MultiLineChart, type ChartSeries } from './MultiLineChart';

const COLORS = [
  '#00e676', '#ff9100', '#448aff', '#e040fb',
  '#ff1744', '#ffea00', '#00e5ff', '#ff6d00',
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
  const [chartSeries, setChartSeries] = useState<ChartSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const symbolStr = symbols.map((s) => s.symbol).join(',');

    fetch(`/api/market/multi?symbols=${encodeURIComponent(symbolStr)}&start=${start}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(typeof data.error === 'string' ? data.error : 'Failed to load');
          setLoading(false);
          return;
        }

        const result: ChartSeries[] = [];
        symbols.forEach((sym, i) => {
          const series = data[sym.symbol];
          if (!Array.isArray(series)) return;

          result.push({
            label: sym.label,
            color: COLORS[i % COLORS.length],
            data: series.map((d: { time: string; value: number }) => ({
              time: d.time,
              value: d.value,
            })),
          });
        });

        setChartSeries(result);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [JSON.stringify(symbols), start]);

  return (
    <MultiLineChart
      series={chartSeries}
      title={title}
      height={height}
      baseline={100}
      loading={loading}
      error={error}
    />
  );
}
