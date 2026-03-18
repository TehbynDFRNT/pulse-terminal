import type { WidgetDatasetKind } from '@/lib/dashboard/dataset-types';
import type { OpenBBCatalogKey } from '@/lib/openbb/catalogs';
import {
  buildOpenBBDatasetUrl,
  type OpenBBDatasetKey,
  type OpenBBDatasetQuery,
} from '@/lib/openbb/datasets';

export type BoardDatasetQueryValue = OpenBBDatasetQuery[string];
export type BoardDatasetQuery = OpenBBDatasetQuery;
export type BoardDataWidgetType = 'series' | 'table' | 'metric' | 'pie' | 'stacked-bar';

export interface BoardDatasetParamPreset {
  label: string;
  value: string;
  mode?: 'literal' | 'lookback';
}

export interface BoardDatasetParamField {
  key: string;
  label: string;
  input: 'text' | 'number' | 'date' | 'select';
  origin?: 'openbb' | 'app';
  required?: boolean;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  description?: string;
  examples?: readonly string[];
  catalogKey?: OpenBBCatalogKey | 'ibkr-symbol';
  suggestFromFieldKey?: string;
  presets?: readonly BoardDatasetParamPreset[];
  options?: ReadonlyArray<{
    value: string;
    label: string;
  }>;
}

export interface BoardDatasetWidgetDefaults {
  series?: {
    metricFields?: string[];
  };
  table?: {
    visibleFields?: string[];
    maxRows?: number;
  };
  metric?: {
    metricFields?: string[];
  };
  pie?: {
    labelField?: string;
    metricField?: string;
  };
  stackedBar?: {
    xField?: string;
    stackField?: string;
    metricField?: string;
  };
}

export interface BoardDatasetDefinition {
  label: string;
  description: string;
  defaultTitle: string;
  kind: WidgetDatasetKind;
  defaultRefreshIntervalMs: number;
  supportedWidgets: readonly BoardDataWidgetType[];
  source: {
    type: 'openbb';
    key: OpenBBDatasetKey;
    defaultParams?: OpenBBDatasetQuery;
  };
  paramFields?: readonly BoardDatasetParamField[];
  defaults?: BoardDatasetWidgetDefaults;
}

export interface BoardDatasetCatalogEntry {
  key: BoardDatasetKey;
  label: string;
  description: string;
  defaultTitle: string;
  kind: WidgetDatasetKind;
  defaultRefreshIntervalMs: number;
  supportedWidgets: readonly BoardDataWidgetType[];
  paramFields?: readonly BoardDatasetParamField[];
  defaults?: BoardDatasetWidgetDefaults;
}

const LOOKBACK_DATE_PRESETS = [
  { label: '1Y', value: '1y', mode: 'lookback' },
  { label: '2Y', value: '2y', mode: 'lookback' },
  { label: '5Y', value: '5y', mode: 'lookback' },
  { label: '10Y', value: '10y', mode: 'lookback' },
  { label: 'Max', value: '', mode: 'literal' },
] as const satisfies readonly BoardDatasetParamPreset[];

export const BOARD_DATASET_DEFINITIONS = {
  'macro.fred-series': {
    label: 'FRED Series',
    description: 'Flexible FRED passthrough with one dynamic metric column per symbol.',
    defaultTitle: 'FRED Series',
    kind: 'time-series',
    defaultRefreshIntervalMs: 15 * 60 * 1000,
    supportedWidgets: ['series', 'metric', 'table'],
    source: {
      type: 'openbb',
      key: 'macro.fred-series',
      defaultParams: {
        symbol: 'DGS10',
        start_date: '2020-01-01',
      },
    },
    paramFields: [
      {
        key: 'symbol',
        label: 'Series Code',
        origin: 'openbb',
        input: 'text',
        catalogKey: 'fred-series',
        required: true,
        defaultValue: 'DGS10',
        placeholder: 'DGS10',
        description:
          'Required by OpenBB/FRED. Search the FRED catalog by code or title. The returned metric column uses this code as the field key.',
      },
      {
        key: 'start_date',
        label: 'Start Date',
        input: 'date',
        origin: 'openbb',
        defaultValue: '2020-01-01',
        description: 'Optional OpenBB start date.',
        presets: LOOKBACK_DATE_PRESETS,
      },
      {
        key: 'end_date',
        label: 'End Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional OpenBB end date.',
      },
    ],
    defaults: {
      table: {
        visibleFields: ['date', 'DGS10'],
        maxRows: 24,
      },
    },
  },
  'macro.us-10y-yield': {
    label: 'US 10Y Yield Preset',
    description: 'Preset FRED configuration for the 10-year Treasury yield.',
    defaultTitle: 'US 10Y Yield',
    kind: 'time-series',
    defaultRefreshIntervalMs: 15 * 60 * 1000,
    supportedWidgets: ['series', 'metric', 'table'],
    source: {
      type: 'openbb',
      key: 'macro.fred-series',
      defaultParams: {
        symbol: 'DGS10',
        start_date: '2020-01-01',
      },
    },
    paramFields: [
      {
        key: 'symbol',
        label: 'Series Code',
        origin: 'openbb',
        input: 'text',
        catalogKey: 'fred-series',
        required: true,
        defaultValue: 'DGS10',
        placeholder: 'DGS10',
        description:
          'Required by OpenBB/FRED. Search the FRED catalog by code or title to move beyond the preset.',
      },
      {
        key: 'start_date',
        label: 'Start Date',
        input: 'date',
        origin: 'openbb',
        defaultValue: '2020-01-01',
        presets: LOOKBACK_DATE_PRESETS,
      },
      {
        key: 'end_date',
        label: 'End Date',
        input: 'date',
        origin: 'openbb',
      },
    ],
    defaults: {
      series: {
        metricFields: ['DGS10'],
      },
      metric: {
        metricFields: ['DGS10'],
      },
      table: {
        visibleFields: ['date', 'DGS10'],
        maxRows: 24,
      },
    },
  },
  'macro.money-measures': {
    label: 'Money Measures',
    description: 'Federal Reserve M1, M2, and deposit aggregates.',
    defaultTitle: 'Money Measures',
    kind: 'time-series',
    defaultRefreshIntervalMs: 60 * 60 * 1000,
    supportedWidgets: ['series', 'table'],
    source: {
      type: 'openbb',
      key: 'macro.money-measures',
    },
    paramFields: [
      {
        key: 'start_date',
        label: 'Start Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional Federal Reserve start date.',
        presets: LOOKBACK_DATE_PRESETS,
      },
      {
        key: 'end_date',
        label: 'End Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional Federal Reserve end date.',
      },
      {
        key: 'adjusted',
        label: 'Adjusted',
        input: 'select',
        origin: 'openbb',
        defaultValue: true,
        description: 'Seasonally adjusted vs raw series output.',
        options: [
          { value: 'true', label: 'Adjusted' },
          { value: 'false', label: 'Raw' },
        ],
      },
    ],
    defaults: {
      series: {
        metricFields: ['m1', 'm2', 'currency'],
      },
      table: {
        visibleFields: ['month', 'm1', 'm2', 'currency', 'demand_deposits'],
        maxRows: 24,
      },
    },
  },
  'macro.us-unemployment': {
    label: 'Unemployment',
    description: 'OECD unemployment passthrough. Defaults to the United States but accepts any valid country slug.',
    defaultTitle: 'Unemployment',
    kind: 'time-series',
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
    supportedWidgets: ['series', 'metric', 'table'],
    source: {
      type: 'openbb',
      key: 'macro.unemployment',
      defaultParams: {
        country: 'united_states',
      },
    },
    paramFields: [
      {
        key: 'country',
        label: 'Country',
        input: 'text',
        origin: 'openbb',
        defaultValue: 'united_states',
        catalogKey: 'dataset-field',
        placeholder: 'united_states',
        description: 'OECD/OpenBB country slug.',
        suggestFromFieldKey: 'country',
      },
      {
        key: 'frequency',
        label: 'Frequency',
        input: 'select',
        origin: 'openbb',
        defaultValue: 'monthly',
        description: 'OpenBB OECD frequency.',
        options: [
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarter', label: 'Quarterly' },
          { value: 'annual', label: 'Annual' },
        ],
      },
      {
        key: 'start_date',
        label: 'Start Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional OECD start date.',
        presets: LOOKBACK_DATE_PRESETS,
      },
      {
        key: 'end_date',
        label: 'End Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional OECD end date.',
      },
    ],
    defaults: {
      series: {
        metricFields: ['value'],
      },
      metric: {
        metricFields: ['value'],
      },
      table: {
        visibleFields: ['date', 'country', 'value'],
        maxRows: 24,
      },
    },
  },
  'energy.short-term-energy-outlook': {
    label: 'Short-Term Energy Outlook',
    description: 'EIA outlook rows shaped as a long-form time series with date, title, value, and unit.',
    defaultTitle: 'STEO',
    kind: 'time-series',
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
    supportedWidgets: ['series', 'table', 'stacked-bar'],
    source: {
      type: 'openbb',
      key: 'energy.short-term-energy-outlook',
      defaultParams: {
        limit: 120,
      },
    },
    paramFields: [
      {
        key: 'start_date',
        label: 'Start Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional EIA start date before Pulse shaping.',
        presets: LOOKBACK_DATE_PRESETS,
      },
      {
        key: 'end_date',
        label: 'End Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional EIA end date before Pulse shaping.',
      },
      {
        key: 'table',
        label: 'Table',
        input: 'select',
        origin: 'app',
        description: 'Exact table selection from the shaped EIA rows.',
        suggestFromFieldKey: 'table',
      },
      {
        key: 'symbol',
        label: 'Series Symbol',
        input: 'select',
        origin: 'app',
        description: 'Exact symbol selection from the shaped EIA rows.',
        suggestFromFieldKey: 'symbol',
      },
      {
        key: 'unit',
        label: 'Unit',
        input: 'select',
        origin: 'app',
        description: 'Exact unit filter to keep like-for-like metrics together.',
        suggestFromFieldKey: 'unit',
      },
      {
        key: 'title_contains',
        label: 'Series Title Filter',
        input: 'text',
        origin: 'app',
        catalogKey: 'dataset-field',
        placeholder: 'Crude Oil Production',
        description: 'Case-insensitive match against the EIA title field after passthrough shaping.',
        suggestFromFieldKey: 'title',
      },
      {
        key: 'limit',
        label: 'Rows',
        input: 'number',
        origin: 'app',
        defaultValue: 120,
        placeholder: '120',
        description: 'Keeps the latest rows after any title/symbol filter is applied.',
      },
    ],
    defaults: {
      series: {
        metricFields: ['value'],
      },
      table: {
        visibleFields: ['date', 'title', 'value', 'unit'],
        maxRows: 24,
      },
      stackedBar: {
        xField: 'date',
        stackField: 'title',
        metricField: 'value',
      },
    },
  },
  'energy.petroleum-status': {
    label: 'Petroleum Status',
    description: 'Weekly EIA petroleum status report rows shaped as long-form time series data.',
    defaultTitle: 'Petroleum Status',
    kind: 'time-series',
    defaultRefreshIntervalMs: 6 * 60 * 60 * 1000,
    supportedWidgets: ['series', 'table', 'stacked-bar'],
    source: {
      type: 'openbb',
      key: 'energy.petroleum-status-report',
      defaultParams: {
        table: 'Data 01: Petroleum Stocks',
        limit: 52,
      },
    },
    paramFields: [
      {
        key: 'start_date',
        label: 'Start Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional EIA start date before Pulse shaping.',
        presets: LOOKBACK_DATE_PRESETS,
      },
      {
        key: 'end_date',
        label: 'End Date',
        input: 'date',
        origin: 'openbb',
        description: 'Optional EIA end date before Pulse shaping.',
      },
      {
        key: 'table',
        label: 'Report Table',
        input: 'select',
        origin: 'app',
        description: 'Structured passthrough filter applied to the shaped EIA rows.',
        options: [
          { value: 'Data 01: Petroleum Stocks', label: 'Data 01: Petroleum Stocks' },
          { value: 'Data 02: Petroleum Supply', label: 'Data 02: Petroleum Supply' },
          { value: 'Data 03: Petroleum Supply', label: 'Data 03: Petroleum Supply' },
        ],
      },
      {
        key: 'symbol',
        label: 'Series Symbol',
        input: 'select',
        origin: 'app',
        description: 'Exact symbol selection from the shaped petroleum rows.',
        suggestFromFieldKey: 'symbol',
      },
      {
        key: 'unit',
        label: 'Unit',
        input: 'select',
        origin: 'app',
        description: 'Exact unit filter to keep like-for-like petroleum metrics together.',
        suggestFromFieldKey: 'unit',
      },
      {
        key: 'title_contains',
        label: 'Series Title Filter',
        input: 'text',
        origin: 'app',
        catalogKey: 'dataset-field',
        placeholder: 'Ending Stocks of Crude Oil',
        description: 'Case-insensitive match against the EIA title field after shaping.',
        suggestFromFieldKey: 'title',
      },
      {
        key: 'limit',
        label: 'Rows',
        input: 'number',
        origin: 'app',
        defaultValue: 52,
        placeholder: '52',
        description: 'Keeps the latest rows after table/title filters are applied.',
      },
    ],
    defaults: {
      series: {
        metricFields: ['value'],
      },
      table: {
        visibleFields: ['date', 'table', 'title', 'value', 'unit'],
        maxRows: 24,
      },
      stackedBar: {
        xField: 'date',
        stackField: 'title',
        metricField: 'value',
      },
    },
  },
  'filings.13f-holdings': {
    label: '13F Holdings',
    description: 'SEC Form 13F holdings table for a given symbol.',
    defaultTitle: '13F Holdings',
    kind: 'table',
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
    supportedWidgets: ['table', 'pie'],
    source: {
      type: 'openbb',
      key: 'filings.sec-form-13f',
      defaultParams: {
        symbol: 'BRK-A',
        limit: 25,
      },
    },
    paramFields: [
      {
        key: 'symbol',
        label: 'Symbol',
        input: 'text',
        origin: 'openbb',
        catalogKey: 'ibkr-symbol',
        required: true,
        defaultValue: 'BRK-A',
        placeholder: 'BRK-A',
        description: 'Required OpenBB SEC filer symbol or CIK.',
      },
      {
        key: 'date',
        label: 'Filing Date',
        input: 'date',
        origin: 'openbb',
        description:
          'Optional reporting-period date. If omitted, OpenBB returns the latest filing.',
      },
      {
        key: 'limit',
        label: 'Rows',
        input: 'number',
        origin: 'openbb',
        defaultValue: 25,
        placeholder: '25',
        description: 'OpenBB limit passed directly to the SEC command.',
      },
    ],
    defaults: {
      table: {
        visibleFields: ['period_ending', 'issuer', 'security_type', 'principal_amount', 'value', 'weight'],
        maxRows: 25,
      },
      pie: {
        labelField: 'issuer',
        metricField: 'weight',
      },
    },
  },
  'macro.country-risk-premium': {
    label: 'Risk Premium',
    description: 'Country-level equity risk premium rankings with continent and country breakout fields.',
    defaultTitle: 'Risk Premium',
    kind: 'table',
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
    supportedWidgets: ['table', 'pie', 'stacked-bar'],
    source: {
      type: 'openbb',
      key: 'macro.risk-premium',
      defaultParams: {
        limit: 12,
      },
    },
    paramFields: [
      {
        key: 'continent',
        label: 'Continent',
        input: 'select',
        origin: 'app',
        description: 'Optional shaped filter applied after the raw FMP response is loaded.',
        options: [
          { value: 'Africa', label: 'Africa' },
          { value: 'Asia', label: 'Asia' },
          { value: 'Europe', label: 'Europe' },
          { value: 'North America', label: 'North America' },
          { value: 'Oceania', label: 'Oceania' },
          { value: 'South America', label: 'South America' },
        ],
      },
      {
        key: 'country',
        label: 'Country Filter',
        input: 'text',
        origin: 'app',
        catalogKey: 'dataset-field',
        placeholder: 'Australia',
        description: 'Exact country match applied after the raw FMP response is loaded.',
        suggestFromFieldKey: 'country',
      },
      {
        key: 'limit',
        label: 'Rows',
        input: 'number',
        origin: 'app',
        defaultValue: 12,
        placeholder: '12',
        description: 'Keeps the top rows after continent/country filters are applied.',
      },
    ],
    defaults: {
      table: {
        visibleFields: ['country', 'continent', 'total_equity_risk_premium', 'country_risk_premium'],
        maxRows: 12,
      },
      pie: {
        labelField: 'country',
        metricField: 'total_equity_risk_premium',
      },
      stackedBar: {
        xField: 'continent',
        stackField: 'country',
        metricField: 'country_risk_premium',
      },
    },
  },
} as const satisfies Record<string, BoardDatasetDefinition>;

export type BoardDatasetKey = keyof typeof BOARD_DATASET_DEFINITIONS;

export function isBoardDatasetKey(value: string): value is BoardDatasetKey {
  return value in BOARD_DATASET_DEFINITIONS;
}

export function getBoardDatasetDefinition(key: BoardDatasetKey) {
  return BOARD_DATASET_DEFINITIONS[key] as BoardDatasetDefinition;
}

export function getCompatibleBoardDatasets(widgetType: BoardDataWidgetType) {
  return (Object.entries(BOARD_DATASET_DEFINITIONS) as Array<[BoardDatasetKey, BoardDatasetDefinition]>)
    .filter(([, definition]) => definition.supportedWidgets.includes(widgetType))
    .map(([key, definition]) => ({ key, definition }));
}

export function getBoardDatasetCatalog(): BoardDatasetCatalogEntry[] {
  return (Object.entries(BOARD_DATASET_DEFINITIONS) as Array<[BoardDatasetKey, BoardDatasetDefinition]>)
    .map(([key, definition]) => ({
      key,
      label: definition.label,
      description: definition.description,
      defaultTitle: definition.defaultTitle,
      kind: definition.kind,
      defaultRefreshIntervalMs: definition.defaultRefreshIntervalMs,
      supportedWidgets: definition.supportedWidgets,
      paramFields: definition.paramFields,
      defaults: definition.defaults,
    }));
}

export function getBoardDatasetInitialParams(key: BoardDatasetKey): Record<string, string> {
  const definition = getBoardDatasetDefinition(key);
  const params: BoardDatasetQuery = {
    ...(definition.source.defaultParams ?? {}),
  };

  for (const field of definition.paramFields ?? []) {
    if (field.defaultValue === undefined || field.key in params) continue;
    params[field.key] = field.defaultValue;
  }

  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([paramKey, value]) => [paramKey, String(value)])
  );
}

export function resolveBoardDatasetParams(
  key: BoardDatasetKey,
  params: Record<string, string>
): BoardDatasetQuery {
  const definition = getBoardDatasetDefinition(key);
  const next: BoardDatasetQuery = {
    ...(definition.source.defaultParams ?? {}),
  };

  for (const field of definition.paramFields ?? []) {
    const raw = params[field.key]?.trim() ?? '';
    if (!raw) {
      if (field.required) {
        delete next[field.key];
      } else if (field.key in (definition.source.defaultParams ?? {})) {
        next[field.key] = null;
      } else {
        delete next[field.key];
      }
      continue;
    }

    if (field.input === 'number') {
      next[field.key] = Number(raw);
      continue;
    }

    if (typeof field.defaultValue === 'boolean') {
      next[field.key] = raw === 'true';
      continue;
    }

    next[field.key] = raw;
  }

  return next;
}

export function buildBoardDatasetUrl(
  key: BoardDatasetKey,
  params: BoardDatasetQuery = {}
): string {
  const definition = getBoardDatasetDefinition(key);
  return buildOpenBBDatasetUrl(definition.source.key, {
    ...(definition.source.defaultParams ?? {}),
    ...params,
  });
}
