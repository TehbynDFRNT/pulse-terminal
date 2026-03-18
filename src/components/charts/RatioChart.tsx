'use client';

// ─── RatioChart ──────────────────────────────────────────────────
// Fetches ratio data (numerator/denominator) from yahoo-finance2
// and renders via Liveline with optional band lines.

import { useState, useEffect, useCallback } from 'react';
import { Liveline } from 'liveline';
import type { LivelinePoint } from 'liveline';

interface RatioChartProps {
  numerator: string;
  denominator: string;
  title?: string;
  start?: string;
  height?: number;
  lineColor?: string;
  bandHigh?: number;
  bandLow?: number;
}

const TIME_WINDOWS = [
  { label: '3M', secs: 7_776_000 },
  { label: '6M', secs: 15_552_000 },
  { label: '1Y', secs: 31_536_000 },
  { label: '2Y', secs: 63_072_000 },
];

export function RatioChart({
  numerator,
  denominator,
  title,
  start = '2020-01-01',
  height = 300,
  lineColor = '#00e676',
  bandHigh,
  bandLow,
}: RatioChartProps) {
  const [data, setData] = useState<LivelinePoint[]>([]);
  const [value, setValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [windowSecs, setWindowSecs] = useState(31_536_000);

  useEffect(() => {
    setLoading(true);
    setError(false);

    fetch(
      `/api/market/ratio?numerator=${encodeURIComponent(numerator)}&denominator=${encodeURIComponent(denominator)}&start=${start}`
    )
      .then((r) => r.json())
      .then((result) => {
        if (result.error || !Array.isArray(result) || result.length === 0) {
          setError(true);
          setLoading(false);
          return;
        }

        const points: LivelinePoint[] = result.map(
          (d: { time: string; value: number }) => ({
            time: new Date(d.time).getTime() / 1000,
            value: d.value,
          })
        );
        setData(points);
        setValue(points[points.length - 1].value);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [numerator, denominator, start]);

  const formatValue = useCallback((v: number) => v.toFixed(2), []);

  // Build reference lines from bands
  const referenceLine = bandHigh !== undefined
    ? { value: bandHigh, label: `High: ${bandHigh}` }
    : undefined;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {title || `${numerator} / ${denominator}`}
          </span>
          {value > 0 && (
            <span className="text-sm font-medium text-zinc-200 font-mono tabular-nums">
              {value.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {bandHigh !== undefined && (
            <span className="text-[10px] text-red-400/60">▬ High: {bandHigh}</span>
          )}
          {bandLow !== undefined && (
            <span className="text-[10px] text-emerald-400/60">▬ Low: {bandLow}</span>
          )}
          {loading && (
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Loading...</span>
          )}
          {error && (
            <span className="text-[10px] text-red-500 uppercase tracking-wider">Error</span>
          )}
        </div>
      </div>
      <div style={{ height }}>
        <Liveline
          data={data}
          value={value}
          color={lineColor}
          theme="dark"
          window={windowSecs}
          windows={TIME_WINDOWS}
          onWindowChange={setWindowSecs}
          windowStyle="text"
          grid
          fill
          scrub
          showValue
          loading={loading}
          emptyText={error ? 'Failed to load data' : 'Loading...'}
          formatValue={formatValue}
          referenceLine={referenceLine}
        />
      </div>
    </div>
  );
}
