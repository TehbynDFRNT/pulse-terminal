'use client';

import { useEffect, useState } from 'react';

interface InsiderTrade {
  filing_date?: string;
  transaction_date?: string;
  owner_name?: string;
  transaction_type?: string;
  securities_transacted?: number;
  price?: number;
  value?: number;
  [key: string]: unknown;
}

interface InstitutionalHolder {
  investor_name?: string;
  shares?: number;
  value?: number;
  weight?: number;
  date_reported?: string;
  [key: string]: unknown;
}

interface InsiderTableProps {
  symbol: string;
  limit?: number;
}

export function InsiderTable({ symbol, limit = 15 }: InsiderTableProps) {
  const [insiders, setInsiders] = useState<InsiderTrade[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionalHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'insider' | 'institutional'>('insider');

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/market/flows?symbol=${encodeURIComponent(symbol)}&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
        } else {
          if (Array.isArray(data.insider)) setInsiders(data.insider);
          if (data.insider_error) setError(data.insider_error);
          if (Array.isArray(data.institutional)) setInstitutions(data.institutional);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [symbol, limit]);

  const formatNum = (n: number | undefined | null) => {
    if (n === undefined || n === null) return '—';
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const formatShares = (n: number | undefined | null) => {
    if (n === undefined || n === null) return '—';
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toString();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {symbol} Flows
          </span>
          {loading && <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Loading...</span>}
          {error && <span className="text-[10px] text-red-500 uppercase tracking-wider">FMP error — may not cover this ticker</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('insider')}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
              tab === 'insider' ? 'text-zinc-200 bg-zinc-800/60' : 'text-zinc-500 hover:text-zinc-400'
            }`}
          >
            Insider ({insiders.length})
          </button>
          <button
            onClick={() => setTab('institutional')}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
              tab === 'institutional' ? 'text-zinc-200 bg-zinc-800/60' : 'text-zinc-500 hover:text-zinc-400'
            }`}
          >
            Institutional ({institutions.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'insider' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1.5 px-3 font-medium">Date</th>
                <th className="text-left py-1.5 px-3 font-medium">Name</th>
                <th className="text-left py-1.5 px-3 font-medium">Type</th>
                <th className="text-right py-1.5 px-3 font-medium">Shares</th>
                <th className="text-right py-1.5 px-3 font-medium">Price</th>
                <th className="text-right py-1.5 px-3 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {insiders.length === 0 && !loading && (
                <tr><td colSpan={6} className="text-center py-4 text-zinc-600">No insider data</td></tr>
              )}
              {insiders.map((trade, i) => {
                const isBuy = (trade.transaction_type || '').toLowerCase().includes('buy') ||
                              (trade.transaction_type || '').toLowerCase().includes('purchase');
                return (
                  <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                    <td className="py-1.5 px-3 text-zinc-400">{(trade.transaction_date || trade.filing_date || '').slice(0, 10)}</td>
                    <td className="py-1.5 px-3 text-zinc-300 truncate max-w-[180px]">{trade.owner_name || '—'}</td>
                    <td className={`py-1.5 px-3 ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                      {trade.transaction_type || '—'}
                    </td>
                    <td className="py-1.5 px-3 text-right text-zinc-300">{formatShares(trade.securities_transacted)}</td>
                    <td className="py-1.5 px-3 text-right text-zinc-400">{trade.price ? `$${Number(trade.price).toFixed(2)}` : '—'}</td>
                    <td className="py-1.5 px-3 text-right text-zinc-300">{formatNum(trade.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === 'institutional' && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1.5 px-3 font-medium">Investor</th>
                <th className="text-right py-1.5 px-3 font-medium">Shares</th>
                <th className="text-right py-1.5 px-3 font-medium">Value</th>
                <th className="text-right py-1.5 px-3 font-medium">Weight</th>
                <th className="text-left py-1.5 px-3 font-medium">Reported</th>
              </tr>
            </thead>
            <tbody>
              {institutions.length === 0 && !loading && (
                <tr><td colSpan={5} className="text-center py-4 text-zinc-600">No institutional data</td></tr>
              )}
              {institutions.map((holder, i) => (
                <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                  <td className="py-1.5 px-3 text-zinc-300 truncate max-w-[220px]">{holder.investor_name || '—'}</td>
                  <td className="py-1.5 px-3 text-right text-zinc-300">{formatShares(holder.shares)}</td>
                  <td className="py-1.5 px-3 text-right text-zinc-300">{formatNum(holder.value)}</td>
                  <td className="py-1.5 px-3 text-right text-zinc-400">{holder.weight ? `${(Number(holder.weight) * 100).toFixed(2)}%` : '—'}</td>
                  <td className="py-1.5 px-3 text-zinc-400">{(holder.date_reported || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
