# Liveline And Chart Feed Contract

Snapshot for the version installed in this repo: `liveline@0.0.6`.

This file is no longer just a prop list. It is the current working contract for how the app feeds `Liveline`, where history is fetched, how live data takes over, and what must not regress.

## Core Rule

`Liveline` should be treated as a renderer, not a market-data orchestrator.

The app owns:
- history selection
- history coverage fallback
- live beat buffering
- coarse-history to live seam ownership
- display status and schedule state

`Liveline` owns:
- rendering
- interpolation
- badge / scrub / grid UI

If the chart breaks, the first assumption should be "bad input contract" before "bad library."

## Current Data Path

The intended chart path is:

1. `/api/ibkr/chart-feed`
2. `useChartFeed`
3. `buildHistorySeed`
4. `buildLivelineFeed`
5. `PriceChart`
6. `Liveline`

Relevant files:
- [chart-feed route](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/app/api/ibkr/chart-feed/route.ts)
- [useChartFeed](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/useChartFeed.ts)
- [liveline-feed](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/liveline-feed.ts)
- [chart-series](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/chart-series.ts)
- [PriceChart](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/components/charts/PriceChart.tsx)

Do not reintroduce component-local history stitching or multiple competing chart fetch paths.

## Bootstrap Contract

`/api/ibkr/chart-feed` returns one bootstrap payload:

- `historyBars`
- `snapshot`
- `historyError`
- selected `timeframeKey`
- selected `resolutionKey`

The route is allowed to fall back across IBKR history requests, but for long windows it must prefer coverage over fine granularity.

Current long-window behavior:
- `1M`, `3M`, `1Y` should not stop on the first non-empty intraday result if that result only covers a recent slice
- coverage-aware fallback lives in [history-coverage.ts](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/history-coverage.ts)
- long-window request ordering lives in [chart-presets.ts](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/chart-presets.ts)

Anti-regression rule:
- a later empty or timeout bootstrap must not displace a previously good history-backed bootstrap for the same `conid + timeframe + resolution`

That logic currently lives in [useChartFeed.ts](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/useChartFeed.ts).

## Liveline Input Contract

For line mode:
- `data` is the committed visible series
- `value` is the current displayed live value

For candle mode:
- `candles` is historical committed OHLC
- `liveCandle` is the in-progress candle
- `lineData` and `lineValue` are companion line data only

Important:
- do not make `PriceChart` invent a second timeline separate from `Liveline`
- do not let `data` represent one timeline while `value` represents another

## Timeframe vs Resolution

- `timeframe` = visible/history horizon the chart is supposed to represent
- `resolution` = bucket cadence for forward live movement
- `window` = visible seconds passed to `Liveline`

This repo uses explicit timeframe and resolution controls instead of `Liveline`'s `windows` prop for the main chart.

## Live Feed Rules

App-wide display prices:
- prefer midpoint when available
- fall back to last, then bid/ask

Chart live movement:
- uses live beat buffering from [useChartFeed.ts](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/useChartFeed.ts)
- chart beats are bucketed to the selected resolution
- the chart can still show a flat line if the upstream market data itself is flat

Do not confuse:
- display price formatting
- raw chart coordinate precision
- live beat cadence

The chart coordinate path should keep raw numeric precision.

## History Ownership Rules

History is left-side context only.

That means:
- history may prepend the live segment
- history must not redefine the active right edge once live ownership starts
- live data owns the right edge

For coarse-history / fine-live seams:
- the handoff boundary should not be pulled backward immediately just because a live tick exists
- higher-fidelity live ownership only expands backward once enough real live coverage exists to cover the coarse source bar span
- until then, the seam should stay pinned and stable

This is the main anti-regression rule from the recent seam work.

## Warmup Behavior

When the selected resolution is finer than available historical bars:

- history should remain sparse/coarse
- the live segment starts at the first real live beat
- the chart should not "repair" or reshape the last coarse segment forward just because time is advancing

If you see:
- the last coarse leg shallowing itself
- the seam sliding toward the present before enough live data exists
- the tail moving while the live value is unchanged

then the coarse/live boundary logic is wrong.

Current seam logic lives in [buildLivelineFeed](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/ibkr/liveline-feed.ts).

## Smoothing Note

`Liveline` draws a Bezier-smoothed spline in line mode.

This matters:
- sparse coarse points can create long swoops
- this is a rendering property, not necessarily a bad history query

When the curve looks wrong, there are two different failure modes:

1. bad history coverage
2. good coverage but too-sparse anchors for a smoothed spline

Do not conflate them.

## Long Window Behavior

Current expectations:
- `1M` should not collapse to "last week"
- `3M` should not collapse to "last month"
- `1Y` can be broader than both because it uses daily history directly

If `1M` or `3M` only fill a small fraction of the visible x-axis:
- first check `/api/ibkr/chart-feed`
- if the route span is broad, the bug is client-side mapping
- if the route span is short, the bug is request selection / fallback

## Diagnostics

Chart diagnostics exist and should be used before guessing:

- [diagnostics page](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/app/diagnostics/page.tsx)
- [diagnostics route](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/app/api/diagnostics/chart/route.ts)
- [diagnostics recorder](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/src/lib/dev/chart-diagnostics.ts)

Useful things to inspect:
- `tailTime`
- `tailValue`
- `liveValue`
- `latestMarketTime`
- `historyBars`
- `historyError`
- `hasBeats`

If `latestMarketTime` is old and `tailTime` keeps advancing, the chart is incorrectly walking itself forward.

## Props Reference

Common `Liveline` props still relevant here:

- `data: LivelinePoint[]`
- `value: number`
- `window: number`
- `grid: boolean`
- `badge: boolean`
- `fill: boolean`
- `scrub: boolean`
- `paused: boolean`
- `formatValue`
- `formatTime`
- `referenceLine`
- `mode: 'line' | 'candle'`
- `candles`
- `liveCandle`
- `lineData`
- `lineValue`

Type surface comes from:
- [liveline dist types](/Users/tehbynnova/Code/MyProjects/Web/pulse-terminal/node_modules/liveline/dist/index.d.ts)

## Do Not Regress

- Do not let a timeout bootstrap replace a good bootstrap.
- Do not let history own the right edge once live takes over.
- Do not let the coarse/live boundary move backward before enough real live coverage exists.
- Do not feed `Liveline` two conflicting timelines.
- Do not assume sparse long-window curves mean missing history without checking route coverage.
- Do not "fix" long-window charts by hardcoding viewport widths or hiding data.

## Validation

Before merging chart data changes:

- `npx tsc --noEmit`
- `npm run test:data`

And manually verify:
- short-window live seam (`5m / 1s` or `5m / 5s`)
- long-window coverage (`1M`, `3M`, `1Y`)
- hover dot alignment
- right-edge badge / value stability
