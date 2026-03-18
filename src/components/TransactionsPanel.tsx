'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAccountTransactions } from '@/lib/ibkr/gateway-client';
import type { AccountTransactionsEnvelope } from '@/lib/ibkr/types';
import { useGatewayStore } from '@/lib/store/gateway';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { formatPrice } from '@/lib/utils';

interface TransactionsPanelProps {
  conid: number | null;
}

function formatRawDate(rawDate: string) {
  if (!/^\d{8}$/.test(rawDate)) return rawDate || '—';
  const year = Number(rawDate.slice(0, 4));
  const month = Number(rawDate.slice(4, 6)) - 1;
  const day = Number(rawDate.slice(6, 8));
  return new Date(year, month, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEpochDate(value: number) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TransactionsPanel({ conid }: TransactionsPanelProps) {
  const gatewayUp = useGatewayStore((s) => s.connected);
  const items = useWatchlistStore((s) => s.items);
  const [data, setData] = useState<AccountTransactionsEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const instrument = useMemo(
    () => (conid != null ? items.find((item) => item.conid === conid) ?? null : null),
    [conid, items]
  );

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!gatewayUp || !conid) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setData(null);
    setLoading(true);
    setError(null);

    getAccountTransactions(conid, 90)
      .then((next) => {
        if (requestIdRef.current !== requestId) return;
        setData(next);
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : 'Transaction fetch failed');
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
  }, [conid, gatewayUp]);

  const summaryCards = data
    ? [
        {
          label: 'Instrument',
          value: instrument?.symbol || data.symbol,
        },
        {
          label: 'Currency',
          value: data.currency,
        },
        {
          label: 'Window',
          value: `${formatEpochDate(data.from)} - ${formatEpochDate(data.to)}`,
        },
        {
          label: 'Realized P&L',
          value:
            data.rpnl?.amount != null
              ? `${data.rpnl.amount >= 0 ? '+' : ''}${formatPrice(data.rpnl.amount)}`
              : '—',
          tone:
            data.rpnl?.amount != null
              ? data.rpnl.amount >= 0
                ? 'text-emerald-400'
                : 'text-red-400'
              : '',
        },
      ]
    : [];

  if (!conid) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-600">
        Select an instrument to view account transactions.
      </div>
    );
  }

  if (!gatewayUp) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-600">
        Gateway connection required to load transactions.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {summaryCards.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 border-b border-zinc-800/60 px-3 py-3 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded border border-zinc-800/70 bg-zinc-950/60 px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                {card.label}
              </div>
              <div className={`mt-1 font-mono text-sm text-zinc-200 ${card.tone || ''}`}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data?.warning ? (
        <div className="border-b border-zinc-800/50 px-3 py-2 text-[11px] text-zinc-500">
          {data.warning}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {loading && !data ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-600">
            Loading transactions...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-red-400">
            {error}
          </div>
        ) : !data || data.transactions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-600">
            No account transactions for this instrument in the selected window.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((tx, index) => (
                <tr
                  key={`${tx.rawDate}:${tx.type}:${tx.qty}:${tx.pr}:${index}`}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  <td className="px-3 py-2 text-zinc-300">{formatRawDate(tx.rawDate)}</td>
                  <td className="px-3 py-2 text-zinc-200">{tx.type}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">{tx.qty}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">
                    {formatPrice(tx.pr, -1)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      tx.amt >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {tx.amt >= 0 ? '+' : ''}
                    {formatPrice(tx.amt, -1)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{tx.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>
    </div>
  );
}
