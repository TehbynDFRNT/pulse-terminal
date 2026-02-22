'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ValuationData, AssessmentMetric } from '@/lib/valuation-types';
import { STOCK_TYPE_LABELS } from '@/lib/valuation-types';

// ============ TRACK COLORS ============

function trackColors(track: string): { accent: string; bg: string; border: string } {
  switch (track) {
    case 'pm': return { accent: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' };
    case 'energy': return { accent: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/30' };
    case 'ree': return { accent: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/30' };
    default: return { accent: 'text-zinc-400', bg: 'bg-zinc-400/10', border: 'border-zinc-400/30' };
  }
}

// ============ VERDICT STYLING ============

function verdictStyle(verdict: string): { text: string; bg: string; label: string } {
  switch (verdict) {
    case 'undervalued': return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'UNDERVALUED' };
    case 'overvalued': return { text: 'text-red-400', bg: 'bg-red-400/10', label: 'OVERVALUED' };
    case 'fair': return { text: 'text-amber-400', bg: 'bg-amber-400/10', label: 'FAIR VALUE' };
    case 'speculative': return { text: 'text-violet-400', bg: 'bg-violet-400/10', label: 'SPECULATIVE' };
    default: return { text: 'text-zinc-500', bg: 'bg-zinc-500/10', label: 'INSUFFICIENT DATA' };
  }
}

function signalDot(signal: AssessmentMetric['signal']): string {
  switch (signal) {
    case 'bullish': return 'bg-emerald-400';
    case 'bearish': return 'bg-red-400';
    default: return 'bg-amber-400';
  }
}

function confidenceLabel(c: string): { text: string; color: string } {
  switch (c) {
    case 'high': return { text: 'HIGH CONFIDENCE', color: 'text-emerald-400' };
    case 'medium': return { text: 'MEDIUM CONFIDENCE', color: 'text-amber-400' };
    default: return { text: 'LOW CONFIDENCE', color: 'text-zinc-500' };
  }
}

// ============ FAIR VALUE BAR ============

function FairValueBar({ range, currentPrice }: {
  range: { low: number; mid: number; high: number };
  currentPrice: number;
}) {
  const min = Math.min(range.low * 0.8, currentPrice * 0.8);
  const max = Math.max(range.high * 1.2, currentPrice * 1.2);
  const span = max - min;
  if (span <= 0) return null;

  const lowPct = ((range.low - min) / span) * 100;
  const highPct = ((range.high - min) / span) * 100;
  const midPct = ((range.mid - min) / span) * 100;
  const pricePct = ((currentPrice - min) / span) * 100;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[9px] text-zinc-600 mb-1">
        <span>Fair Value Range</span>
        <span className="font-mono tabular-nums">${range.low.toFixed(2)} — ${range.mid.toFixed(2)} — ${range.high.toFixed(2)}</span>
      </div>
      <div className="relative h-2 bg-zinc-800/80 rounded-full overflow-visible">
        {/* Fair value zone */}
        <div
          className="absolute h-full bg-emerald-400/20 rounded-full"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
        {/* Mid marker */}
        <div
          className="absolute top-0 w-px h-full bg-emerald-400/50"
          style={{ left: `${midPct}%` }}
        />
        {/* Current price marker */}
        <div
          className="absolute -top-0.5 w-2.5 h-3 rounded-sm bg-zinc-200 border border-zinc-400"
          style={{ left: `${pricePct}%`, transform: 'translateX(-50%)' }}
          title={`Current: $${currentPrice.toFixed(2)}`}
        />
      </div>
      <div className="flex items-center justify-between text-[8px] text-zinc-700 mt-1">
        <span className="font-mono tabular-nums">${range.low.toFixed(2)}</span>
        <span className="text-zinc-500 font-mono tabular-nums">Current: ${currentPrice.toFixed(2)}</span>
        <span className="font-mono tabular-nums">${range.high.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export function ValuationPanel({
  symbol,
  onClose,
}: {
  symbol: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ValuationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/market/valuation?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol]);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[380px] bg-[#0e0e0e] border-l border-zinc-800/50 z-50 flex flex-col overflow-hidden animate-slide-in-right">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors z-10 text-sm"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                  Loading {symbol}…
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4">
              <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Error</div>
              <p className="text-[11px] text-zinc-500">{error}</p>
            </div>
          )}

          {data && <PanelContent data={data} />}
        </div>
      </div>
    </>
  );
}

// ============ PANEL CONTENT ============

function PanelContent({ data }: { data: ValuationData }) {
  const tc = trackColors(data.track);
  const vs = verdictStyle(data.assessment.verdict);
  const cf = confidenceLabel(data.assessment.confidence);

  return (
    <>
      {/* Header */}
      <div className={`px-4 pt-4 pb-3 border-b ${tc.border}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] text-zinc-100 font-semibold">{data.symbol}</span>
          <span className="text-[11px] text-zinc-500">{data.name}</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[16px] text-zinc-100 font-medium font-mono tabular-nums">
            ${data.price.toFixed(2)}
          </span>
          {data.marketCap > 0 && (
            <span className="text-[10px] text-zinc-600 font-mono tabular-nums">
              MCap {data.marketCap >= 1e12 ? `$${(data.marketCap / 1e12).toFixed(1)}T` : data.marketCap >= 1e9 ? `$${(data.marketCap / 1e9).toFixed(1)}B` : `$${(data.marketCap / 1e6).toFixed(0)}M`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded ${tc.accent} ${tc.bg}`}>
            {STOCK_TYPE_LABELS[data.stockType]}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-zinc-600 px-2 py-0.5 rounded bg-zinc-800/50">
            {data.track.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Verdict */}
      <div className="px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[14px] font-bold tracking-wider ${vs.text}`}>
            {vs.label}
          </span>
          <span className={`text-[9px] uppercase tracking-widest ${cf.color}`}>
            {cf.text}
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          {data.assessment.summary}
        </p>

        {/* Fair value bar */}
        {data.assessment.fairValueRange && (
          <FairValueBar range={data.assessment.fairValueRange} currentPrice={data.price} />
        )}
      </div>

      {/* Metrics Grid */}
      {data.assessment.metrics.length > 0 && (
        <div className="border-b border-zinc-800/50">
          <div className="px-4 py-2 border-b border-zinc-800/30">
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
              Key Metrics
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-zinc-800/30">
            {data.assessment.metrics.map((m, i) => (
              <div key={i} className="bg-[#0e0e0e] px-3 py-2.5 group relative">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${signalDot(m.signal)}`} />
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider truncate">
                    {m.label}
                  </span>
                </div>
                <div className="text-[12px] text-zinc-200 font-mono tabular-nums font-medium pl-3">
                  {m.value}
                </div>
                <div className="text-[9px] text-zinc-600 leading-relaxed pl-3 mt-0.5">
                  {m.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catalysts */}
      {data.assessment.catalysts.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
            What Would Change This
          </div>
          <div className="space-y-1.5">
            {data.assessment.catalysts.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] text-zinc-700 mt-0.5">▸</span>
                <span className="text-[10px] text-zinc-500 leading-relaxed">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
