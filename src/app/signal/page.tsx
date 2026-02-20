'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdvancedChart } from '@/components/tv/AdvancedChart';
import { RatioChart } from '@/components/charts/RatioChart';
import {
  type PriceData,
  type MacroData,
  type Severity,
  computeRegime,
  generateBrief,
  computeThesis,
  computeSignals,
  computeMovers,
  pickChartSymbol,
} from '@/lib/signals';

// ============ SUB-COMPONENTS ============

function RegimeBar({
  regime,
  loaded,
}: {
  regime: { label: string; status: string }[];
  loaded: boolean;
}) {
  const dot = (s: string) =>
    s === 'bullish'
      ? 'bg-emerald-400'
      : s === 'bearish'
        ? 'bg-red-400'
        : 'bg-zinc-600';
  const text = (s: string) =>
    s === 'bullish'
      ? 'text-emerald-400'
      : s === 'bearish'
        ? 'text-red-400'
        : 'text-zinc-500';

  if (!loaded)
    return (
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
          Loading…
        </span>
      </div>
    );

  return (
    <div className="flex items-center gap-4">
      {regime.map((tag, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${dot(tag.status)}`} />
          <span
            className={`text-[10px] uppercase tracking-widest font-medium ${text(tag.status)}`}
          >
            {tag.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ThesisTracker({
  conditions,
}: {
  conditions: { label: string; met: boolean | null; value: string }[];
}) {
  const met = conditions.filter((c) => c.met === true).length;
  const total = conditions.length;
  const ratio = total > 0 ? met / total : 0;

  return (
    <div className="border-b border-zinc-800/50">
      <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800/30">
        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
          PM Thesis
        </span>
        {total > 0 && (
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              ratio > 0.7
                ? 'text-emerald-400'
                : ratio > 0.4
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}
          >
            {met}/{total}
          </span>
        )}
      </div>
      <div className="py-1">
        {conditions.map((cond, i) => (
          <div key={i} className="flex items-center gap-2.5 px-4 py-[5px]">
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                cond.met === true
                  ? 'bg-emerald-400'
                  : cond.met === false
                    ? 'bg-red-400/50'
                    : 'bg-zinc-700'
              }`}
            />
            <span
              className={`text-[11px] flex-1 ${
                cond.met === true ? 'text-zinc-300' : 'text-zinc-600'
              }`}
            >
              {cond.label}
            </span>
            <span className="text-[10px] text-zinc-500 tabular-nums shrink-0 font-mono">
              {cond.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalList({
  signals,
}: {
  signals: { severity: Severity; headline: string; detail: string }[];
}) {
  const color = (s: Severity) =>
    s === 'bullish'
      ? 'text-emerald-400'
      : s === 'bearish'
        ? 'text-red-400'
        : 'text-amber-400';
  const icon = (s: Severity) =>
    s === 'bullish' ? '▲' : s === 'bearish' ? '▼' : '◆';
  const bar = (s: Severity) =>
    s === 'bullish'
      ? 'border-l-emerald-400/40'
      : s === 'bearish'
        ? 'border-l-red-400/40'
        : 'border-l-amber-400/40';

  return (
    <div className="border-b border-zinc-800/50">
      <div className="px-4 py-2 border-b border-zinc-800/30">
        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
          Signals
        </span>
      </div>
      {signals.slice(0, 4).map((sig, i) => (
        <div
          key={i}
          className={`px-4 py-2.5 border-b border-zinc-800/20 border-l-2 ${bar(sig.severity)} ml-2`}
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] ${color(sig.severity)}`}>
              {icon(sig.severity)}
            </span>
            <span
              className={`text-[11px] font-medium ${color(sig.severity)}`}
            >
              {sig.headline}
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed pl-4">
            {sig.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

function MoverList({
  movers,
}: {
  movers: {
    symbol: string;
    name: string;
    change_pct: number;
    tag?: string;
  }[];
}) {
  return (
    <div>
      <div className="px-4 py-2 border-b border-zinc-800/30">
        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
          Movers
        </span>
      </div>
      {movers.slice(0, 7).map((m, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-4 py-[5px] hover:bg-zinc-800/20 transition-colors"
        >
          <span
            className={`text-[10px] w-3 ${m.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {m.change_pct >= 0 ? '▲' : '▼'}
          </span>
          <span className="text-[11px] text-zinc-400 flex-1 truncate">
            {m.name}
          </span>
          <span
            className={`text-[11px] tabular-nums font-medium font-mono ${
              m.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {m.change_pct >= 0 ? '+' : ''}
            {m.change_pct.toFixed(2)}%
          </span>
          {m.tag && (
            <span className="text-[9px] text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded uppercase tracking-wider">
              {m.tag}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ MAIN PAGE ============

export default function Signal() {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [macro, setMacro] = useState<Record<string, MacroData>>({});
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/market/prices').then((r) => r.json()),
      fetch('/api/market/macro').then((r) => r.json()),
    ])
      .then(([priceData, macroData]) => {
        if (priceData.prices) setPrices(priceData.prices);
        if (priceData.ratios) setRatios(priceData.ratios);
        if (!macroData.error) setMacro(macroData);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const regime = computeRegime(prices, macro, ratios);
  const brief = generateBrief(prices, macro, ratios);
  const thesis = computeThesis(prices, macro, ratios);
  const signals = computeSignals(prices, macro, ratios);
  const movers = computeMovers(prices);
  const chart = pickChartSymbol(movers);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-[#0e0e0e] shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-widest text-zinc-300 uppercase">
            Pulse
          </h1>
          <div className="w-px h-4 bg-zinc-800" />
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors rounded"
            >
              Terminal
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors rounded"
            >
              Dashboard
            </Link>
            <span className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-200 bg-zinc-800/50 rounded">
              Signal
            </span>
          </nav>
        </div>

        <RegimeBar regime={regime} loaded={loaded} />
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT PANEL — Intelligence */}
        <div className="w-[340px] shrink-0 border-r border-zinc-800/80 bg-[#0c0c0c] flex flex-col overflow-y-auto">
          {/* Assessment Brief */}
          <div className="px-4 py-3 border-b border-zinc-800/50">
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
              Assessment
            </div>
            <p className="text-[12px] text-zinc-300 leading-relaxed">
              {loaded ? brief : 'Analysing market conditions…'}
            </p>
          </div>

          {/* Thesis */}
          <ThesisTracker conditions={thesis} />

          {/* Signals */}
          <SignalList signals={signals} />

          {/* Movers */}
          <MoverList movers={movers} />
        </div>

        {/* CENTER — Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Auto-chart header */}
          <div className="px-3 py-1.5 border-b border-zinc-800/40 bg-[#0c0c0c] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                Showing
              </span>
              <span className="text-[11px] text-zinc-300 font-medium">
                {chart.reason}
              </span>
            </div>
            <span className="text-[9px] text-zinc-700 tabular-nums font-mono">
              {chart.tv}
            </span>
          </div>

          {/* Main chart */}
          <div className="flex-1 min-h-0">
            <AdvancedChart symbol={chart.tv} interval="D" />
          </div>

          {/* G/S Ratio strip */}
          <div className="h-[120px] shrink-0 border-t border-zinc-800/60">
            <RatioChart
              numerator="GC=F"
              denominator="SI=F"
              title="Gold / Silver Ratio"
              start={new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}
              height={90}
              lineColor="#ffea00"
              bandHigh={90}
              bandLow={65}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
