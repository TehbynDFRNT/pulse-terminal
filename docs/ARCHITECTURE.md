# Pulse Terminal — Architecture & PRD
*Personal trading execution terminal. Your finger on the pulse.*

## Vision
A custom-built trading terminal that gives Tehbyn direct API-level access to 150+ global markets through Interactive Brokers, with a UI designed for his workflow: conviction → execution, zero friction.

**Not a trading bot.** Not a charting platform (TradingView handles that). This is a **weapon-grade execution surface** — watchlist, snipe orders, one-click entry, portfolio view, and alert integration with Novacron.

---

## Core Principles
1. **You own the infrastructure** — your app, your code, IBKR as dumb plumbing
2. **Zero friction execution** — from conviction to position in one click
3. **Global reach** — TSXV miners, Argentine banks, Israeli tech, silver futures, anything IBKR can access
4. **Progressive automation** — manual first, snipe orders second, algo later if desired
5. **Clean and fast** — no clutter, no consumer app bloat, dark UI, information-dense

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | Next.js 14 (App Router) + TypeScript | Tehbyn's stack, SSR for speed, API routes for backend |
| **UI** | Tailwind CSS + shadcn/ui | Fast to build, dark mode native, clean components |
| **State** | Zustand | Lightweight, no boilerplate, works with websockets |
| **Charts** | Lightweight Charts (TradingView open-source lib) | Primary charting surface — full candlestick charts, overlays, multi-pane. Complement TradingView Pine Scripts (stored in `tradingview-pine/`) with embedded charts we fully control programmatically. Novacron can build and update chart configs, indicators, and layouts directly via code. |
| **Broker API** | `ibkr-client` npm package | TypeScript IBKR Web API client with OAuth + WebSocket support |
| **Real-time** | IBKR WebSocket API | Live market data, order status, portfolio updates |
| **Auth gateway** | IBKR Client Portal Gateway (Java) | Required for individual accounts — runs locally, routes API calls |
| **Deployment** | Local (Tehbyn's machine) | Runs on same network as OpenClaw, no cloud dependency |

---

## IBKR API Architecture

### Connection Method: Client Portal Gateway (Phase 1)
- Java-based local gateway — download from IBKR, runs on localhost
- Auth via browser SSO (login once, session persists)
- All API calls route through `https://localhost:5000/v1/api/`
- WebSocket at `wss://localhost:5000/v1/api/ws`
- Session keepalive via `/tickle` endpoint (every ~60s)

### Future: OAuth Direct (Phase 2, if needed)
- `ibkr-client` npm package supports OAuth 1.0a
- Eliminates gateway dependency — direct to `api.ibkr.com`
- Requires IBKR institutional/pro setup for OAuth keys

### Key API Endpoints
```
POST   /iserver/auth/ssodh/init     — Init session
POST   /tickle                       — Keepalive
GET    /iserver/secdef/search        — Search instruments (any market)
GET    /iserver/marketdata/snapshot  — Price snapshot
POST   /iserver/marketdata/history   — Historical bars
POST   /iserver/account/{id}/orders  — Place order
GET    /portfolio/{id}/positions     — Current positions
GET    /portfolio/accounts           — Account summary
DELETE /iserver/account/{id}/order/{orderId} — Cancel order
```

### WebSocket Subscriptions
```
smd+{conid}+{fields}  — Subscribe to market data
sor+{}                 — Subscribe to order updates
spl+{}                 — Subscribe to P&L updates
```

---

## Features (Phased)

### Phase 1: Core Terminal (MVP)
The minimum to stop missing trades.

**1.1 Instrument Search**
- Universal search bar — type "silver", "TSXV:ABC", "AAPL"
- Returns results across all IBKR exchanges
- Shows: name, exchange, type, last price, daily change
- Add to watchlist with one click

**1.2 Watchlist**
- Persistent list of tracked instruments
- Real-time prices via WebSocket
- Mini sparkline (24h) per instrument
- Color-coded change (green/red)
- Click to open instrument detail panel

**1.3 One-Click Execution**
- Instrument detail shows: bid/ask, spread, volume, day range
- **BUY / SELL** buttons — large, prominent, no ambiguity
- Pre-configured position sizing (% of portfolio or fixed $)
- Order types: Market, Limit, Stop
- Limit price defaults to current bid/ask, adjustable
- **Single confirmation**: shows order summary → CONFIRM → done
- No "are you sure?" chains — you decided when you clicked

**1.4 Order Blotter**
- Live view of pending/filled/cancelled orders
- WebSocket-driven updates
- Cancel button on pending orders

**1.5 Portfolio View**
- All open positions with real-time P&L
- Unrealized + realized P&L
- Total portfolio value + available margin
- Position sizing relative to total

### Phase 2: Snipe Mode
For pre-planned entries — set and forget until it hits.

**2.1 Price Alerts**
- Set target price on any watchlist instrument
- When price hits zone → push notification + Novacron voice alert
- Alert persists across sessions (stored locally)

**2.2 Snipe Orders**
- Pre-configure: instrument, direction, size, entry price, optional stop-loss
- Order doesn't fire until price hits your target
- When triggered: auto-submits to IBKR, notifies you
- Dashboard shows active snipes with status

### Phase 3: Novacron Integration
- I monitor your snipe list and watchlist
- Voice alerts when targets approach ("Silver is at 65.20, your snipe is set at 64. Two percent away.")
- Morning briefing with portfolio summary + watchlist movers
- Natural language order entry ("Buy 100 shares of SLV at market")

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  🔍 Search                              Portfolio $  │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   WATCHLIST          │   INSTRUMENT DETAIL          │
│                      │                              │
│   AAPL    $178.50 ▲  │   Silver Futures (COMEX)     │
│   SLV     $28.40  ▼  │   Last: $83.20  ▲ +1.4%     │
│   XAG/USD $83.20  ▲  │   Bid: $83.18  Ask: $83.22  │
│   BMA     $94.10  ▲  │   Vol: 142,832              │
│   ...               │   Day: $81.90 - $83.45       │
│                      │                              │
│                      │   ┌──────┐  ┌──────┐        │
│                      │   │ BUY  │  │ SELL │        │
│                      │   └──────┘  └──────┘        │
│                      │                              │
│                      │   Size: [100] Type: [Market] │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│  ORDERS / POSITIONS                                  │
│  ┌ Open Orders ─────────────────────────────────┐   │
│  │ BUY 50 SLV @ LIMIT $27.80  PENDING  [CANCEL] │   │
│  └──────────────────────────────────────────────┘   │
│  ┌ Positions ───────────────────────────────────┐   │
│  │ AAPL  100 shares  +$340 (+1.9%)              │   │
│  │ XAG   10 contracts  +$1,200 (+2.1%)          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

Dark theme. Monospace prices. Green/red for direction. Minimal chrome.

---

## Project Structure

```
pulse-terminal/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── .env.local                    # IBKR gateway URL, port
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout, providers
│   │   ├── page.tsx              # Main terminal view
│   │   └── api/
│   │       ├── ibkr/
│   │       │   ├── search/route.ts
│   │       │   ├── orders/route.ts
│   │       │   ├── portfolio/route.ts
│   │       │   └── marketdata/route.ts
│   │       └── watchlist/route.ts
│   ├── components/
│   │   ├── SearchBar.tsx
│   │   ├── Watchlist.tsx
│   │   ├── WatchlistItem.tsx
│   │   ├── InstrumentDetail.tsx
│   │   ├── OrderPanel.tsx
│   │   ├── OrderBlotter.tsx
│   │   ├── PortfolioView.tsx
│   │   ├── PositionRow.tsx
│   │   └── ui/                   # shadcn components
│   ├── lib/
│   │   ├── ibkr/
│   │   │   ├── client.ts         # ibkr-client wrapper
│   │   │   ├── websocket.ts      # WebSocket manager
│   │   │   ├── types.ts          # IBKR API types
│   │   │   └── conid-cache.ts    # Contract ID cache
│   │   ├── store/
│   │   │   ├── watchlist.ts      # Zustand watchlist store
│   │   │   ├── orders.ts         # Zustand orders store
│   │   │   └── portfolio.ts      # Zustand portfolio store
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
└── data/
    └── watchlist.json            # Persistent watchlist
```

---

## Build Sequence (Agent Tasks)

### Tree 1: Foundation + IBKR Integration
1. Scaffold Next.js project with TypeScript, Tailwind, shadcn/ui
2. Install `ibkr-client`, set up client wrapper with gateway connection
3. Build API routes: search, market data, orders, portfolio
4. Build WebSocket manager with reconnect logic
5. Create Zustand stores for state management

### Tree 2: UI Components
1. Root layout with dark theme, terminal aesthetic
2. SearchBar with instrument search + results dropdown
3. Watchlist component with real-time price updates
4. InstrumentDetail panel with bid/ask, volume, chart
5. OrderPanel with buy/sell buttons, size input, order type
6. OrderBlotter showing live order status
7. PortfolioView with positions and P&L

### Tree 3: Integration + Polish
1. Wire WebSocket to Zustand stores (live price updates)
2. Wire order submission flow end-to-end
3. Persistent watchlist (save/load from JSON)
4. Keyboard shortcuts (search focus, quick buy/sell)
5. Error handling, loading states, connection status indicator

---

## IBKR Account Requirements
- IBKR Pro account (not Lite)
- Funded account
- Market data subscriptions for desired exchanges
- Client Portal Gateway downloaded and running locally

---

## Security Notes
- Gateway runs on localhost only — no external exposure
- API keys/tokens never leave the machine
- No cloud deployment — runs on Tehbyn's local network
- Position sizing has configurable max limits (anti-fat-finger)

---

## Success Criteria
- [ ] Can search any instrument across IBKR's 150+ markets
- [ ] Real-time prices streaming on watchlist
- [ ] Can place a market order in ≤ 2 clicks from watchlist
- [ ] Can place a limit order with custom price in ≤ 3 clicks
- [ ] Portfolio shows all positions with live P&L
- [ ] Order blotter shows pending/filled with live updates
- [ ] Works locally without internet dependency (beyond IBKR connection)
- [ ] Dark, clean, fast — loads in < 1 second
