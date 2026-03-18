import type { OpenBBCatalogKey } from '@/lib/openbb/catalogs';
import type { OpenBBDatasetKey, OpenBBDatasetQuery } from '@/lib/openbb/datasets';

const DEFAULT_OPENBB_SIDECAR_HOST = '127.0.0.1';
const DEFAULT_OPENBB_SIDECAR_PORT = 5052;

function readPort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OPENBB_SIDECAR_PORT;
}

export function getOpenBBSidecarBaseUrl(): string {
  const explicit = process.env.OPENBB_SIDECAR_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const host = process.env.OPENBB_SIDECAR_HOST?.trim() || DEFAULT_OPENBB_SIDECAR_HOST;
  const port = readPort(process.env.OPENBB_SIDECAR_PORT);
  return `http://${host}:${port}`;
}

export function buildOpenBBSidecarDatasetUrl(
  key: OpenBBDatasetKey,
  params: OpenBBDatasetQuery = {}
): string {
  const url = new URL(`/datasets/${encodeURIComponent(key)}`, getOpenBBSidecarBaseUrl());

  for (const [paramKey, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(paramKey, String(value));
  }

  return url.toString();
}

export function buildOpenBBSidecarCatalogUrl(
  key: OpenBBCatalogKey,
  query: string,
  params: Record<string, string> = {}
): string {
  const url = new URL(`/catalogs/${encodeURIComponent(key)}`, getOpenBBSidecarBaseUrl());
  if (query.trim()) {
    url.searchParams.set('q', query.trim());
  }
  for (const [paramKey, value] of Object.entries(params)) {
    if (!value.trim()) continue;
    url.searchParams.set(paramKey, value);
  }
  return url.toString();
}
