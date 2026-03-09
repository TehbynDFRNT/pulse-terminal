# IBKR Client Portal API — Verification Report
**Verified against:** IBKR Campus documentation (cpapi-v1, webapi-doc, web-api-changelog)
**Existing doc:** `API-ROUTES.md` dated 2026-02-13
**Verified on:** 2026-03-09
**Status:** Mostly accurate with several corrections and additions needed

---

## Summary

The existing API-ROUTES.md is **~90% accurate**. Core endpoints, auth flow, rate limits, and market data fields are all correct. The main issues are: one factual error (watchlists DO exist server-side), one breaking WebSocket field change (spl+{} `uel` vs `el`), a tightened snapshot constraint, and a batch of new endpoints/WebSocket topics worth knowing about.

---

## ⚠️ CORRECTIONS NEEDED

### 1. Watchlists: Server-Side Endpoints EXIST
**Section 12 is wrong.** The doc states:
> "IBKR does not have a server-side watchlist API. Watchlists are managed client-side in Pulse Terminal."

**Reality:** IBKR has had server-side watchlist endpoints for a while. From the CP API v1 TOC:
- `POST /iserver/watchlist` — Create a Watchlist
- `GET /iserver/watchlist` — Get All Watchlists
- `GET /iserver/watchlist?id={id}` — Get Watchlist Information
- `DELETE /iserver/watchlist?id={id}` — Delete a Watchlist

**Impact:** Medium. The client-side approach in the doc still works, but server-side watchlists mean state persists across sessions and syncs with TWS/Client Portal. Consider using these instead of (or alongside) local JSON storage.

### 2. spl+{} WebSocket: `el` → `uel` (BREAKING)
**Section 8.5 P&L response uses `"el"` for Excess Liquidity.** Per the Web API Changelog (date not pinpointed, but between March–August 2025):
> "The Client Portal websocket topic documentation, spl+{}, has been updated to now return 'uel' instead of 'el'."

**Fix in doc:** Change the spl+{} response example and handler code:
```diff
- "el": 95000.0,     // Excess Liquidity
+ "uel": 95000.0,    // Excess Liquidity (was "el", changed to "uel")
```

**Impact:** High — the `handlePnLUpdate` code will silently lose the excess liquidity value if parsing `pnl.el` instead of `pnl.uel`.

### 3. Snapshot Limits Tightened (Dec 2025)
**Section 7.1** says "Max ~100 conids per request" which is approximately correct, but the Dec 2025 changelog makes it explicit:
> "/iserver/marketdata/snapshot conids parameter is now limited to **100 conids per query** with **50 maximum fields** at any given time."

**Fix:** Add the 50-field maximum constraint. The existing doc's field list for watchlists uses ~13 fields (well under 50), so no functional impact for Pulse Terminal's current design, but worth noting for future expansion.

### 4. Port Reference
The doc consistently uses port `5001`. The user's actual gateway runs on port `5050`. Not a doc error per se (5001 is IBKR's recommended alternative), but should be updated for consistency with the live setup. The `IBKR_GATEWAY_URL` env var handles this at runtime.

### 5. "established" Session Flag — Undocumented
The webapi-doc now describes a third session status indicator:
- `'established'`: Set to `true` when the final login message is received from underlying brokerage infrastructure, indicating the session is **authenticated AND fully initialized** with account information loaded.

This is more reliable than checking `authenticated` alone (which can be `true` before accounts are loaded). The `checkAuth` function in Section 5.2 should check for `established` as well.

---

## ✅ CONFIRMED CORRECT

| Area | Status | Notes |
|------|--------|-------|
| **All listed endpoints** | ✅ Correct | No endpoints deprecated or removed since Feb 2026 |
| **Auth flow (CP Gateway)** | ✅ Correct | Browser SSO → 2FA → session cookie. No changes. |
| **`/iserver/auth/ssodh/init`** | ✅ Correct | Replaces deprecated `/reauthenticate`. Correctly documented. |
| **Rate limits (global)** | ✅ Correct | 10 req/s global, penalty box 10 min, permanent for repeats |
| **Per-endpoint rate limits** | ✅ Correct | All values match current IBKR documentation exactly |
| **Market data fields** | ✅ Correct | Tags 31, 55, 58, 82, 83, 84, 85, 86, 88, 7059, 7282, etc. all verified |
| **Change field parsing (C/H prefix)** | ✅ Correct | Field 82 still uses C=green, H=red prefix |
| **WebSocket smd+/umd+ format** | ✅ Correct | `smd+{conid}+{"fields":[...]}` and `umd+{conid}+{}` unchanged |
| **WebSocket sor+{} with filters** | ✅ Correct | `sor+{"filters":"Submitted"}` works per Aug 2025 changelog |
| **`/hmds/history` deprecated** | ✅ Correct | Confirmed deprecated Nov 2025. Use `/iserver/marketdata/history`. |
| **Session tiers (read-only vs brokerage)** | ✅ Correct | Two-tier model accurately described |
| **One brokerage session per username** | ✅ Correct | Still enforced across all platforms |
| **Daily re-auth at midnight** | ✅ Correct | No automation allowed per IBKR policy |
| **Self-signed SSL handling** | ✅ Correct | `rejectUnauthorized: false` still required |
| **macOS port 5000 conflict** | ✅ Correct | AirPlay still uses 5000, recommended alt is 5001 |
| **Order reply / confirm flow** | ✅ Correct | `/iserver/reply/{replyId}` with `{confirmed: true}` |
| **Message suppression** | ✅ Correct | `/iserver/questions/suppress` and `/suppress/reset` |
| **OAuth 2.0 status** | ✅ Correct | Still beta, still not available for individual retail accounts |
| **Canadian CIRO restriction** | ✅ Correct | Programmatic trading of Canadian products still prohibited |
| **Server reset timing** | ✅ Correct | Now documented more precisely: NA 01:00 ET, EU 01:00 CEST, Asia 01:00 HKT |

---

## 🆕 NEW ENDPOINTS (Not in API-ROUTES.md)

### High Relevance for Pulse Terminal

| Endpoint | Method | Description | Priority |
|----------|--------|-------------|----------|
| **Watchlist CRUD** (see Correction #1 above) | Various | Server-side watchlist management | **High** |
| `GET /portfolio/{accountId}/positions/combo` | GET | Retrieve combo/spread positions (added Jul 2024) | Medium |
| `GET /iserver/contract/{conid}/algos` | GET | Get available algo parameters for a contract | Low |
| Trading Schedule (NEW) `#schedule` | GET | New version of trading schedule endpoint | Medium |
| Positions (NEW) `#positions2` | GET | New version of positions endpoint | Medium |

### Lower Relevance (But Worth Knowing)

| Endpoint / Section | Description |
|---------------------|-------------|
| **Event Contracts** | Whole new section for IBKR ForecastTrader event contracts (categorization, markets/strikes, rules, orders). Binary event trading. |
| **All Conids by Exchange** | Get every conid listed on a specific exchange |
| **Currency Pairs** | `GET /iserver/currency/pairs` — list available forex pairs |
| **Currency Exchange Rate** | `GET /iserver/exchangerate` — get FX conversion rates |
| **Bond Filter Information** | `GET /iserver/secdef/bond-filters` — bond maturity, coupon, currency filters (added Nov 2023) |
| **Overnight Orders** | Support for submitting orders outside of regular session for next-day processing |
| **Dynamic Account** | Search/Set dynamic account for multi-account switching |
| **HMDS Market Scanner** | Additional scanner endpoint via HMDS |

---

## 🆕 NEW WebSocket Topics (Not in API-ROUTES.md)

| Topic | Format | Description |
|-------|--------|-------------|
| **Account Summary** | `sad+{}` / `uad+{}` | Stream account summary updates (subscribe/unsubscribe) |
| **Account Ledger** | `sld+{}` / `uld+{}` | Stream account ledger (cash balances by currency) |
| **Historical Data** | `smh+{conid}+{...}` | Request historical bars via WebSocket |
| **Trades (Executions)** | `str+{}` / `utr+{}` | Stream trade execution data |
| **Option Exercise** | (via WebSocket) | Exercise options through WebSocket |

**Impact:** Medium. The existing doc only covers `smd+`, `umd+`, `sor+`, `spl+`, and `sbd+`. The new topics offer alternatives to HTTP polling for account summary, ledger, and trade data. The `sad+{}` topic could replace periodic `/portfolio/{id}/summary` polling.

---

## 📝 Documentation Ecosystem Changes

1. **GitHub docs deprecated**: `interactivebrokers.github.io/cpwebapi/` is now an empty shell — just a title with no content. All documentation has moved to IBKR Campus.

2. **Documentation restructure**: IBKR reorganized into two sections:
   - **Documentation** (webapi-doc): Long-form workflow guides
   - **Reference** (webapi-ref): Per-endpoint Swagger-style definitions (still incomplete/in beta)

3. **Unified Web API still in progress**: The unified API reference is described as "in beta and subject to change." Existing CP API v1 docs remain the authoritative source for now.

---

## Recommended Actions

1. **Fix spl+{} handler** — Change `el` → `uel` in P&L WebSocket parsing. This will break silently otherwise.
2. **Evaluate server-side watchlists** — Consider using IBKR's watchlist endpoints instead of (or supplementing) client-side JSON. Syncs with other IBKR platforms.
3. **Add `established` check** — Update auth status checking to use `established` flag for more reliable session initialization detection.
4. **Note 50-field snapshot limit** — Not a current problem, but add as a constraint in the doc.
5. **Update port references** — Change 5001 → 5050 to match actual gateway config.
6. **Consider new WS topics** — `sad+{}` for account summary streaming and `str+{}` for trade execution streaming are useful additions to the architecture.

---

*No endpoints from the existing doc have been deprecated or removed. The API surface has only grown.*
