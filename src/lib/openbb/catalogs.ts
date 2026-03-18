export interface OpenBBCatalogOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
}

export const OPENBB_CATALOG_DEFINITIONS = {
  'fred-series': {
    label: 'FRED Series',
    description: 'Search FRED series metadata by code or title.',
  },
  'dataset-field': {
    label: 'Dataset Field',
    description: 'Search distinct values from a shaped OpenBB dataset field.',
  },
} as const;

export type OpenBBCatalogKey = keyof typeof OPENBB_CATALOG_DEFINITIONS;

export function isOpenBBCatalogKey(value: string): value is OpenBBCatalogKey {
  return value in OPENBB_CATALOG_DEFINITIONS;
}

export function buildOpenBBCatalogUrl(
  key: OpenBBCatalogKey,
  query: string,
  params: Record<string, string> = {},
  basePath = '/api/market/openbb/catalog'
) {
  const searchParams = new URLSearchParams();
  searchParams.set('key', key);
  if (query.trim()) {
    searchParams.set('q', query.trim());
  }
  for (const [paramKey, value] of Object.entries(params)) {
    if (!value.trim()) continue;
    searchParams.set(paramKey, value);
  }
  return `${basePath}?${searchParams.toString()}`;
}
