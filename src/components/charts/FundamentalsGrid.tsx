'use client';

import { useEffect, useState } from 'react';

interface FundamentalsData {
  symbol: string;
  profile?: {
    name?: string;
    sector?: string;
    market_cap?: number;
    price?: number;
    beta?: number;
    exchange?: string;
    country?: string;
  };
  metrics?: {
    pe_ratio?: number;
    forward_pe?: number;
    pb_ratio?: number;
    ps_ratio?: number;
    ev_ebitda?: number;
    ev_revenue?: number;
    dividend_yield?: number;
    payout_ratio?: number;
    roe?: number;
    roa?: number;
    debt_to_equity?: number;
    current_ratio?: number;
    free_cash_flow?: number;
    free_cash_flow_yield?: number;
    earnings_yield?: number;
    market_cap?: number;
    enterprise_value?: number;
  };
  income?: {
    date?: string;
    total_revenue?: number;
    gross_profit?: number;
    operating_income?: number;
    net_income?: number;
    [key: string]: unknown;
  }[];
  price_data?: {
    year_high?: number;
    year_low?: number;
    ma_50d?: number;
    ma_200d?: number;
    eps_trailing?: number;
    eps_forward?: number;
  };
  [key: string]: unknown;
}

interface FundamentalsGridProps {
  symbols: string[];
}

const fmtB = (n: number | undefined | null) => {
  if (n === undefined || n === null) return '—';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
};

const fmtPct = (n: number | undefined | null) => {
  if (n === undefined || n === null) return '—';
  return `${(n * 100).toFixed(1)}%`;
};

const fmtNum = (n: number | undefined | null, dp = 2) => {
  if (n === undefined || n === null) return '—';
  return n.toFixed(dp);
};

export function FundamentalsGrid({ symbols }: FundamentalsGridProps) {
  const [data, setData] = useState<Record<string, FundamentalsData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/market/fundamentals?symbols=${encodeURIComponent(symbols.join(','))}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(typeof d.error === 'string' ? d.error : JSON.stringify(d.error));
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [symbols.join(',')]);

  const entries = Object.values(data);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-zinc-600 text-xs uppercase tracking-wider">
        Loading fundamentals...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-500 text-xs">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2 px-3 font-medium sticky left-0 bg-[#0c0c0c]">Metric</th>
            {entries.map((e) => (
              <th key={e.symbol} className="text-right py-2 px-3 font-medium min-w-[120px]">
                <div className="text-zinc-300">{e.symbol}</div>
                <div className="text-[10px] text-zinc-600 font-normal">{e.profile?.name?.slice(0, 20)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Profile */}
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Price</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-200">${fmtNum(e.profile?.price)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Market Cap</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtB(e.metrics?.market_cap || e.profile?.market_cap)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">EV</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtB(e.metrics?.enterprise_value)}</td>
            ))}
          </tr>

          {/* Divider */}
          <tr><td colSpan={entries.length + 1} className="py-1 border-b border-zinc-700/50">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest px-3">Valuation</span>
          </td></tr>

          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">P/E (trailing)</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.metrics?.pe_ratio, 1)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">P/E (forward)</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-emerald-400/80">{fmtNum(e.metrics?.forward_pe, 1)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">P/B</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.metrics?.pb_ratio, 1)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">EV/EBITDA</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.metrics?.ev_ebitda, 1)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Earnings Yield</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtPct(e.metrics?.earnings_yield)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">FCF Yield</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtPct(e.metrics?.free_cash_flow_yield)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Div Yield</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtPct(e.metrics?.dividend_yield)}</td>
            ))}
          </tr>

          {/* Divider */}
          <tr><td colSpan={entries.length + 1} className="py-1 border-b border-zinc-700/50">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest px-3">Quality</span>
          </td></tr>

          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">ROE</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtPct(e.metrics?.roe)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">D/E</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.metrics?.debt_to_equity, 2)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Current Ratio</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.metrics?.current_ratio, 2)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Beta</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.profile?.beta, 2)}</td>
            ))}
          </tr>

          {/* Divider */}
          <tr><td colSpan={entries.length + 1} className="py-1 border-b border-zinc-700/50">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest px-3">Latest Income</span>
          </td></tr>

          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Revenue</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtB(e.income?.[0]?.total_revenue as number | undefined)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">Net Income</td>
            {entries.map((e) => {
              const ni = e.income?.[0]?.net_income as number | undefined;
              return (
                <td key={e.symbol} className={`py-1.5 px-3 text-right ${ni && ni > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtB(ni)}
                </td>
              );
            })}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">EPS (trailing)</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.price_data?.eps_trailing)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">EPS (forward)</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">{fmtNum(e.price_data?.eps_forward)}</td>
            ))}
          </tr>

          {/* Divider */}
          <tr><td colSpan={entries.length + 1} className="py-1 border-b border-zinc-700/50">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest px-3">Technicals</span>
          </td></tr>

          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">52W High</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">${fmtNum(e.price_data?.year_high)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">52W Low</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-300">${fmtNum(e.price_data?.year_low)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">50D MA</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-400">${fmtNum(e.price_data?.ma_50d)}</td>
            ))}
          </tr>
          <tr className="border-b border-zinc-800/30">
            <td className="py-1.5 px-3 text-zinc-500 sticky left-0 bg-[#0c0c0c]">200D MA</td>
            {entries.map((e) => (
              <td key={e.symbol} className="py-1.5 px-3 text-right text-zinc-400">${fmtNum(e.price_data?.ma_200d)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
