# Pulse Terminal — Claude Code Instructions

## 🔴 ALWAYS FOLLOW: Review Protocol

After completing any task, **always review your own work** before reporting done. This is not optional.

1. **Technical review** — Does the code compile? Are types correct? Are there edge cases, race conditions, missing error handling?
2. **Goal alignment review** — Re-read the original task prompt. Does your implementation actually achieve what was asked for? Not just technically correct — does it serve the stated goal? If the task said "wire up real-time watchlist prices" and you built a polling snapshot, that's a miss even if the code works.
3. **Integration review** — Does your change break anything else? Check imports, shared state, existing API routes, component props.

If you spawned sub-agents, review THEIR output against both technical quality AND the original goal before accepting it.

**When in doubt, re-read the task. The user's intent outranks your assumptions.**

---

## Project Overview

Pulse Terminal is a **personal IBKR trading terminal** for executing trades across 150+ global markets through Interactive Brokers. It is NOT a charting platform (TradingView handles that) — it's a weapon-grade execution surface: watchlist, snipe orders, one-click entry, portfolio view, and alert integration.

**Tech Stack:**
- **Framework:** Next.js 15 (App Router) + TypeScript
- **UI:** Tailwind CSS 4 + shadcn/ui + Radix UI
- **State:** Zustand 5
- **Charts:** Lightweight Charts 5 (TradingView open-source lib)
- **Market Data:** yahoo-finance2 (yfinance), FRED/OpenBB for macro
- **Broker:** IBKR Client Portal Gateway (REST + WebSocket)
- **Deployment:** Local only (runs on Tehbyn's machine)

## ⚠️ CRITICAL: Gateway Configuration

```
IBKR CP Gateway Port:  5050
Base URL:              https://localhost:5050/v1/api/
WebSocket:             wss://localhost:5050/v1/api/ws
Account Type:          PAPER TRADING
SSL:                   Self-signed cert — rejectUnauthorized: false REQUIRED
Next.js Dev Port:      5001 (configured in package.json)
```

**The gateway runs on port 5050.** The `.env.local` may still reference an older port — always use 5050 for IBKR gateway connections.

## Architecture: 4 Pages

| Page | Route | Purpose | Status |
|------|-------|---------|--------|
| **Terminal** | `/` (root) | Execution surface — watchlist, search, order entry, order blotter | Core IBKR page |
| **Dashboard** | `/dashboard` | Market overview — TradingView widgets, prices, macro, ratios, valuations | Uses yfinance/FRED |
| **Signal** | `/signal` | Thesis intelligence — regime analysis, track signals, macro brief | Uses yfinance/FRED/OpenBB |
| **Analytics** | `/analytics` | Deep-dive charts — candlestick, ratios, comparisons, FRED multi-line, insider, fundamentals | Uses yfinance/FRED |

**DO NOT modify the Signal page or Analytics page architecture unless explicitly asked.** These pages have complex track/regime/thesis logic that should not be casually changed.

## Data Sources

| Source | Used For | Location |
|--------|----------|----------|
| **IBKR Gateway (port 5050)** | Trading, execution, real-time streaming, portfolio, orders | `src/lib/ibkr/`, `src/app/api/ibkr/` |
| **yahoo-finance2 (yfinance)** | Price data, history, fundamentals for Dashboard/Signal/Analytics | `src/app/api/market/` |
| **FRED** | Macro data (rates, yields, economic indicators) | `src/app/api/market/fred/`, `src/app/api/market/macro/` |
| **OpenBB** | Additional market data (flows, energy, etc.) | `src/app/api/market/` routes |

## Existing Codebase

### IBKR Client Layer (`src/lib/ibkr/`)

| File | Description |
|------|-------------|
| `client.ts` | Main IBKR API wrapper — HTTP fetch with self-signed cert handling, mock mode support. All IBKR operations route through here. |
| `types.ts` | TypeScript types for all IBKR API shapes: SearchResult, ContractInfo, MarketDataSnapshot, Order, Position, AccountSummary, PortfolioPnL, AuthStatus. Also exports `MARKET_DATA_FIELDS` constant and `WATCHLIST_FIELD_LIST`. |
| `websocket.ts` | Client-side WebSocket manager with auto-reconnect, heartbeat (tic every 55s), subscription tracking. Handles smd+ (market data), sor (orders), spl (P&L) message routing. Singleton via `getWebSocket()`. |
| `mock-data.ts` | Mock data generators for development without live gateway. Activated by `IBKR_MOCK_MODE=true`. |
| `conid-cache.ts` | In-memory cache for contract info and search results (24h TTL). Reduces redundant API calls. |

### API Routes

**IBKR routes** (`src/app/api/ibkr/`):
- `search/route.ts` — `GET /api/ibkr/search?q=AAPL` — instrument search
- `marketdata/route.ts` — `GET /api/ibkr/marketdata?conids=265598` (snapshot) or `?history=265598&period=1d&bar=5min` (historical)
- `orders/route.ts` — `GET` (list), `POST` (place), `DELETE ?orderId=X` (cancel)
- `portfolio/route.ts` — `GET ?type=positions|summary|pnl|all`

**Market data routes** (`src/app/api/market/`):
- `prices/` — yfinance price quotes
- `history/` — yfinance historical OHLCV
- `fundamentals/` — company fundamentals
- `fundamentals-deep/` — extended fundamentals
- `fred/` — FRED economic data
- `macro/` — macro indicators
- `snapshot/` — quick price snapshot
- `ratio/` — ratio charting data
- `multi/` — multi-symbol data
- `flows/` — market flows
- `energy/` — energy data
- `valuation/` — valuation metrics

### Zustand Stores (`src/lib/store/`)

| Store | Key State |
|-------|-----------|
| `watchlist.ts` | `items: WatchlistItem[]`, `prices: Record<number, PriceData>`, `selectedConid`, `addItem()`, `removeItem()`, `updatePrice()`, `updatePrices()` |
| `orders.ts` | `orders: Order[]`, `isSubmitting`, `orderForm: {side, orderType, quantity, price, tif}`, CRUD actions |
| `portfolio.ts` | `positions`, `summary`, `pnl`, `accountId`, `isConnected`, `isPaper`, update actions |

### UI Components (`src/components/`)

**Core terminal components:**
- `SearchBar.tsx` — Universal instrument search
- `Watchlist.tsx` / `WatchlistItem.tsx` — Persistent watchlist with real-time prices
- `InstrumentDetail.tsx` — Selected instrument bid/ask/volume/chart
- `OrderPanel.tsx` — Buy/sell buttons, size, order type
- `OrderBlotter.tsx` — Live order status
- `ValuationPanel.tsx` — Valuation metrics display

**Chart components** (`src/components/charts/`):
- `CandlestickChart.tsx`, `ComparisonChart.tsx`, `FredMultiLine.tsx`, `RatioChart.tsx`, `FundamentalsGrid.tsx`, `InsiderTable.tsx`

**TradingView widgets** (`src/components/tv/`):
- `AdvancedChart.tsx`, `TickerTape.tsx`, `MarketOverview.tsx`, `MiniChart.tsx`, `Heatmap.tsx`, `Screener.tsx`, `EconomicCalendar.tsx`, `TopStories.tsx`

## IBKR API Reference

**The comprehensive IBKR API reference is in `API-ROUTES.md` at project root.** This is the primary reference for all IBKR endpoint details, parameters, return types, rate limits, and pseudo-code. Read it before implementing any new IBKR integration.

**Verification report:** `.claude/API-VERIFICATION.md` contains corrections and additions found during verification against IBKR Campus docs. Key findings:
- **spl+{} WebSocket BREAKING CHANGE:** Excess Liquidity field changed from `el` to `uel` — existing `websocket.ts` handler needs update
- **Server-side watchlists exist:** IBKR has `POST/GET/DELETE /iserver/watchlist` endpoints (API-ROUTES.md Section 12 incorrectly says they don't)
- **Snapshot limit:** 100 conids per query, 50 fields max (enforced since Dec 2025)
- **New `established` session flag:** More reliable than `authenticated` alone for session init detection
- **New WebSocket topics:** `sad+{}` (account summary), `sld+{}` (ledger), `str+{}` (trades) available but not yet implemented

## Key Skill Docs

Detailed skill docs for specific IBKR subsystems are in `.claude/skills/`:
- `ibkr-gateway.md` — Connection, auth, session management, rate limits
- `ibkr-market-data.md` — Snapshots, history, WebSocket streaming, field tags
- `ibkr-trading.md` — Order placement, modification, cancellation, order types
- `ibkr-portfolio.md` — Portfolio, positions, P&L, account summary, ledger

## ⚠️ Key Gotchas (from API-ROUTES.md §18)

1. **macOS port conflict:** AirPlay uses port 5000. Gateway is on port 5050.
2. **Daily re-auth required:** Sessions expire at midnight regional time. No automated re-login.
3. **One brokerage session per username:** If TWS is open, CP API can't trade.
4. **Self-signed SSL:** All Node.js fetch calls need `rejectUnauthorized: false`.
5. **First snapshot returns EMPTY:** Pre-flight request initializes the stream. Must make TWO requests for new conids.
6. **Delayed data without subscription:** Without paid market data, API returns 15-min delayed or nothing.
7. **100 market data line limit:** Each streaming conid uses one line.
8. **Field values are strings:** Parse everything to numbers — `"84": "168.41"`.
9. **Change field has prefix:** `"82": "C1.42"` — strip C (green/up) or H (red/down) before parsing.
10. **Order reply messages:** Orders often return confirmation prompts. Must handle reply/confirm cascade via `/iserver/reply/{id}`.
11. **Must call `/iserver/accounts` before placing orders** — or you'll get errors.
12. **New orders use array format:** `{ "orders": [...] }`. Modifications use single object (no array).
13. **WebSocket needs its own heartbeat:** Send `tic` every 55s, separate from HTTP `/tickle`.
14. **Rate limit penalty box:** Exceeding 10 req/s → IP banned 10-15 min. Repeat → permanent.
15. **Paper account quirks:** Paper accounts have separate usernames. Execution simulation may differ from live.

## Coding Conventions

- All IBKR calls go through `src/lib/ibkr/client.ts` — never call the gateway directly from components or API routes
- Use the existing type definitions in `src/lib/ibkr/types.ts`
- Mock mode (`IBKR_MOCK_MODE=true`) should be maintained for development without live gateway
- WebSocket is client-side only (browser) — server-side uses HTTP via API routes
- Zustand stores are the single source of truth for UI state
- Use shadcn/ui components from `src/components/ui/` for all new UI
- Dark theme is the only theme — all colors use zinc/neutral palette with green/red for P&L
