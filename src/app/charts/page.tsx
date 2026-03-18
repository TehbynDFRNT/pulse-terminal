'use client';

import { PulseNav } from '@/components/PulseNav';
import { InstrumentHeader } from '@/components/InstrumentHeader';
import { PriceChart } from '@/components/charts/PriceChart';
import { InstrumentRail } from '@/components/market/InstrumentRail';
import { DASHBOARD_CHART_COLORS } from '@/lib/dashboard/widgets';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { formatPercentString } from '@/lib/utils';

interface DashInstrument {
  conid: number;
  symbol: string;
  name: string;
  exchange: string;
  color: string;
}

interface DashPrice {
  last: number;
  displayPrice: number;
  displayChange: number;
  displayChangePct?: string;
  changePct?: string;
  hasLiveData: boolean;
  updated?: number;
  marketDataStatus?: 'live' | 'delayed' | 'frozen' | 'unavailable' | 'unknown';
}

function fmtChange(pct: string | undefined): { text: string; positive: boolean } {
  if (!pct) return { text: '—', positive: true };
  const cleaned = pct.replace(/[^0-9.+-]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return { text: pct, positive: true };
  return {
    text: formatPercentString(pct),
    positive: n >= 0,
  };
}

export default function ChartsPage() {
  const items = useWatchlistStore((s) => s.items);
  const prices = useWatchlistStore((s) => s.prices);
  const selectedConid = useWatchlistStore((s) => s.selectedConid);
  const selectInstrument = useWatchlistStore((s) => s.selectInstrument);
  const instruments: DashInstrument[] = items.map((item, index) => ({
    conid: item.conid,
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchange,
    color: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length],
  }));

  const activeInst = instruments.find((instrument) => instrument.conid === selectedConid);
  const activePrice = selectedConid ? (prices[selectedConid] as DashPrice | undefined) : undefined;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <PulseNav />

      <div className="flex min-h-0 flex-1">
        <InstrumentRail />

        <div className="flex min-w-0 flex-1 flex-col">
          {activeInst && selectedConid ? (
            <>
              <InstrumentHeader
                conid={selectedConid}
                exchange={activeInst.exchange}
                symbol={activeInst.symbol}
                name={activeInst.name}
                price={activePrice?.displayPrice}
                changePct={activePrice?.displayChangePct || activePrice?.changePct}
              />

              <div className="flex-1 min-h-0">
                <PriceChart
                  conid={selectedConid}
                  symbol={activeInst.symbol}
                  exchange={activeInst.exchange}
                  color={activeInst.color}
                  className="h-full"
                  stateScope="primary-chart"
                  snapshotLast={activePrice?.displayPrice}
                  snapshotUpdatedAt={activePrice?.updated}
                  snapshotMarketDataStatus={activePrice?.marketDataStatus}
                  showValueLabel={false}
                />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">No instrument selected</p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  Search and add instruments from the left panel
                </p>
              </div>
            </div>
          )}
        </div>

        {instruments.length > 1 && (
          <div className="w-[320px] shrink-0 overflow-y-auto border-l border-border/80 bg-card">
            <div className="border-b border-border/60 px-3 py-2">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                All Instruments
              </span>
            </div>
            {instruments.map((inst) => (
              <div
                key={inst.conid}
                onClick={() => selectInstrument(inst.conid)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectInstrument(inst.conid);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`w-full border-b border-border/40 transition-colors ${
                  selectedConid === inst.conid ? 'bg-accent/70' : 'hover:bg-accent/40'
                }`}
              >
                <PriceChart
                  conid={inst.conid}
                  symbol={inst.symbol}
                  exchange={inst.exchange}
                  color={inst.color}
                  height={120}
                  snapshotLast={prices[inst.conid]?.displayPrice}
                  snapshotUpdatedAt={prices[inst.conid]?.updated}
                  snapshotMarketDataStatus={prices[inst.conid]?.marketDataStatus}
                  defaultTimeframeKey="1D"
                  defaultResolutionKey="5m"
                  defaultMode="line"
                  showModeToggle={false}
                  showWindowControls={false}
                  showValueLabel={false}
                  showBadge={false}
                  streamingEnabled={false}
                  interactive={false}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
