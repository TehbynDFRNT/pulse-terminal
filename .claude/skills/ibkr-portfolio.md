# IBKR Portfolio & Account

## Overview

Portfolio data comes from two endpoint families:
- **`/portfolio/*`** — Read-only endpoints (positions, summary, ledger). Don't require brokerage session.
- **`/iserver/*`** — Brokerage endpoints (P&L partitioned). Require authenticated brokerage session.
- **WebSocket `spl+{}`** — Real-time P&L streaming.

## Get Portfolio Accounts

```
GET /portfolio/accounts
→ [{ id: "U1234567", accountId: "U1234567", currency: "USD", type: "INDIVIDUAL" }]
```

**Rate limit: 1 req/5s.** Must call before other `/portfolio/*` endpoints.

Note: This is different from `/iserver/accounts` (which is for trading). Both need to be called — `/iserver/accounts` for trading setup, `/portfolio/accounts` for portfolio data access.

## Get Positions

```
GET /portfolio/{accountId}/positions/{pageId}
```

**Paginated:** 30 positions per page. Page is 0-indexed. Iterate until empty response.

### Response
```json
[
  {
    "acctId": "U1234567",
    "conid": 265598,
    "contractDesc": "AAPL",
    "position": 100.0,
    "mktPrice": 168.42,
    "mktValue": 16842.0,
    "currency": "USD",
    "avgCost": 165.00,
    "avgPrice": 165.00,
    "realizedPnl": 0.0,
    "unrealizedPnl": 342.0,
    "assetClass": "STK",
    "pageSize": 30
  }
]
```

### Existing Implementation

```typescript
// src/lib/ibkr/client.ts
export async function getPositions(): Promise<Position[]> {
  const accountId = getConfig().accountId;
  const allPositions: Position[] = [];
  let page = 0;

  while (true) {
    const raw = await ibkrFetch<Array<Record<string, unknown>>>(
      `/portfolio/${accountId}/positions/${page}`
    );
    if (!raw || raw.length === 0) break;

    allPositions.push(
      ...raw.map((p) => ({
        conid: p.conid as number,
        symbol: p.contractDesc as string,
        position: p.position as number,
        marketPrice: p.mktPrice as number,
        marketValue: p.mktValue as number,
        avgCost: p.avgCost as number,
        unrealizedPnl: p.unrealizedPnl as number,
        realizedPnl: p.realizedPnl as number,
        currency: p.currency as string,
        assetClass: p.assetClass as string,
      }))
    );
    page++;
  }

  return allPositions;
}
```

API route: `GET /api/ibkr/portfolio?type=positions`

### Position Type

```typescript
// src/lib/ibkr/types.ts
interface Position {
  conid: number;
  symbol: string;
  position: number;       // Quantity held
  marketPrice: number;    // Current market price
  marketValue: number;    // position × marketPrice
  avgCost: number;        // Average entry price
  unrealizedPnl: number;  // Current unrealized P&L
  realizedPnl: number;    // Realized P&L (from partial closes)
  currency: string;       // USD, AUD, etc.
  assetClass: string;     // STK, FUT, OPT, CASH, etc.
}
```

### Pagination Pattern

```typescript
// The pagination loop is already in client.ts
// For large portfolios (30+ positions), it automatically fetches all pages
// Each page returns up to 30 positions
// Empty response signals end of data
```

## Account Summary

```
GET /portfolio/{accountId}/summary
```

Comprehensive account summary with equity, margin, buying power, etc. Read-only — no brokerage session needed.

### Response (selected fields)
```json
{
  "accountcode": { "amount": 0, "value": "U1234567" },
  "netliquidation": { "amount": 215335840.0, "currency": "USD" },
  "availablefunds": { "amount": 210000000.0, "currency": "USD" },
  "buyingpower": { "amount": 840000000.0, "currency": "USD" },
  "grosspositionvalue": { "amount": 5335840.0, "currency": "USD" },
  "totalcashvalue": { "amount": 210000000.0, "currency": "USD" },
  "initmarginreq": { "amount": 2667920.0, "currency": "USD" },
  "maintmarginreq": { "amount": 2667920.0, "currency": "USD" },
  "cushion": { "amount": 0.988, "currency": null },
  "unrealizedpnl": { "amount": 39695.82, "currency": "USD" },
  "realizedpnl": { "amount": 0.0, "currency": "USD" }
}
```

### Existing Implementation

```typescript
export async function getAccountSummary(): Promise<AccountSummary> {
  const accountId = getConfig().accountId;
  const raw = await ibkrFetch<Record<string, { amount: number; value?: string }>>(
    `/portfolio/${accountId}/summary`
  );
  return {
    accountId: raw.accountcode?.value || accountId,
    netLiquidity: raw.netliquidation?.amount || 0,
    availableFunds: raw.availablefunds?.amount || 0,
    buyingPower: raw.buyingpower?.amount || 0,
    totalCash: raw.totalcashvalue?.amount || 0,
    grossPosition: raw.grosspositionvalue?.amount || 0,
    initMargin: raw.initmarginreq?.amount || 0,
    maintMargin: raw.maintmarginreq?.amount || 0,
    cushion: raw.cushion?.amount || 0,       // Margin buffer (0.988 = 98.8%)
    unrealizedPnL: raw.unrealizedpnl?.amount || 0,
    realizedPnL: raw.realizedpnl?.amount || 0,
  };
}
```

API route: `GET /api/ibkr/portfolio?type=summary`

### Key Fields for UI

| Field | Use |
|-------|-----|
| `netLiquidity` | Portfolio header — total account value |
| `availableFunds` | Available to trade |
| `buyingPower` | Maximum purchasable (with margin) |
| `totalCash` | Cash balance |
| `unrealizedPnL` | Open position P&L |
| `cushion` | Margin safety buffer (0.0 - 1.0) |

## Account P&L (Partitioned)

```
GET /iserver/account/pnl/partitioned
```

**Rate limit: 1 req/5s.** Requires brokerage session. Better to use WebSocket for real-time P&L.

### Response
```json
{
  "upnl": {
    "U1234567.Core": {
      "rowType": 1,
      "dpl": 15.70,       // Daily P&L
      "nl": 100000.00,    // Net Liquidation
      "upl": 607.00,      // Unrealized P&L
      "el": 95000.00,     // Excess Liquidity
      "mv": 50000.00      // Market Value
    }
  }
}
```

### Existing Implementation

```typescript
export async function getPortfolioPnL(): Promise<PortfolioPnL> {
  const data = await ibkrFetch<{ upnl: Record<string, { dpl: number; nl: number; upl: number; el: number; mv: number }> }>(
    '/iserver/account/pnl/partitioned'
  );
  const key = Object.keys(data.upnl)[0]; // "U1234567.Core"
  const pnl = data.upnl[key];
  return {
    dailyPnL: pnl.dpl,
    netLiquidity: pnl.nl,
    unrealizedPnL: pnl.upl,
    excessLiquidity: pnl.el,
    marketValue: pnl.mv,
  };
}
```

API route: `GET /api/ibkr/portfolio?type=pnl`

## WebSocket P&L Streaming

Subscribe: `spl+{}`

Real-time P&L updates streamed to the client. This is the preferred method for displaying live portfolio P&L rather than polling the HTTP endpoint.

### Message Format
```json
{
  "topic": "spl",
  "args": {
    "U1234567.Core": {
      "rowType": 1,
      "dpl": 15.70,       // Daily P&L
      "nl": 100000.00,    // Net Liquidation
      "upl": 607.00,      // Unrealized P&L
      "uel": 95000.00,    // Excess Liquidity (⚠️ was "el", changed to "uel" in 2025)
      "mv": 50000.00      // Market Value
    }
  }
}

> **⚠️ BREAKING CHANGE:** The `spl+{}` WebSocket topic changed the Excess Liquidity field from `el` to `uel` in mid-2025. The existing `websocket.ts` handler may still reference `pnl.el` — update to `pnl.uel`. See `.claude/API-VERIFICATION.md` Correction #2.
```

### Existing Handler

The `IBKRWebSocket` class subscribes to `spl+{}` automatically on connect:

```typescript
// In websocket.ts — NOTE: needs update for el → uel change
private handlePnLUpdate(msg: WSMessage) {
  const args = msg.args as Record<string, { dpl: number; nl: number; upl: number; uel: number; el?: number; mv: number }>;
  const key = Object.keys(args)[0];
  const pnl = args[key];
  this.onPnLUpdate?.({
    dailyPnL: pnl.dpl,
    netLiquidity: pnl.nl,
    unrealizedPnL: pnl.upl,
    excessLiquidity: pnl.uel ?? pnl.el ?? 0, // uel is the new field, el is legacy fallback
    marketValue: pnl.mv,
  });
}
```

Wire to the portfolio store:
```typescript
ws.setPnLHandler((pnl) => {
  usePortfolioStore.getState().setPnL(pnl);
});
```

## Account Ledger (Multi-Currency Balances)

```
GET /portfolio/{accountId}/ledger
```

Shows cash balances broken down by currency. Important if trading on non-USD exchanges (ASX → AUD, LSE → GBP, TSX → CAD).

### Response
```json
{
  "USD": {
    "cashbalance": 214716688.0,
    "netliquidationvalue": 215335840.0,
    "unrealizedpnl": 39695.82,
    "realizedpnl": 0.0,
    "stockmarketvalue": 314123.88,
    "currency": "USD",
    "settledcash": 214716688.0
  },
  "AUD": {
    "cashbalance": 5000.0,
    "netliquidationvalue": 5000.0,
    "unrealizedpnl": 0.0,
    "realizedpnl": 0.0,
    "stockmarketvalue": 0.0,
    "currency": "AUD",
    "settledcash": 5000.0
  },
  "BASE": {
    "cashbalance": 218000.0,
    "netliquidationvalue": 219000.0,
    "currency": "USD"
  }
}
```

- `"BASE"` entry = all currencies converted to base currency (USD)
- Useful for showing multi-currency exposure in the portfolio view

```typescript
const getLedger = async () => {
  const accountId = getConfig().accountId;
  return ibkrFetch<Record<string, {
    cashbalance: number;
    netliquidationvalue: number;
    unrealizedpnl: number;
    realizedpnl: number;
    stockmarketvalue: number;
    currency: string;
    settledcash: number;
  }>>(`/portfolio/${accountId}/ledger`);
};
```

## Zustand Portfolio Store

The portfolio store at `src/lib/store/portfolio.ts` holds all portfolio state:

```typescript
interface PortfolioState {
  positions: Position[];
  summary: AccountSummary | null;
  pnl: PortfolioPnL | null;
  accountId: string;
  isConnected: boolean;
  isPaper: boolean;          // true for paper trading account

  setPositions: (positions: Position[]) => void;
  setSummary: (summary: AccountSummary) => void;
  setPnL: (pnl: PortfolioPnL) => void;
  setAccountId: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setIsPaper: (paper: boolean) => void;
  updatePnL: (update: Partial<PortfolioPnL>) => void;
}
```

## Full Portfolio API Route

The combined endpoint at `GET /api/ibkr/portfolio` supports different query types:

```
GET /api/ibkr/portfolio?type=positions    → Position[]
GET /api/ibkr/portfolio?type=summary      → AccountSummary
GET /api/ibkr/portfolio?type=pnl          → PortfolioPnL
GET /api/ibkr/portfolio?type=all          → { positions, summary, pnl }
GET /api/ibkr/portfolio                   → { positions, summary, pnl } (default: all)
```

## Additional WebSocket Topics (Newer)

These are newer WebSocket topics not yet implemented in the codebase but available:

| Topic | Format | Description |
|-------|--------|-------------|
| **Account Summary** | `sad+{}` / `uad+{}` | Stream account summary updates (replaces polling `/portfolio/{id}/summary`) |
| **Account Ledger** | `sld+{}` / `uld+{}` | Stream cash balances by currency |
| **Trades (Executions)** | `str+{}` / `utr+{}` | Stream trade execution data |

Consider using `sad+{}` to replace periodic HTTP polling of the account summary endpoint.

## Alerts (Server-Side)

IBKR supports server-side price/volume/time alerts that persist across sessions:

```
POST /iserver/account/{accountId}/alert
```

```typescript
const createPriceAlert = async (params: {
  conid: number;
  exchange: string;
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
}) => {
  const accountId = getConfig().accountId;
  return ibkrFetch(`/iserver/account/${accountId}/alert`, {
    method: 'POST',
    body: JSON.stringify({
      alertName: params.name,
      alertMessage: `${params.name} triggered`,
      alertRepeatable: 0,
      outsideRth: 1,
      tif: 'GTC',
      conditions: [{
        conidex: `${params.conid}@${params.exchange}`,
        logicBind: 'n',
        operator: params.direction === 'below' ? '<=' : '>=',
        triggerMethod: '0',
        type: 1, // 1=Price, 3=Time, 4=Margin, 6=Volume
        value: String(params.targetPrice),
      }],
    }),
  });
};
```

Other alert endpoints:
- `GET /iserver/account/{accountId}/alerts` — list all alerts
- `GET /iserver/account/alert/{alertId}?type=Q` — alert details
- `POST /iserver/account/{accountId}/alert/activate` — activate/deactivate
- `DELETE /iserver/account/{accountId}/alert/{alertId}` — delete (0 = delete all)
