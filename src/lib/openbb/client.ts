import type { WidgetDataset } from '@/lib/dashboard/dataset-types';
import {
  buildOpenBBDatasetUrl,
  isOpenBBDatasetKey,
  type OpenBBDatasetKey,
  type OpenBBDatasetQuery,
} from '@/lib/openbb/datasets';
import type { OpenBBServiceStatus } from '@/lib/openbb/service-types';

async function appFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    signal: options.signal ?? AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let detail = text;

    if (text) {
      try {
        const payload = JSON.parse(text) as { error?: string; note?: string };
        detail =
          payload.error ||
          payload.note ||
          text;
      } catch {
        detail = text;
      }
    }

    throw new Error(detail || `${path} -> OpenBB ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchOpenBBServiceStatus(): Promise<OpenBBServiceStatus> {
  return appFetch<OpenBBServiceStatus>('/api/market/openbb/service');
}

export async function connectOpenBBService(): Promise<OpenBBServiceStatus> {
  return appFetch<OpenBBServiceStatus>('/api/market/openbb/service', {
    method: 'POST',
  });
}

export async function fetchOpenBBDataset(
  key: OpenBBDatasetKey,
  params: OpenBBDatasetQuery = {},
  init?: RequestInit
): Promise<WidgetDataset> {
  return appFetch<WidgetDataset>(buildOpenBBDatasetUrl(key, params), init);
}

export async function fetchOpenBBDatasetByUnknownKey(
  key: string,
  params: OpenBBDatasetQuery = {},
  init?: RequestInit
): Promise<WidgetDataset> {
  if (!isOpenBBDatasetKey(key)) {
    throw new Error(`Unknown OpenBB dataset key: ${key}`);
  }

  return fetchOpenBBDataset(key, params, init);
}
