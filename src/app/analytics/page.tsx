'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CandlestickChart } from '@/components/charts/CandlestickChart';
import { RatioChart } from '@/components/charts/RatioChart';
import { ComparisonChart } from '@/components/charts/ComparisonChart';
import { FredMultiLine } from '@/components/charts/FredMultiLine';
import { InsiderTable } from '@/components/charts/InsiderTable';
import { FundamentalsGrid } from '@/components/charts/FundamentalsGrid';

type View = 'metals' | 'macro' | 'flows';
type Period = '1y' | '2y' | '5y';

const PERIOD_STARTS: Record<Period, string> = {
  '1y': new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
  '2y': new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10),
  '5y': new Date(Date.now() - 1825 * 86400000).toISOString().slice(0, 10),
};

const MINER_COMPARISON = [
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'NST.AX', label: 'NST' },
  { symbol: 'EVN.AX', label: 'EVN' },
  { symbol: 'RMS.AX', label: 'RMS' },
  { symbol: 'GOR.AX', label: 'GOR' },
];

const METALS_COMPARISON = [
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'SI=F', label: 'Silver' },
  { symbol: 'PL=F', label: 'Platinum' },
  { symbol: 'PA=F', label: 'Palladium' },
];

const MACRO_COMPARISON = [
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'DX-Y.NYB', label: 'DXY' },
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
];

const FLOW_SYMBOLS = [
  { symbol: 'GLD', label: 'Gold ETF (GLD)' },
  { symbol: 'SLV', label: 'Silver ETF (SLV)' },
  { symbol: 'SPY', label: 'S&P 500 (SPY)' },
  { symbol: 'NEM', label: 'Newmont (NEM)' },
];

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('1y');
  const [view, setView] = useState<View>('metals');
  const [flowSymbol, setFlowSymbol] = useState('GLD');
  const start = PERIOD_STARTS[period];

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
              Analytics
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* View switcher */}
          <div className="flex items-center gap-1">
            {(['metals', 'macro', 'flows'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-[10px] uppercase tracking-widest rounded transition-colors ${
                  view === v
                    ? 'text-zinc-200 bg-zinc-800/60'
                    : 'text-zinc-500 hover:text-zinc-400'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-zinc-800" />
          {/* Period switcher */}
          <div className="flex items-center gap-1">
            {(['1y', '2y', '5y'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-[10px] uppercase tracking-widest rounded transition-colors ${
                  period === p
                    ? 'text-zinc-200 bg-zinc-800/60'
                    : 'text-zinc-500 hover:text-zinc-400'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto p-4 space-y-1">

          {/* ===== METALS VIEW ===== */}
          {view === 'metals' && (
            <>
              {/* Row 1: Gold candlestick + Gold/Silver ratio */}
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <CandlestickChart
                    symbol="GC=F"
                    title="Gold Futures"
                    start={start}
                    height={340}
                  />
                </div>
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <RatioChart
                    numerator="GC=F"
                    denominator="SI=F"
                    title="Gold / Silver Ratio"
                    start={start}
                    height={340}
                    lineColor="#ffea00"
                    bandHigh={90}
                    bandLow={65}
                  />
                </div>
              </div>

              {/* Row 2: Silver candlestick + Copper/Gold ratio */}
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <CandlestickChart
                    symbol="SI=F"
                    title="Silver Futures"
                    start={start}
                    height={340}
                  />
                </div>
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <RatioChart
                    numerator="CPER"
                    denominator="GLD"
                    title="Copper / Gold Ratio (recession signal)"
                    start={start}
                    height={340}
                    lineColor="#ff9100"
                  />
                </div>
              </div>

              {/* Row 3: Miner leverage vs Gold */}
              <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                <ComparisonChart
                  symbols={MINER_COMPARISON}
                  title="ASX Gold Miners vs Gold (rebased to 100)"
                  start={start}
                  height={380}
                />
              </div>

              {/* Row 4: Metals comparison + Macro comparison */}
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <ComparisonChart
                    symbols={METALS_COMPARISON}
                    title="Precious Metals (rebased)"
                    start={start}
                    height={320}
                  />
                </div>
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <ComparisonChart
                    symbols={MACRO_COMPARISON}
                    title="Gold vs Macro (rebased)"
                    start={start}
                    height={320}
                  />
                </div>
              </div>
            </>
          )}

          {/* ===== MACRO VIEW (FRED) ===== */}
          {view === 'macro' && (
            <>
              {/* Row 1: Treasury Yields */}
              <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                <FredMultiLine
                  series={[
                    { id: 'DGS2', label: '2Y Yield', color: '#448aff' },
                    { id: 'DGS10', label: '10Y Yield', color: '#00e676' },
                    { id: 'DGS30', label: '30Y Yield', color: '#ff9100' },
                  ]}
                  title="Treasury Yields"
                  start={start}
                  height={320}
                />
              </div>

              {/* Row 2: Yield Spread + Real Rates */}
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'T10Y2Y', label: '10Y-2Y Spread', color: '#ffea00' },
                    ]}
                    title="Yield Curve (10Y-2Y) — Inversion = Recession Signal"
                    start={start}
                    height={300}
                  />
                </div>
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'DGS10', label: '10Y Nominal', color: '#448aff' },
                      { id: 'T10YIE', label: '10Y Breakeven', color: '#ff9100' },
                      { id: 'DFII10', label: '10Y Real Rate', color: '#00e676' },
                    ]}
                    title="Real Rates & Inflation Expectations"
                    start={start}
                    height={300}
                  />
                </div>
              </div>

              {/* Row 3: Fed Funds + Financial Stress */}
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'FEDFUNDS', label: 'Fed Funds Rate', color: '#e040fb' },
                      { id: 'MORTGAGE30US', label: '30Y Mortgage', color: '#ff9100' },
                    ]}
                    title="Policy Rates"
                    start={start}
                    height={300}
                  />
                </div>
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'STLFSI4', label: 'Financial Stress', color: '#ff1744' },
                    ]}
                    title="St. Louis Fed Financial Stress Index"
                    start={start}
                    height={300}
                  />
                </div>
              </div>

              {/* Row 4: Money Supply + Dollar */}
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'M2SL', label: 'M2 Money Supply ($T)', color: '#00e5ff' },
                    ]}
                    title="M2 Money Supply"
                    start={start}
                    height={300}
                  />
                </div>
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'DTWEXBGS', label: 'Trade-Weighted USD', color: '#ffea00' },
                    ]}
                    title="Trade-Weighted Dollar Index (Broad)"
                    start={start}
                    height={300}
                  />
                </div>
              </div>

              {/* Row 5: CPI + Unemployment */}
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'CPIAUCSL', label: 'CPI (All Urban)', color: '#ff9100' },
                    ]}
                    title="Consumer Price Index"
                    start={start}
                    height={300}
                  />
                </div>
                <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                  <FredMultiLine
                    series={[
                      { id: 'UNRATE', label: 'Unemployment %', color: '#ff1744' },
                      { id: 'ICSA', label: 'Initial Claims', color: '#448aff' },
                    ]}
                    title="Labour Market"
                    start={start}
                    height={300}
                  />
                </div>
              </div>
            </>
          )}

          {/* ===== FLOWS VIEW (FMP Fundamentals) ===== */}
          {view === 'flows' && (
            <>
              {/* Gold Miners Fundamentals Comparison */}
              <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded p-2">
                <div className="px-3 py-2 mb-2">
                  <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Gold Miner Fundamentals (FMP)
                  </span>
                </div>
                <FundamentalsGrid symbols={['NEM', 'AEM', 'GOLD', 'WPM', 'FNV']} />
              </div>

              {/* Major ETF Fundamentals */}
              <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded p-2">
                <div className="px-3 py-2 mb-2">
                  <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Precious Metals ETFs (FMP)
                  </span>
                </div>
                <FundamentalsGrid symbols={['GLD', 'SLV', 'PPLT', 'GDX', 'GDXJ']} />
              </div>

              {/* Miner Performance */}
              <div className="bg-[#0c0c0c] border border-zinc-800/50 rounded">
                <ComparisonChart
                  symbols={[
                    { symbol: 'NEM', label: 'Newmont' },
                    { symbol: 'AEM', label: 'Agnico Eagle' },
                    { symbol: 'GOLD', label: 'Barrick' },
                    { symbol: 'WPM', label: 'Wheaton PM' },
                    { symbol: 'GC=F', label: 'Gold' },
                  ]}
                  title="Gold Miners vs Gold Price (rebased)"
                  start={start}
                  height={380}
                />
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
