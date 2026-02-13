# Pulse Terminal — IBKR API Route Map
*Comprehensive pseudo-code blueprint for wiring up Interactive Brokers integration.*

**Last Updated:** 2026-02-13
**Status:** Research complete — ready to wire when API credentials arrive

---

## Table of Contents
1. [API Interface Comparison & Recommendation](#1-api-interface-comparison--recommendation)
2. [Connection Architecture](#2-connection-architecture)
3. [Authentication & Session Management](#3-authentication--session-management)
4. [Rate Limits & Pacing](#4-rate-limits--pacing)
5. [Route Map: Account & Auth](#5-route-map-account--auth)
6. [Route Map: Contract Search & Instrument Discovery](#6-route-map-contract-search--instrument-discovery)
7. [Route Map: Market Data](#7-route-map-market-data)
8. [Route Map: WebSocket Streaming](#8-route-map-websocket-streaming)
9. [Route Map: Order Management](#9-route-map-order-management)
10. [Route Map: Portfolio & Positions](#10-route-map-portfolio--positions)
11. [Route Map: Alerts & Notifications](#11-route-map-alerts--notifications)
12. [Route Map: Watchlist (Client-Side)](#12-route-map-watchlist-client-side)
13. [Snipe Orders (Pulse Terminal Feature)](#13-snipe-orders-pulse-terminal-feature)
14. [Order Types Reference](#14-order-types-reference)
15. [Market Data Fields Reference](#15-market-data-fields-reference)
16. [Markets & Exchanges](#16-markets--exchanges)
17. [Market Data Subscriptions & Costs](#17-market-data-subscriptions--costs)
18. [Known Pitfalls & Gotchas](#18-known-pitfalls--gotchas)
19. [npm Packages & Libraries](#19-npm-packages--libraries)

---

## 1. API Interface Comparison & Recommendation

### Three IBKR API Interfaces

| Interface | Protocol | Connection | Auth Method | Best For |
|-----------|----------|------------|-------------|----------|
| **Client Portal API (CP API)** | REST + WebSocket | Via localhost Java Gateway | Browser SSO + 2FA | Individual traders, web apps |
| **TWS API** | TCP Socket | Direct to TWS/IB Gateway app | TWS login (local) | Algorithmic trading, Python bots |
| **IBKR Web API (unified, beta)** | REST + WebSocket | Direct to `api.ibkr.com` | OAuth 2.0 (JWT) | Institutional, third-party apps |

### Detailed Comparison

#### Client Portal API (CP API v1) ✅ RECOMMENDED FOR PHASE 1
- **Protocol:** RESTful HTTP + WebSocket
- **Base URL:** `https://localhost:5000/v1/api/` (via CP Gateway)
- **Auth:** Browser SSO login to localhost:5000, then session cookie
- **Pros:**
  - Perfect for Next.js — standard HTTP requests from API routes
  - WebSocket for real-time data (same base URL)
  - Full trading, market data, portfolio, alerts
  - No TWS desktop app required (lighter weight)
  - Well-documented with Python/cURL examples
- **Cons:**
  - Requires Java gateway running locally
  - Manual re-auth daily (no automation allowed by IBKR)
  - Self-signed SSL cert (need `rejectUnauthorized: false` in Node)
  - Session times out after ~5 min without keepalive

#### TWS API (Native Socket API)
- **Protocol:** Binary TCP socket on localhost (port 7496/7497)
- **Auth:** Login to TWS or IB Gateway desktop app
- **Libraries:** `@stoqey/ib` (TypeScript), `ib_insync` (Python), official Java/C++
- **Pros:**
  - Most powerful — full access to every IB feature
  - Mature ecosystem (`ib_insync` is battle-tested)
  - Real-time streaming built into socket protocol
  - Better for complex algo strategies
- **Cons:**
  - Requires TWS or IB Gateway desktop app running
  - Socket-based — doesn't map cleanly to REST API routes
  - More complex connection/message handling
  - Heavier dependency footprint

#### IBKR Unified Web API (OAuth 2.0, beta)
- **Protocol:** REST + WebSocket
- **Base URL:** `https://api.ibkr.com/v1/api/`
- **Auth:** OAuth 2.0 with `private_key_jwt` (RFC 7521/7523)
- **Pros:**
  - No local gateway needed — direct HTTPS to IBKR
  - OAuth 2.0 = proper token-based auth
  - Same endpoints as CP API (merging into unified API)
  - Future-proof — IBKR is unifying here
- **Cons:**
  - OAuth 2.0 still in beta for individuals
  - Requires institutional/third-party onboarding for OAuth keys
  - Not yet available for individual retail accounts
  - Documentation still incomplete in places

### 🎯 Recommendation

**Phase 1: Client Portal API via CP Gateway** — This is the correct choice for Pulse Terminal. It's REST-based (maps perfectly to Next.js API routes), has WebSocket streaming, and is available to individual IBKR Pro accounts immediately. The only friction is the daily manual re-auth and running the Java gateway.

**Phase 2 (Future): IBKR Unified Web API with OAuth 2.0** — When IBKR opens OAuth 2.0 to individual accounts (or if you get a second username for API-only use), migrate to direct `api.ibkr.com` calls. The endpoints are identical — it's just the auth layer that changes.

**Not recommended: TWS API** — While more powerful, it requires running the full TWS desktop app and uses a socket protocol that doesn't align with our Next.js REST architecture. The CP API covers 100% of Pulse Terminal's needs.

---

## 2. Connection Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Pulse Terminal (Next.js on localhost:3000)              │
│                                                          │
│  Browser ←→ React UI ←→ Next.js API Routes              │
│                              │                           │
│                    fetch('/api/ibkr/...')                │
│                              │                           │
│                    ┌─────────▼──────────┐               │
│                    │  lib/ibkr/client.ts │               │
│                    │  (HTTP + WS wrapper)│               │
│                    └─────────┬──────────┘               │
│                              │                           │
│              HTTPS (self-signed, verify=false)           │
│              WSS (same cert handling)                    │
│                              │                           │
│                    ┌─────────▼──────────┐               │
│                    │  CP Gateway (Java)  │               │
│                    │  localhost:5000     │               │
│                    └─────────┬──────────┘               │
│                              │                           │
│                     Secure HTTPS to                      │
│                    api.ibkr.com backend                  │
└─────────────────────────────────────────────────────────┘
```

### Gateway Setup (macOS)
```bash
# Download CP Gateway from IBKR
# Unzip to ~/ibkr-gateway/

# Modify port (macOS uses 5000 for AirPlay):
# Edit ~/ibkr-gateway/root/conf.yaml → listenPort: 5001

# Run:
cd ~/ibkr-gateway
bin/run.sh root/conf.yaml

# Login: open https://localhost:5001 in browser
# Enter IBKR credentials + 2FA
# "Client login succeeds" = ready
```

### Base Configuration
```typescript
// .env.local
IBKR_GATEWAY_URL=https://localhost:5001
IBKR_BASE_PATH=/v1/api

// lib/ibkr/config.ts
export const IBKR_CONFIG = {
  baseUrl: `${process.env.IBKR_GATEWAY_URL}${process.env.IBKR_BASE_PATH}`,
  wsUrl: `wss://localhost:5001/v1/api/ws`,
  // Self-signed cert — must disable verification in Node
  fetchOptions: {
    // In Node.js, use a custom https agent:
    // agent: new https.Agent({ rejectUnauthorized: false })
  },
  keepaliveInterval: 55_000, // tickle every 55s (timeout is ~5 min)
};
```

---

## 3. Authentication & Session Management

### Auth Flow (CP Gateway — Individual Accounts)

```
1. Start CP Gateway (Java process, localhost:5001)
2. Open browser → https://localhost:5001
3. Accept self-signed cert warning
4. Enter IBKR username + password
5. Complete 2FA (IBKR Mobile / SMS / physical key)
6. "Client login succeeds" → session established
7. All API calls via HTTPS to localhost:5001/v1/api/*
8. WebSocket via wss://localhost:5001/v1/api/ws
9. Keep alive with /tickle every ~60s
10. Session expires at midnight (regional) or after ~5 min idle
11. Re-auth daily (manual, cannot be automated per IBKR policy)
```

### Session Tiers
- **Read-Only Session:** Grants access to `/portfolio/*`, `/trsrv/*` endpoints (account info, positions, contract search)
- **Brokerage Session:** Grants access to `/iserver/*` endpoints (trading, market data, orders). Initialized automatically by CP Gateway.
- **Key constraint:** Only ONE brokerage session per username across ALL IBKR platforms. If TWS is open, CP API can't trade (and vice versa). Create a second username for API-dedicated use.

### Important Limits
- **Session duration:** Up to 24 hours, resets at midnight regional time
- **Idle timeout:** ~5-6 minutes without any request
- **2FA required:** Always, for live accounts (no bypass)
- **Re-auth:** Once per day minimum (after midnight reset)

---

## 4. Rate Limits & Pacing

### Global Limit
- **10 requests per second** across all endpoints per authenticated session
- Exceeding → HTTP 429 "Too Many Requests"
- Violator IP → penalty box for **10-15 minutes**
- Repeat violations → **permanent block** until resolved

### Per-Endpoint Limits

| Endpoint | Method | Limit |
|----------|--------|-------|
| `/iserver/marketdata/snapshot` | GET | 10 req/s |
| `/iserver/marketdata/history` | GET | 5 concurrent requests |
| `/iserver/account/orders` (legacy) / `/iserver/orders` | GET | 1 req/5 secs |
| `/iserver/account/trades` / `/iserver/trades` | GET | 1 req/5 secs |
| `/iserver/account/pnl/partitioned` | GET | 1 req/5 secs |
| `/iserver/scanner/params` | GET | 1 req/15 mins |
| `/iserver/scanner/run` | POST | 1 req/sec |
| `/portfolio/accounts` | GET | 1 req/5 secs |
| `/portfolio/subaccounts` | GET | 1 req/5 secs |
| `/pa/performance` | POST | 1 req/15 mins |
| `/pa/summary` | POST | 1 req/15 mins |
| `/pa/transactions` | POST | 1 req/15 mins |
| `/sso/validate` | GET | 1 req/min |
| `/tickle` | GET | 1 req/sec |
| `/trsrv/secdef` | POST | 200 conids/request |
| `/fyi/*` | Various | 1 req/sec |

### Pulse Terminal Strategy
- Use WebSocket for real-time data (no polling overhead)
- Cache `/portfolio/accounts` response (rarely changes)
- Batch conids in snapshot requests (up to 10+ per call)
- Implement request queue with 100ms minimum spacing
- Use `/tickle` as keepalive at 55-second intervals

---

## 5. Route Map: Account & Auth

### 5.1 Session Keepalive (Tickle)

```
ROUTE: GET /tickle
PURPOSE: Keep brokerage session alive, prevent timeout
PARAMS: None
RETURNS: {
  "session": "abc123",     // Session token
  "ssoExpires": 1234567,   // SSO expiration (epoch ms)
  "collission": false,     // Another session competing
  "userId": 12345,
  "hmds": { "error": "" },
  "iserver": {
    "authStatus": {
      "authenticated": true,
      "competing": false,
      "connected": true
    }
  }
}
PSEUDO-CODE:
  // Called every 55 seconds by background interval
  const keepalive = async () => {
    const res = await ibkrFetch('/tickle');
    if (!res.iserver.authStatus.authenticated) {
      // Session expired — notify user to re-auth
      emit('session:expired');
    }
    if (res.iserver.authStatus.competing) {
      // Another platform logged in — warn user
      emit('session:competing');
    }
    return res;
  };
  setInterval(keepalive, 55_000);
NOTES:
  - Rate limit: 1 req/sec (but we only need every ~55s)
  - If session times out, call /iserver/auth/ssodh/init to reinitialize
  - Also returns session token for cookie-based auth (OAuth flow)
```

### 5.2 Auth Status

```
ROUTE: GET /iserver/auth/status
PURPOSE: Check if brokerage session is authenticated
PARAMS: None
RETURNS: {
  "authenticated": true,
  "competing": false,
  "connected": true,
  "message": "",
  "MAC": "AB:CD:EF:12:34:56",
  "serverInfo": { "serverName": "...", "serverVersion": "..." }
}
PSEUDO-CODE:
  const checkAuth = async () => {
    const status = await ibkrFetch('/iserver/auth/status');
    return {
      isReady: status.authenticated && status.connected,
      isCompeting: status.competing
    };
  };
NOTES:
  - Call on app startup to verify gateway session
  - If connected:true but authenticated:false → session timed out
  - Call /iserver/auth/ssodh/init to re-establish brokerage session
```

### 5.3 Initialize Brokerage Session

```
ROUTE: POST /iserver/auth/ssodh/init
PURPOSE: Initialize/reinitialize brokerage session after read-only login
PARAMS: Body: { "publish": true, "compete": true }
RETURNS: { "authenticated": true, "competing": false, "connected": true }
PSEUDO-CODE:
  const initBrokerageSession = async () => {
    const res = await ibkrFetch('/iserver/auth/ssodh/init', {
      method: 'POST',
      body: JSON.stringify({ publish: true, compete: true })
    });
    if (res.authenticated) {
      startKeepalive();
      startWebSocket();
    }
    return res;
  };
NOTES:
  - CP Gateway calls this automatically on login
  - Needed if session times out but read-only session still valid
  - "compete: true" takes over brokerage session from other platforms
```

### 5.4 Validate SSO Session

```
ROUTE: GET /sso/validate
PURPOSE: Validate current SSO session token
PARAMS: None
RETURNS: {
  "LOGIN_TYPE": 2,
  "USER_NAME": "username",
  "USER_ID": 12345678,
  "expire": 86400,
  "RESULT": true,
  "AUTH_TIME": 1702317649000
}
PSEUDO-CODE:
  const validateSession = async () => {
    const validation = await ibkrFetch('/sso/validate');
    return {
      valid: validation.RESULT,
      username: validation.USER_NAME,
      expiresIn: validation.expire
    };
  };
NOTES:
  - Rate limit: 1 req/min (very restrictive!)
  - Use sparingly — /tickle is better for regular checks
```

### 5.5 Get Brokerage Accounts

```
ROUTE: GET /iserver/accounts
PURPOSE: Get list of tradeable accounts, capabilities, and current selection
PARAMS: None
RETURNS: {
  "accounts": ["U1234567"],
  "acctProps": {
    "U1234567": {
      "hasChildAccounts": false,
      "supportsCashQty": true,
      "supportsFractions": true,
      "allowCustomerTime": false
    }
  },
  "aliases": { "U1234567": "U1234567" },
  "allowFeatures": {
    "showGFIS": true,
    "allowFXConv": true,
    "allowMTA": true,
    "allowCrypto": false,
    "allowedAssetTypes": "STK,CRYPTO"
  },
  "selectedAccount": "U1234567",
  "isFT": false,
  "isPaper": false
}
PSEUDO-CODE:
  // MUST call this before placing orders or querying orders
  const getAccounts = async () => {
    const data = await ibkrFetch('/iserver/accounts');
    const accountId = data.selectedAccount;
    store.setAccountId(accountId);
    store.setAccountProps(data.acctProps[accountId]);
    store.setIsPaper(data.isPaper);
    return data;
  };
NOTES:
  - MUST be called before modifying/querying orders
  - Call once on app init, cache result
  - Returns whether account is paper or live
  - selectedAccount is the active account for trading
```

### 5.6 Logout

```
ROUTE: POST /logout
PURPOSE: End the brokerage session
PARAMS: None
RETURNS: { "confirmed": true }
PSEUDO-CODE:
  const logout = async () => {
    stopKeepalive();
    closeWebSocket();
    await ibkrFetch('/logout', { method: 'POST' });
  };
NOTES:
  - Always logout cleanly to avoid session conflicts
  - After logout, must re-auth through browser
```

---

## 6. Route Map: Contract Search & Instrument Discovery

### 6.1 Search by Symbol/Name (iserver)

```
ROUTE: GET /iserver/secdef/search
PURPOSE: Search for instruments by symbol or name across all IBKR markets
PARAMS:
  Query: symbol=AAPL         (search term)
         name=false          (search by symbol vs name)
         secType=STK         (optional: STK, OPT, FUT, CASH, CFD, etc.)
RETURNS: [
  {
    "conid": 265598,
    "companyHeader": "APPLE INC - NASDAQ",
    "companyName": "APPLE INC",
    "description": "STK",
    "restricted": null,
    "fop": null,
    "opt": "AAPL",
    "war": null,
    "sections": [
      { "secType": "STK", "months": "", "symbol": "AAPL",
        "exchange": "NASDAQ;NYSE;...", "listingExchange": "NASDAQ" }
    ]
  }
]
PSEUDO-CODE:
  const searchInstruments = async (query: string, secType?: string) => {
    const params = new URLSearchParams({ symbol: query });
    if (secType) params.set('secType', secType);
    const results = await ibkrFetch(`/iserver/secdef/search?${params}`);
    return results.map(r => ({
      conid: r.conid,
      name: r.companyName,
      symbol: r.sections?.[0]?.symbol,
      exchange: r.sections?.[0]?.listingExchange,
      type: r.description,
      allExchanges: r.sections?.[0]?.exchange?.split(';')
    }));
  };
NOTES:
  - Returns the PRIMARY conid for the instrument
  - The conid is the universal identifier for all IBKR operations
  - Can search across ALL global markets (ASX, LSE, TSX, etc.)
  - "sections" array shows available security types for the match
  - For options/futures, sections contain month/expiry info
```

### 6.2 Get Contract Details by ConID

```
ROUTE: GET /iserver/contract/{conid}/info
PURPOSE: Get full contract details for a specific conid
PARAMS:
  Path: conid (integer)
RETURNS: {
  "cfi_code": "",
  "symbol": "AAPL",
  "cusip": null,
  "expiry_full": null,
  "con_id": 265598,
  "maturity_date": null,
  "industry": "Computers",
  "instrument_type": "STK",
  "trading_class": "NMS",
  "valid_exchanges": "SMART,AMEX,NYSE,...,ASX",
  "allow_sell_long": true,
  "is_zero_commission_security": false,
  "local_symbol": "AAPL",
  "currency": "USD",
  "company_name": "APPLE INC",
  "smart_available": true,
  "exchange": "NASDAQ",
  "category": "Computers",
  "contract_clarification_type": null,
  "r_t_h": true,
  "multiplier": "",
  "strike": "",
  "right": "",
  "und_con_id": 0
}
PSEUDO-CODE:
  const getContractInfo = async (conid: number) => {
    const info = await ibkrFetch(`/iserver/contract/${conid}/info`);
    return {
      conid: info.con_id,
      symbol: info.symbol,
      name: info.company_name,
      type: info.instrument_type,
      currency: info.currency,
      exchange: info.exchange,
      validExchanges: info.valid_exchanges?.split(','),
      hasSmartRouting: info.smart_available,
      multiplier: info.multiplier ? Number(info.multiplier) : 1,
      category: info.category,
      industry: info.industry
    };
  };
NOTES:
  - Use after search to get full contract metadata
  - Cache results — contract details don't change often
  - valid_exchanges shows ALL exchanges where this trades
  - smart_available: true means IBKR SmartRouting is available
```

### 6.3 Security Definitions by ConID (Bulk)

```
ROUTE: GET /trsrv/secdef?conids={conid1},{conid2},...
PURPOSE: Get security definitions for multiple conids at once
PARAMS:
  Query: conids (comma-separated list of conids, max 200)
RETURNS: {
  "secdef": [
    {
      "conid": 265598,
      "currency": "USD",
      "name": "APPLE INC",
      "assetClass": "STK",
      "ticker": "AAPL",
      "listingExchange": "NASDAQ",
      "countryCode": "US",
      "allExchanges": "AMEX,NYSE,CBOE,...",
      "sector": "Technology",
      "group": "Computers",
      "sectorGroup": "Computers",
      "expiry": null,
      "putOrCall": null,
      "strike": null
    }
  ]
}
PSEUDO-CODE:
  const getSecurityDefs = async (conids: number[]) => {
    // Max 200 conids per request
    const chunks = chunkArray(conids, 200);
    const results = [];
    for (const chunk of chunks) {
      const data = await ibkrFetch(`/trsrv/secdef?conids=${chunk.join(',')}`);
      results.push(...data.secdef);
    }
    return results;
  };
NOTES:
  - Max 200 conids per request
  - Does NOT require brokerage session (read-only endpoint)
  - Great for bulk-loading watchlist metadata
  - Includes sector/industry classification
```

### 6.4 Search Contract Trading Rules

```
ROUTE: GET /iserver/contract/{conid}/info-and-rules?isBuy=true
PURPOSE: Get trading rules for a contract (order types, exchanges, increments)
PARAMS:
  Path: conid (integer)
  Query: isBuy=true|false
RETURNS: {
  "rules": {
    "orderTypes": ["LMT", "MKT", "STP", "STP_LIMIT", "TRAIL", "TRAILLMT"],
    "orderTypesOutside": ["LMT", "MKT", "STP", "STP_LIMIT"],
    "tifTypes": ["DAY", "GTC", "IOC", "OPG"],
    "defaultSize": 100,
    "sizeIncrement": 1,
    "cashSize": 0,
    "cashCcy": "USD",
    "limitPrice": 0.01,    // Min price increment
    "preview": true,
    "displaySize": 100
  }
}
PSEUDO-CODE:
  const getTradingRules = async (conid: number, isBuy: boolean) => {
    const rules = await ibkrFetch(
      `/iserver/contract/${conid}/info-and-rules?isBuy=${isBuy}`
    );
    return {
      orderTypes: rules.rules.orderTypes,
      tifTypes: rules.rules.tifTypes,
      defaultSize: rules.rules.defaultSize,
      sizeIncrement: rules.rules.sizeIncrement,
      priceIncrement: rules.rules.limitPrice
    };
  };
NOTES:
  - Call before showing order panel to populate available order types
  - Different rules for buy vs sell
  - orderTypesOutside = order types available outside RTH
  - limitPrice = minimum price increment (tick size)
```

---

## 7. Route Map: Market Data

### 7.1 Market Data Snapshot (Top-of-Book)

```
ROUTE: GET /iserver/marketdata/snapshot?conids={ids}&fields={tags}
PURPOSE: Get current market data snapshot for one or more instruments
PARAMS:
  Query:
    conids: comma-separated conids (e.g., "265598,8314")
    fields: comma-separated field tags (e.g., "31,55,84,86,85,88,7059")
RETURNS: [
  {
    "conid": 265598,
    "conidEx": "265598",
    "31": "168.42",      // Last price
    "55": "AAPL",        // Symbol
    "58": "APPLE INC",   // Company name (text)
    "84": "168.41",      // Bid
    "85": "600",         // Bid size
    "86": "168.42",      // Ask
    "88": "1300",        // Ask size
    "7059": "100",       // Last size
    "82": "C168.42",     // Change (with color prefix C=green, H=red)
    "83": "0.84%",       // Change % (formatted)
    "7282": "49234567",  // Volume (7-day average)
    "7284": "167.58",    // Day low
    "7293": "169.12",    // Day high
    "7295": "167.80",    // Open
    "7296": "168.00",    // Close (prev)
    "_updated": 1712596911593,
    "server_id": "q1"
  }
]
PSEUDO-CODE:
  // Key fields for Pulse Terminal watchlist
  const WATCHLIST_FIELDS = [
    '31',   // Last price
    '55',   // Symbol
    '84',   // Bid
    '85',   // Bid size
    '86',   // Ask
    '88',   // Ask size
    '82',   // Change
    '83',   // Change %
    '7282', // Volume
    '7284', // Day low
    '7293', // Day high
    '7295', // Open
    '7296', // Close (prev)
  ].join(',');

  const getSnapshot = async (conids: number[]) => {
    const url = `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${WATCHLIST_FIELDS}`;
    const data = await ibkrFetch(url);
    return data.map(parseSnapshotFields);
  };

  // IMPORTANT: First request for a conid returns NO data
  // It just initializes the stream. Second request returns data.
  const initAndGetSnapshot = async (conids: number[]) => {
    // Pre-flight request (initializes streams)
    await getSnapshot(conids);
    // Wait briefly for streams to populate
    await sleep(1000);
    // Actual data request
    return getSnapshot(conids);
  };
NOTES:
  - CRITICAL: First request for a new conid returns EMPTY data
    It only initializes the server-side stream. Subsequent calls return data.
  - After pre-flight, fields persist — future requests don't need fields param
  - Fields with color prefix: "C" = green (up), "H" = red (down)
    e.g., "82": "C1.42" means change of +1.42
  - Some computed fields (greeks, etc.) may take seconds to populate
  - Rate limit: 10 req/s (generous — can poll for non-WS use cases)
  - Max ~100 conids per request (limited by market data lines)
```

### 7.2 Historical Market Data

```
ROUTE: GET /iserver/marketdata/history?conid={id}&period={p}&bar={b}
PURPOSE: Get historical OHLCV bars for charting
PARAMS:
  Query:
    conid: single conid (integer)
    period: time range — {X}min, {X}h, {X}d, {X}w, {X}m, {X}y
    bar: bar size — {X}min, {X}h, {X}d, {X}w, {X}m
    outsideRth: true|false (include extended hours, default false)
    barType: last|midpoint|bid|ask (default: last)
    startTime: YYYYMMDD-HH:mm:ss (optional, specific start)
RETURNS: {
  "serverId": "1234",
  "symbol": "AAPL",
  "text": "APPLE INC",
  "priceFactor": 100,
  "startTime": "20240101-00:00:00",
  "high": "/16943/16850/16930",
  "low": "/16800/16810/16790",
  "timePeriod": "1w",
  "barLength": 86400,
  "mdAvailability": "S",
  "mktDataDelay": 0,
  "outsideRth": false,
  "volumeFactor": 1,
  "priceFormat": "",
  "chartAnnotations": null,
  "data": [
    {
      "o": 168.50,   // Open
      "c": 169.12,   // Close
      "h": 169.43,   // High
      "l": 168.10,   // Low
      "v": 4923456,  // Volume
      "t": 1704067200000  // Timestamp (epoch ms)
    }
  ],
  "points": 5,
  "travelTime": 123
}
PSEUDO-CODE:
  const getHistory = async (
    conid: number,
    period: string = '1d',
    bar: string = '5min',
    outsideRth: boolean = false
  ) => {
    const params = new URLSearchParams({
      conid: String(conid),
      period,
      bar,
      outsideRth: String(outsideRth),
      barType: 'last'
    });
    const data = await ibkrFetch(`/iserver/marketdata/history?${params}`);
    return data.data.map(bar => ({
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));
  };

  // For sparklines in watchlist (24h mini chart):
  const getSparkline = async (conid: number) => {
    return getHistory(conid, '1d', '5min', true);
  };
NOTES:
  - Rate limit: 5 CONCURRENT requests (not per-second)
  - Only ONE conid per request (unlike snapshots)
  - /hmds/history endpoint is DEPRECATED — use /iserver/marketdata/history
  - Volume ("v") only returned for barType="last"
  - priceFactor: divide raw prices by this if > 1 (some instruments)
  - Great for sparklines — use period=1d, bar=5min for watchlist
```

### 7.3 Unsubscribe Market Data

```
ROUTE: GET /iserver/marketdata/unsubscribeall
PURPOSE: Cancel all market data subscriptions (HTTP side)
PARAMS: None
RETURNS: { "confirmed": true }
PSEUDO-CODE:
  const unsubscribeAll = async () => {
    await ibkrFetch('/iserver/marketdata/unsubscribeall');
  };
NOTES:
  - Use when cleaning up / switching watchlists
  - Frees up market data lines
  - Does NOT affect WebSocket subscriptions (those use umd+ message)
```

### 7.4 Unsubscribe Single

```
ROUTE: GET /iserver/marketdata/{conid}/unsubscribe
PURPOSE: Cancel market data for a specific contract
PARAMS: Path: conid
RETURNS: { "confirmed": true }
PSEUDO-CODE:
  const unsubscribe = async (conid: number) => {
    await ibkrFetch(`/iserver/marketdata/${conid}/unsubscribe`);
  };
```

---

## 8. Route Map: WebSocket Streaming

### 8.1 WebSocket Connection

```
ENDPOINT: wss://localhost:5001/v1/api/ws
PURPOSE: Real-time streaming for market data, orders, P&L, and notifications
PSEUDO-CODE:
  import WebSocket from 'ws';

  class IBKRWebSocket {
    private ws: WebSocket;
    private heartbeatInterval: NodeJS.Timer;

    connect() {
      this.ws = new WebSocket('wss://localhost:5001/v1/api/ws', {
        rejectUnauthorized: false  // Self-signed cert
      });

      this.ws.on('open', () => {
        console.log('WebSocket connected');
        // Start heartbeat (keep WS alive)
        this.heartbeatInterval = setInterval(() => {
          this.ws.send('tic');  // WebSocket keepalive
        }, 55_000);
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        // Route messages by topic
        if (msg.topic?.startsWith('smd+')) {
          this.handleMarketData(msg);
        } else if (msg.topic?.startsWith('sor')) {
          this.handleOrderUpdate(msg);
        } else if (msg.topic?.startsWith('spl')) {
          this.handlePnLUpdate(msg);
        } else if (msg.topic?.startsWith('sbd')) {
          this.handleBulletin(msg);
        } else if (msg.server_id === 'server') {
          this.handleServerMessage(msg);
        }
      });

      this.ws.on('close', () => {
        clearInterval(this.heartbeatInterval);
        // Reconnect logic
        setTimeout(() => this.connect(), 3000);
      });

      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    }
  }
NOTES:
  - Must have authenticated session BEFORE connecting WebSocket
  - WebSocket receives auth context from the CP Gateway session
  - Send 'tic' periodically to keep WS alive
  - First messages after connect will be auth/account status info
  - Messages are JSON strings
```

### 8.2 Subscribe to Market Data (WebSocket)

```
MESSAGE FORMAT: smd+{conid}+{"fields":["field1","field2",...]}
PURPOSE: Stream real-time price updates for an instrument
EXAMPLE: smd+265598+{"fields":["31","84","85","86","88","82","83"]}
RESPONSE: {
  "topic": "smd+265598",
  "conid": 265598,
  "conidEx": "265598",
  "31": "168.42",     // Last
  "84": "168.41",     // Bid
  "85": "600",        // Bid size
  "86": "168.42",     // Ask
  "88": "1300",       // Ask size
  "82": "C1.42",      // Change (C=green/up, H=red/down)
  "83": "+0.84%",     // Change %
  "_updated": 1712596911593,
  "server_id": "q1"
}
PSEUDO-CODE:
  // Subscribe to market data for watchlist items
  const subscribeMarketData = (conid: number) => {
    const fields = ['31','84','85','86','88','82','83','7282','7284','7293'];
    ws.send(`smd+${conid}+{"fields":${JSON.stringify(fields)}}`);
  };

  // Handle incoming market data
  const handleMarketData = (msg: any) => {
    const conid = msg.conid;
    store.updatePrice(conid, {
      last: parseFloat(msg['31']),
      bid: parseFloat(msg['84']),
      bidSize: parseInt(msg['85']),
      ask: parseFloat(msg['86']),
      askSize: parseInt(msg['88']),
      change: parseChange(msg['82']),    // Strip C/H prefix
      changePct: msg['83'],
      volume: parseInt(msg['7282'] || '0'),
      dayLow: parseFloat(msg['7284'] || '0'),
      dayHigh: parseFloat(msg['7293'] || '0'),
      updated: msg._updated
    });
  };
NOTES:
  - Each smd subscription uses 1 market data line
  - Individual accounts start with 100 lines
  - Fields use same tags as /iserver/marketdata/snapshot
  - Only changed fields are sent in updates (delta updates)
  - Topic format "smd+{conid}" identifies the stream
```

### 8.3 Unsubscribe Market Data (WebSocket)

```
MESSAGE FORMAT: umd+{conid}+{}
PURPOSE: Stop streaming market data for an instrument
EXAMPLE: umd+265598+{}
PSEUDO-CODE:
  const unsubscribeMarketData = (conid: number) => {
    ws.send(`umd+${conid}+{}`);
  };
```

### 8.4 Subscribe to Order Updates (WebSocket)

```
MESSAGE FORMAT: sor+{}
PURPOSE: Stream real-time order status updates (all orders for active account)
EXAMPLE: sor+{}
RESPONSE: {
  "topic": "sor",
  "args": [{
    "acct": "U1234567",
    "conidex": "265598",
    "conid": 265598,
    "orderId": 1234567890,
    "cashCcy": "USD",
    "sizeAndFills": "100/0",
    "orderDesc": "Buy 100 Limit @ 165.00, DAY",
    "description1": "AAPL",
    "ticker": "AAPL",
    "secType": "STK",
    "listingExchange": "NASDAQ.NMS",
    "remainingQuantity": 100.0,
    "filledQuantity": 0.0,
    "totalSize": 100.0,
    "companyName": "APPLE INC",
    "status": "Submitted",
    "origOrderType": "LIMIT",
    "orderType": "Limit",
    "side": "BUY",
    "timeInForce": "DAY",
    "price": "165.00",
    "bgColor": "#FFFFFF",
    "fgColor": "#000000"
  }]
}
PSEUDO-CODE:
  const subscribeOrders = () => {
    ws.send('sor+{}');
  };

  // Can also filter: sor+{"filters":"Submitted"}
  const subscribeOrdersFiltered = (status: string) => {
    ws.send(`sor+{"filters":"${status}"}`);
  };

  const handleOrderUpdate = (msg: any) => {
    if (msg.args) {
      msg.args.forEach(order => {
        store.updateOrder({
          orderId: order.orderId,
          symbol: order.ticker,
          side: order.side,
          quantity: order.totalSize,
          filled: order.filledQuantity,
          remaining: order.remainingQuantity,
          status: order.status,
          orderType: order.orderType,
          price: order.price,
          description: order.orderDesc
        });

        // Trigger Novacron notification on fill
        if (order.status === 'Filled') {
          emit('order:filled', order);
        }
      });
    }
  };
NOTES:
  - Send once after WS connect — streams ALL order updates
  - Includes new orders, modifications, cancellations, fills
  - "filters" arg accepts order status values
  - Real-time — no polling needed
  - Essential for the Order Blotter component
```

### 8.5 Subscribe to P&L Updates (WebSocket)

```
MESSAGE FORMAT: spl+{}
PURPOSE: Stream real-time profit & loss updates
EXAMPLE: spl+{}
RESPONSE: {
  "topic": "spl",
  "args": {
    "U1234567.Core": {
      "rowType": 1,
      "dpl": 15.7,       // Daily P&L
      "nl": 100000.0,    // Net Liquidation
      "upl": 607.0,      // Unrealized P&L
      "el": 95000.0,     // Excess Liquidity
      "mv": 50000.0      // Market Value
    }
  }
}
PSEUDO-CODE:
  const subscribePnL = () => {
    ws.send('spl+{}');
  };

  const handlePnLUpdate = (msg: any) => {
    const accountKey = Object.keys(msg.args)[0];
    const pnl = msg.args[accountKey];
    store.updatePortfolio({
      dailyPnL: pnl.dpl,
      netLiquidity: pnl.nl,
      unrealizedPnL: pnl.upl,
      excessLiquidity: pnl.el,
      marketValue: pnl.mv
    });
  };
NOTES:
  - Streams account-level P&L in real-time
  - Perfect for portfolio header display
  - accountKey format: "{accountId}.Core"
```

### 8.6 Subscribe to Bulletins (WebSocket)

```
MESSAGE FORMAT: sbd+{}
PURPOSE: Stream system bulletins and exchange messages
PSEUDO-CODE:
  const subscribeBulletins = () => {
    ws.send('sbd+{}');
  };
NOTES:
  - Exchange halt notices, system messages
  - Nice-to-have for awareness, not critical for MVP
```

---

## 9. Route Map: Order Management

### 9.1 Place Order

```
ROUTE: POST /iserver/account/{accountId}/orders
PURPOSE: Submit new order(s) to IBKR
PARAMS:
  Path: accountId (string, e.g., "U1234567")
  Body: {
    "orders": [
      {
        "conid": 265598,           // Contract ID
        "conidex": "265598@SMART", // Optional: conid@exchange
        "secType": "265598:STK",   // Optional: conid:secType
        "orderType": "LMT",        // MKT, LMT, STP, STP_LIMIT, TRAIL, TRAILLMT
        "side": "BUY",             // BUY or SELL
        "quantity": 100,           // Number of units
        "price": 165.00,           // Limit price (for LMT, STP_LIMIT)
        "auxPrice": 160.00,        // Stop price (for STP, STP_LIMIT)
        "tif": "DAY",              // DAY, GTC, IOC, OPG
        "outsideRTH": false,       // Allow outside regular trading hours
        "cOID": "pulse-001",       // Client order ID (your tracking ref)
        "listingExchange": "SMART" // Optional: specific exchange or SMART
      }
    ]
  }
RETURNS (success): {
  "order_id": "987654",
  "order_status": "Submitted",
  "encrypt_message": "1"
}
RETURNS (needs confirmation): [
  {
    "id": "07a13a5a-...",
    "message": ["Order price exceeds 3% constraint. Are you sure?"],
    "isSuppressed": false,
    "messageIds": ["o163"]
  }
]
PSEUDO-CODE:
  const placeOrder = async (params: {
    conid: number;
    side: 'BUY' | 'SELL';
    orderType: 'MKT' | 'LMT' | 'STP' | 'STP_LIMIT' | 'TRAIL' | 'TRAILLMT';
    quantity: number;
    price?: number;
    auxPrice?: number;
    tif?: string;
    outsideRTH?: boolean;
  }) => {
    const accountId = store.getAccountId();
    const orderBody = {
      orders: [{
        conid: params.conid,
        orderType: params.orderType,
        side: params.side,
        quantity: params.quantity,
        tif: params.tif || 'DAY',
        outsideRTH: params.outsideRTH || false,
        cOID: `pulse-${Date.now()}`,
        ...(params.price && { price: params.price }),
        ...(params.auxPrice && { auxPrice: params.auxPrice }),
      }]
    };

    const res = await ibkrFetch(`/iserver/account/${accountId}/orders`, {
      method: 'POST',
      body: JSON.stringify(orderBody)
    });

    // Check if response needs confirmation (order reply message)
    if (Array.isArray(res) && res[0]?.id) {
      // Auto-confirm or show to user
      return confirmOrder(res[0].id);
    }

    return res;  // { order_id, order_status }
  };
NOTES:
  - Body must be wrapped in "orders" array (even for single orders)
  - IBKR may return "order reply messages" instead of direct acceptance
    These are precautionary prompts (fat-finger checks, etc.)
    Must confirm with /iserver/reply/{id} before order goes live
  - Suppress common messages with /iserver/questions/suppress on session start
  - cOID = your custom order reference (for tracking/matching)
  - "SMART" routing = IBKR best-execution algorithm across exchanges
```

### 9.2 Confirm Order Reply

```
ROUTE: POST /iserver/reply/{replyId}
PURPOSE: Confirm an order reply message to proceed with order
PARAMS:
  Path: replyId (string UUID from order reply message)
  Body: { "confirmed": true }
RETURNS: {
  "order_id": "987654",
  "order_status": "Submitted",
  "encrypt_message": "1"
}
PSEUDO-CODE:
  const confirmOrder = async (replyId: string) => {
    const res = await ibkrFetch(`/iserver/reply/${replyId}`, {
      method: 'POST',
      body: JSON.stringify({ confirmed: true })
    });
    // May return ANOTHER reply message (cascade) — handle recursively
    if (Array.isArray(res) && res[0]?.id) {
      return confirmOrder(res[0].id);
    }
    return res;
  };
NOTES:
  - Order reply messages can cascade (one confirmation leads to another)
  - Always check if response is another reply vs final acknowledgment
  - For one-click trading: suppress common messages at session start
```

### 9.3 Suppress Order Reply Messages

```
ROUTE: POST /iserver/questions/suppress
PURPOSE: Suppress specific order precautionary messages for session
PARAMS:
  Body: { "messageIds": ["o163", "o354", "o355"] }
RETURNS: { "status": "submitted" }
PSEUDO-CODE:
  // Call at session start for zero-friction trading
  const suppressMessages = async () => {
    await ibkrFetch('/iserver/questions/suppress', {
      method: 'POST',
      body: JSON.stringify({
        messageIds: [
          'o163',   // Price exceeds percentage constraint
          'o354',   // Order size exceeds constraint
          'o355',   // Penny stock warning
          // Add more as encountered
        ]
      })
    });
  };
NOTES:
  - HIGHLY RECOMMENDED: Call on session init for one-click execution
  - Suppressed for current brokerage session only (resets on re-auth)
  - Reset all suppressions: POST /iserver/questions/suppress/reset
  - Collect messageIds as you encounter them during testing
```

### 9.4 Modify Order

```
ROUTE: POST /iserver/account/{accountId}/order/{orderId}
PURPOSE: Modify an existing unfilled order
PARAMS:
  Path: accountId, orderId
  Body: {
    "conid": 265598,
    "orderType": "LMT",
    "side": "BUY",
    "price": 170,          // Changed value
    "quantity": 100,
    "tif": "DAY"
  }
RETURNS: {
  "order_id": "987654",
  "order_status": "Submitted",
  "encrypt_message": "1"
}
PSEUDO-CODE:
  const modifyOrder = async (orderId: string, updates: Partial<OrderParams>) => {
    const accountId = store.getAccountId();
    // Must include ALL original order fields + modifications
    const existingOrder = store.getOrder(orderId);
    const body = { ...existingOrder, ...updates };

    const res = await ibkrFetch(
      `/iserver/account/${accountId}/order/${orderId}`,
      { method: 'POST', body: JSON.stringify(body) }
    );

    if (Array.isArray(res) && res[0]?.id) {
      return confirmOrder(res[0].id);
    }
    return res;
  };
NOTES:
  - Body is a SINGLE object (not wrapped in "orders" array like new orders!)
  - MUST include ALL original order parameters, changing only what's different
  - Can also receive order reply messages — handle same as new order
  - Use /iserver/account/order/status/{orderId} to get current order state
```

### 9.5 Cancel Order

```
ROUTE: DELETE /iserver/account/{accountId}/order/{orderId}
PURPOSE: Cancel an unfilled/partially filled order
PARAMS:
  Path: accountId, orderId
  Body: None
RETURNS: {
  "msg": "Request was submitted",
  "order_id": 987654,
  "conid": 265598,
  "account": "U1234567"
}
PSEUDO-CODE:
  const cancelOrder = async (orderId: string) => {
    const accountId = store.getAccountId();
    return ibkrFetch(`/iserver/account/${accountId}/order/${orderId}`, {
      method: 'DELETE'
    });
  };
NOTES:
  - Response confirms REQUEST was submitted, not that order is cancelled
  - Order may already be filled at exchange by the time cancel arrives
  - Monitor via WebSocket (sor) for actual cancellation confirmation
```

### 9.6 Get Live Orders

```
ROUTE: GET /iserver/account/orders
PURPOSE: Get all live/recent orders for the session
PARAMS:
  Query:
    filters: comma-separated status filters
      (Inactive, PendingSubmit, PreSubmitted, Submitted, Filled, Cancelled)
    force: true (force refresh)
    accountId: specific account filter
RETURNS: {
  "orders": [
    {
      "acct": "U1234567",
      "conid": 265598,
      "orderId": 1234567890,
      "orderDesc": "Buy 100 Limit @ 165.00, DAY",
      "description1": "AAPL",
      "ticker": "AAPL",
      "secType": "STK",
      "remainingQuantity": 100.0,
      "filledQuantity": 0.0,
      "totalSize": 100.0,
      "status": "Submitted",
      "orderType": "Limit",
      "side": "BUY",
      "timeInForce": "DAY",
      "price": "165.00",
      "avgPrice": "0.00",
      "lastExecutionTime": "",
      "companyName": "APPLE INC",
      "listingExchange": "NASDAQ.NMS"
    }
  ],
  "snapshot": true
}
PSEUDO-CODE:
  const getLiveOrders = async () => {
    const data = await ibkrFetch('/iserver/account/orders?force=true');
    return data.orders.map(o => ({
      orderId: o.orderId,
      conid: o.conid,
      symbol: o.ticker,
      name: o.companyName,
      side: o.side,
      quantity: o.totalSize,
      filled: o.filledQuantity,
      remaining: o.remainingQuantity,
      status: o.status,
      orderType: o.orderType,
      price: o.price,
      avgPrice: o.avgPrice,
      tif: o.timeInForce,
      description: o.orderDesc
    }));
  };
NOTES:
  - Rate limit: 1 req/5 secs
  - Use WebSocket (sor+{}) for real-time updates instead of polling
  - "force: true" bypasses cache for fresh data
  - Returns orders from CURRENT brokerage session only
  - /iserver/account/orders endpoint shows pending AND recent filled
```

### 9.7 Get Order Status

```
ROUTE: GET /iserver/account/order/status/{orderId}
PURPOSE: Get detailed status of a specific order
PARAMS:
  Path: orderId
RETURNS: {
  "sub_type": null,
  "request_id": "...",
  "server_id": "...",
  "order_id": 987654,
  "conidex": "265598",
  "conid": 265598,
  "symbol": "AAPL",
  "side": "B",
  "contract_description_1": "AAPL",
  "listing_exchange": "NASDAQ.NMS",
  "option_acct": "c",
  "company_name": "APPLE INC",
  "size": "100.0",
  "total_size": "100.0",
  "currency": "USD",
  "account": "U1234567",
  "order_type": "Limit",
  "limit_price": "165.0",
  "stop_price": "",
  "cum_fill": "0.0",
  "order_status": "Submitted",
  "order_ccp_status": "0",
  "order_status_description": "Order Submitted",
  "tif": "DAY",
  "fg_color": "#000000",
  "bg_color": "#FFFFFF",
  "order_not_editable": false,
  "editable_fields": "",
  "cannot_cancel_order": false,
  "outside_rth": false,
  "deactivate_order": false,
  "use_price_mgmt_algo": true,
  "sec_type": "STK",
  "available_chart_periods": "#R|1",
  "order_description": "Buy 100 Limit 165.00 DAY",
  "order_description_with_contract": "Buy 100 AAPL Limit 165.00 DAY",
  "avg_price": "0.0",
  "alert_active": 1,
  "child_order_type": "0",
  "size_and_fills": "100",
  "exit_strategy_display_price": "",
  "exit_strategy_chart_description": "",
  "exit_strategy_tool_availability": "1",
  "allowed_duplicate_opposite": true,
  "order_time": "241211-18:55:35"
}
NOTES:
  - More detailed than /orders listing
  - Useful for modify flow (need all current values)
  - "order_not_editable" and "cannot_cancel_order" flags are important
```

### 9.8 Get Trades/Executions

```
ROUTE: GET /iserver/account/trades
PURPOSE: Get list of trades/executions for the current day
PARAMS:
  Query:
    days: number of days back (optional, default current day)
    accountId: filter by account
RETURNS: [
  {
    "execution_id": "...",
    "symbol": "AAPL",
    "supports_tax_opt": "1",
    "side": "BUY",
    "order_description": "Bot 100 @ 165.00 on ISLAND",
    "trade_time": "20240101-14:30:00",
    "trade_time_r": 1704123000000,
    "size": 100.0,
    "price": "165.00",
    "order_ref": "pulse-001",
    "submitter": "username",
    "exchange": "ISLAND",
    "commission": "0.35",
    "net_amount": 16500.35,
    "account": "U1234567",
    "accountCode": "U1234567",
    "company_name": "APPLE INC",
    "contract_description_1": "AAPL",
    "sec_type": "STK",
    "listing_exchange": "NASDAQ.NMS",
    "conid": 265598,
    "conidEx": "265598",
    "clearing_id": "IB",
    "clearing_name": "IB"
  }
]
PSEUDO-CODE:
  const getTrades = async () => {
    const trades = await ibkrFetch('/iserver/account/trades');
    return trades.map(t => ({
      executionId: t.execution_id,
      symbol: t.symbol,
      side: t.side,
      size: t.size,
      price: parseFloat(t.price),
      commission: parseFloat(t.commission),
      exchange: t.exchange,
      time: t.trade_time_r,
      orderRef: t.order_ref,
      companyName: t.company_name
    }));
  };
NOTES:
  - Rate limit: 1 req/5 secs
  - Shows actual executions (fills), not pending orders
  - commission field is useful for P&L calculations
  - order_ref matches the cOID you set when placing
```

### 9.9 Preview Order (What-If)

```
ROUTE: POST /iserver/account/{accountId}/orders/whatif
PURPOSE: Preview order impact without submitting (margin, commission, etc.)
PARAMS:
  Path: accountId
  Body: { "orders": [{ same as place order }] }
RETURNS: {
  "amount": { "amount": "16500.00", "commission": "0.35", "total": "16500.35" },
  "equity": { "current": "100000.00", "change": "-16500.35", "after": "83499.65" },
  "initial": { "current": "50000.00", "change": "8250.00", "after": "58250.00" },
  "maintenance": { "current": "25000.00", "change": "4125.00", "after": "29125.00" },
  "warn": ""
}
PSEUDO-CODE:
  const previewOrder = async (orderParams: OrderParams) => {
    const accountId = store.getAccountId();
    return ibkrFetch(`/iserver/account/${accountId}/orders/whatif`, {
      method: 'POST',
      body: JSON.stringify({ orders: [orderParams] })
    });
  };
NOTES:
  - Great for showing order impact before confirm
  - Shows estimated commission, margin impact, equity change
  - Same body format as /orders but uses /orders/whatif endpoint
```

---

## 10. Route Map: Portfolio & Positions

### 10.1 Get Portfolio Accounts

```
ROUTE: GET /portfolio/accounts
PURPOSE: Get list of accounts with portfolio data access
PARAMS: None
RETURNS: [
  {
    "id": "U1234567",
    "accountId": "U1234567",
    "accountVan": "U1234567",
    "displayName": "U1234567",
    "currency": "USD",
    "type": "INDIVIDUAL",
    "tradingType": "PMRGN",
    "faclient": false,
    "clearingStatus": "O",
    "parent": { "accountId": "", "isMParent": false }
  }
]
PSEUDO-CODE:
  const getPortfolioAccounts = async () => {
    const accounts = await ibkrFetch('/portfolio/accounts');
    return accounts;
  };
NOTES:
  - MUST call before other /portfolio/* endpoints
  - Rate limit: 1 req/5 secs
  - Read-only — does NOT require brokerage session
  - Different from /iserver/accounts (which is for trading)
```

### 10.2 Get Positions

```
ROUTE: GET /portfolio/{accountId}/positions/{pageId}
PURPOSE: Get current open positions for an account
PARAMS:
  Path:
    accountId: account identifier
    pageId: page number (0-indexed, 0 for first page)
RETURNS: [
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
    "exchs": null,
    "expiry": null,
    "putOrCall": null,
    "multiplier": null,
    "strike": 0.0,
    "exerciseStyle": null,
    "conExchMap": [],
    "assetClass": "STK",
    "undConid": 0,
    "model": "",
    "time": 1712596911,
    "isEventContract": false,
    "pageSize": 30
  }
]
PSEUDO-CODE:
  const getPositions = async () => {
    const accountId = store.getAccountId();
    let allPositions = [];
    let page = 0;

    while (true) {
      const positions = await ibkrFetch(
        `/portfolio/${accountId}/positions/${page}`
      );
      if (!positions || positions.length === 0) break;
      allPositions.push(...positions);
      page++;
    }

    return allPositions.map(p => ({
      conid: p.conid,
      symbol: p.contractDesc,
      position: p.position,
      marketPrice: p.mktPrice,
      marketValue: p.mktValue,
      avgCost: p.avgCost,
      unrealizedPnl: p.unrealizedPnl,
      realizedPnl: p.realizedPnl,
      currency: p.currency,
      assetClass: p.assetClass
    }));
  };
NOTES:
  - Paginated: 30 positions per page
  - Iterate pages until empty response
  - Read-only endpoint (no brokerage session needed)
  - mktPrice and mktValue update during market hours
  - avgCost = your average entry price
  - unrealizedPnl = current P&L on the position
```

### 10.3 Account P&L (Partitioned)

```
ROUTE: GET /iserver/account/pnl/partitioned
PURPOSE: Get P&L summary for the account
PARAMS: None
RETURNS: {
  "upnl": {
    "U1234567.Core": {
      "rowType": 1,
      "dpl": 15.70,      // Daily P&L
      "nl": 100000.00,   // Net Liquidation
      "upl": 607.00,     // Unrealized P&L
      "el": 95000.00,    // Excess Liquidity
      "mv": 50000.00     // Market Value
    }
  }
}
PSEUDO-CODE:
  const getAccountPnL = async () => {
    const data = await ibkrFetch('/iserver/account/pnl/partitioned');
    const accountKey = Object.keys(data.upnl)[0]; // "U1234567.Core"
    const pnl = data.upnl[accountKey];
    return {
      dailyPnL: pnl.dpl,
      netLiquidity: pnl.nl,
      unrealizedPnL: pnl.upl,
      excessLiquidity: pnl.el,
      marketValue: pnl.mv
    };
  };
NOTES:
  - Rate limit: 1 req/5 secs
  - Better to use WebSocket spl+{} for real-time P&L
  - Requires brokerage session (/iserver endpoint)
  - "Core" = main account segment (vs model portfolios)
```

### 10.4 Account Summary

```
ROUTE: GET /portfolio/{accountId}/summary
PURPOSE: Detailed account summary (equity, margin, balances)
PARAMS:
  Path: accountId
RETURNS: {
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
  // ... many more fields
}
PSEUDO-CODE:
  const getAccountSummary = async () => {
    const accountId = store.getAccountId();
    const summary = await ibkrFetch(`/portfolio/${accountId}/summary`);
    return {
      accountId: summary.accountcode?.value,
      netLiquidity: summary.netliquidation?.amount,
      availableFunds: summary.availablefunds?.amount,
      buyingPower: summary.buyingpower?.amount,
      totalCash: summary.totalcashvalue?.amount,
      grossPosition: summary.grosspositionvalue?.amount,
      initMargin: summary.initmarginreq?.amount,
      maintMargin: summary.maintmarginreq?.amount,
      cushion: summary.cushion?.amount,
      unrealizedPnL: summary.unrealizedpnl?.amount,
      realizedPnL: summary.realizedpnl?.amount
    };
  };
NOTES:
  - Read-only (no brokerage session needed)
  - Very comprehensive — many more fields than shown above
  - cushion = margin buffer as percentage (0.988 = 98.8%)
  - For portfolio header: netLiquidity, unrealizedPnL, availableFunds
```

### 10.5 Account Ledger (Cash Balances by Currency)

```
ROUTE: GET /portfolio/{accountId}/ledger
PURPOSE: Cash balances broken down by currency
PARAMS:
  Path: accountId
RETURNS: {
  "USD": {
    "cashbalance": 214716688.0,
    "netliquidationvalue": 215335840.0,
    "unrealizedpnl": 39695.82,
    "realizedpnl": 0.0,
    "stockmarketvalue": 314123.88,
    "currency": "USD",
    "settledcash": 214716688.0
  },
  "AUD": { ... },
  "BASE": { ... }
}
PSEUDO-CODE:
  const getLedger = async () => {
    const accountId = store.getAccountId();
    return ibkrFetch(`/portfolio/${accountId}/ledger`);
  };
NOTES:
  - Shows multi-currency holdings
  - "BASE" entry = all currencies converted to base currency
  - Useful if trading on ASX (AUD), LSE (GBP), etc.
```

---

## 11. Route Map: Alerts & Notifications

### 11.1 Create/Modify Alert

```
ROUTE: POST /iserver/account/{accountId}/alert
PURPOSE: Create a new price/time/volume alert
PARAMS:
  Path: accountId
  Body: {
    "alertName": "Silver Target",
    "alertMessage": "Silver approaching snipe zone!",
    "alertRepeatable": 0,          // 0=once, 1=repeatable
    "outsideRth": 1,               // 1=trigger outside RTH
    "sendMessage": 1,              // 1=send email
    "email": "tehbyn@example.com",
    "iTWSOrdersOnly": 0,           // 0=include mobile alerts
    "showPopup": 0,                // 1=TWS popup
    "tif": "GTC",                  // GTC or GTD
    "expireTime": "20270101-12:00:00",  // For GTD only
    "conditions": [
      {
        "conidex": "265598@SMART",
        "logicBind": "n",          // "a"=AND, "o"=OR, "n"=END(last condition)
        "operator": "<=",          // >=, <=, >, <
        "triggerMethod": "0",
        "type": 1,                 // 1=Price, 3=Time, 4=Margin, 5=Trade, 6=Volume
        "value": "183.34"
      }
    ]
  }
RETURNS: {
  "request_id": null,
  "order_id": 9876543210,
  "success": true,
  "text": "Submitted"
}
PSEUDO-CODE:
  const createPriceAlert = async (params: {
    conid: number;
    exchange: string;
    name: string;
    targetPrice: number;
    direction: 'above' | 'below';
    email?: string;
  }) => {
    const accountId = store.getAccountId();
    const body = {
      alertName: params.name,
      alertMessage: `${params.name} - Price ${params.direction} ${params.targetPrice}`,
      alertRepeatable: 0,
      outsideRth: 1,
      sendMessage: params.email ? 1 : 0,
      email: params.email || '',
      iTWSOrdersOnly: 0,
      showPopup: 0,
      tif: 'GTC',
      conditions: [{
        conidex: `${params.conid}@${params.exchange}`,
        logicBind: 'n',
        operator: params.direction === 'below' ? '<=' : '>=',
        triggerMethod: '0',
        type: 1,  // Price
        value: String(params.targetPrice)
      }]
    };

    return ibkrFetch(`/iserver/account/${accountId}/alert`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  };
NOTES:
  - Condition types: 1=Price, 3=Time, 4=Margin, 5=Trade, 6=Volume
  - 7=MTA Market, 8=MTA Position, 9=MTA Account Daily PnL
  - Multiple conditions supported with logicBind AND/OR
  - conidex format: "conid@exchange" (e.g., "265598@SMART")
  - Alerts persist across sessions (stored server-side)
  - For Novacron integration: use email + local polling + webhook
```

### 11.2 Get All Alerts

```
ROUTE: GET /iserver/account/{accountId}/alerts
PURPOSE: List all alerts for the account
PARAMS: Path: accountId
RETURNS: [
  {
    "order_id": 9876543210,
    "account": "U1234567",
    "alert_name": "Silver Target",
    "alert_active": 1,
    "order_time": "20240101-18:55:35",
    "alert_triggered": false,
    "alert_repeatable": 0
  }
]
PSEUDO-CODE:
  const getAlerts = async () => {
    const accountId = store.getAccountId();
    return ibkrFetch(`/iserver/account/${accountId}/alerts`);
  };
```

### 11.3 Get Alert Details

```
ROUTE: GET /iserver/account/alert/{alertId}?type=Q
PURPOSE: Get full details of a specific alert
PARAMS:
  Path: alertId (order_id from alert creation)
  Query: type=Q (always required)
RETURNS: Full alert object with all conditions
```

### 11.4 Activate/Deactivate Alert

```
ROUTE: POST /iserver/account/{accountId}/alert/activate
PURPOSE: Enable or disable an existing alert
PARAMS:
  Path: accountId
  Body: { "alertId": 9876543210, "alertActive": 1 }
RETURNS: { "success": true, "text": "Request was submitted" }
```

### 11.5 Delete Alert

```
ROUTE: DELETE /iserver/account/{accountId}/alert/{alertId}
PURPOSE: Permanently delete an alert
PARAMS: Path: accountId, alertId (0 = delete all)
RETURNS: { "success": true, "text": "Request was submitted" }
```

### 11.6 Get Notifications (FYI)

```
ROUTE: GET /fyi/notifications
PURPOSE: Get system notifications, analyst changes, account alerts
RETURNS: [
  {
    "R": 0,           // Read status (0=unread, 1=read)
    "D": "1710847062.0",
    "MS": "FYI: Changes in Analyst Ratings",
    "MD": "<html>...</html>",
    "ID": "2024031947509444",
    "HT": 0,
    "FC": "PF"        // FYI code
  }
]
NOTES:
  - Nice-to-have for notifications panel
  - Rate limit: 1 req/sec
```

---

## 12. Route Map: Watchlist (Client-Side)

IBKR does not have a server-side watchlist API. Watchlists are managed client-side in Pulse Terminal.

```
PSEUDO-CODE:
  // data/watchlist.json
  {
    "watchlist": [
      {
        "conid": 265598,
        "symbol": "AAPL",
        "name": "APPLE INC",
        "exchange": "NASDAQ",
        "type": "STK",
        "addedAt": "2024-01-01T00:00:00Z"
      },
      {
        "conid": 69067924,
        "symbol": "SLV",
        "name": "ISHARES SILVER TRUST",
        "exchange": "ARCA",
        "type": "STK",
        "addedAt": "2024-01-02T00:00:00Z"
      }
    ]
  }

  // Zustand store
  interface WatchlistStore {
    items: WatchlistItem[];
    prices: Record<number, PriceData>;  // keyed by conid

    addItem: (item: WatchlistItem) => void;
    removeItem: (conid: number) => void;
    updatePrice: (conid: number, price: PriceData) => void;

    // On mount: subscribe all items via WebSocket
    subscribeAll: () => void;
    unsubscribeAll: () => void;
  }

  // Flow:
  // 1. Load watchlist from data/watchlist.json
  // 2. Connect WebSocket
  // 3. For each item: ws.send(`smd+${conid}+{"fields":[...]}`)
  // 4. Handle incoming smd messages → update prices in store
  // 5. On add: add to JSON, subscribe via WS
  // 6. On remove: remove from JSON, unsubscribe via WS (umd+{conid}+{})
  // 7. Save watchlist to JSON on changes
```

---

## 13. Snipe Orders (Pulse Terminal Feature)

Snipe orders are a Pulse Terminal feature — not an IBKR concept. They combine IBKR's alert system with automatic order submission.

```
PSEUDO-CODE:
  interface SnipeOrder {
    id: string;
    conid: number;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    triggerPrice: number;  // Price that activates the snipe
    orderType: 'MKT' | 'LMT';
    limitPrice?: number;   // For limit orders after trigger
    stopLoss?: number;     // Optional stop-loss
    status: 'armed' | 'triggered' | 'filled' | 'cancelled';
    createdAt: string;
  }

  // Implementation approaches:

  // APPROACH 1: IBKR Conditional/Bracket Orders (simpler)
  // - Use IBKR's native stop-limit or conditional orders
  // - STP_LIMIT: triggers at auxPrice, then limits at price
  // - Bracket: parent + take-profit + stop-loss children
  const placeSnipeAsStopLimit = async (snipe: SnipeOrder) => {
    return placeOrder({
      conid: snipe.conid,
      side: snipe.side,
      orderType: 'STP_LIMIT',
      auxPrice: snipe.triggerPrice,  // Trigger/stop price
      price: snipe.limitPrice || snipe.triggerPrice,  // Limit price
      quantity: snipe.quantity,
      tif: 'GTC',  // Good til cancelled
      outsideRTH: true
    });
  };

  // APPROACH 2: Client-Side Monitoring (more control)
  // - Monitor price via WebSocket
  // - When trigger hit → submit order via API
  // - More flexible but requires Pulse Terminal to be running
  class SnipeMonitor {
    private snipes: Map<string, SnipeOrder> = new Map();

    handlePriceUpdate(conid: number, price: number) {
      for (const [id, snipe] of this.snipes) {
        if (snipe.conid !== conid) continue;
        if (snipe.status !== 'armed') continue;

        const triggered =
          (snipe.side === 'BUY' && price <= snipe.triggerPrice) ||
          (snipe.side === 'SELL' && price >= snipe.triggerPrice);

        if (triggered) {
          this.executeSnipe(snipe);
        }
      }
    }

    async executeSnipe(snipe: SnipeOrder) {
      snipe.status = 'triggered';

      // Place the order
      const result = await placeOrder({
        conid: snipe.conid,
        side: snipe.side,
        orderType: snipe.orderType,
        quantity: snipe.quantity,
        price: snipe.limitPrice,
        tif: 'DAY',
        cOID: `snipe-${snipe.id}`
      });

      // Notify via Novacron
      emit('snipe:triggered', {
        symbol: snipe.symbol,
        price: snipe.triggerPrice,
        orderId: result.order_id
      });

      // Place stop-loss if configured
      if (snipe.stopLoss) {
        await placeOrder({
          conid: snipe.conid,
          side: snipe.side === 'BUY' ? 'SELL' : 'BUY',
          orderType: 'STP',
          auxPrice: snipe.stopLoss,
          quantity: snipe.quantity,
          tif: 'GTC'
        });
      }
    }
  }
NOTES:
  - APPROACH 1 (IBKR native) recommended for Phase 2 MVP
  - APPROACH 2 (client monitoring) gives more control but needs app running
  - For silver snipes, outside RTH is important (commodities trade ~23h/day)
  - Bracket orders can combine entry + stop-loss + take-profit in one submission
```

---

## 14. Order Types Reference

### Available via Client Portal API

| Order Type | `orderType` | Required Params | Products | Description |
|-----------|-------------|-----------------|----------|-------------|
| **Market** | `MKT` | side, quantity, tif | All | Execute immediately at best available price |
| **Limit** | `LMT` | side, quantity, price, tif | All | Execute at specified price or better |
| **Stop** | `STP` | side, quantity, auxPrice, tif | All | Becomes market order when stop price hit |
| **Stop Limit** | `STP_LIMIT` | side, quantity, price, auxPrice, tif | All | Becomes limit order when stop price hit |
| **Trailing Stop** | `TRAIL` | side, quantity, trailingAmt, trailingType, tif | STK, FUT | Stop that follows price by fixed amt/% |
| **Trailing Stop Limit** | `TRAILLMT` | side, quantity, price, trailingAmt, trailingType, tif | STK, FUT | Trailing stop that becomes limit |
| **Market on Close** | `MOC` | side, quantity | STK | Execute at market close |
| **Limit on Close** | `LOC` | side, quantity, price | STK | Limit order at close |
| **Midprice** | `MIDPRICE` | side, quantity, price | STK, OPT | Execute at midpoint of bid/ask |

### Time in Force (TIF)

| TIF | Description |
|-----|-------------|
| `DAY` | Expires end of trading day |
| `GTC` | Good til cancelled (persists across sessions) |
| `IOC` | Immediate or Cancel (fill what you can, cancel rest) |
| `OPG` | Execute at market open only |

### Key Order Parameters

```typescript
interface OrderTicket {
  conid: number;              // Contract ID (required)
  conidex?: string;           // "conid@exchange" (optional)
  orderType: string;          // MKT, LMT, STP, etc. (required)
  side: 'BUY' | 'SELL';      // (required)
  quantity: number;           // (required)
  price?: number;             // Limit price (LMT, STP_LIMIT)
  auxPrice?: number;          // Stop/trigger price (STP, STP_LIMIT)
  tif: string;                // DAY, GTC, IOC, OPG (required)
  outsideRTH?: boolean;       // Allow outside regular trading hours
  cOID?: string;              // Client order ID (your reference)
  listingExchange?: string;   // "SMART" for best execution
  trailingAmt?: number;       // For TRAIL orders
  trailingType?: 'amt'|'%';   // Trailing type
  referrer?: string;          // Source reference
}
```

---

## 15. Market Data Fields Reference

### Common Fields for Pulse Terminal

| Tag | Field | Description | Example |
|-----|-------|-------------|---------|
| `31` | Last Price | Most recent trade price | "168.42" |
| `55` | Symbol | Trading symbol | "AAPL" |
| `58` | Text | Company name / description | "APPLE INC" |
| `82` | Change | Price change from previous close | "C1.42" (C=up, H=down) |
| `83` | Change % | Percentage change | "+0.84%" |
| `84` | Bid Price | Current best bid | "168.41" |
| `85` | Bid Size | Size at best bid | "600" |
| `86` | Ask Price | Current best ask | "168.42" |
| `88` | Ask Size | Size at best ask | "1300" |
| `7059` | Last Size | Size of last trade | "100" |
| `7282` | Volume | Trading volume | "49234567" |
| `7284` | Day Low | Intraday low | "167.58" |
| `7293` | Day High | Intraday high | "169.12" |
| `7295` | Open | Opening price | "167.80" |
| `7296` | Close (Prev) | Previous session close | "167.00" |
| `7219` | Contract ID | Conid (as string) | "265598" |
| `7220` | Contract Description | Full contract desc | "AAPL NASDAQ" |
| `7221` | Listing Exchange | Primary exchange | "NASDAQ" |
| `7230` | Security Type | Asset class | "STK" |
| `7308` | Market Cap | Market capitalization | "2.85T" |
| `7310` | Implied Volatility | For options | "0.25" |
| `7311` | Put/Call Interest | For options | "12345" |
| `7674` | 52-Week High | 52-week high | "199.62" |
| `7675` | 52-Week Low | 52-week low | "143.90" |
| `7676` | Dividend Yield | Annual dividend yield | "0.52%" |
| `7677` | Dividend Amount | Dividend per share | "0.96" |
| `7681` | EPS | Earnings per share | "6.43" |
| `7682` | P/E Ratio | Price to earnings | "26.20" |

### Change Field Parsing
```typescript
// Field 82 (Change) has color prefix: C = green (up), H = red (down)
const parseChange = (raw: string): { value: number; direction: 'up' | 'down' } => {
  if (!raw) return { value: 0, direction: 'up' };
  const direction = raw.startsWith('C') ? 'up' : 'down';
  const value = parseFloat(raw.substring(1));
  return { value, direction };
};
```

---

## 16. Markets & Exchanges

### IBKR's Global Reach
IBKR provides access to **150+ markets** across **33 countries**. Key exchanges for Pulse Terminal:

| Market | Exchange Code | Region | Products | Notes |
|--------|--------------|--------|----------|-------|
| **NYSE** | NYSE | US | STK, ETF | US large caps |
| **NASDAQ** | NASDAQ | US | STK, ETF | US tech |
| **AMEX/NYSE Arca** | AMEX/ARCA | US | STK, ETF | ETFs (SLV, GLD) |
| **COMEX** | COMEX | US | FUT | Gold/Silver futures |
| **NYMEX** | NYMEX | US | FUT | Oil, energy |
| **CME** | CME | US | FUT, FOP | Indices, rates |
| **CBOE** | CBOE | US | OPT | Options |
| **ASX** | ASX | Australia | STK, ETF | Australian stocks |
| **TSX/TSXV** | TSX/VENTURE | Canada | STK | Canadian miners! |
| **LSE** | LSE | UK | STK, ETF | London stocks |
| **XETRA** | IBIS | Germany | STK | European stocks |
| **Euronext** | SBF/AEB | France/Netherlands | STK | European |
| **HKEX** | SEHK | Hong Kong | STK | HK/China stocks |
| **TSE** | TSEJ | Japan | STK | Japanese stocks |
| **SGX** | SGX | Singapore | STK, FUT | Singapore |
| **TASE** | TASE | Israel | STK | Israeli stocks |
| **BCBA** | BCBA | Argentina | STK | Argentine stocks (BMA!) |
| **SMART** | SMART | Multi | All | Best-execution routing |

### SMART Routing
- **Always use "SMART"** as the exchange for orders unless you need a specific venue
- IBKR's SmartRouting algorithm finds the best price across all available exchanges
- Works for US stocks across NYSE, NASDAQ, ARCA, BATS, IEX, etc.
- Reduces slippage and improves fill quality

### Forex (No Subscription Required)
- Currency pairs trade under secType "CASH"
- Example: EUR.USD, AUD.USD, GBP.USD
- No market data subscription fee for forex
- 24/5 trading (Sunday 5pm ET to Friday 5pm ET)

---

## 17. Market Data Subscriptions & Costs

### Requirements
- **IBKR Pro account** (not Lite)
- **$500 USD minimum equity** in account (to subscribe to any market data)
- **API Market Data Acknowledgement** must be completed in Client Portal Settings
- **Market Data API Access** must be enabled in Client Portal

### Key Subscription Bundles (Individual/Non-Professional)

| Bundle | Coverage | Approx. Cost/Month |
|--------|----------|-------------------|
| **US Securities Snapshot & Futures Value Bundle** | NYSE, NASDAQ, AMEX + US Options | ~$10/month |
| **US Equity and Options Add-On Streaming Bundle** | Streaming quotes for above | ~$4.50/month |
| **Network A (NYSE)** | NYSE stocks (individual) | ~$1.50/month |
| **Network B (ARCA/AMEX)** | ARCA/AMEX stocks (individual) | ~$1.50/month |
| **Network C (NASDAQ)** | NASDAQ stocks (individual) | ~$1.50/month |
| **ASX Total** | Australian Securities Exchange | ~AUD 6/month |
| **LSE Level 1** | London Stock Exchange | ~£1/month |
| **TSX/TSXV** | Toronto Stock Exchange + Venture | ~CAD 6/month |
| **HKEX Level 1** | Hong Kong Exchange | ~HKD 130/month |
| **CME Real-Time** | CME futures (for silver/gold) | ~$10/month |
| **COMEX Real-Time** | COMEX metals futures | Part of CME bundle |

### Important Notes
- **Forex and crypto: FREE** (no subscription needed)
- **Snapshot quotes:** $0.01 per snap, with $1/month waiver — automatically upgrades to streaming if costs match
- **TWS vs API data:** TWS gets some free data that API does NOT get. API requires paid subscriptions.
- **Per-username billing:** Each username (even on same account) is billed separately
- **100 market data lines** default (concurrent streaming quotes). Increases with commission spend.
- **Non-professional rates** are much cheaper — ensure your account is marked as non-professional in Client Portal

### Recommended Initial Setup for Pulse Terminal
1. US Securities Snapshot & Futures Value Bundle (~$10)
2. US Equity and Options Add-On Streaming (~$4.50)
3. ASX Total (~AUD 6)
4. CME/COMEX for metals (~$10)
5. TSX/TSXV for miners (~CAD 6)
**Total: ~$30-35 USD/month**

---

## 18. Known Pitfalls & Gotchas

### Authentication & Sessions
1. **macOS port 5000 conflict:** AirPlay uses port 5000. Change gateway to 5001 in conf.yaml.
2. **Daily re-auth required:** Sessions expire at midnight regional time. No automated re-login per IBKR policy.
3. **One brokerage session per username:** If TWS is open, CP API can't trade. Create a dedicated API username.
4. **2FA always required:** No bypass for live accounts. IBKR Mobile app is the easiest 2FA method.
5. **Self-signed SSL:** Node.js will reject requests without `rejectUnauthorized: false`.

### Market Data
6. **First snapshot returns empty:** Pre-flight request initializes the stream. Always make TWO requests for new conids.
7. **Delayed data without subscription:** Without paid market data, you get 15-min delayed (or nothing via API).
8. **API data ≠ TWS data:** Some free TWS data bundles don't extend to API. Check subscriptions specifically for API access.
9. **100 line limit:** Each streaming conid uses one line. Watchlist of 50 items + some overhead = fine, but be mindful.
10. **Field values are strings:** "84": "168.41" — parse everything to numbers in your code.
11. **Change field has prefix:** "82": "C1.42" — strip the C (green) or H (red) prefix before parsing.

### Orders
12. **Order reply messages:** Orders often return confirmation prompts instead of direct acknowledgment. Must handle the reply/confirm flow.
13. **Suppress messages on init:** Call `/iserver/questions/suppress` at session start for one-click trading.
14. **Call /iserver/accounts first:** Must call before placing/querying orders, or you'll get errors.
15. **Orders array format:** New orders use `{ "orders": [...] }` (array). Modifications use single object (no array).
16. **No fractional shares:** IBKR API doesn't support fractional shares for most products (except crypto/forex).
17. **Order Efficiency Ratio:** High-frequency order submission/cancellation without fills can trigger restrictions.

### WebSocket
18. **Send 'tic' for keepalive:** WebSocket needs its own heartbeat, separate from HTTP `/tickle`.
19. **Auth before connect:** WebSocket inherits CP Gateway session — must be authenticated first.
20. **Delta updates only:** After initial full message, WS only sends changed fields.
21. **Reconnect logic critical:** WS disconnects happen regularly. Auto-reconnect with exponential backoff.

### General
22. **Rate limit penalty box:** Exceeding 10 req/s → IP banned for 10-15 min. Permanent ban possible on repeat.
23. **Server resets:** Brokerage endpoints reset around 01:00 local time daily (not midnight).
24. **Canadian restrictions:** CIRO prohibits automated trading of Canadian-listed products. Manual only for TSX/TSXV.
25. **Paper account quirks:** Paper accounts have separate usernames. Execution simulation may not match live behavior.

---

## 19. npm Packages & Libraries

### For Client Portal API (REST — Recommended for Pulse Terminal)

| Package | Description | Notes |
|---------|-------------|-------|
| **Direct HTTP (fetch/axios)** | Use Next.js built-in fetch or axios | Recommended — CP API is simple REST |
| `ibkr-client` (GitHub: art1c0/ibkr-client) | TypeScript IBKR Web API client | OAuth + REST wrapper, lightweight |
| `ws` or `websocket-client` | WebSocket library | For streaming data connection |

### For TWS API (Socket — Not recommended for Pulse Terminal)

| Package | Description | Notes |
|---------|-------------|-------|
| `@stoqey/ib` | TypeScript TWS/IB Gateway client | Full port of Java client, very complete |
| `@stoqey/ibkr` | Higher-level wrapper around @stoqey/ib | Simplified interface |

### Recommendation for Pulse Terminal

**Don't use a wrapper library.** The CP API is straightforward REST — a thin fetch wrapper (100 lines) is all you need. This gives you:
- Full control over request/response handling
- No dependency on third-party maintenance
- Easy debugging (you can see every request)
- Type safety with your own TypeScript interfaces

```typescript
// lib/ibkr/client.ts — All you need
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

export async function ibkrFetch(endpoint: string, options?: RequestInit) {
  const url = `${IBKR_CONFIG.baseUrl}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PulseTerminal/1.0',
      ...options?.headers,
    },
    // @ts-ignore - Node.js fetch supports agent
    agent,
  });

  if (!res.ok) {
    throw new IBKRError(res.status, await res.text());
  }

  return res.json();
}
```

---

## Appendix: Quick Reference — Pulse Terminal → API Mapping

| Pulse Terminal Feature | IBKR API Endpoint | Method |
|----------------------|-------------------|--------|
| **App Init** | `/iserver/auth/status` | GET |
| **Session Keepalive** | `/tickle` | GET (every 55s) |
| **Get Account** | `/iserver/accounts` | GET |
| **Search Instruments** | `/iserver/secdef/search` | GET |
| **Contract Details** | `/iserver/contract/{conid}/info` | GET |
| **Watchlist Prices** | WebSocket: `smd+{conid}+{fields}` | WS |
| **Price Snapshot** | `/iserver/marketdata/snapshot` | GET |
| **Historical Data** | `/iserver/marketdata/history` | GET |
| **Place Order** | `/iserver/account/{id}/orders` | POST |
| **Modify Order** | `/iserver/account/{id}/order/{oid}` | POST |
| **Cancel Order** | `/iserver/account/{id}/order/{oid}` | DELETE |
| **Order Status** | WebSocket: `sor+{}` | WS |
| **Live Orders** | `/iserver/account/orders` | GET |
| **Positions** | `/portfolio/{id}/positions/0` | GET |
| **Account P&L** | WebSocket: `spl+{}` | WS |
| **Account Summary** | `/portfolio/{id}/summary` | GET |
| **Cash Balances** | `/portfolio/{id}/ledger` | GET |
| **Create Alert** | `/iserver/account/{id}/alert` | POST |
| **List Alerts** | `/iserver/account/{id}/alerts` | GET |
| **Suppress Messages** | `/iserver/questions/suppress` | POST |
| **Preview Order** | `/iserver/account/{id}/orders/whatif` | POST |
| **Trades/Fills** | `/iserver/account/trades` | GET |

---

*This document is the wiring blueprint. When IBKR credentials arrive:*
1. *Download CP Gateway, change port to 5001*
2. *Login via browser, complete 2FA*
3. *Start building from Section 5 (auth) → Section 6 (search) → Section 8 (WebSocket)*
4. *Everything else follows.*
