'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, AreaSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, LineData, Time } from 'lightweight-charts';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastValue, setLastValue] = useState<number | null>(null);

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

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: lineColor + '30',
      bottomColor: lineColor + '05',
      lineWidth: 2,
    });

    // Band lines
    let highSeries: ReturnType<typeof chart.addSeries<'Line'>> | null = null;
    let lowSeries: ReturnType<typeof chart.addSeries<'Line'>> | null = null;

    if (bandHigh !== undefined) {
      highSeries = chart.addSeries(LineSeries, {
        color: 'rgba(255, 23, 68, 0.4)',
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }

    if (bandLow !== undefined) {
      lowSeries = chart.addSeries(LineSeries, {
        color: 'rgba(0, 230, 118, 0.4)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    fetch(
      `/api/market/ratio?numerator=${encodeURIComponent(numerator)}&denominator=${encodeURIComponent(denominator)}&start=${start}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
        } else if (Array.isArray(data) && data.length > 0) {
          const lineData: LineData<Time>[] = data.map((d: { time: string; value: number }) => ({
            time: d.time as Time,
            value: d.value,
          }));
          series.setData(lineData);

          // Draw constant band lines
          if (highSeries && bandHigh !== undefined) {
            highSeries.setData(
              lineData.map((d) => ({ time: d.time, value: bandHigh }))
            );
          }
          if (lowSeries && bandLow !== undefined) {
            lowSeries.setData(
              lineData.map((d) => ({ time: d.time, value: bandLow }))
            );
          }

          chart.timeScale().fitContent();
          setLastValue(data[data.length - 1].value);
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
  }, [numerator, denominator, start, lineColor, bandHigh, bandLow]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {title || `${numerator} / ${denominator}`}
          </span>
          {lastValue !== null && (
            <span className="text-sm font-medium text-zinc-200">
              {lastValue.toFixed(2)}
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
            <span className="text-[10px] text-red-500 uppercase tracking-wider truncate max-w-48">Error</span>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
