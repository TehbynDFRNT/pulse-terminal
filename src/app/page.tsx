'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { Watchlist } from '@/components/Watchlist';
import { InstrumentDetail } from '@/components/InstrumentDetail';
import { OrderBlotter } from '@/components/OrderBlotter';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { usePortfolioStore } from '@/lib/store/portfolio';
import { useOrdersStore } from '@/lib/store/orders';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function ConnectionStatus() {
  const [status, setStatus] = useState<'disconnected' | 'mock'>('mock');

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-1.5 h-1.5 rounded-full ${
        status === 'mock' ? 'bg-amber-500' : 'bg-red-500'
      }`} />
      <span className="text-zinc-500 uppercase tracking-wider">
        {status === 'mock' ? 'Mock Mode' : 'Disconnected'}
      </span>
    </div>
  );
}

function PortfolioSummary() {
  const summary = usePortfolioStore((s) => s.summary);
  const positions = usePortfolioStore((s) => s.positions);
  const pnl = usePortfolioStore((s) => s.pnl);

  // Mock summary data for display
  const nav = summary?.netLiquidity ?? 0;
  const dailyPnl = pnl?.dailyPnL ?? 0;
  const unrealized = pnl?.unrealizedPnL ?? 0;

  return (
    <div className="flex items-center gap-6 text-xs">
      <div>
        <span className="text-zinc-500 mr-2">NAV</span>
        <span className="text-zinc-200 font-medium">
          {nav > 0 ? `$${nav.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
        </span>
      </div>
      <div>
        <span className="text-zinc-500 mr-2">Day P&L</span>
        <span className={dailyPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {dailyPnl !== 0 ? `${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
        </span>
      </div>
      <div>
        <span className="text-zinc-500 mr-2">Unreal</span>
        <span className={unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {unrealized !== 0 ? `${unrealized >= 0 ? '+' : ''}$${unrealized.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
        </span>
      </div>
    </div>
  );
}

function PositionsPanel() {
  const positions = usePortfolioStore((s) => s.positions);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-2 px-3 font-medium">Symbol</th>
            <th className="text-right py-2 px-3 font-medium">Qty</th>
            <th className="text-right py-2 px-3 font-medium">Avg Cost</th>
            <th className="text-right py-2 px-3 font-medium">Mkt Price</th>
            <th className="text-right py-2 px-3 font-medium">P&L</th>
            <th className="text-right py-2 px-3 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const pnl = pos.unrealizedPnl ?? 0;
            const pnlPct = pos.avgCost > 0 ? ((pos.marketPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
            return (
              <tr key={pos.conid} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-2 px-3 text-zinc-200">{pos.symbol}</td>
                <td className="py-2 px-3 text-right text-zinc-300">{pos.position}</td>
                <td className="py-2 px-3 text-right text-zinc-400">${pos.avgCost.toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-zinc-200">${pos.marketPrice.toFixed(2)}</td>
                <td className={`py-2 px-3 text-right ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </td>
                <td className={`py-2 px-3 text-right ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Terminal() {
  const selectedConid = useWatchlistStore((s) => s.selectedConid);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-[#0e0e0e] shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-widest text-zinc-300 uppercase">
            Pulse
          </h1>
          <div className="w-px h-4 bg-zinc-800" />
          <nav className="flex items-center gap-1">
            <span className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-200 bg-zinc-800/50 rounded">
              Terminal
            </span>
            <Link
              href="/dashboard"
              className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors rounded"
            >
              Dashboard
            </Link>
            <Link
              href="/signal"
              className="px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors rounded"
            >
              Signal
            </Link>
          </nav>
          <div className="w-px h-4 bg-zinc-800" />
          <ConnectionStatus />
        </div>
        <PortfolioSummary />
      </header>

      {/* Search bar */}
      <div className="px-4 py-2 border-b border-zinc-800/50 bg-[#0c0c0c] shrink-0">
        <SearchBar />
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Watchlist */}
        <div className="w-[280px] shrink-0 border-r border-zinc-800/80 flex flex-col bg-[#0c0c0c]">
          <div className="px-3 py-2 border-b border-zinc-800/50">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
              Watchlist
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <Watchlist />
          </div>
        </div>

        {/* Center: Instrument detail + order panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 overflow-auto">
            {selectedConid ? (
              <InstrumentDetail />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-zinc-600 text-sm">Select an instrument from the watchlist</p>
                  <p className="text-zinc-700 text-xs mt-1">or search for one above</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom panel: Orders / Positions */}
      <div className="h-[220px] shrink-0 border-t border-zinc-800/80 bg-[#0c0c0c]">
        <Tabs defaultValue="orders" className="h-full flex flex-col">
          <TabsList className="bg-transparent border-b border-zinc-800/50 rounded-none px-2 h-8 shrink-0">
            <TabsTrigger
              value="orders"
              className="text-[10px] uppercase tracking-widest data-[state=active]:text-zinc-200 data-[state=active]:bg-transparent data-[state=active]:border-b data-[state=active]:border-zinc-400 rounded-none px-3 py-1"
            >
              Orders
            </TabsTrigger>
            <TabsTrigger
              value="positions"
              className="text-[10px] uppercase tracking-widest data-[state=active]:text-zinc-200 data-[state=active]:bg-transparent data-[state=active]:border-b data-[state=active]:border-zinc-400 rounded-none px-3 py-1"
            >
              Positions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="orders" className="flex-1 min-h-0 mt-0">
            <OrderBlotter />
          </TabsContent>
          <TabsContent value="positions" className="flex-1 min-h-0 mt-0">
            <PositionsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
