'use client';

import { useEffect, useRef, useState } from 'react';
import { OrderBlotter } from '@/components/OrderBlotter';
import { PositionsPanel } from '@/components/PositionsPanel';
import { AccountActivityPanel } from '@/components/AccountActivityPanel';
import { AlertsPanel } from '@/components/AlertsPanel';
import { getPortfolioSnapshot } from '@/lib/ibkr/gateway-client';
import { useGatewayStore } from '@/lib/store/gateway';
import { usePortfolioStore } from '@/lib/store/portfolio';
import { formatPrice } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SHEET_PEEK_PX = 40;

export function AppBottomSheet() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('positions');
  const gatewayUp = useGatewayStore((s) => s.connected);
  const positions = usePortfolioStore((s) => s.positions);
  const summary = usePortfolioStore((s) => s.summary);
  const isPaper = usePortfolioStore((s) => s.isPaper);
  const accountId = usePortfolioStore((s) => s.accountId);
  const setPositions = usePortfolioStore((s) => s.setPositions);
  const setCashBalances = usePortfolioStore((s) => s.setCashBalances);
  const setSummary = usePortfolioStore((s) => s.setSummary);
  const setPnL = usePortfolioStore((s) => s.setPnL);
  const setAccountId = usePortfolioStore((s) => s.setAccountId);
  const setPortfolioConnected = usePortfolioStore((s) => s.setConnected);
  const setIsPaper = usePortfolioStore((s) => s.setIsPaper);
  const portfolioInflightRef = useRef(false);

  useEffect(() => {
    if (!gatewayUp) {
      setPortfolioConnected(false);
      return;
    }

    let cancelled = false;

    const syncPortfolio = async () => {
      if (portfolioInflightRef.current) return;
      portfolioInflightRef.current = true;
      try {
        const snapshot = await getPortfolioSnapshot();
        if (cancelled) return;
        setPositions(snapshot.positions);
        setCashBalances(snapshot.cashBalances, snapshot.baseCurrency);
        setSummary(snapshot.summary);
        if (snapshot.pnl) setPnL(snapshot.pnl);
        setAccountId(snapshot.account.accountId || snapshot.summary.accountId);
        setIsPaper(snapshot.account.isPaper);
        setPortfolioConnected(true);
      } catch {
        if (!cancelled) {
          setPortfolioConnected(false);
        }
      } finally {
        portfolioInflightRef.current = false;
      }
    };

    void syncPortfolio();
    const interval = setInterval(syncPortfolio, 15_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    gatewayUp,
    setAccountId,
    setCashBalances,
    setIsPaper,
    setPnL,
    setPortfolioConnected,
    setPositions,
    setSummary,
  ]);

  const accountSummaryLine = summary
    ? `${isPaper ? 'PAPER' : 'LIVE'} ${accountId || summary.accountId} · Cash ${formatPrice(summary.totalCash)} · Net Liq ${formatPrice(summary.netLiquidity)} · ${positions.length} position${positions.length === 1 ? '' : 's'}`
    : 'Orders / Positions';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60]">
      <div
        className="pointer-events-auto mx-auto h-[78vh] max-h-[860px] min-h-[360px] overflow-hidden rounded-t-xl border border-b-0 border-border/80 bg-card transition-transform duration-300 ease-out"
        style={{
          transform: isExpanded
            ? 'translateY(0)'
            : `translateY(calc(100% - ${SHEET_PEEK_PX}px))`,
          boxShadow: 'var(--pulse-app-shadow)',
        }}
      >
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur">
            <div className="flex items-center justify-between px-2 pt-1">
              <button
                type="button"
                onClick={() => setIsExpanded((open) => !open)}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded px-2 py-1 text-left hover:bg-accent/60"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Collapse orders panel' : 'Expand orders panel'}
              >
                <span className="mx-1 h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-muted-foreground" />
                <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {accountSummaryLine}
                </span>
              </button>
            </div>

            <TabsList className="h-8 rounded-none border-0 bg-transparent px-2">
              <TabsTrigger
                value="positions"
                className="rounded-none px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground data-[state=active]:border-b data-[state=active]:border-foreground/40 data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                Positions
              </TabsTrigger>
              <TabsTrigger
                value="orders"
                className="rounded-none px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground data-[state=active]:border-b data-[state=active]:border-foreground/40 data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                Orders
              </TabsTrigger>
              <TabsTrigger
                value="ledger"
                className="rounded-none px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground data-[state=active]:border-b data-[state=active]:border-foreground/40 data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                Ledger
              </TabsTrigger>
              <TabsTrigger
                value="alerts"
                className="rounded-none px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground data-[state=active]:border-b data-[state=active]:border-foreground/40 data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                Alerts
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="positions" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <PositionsPanel active={isExpanded && activeTab === 'positions'} />
          </TabsContent>
          <TabsContent value="orders" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <OrderBlotter />
          </TabsContent>
          <TabsContent value="ledger" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <AccountActivityPanel />
          </TabsContent>
          <TabsContent value="alerts" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <AlertsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
