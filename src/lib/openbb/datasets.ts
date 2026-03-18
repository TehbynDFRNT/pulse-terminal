import type { WidgetDatasetKind } from '@/lib/dashboard/dataset-types';

export type OpenBBDatasetQueryValue = string | number | boolean | null | undefined;
export type OpenBBDatasetQuery = Record<string, OpenBBDatasetQueryValue>;

interface OpenBBDatasetDefinition {
  label: string;
  description: string;
  kind: WidgetDatasetKind;
  providers: string[];
  defaultRefreshIntervalMs: number;
}

export const OPENBB_DATASET_DEFINITIONS = {
  'macro.fred-series': {
    label: 'FRED Series',
    description: 'Economic series from FRED as canonical time-series rows.',
    kind: 'time-series',
    providers: ['fred'],
    defaultRefreshIntervalMs: 15 * 60 * 1000,
  },
  'macro.money-measures': {
    label: 'Money Measures',
    description: 'Federal Reserve money measures as multi-metric time series.',
    kind: 'time-series',
    providers: ['federal_reserve'],
    defaultRefreshIntervalMs: 60 * 60 * 1000,
  },
  'macro.unemployment': {
    label: 'Unemployment',
    description: 'OECD unemployment data by country.',
    kind: 'time-series',
    providers: ['oecd'],
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
  },
  'energy.short-term-energy-outlook': {
    label: 'Short-Term Energy Outlook',
    description: 'EIA short-term energy outlook rows as long-form time-series data.',
    kind: 'time-series',
    providers: ['eia'],
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
  },
  'energy.petroleum-status-report': {
    label: 'Petroleum Status Report',
    description: 'EIA weekly petroleum status report rows as long-form time-series data.',
    kind: 'time-series',
    providers: ['eia'],
    defaultRefreshIntervalMs: 6 * 60 * 60 * 1000,
  },
  'filings.sec-form-13f': {
    label: 'SEC Form 13F',
    description: 'SEC 13F holdings rows for a symbol.',
    kind: 'table',
    providers: ['sec'],
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
  },
  'macro.risk-premium': {
    label: 'Risk Premium',
    description: 'Country risk premium rows via FMP.',
    kind: 'table',
    providers: ['fmp'],
    defaultRefreshIntervalMs: 24 * 60 * 60 * 1000,
  },
} as const satisfies Record<string, OpenBBDatasetDefinition>;

export type OpenBBDatasetKey = keyof typeof OPENBB_DATASET_DEFINITIONS;

export function isOpenBBDatasetKey(value: string): value is OpenBBDatasetKey {
  return value in OPENBB_DATASET_DEFINITIONS;
}

export function getOpenBBDatasetDefinition(key: OpenBBDatasetKey) {
  return OPENBB_DATASET_DEFINITIONS[key];
}

export function buildOpenBBDatasetSearchParams(
  key: OpenBBDatasetKey,
  params: OpenBBDatasetQuery = {}
): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set('key', key);

  for (const [paramKey, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    searchParams.set(paramKey, String(value));
  }

  return searchParams;
}

export function buildOpenBBDatasetUrl(
  key: OpenBBDatasetKey,
  params: OpenBBDatasetQuery = {},
  basePath = '/api/market/openbb'
): string {
  const searchParams = buildOpenBBDatasetSearchParams(key, params);
  return `${basePath}?${searchParams.toString()}`;
}
