'use client';

import { useEffect, useState } from 'react';
import { getAccountActivity } from '@/lib/ibkr/gateway-client';
import type { AccountActivityResponse } from '@/lib/ibkr/types';
import { useGatewayStore } from '@/lib/store/gateway';
import { cn, formatPrice } from '@/lib/utils';

const DAY_OPTIONS = [1, 3, 7];

export function AccountActivityPanel() {
  const gatewayUp = useGatewayStore((s) => s.connected);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AccountActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gatewayUp) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await getAccountActivity(days);
        if (!cancelled) {
          setData(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load account activity');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = window.setInterval(load, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [days, gatewayUp]);

  const cards = data
    ? [
        { label: 'Executions', value: String(data.totals.executions) },
        { label: 'Symbols', value: String(data.totals.symbols) },
        { label: 'Gross Buy', value: formatPrice(data.totals.grossBuy, -1) },
        { label: 'Gross Sell', value: formatPrice(data.totals.grossSell, -1) },
        {
          label: 'Cash Flow',
          value: formatPrice(data.totals.netAmount, -1),
          tone: data.totals.netAmount >= 0 ? 'text-emerald-400' : 'text-red-400',
        },
        { label: 'Fees', value: formatPrice(data.totals.commission, -1) },
      ]
    : [];
  const hasFxCashFlow = data?.trades.some((trade) => trade.secType === 'CASH') ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Account Activity
          </div>
          <div className="flex items-center gap-1">
            {DAY_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] uppercase tracking-widest',
                  days === value
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {value}D
              </button>
            ))}
          </div>
        </div>

        {cards.length > 0 ? (
          <div className="border-b border-border/60 px-3 py-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
              {cards.map((card) => (
                <div
                  key={card.label}
                  className="rounded border border-border/70 bg-background/80 px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {card.label}
                  </div>
                  <div className={cn('mt-1 font-mono text-sm text-foreground', card.tone)}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
            {hasFxCashFlow ? (
              <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                FX rows show settlement cash flow, not trade outcome.
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="px-3 py-3 text-xs text-red-400">{error}</div>
        ) : loading && !data ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">Loading activity…</div>
        ) : !data || data.trades.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No account-wide executions in this window.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Symbol</th>
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Cash Flow</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((trade) => (
                <tr key={trade.executionId} className="border-b border-border/40">
                  <td className="px-3 py-2 text-muted-foreground">
                    {trade.tradeTimeMs > 0
                      ? new Date(trade.tradeTimeMs).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : trade.tradeTime}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    <div>{trade.symbol}</div>
                    {trade.secType === 'CASH' ? (
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        FX
                      </div>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 font-semibold',
                      trade.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    {trade.side}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-foreground">
                    {trade.size}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-foreground">
                    {formatPrice(trade.price, -1)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-mono',
                      trade.netAmount >= 0 ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    <div>
                      {trade.netAmount >= 0 ? '+' : ''}
                      {formatPrice(trade.netAmount, -1)}
                    </div>
                    {trade.cashFlowCurrency ? (
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {trade.cashFlowCurrency}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
