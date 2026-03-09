# IBKR Gateway — Connection, Auth & Session Management

## How the CP Gateway Works

The Client Portal (CP) Gateway is a Java process that runs locally and proxies all IBKR API traffic. Pulse Terminal's Next.js API routes call the gateway over HTTPS on localhost; the gateway handles the actual connection to IBKR's backend servers.

```
Browser → Next.js (port 5001) → API Routes → ibkrFetch() → CP Gateway (port 5050) → api.ibkr.com
```

### Connection Details

| Setting | Value |
|---------|-------|
| **Base URL** | `https://localhost:5050/v1/api/` |
| **WebSocket** | `wss://localhost:5050/v1/api/ws` |
| **SSL** | Self-signed cert — `rejectUnauthorized: false` **required** |
| **Account** | Paper trading account |
| **Session timeout** | ~5-6 minutes without keepalive |
| **Session reset** | Midnight regional time (Brisbane = midnight AEST) |
| **Brokerage session** | Only ONE per username across all IBKR platforms |

### SSL Handling in Node.js

The gateway uses a self-signed SSL certificate. Node.js will reject it by default. The existing client uses:

```typescript
// src/lib/ibkr/client.ts — how we handle self-signed cert
const res = await fetch(url, {
  ...options,
  headers: {
    'Content-Type': 'application/json',
    ...options.headers,
  },
  // @ts-expect-error -- Node fetch supports this
  rejectUnauthorized: false,
});
```

For WebSocket (client-side, browser handles this). For server-side WebSocket (if needed):
```typescript
import WebSocket from 'ws';
const ws = new WebSocket('wss://localhost:5050/v1/api/ws', {
  rejectUnauthorized: false,
});
```

## Authentication Flow

```
1. Start CP Gateway:  cd ~/ibkr-gateway && bin/run.sh root/conf.yaml
2. Open browser:      https://localhost:5050
3. Accept self-signed cert warning
4. Enter IBKR username + password
5. Complete 2FA (IBKR Mobile app)
6. "Client login succeeds" → session established
7. All API calls now work via HTTPS/WSS to localhost:5050
8. Keepalive via /tickle every 55s
9. Session expires at midnight AEST or after ~5 min idle
10. Re-auth daily (manual — cannot be automated per IBKR policy)
```

### Session Tiers
- **Read-Only Session:** Grants access to `/portfolio/*`, `/trsrv/*` endpoints
- **Brokerage Session:** Grants access to `/iserver/*` endpoints (trading, market data, orders). Auto-initialized by CP Gateway on login.
- **Constraint:** Only ONE brokerage session per username. If TWS desktop is open, CP API can't trade.

## Key Endpoints

### Check Auth Status
```
GET /iserver/auth/status
→ { authenticated: true, competing: false, connected: true }
```

Call on app startup to verify the gateway session is live.

> **Note:** IBKR now also returns an `established` flag (in addition to `authenticated`). `established: true` means the session is authenticated AND fully initialized with account info loaded. More reliable than `authenticated` alone for confirming the session is truly ready for trading.

```typescript
export async function checkAuthStatus(): Promise<AuthStatus> {
  return ibkrFetch<AuthStatus>('/iserver/auth/status');
}
```

### Session Keepalive (Tickle)
```
GET /tickle
→ { session: "...", ssoExpires: ..., iserver: { authStatus: { authenticated, competing, connected } } }
```

**Must call every 55 seconds** or the session times out after ~5 minutes.

```typescript
// Call every 55s via setInterval
export async function tickle() {
  const res = await ibkrFetch('/tickle');
  if (!res.iserver.authStatus.authenticated) {
    // Session expired — notify user to re-auth
  }
  if (res.iserver.authStatus.competing) {
    // Another platform (TWS) logged in — warn user
  }
  return res;
}

// In app initialization:
setInterval(tickle, 55_000);
```

### Initialize/Reinitialize Brokerage Session
```
POST /iserver/auth/ssodh/init
Body: { "publish": true, "compete": true }
→ { authenticated: true, competing: false, connected: true }
```

Use when the session times out but the read-only session is still valid. `compete: true` takes over from other platforms.

### Get Brokerage Accounts
```
GET /iserver/accounts
→ { accounts: ["U1234567"], selectedAccount: "U1234567", isPaper: true, acctProps: {...}, allowFeatures: {...} }
```

**MUST call before placing/querying orders** or you'll get errors. Call once on app init, cache the result.

```typescript
export async function getAccounts() {
  const data = await ibkrFetch<{
    accounts: string[];
    selectedAccount: string;
    isPaper: boolean;
  }>('/iserver/accounts');
  // Store accountId and isPaper in Zustand portfolio store
  return data;
}
```

### Validate SSO (use sparingly)
```
GET /sso/validate
→ { RESULT: true, USER_NAME: "...", expire: 86400 }
```
**Rate limit: 1 req/min.** Use `/tickle` for regular session checks instead.

### Logout
```
POST /logout
→ { confirmed: true }
```

### Paper vs Live Account Detection

The `getAccounts()` response includes `isPaper: boolean`. Use this to:
- Display a paper trading badge in the UI
- Prevent accidental live trades during development
- The portfolio store already has `isPaper` state

```typescript
const { isPaper } = await getAccounts();
usePortfolioStore.getState().setIsPaper(isPaper);
```

## Rate Limits

### Global
- **10 requests per second** across ALL endpoints per session
- Exceeding → HTTP 429 → IP banned for **10-15 minutes**
- Repeat violations → **permanent block**

### Per-Endpoint Limits

| Endpoint | Limit |
|----------|-------|
| `/iserver/marketdata/snapshot` | 10 req/s |
| `/iserver/marketdata/history` | 5 concurrent |
| `/iserver/account/orders` | 1 req/5s |
| `/iserver/account/trades` | 1 req/5s |
| `/iserver/account/pnl/partitioned` | 1 req/5s |
| `/iserver/scanner/params` | 1 req/15 min |
| `/iserver/scanner/run` | 1 req/s |
| `/portfolio/accounts` | 1 req/5s |
| `/portfolio/subaccounts` | 1 req/5s |
| `/pa/performance` | 1 req/15 min |
| `/pa/summary` | 1 req/15 min |
| `/sso/validate` | 1 req/min |
| `/tickle` | 1 req/s |
| `/trsrv/secdef` | 200 conids/request |
| `/fyi/*` | 1 req/s |

### Rate Limit Strategy for Pulse Terminal
- Use WebSocket for real-time data (no polling overhead)
- Cache `/portfolio/accounts` response (rarely changes)
- Batch conids in snapshot requests (up to ~10 per call)
- Implement request queue with 100ms minimum spacing
- Use `/tickle` as keepalive at 55-second intervals

## Order Reply Message Handling

When placing orders, IBKR often returns "order reply messages" — precautionary prompts (fat-finger checks, price deviation warnings, etc.) — instead of direct order acknowledgment. You must confirm these before the order goes live.

```typescript
async function confirmOrderReply(replyId: string): Promise<OrderResult> {
  const res = await ibkrFetch<OrderResult | Array<{ id: string }>>(
    `/iserver/reply/${replyId}`,
    { method: 'POST', body: JSON.stringify({ confirmed: true }) }
  );

  // Cascading reply messages — another confirmation may follow
  if (Array.isArray(res) && res[0]?.id) {
    return confirmOrderReply(res[0].id);
  }

  return res as OrderResult;
}
```

### Suppress Common Messages at Session Start

Call this on session initialization for one-click trading:

```typescript
POST /iserver/questions/suppress
Body: { "messageIds": ["o163", "o354", "o355"] }

// o163 = Price exceeds percentage constraint
// o354 = Order size exceeds constraint
// o355 = Penny stock warning
// Add more messageIds as you encounter them during testing
```

Suppressions last for the current brokerage session only (reset on re-auth).

Reset all: `POST /iserver/questions/suppress/reset`

## Session Initialization Sequence

On app startup, execute in order:

```typescript
async function initializeSession() {
  // 1. Check if gateway is alive and authenticated
  const auth = await checkAuthStatus();
  if (!auth.authenticated) {
    // Show "please login to gateway" UI
    return;
  }

  // 2. Get accounts (REQUIRED before orders)
  const accounts = await getAccounts();
  portfolioStore.setAccountId(accounts.selectedAccount);
  portfolioStore.setIsPaper(accounts.isPaper);

  // 3. Suppress order reply messages for one-click trading
  await ibkrFetch('/iserver/questions/suppress', {
    method: 'POST',
    body: JSON.stringify({ messageIds: ['o163', 'o354', 'o355'] }),
  });

  // 4. Start keepalive timer
  setInterval(tickle, 55_000);

  // 5. Connect WebSocket for real-time data
  const ws = getWebSocket();
  ws.connect();

  // 6. Load initial data
  await Promise.all([
    loadPositions(),
    loadAccountSummary(),
    loadWatchlistPrices(),
  ]);
}
```
