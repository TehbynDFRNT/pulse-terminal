'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PortfolioDecompositionPanel } from '@/components/PortfolioDecompositionPanel';
import { PortfolioPerformancePanel } from '@/components/PortfolioPerformancePanel';
import {
  getMarketSnapshots,
  searchInstruments,
} from '@/lib/ibkr/gateway-client';
import type {
  CashBalance,
  MarketDataSnapshot,
  OrderSide,
  OrderTicket,
} from '@/lib/ibkr/types';
import { useOrdersStore } from '@/lib/store/orders';
import { useGatewayStore } from '@/lib/store/gateway';
import { usePortfolioStore } from '@/lib/store/portfolio';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { formatPrice } from '@/lib/utils';

function formatPercent(value: number) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatUnits(value: number) {
  return Math.round(value).toLocaleString();
}

function formatRate(value: number) {
  return value.toFixed(4);
}

function roundDownToIncrement(value: number, increment: number | null) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || !increment || increment <= 0) return value;
  const rounded = Math.floor((value + 1e-9) / increment) * increment;
  return rounded > 0 ? rounded : increment;
}

function buildFlattenIntent(balance: CashBalance, baseCurrency: string | null) {
  if (!baseCurrency || balance.isBase || balance.exchangeRate <= 0 || balance.cashBalance === 0) {
    return null;
  }

  const pairSymbol = `${baseCurrency}.${balance.currency}`;
  const side: OrderSide = balance.cashBalance > 0 ? 'BUY' : 'SELL';
  const rawUnits = Math.abs(balance.cashBalance * balance.exchangeRate);
  const rawCashQty = Math.abs(balance.cashBalance);

  return {
    pairSymbol,
    side,
    rawUnits,
    rawCashQty,
    previewLabel: `${side} ${formatUnits(rawCashQty)} ${balance.currency} via ${pairSymbol}`,
  };
}

function sortCashBalances(left: CashBalance, right: CashBalance) {
  if (left.isBase !== right.isBase) {
    return left.isBase ? -1 : 1;
  }

  const leftMagnitude = Math.abs(left.baseEquivalent || left.cashBalance);
  const rightMagnitude = Math.abs(right.baseEquivalent || right.cashBalance);
  if (leftMagnitude !== rightMagnitude) {
    return rightMagnitude - leftMagnitude;
  }

  return left.currency.localeCompare(right.currency);
}

export function PositionsPanel({ active = true }: { active?: boolean }) {
  const router = useRouter();
  const gatewayUp = useGatewayStore((s) => s.connected);
  const positions = usePortfolioStore((s) => s.positions);
  const cashBalances = usePortfolioStore((s) => s.cashBalances);
  const baseCurrency = usePortfolioStore((s) => s.baseCurrency);
  const summary = usePortfolioStore((s) => s.summary);
  const pnl = usePortfolioStore((s) => s.pnl);
  const accountId = usePortfolioStore((s) => s.accountId);
  const isPaper = usePortfolioStore((s) => s.isPaper);
  const items = useWatchlistStore((s) => s.items);
  const addItem = useWatchlistStore((s) => s.addItem);
  const selectInstrument = useWatchlistStore((s) => s.selectInstrument);
  const resetForm = useOrdersStore((s) => s.resetForm);
  const setSide = useOrdersStore((s) => s.setSide);
  const setOrderType = useOrdersStore((s) => s.setOrderType);
  const setPreparedDraft = useOrdersStore((s) => s.setPreparedDraft);
  const [pendingUnwindCurrency, setPendingUnwindCurrency] = useState<string | null>(null);
  const [unwindError, setUnwindError] = useState<string | null>(null);
  const [positionSnapshots, setPositionSnapshots] = useState<Record<number, MarketDataSnapshot>>({});
  const [fxPairConids, setFxPairConids] = useState<Record<string, number>>({});
  const [fxPairSnapshots, setFxPairSnapshots] = useState<Record<string, MarketDataSnapshot>>({});

  useEffect(() => {
    if (!active || !gatewayUp || positions.length === 0) {
      setPositionSnapshots({});
      return;
    }

    let cancelled = false;
    let inflight = false;
    const conids = positions.map((position) => position.conid).filter((conid) => conid > 0);

    const syncSnapshots = async () => {
      if (inflight || conids.length === 0) return;
      inflight = true;
      try {
        const snapshots = await getMarketSnapshots(conids);
        if (cancelled) return;
        setPositionSnapshots(
          Object.fromEntries(snapshots.map((snapshot) => [snapshot.conid, snapshot] as const))
        );
      } catch {
        if (!cancelled) {
          setPositionSnapshots((current) => current);
        }
      } finally {
        inflight = false;
      }
    };

    void syncSnapshots();
    const interval = setInterval(syncSnapshots, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, gatewayUp, positions]);

  const livePositions = useMemo(
    () =>
      positions.map((position) => {
        const snapshot = positionSnapshots[position.conid];
        const livePrice =
          snapshot && snapshot.displayPrice > 0
            ? snapshot.displayPrice
            : snapshot && snapshot.last > 0
              ? snapshot.last
              : position.marketPrice;
        const marketValue = livePrice * position.position;
        const positionPnl = marketValue - position.avgCost * position.position;
        const costBasis = Math.abs(position.avgCost * position.position);
        const pnlPct = costBasis > 0 ? (positionPnl / costBasis) * 100 : 0;

        return {
          ...position,
          livePrice,
          marketValue,
          positionPnl,
          pnlPct,
        };
      }),
    [positionSnapshots, positions]
  );
  const grossPositionValue = useMemo(
    () => livePositions.reduce((total, position) => total + Math.abs(position.marketValue), 0),
    [livePositions]
  );
  const effectiveGrossPosition =
    livePositions.length > 0 ? grossPositionValue : summary?.grossPosition ?? 0;
  const effectiveDailyPnl = pnl?.dailyPnL ?? 0;
  const showGrossPositionCard =
    livePositions.length > 0 || Math.abs(effectiveGrossPosition) > 0.000001;
  const showDailyPnlCard =
    livePositions.length > 0 || Math.abs(effectiveDailyPnl) > 0.000001;

  const summaryCards = summary
    ? [
        {
          label: 'Account',
          value: `${isPaper ? 'Paper' : 'Live'} · ${accountId || summary.accountId}`,
        },
        {
          label: 'Net Liq',
          value: formatPrice(summary.netLiquidity),
        },
        {
          label: 'Cash',
          value: formatPrice(summary.totalCash),
        },
        {
          label: 'Buying Power',
          value: formatPrice(summary.buyingPower),
        },
        ...(showGrossPositionCard
          ? [
              {
                label: 'Gross Position',
                value: formatPrice(effectiveGrossPosition),
              },
            ]
          : []),
        ...(showDailyPnlCard
          ? [
              {
                label: 'Daily P&L',
                value: formatPrice(effectiveDailyPnl),
                tone: effectiveDailyPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
              },
            ]
          : []),
      ]
    : [];

  const visibleCashBalances = useMemo(
    () =>
      cashBalances
        .filter((balance) => Math.abs(balance.cashBalance) > 0.000001)
        .sort(sortCashBalances),
    [cashBalances]
  );

  useEffect(() => {
    if (!active || !gatewayUp || !baseCurrency) {
      setFxPairConids((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      setFxPairSnapshots((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      return;
    }

    const unresolved = visibleCashBalances.filter(
      (balance) => !balance.isBase && !fxPairConids[balance.currency]
    );
    if (unresolved.length === 0) {
      return;
    }

    let cancelled = false;

    const resolvePairs = async () => {
      const resolvedEntries = await Promise.all(
        unresolved.map(async (balance) => {
          const pairSymbol = `${baseCurrency}.${balance.currency}`;
          const existing =
            items.find((item) => item.symbol === pairSymbol && item.type === 'CASH') ?? null;
          if (existing) {
            return [balance.currency, existing.conid] as const;
          }

          const results = await searchInstruments(pairSymbol, 'CASH');
          const instrument =
            results.find((item) => item.symbol === pairSymbol && item.type === 'CASH') ??
            results[0] ??
            null;

          return instrument ? ([balance.currency, instrument.conid] as const) : null;
        })
      );

      if (cancelled) return;

      setFxPairConids((current) => ({
        ...current,
        ...Object.fromEntries(
          resolvedEntries.filter((entry): entry is readonly [string, number] => entry != null)
        ),
      }));
    };

    void resolvePairs();

    return () => {
      cancelled = true;
    };
  }, [active, baseCurrency, fxPairConids, gatewayUp, items, visibleCashBalances]);

  useEffect(() => {
    if (!active || !gatewayUp) {
      setFxPairSnapshots((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      return;
    }

    const entries = Object.entries(fxPairConids);
    if (entries.length === 0) return;

    let cancelled = false;
    let inflight = false;
    const conids = entries.map(([, conid]) => conid);
    const currencyByConid = Object.fromEntries(entries.map(([currency, conid]) => [conid, currency]));

    const syncSnapshots = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const snapshots = await getMarketSnapshots(conids);
        if (cancelled) return;
        setFxPairSnapshots(
          Object.fromEntries(
            snapshots
              .map((snapshot) => {
                const currency = currencyByConid[snapshot.conid];
                return currency ? ([currency, snapshot] as const) : null;
              })
              .filter(
                (entry): entry is readonly [string, MarketDataSnapshot] => entry != null
              )
          )
        );
      } finally {
        inflight = false;
      }
    };

    void syncSnapshots();
    const interval = setInterval(syncSnapshots, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, fxPairConids, gatewayUp]);

  const displayCashBalances = useMemo(
    () =>
      visibleCashBalances.map((balance) => {
        if (balance.isBase || !baseCurrency) {
          return balance;
        }

        const snapshot = fxPairSnapshots[balance.currency];
        const pairPrice =
          snapshot && snapshot.displayPrice > 0
            ? snapshot.displayPrice
            : snapshot && snapshot.last > 0
              ? snapshot.last
              : 0;
        const liveExchangeRate = pairPrice > 0 ? 1 / pairPrice : balance.exchangeRate;
        const liveBaseEquivalent =
          liveExchangeRate > 0 ? balance.cashBalance * liveExchangeRate : balance.baseEquivalent;
        const liveMarkToBasePnl =
          balance.entryBaseAmount != null
            ? Math.sign(liveBaseEquivalent || balance.cashBalance) *
              (Math.abs(liveBaseEquivalent) - balance.entryBaseAmount)
            : balance.markToBasePnl;

        return {
          ...balance,
          exchangeRate: liveExchangeRate,
          baseEquivalent: liveBaseEquivalent,
          markToBasePnl: liveMarkToBasePnl,
        };
      }),
    [baseCurrency, fxPairSnapshots, visibleCashBalances]
  );

  const fxBalances = useMemo(
    () => displayCashBalances.filter((balance) => !balance.isBase),
    [displayCashBalances]
  );
  const fxSummary = useMemo(() => {
    const grossBaseExposure = fxBalances.reduce(
      (total, balance) => total + Math.abs(balance.baseEquivalent),
      0
    );
    const netBaseExposure = fxBalances.reduce(
      (total, balance) => total + balance.baseEquivalent,
      0
    );
    const totalInterest = fxBalances.reduce(
      (total, balance) => total + balance.interest,
      0
    );
    const outcomeBalances = fxBalances.filter(
      (balance) => balance.markToBasePnl != null
    );
    const markedOutcome = outcomeBalances.reduce(
      (total, balance) => total + (balance.markToBasePnl ?? 0),
      0
    );

    return {
      count: displayCashBalances.length,
      grossBaseExposure,
      netBaseExposure,
      totalInterest,
      markedOutcome,
      hasOutcome: outcomeBalances.length > 0,
    };
  }, [displayCashBalances, fxBalances]);

  const handleUnwind = useCallback(
    async (currency: string) => {
      const balance = fxBalances.find((entry) => entry.currency === currency) ?? null;
      const flatten = balance ? buildFlattenIntent(balance, baseCurrency) : null;
      if (!balance || !flatten) return;

      setPendingUnwindCurrency(balance.currency);
      setUnwindError(null);

      try {
        let instrument =
          items.find((item) => item.symbol === flatten.pairSymbol && item.type === 'CASH') ?? null;

        if (!instrument) {
          const results = await searchInstruments(flatten.pairSymbol, 'CASH');
          instrument =
            results.find((item) => item.symbol === flatten.pairSymbol && item.type === 'CASH') ??
            results[0] ??
            null;
          if (!instrument) {
            throw new Error(`No IBKR FX contract found for ${flatten.pairSymbol}.`);
          }
          addItem(instrument);
        }

        const rulesRes = await fetch(
          `/api/ibkr/orders/rules?conid=${instrument.conid}&side=${flatten.side}`,
          { cache: 'no-store' }
        );
        const ticket = (await rulesRes.json()) as Partial<OrderTicket> & { error?: string };
        if (!rulesRes.ok) {
          throw new Error(ticket.error || 'Failed to load FX order rules.');
        }

        const quantityStep =
          typeof ticket.quantityStep === 'number' && ticket.quantityStep > 0
            ? ticket.quantityStep
            : 1;
        const cashQtyIncr =
          typeof ticket.rules?.cashQtyIncr === 'number' && ticket.rules.cashQtyIncr > 0
            ? ticket.rules.cashQtyIncr
            : null;
        const units =
          flatten.rawUnits <= 0
            ? quantityStep
            : Math.max(quantityStep, Math.round(flatten.rawUnits / quantityStep) * quantityStep);
        const cashQty = roundDownToIncrement(flatten.rawCashQty, cashQtyIncr);

        resetForm();
        setSide(flatten.side);
        setOrderType('MKT');
        setPreparedDraft({
          conid: instrument.conid,
          quantityMode: ticket.supportsCashQuantity ? 'cash' : 'exposure',
          quantity: units,
          cashQty: ticket.supportsCashQuantity ? cashQty : null,
          exposureAmount: ticket.supportsCashQuantity ? null : flatten.rawCashQty,
        });
        selectInstrument(instrument.conid);
        router.push('/');
      } catch (err) {
        setUnwindError(err instanceof Error ? err.message : 'Failed to prepare unwind order.');
      } finally {
        setPendingUnwindCurrency(null);
      }
    },
    [
      addItem,
      baseCurrency,
      fxBalances,
      items,
      resetForm,
      router,
      selectInstrument,
      setOrderType,
      setPreparedDraft,
      setSide,
    ]
  );

  const showNoPositionsState = positions.length === 0 && visibleCashBalances.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        {showNoPositionsState ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            No open positions or cash balances in this IBKR account right now.
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            {summaryCards.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 border-b border-border/60 px-3 py-3 lg:grid-cols-3">
                {summaryCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded border border-border/70 bg-background/80 px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {card.label}
                    </div>
                    <div className={`mt-1 font-mono text-sm text-foreground ${card.tone || ''}`}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {unwindError ? (
              <div className="border-b border-border/50 px-3 py-2 text-[11px] text-red-400">
                {unwindError}
              </div>
            ) : null}

            {active ? <PortfolioPerformancePanel embedded /> : null}

            <div className="border-b border-border/50">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Positions
              </div>
              {livePositions.length === 0 ? (
                <div className="px-3 pb-3 text-xs text-muted-foreground">
                  No security positions. FX and cash exposure is shown below from the IBKR ledger.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Symbol</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Avg Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Mkt Price</th>
                      <th className="px-3 py-2 text-right font-medium">Value</th>
                      <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
                      <th className="px-3 py-2 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {livePositions.map((pos) => {
                      return (
                        <tr
                          key={pos.conid}
                          className="border-b border-border/50 hover:bg-accent/40"
                        >
                          <td className="px-3 py-2 text-foreground">{pos.symbol}</td>
                          <td className="px-3 py-2 text-right text-foreground/80">{pos.position}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {formatPrice(pos.avgCost)}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {formatPrice(pos.livePrice)}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {formatPrice(pos.marketValue, -1)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              pos.positionPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {pos.positionPnl >= 0 ? '+' : ''}
                            {formatPrice(pos.positionPnl, -1)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              pos.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {pos.pnlPct >= 0 ? '+' : ''}
                            {pos.pnlPct.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {visibleCashBalances.length > 0 ? (
              <div className="flex-1">
                <div className="px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Cash Balances
                </div>
                {fxBalances.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 border-b border-border/50 px-3 pb-3 text-xs lg:grid-cols-4">
                    <div className="rounded border border-border/70 bg-background/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Base
                      </div>
                      <div className="mt-1 font-mono text-foreground">
                        {baseCurrency ?? '—'}
                      </div>
                    </div>
                    <div className="rounded border border-border/70 bg-background/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        FX Balances
                      </div>
                      <div className="mt-1 font-mono text-foreground">{fxSummary.count}</div>
                    </div>
                    <div className="rounded border border-border/70 bg-background/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Gross FX
                      </div>
                      <div className="mt-1 font-mono text-foreground">
                        {formatPrice(fxSummary.grossBaseExposure, -1)}
                      </div>
                    </div>
                    <div className="rounded border border-border/70 bg-background/70 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        FX Outcome
                      </div>
                      {fxSummary.hasOutcome ? (
                        <div
                          className={`mt-1 font-mono ${
                            fxSummary.markedOutcome >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {fxSummary.markedOutcome >= 0 ? '+' : ''}
                          {formatPrice(fxSummary.markedOutcome, -1)}
                        </div>
                      ) : (
                        <div className="mt-1 font-mono text-muted-foreground">—</div>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        FX carry{' '}
                        {Math.abs(fxSummary.totalInterest) > 0.000001
                          ? `${fxSummary.totalInterest >= 0 ? '+' : ''}${formatPrice(
                              fxSummary.totalInterest,
                              -1
                            )}`
                          : '—'}
                      </div>
                    </div>
                  </div>
                ) : null}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Currency</th>
                      <th className="px-3 py-2 text-right font-medium">Cash</th>
                      <th className="px-3 py-2 text-right font-medium">Base Eq</th>
                      <th className="px-3 py-2 text-right font-medium">Outcome</th>
                      <th className="px-3 py-2 text-right font-medium">Carry</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayCashBalances.map((balance) => {
                      const flatten = buildFlattenIntent(balance, baseCurrency);
                      const canUnwind = !!flatten;
                      const isLongExposure = balance.cashBalance > 0;
                      const interestBase =
                        Math.abs(balance.baseEquivalent) > 0.000001
                          ? Math.abs(balance.baseEquivalent)
                          : Math.abs(balance.cashBalance);
                      const interestPct =
                        interestBase > 0 ? (balance.interest / interestBase) * 100 : 0;

                      return (
                        <tr
                          key={balance.currency}
                          className="border-b border-border/50 hover:bg-accent/30"
                        >
                          <td className="px-3 py-2 text-foreground">
                            <div className="flex items-center gap-2">
                              <span>{balance.currency}</span>
                              {balance.isBase ? (
                                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                                  Base
                                </span>
                              ) : (
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${
                                    isLongExposure
                                      ? 'border-emerald-500/40 text-emerald-400'
                                      : 'border-red-500/40 text-red-400'
                                  }`}
                                >
                                  {isLongExposure ? 'Long FX' : 'Short FX'}
                                </span>
                              )}
                            </div>
                            {!balance.isBase && baseCurrency ? (
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                1 {balance.currency} = {formatRate(balance.exchangeRate)} {baseCurrency}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-foreground/85">
                            <div>{formatPrice(balance.cashBalance, -1)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              Settled {formatPrice(balance.settledCash, -1)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            <div>{formatPrice(balance.baseEquivalent, -1)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              Net liq {formatPrice(balance.netLiquidationValue, -1)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {balance.isBase ? (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            ) : (
                              <>
                                <div
                                  className={
                                    (balance.markToBasePnl ?? 0) >= 0
                                      ? 'text-emerald-400'
                                      : 'text-red-400'
                                  }
                                >
                                  {balance.markToBasePnl == null
                                    ? '—'
                                    : `${balance.markToBasePnl >= 0 ? '+' : ''}${formatPrice(balance.markToBasePnl, -1)}`}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {balance.entryBaseAmount != null && baseCurrency
                                    ? `Entry ${formatPrice(balance.entryBaseAmount, -1)} ${baseCurrency}`
                                    : 'Base outcome unavailable'}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            <div className={balance.interest >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {balance.interest >= 0 ? '+' : ''}
                              {formatPrice(balance.interest, -1)}
                            </div>
                            <div className="text-[10px] text-muted-foreground/80">
                              {formatPercent(interestPct)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {canUnwind ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  {flatten.previewLabel}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Flatten to {baseCurrency}
                                </div>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="outline"
                                  disabled={pendingUnwindCurrency === balance.currency}
                                  onClick={() => void handleUnwind(balance.currency)}
                                >
                                  {pendingUnwindCurrency === balance.currency
                                    ? 'Preparing...'
                                    : 'Load Ticket'}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {active ? <PortfolioDecompositionPanel /> : null}
          </div>
        )}
      </div>
    </div>
  );
}
