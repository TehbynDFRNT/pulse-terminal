'use client';

// ─── FredMultiLine ───────────────────────────────────────────────
// Fetches FRED economic data series and renders via MultiLineChart.

import { useState, useEffect } from 'react';
import { MultiLineChart, type ChartSeries } from './MultiLineChart';

const DEFAULT_COLORS = [
  '#448aff', '#00e676', '#ff9100', '#e040fb',
  '#ff1744', '#ffea00', '#00e5ff',
];

interface FredSeries {
  id: string;
  label: string;
  color?: string;
}

interface FredMultiLineProps {
  series: FredSeries[];
  title: string;
  start?: string;
  height?: number;
  yAxisLabel?: string;
}

export function FredMultiLine({
  series: seriesConfig,
  title,
  start = '2020-01-01',
  height = 300,
}: FredMultiLineProps) {
  const [chartSeries, setChartSeries] = useState<ChartSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const ids = seriesConfig.map((s) => s.id).join(',');

    fetch(`/api/market/fred?series=${encodeURIComponent(ids)}&start=${start}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(typeof data.error === 'string' ? data.error : 'Failed to load');
          setLoading(false);
          return;
        }

        const result: ChartSeries[] = [];
        seriesConfig.forEach((cfg, i) => {
          const seriesData = data[cfg.id];
          if (!Array.isArray(seriesData) || seriesData.length === 0) return;

          result.push({
            label: cfg.label,
            color: cfg.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
            data: seriesData.map((d: { time: string; value: number }) => ({
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
  }, [JSON.stringify(seriesConfig), start]);

  return (
    <MultiLineChart
      series={chartSeries}
      title={title}
      height={height}
      loading={loading}
      error={error}
    />
  );
}
