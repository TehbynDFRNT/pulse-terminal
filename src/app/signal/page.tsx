'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdvancedChart } from '@/components/tv/AdvancedChart';
import { RatioChart } from '@/components/charts/RatioChart';
import {
  type PriceData,
  type MacroData,
  type Severity,
  type Track,
  type FundamentalsContext,
  TRACKS,
  computeRegime,
  generateBrief,
  computeThesis,
  computeSignals,
  computeMovers,
  pickChartSymbol,
  getTrackRatioConfig,
} from '@/lib/signals';
import {
  type CompositeSignal,
  computeCompositeSignals,
  CHINA_LEVERAGE_CONFIG,
} from '@/lib/composite-signals';
import type {
  FundamentalsDeepData,
  ProjectMilestone,
  CatalystEvent,
} from '@/lib/fundamentals-types';
import { CATALYST_CALENDAR } from '@/lib/fundamentals-types';

// ============ TRACK COLOR UTILS ============

function trackAccent(track: Track): {
  textActive: string;
  bgTab: string;
  border: string;
  labelText: string;
} {
  switch (track) {
    case 'pm':
      return {
        textActive: 'text-yellow-400',
        bgTab: 'bg-yellow-400/10',
        border: 'border-yellow-400/30',
        labelText: 'text-yellow-500/70',
      };
    case 'energy':
      return {
        textActive: 'text-cyan-400',
        bgTab: 'bg-cyan-400/10',
        border: 'border-cyan-400/30',
        labelText: 'text-cyan-500/70',
      };
    case 'ree':
      return {
        textActive: 'text-violet-400',
        bgTab: 'bg-violet-400/10',
        border: 'border-violet-400/30',
        labelText: 'text-violet-500/70',
      };
  }
}

// ============ EXISTING SUB-COMPONENTS ============

function TrackTabs({
  active,
  onSelect,
}: {
  active: Track;
  onSelect: (t: Track) => void;
}) {
  const tracks: Track[] = ['pm', 'energy', 'ree'];

  return (
    <div className="flex items-center gap-1">
      {tracks.map((t) => {
        const isActive = t === active;
        const accent = trackAccent(t);
        return (
          <button
            key={t}
            onClick={() => onSelect(t)}
            className={`px-3 py-1 text-[10px] uppercase tracking-widest rounded transition-all ${
              isActive
                ? `${accent.textActive} ${accent.bgTab}`
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {TRACKS[t].shortName}
          </button>
        );
      })}
    </div>
  );
}

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
  track,
  conditions,
}: {
  track: Track;
  conditions: { label: string; met: boolean | null; value: string }[];
}) {
  const met = conditions.filter((c) => c.met === true).length;
  const total = conditions.length;
  const ratio = total > 0 ? met / total : 0;
  const accent = trackAccent(track);

  return (
    <div className="border-b border-zinc-800/50">
      <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800/30">
        <span className={`text-[10px] uppercase tracking-widest ${accent.labelText}`}>
          {TRACKS[track].shortName} Thesis
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
    <div className="border-b border-zinc-800/50">
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

// ============ NEW COMPONENTS — Structural Indicators ============

function StructuralIndicators({
  composites,
  track,
}: {
  composites: CompositeSignal[];
  track: Track;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const accent = trackAccent(track);

  if (composites.length === 0) return null;

  return (
    <div className="border-b border-zinc-800/50">
      <div className="px-4 py-2 border-b border-zinc-800/30">
        <span className={`text-[10px] uppercase tracking-widest ${accent.labelText}`}>
          Structural Indicators
        </span>
      </div>
      <div className="py-1">
        {composites.map((sig) => {
          const isExpanded = expanded === sig.key;
          const pct = sig.maxScore === 10 ? (sig.score / 10) * 100 : sig.score;
          const barColor =
            pct > 70 ? 'bg-emerald-400' : pct > 40 ? 'bg-amber-400' : 'bg-red-400';
          const textColor =
            pct > 70 ? 'text-emerald-400' : pct > 40 ? 'text-amber-400' : 'text-red-400';
          const trendIcon = sig.trend === 'improving' ? '↑' : sig.trend === 'declining' ? '↓' : '→';
          const trendColor = sig.trend === 'improving' ? 'text-emerald-400' : sig.trend === 'declining' ? 'text-red-400' : 'text-zinc-600';

          return (
            <div key={sig.key}>
              <button
                onClick={() => setExpanded(isExpanded ? null : sig.key)}
                className="w-full px-4 py-2 hover:bg-zinc-800/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                    <span className="text-[11px] text-zinc-300">{sig.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${trendColor}`}>{trendIcon}</span>
                    <span className={`text-[11px] font-mono tabular-nums font-semibold ${textColor}`}>
                      {sig.score}{sig.maxScore === 10 ? '/10' : ''}
                    </span>
                  </div>
                </div>
                <div className="w-full h-1 bg-zinc-800/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-2 pl-8">
                  {sig.components.map((comp, ci) => (
                    <div key={ci} className="flex items-center justify-between py-1 border-b border-zinc-800/20 last:border-0">
                      <span className="text-[10px] text-zinc-500">{comp.name}</span>
                      <span className="text-[10px] text-zinc-600 font-mono tabular-nums">{comp.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ NEW COMPONENTS — Fundamental Data ============

interface FundMetric {
  label: string;
  value: string;
  direction: 'up' | 'down' | 'neutral';
  asOf: string;
  source: string;
}

function FundamentalData({
  metrics,
  track,
}: {
  metrics: FundMetric[];
  track: Track;
}) {
  const accent = trackAccent(track);

  if (metrics.length === 0) return null;

  const dirIcon = (d: 'up' | 'down' | 'neutral') =>
    d === 'up' ? '↑' : d === 'down' ? '↓' : '→';
  const dirColor = (d: 'up' | 'down' | 'neutral') =>
    d === 'up' ? 'text-emerald-400' : d === 'down' ? 'text-red-400' : 'text-zinc-600';

  return (
    <div className="border-b border-zinc-800/50">
      <div className="px-4 py-2 border-b border-zinc-800/30">
        <span className={`text-[10px] uppercase tracking-widest ${accent.labelText}`}>
          Fundamental Data
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-zinc-800/30">
        {metrics.map((m, i) => (
          <div key={i} className="bg-[#0c0c0c] px-3 py-2">
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">
              {m.label}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-zinc-200 font-mono tabular-nums font-medium">
                {m.value}
              </span>
              <span className={`text-[10px] ${dirColor(m.direction)}`}>
                {dirIcon(m.direction)}
              </span>
            </div>
            <div className="text-[8px] text-zinc-700 mt-0.5" title={m.source}>
              {m.asOf}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ NEW COMPONENTS — Project Pipeline ============

function ProjectPipeline({
  projects,
}: {
  projects: ProjectMilestone[];
}) {
  if (projects.length === 0) return null;

  const statusDot = (s: ProjectMilestone['status']) => {
    switch (s) {
      case 'completed': return 'bg-emerald-400';
      case 'on-track': return 'bg-emerald-400/70';
      case 'planned': return 'bg-zinc-500';
      case 'delayed': return 'bg-amber-400';
      case 'at-risk': return 'bg-red-400';
    }
  };

  return (
    <div className="border-b border-zinc-800/50">
      <div className="px-4 py-2 border-b border-zinc-800/30">
        <span className="text-[10px] text-violet-500/70 uppercase tracking-widest">
          Project Pipeline
        </span>
      </div>
      <div className="py-1">
        {projects.map((p, i) => (
          <div key={i} className="px-4 py-2 border-b border-zinc-800/20 last:border-0 hover:bg-zinc-800/20 transition-colors group">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(p.status)}`} />
              <span className="text-[11px] text-zinc-300 font-medium">{p.company}</span>
              <span className="text-[10px] text-zinc-600 ml-auto font-mono tabular-nums">{p.expectedDate}</span>
            </div>
            <div className="pl-3.5">
              <div className="text-[10px] text-zinc-500">{p.project}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  {p.status.replace('-', ' ')}
                </span>
                <span className="text-[9px] text-zinc-600">{p.funding}</span>
              </div>
              <div className="text-[9px] text-zinc-700 mt-1 leading-relaxed hidden group-hover:block">
                {p.notes}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ NEW COMPONENTS — Catalyst Calendar ============

function CatalystCalendar({
  events,
  track,
}: {
  events: CatalystEvent[];
  track: Track;
}) {
  const accent = trackAccent(track);
  const filtered = events
    .filter(e => e.track === track || e.track === 'all')
    .sort((a, b) => a.date.localeCompare(b.date));

  // Show only upcoming or recent events (within 30 days past, 90 days future)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const ninetyDaysAhead = new Date(now.getTime() + 90 * 86400000);
  const relevant = filtered.filter(e => {
    const d = new Date(e.date);
    return d >= thirtyDaysAgo && d <= ninetyDaysAhead;
  });

  if (relevant.length === 0) return null;

  const importanceColor = (imp: CatalystEvent['importance']) => {
    switch (imp) {
      case 'high': return 'text-amber-400';
      case 'medium': return 'text-zinc-400';
      case 'low': return 'text-zinc-600';
    }
  };

  const isPast = (dateStr: string) => new Date(dateStr) < now;

  return (
    <div className="border-b border-zinc-800/50">
      <div className="px-4 py-2 border-b border-zinc-800/30">
        <span className={`text-[10px] uppercase tracking-widest ${accent.labelText}`}>
          Catalyst Calendar
        </span>
      </div>
      <div className="py-1">
        {relevant.slice(0, 6).map((evt, i) => {
          const past = isPast(evt.date);
          const d = new Date(evt.date);
          const dateLabel = d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 px-4 py-[5px] ${past ? 'opacity-40' : ''}`}
            >
              <span className="text-[10px] text-zinc-600 font-mono tabular-nums w-12 shrink-0">
                {dateLabel}
              </span>
              <div className={`w-1 h-1 rounded-full shrink-0 ${
                evt.importance === 'high' ? 'bg-amber-400' : evt.importance === 'medium' ? 'bg-zinc-500' : 'bg-zinc-700'
              }`} />
              <span className={`text-[10px] flex-1 ${importanceColor(evt.importance)}`}>
                {evt.label}
              </span>
              {past && (
                <span className="text-[8px] text-zinc-700 uppercase tracking-wider">past</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ HELPER: Build fundamental metrics for active track ============

function buildFundamentalMetrics(
  track: Track,
  fundamentals: FundamentalsDeepData | null,
): FundMetric[] {
  if (!fundamentals) return [];

  switch (track) {
    case 'energy': {
      const e = fundamentals.energy;
      const metrics: FundMetric[] = [];
      if (e.sputHoldings.lbs != null) {
        metrics.push({
          label: 'SPUT Holdings',
          value: `${(e.sputHoldings.lbs / 1_000_000).toFixed(1)}M lbs`,
          direction: 'neutral',
          asOf: e.sputHoldings.asOf ? new Date(e.sputHoldings.asOf).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) : '',
          source: e.sputHoldings.source,
        });
      }
      if (e.uraniumSpot.price != null) {
        metrics.push({
          label: 'U3O8 Spot',
          value: `$${e.uraniumSpot.price.toFixed(0)}/lb`,
          direction: e.uraniumSpot.price > 80 ? 'up' : e.uraniumSpot.price < 60 ? 'down' : 'neutral',
          asOf: e.uraniumSpot.date || '',
          source: e.uraniumSpot.source,
        });
      }
      if (e.reactorCount.operational != null) {
        metrics.push({
          label: 'US Reactors',
          value: String(e.reactorCount.operational),
          direction: 'neutral',
          asOf: new Date(e.reactorCount.asOf).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }),
          source: e.reactorCount.source,
        });
      }
      if (e.gridQueue.totalMW != null) {
        metrics.push({
          label: 'Grid Queue',
          value: `${(e.gridQueue.totalMW / 1_000_000).toFixed(1)}TW`,
          direction: 'up',
          asOf: e.gridQueue.asOf ? new Date(e.gridQueue.asOf).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) : '',
          source: e.gridQueue.source,
        });
      }
      return metrics;
    }
    case 'ree': {
      const r = fundamentals.ree;
      const metrics: FundMetric[] = [];
      if (r.ndprPrice.price != null) {
        metrics.push({
          label: 'NdPr Price',
          value: `$${r.ndprPrice.price.toFixed(0)}/kg`,
          direction: r.ndprPrice.price > 80 ? 'up' : r.ndprPrice.price < 60 ? 'down' : 'neutral',
          asOf: r.ndprPrice.asOf ? new Date(r.ndprPrice.asOf).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) : '',
          source: r.ndprPrice.source,
        });
      }
      if (r.copperStocks.tonnes != null) {
        metrics.push({
          label: 'Cu Stocks',
          value: `${(r.copperStocks.tonnes / 1000).toFixed(0)}K t`,
          direction: r.copperStocks.tonnes < 150_000 ? 'down' : r.copperStocks.tonnes > 250_000 ? 'up' : 'neutral',
          asOf: r.copperStocks.asOf ? new Date(r.copperStocks.asOf).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) : '',
          source: r.copperStocks.source,
        });
      }
      metrics.push({
        label: 'REMX Flow',
        value: r.remxFlows.flowDirection === 'inflow' ? 'Inflow' : r.remxFlows.flowDirection === 'outflow' ? 'Outflow' : 'Neutral',
        direction: r.remxFlows.flowDirection === 'inflow' ? 'up' : r.remxFlows.flowDirection === 'outflow' ? 'down' : 'neutral',
        asOf: 'Live',
        source: r.remxFlows.source,
      });
      const onTrack = r.projectPipeline.filter(p => p.status === 'on-track' || p.status === 'completed').length;
      metrics.push({
        label: 'Pipeline',
        value: `${onTrack}/${r.projectPipeline.length} on track`,
        direction: onTrack / r.projectPipeline.length > 0.5 ? 'up' : 'down',
        asOf: '',
        source: 'Manual tracking',
      });
      return metrics;
    }
    case 'pm': {
      const pm = fundamentals.pm;
      const metrics: FundMetric[] = [];
      if (pm.centralBankBuying.tonnes != null) {
        metrics.push({
          label: 'CB Gold Buying',
          value: `${pm.centralBankBuying.tonnes}t`,
          direction: pm.centralBankBuying.tonnes > 800 ? 'up' : 'neutral',
          asOf: pm.centralBankBuying.period || '',
          source: pm.centralBankBuying.source,
        });
      }
      return metrics;
    }
  }
}

// ============ HELPER: Build fundamentals context for brief generation ============

function buildFundamentalsContext(
  fundamentals: FundamentalsDeepData | null,
): FundamentalsContext | undefined {
  if (!fundamentals) return undefined;

  const pipeline = fundamentals.ree.projectPipeline;
  const onTrack = pipeline.filter(p => p.status === 'on-track' || p.status === 'completed').length;

  return {
    energy: {
      sputLbs: fundamentals.energy.sputHoldings.lbs,
      uraniumSpot: fundamentals.energy.uraniumSpot.price,
      reactorCount: fundamentals.energy.reactorCount.operational,
      gridQueueMW: fundamentals.energy.gridQueue.totalMW,
    },
    ree: {
      ndprPrice: fundamentals.ree.ndprPrice.price,
      copperStocks: fundamentals.ree.copperStocks.tonnes,
      remxFlowDirection: fundamentals.ree.remxFlows.flowDirection,
      projectsOnTrack: onTrack,
      projectsTotal: pipeline.length,
    },
    pm: {
      centralBankTonnes: fundamentals.pm.centralBankBuying.tonnes,
      centralBankPeriod: fundamentals.pm.centralBankBuying.period,
    },
  };
}

// ============ MAIN PAGE ============

export default function Signal() {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [macro, setMacro] = useState<Record<string, MacroData>>({});
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [fundamentals, setFundamentals] = useState<FundamentalsDeepData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeTrack, setActiveTrack] = useState<Track>('pm');

  useEffect(() => {
    Promise.all([
      fetch('/api/market/prices').then((r) => r.json()),
      fetch('/api/market/macro').then((r) => r.json()),
      fetch('/api/market/fundamentals-deep').then((r) => r.json()).catch(() => null),
    ])
      .then(([priceData, macroData, fundData]) => {
        if (priceData.prices) setPrices(priceData.prices);
        if (priceData.ratios) setRatios(priceData.ratios);
        if (!macroData.error) setMacro(macroData);
        if (fundData && !fundData.error) setFundamentals(fundData);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const fundCtx = buildFundamentalsContext(fundamentals);

  const regime = computeRegime(activeTrack, prices, macro, ratios);
  const brief = generateBrief(activeTrack, prices, macro, ratios, fundCtx);
  const thesis = computeThesis(activeTrack, prices, macro, ratios);
  const signals = computeSignals(activeTrack, prices, macro, ratios);
  const movers = computeMovers(activeTrack, prices);
  const chart = pickChartSymbol(activeTrack, movers);
  const ratioConfig = getTrackRatioConfig(activeTrack);
  const accent = trackAccent(activeTrack);

  // Composite signals (only if fundamentals loaded)
  const composites = fundamentals
    ? computeCompositeSignals(activeTrack, prices, macro, fundamentals, CHINA_LEVERAGE_CONFIG)
    : [];

  // Fundamental metrics
  const fundMetrics = buildFundamentalMetrics(activeTrack, fundamentals);

  // Project pipeline (REE only)
  const projectPipeline = activeTrack === 'ree' && fundamentals
    ? fundamentals.ree.projectPipeline
    : [];

  // Catalyst events for active track
  const catalystEvents = CATALYST_CALENDAR;

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
          <div className="w-px h-4 bg-zinc-800" />
          <TrackTabs active={activeTrack} onSelect={setActiveTrack} />
        </div>

        <RegimeBar regime={regime} loaded={loaded} />
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT PANEL — Intelligence */}
        <div className="w-[340px] shrink-0 border-r border-zinc-800/80 bg-[#0c0c0c] flex flex-col overflow-y-auto">
          {/* Track Description */}
          <div className={`px-4 py-2 border-b ${accent.border} bg-gradient-to-r from-zinc-900/80 to-transparent`}>
            <span className={`text-[10px] uppercase tracking-widest font-medium ${accent.textActive}`}>
              {TRACKS[activeTrack].name}
            </span>
            <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">
              {TRACKS[activeTrack].description}
            </p>
          </div>

          {/* Assessment Brief */}
          <div className="px-4 py-3 border-b border-zinc-800/50">
            <div className={`text-[10px] uppercase tracking-widest mb-2 ${accent.labelText}`}>
              Assessment
            </div>
            <p className="text-[12px] text-zinc-300 leading-relaxed">
              {loaded ? brief : 'Analysing market conditions…'}
            </p>
          </div>

          {/* Thesis */}
          <ThesisTracker track={activeTrack} conditions={thesis} />

          {/* Signals */}
          <SignalList signals={signals} />

          {/* Movers */}
          <MoverList movers={movers} />

          {/* ===== NEW SECTIONS BELOW ===== */}

          {/* Structural Indicators */}
          {composites.length > 0 && (
            <StructuralIndicators composites={composites} track={activeTrack} />
          )}

          {/* Fundamental Data */}
          {fundMetrics.length > 0 && (
            <FundamentalData metrics={fundMetrics} track={activeTrack} />
          )}

          {/* Project Pipeline (REE only) */}
          {projectPipeline.length > 0 && (
            <ProjectPipeline projects={projectPipeline} />
          )}

          {/* Catalyst Calendar */}
          <CatalystCalendar events={catalystEvents} track={activeTrack} />
        </div>

        {/* CENTER — Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Auto-chart header */}
          <div className="px-3 py-1.5 border-b border-zinc-800/40 bg-[#0c0c0c] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                Showing
              </span>
              <span className={`text-[11px] font-medium ${accent.textActive}`}>
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

          {/* Ratio strip */}
          <div className="h-[120px] shrink-0 border-t border-zinc-800/60">
            <RatioChart
              numerator={ratioConfig.numerator}
              denominator={ratioConfig.denominator}
              title={ratioConfig.title}
              start={new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}
              height={90}
              lineColor={ratioConfig.lineColor}
              bandHigh={ratioConfig.bandHigh}
              bandLow={ratioConfig.bandLow}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
