# OpenBB Integration Notes

## Status

Date: 2026-03-17

Current repo status, plainly:

- the OpenBB path in this repo is usable today through a Python sidecar plus `CommandRunner`
- it is not yet a true `from openbb import obb` integration surface
- the Board-side dataset contracts are still opinionated Pulse shapers, not generated from OpenBB command metadata
- that means the current integration is practical, but not yet highly portable across all OpenBB sources
- the intended next step is to replace more of the hand-authored query/schema layer with proper OpenBB command introspection once a stable `obb` or equivalent metadata path is available

OpenBB was updated into a repo-local runtime environment for validation:

```bash
python3.12 -m venv .runtime/openbb-venv
.runtime/openbb-venv/bin/python -m pip install --upgrade pip openbb
```

Validated package version:

- `openbb==4.7.1`
- `openbb-core==1.6.4`

Local verification results:

- `from openbb import obb` is not currently reliable in this environment.
- `openbb-build` did not resolve the generated-package import failure.
- The failure is:

```text
ImportError: cannot import name 'OBBject_EquityInfo' from 'openbb_core.app.provider_interface'
```

- `openbb_core.app.command_runner.CommandRunner` does work and is the viable integration path right now.
- `CommandRunner` requires the Python launcher environment to set `SSL_CERT_FILE` to the `certifi` CA bundle on this machine.
- Verified usable locally through `CommandRunner`:
  - `fred` -> `"/economy/fred_series"`
  - `federal_reserve` -> `"/economy/money_measures"`
  - `oecd` -> `"/economy/unemployment"`
  - `eia` -> `"/commodity/short_term_energy_outlook"`
  - `eia` -> `"/commodity/petroleum_status_report"`
  - `sec` -> `"/equity/ownership/form_13f"`
  - `fmp` -> `"/economy/risk_premium"`
- Verified limited locally:
  - `fmp` ownership/government-trade style endpoints return `402 Restricted Endpoint` under the current subscription
- Verified unavailable locally:
  - `intrinio_api_key` is not set in OpenBB user settings
  - `benzinga_api_key` is not set in OpenBB user settings
  - `tiingo_token` is not set in OpenBB user settings

Implemented in this repo now:

- Python sidecar: `scripts/openbb_sidecar.py`
- sidecar process manager: `scripts/openbb-sidecar-daemon.mjs`
- internal Next route proxy: `src/app/api/market/openbb/route.ts`
- canonical dataset contract: `src/lib/dashboard/dataset-types.ts`
- Board dataset registry: `src/lib/dashboard/widget-datasets.ts`
- dataset adapters: `src/lib/dashboard/dataset-adapters.ts`
- OpenBB dataset registry: `src/lib/openbb/datasets.ts`
- OpenBB client/runtime helpers: `src/lib/openbb/client.ts`, `src/lib/openbb/runtime.ts`
- future widget config types: `src/lib/dashboard/data-widgets.ts`
- client dataset hook: `src/lib/dashboard/use-widget-dataset.ts`
- composable widgets stitched through the Board path:
  - `src/components/dashboard/SeriesDataBoardWidget.tsx`
  - `src/components/dashboard/TableDataBoardWidget.tsx`
  - `src/components/dashboard/MetricDataBoardWidget.tsx`
  - `src/components/dashboard/PieDataBoardWidget.tsx`
  - `src/components/dashboard/StackedBarDataBoardWidget.tsx`

Current Board stitch status:

- the Board widget registry now has data widget types for `series`, `table`, `metric`, `pie`, and `stacked-bar`
- the Board renderer dispatches those widgets through the same card/grid path as `chart`, `watchlist-heatmap`, and `screener-list`
- the add/edit dialog now selects a widget type first, then selects an app-level dataset key and minimal params
- widget config stays dataset-backed and app-level; provider selection remains behind the internal route contract

## Current Repo Reality

This repo already experimented with OpenBB as Python subprocess tooling, but those paths are currently legacy, not active runtime architecture.

Legacy OpenBB scripts exist in:

- `scripts/fetch_history.py`
- `scripts/fetch_multi.py`
- `scripts/fetch_ratio.py`
- `scripts/fetch_macro.py`
- `scripts/fetch_fred.py`
- `scripts/fetch_energy.py`
- `scripts/fetch_flows.py`
- `scripts/fetch_snapshot.py`

The live app path is now Node-first:

- `src/app/api/market/history/route.ts`
- `src/app/api/market/multi/route.ts`
- `src/app/api/market/ratio/route.ts`
- `src/app/api/market/prices/route.ts`
- `src/app/api/market/macro/route.ts`
- `src/app/api/market/fred/route.ts`
- `src/app/api/market/energy/route.ts`
- `src/app/api/market/flows/route.ts`
- `src/app/api/market/snapshot/route.ts`

This matters because OpenBB is not a cleanup of the current architecture. It would be a deliberate reintroduction of a Python middleware layer.

## Board Reality

The actual destination for OpenBB-backed widgets in this repo is `/board`, not `/dashboard`.

Relevant files:

- `src/app/board/page.tsx`
- `src/components/dashboard/BoardWorkspace.tsx`
- `src/components/dashboard/BoardWidgetRenderer.tsx`
- `src/lib/dashboard/widgets.ts`

Current Board state:

- Board widget types now include `chart`, `watchlist-heatmap`, `screener-list`, `series`, `table`, `metric`, `pie`, and `stacked-bar`
- `BoardWidgetRenderer` dispatches both IBKR widgets and dataset-backed widgets
- Widget state is persisted under `pulse-board-layout-v2`
- Layout and widget config are separate concerns
- Chart widgets remain instrument-bound, but dataset-backed widgets are keyed by app-level dataset contracts plus minimal params

This is important for OpenBB integration because most useful OpenBB widgets for this app are not IBKR chart widgets:

- macro widgets are global, not `conid`-bound
- energy widgets are theme/series driven, not `conid`-bound
- SEC/FMP widgets are symbol-bound, but do not need IBKR chart semantics

Practical consequence:

- OpenBB integration for Board is first a widget-schema problem, then a data-route problem
- The `BoardWidget` union will need to grow beyond `type: 'chart'`
- A storage-key bump or migration path will be needed when new widget types are introduced

## Integration Goal

The real goal for this repo is not "add OpenBB".

It is:

- define a series of Board widget types that can present data in different ways
- keep IBKR as the execution and instrument source of truth
- use OpenBB as the standard middleware option for non-IBKR datasets
- make adding new non-IBKR widgets feel like adding a known route-backed data source, not inventing a new one-off integration each time

That means OpenBB should be treated as infrastructure behind the widget system, not as the widget system itself.

## Validated Provider Matrix

This is the current state of providers that matter for non-IBKR data in this app.

| Provider | Credential status | Runtime status | Notes |
|---|---|---|---|
| `fred` | set | usable | Works through `CommandRunner` when `SSL_CERT_FILE` is set |
| `federal_reserve` | no key needed | usable | Good macro companion to FRED |
| `oecd` | no key needed | usable | Useful for macro/global labor data |
| `eia` | set | usable | `short_term_energy_outlook` and `petroleum_status_report` both worked |
| `sec` | no key needed | usable | `form_13f` worked; good for filing-based ownership data |
| `fmp` | set | partially usable | `risk_premium` worked, but ownership/government-trade endpoints hit plan-gated `402` responses |
| `intrinio` | missing | unusable | OpenBB reports missing credential |
| `benzinga` | missing | untested/unusable | No credential present |
| `tiingo` | missing | untested/unusable | No credential present |

Practical takeaway:

- OpenBB is not useless for this app.
- It is already usable for macro, energy, SEC filing data, and at least some FMP macro endpoints.
- It is not currently a reliable solution for FMP ownership-style routes under the present subscription.

## Thin Passthrough Shapers

Yes, thin passthrough shapers are necessary for the Board path.

The current codebase already does widget-level shaping in client components:

- `src/components/charts/FredMultiLine.tsx` fetches `/api/market/fred` and converts the response into `ChartSeries[]`
- `src/components/charts/InsiderTable.tsx` expects `insider[]` and `institutional[]`
- `src/components/charts/FundamentalsGrid.tsx` expects a symbol-keyed fundamentals object
- `src/components/ValuationPanel.tsx` expects a fully-composed `ValuationData`

This means the app already has multiple view-specific contracts on top of route payloads.

For Board widgets, do not pass raw OpenBB `OBBject` output into components.

Recommended path:

```text
OpenBB CommandRunner
  -> provider result
  -> Next.js route normalization
  -> thin Board shaper
  -> widget-ready payload
  -> dumb Board widget
```

Shapers should be thin, not smart:

- flatten `results`
- rename fields to existing UI vocabulary
- coerce dates, numbers, and nulls
- sort and limit rows
- preserve source/provider metadata in a small debug field

They should not:

- embed provider selection policy in the component
- mix multiple unrelated widget contracts together
- leak OpenBB field names directly into Board UI props

Suggested shape categories:

- `shapeBoardSeriesWidget(...)`
- `shapeBoardTableWidget(...)`
- `shapeBoardMetricWidget(...)`

Where they should live:

- route boundary normalization in `src/app/api/market/*`
- reusable widget-facing shaping helpers in `src/lib/dashboard/` or a dedicated OpenBB helper layer under `src/lib/`

Reason:

- the repo guidance favors a deterministic route-backed data path
- Board widgets should stay dumb and layout-focused
- the same shaped payload can later be reused outside Board if needed

There is already at least one sign that this is needed:

- `/api/market/fred` returns `{ [seriesId]: { series_id, data } }` for multi-series requests
- `src/components/charts/FredMultiLine.tsx` currently reads `data[cfg.id]` as if it were the array directly

That is exactly the kind of route/widget contract drift a thin shaper layer prevents.

## Target Board Architecture

The target shape should be:

```text
Board widget type
  -> widget config
  -> route contract
  -> source adapter
  -> provider(s)
```

In this model:

- widgets decide presentation
- routes decide app contracts
- OpenBB decides provider access and normalization

The Board should not know or care whether a non-IBKR dataset came from:

- `fred`
- `federal_reserve`
- `oecd`
- `eia`
- `sec`
- `fmp`

It should only know that it requested a widget-ready contract from `/api/market/...`.

## Python -> JS Handoff Boundary

Yes, there is a real handoff boundary here.

Because `from openbb import obb` is not the stable path in this environment, the reliable integration seam is:

```text
Python/OpenBB CommandRunner
  -> JSON response
  -> Next.js route
  -> JS dataset shaper
  -> Board widget adapter
  -> component
```

That boundary should be explicit.

The Python side should not try to return component-ready props.
The React side should not try to understand raw OpenBB/provider rows.

The stable handoff object should be a small canonical dataset envelope that is row-oriented and describes:

- date field
- dimensions
- metrics
- view hints

This is what makes non-IBKR data additive instead of bespoke.

## Canonical Dataset Contracts

Board data contracts should be defined around a few primitive dataset kinds.

Suggested TypeScript shape:

```ts
type DatasetKind = 'time-series' | 'table' | 'pie' | 'stacked-bar';

type DatasetValue = string | number | null;

interface DatasetField {
  key: string;
  label: string;
  role: 'date' | 'dimension' | 'metric';
  format?: 'string' | 'number' | 'integer' | 'percent' | 'currency';
  unit?: string;
}

interface DatasetSourceMeta {
  adapter: string;
  providers: string[];
  route: string;
  asOf?: string;
}

interface DatasetViewMeta {
  xField?: string;
  labelField?: string;
  stackField?: string;
  defaultMetric?: string;
}

interface WidgetDataset {
  version: 'v1';
  kind: DatasetKind;
  title: string;
  source: DatasetSourceMeta;
  fields: DatasetField[];
  dateField?: string;
  dimensionFields: string[];
  metricFields: string[];
  view: DatasetViewMeta;
  rows: Array<Record<string, DatasetValue>>;
}
```

The important part is not the exact naming. It is the discipline:

- all widget data crosses the boundary as rows
- rows are described by field roles
- widgets render by field role, not by provider-specific property names

## Primitive Rules

### `time-series`

Use for:

- FRED series
- OECD series
- Federal Reserve series
- EIA historical series

Rules:

- exactly 1 `dateField`
- 0 or more `dimensionFields`
- 1 or more `metricFields`
- `view.xField` should point at the date field

Example:

```json
{
  "kind": "time-series",
  "dateField": "date",
  "dimensionFields": [],
  "metricFields": ["value"],
  "view": { "xField": "date", "defaultMetric": "value" }
}
```

### `table`

Use for:

- SEC 13F holdings
- ownership tables
- energy report rows
- macro ranking tables

Rules:

- `dateField` optional
- 1 or more dimensions and/or metrics
- rows stay flat and sortable

Example:

```json
{
  "kind": "table",
  "dateField": "period_ending",
  "dimensionFields": ["issuer", "cusip", "security_type"],
  "metricFields": ["principal_amount", "value"]
}
```

### `pie`

Use for:

- allocations
- source mix
- sector mix
- holdings concentration slices

Rules:

- usually no `dateField`
- exactly 1 label dimension
- exactly 1 metric
- `view.labelField` points at the slice label
- `view.defaultMetric` points at the slice value

Example:

```json
{
  "kind": "pie",
  "dimensionFields": ["bucket"],
  "metricFields": ["weight"],
  "view": { "labelField": "bucket", "defaultMetric": "weight" }
}
```

### `stacked-bar`

Use for:

- category breakdowns over time
- country/commodity splits
- table-section aggregates from EIA or macro data

Rules:

- `dateField` optional
- 1 x-axis dimension
- 1 stack dimension
- 1 metric
- `view.xField` identifies the bar category
- `view.stackField` identifies the stacked segment

Example:

```json
{
  "kind": "stacked-bar",
  "dateField": "date",
  "dimensionFields": ["category", "segment"],
  "metricFields": ["value"],
  "view": {
    "xField": "category",
    "stackField": "segment",
    "defaultMetric": "value"
  }
}
```

## Adapter Layer

The canonical dataset is not the final component prop shape.

There should be a very small JS adapter layer between dataset envelopes and concrete components.

Examples:

- `datasetToChartSeries(dataset)` for `MultiLineChart`
- `datasetToTableModel(dataset)` for table widgets
- `datasetToPieSlices(dataset)` for future pie widgets
- `datasetToStackedBars(dataset)` for future stacked-bar widgets

This matters because the repo already has components that expect narrow prop shapes:

- `MultiLineChart` expects `ChartSeries[]`
- `InsiderTable` expects `insider[]` and `institutional[]`
- `ValuationPanel` expects a custom composed object

Those component contracts are fine.
What should change is that routes and shapers become the stable place where source data is translated into those contracts.

## Mapping OpenBB Outputs Into The Contract

The current validated OpenBB commands already fit this model.

Examples:

- `fred_series`
  - source row shape is effectively `date + metric`
  - maps cleanly to `time-series`

- `petroleum_status_report`
  - source rows include `date`, `table`, `title`, `value`, `unit`
  - can map to `table`
  - can also be reshaped into `stacked-bar` or `time-series` depending on the selected slice

- `form_13f`
  - source rows include dimensions like `issuer`, `cusip`, `security_type`
  - source rows include metrics like `principal_amount`, `value`
  - maps naturally to `table`

- `risk_premium`
  - source rows include dimensions like `country`, `continent`
  - source rows include metrics like `total_equity_risk_premium`
  - can map to `table`, `pie`, or `stacked-bar` depending on the widget

This is exactly why OpenBB is useful as middleware:

- it gives the app a repeatable way to acquire structured non-IBKR rows
- the app can then project those rows into a small number of widget primitives

## Current Component Surface

At the moment, the repo has:

- line/time-series rendering via `MultiLineChart`
- table-style rendering via components like `InsiderTable` and `FundamentalsGrid`
- card shell rendering via `BoardWidgetCard`

It does not yet have:

- a Board pie widget
- a Board stacked-bar widget
- a canonical dataset adapter layer

That is why the handoff contract should be designed now, before more widget types are added.

## Recommended Widget Taxonomy

The Board needs a small set of reusable widget presentation types.

Recommended first-pass types:

- `chart`
  - existing IBKR/instrument chart widget
- `series`
  - one or more time series rendered as lines or area tracks
- `table`
  - filings, holdings, report rows, ownership data
- `metric`
  - compact point-in-time values, status blocks, summary cards
- `text`
  - optional later, for commentary/notes/explanations if needed

For this app, the first meaningful OpenBB-backed widget types are:

- `series`
- `table`
- `metric`

That gives enough coverage for:

- macro panels
- energy panels
- SEC filing/ownership panels

without over-designing the Board system.

## Widget vs Source Separation

This separation is important:

- widget type = how data is shown
- source adapter = where data came from
- shaper = how route data becomes widget data

Example:

```text
Widget type: series
Source adapter: openbb-macro
Provider under adapter: fred / federal_reserve / oecd
```

Another example:

```text
Widget type: table
Source adapter: openbb-sec
Provider under adapter: sec
```

This lets the app add new sources later without changing widget rendering semantics.

## OpenBB's Role In This Design

In this repo, OpenBB should be the known middleware option for non-IBKR data families.

That means:

- do not embed OpenBB calls inside Board components
- do not let Board widgets depend on provider-specific field names
- do not couple widget creation to provider choice

Instead:

- use OpenBB behind internal market routes
- normalize at the route boundary
- apply a thin widget shaper where needed
- feed stable widget contracts into Board components

This is the "seamless add non-IBKR data" path:

1. validate provider command in OpenBB
2. add or extend `/api/market/...` route
3. add thin widget shaper
4. register a widget type/config
5. render in Board

If that path is followed consistently, OpenBB becomes a repeatable middleware layer rather than a special-case integration.

## Widget Contract Direction

When the Board grows beyond chart widgets, the widget model should likely move toward something like:

```ts
type BoardWidget =
  | ChartBoardWidget
  | SeriesBoardWidget
  | TableBoardWidget
  | MetricBoardWidget;
```

Each widget type should carry only the config needed to request and render its route contract.

Examples:

- `ChartBoardWidget`
  - IBKR-bound, `conid`, `symbol`, `exchange`
- `SeriesBoardWidget`
  - global or symbol-bound, route key + series config
- `TableBoardWidget`
  - symbol-bound or theme-bound, route key + columns/view mode
- `MetricBoardWidget`
  - global or symbol-bound, route key + metric group

OpenBB should sit behind the `route key`, not in the widget config itself.

Bad:

```text
widget.provider = "fred"
widget.openbbCommand = "/economy/fred_series"
```

Better:

```text
widget.dataKey = "macro-yield-curve"
widget.view = "series"
```

with the route deciding whether that data key resolves through OpenBB.

## What OpenBB Is Good For Here

OpenBB is worth considering in this app when it gives one of these advantages:

- Provider abstraction for the same route contract
- Access to providers the current Node stack does not cover well
- Standardized response objects across providers
- A narrow internal data service for macro, ownership, or energy datasets

It is not a good fit for:

- IBKR execution, positions, orders, or account workflows
- Watchlist persistence
- Existing Node routes that are already simple and stable with `yahoo-finance2`

## Best Candidate Board Widgets

These are the best Board-oriented uses of OpenBB in this repo, based on the current code.

### High value

`macro-series`

Why it fits Board:

- Global macro data does not belong to IBKR
- The Board already has a natural place for multi-series visual widgets
- OpenBB gives access to `fred`, `federal_reserve`, and `oecd` through one middleware surface

Likely render path:

- reuse `MultiLineChart`
- replace `FredMultiLine` with a Board-oriented macro widget config layer

Shaper target:

- `title`
- `series: { label, color, data[] }[]`
- `updatedAt`
- `sources`

Binding model:

- global widget, no `conid`
- ideal first-class `SeriesBoardWidget`

### High value

`energy-series` or `energy-snapshot`

Why it fits Board:

- EIA data is validated as usable through OpenBB
- Energy is thematic/global data, which suits Board better than the IBKR chart surface
- OpenBB gives access to structured energy datasets the current Node route does not expose

Likely render path:

- `MultiLineChart` for series widgets
- a compact metrics/table widget for report snapshots

Binding model:

- global widget, optionally theme-bound
- can support both `SeriesBoardWidget` and `MetricBoardWidget`

### High value

`sec-filings` / `13f-holdings`

Why it fits Board:

- SEC data is validated as usable through OpenBB
- Filing-based ownership data is more realistic right now than FMP ownership data under the current plan
- This gives Board a non-price, research-style widget that IBKR does not cover

Likely render path:

- new table widget type, not a chart widget

Binding model:

- symbol-bound widget
- should key off `symbol`, not `conid`
- ideal first-class `TableBoardWidget`

Important note:

- This is not the same shape as the current `InsiderTable`
- Do not force SEC holdings into the existing `insider[]` / `institutional[]` contract

### Medium value

`ownership-flows`

Current state:

- The current `flows` route is a stub because the relevant FMP endpoints are plan-gated

Why OpenBB helps:

- If the FMP plan changes later, OpenBB gives a cleaner normalization layer than adding raw provider SDK calls directly into the app

Constraint:

- Under the current subscription, the ownership-style endpoints that matter are still blocked by `402 Restricted Endpoint`
- Treat this as a future widget path, not the first implementation target

### Medium value

`macro-summary`

Why it fits Board:

- the Board header area and grid can support compact metric widgets
- OpenBB can unify metrics drawn from `fred`, `federal_reserve`, `oecd`, and `eia`

Why OpenBB helps:

- one middleware surface for heterogeneous macro sources

Why it may not be worth it:

- summary cards need stronger editorial shaping than line charts do
- this is a second-step widget after the base series/table widgets exist

## Existing Component Reuse

The Board should reuse existing view components where the contracts are already close, but not blindly.

Good reuse candidates:

- `MultiLineChart` for macro and energy series widgets
- pieces of `InsiderTable` styling for tabular Board widgets

Use with caution:

- `FredMultiLine` because it currently performs its own fetch+shape logic
- `FundamentalsGrid` because it is already tailored to the current fundamentals route contract
- `ValuationPanel` because it is a full overlay workflow, not a Board tile

Recommendation:

- keep reusable presentational parts
- move fetch/shaping concerns out of those components before reusing them on Board

## Board Implementation Notes

Board integration should be done by extending the existing widget model, not by adding one-off modals or route-specific hacks.

Concrete changes implied by the current code:

- extend `BoardWidgetBase.type` beyond `'chart'`
- split widget config into instrument-bound and global/widget-config variants
- update `BoardWidgetRenderer` to dispatch new widget types
- update `isBoardWidget` to validate each widget shape
- bump `pulse-board-layout-v1` to a new storage version when non-chart widgets are added
- add a widget registry/config layer so new non-IBKR widgets are additive instead of bespoke

For OpenBB-backed widgets, prefer `symbol` as the binding key when the widget is symbol-specific.

Reason:

- OpenBB providers care about ticker symbols, not IBKR `conid`
- `conid` should stay important for IBKR chart/execution widgets
- Board can support both by keeping chart widgets `conid`-bound and research widgets `symbol`-bound

For global widgets, prefer explicit thematic or route-backed IDs rather than fake instrument bindings.

Examples:

- macro regime widget
- US energy outlook widget
- yield curve widget
- petroleum status widget

## Best Candidate Routes

For route work, the order should be:

- implement new or upgraded Board-focused routes first
- leave the current Yahoo/IBKR chart routes alone
- keep direct FRED routes unless a Board widget specifically benefits from richer OpenBB command coverage

That means the route priority is:

- `flows` replacement or split routes for SEC/FMP-backed table widgets
- new Board-oriented macro route(s)
- new Board-oriented energy route(s)
- only then reconsider existing `fred`/`macro` route replacement

Keep this recommendation from earlier:

- Keep current Node/FRED routes unless richer FRED discovery or transform coverage becomes necessary.

## Low-Value Replacement Targets

Do not replace these just to "use OpenBB":

- `/api/market/history`
- `/api/market/multi`
- `/api/market/ratio`
- `/api/market/prices`
- `/api/market/snapshot`

Reason:

- The current Node path is already aligned with repo guidance: route-backed, deterministic, and simple.
- OpenBB only adds operational complexity here unless provider switching becomes a concrete requirement.

## Recommended Integration Pattern

Use OpenBB as an internal Python sidecar, not as ad hoc subprocess calls from Next routes, and not as a direct client-facing API surface.

Recommended shape:

```text
Client Component
  -> Next.js route in src/app/api/market/*
  -> internal OpenBB sidecar endpoint
  -> OpenBB CommandRunner
  -> provider
```

Why this pattern fits the repo:

- Keeps Next routes as the single public contract boundary
- Preserves the repo's route -> shared hook/store -> component data flow
- Avoids spawning Python per request
- Centralizes OpenBB credentials, retries, certificate config, and caching
- Lets the app keep IBKR-first architecture while using OpenBB only for data gaps

That pattern is now implemented in a minimal form:

```text
Composable widget
  -> useWidgetDataset(...)
  -> /api/market/openbb?key=...
  -> http://127.0.0.1:5052/datasets/{datasetKey}
  -> OpenBB CommandRunner
  -> provider
```

Current dataset keys exposed by the sidecar:

- `macro.fred-series`
- `macro.money-measures`
- `macro.unemployment`
- `energy.short-term-energy-outlook`
- `energy.petroleum-status-report`
- `filings.sec-form-13f`
- `macro.risk-premium`

## Do Not Use `from openbb import obb` For App Integration Yet

For this repo, avoid building on the generated static SDK import path for now:

```python
from openbb import obb
```

Reason:

- The latest validated install hit a generated import failure even after `openbb-build`.
- This appears consistent with upstream reports around static asset generation/import breakage.

Use this instead:

```python
from openbb_core.app.command_runner import CommandRunner
```

This avoids the static package layer and worked locally for real commands.

## Runtime Shape

The repo now has a concrete OpenBB runtime path and app-managed service boundary:

```bash
npm run openbb:sidecar:start
npm run openbb:sidecar:status
npm run openbb:sidecar:stop
```

For a unified local run that keeps the current IBKR-first flow intact:

```bash
npm run dev:openbb
```

Important constraint:

- `npm run dev` is still unchanged and does not require OpenBB
- `dev:openbb` is the opt-in runtime when Board/non-IBKR work needs the sidecar
- the sidecar defaults to `http://127.0.0.1:5052`
- the app now exposes `GET/POST /api/market/openbb/service` for service status and connect
- `GET /api/market/openbb` now auto-ensures the sidecar before proxying dataset requests
- the top-right nav can connect OpenBB and reflects offline / starting / live status
- repeat dataset requests are cached inside the Python sidecar, not on the client

The sidecar does not expose raw OpenBB results directly. It emits canonical `WidgetDataset` envelopes so the JS side can stay provider-agnostic.

Important boundary:

- this runtime integration is not the same thing as true schema discovery from root OpenBB return shapes
- the current app-level dataset catalog and widget metadata are still curated contracts
- deeper dynamic UI mapping should come from explicit investigation of raw provider return statements and command outputs, not by pushing existing filler config deeper into the daemon

## Observed Shapes

Direct `CommandRunner` probing plus route validation now shows a clearer dataset taxonomy:

- `macro.fred-series`
  - `date` + one dynamic metric column keyed by the requested FRED symbol
- `macro.money-measures`
  - `month` + multiple numeric aggregate columns (`m1`, `m2`, `currency`, etc.)
- `macro.unemployment`
  - `date`, `country`, `value`
  - `value` is a ratio field, not a whole-number percent
- `energy.short-term-energy-outlook`
  - long-form time-series rows with `date`, `table`, `symbol`, `order`, `title`, `value`, `unit`
- `energy.petroleum-status-report`
  - same long-form pattern as above
  - `order` is a categorical ordering field, not a metric
  - app-side passthrough filters now shape this by `table`, `symbol`, `title_contains`, and `limit`
- `filings.sec-form-13f`
  - `period_ending` plus issuer/security dimensions and ownership metrics
  - `value` is currency-like, `weight` is a ratio, and the date field is shared across many rows
- `macro.risk-premium`
  - `country`, `continent`, `total_equity_risk_premium`, `country_risk_premium`

This matters for Board because the widget dialog can now:

- inspect the returned dataset schema before save
- show structured query inputs rather than only generic text fields
- drive widget mapping from returned `dateField`, `dimensionFields`, `metricFields`, and field metadata
- let the user choose table columns, series metrics, pie fields, and stacked-bar axes from the shaped contract

## Local Environment Notes

OpenBB expects its settings under:

- `~/.openbb_platform/user_settings.json`
- `~/.openbb_platform/.env`
- `~/.openbb_platform/system_settings.json`

Relevant credentials for this app:

- `fred_api_key`
- `fmp_api_key`
- `intrinio_api_key`
- `eia_api_key`
- `benzinga_api_key`
- `tiingo_token`

Current OpenBB credential status on this machine:

- set: `fred_api_key`, `eia_api_key`, `fmp_api_key`
- missing: `intrinio_api_key`, `benzinga_api_key`, `tiingo_token`

Important local note for this machine:

- OpenBB provider calls that rely on Python HTTP clients fail TLS verification until the certifi CA bundle is forced into the Python process.

Example:

```bash
export SSL_CERT_FILE="$PWD/.runtime/openbb-venv/lib/python3.12/site-packages/certifi/cacert.pem"
export REQUESTS_CA_BUNDLE="$SSL_CERT_FILE"
export CURL_CA_BUNDLE="$SSL_CERT_FILE"
```

The implemented sidecar now sets these in-process on startup, so they do not need to be exported manually when using the daemon scripts.

## Output and Contract Guidance

OpenBB returns an `OBBject` wrapper with:

- `results`
- `provider`
- `warnings`
- `chart`
- `extra`

For this app:

- Extract `results`
- Preserve `provider` and any important metadata in server logs or debug fields
- Normalize once in the Next route before the data enters a hook/store
- Do not leak raw OpenBB-specific shape directly into client components

## Practical Recommendation

Short version:

- Do not replatform existing Yahoo/FRED Node routes onto OpenBB.
- Use OpenBB only where the app has real data-source gaps.
- Prefer a narrow Python sidecar using `CommandRunner`.
- Treat the top-level `obb` SDK import as unstable in the current upstream state.
- Keep the app-side integration centered on canonical dataset envelopes plus tiny adapters, not provider-shaped payloads.
- Stitch these widgets into Board only after the widget registry/storage model is widened beyond chart-only state.

If only one OpenBB integration is pursued first, make it `flows`, not `history`.

## Sources

Official docs and upstream references used for this note:

- OpenBB ODP Python introduction: https://docs.openbb.co/odp/python
- OpenBB installation: https://docs.openbb.co/odp/python/installation
- OpenBB response model: https://docs.openbb.co/odp/python/basic_usage/response_model
- OpenBB dynamic command execution: https://docs.openbb.co/odp/python/developer/how-to/dynamic_command_execution
- OpenBB settings overview: https://docs.openbb.co/odp/python/settings
- OpenBB user settings: https://docs.openbb.co/odp/python/settings/user_settings
- OpenBB environment variables: https://docs.openbb.co/odp/python/settings/environment_variables
- OpenBB `openbb-api`: https://docs.openbb.co/odp/python/extensions/interface/openbb-api
- OpenBB providers overview: https://docs.openbb.co/odp/python/extensions/providers
- OpenBB PyPI package: https://pypi.org/project/openbb/
- Upstream OpenBB issue on `OBBject_EquityInfo` import failure: https://github.com/OpenBB-finance/OpenBB/issues/7291
