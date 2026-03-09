# REBUILD.md — Clean-Slate Dashboard + Signal Pages

## Context
The current Dashboard and Signal pages are bloated with multiple competing data sources (TradingView widgets, yfinance API routes, and half-connected IBKR/Liveline components). The user wants a clean rebuild powered entirely by the IBKR gateway + Liveline charts. No TradingView, no yfinance.

## What to REMOVE
- `src/components/tv/` — entire directory (TradingView widgets: AdvancedChart, TickerTape, TopStories, MarketOverview, Screener, Heatmap, MiniChart, EconomicCalendar)
- `src/components/charts/LivePriceChart.tsx` — orphan from first build attempt
- `src/components/charts/HistoryChart.tsx` — orphan from first build attempt
- `src/components/charts/CandlestickChart.tsx` — uses Lightweight Charts, replaced by Liveline
- `src/components/charts/RatioChart.tsx` — uses Lightweight Charts, replace with Liveline
- `src/components/charts/ComparisonChart.tsx` — uses Lightweight Charts, replace with Liveline
- `src/components/charts/FredMultiLine.tsx` — uses Lightweight Charts, replace with Liveline
- `src/app/api/market/prices/route.ts` — yfinance-based, replace with IBKR
- `src/app/api/market/history/route.ts` — yfinance-based, replace with IBKR
- `src/app/api/market/snapshot/route.ts` — yfinance-based, replace with IBKR
- `src/app/api/market/multi/route.ts` — yfinance-based
- `src/app/api/market/ratio/route.ts` — yfinance-based
- `src/app/api/market/energy/route.ts` — yfinance-based
- `src/app/api/market/flows/route.ts` — yfinance-based
- `src/lib/yahoo.ts` — yfinance utility
- Remove `lightweight-charts` from package.json dependencies

## What to KEEP
- `src/app/page.tsx` (Terminal) — don't touch, it's the execution page
- `src/app/analytics/page.tsx` — don't touch for now
- `src/app/api/ibkr/` — all IBKR API routes (marketdata, search, portfolio, orders)
- `src/app/api/market/fred/route.ts` — FRED macro data (this calls OpenBB, not yfinance, keep it)
- `src/app/api/market/macro/route.ts` — FRED macro aggregation (keep)
- `src/app/api/market/fundamentals/route.ts` — review, may need updating but keep
- `src/app/api/market/fundamentals-deep/route.ts` — keep
- `src/app/api/market/valuation/route.ts` — keep
- `src/components/charts/PriceChart.tsx` — Liveline chart, this is the new standard
- `src/components/charts/FundamentalsGrid.tsx` — keep
- `src/components/charts/InsiderTable.tsx` — keep
- `src/components/ValuationPanel.tsx` — keep
- `src/components/charts/index.ts` — update exports
- `src/lib/ibkr/` — entire directory (client, types, websocket, useIBKRWebSocket, conid-cache, mock-data)
- `src/lib/store/` — Zustand stores (portfolio, watchlist, orders)
- `src/lib/signals.ts` — thesis track logic (PM, Energy, REE) — the LOGIC is good, just needs IBKR data instead of yfinance
- `src/lib/composite-signals.ts` — keep the signal computation logic
- `src/lib/fundamentals-types.ts` — keep
- `src/components/ui/` — all shadcn components
- `src/components/SearchBar.tsx`, `Watchlist.tsx`, `WatchlistItem.tsx`, `InstrumentDetail.tsx`, `OrderBlotter.tsx`, `OrderPanel.tsx` — Terminal page components, keep

## What to ADD/CREATE

### Gateway Connection Manager
`src/lib/ibkr/gateway-manager.ts`
- Background tickle keepalive every 55 seconds
- Auth status polling
- Auto-reconnect detection
- Expose connection status for UI indicators
- "Connect Gateway" button that opens `https://localhost:5050` in new tab when disconnected

### IBKR Conid Registry
`src/lib/ibkr/conid-registry.ts`
- Pre-mapped conids for all thesis instruments (avoid search API calls on every page load)
- Gold (GC), Silver (SI), Copper (HG), Crude (CL), NatGas (NG), Platinum (PL)
- ASX miners: NST, EVN, RMS, GOR, WGX
- Uranium: URA, CCJ, UEC, PDN.AX, BOE.AX, DYL.AX, LOT.AX
- REE/Critical: REMX, MP, LYC.AX, ARU.AX, ILU.AX
- Macro: SPY, DXY, BTC
- Fallback to search API for unknown symbols
- Cache resolved conids

### Liveline-based Chart Components
All charts use `src/components/charts/PriceChart.tsx` (already exists, Liveline-based).

Create additional:
- `src/components/charts/RatioLiveline.tsx` — ratio chart (e.g. Gold/Silver) using Liveline. Computes ratio from two IBKR streams.
- `src/components/charts/SparkLine.tsx` — tiny inline Liveline chart for price list rows (minimal, no controls)

### Dashboard Page (CLEAN REBUILD)
`src/app/dashboard/page.tsx` — complete rewrite

Layout:
- **Header**: Pulse logo, nav (Terminal | Dashboard | Signal), gateway connection indicator with "Connect" button, time
- **Left sidebar** (~220px): Price watchlist grouped by thesis track (Commodities, ASX Miners, Energy, Critical Minerals, Macro). Each row: symbol, name, current price (from IBKR snapshot/stream), change %, and a tiny SparkLine. Clicking a row sets it as the main chart.
- **Centre**: Full Liveline PriceChart for the selected instrument. Line/candle toggle, time windows. This is THE chart — big, dominant, fills available space.
- **Right sidebar** (~280px): 
  - Key ratios (G/S, Cu/Au) — computed from IBKR data
  - FRED Macro indicators (keep the existing FRED API route — yields, fed funds, real rate, breakeven, stress, unemployment, dollar)
  - Gateway status panel (account ID, paper/live, NLV, buying power — from IBKR portfolio API)
  - No TradingView news widget — replace with a simple "Recent Alerts" or just leave clean

Data flow:
1. On mount: call `/api/ibkr/portfolio` for account info
2. Batch resolve conids via registry
3. Fetch snapshots for all instruments (batch, max 100 per call)
4. Subscribe to WebSocket streaming for visible instruments
5. FRED macro loads in parallel (existing route)
6. Tickle keepalive runs in background

### Signal Page (CLEAN REBUILD)
`src/app/signal/page.tsx` — rewrite, but PRESERVE the thesis logic

The Signal page's intellectual architecture is sound (3 tracks, regime detection, thesis conditions, scored signals, movers, natural language brief). Keep `src/lib/signals.ts` and `src/lib/composite-signals.ts`.

What changes:
- Remove all TradingView AdvancedChart references
- Replace yfinance price data with IBKR snapshots
- Replace yfinance-based chart widgets with Liveline PriceChart
- The regime computation, thesis scoring, signal generation stay the same — just feed them IBKR data instead of yfinance data
- Each track gets a Liveline chart for its primary instrument (Gold for PM, URA for Energy, REMX for REE)
- Movers section uses IBKR snapshot change data

## Architecture Principles
1. **One data source for prices**: IBKR gateway. Period. No yfinance, no TradingView.
2. **One charting library**: Liveline. No Lightweight Charts, no TradingView widgets.
3. **FRED stays**: Macro data (yields, stress indices) comes from FRED/OpenBB — IBKR doesn't provide this.
4. **Fundamentals stay**: Company fundamentals endpoints stay (they use yfinance for PE/ROE/etc which IBKR doesn't provide well for free).
5. **Lean pages**: No bloat. Every component earns its space. If it's not providing decision-relevant information, it goes.
6. **Gateway-aware**: Every page shows gateway connection status. If disconnected, show "Connect" button linking to localhost:5050.

## IBKR API Quick Reference (for this rebuild)
- Auth status: `GET /iserver/auth/status`
- Tickle: `POST /tickle` (every 55s)
- Accounts: `GET /iserver/accounts` (call once on init)
- Snapshot: `GET /iserver/marketdata/snapshot?conids=X,Y,Z&fields=31,84,86,82,83,87,88`
- History: `GET /iserver/marketdata/history?conid=X&period=2d&bar=5min`
- Search: `GET /iserver/secdef/search?symbol=X`
- Portfolio: `GET /portfolio/{accountId}/summary`
- WebSocket: `wss://localhost:5050/v1/api/ws` → send `smd+{conid}+{fields}` to subscribe
- ALL requests need `User-Agent: pulse-terminal/1.0` header or get 403
- ALL requests need `rejectUnauthorized: false` for self-signed SSL
- First snapshot call returns empty — need two calls
- HMDS bridge lazy-initializes — handle history 500 gracefully with retry

## Test Plan
After rebuild:
1. Start gateway: `cd gateway && bin/run.sh root/conf.yaml`
2. Login at https://localhost:5050 (paper account)
3. Start dev server: `npm run dev` (port 5001)
4. Dashboard loads → shows gateway connected → prices populate → charts render
5. Click different instruments → chart updates
6. Signal page loads → thesis tracks render with IBKR data
7. No TradingView iframes anywhere
8. No yfinance API calls for price data
