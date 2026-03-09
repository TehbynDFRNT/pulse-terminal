# IBKR Market Data — Snapshots, History & WebSocket Streaming

## Overview

Market data flows through two channels:
1. **HTTP Snapshots/History** — via Next.js API routes → `ibkrFetch()` → gateway (port 5050)
2. **WebSocket Streaming** — client-side browser WebSocket → gateway WSS (port 5050)

The existing code handles both paths. HTTP is used for initial data loads and historical bars. WebSocket is used for real-time price streaming on the watchlist.

## Market Data Snapshot (Top-of-Book)

```
GET /iserver/marketdata/snapshot?conids={ids}&fields={tags}
```

### Parameters
- `conids` — comma-separated conid list (e.g., `265598,8314,756733`)
- `fields` — comma-separated field tag numbers (see Field Tags Reference below)

### Response
```json
[
  {
    "conid": 265598,
    "31": "168.42",      // Last price
    "55": "AAPL",        // Symbol
    "84": "168.41",      // Bid
    "86": "168.42",      // Ask
    "82": "C1.42",       // Change (C=up, H=down)
    "83": "+0.84%",      // Change %
    "_updated": 1712596911593
  }
]
```

### ⚠️ CRITICAL: First Request Returns Empty

The first request for a new conid **returns NO data** — it only initializes the server-side stream. You must make a second request to get actual data.

```typescript
// Pattern used in client.ts:
const initAndGetSnapshot = async (conids: number[]) => {
  // Pre-flight: initializes streams (returns empty/partial)
  await getMarketDataSnapshot(conids);
  // Wait for streams to populate
  await new Promise(r => setTimeout(r, 1000));
  // Actual data request
  return getMarketDataSnapshot(conids);
};
```

### Existing Implementation

The snapshot is already wired up in `src/lib/ibkr/client.ts`:

```typescript
export async function getMarketDataSnapshot(
  conids: number[]
): Promise<MarketDataSnapshot[]> {
  const url = `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${WATCHLIST_FIELD_LIST}`;
  const raw = await ibkrFetch<Array<Record<string, string | number>>>(url);
  return raw.map((item) => ({
    conid: item.conid as number,
    last: parseFloat(String(item['31'] || '0')),
    // ... parses all fields
  }));
}
```

API route: `GET /api/ibkr/marketdata?conids=265598,8314`

### Rate Limit
- 10 req/s (generous — can poll for non-WS use cases)
- **Max 100 conids per query** (enforced since Dec 2025)
- **Max 50 fields** at any given time (enforced since Dec 2025)
- The default `WATCHLIST_FIELD_LIST` uses ~13 fields — well under the 50-field limit

### Unsubscribe
```
GET /iserver/marketdata/unsubscribeall     — Cancel all subscriptions
GET /iserver/marketdata/{conid}/unsubscribe — Cancel specific conid
```

## Historical Market Data

```
GET /iserver/marketdata/history?conid={id}&period={p}&bar={b}
```

### Parameters
| Param | Values | Description |
|-------|--------|-------------|
| `conid` | integer | Single conid (ONE per request) |
| `period` | `{X}min`, `{X}h`, `{X}d`, `{X}w`, `{X}m`, `{X}y` | Time range |
| `bar` | `{X}min`, `{X}h`, `{X}d`, `{X}w`, `{X}m` | Bar size |
| `outsideRth` | `true`/`false` | Include extended hours (default: false) |
| `barType` | `last`, `midpoint`, `bid`, `ask` | Price type (default: last) |
| `startTime` | `YYYYMMDD-HH:mm:ss` | Optional specific start |

### Valid Period/Bar Combinations

| Period | Valid Bar Sizes |
|--------|----------------|
| `1d` | `1min`, `2min`, `3min`, `5min`, `10min`, `15min`, `30min`, `1h` |
| `1w` | `5min`, `10min`, `15min`, `30min`, `1h`, `1d` |
| `1m` | `30min`, `1h`, `1d` |
| `3m` - `1y` | `1d`, `1w` |
| `2y` - `5y` | `1d`, `1w`, `1m` |

### Response
```json
{
  "symbol": "AAPL",
  "data": [
    { "o": 168.50, "c": 169.12, "h": 169.43, "l": 168.10, "v": 4923456, "t": 1704067200000 }
  ],
  "points": 78,
  "priceFactor": 100
}
```

### Existing Implementation

```typescript
export async function getHistoricalData(
  conid: number,
  period = '1d',
  bar = '5min',
  outsideRth = false
): Promise<HistoricalBar[]> {
  const params = new URLSearchParams({
    conid: String(conid), period, bar,
    outsideRth: String(outsideRth), barType: 'last',
  });
  const data = await ibkrFetch<{ data: Array<{ o: number; c: number; h: number; l: number; v: number; t: number }> }>(
    `/iserver/marketdata/history?${params}`
  );
  return data.data.map((b) => ({
    time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
  }));
}
```

API route: `GET /api/ibkr/marketdata?history=265598&period=1d&bar=5min`

### Rate Limit
- **5 concurrent requests** (not per-second)
- Only ONE conid per request
- `/hmds/history` is DEPRECATED — use `/iserver/marketdata/history`

## WebSocket Streaming

### Connection

The WebSocket manager is in `src/lib/ibkr/websocket.ts`. It's a client-side singleton.

```typescript
import { getWebSocket } from '@/lib/ibkr/websocket';

const ws = getWebSocket();
ws.setMarketDataHandler((conid, data) => {
  useWatchlistStore.getState().updatePrice(conid, data);
});
ws.connect();
```

### Subscribe to Market Data

Send message: `smd+{conid}+{"fields":["31","84","85","86","88","82","83","7282","7284","7293"]}`

```typescript
ws.subscribeMarketData(265598); // Subscribe to AAPL
```

### Response Messages

```json
{
  "topic": "smd+265598",
  "conid": 265598,
  "31": "168.42",
  "84": "168.41",
  "86": "168.42",
  "82": "C1.42",
  "_updated": 1712596911593
}
```

**Delta updates only** — after the initial full message, only changed fields are sent.

### Unsubscribe

Send message: `umd+{conid}+{}`

```typescript
ws.unsubscribeMarketData(265598); // Unsubscribe AAPL
```

### Heartbeat

The WebSocket needs its own keepalive, separate from HTTP `/tickle`:

```typescript
// Send 'tic' every 55 seconds (already handled by IBKRWebSocket class)
setInterval(() => ws.send('tic'), 55_000);
```

### Auto-Reconnect

The existing `IBKRWebSocket` class handles:
- Exponential backoff (1s → 2s → 4s → ... → 30s max)
- Max 10 reconnect attempts
- Auto-resubscribe to all tracked conids on reconnect
- Subscription state tracked in `this.subscriptions` Set

## Field Tags Reference

### Core Fields (used in watchlist/snapshot)

| Tag | Constant | Description | Example | Parse |
|-----|----------|-------------|---------|-------|
| `31` | `LAST_PRICE` | Last trade price | `"168.42"` | `parseFloat()` |
| `55` | `SYMBOL` | Trading symbol | `"AAPL"` | string |
| `58` | `COMPANY_NAME` | Company name | `"APPLE INC"` | string |
| `82` | `CHANGE` | Price change | `"C1.42"` / `"H0.50"` | Strip C/H prefix, parseFloat |
| `83` | `CHANGE_PCT` | Change percentage | `"+0.84%"` | string (pre-formatted) |
| `84` | `BID` | Best bid price | `"168.41"` | `parseFloat()` |
| `85` | `BID_SIZE` | Size at best bid | `"600"` | `parseInt()` |
| `86` | `ASK` | Best ask price | `"168.42"` | `parseFloat()` |
| `88` | `ASK_SIZE` | Size at best ask | `"1300"` | `parseInt()` |
| `7059` | `LAST_SIZE` | Last trade size | `"100"` | `parseInt()` |
| `7282` | `VOLUME` | Trading volume | `"49234567"` | `parseInt()` |
| `7284` | `DAY_LOW` | Intraday low | `"167.58"` | `parseFloat()` |
| `7293` | `DAY_HIGH` | Intraday high | `"169.12"` | `parseFloat()` |
| `7295` | `OPEN` | Opening price | `"167.80"` | `parseFloat()` |
| `7296` | `PREV_CLOSE` | Previous close | `"167.00"` | `parseFloat()` |

### Extended Fields (available but not in default WATCHLIST_FIELD_LIST)

| Tag | Description | Example |
|-----|-------------|---------|
| `7219` | Contract ID | `"265598"` |
| `7220` | Contract Description | `"AAPL NASDAQ"` |
| `7221` | Listing Exchange | `"NASDAQ"` |
| `7230` | Security Type | `"STK"` |
| `7308` | Market Cap | `"2.85T"` |
| `7310` | Implied Volatility | `"0.25"` |
| `7311` | Put/Call Interest | `"12345"` |
| `7674` | 52-Week High | `"199.62"` |
| `7675` | 52-Week Low | `"143.90"` |
| `7676` | Dividend Yield | `"0.52%"` |
| `7677` | Dividend Amount | `"0.96"` |
| `7681` | EPS | `"6.43"` |
| `7682` | P/E Ratio | `"26.20"` |

### Change Field Parsing

Field `82` (Change) includes a color prefix indicating direction:
- `C` = green/up (positive change)
- `H` = red/down (negative change)

```typescript
// Already implemented in client.ts and websocket.ts:
function parseChange(value: string): number {
  const cleaned = value.replace(/^[CH]/, '');
  return parseFloat(cleaned) || 0;
}

// For UI, determine direction:
const direction = raw.startsWith('C') ? 'up' : 'down';
```

### Existing Field Constants

Defined in `src/lib/ibkr/types.ts`:

```typescript
export const MARKET_DATA_FIELDS = {
  LAST_PRICE: '31',
  SYMBOL: '55',
  COMPANY_NAME: '58',
  BID: '84',
  BID_SIZE: '85',
  ASK: '86',
  ASK_SIZE: '88',
  LAST_SIZE: '7059',
  CHANGE: '82',
  CHANGE_PCT: '83',
  VOLUME: '7282',
  DAY_LOW: '7284',
  DAY_HIGH: '7293',
  OPEN: '7295',
  PREV_CLOSE: '7296',
} as const;

export const WATCHLIST_FIELD_LIST = Object.values(MARKET_DATA_FIELDS).join(',');
```

## Market Data Line Limits

- **Default: 100 lines** per account (each streaming conid = 1 line)
- Lines increase with commission spend
- Watchlist of 50 items + some overhead = fine
- Use `umd+` / unsubscribe endpoints to free lines when switching views
- Without paid market data subscriptions, data is 15-min delayed or absent via API

## Contract Search

Before getting market data, you need a `conid` (Contract ID). Search via:

```
GET /iserver/secdef/search?symbol=AAPL&secType=STK
```

Returns the primary conid for each match. The conid is the universal identifier for all IBKR operations.

```typescript
const results = await searchInstruments('AAPL');
// → [{ conid: 265598, symbol: 'AAPL', name: 'APPLE INC', exchange: 'NASDAQ', type: 'STK' }]
```

Bulk security definitions (up to 200 conids):
```
GET /trsrv/secdef?conids=265598,8314,756733
```

Contract info is cached by `conid-cache.ts` with 24-hour TTL.
