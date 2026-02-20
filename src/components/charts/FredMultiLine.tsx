'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries } from 'lightweight-charts';
import type { LineData, Time } from 'lightweight-charts';

const DEFAULT_COLORS = [
  '#448aff', '#00e676', '#ff9100', '#e040fb', '#ff1744', '#ffea00', '#00e5ff',
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ label: string; color: string; value: string }[]>([]);

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
      rightPriceScale: { borderColor: 'rgba(30, 30, 40, 0.8)' },
      timeScale: { borderColor: 'rgba(30, 30, 40, 0.8)', timeVisible: false },
    });

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    const ids = seriesConfig.map((s) => s.id).join(',');

    fetch(`/api/market/fred?series=${encodeURIComponent(ids)}&start=${start}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
          setLoading(false);
          return;
        }

        const legendItems: { label: string; color: string; value: string }[] = [];

        seriesConfig.forEach((cfg, i) => {
          const seriesData = data[cfg.id];
          if (!Array.isArray(seriesData) || seriesData.length === 0) return;

          const color = cfg.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
          const line = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
          });

          const lineData: LineData<Time>[] = seriesData.map(
            (d: { time: string; value: number }) => ({
              time: d.time as Time,
              value: d.value,
            })
          );

          line.setData(lineData);

          const lastVal = seriesData[seriesData.length - 1]?.value;
          legendItems.push({
            label: cfg.label,
            color,
            value: lastVal !== undefined ? lastVal.toFixed(2) : '—',
          });
        });

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
  }, [JSON.stringify(seriesConfig), start]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          {title}
        </span>
        <div className="flex items-center gap-4">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-zinc-400">{item.label}</span>
              <span className="text-[10px] font-medium text-zinc-300">{item.value}</span>
            </div>
          ))}
          {loading && <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Loading...</span>}
          {error && <span className="text-[10px] text-red-500 uppercase tracking-wider">Error</span>}
        </div>
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
