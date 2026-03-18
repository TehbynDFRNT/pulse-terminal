# Pulse Terminal Agent Guide

This file is the quickstart and repo-orientation note for coding agents working in this repository.

`AGENTS.md` intentionally mirrors this file so either agent entrypoint lands on the same operational guidance.

## What This App Is

Pulse Terminal is a local-first IBKR trading app with an optional OpenBB sidecar.

Primary routes:
- `/` = Terminal
- `/charts` = focused chart view
- `/board` = widget workspace

Notes:
- `/dashboard` now redirects to `/charts`
- IBKR is the execution and brokerage spine
- OpenBB is currently a sidecar/middleware layer for non-IBKR Board datasets

## Quickstart

1. Bootstrap the machine-local dependencies:

```bash
./setup-local.sh
```

This handles:
- Java install on macOS if needed
- IBKR Client Portal Gateway download into `./gateway`
- `npm install`
- repo-local OpenBB venv setup in `.runtime/openbb-venv`

2. Create local env:

```bash
cp env.example .env.local
```

3. Fill in `.env.local`

Minimum useful values:
- `IBKR_GATEWAY_URL=https://localhost:5050`
- `IBKR_BASE_PATH=/v1/api`
- `IBKR_MOCK_MODE=false`
- `IBKR_ACCOUNT_ID=...`

4. Start the full local stack:

```bash
./pulse dev
```

This launcher brings up:
- IBKR Client Portal Gateway on `:5050`
- gateway keepalive daemon
- IBKR live-feed daemon
- OpenBB sidecar on `:5052`
- Next.js app on `:5001`

5. If IBKR is not authenticated yet, complete login in the browser tab opened for:

```text
https://localhost:5050
```

6. Open the app:

```text
http://localhost:5001
```

## Operational Commands

```bash
./pulse dev
./pulse gateway
./pulse auth
./pulse status
./pulse down
```

Useful direct commands:

```bash
npx tsc --noEmit
npm run build
npm run gateway:keepalive:status
npm run ibkr:live-feed:status
npm run openbb:sidecar:status
```

## Current Runtime Truth

Ports:
- `5001` = Next app
- `5050` = IBKR Client Portal Gateway
- `5052` = OpenBB sidecar

Important distinction:
- if `5001` is down, the app is down
- if `5050` is up but IBKR returns `401`/`no bridge`, the gateway process is running but the brokerage session is not usable yet

`./pulse status` is the fastest way to see the actual local state.

## Architecture Guidance

Use the current app shape, not the old one.

- Terminal, Charts, and Board are the real routes now
- Board is widget-first, not chart-only
- IBKR data should stay route-backed and deterministic
- prefer: source -> server route -> shared hook/store -> dumb component

Relevant areas:
- `src/app/api/ibkr/` = IBKR-backed routes
- `src/app/api/market/openbb/` = OpenBB proxy/service routes
- `src/components/dashboard/` = Board widgets and workspace
- `src/lib/ibkr/` = IBKR client, daemons, chart feed logic
- `src/lib/openbb/` = OpenBB runtime/client metadata helpers
- `src/lib/dashboard/` = widget, dataset, adapter, and contract types

## OpenBB Reality

Current OpenBB integration is practical but not fully generalized.

- works through Python sidecar + `CommandRunner`
- does not currently depend on a stable `from openbb import obb` path
- uses Pulse-owned dataset contracts and thin shapers
- is not yet a fully portable `obb`-native metadata-driven integration across all OpenBB sources

If you touch this area, read:
- `docs/OPENBB-INTEGRATION.md`

## Repo Rules For Changes

- Treat this repo as IBKR-first
- Preserve source fidelity where possible
- Do not bypass shared IBKR routes with ad hoc client fetches
- Prefer content-driven layout over hardcoded widths
- Keep widget config/provider-agnostic at the app layer
- Avoid committing `.env.local`, runtime caches, watchlist state snapshots, or local gateway artifacts

## Docs

- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/API-ROUTES.md`
- `docs/OPENBB-INTEGRATION.md`
- `docs/LIVELINE-PROPS.md`
