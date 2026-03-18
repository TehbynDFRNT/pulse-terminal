# IBKR Capability Map

This is a planning document for extending `pulse-terminal` beyond quotes, charts, and basic order entry. The goal is to keep the app grounded in route-backed IBKR capabilities instead of adding UI that cannot be supported cleanly by the Client Portal API.

## What The Repo Already Wraps

Current Next routes cover the first useful IBKR surface area:

- `GET /api/ibkr/auth`: gateway session health
- `GET /api/ibkr/search`: contract lookup via secdef search
- `GET /api/ibkr/marketdata`: snapshot + history
- `GET /api/ibkr/schedule`: normalized market schedule and current session state
- `POST /api/ibkr/orders`: single-leg order placement
- `GET /api/ibkr/orders/rules`: per-contract order constraints
- `GET/POST /api/ibkr/scanner*`: scanner params and runs
- `GET /api/ibkr/portfolio`: portfolio summary path

That is enough for a usable watchlist, charting surface, screener, and basic terminal. The next step is not “more widgets”; it is filling in IBKR domains that unlock materially new workflows.

## Capability Domains

| Domain | IBKR endpoints | What it unlocks | Cache / state shape | Notes |
| --- | --- | --- | --- | --- |
| Session + schedule | `/iserver/auth/status`, `/tickle`, `/contract/trading-schedule`, `/trsrv/secdef/schedule` | real market open/close state, premarket shading, session-aware chart anchoring, alert cutoffs | short-lived auth polling, day/session cache per exchange | Best immediate foundation. Removes guesswork from “closed vs historical”. |
| Contract graph | `/iserver/secdef/search`, `/iserver/secdef/strikes`, `/iserver/secdef/info`, `/trsrv/stocks`, `/trsrv/futures` | options chains, futures curves, expiry pickers, spread builders, roll tools | long-lived conid + contract metadata cache | Required before serious derivatives UX. |
| Quotes + charts | `/iserver/marketdata/snapshot`, `/iserver/marketdata/history`, websocket market data | live watchlists, chart backfill, entitlement-aware status, intraday boards | websocket-first store, session history cache by `conid + timeframe + bar` | Already partly wrapped here. Keep route-backed and typed. |
| Scanner + watchlists | `/iserver/scanner/params`, `/iserver/scanner/run`, `/iserver/watchlists` | gainers/losers boards, breadth panels, saved boards, scanner-driven watchlists | long TTL for params, low TTL for runs, persistent local board config | Strong candidate for a Bloomberg-style monitor. |
| Orders + execution | order placement/reply flow, live order status streams, what-if style validation | advanced single-leg ticket, preview/confirm chains, fill tape, execution analytics | no shared cache; keep request/response typed and explicit | Current repo covers basic single-leg orders only. |
| Portfolio + risk | `/portfolio/accounts`, `/portfolio/{accountId}/positions/{pageId}`, `/portfolio/{accountId}/summary`, `/portfolio/{accountId}/ledger`, `/portfolio/{accountId}/allocation`, `/pa/performance`, `/iserver/account/pnl/partitioned` | holdings, exposure, PnL attribution, cash/margin views, allocation drilldowns | account-scoped cache with short TTL and explicit refresh | High-value extension if the app is becoming a real terminal. |
| Depth + microstructure | BookTrader / depth streams and related market data | DOM ladder, queue view, order book heat, tape-like surfaces | websocket stream only, aggressive cleanup | Requires L2/depth entitlements. |
| Events + catalysts | Wall Street Horizon-related fields, event contracts surfaces | earnings/event tiles, catalyst calendar, event-based watchlists | daily refresh plus symbol-level detail cache | Useful, but entitlement-gated and not core execution plumbing. |

## Recommended Build Order

1. Extend the schedule layer across more surfaces. The route now exists; next is broader consumption in watchlists, scanners, and alerts.
2. Build a contract graph service. Without it, options/futures UX stays shallow.
3. Expand portfolio/risk before chasing flashy analytics. It gives the app real terminal weight.
4. Add depth/execution surfaces only after the single-leg order flow and market status are solid.

## Product Ideas That Fit The API Well

- Market monitor: scanners, leaders/laggards, saved boards, sector or venue heat, watchlist sync.
- Execution workspace: richer single-leg orders, order tape, fills, routing visibility, later DOM.
- Derivatives workstation: chain browser, expiry/strike builder, futures roll view, spread prep.
- Portfolio terminal: exposure, cash, margin, PnL, allocation drift, performance snapshots.
- Catalyst layer: earnings, event contracts, upcoming company events, event-driven filters.

## Hard Limits

- This is not Bloomberg-level reference, fundamentals, or news breadth on its own.
- Entitlements matter: L1, L2/depth, Wall Street Horizon, event contracts, and exchange-specific data can all gate features.
- The Client Portal API is operationally constrained: one brokerage session, pacing/rate limits, and session resets still shape the product.
- Some institutional or niche workflows exist in IBKR, but they should be treated as separate domains, not bolted onto the current ticket.

## Repo Guidance

- Keep new UI backed by `/api/ibkr/*` routes, not component-private IBKR calls.
- Prefer a single normalized market-data status model across watchlists, charts, scanners, and tickets.
- Cache metadata aggressively; cache live/account state conservatively.
- Treat schedule data and contract metadata as first-class services, not incidental helpers.

## Primary References

- Client Portal API: https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/
- Web API docs: https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/
- Market data subscriptions: https://www.interactivebrokers.com/campus/ibkr-api-page/market-data-subscriptions/
- Event contracts: https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/
- Web API changelog: https://www.interactivebrokers.com/campus/ibkr-api-page/web-api-changelog/
