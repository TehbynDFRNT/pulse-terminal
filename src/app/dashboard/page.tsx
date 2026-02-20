'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TickerTape } from '@/components/tv/TickerTape';
import { AdvancedChart } from '@/components/tv/AdvancedChart';
import { TopStories } from '@/components/tv/TopStories';
import { RatioChart } from '@/components/charts/RatioChart';

// ============ TYPES ============

interface PriceData {
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  year_high: number | null;
  year_low: number | null;
  ma_50d: number | null;
  error?: string;
}

interface MacroData {
  label: string;
  value: number | null;
  date?: string;
  error?: string;
}

interface FundData {
  name?: string;
  price?: number;
  market_cap?: number;
  pe?: number;
  fwd_pe?: number;
  pb?: number;
  ev_ebitda?: number;
  div_yield?: number;
  roe?: number;
  de?: number;
  beta?: number;
  eps?: number;
  fwd_eps?: number;
  error?: string;
  // Nested shape from /fundamentals endpoint
  profile?: { price?: number; name?: string; [key: string]: unknown };
  metrics?: { pe_ratio?: number; forward_pe?: number; pb_ratio?: number; roe?: number; [key: string]: unknown };
}

interface Snapshot {
  prices: Record<string, PriceData>;
  macro: Record<string, MacroData>;
  fundamentals: Record<string, FundData>;
  ratios: Record<string, number>;
}

// ============ HELPERS ============

const fmtPrice = (n: number | null | undefined, dp = 2) => {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 10000) return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

const fmtPct = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};

const fmtB = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
};

const changeColor = (n: number | null | undefined) => {
  if (n === null || n === undefined) return 'text-zinc-500';
  return n >= 0 ? 'text-emerald-400' : 'text-red-400';
};

// ============ PRICE ROW ============

function PriceRow({ symbol, data, onClick, active }: {
  symbol: string; data: PriceData; onClick: () => void; active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors border-l-2 ${
        active
          ? 'bg-zinc-800/40 border-emerald-400'
          : 'border-transparent hover:bg-zinc-800/20'
      }`}
    >
      <div className="min-w-0">
        <div className="text-[11px] text-zinc-300 font-medium truncate">{data.name}</div>
        <div className="text-[9px] text-zinc-600 uppercase">{symbol}</div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className="text-[12px] text-zinc-200 font-medium tabular-nums">
          {data.price ? fmtPrice(data.price) : '—'}
        </div>
        <div className={`text-[10px] tabular-nums ${changeColor(data.change_pct)}`}>
          {fmtPct(data.change_pct)}
        </div>
      </div>
    </button>
  );
}

// ============ MACRO INDICATOR ============

function MacroIndicator({ label, value, suffix = '' }: {
  label: string; value: number | null | undefined; suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className="text-[11px] text-zinc-200 font-medium tabular-nums">
        {value !== null && value !== undefined ? `${value.toFixed(2)}${suffix}` : '—'}
      </span>
    </div>
  );
}

// ============ CHART SYMBOL MAP ============

const CHART_MAP: Record<string, string> = {
  'GC=F': 'FOREXCOM:XAUUSD',
  'SI=F': 'FOREXCOM:XAGUSD',
  'PL=F': 'TVC:PLATINUM',
  'DX-Y.NYB': 'AMEX:UUP',
  'BTC-USD': 'BITSTAMP:BTCUSD',
  'NST.AX': 'ASX:NST',
  'EVN.AX': 'ASX:EVN',
  'RMS.AX': 'ASX:RMS',
  'GOR.AX': 'ASX:GOR',
  'WGX.AX': 'ASX:WGX',
  'SPY': 'AMEX:SPY',
  'GLD': 'AMEX:GLD',
  'SLV': 'AMEX:SLV',
  'HG=F': 'AMEX:CPER',
  'CL=F': 'AMEX:USO',
};

// ============ MAIN ============

export default function Dashboard() {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [macro, setMacro] = useState<Record<string, MacroData>>({});
  const [funds, setFunds] = useState<Record<string, FundData>>({});
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [macroLoaded, setMacroLoaded] = useState(false);
  const [fundsLoaded, setFundsLoaded] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState('GC=F');
  const [chartInterval, setChartInterval] = useState('D');

  useEffect(() => {
    // Fetch prices (fastest — ~15s)
    fetch('/api/market/prices')
      .then((r) => r.json())
      .then((data) => {
        if (data.prices) setPrices(data.prices);
        if (data.ratios) setRatios(data.ratios);
        setPricesLoaded(true);
      })
      .catch(() => setPricesLoaded(true));

    // Fetch macro (FRED — ~20s)
    fetch('/api/market/macro')
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setMacro(data);
        setMacroLoaded(true);
      })
      .catch(() => setMacroLoaded(true));

    // Fetch fundamentals (~30s)
    fetch('/api/market/fundamentals?symbols=NEM,AEM,GOLD,WPM,FNV')
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setFunds(data);
        setFundsLoaded(true);
      })
      .catch(() => setFundsLoaded(true));
  }, []);

  const loading = !pricesLoaded && !macroLoaded;
  const tvSymbol = CHART_MAP[activeSymbol] || 'FOREXCOM:XAUUSD';

  // Group prices
  const metalKeys = ['GC=F', 'SI=F', 'PL=F', 'HG=F', 'CL=F'];
  const minerKeys = ['NST.AX', 'EVN.AX', 'RMS.AX', 'GOR.AX', 'WGX.AX'];
  const macroKeys = ['DX-Y.NYB', 'SPY', 'BTC-USD', 'GLD', 'SLV'];

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-[#0e0e0e] shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-widest text-zinc-300 uppercase">Pulse</h1>
          <div className="w-px h-4 bg-zinc-800" />
          <nav className="flex items-center gap-1">
            <Link href="/" className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors rounded">Terminal</Link>
            <span className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-200 bg-zinc-800/50 rounded">Dashboard</span>
            <Link href="/signal" className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors rounded">Signal</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${pricesLoaded ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
              {!pricesLoaded ? 'Prices...' : !macroLoaded ? 'Macro...' : !fundsLoaded ? 'Funds...' : 'Live'}
            </span>
          </div>
          {/* Interval */}
          <div className="flex items-center gap-1">
            {['5', '15', '60', 'D', 'W'].map((tf) => (
              <button
                key={tf}
                onClick={() => setChartInterval(tf)}
                className={`px-2 py-1 text-[10px] uppercase tracking-wider rounded transition-all ${
                  chartInterval === tf ? 'text-zinc-200 bg-zinc-700/50' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Ticker Tape */}
      <div className="shrink-0 border-b border-zinc-800/50">
        <TickerTape />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT: Price Lists */}
        <div className="w-[220px] shrink-0 border-r border-zinc-800/80 bg-[#0c0c0c] overflow-y-auto">
          {/* Commodities */}
          <div className="px-3 py-1.5 border-b border-zinc-800/40">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Commodities</span>
          </div>
          {metalKeys.map((k) => prices[k] && (
            <PriceRow key={k} symbol={k} data={prices[k]} onClick={() => setActiveSymbol(k)} active={activeSymbol === k} />
          ))}

          {/* ASX Miners */}
          <div className="px-3 py-1.5 border-b border-zinc-800/40 border-t border-zinc-800/40">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest">ASX Miners</span>
          </div>
          {minerKeys.map((k) => prices[k] && (
            <PriceRow key={k} symbol={k} data={prices[k]} onClick={() => setActiveSymbol(k)} active={activeSymbol === k} />
          ))}

          {/* Macro */}
          <div className="px-3 py-1.5 border-b border-zinc-800/40 border-t border-zinc-800/40">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Macro / Indices</span>
          </div>
          {macroKeys.map((k) => prices[k] && (
            <PriceRow key={k} symbol={k} data={prices[k]} onClick={() => setActiveSymbol(k)} active={activeSymbol === k} />
          ))}
        </div>

        {/* CENTER: Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <AdvancedChart symbol={tvSymbol} interval={chartInterval} />
          </div>

          {/* Bottom: Gold/Silver Ratio */}
          <div className="h-[160px] shrink-0 border-t border-zinc-800/60">
            <RatioChart
              numerator="GC=F"
              denominator="SI=F"
              title="Gold / Silver Ratio"
              start={new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}
              height={130}
              lineColor="#ffea00"
              bandHigh={90}
              bandLow={65}
            />
          </div>
        </div>

        {/* RIGHT: Macro + Fundamentals + News */}
        <div className="w-[320px] shrink-0 border-l border-zinc-800/80 bg-[#0c0c0c] flex flex-col overflow-hidden">

          {/* Key Ratios */}
          <div className="border-b border-zinc-800/50">
            <div className="px-3 py-1.5 border-b border-zinc-800/30">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Key Ratios</span>
            </div>
            <div className="flex items-center justify-around py-2 px-2">
              <div className="text-center">
                <div className="text-[9px] text-zinc-600 uppercase">G/S</div>
                <div className="text-[14px] font-medium text-yellow-400 tabular-nums">
                  {ratios.gold_silver ? ratios.gold_silver.toFixed(1) : '—'}
                </div>
              </div>
              <div className="w-px h-6 bg-zinc-800" />
              <div className="text-center">
                <div className="text-[9px] text-zinc-600 uppercase">Cu/Au</div>
                <div className="text-[14px] font-medium text-orange-400 tabular-nums">
                  {ratios.copper_gold ? ratios.copper_gold.toFixed(2) : '—'}
                </div>
              </div>
              <div className="w-px h-6 bg-zinc-800" />
              <div className="text-center">
                <div className="text-[9px] text-zinc-600 uppercase">Spread</div>
                <div className={`text-[14px] font-medium tabular-nums ${
                  (macro.T10Y2Y?.value ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {macro.T10Y2Y?.value !== null && macro.T10Y2Y?.value !== undefined
                    ? `${macro.T10Y2Y.value > 0 ? '+' : ''}${macro.T10Y2Y.value.toFixed(2)}`
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* FRED Macro */}
          <div className="border-b border-zinc-800/50">
            <div className="px-3 py-1.5 border-b border-zinc-800/30">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Macro (FRED)</span>
            </div>
            <MacroIndicator label="10Y Yield" value={macro.DGS10?.value} suffix="%" />
            <MacroIndicator label="2Y Yield" value={macro.DGS2?.value} suffix="%" />
            <MacroIndicator label="Fed Funds" value={macro.FEDFUNDS?.value} suffix="%" />
            <MacroIndicator label="Real Rate" value={macro.DFII10?.value} suffix="%" />
            <MacroIndicator label="Breakeven" value={macro.T10YIE?.value} suffix="%" />
            <MacroIndicator label="Fin Stress" value={macro.STLFSI4?.value} />
            <MacroIndicator label="Unemployment" value={macro.UNRATE?.value} suffix="%" />
            <MacroIndicator label="Dollar (TWI)" value={macro.DTWEXBGS?.value} />
          </div>

          {/* Miner Fundamentals */}
          <div className="border-b border-zinc-800/50 overflow-x-auto">
            <div className="px-3 py-1.5 border-b border-zinc-800/30">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Gold Miners (Fundamentals)</span>
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-zinc-600 border-b border-zinc-800/30">
                  <th className="text-left py-1 px-2 font-medium">Sym</th>
                  <th className="text-right py-1 px-1.5 font-medium">Price</th>
                  <th className="text-right py-1 px-1.5 font-medium">PE</th>
                  <th className="text-right py-1 px-1.5 font-medium">FwdPE</th>
                  <th className="text-right py-1 px-1.5 font-medium">P/B</th>
                  <th className="text-right py-1 px-1.5 font-medium">ROE</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(funds).map(([sym, d]) => {
                  // Handle both flat (snapshot) and nested (fundamentals endpoint) shapes
                  const price = d.price ?? d.profile?.price;
                  const pe = d.pe ?? d.metrics?.pe_ratio;
                  const fwdPe = d.fwd_pe ?? d.metrics?.forward_pe;
                  const pb = d.pb ?? d.metrics?.pb_ratio;
                  const roe = d.roe ?? d.metrics?.roe;
                  return (
                    <tr key={sym} className="border-b border-zinc-800/20 hover:bg-zinc-800/20">
                      <td className="py-1 px-2 text-zinc-300 font-medium">{sym}</td>
                      <td className="py-1 px-1.5 text-right text-zinc-200">{price ? `$${Number(price).toFixed(0)}` : '—'}</td>
                      <td className="py-1 px-1.5 text-right text-zinc-400">{pe ? Number(pe).toFixed(1) : '—'}</td>
                      <td className="py-1 px-1.5 text-right text-emerald-400/80">{fwdPe ? Number(fwdPe).toFixed(1) : '—'}</td>
                      <td className="py-1 px-1.5 text-right text-zinc-400">{pb ? Number(pb).toFixed(1) : '—'}</td>
                      <td className="py-1 px-1.5 text-right text-zinc-300">{roe ? `${(Number(roe) * 100).toFixed(0)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* News (TradingView) */}
          <div className="flex-1 min-h-0">
            <TopStories />
          </div>
        </div>
      </div>
    </div>
  );
}
