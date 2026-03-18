# Pulse Terminal

Pulse Terminal is a local-first trading terminal built around the Interactive Brokers Client Portal Gateway, with an optional OpenBB sidecar for macro, energy, and filing data.

The app currently exposes three primary views:
- `Terminal`: instrument detail, order entry, and portfolio surfaces
- `Charts`: focused chart view for the selected instrument
- `Board`: widget workspace combining IBKR and OpenBB-backed data

## Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- `liveline` for chart rendering
- IBKR Client Portal Gateway on `https://localhost:5050`
- Optional OpenBB Python sidecar on `http://127.0.0.1:5052`

## Runtime Model

This repo is IBKR-first.

- IBKR is the source of truth for brokerage, market data, positions, orders, and chart feed bootstrapping.
- The app runs a keepalive daemon and a live-feed daemon to keep gateway/session churn and polling jitter off the client.
- OpenBB is used as a narrow data middleware layer for non-IBKR datasets exposed into Board widgets.

## Prerequisites

- Node.js 20+
- npm
- IBKR Client Portal Gateway running locally
- Optional: Python 3.12 for the OpenBB sidecar

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file from the template:

```bash
cp env.example .env.local
```

3. Fill in the IBKR values in `.env.local`.

4. Start the app:

```bash
npm run dev
```

5. If you also want OpenBB running:

```bash
npm run dev:openbb
```

6. Open:

```text
http://localhost:5001
```

## Environment

See [`env.example`](./env.example) for the app/runtime env surface.

Important notes:
- `IBKR_*` values drive the gateway connection and local daemons.
- `FRED_API_KEY` and `EIA_API_KEY` are app-owned provider keys.
- OpenBB provider credentials are usually stored in `~/.openbb_platform/user_settings.json`, not in `.env.local`.

## Useful Scripts

```bash
npm run dev
npm run dev:openbb
npm run build
npm run start
npx tsc --noEmit

npm run gateway:keepalive:status
npm run ibkr:live-feed:status
npm run openbb:sidecar:status
```

## Project Notes

- The default sample watchlist lives in `data/watchlist.json`.
- Board widgets are provider-agnostic at the UI layer and consume route-backed datasets.
- `/dashboard` now redirects to `/charts`.

## Additional Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`API-ROUTES.md`](./API-ROUTES.md)
- [`OPENBB-INTEGRATION.md`](./OPENBB-INTEGRATION.md)
- [`LIVELINE-PROPS.md`](./LIVELINE-PROPS.md)

## Public Repo Hygiene

This repo is set up to keep local runtime output, env files, watchlist snapshots, and daemon caches out of source control. Review `.env.local`, `data/`, and any local docs before pushing a public remote.
