'use client';

// ─── MultiLineChart ──────────────────────────────────────────────
// Canvas-based multi-series line chart. No external charting library.
// Used by ComparisonChart and FredMultiLine.

import { useEffect, useRef, useCallback } from 'react';

interface DataPoint {
  time: string;
  value: number;
}

export interface ChartSeries {
  label: string;
  color: string;
  data: DataPoint[];
}

interface MultiLineChartProps {
  series: ChartSeries[];
  title?: string;
  height?: number;
  baseline?: number;
  loading?: boolean;
  error?: string | null;
}

function fmtAxis(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(0)}K`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

export function MultiLineChart({
  series,
  title,
  height = 300,
  baseline,
  loading,
  error,
}: MultiLineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || series.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 8, right: 56, bottom: 24, left: 8 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Find global min/max across all series
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const s of series) {
      for (const p of s.data) {
        if (p.value < minVal) minVal = p.value;
        if (p.value > maxVal) maxVal = p.value;
      }
    }

    if (baseline !== undefined) {
      minVal = Math.min(minVal, baseline);
      maxVal = Math.max(maxVal, baseline);
    }

    const valRange = maxVal - minVal || 1;
    const valPad = valRange * 0.06;
    minVal -= valPad;
    maxVal += valPad;
    const totalRange = maxVal - minVal;

    const toX = (i: number, len: number) =>
      pad.left + (i / Math.max(len - 1, 1)) * plotW;
    const toY = (v: number) =>
      pad.top + (1 - (v - minVal) / totalRange) * plotH;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(30, 30, 40, 0.6)';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = Math.round(pad.top + (i / gridLines) * plotH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      const val = maxVal - (i / gridLines) * totalRange;
      ctx.fillStyle = '#4b5563';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(fmtAxis(val), w - pad.right + 6, y + 3);
    }

    // Baseline
    if (baseline !== undefined) {
      const y = Math.round(toY(baseline)) + 0.5;
      ctx.strokeStyle = 'rgba(100, 100, 120, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Series lines
    for (const s of series) {
      if (s.data.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < s.data.length; i++) {
        const x = toX(i, s.data.length);
        const y = toY(s.data[i].value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Time axis labels
    const longest = series.reduce((a, b) =>
      a.data.length > b.data.length ? a : b
    );
    if (longest.data.length > 0) {
      const step = Math.max(1, Math.floor(longest.data.length / 6));
      ctx.fillStyle = '#4b5563';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < longest.data.length; i += step) {
        const x = toX(i, longest.data.length);
        const label = longest.data[i].time.slice(5); // MM-DD
        ctx.fillText(label, x, h - 4);
      }
    }
  }, [series, height, baseline]);

  // Draw on mount and data change
  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Legend
  const legendItems = series.map((s) => {
    const last = s.data.length > 0 ? s.data[s.data.length - 1].value : 0;
    return { label: s.label, color: s.color, value: last };
  });

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        {title && (
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {title}
          </span>
        )}
        <div className="flex items-center gap-4">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-0.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[10px] text-zinc-400">{item.label}</span>
              <span
                className="text-[10px] font-medium font-mono tabular-nums"
                style={{
                  color:
                    baseline !== undefined
                      ? item.value >= baseline
                        ? '#00e676'
                        : '#ff1744'
                      : '#d4d4d8',
                }}
              >
                {baseline !== undefined
                  ? `${item.value >= baseline ? '+' : ''}${(item.value - baseline).toFixed(1)}%`
                  : item.value.toFixed(2)}
              </span>
            </div>
          ))}
          {loading && (
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
              Loading...
            </span>
          )}
          {error && (
            <span className="text-[10px] text-red-500 uppercase tracking-wider">
              Error
            </span>
          )}
        </div>
      </div>
      <div ref={containerRef}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
