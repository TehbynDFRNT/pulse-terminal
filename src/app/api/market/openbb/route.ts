import { NextRequest, NextResponse } from 'next/server';
import {
  getOpenBBDatasetDefinition,
  isOpenBBDatasetKey,
  type OpenBBDatasetKey,
  type OpenBBDatasetQuery,
} from '@/lib/openbb/datasets';
import { buildOpenBBSidecarDatasetUrl } from '@/lib/openbb/runtime';
import {
  ensureOpenBBSidecar,
  waitForOpenBBSidecarHealth,
} from '@/lib/openbb/service-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    if ('error' in payload && typeof payload.error === 'string' && payload.error) {
      return payload.error;
    }
    if ('detail' in payload && typeof payload.detail === 'string' && payload.detail) {
      return payload.detail;
    }
  }

  return `OpenBB sidecar returned HTTP ${status}`;
}

function collectQueryParams(req: NextRequest): {
  key: OpenBBDatasetKey | null;
  params: OpenBBDatasetQuery;
} {
  const rawKey = req.nextUrl.searchParams.get('key');
  const key = rawKey && isOpenBBDatasetKey(rawKey) ? rawKey : null;
  const params: OpenBBDatasetQuery = {};

  for (const [paramKey, value] of req.nextUrl.searchParams.entries()) {
    if (paramKey === 'key') continue;
    params[paramKey] = value;
  }

  return { key, params };
}

export async function GET(req: NextRequest) {
  const { key, params } = collectQueryParams(req);

  if (!key) {
    return NextResponse.json(
      { error: 'Missing or invalid OpenBB dataset key' },
      { status: 400 }
    );
  }

  const definition = getOpenBBDatasetDefinition(key);

  try {
    const started = await ensureOpenBBSidecar();
    const healthy = await waitForOpenBBSidecarHealth(started ? 12_000 : 1_500);
    if (!healthy) {
      return NextResponse.json(
        {
          error: 'OpenBB sidecar is unavailable',
          note: 'The OpenBB service did not become healthy in time.',
        },
        { status: 503 }
      );
    }

    const response = await fetch(buildOpenBBSidecarDatasetUrl(key, params), {
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }

    if (!response.ok) {
      const errorMessage = extractErrorMessage(payload, response.status);
      const responseBody =
        payload && typeof payload === 'object'
          ? { ...payload, error: errorMessage }
          : { error: errorMessage };

      return NextResponse.json(responseBody, {
        status: response.status,
      });
    }

    const maxAge = Math.max(60, Math.round(definition.defaultRefreshIntervalMs / 1000));
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, max-age=${maxAge}`,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        note: 'OpenBB sidecar request failed',
      },
      { status: 502 }
    );
  }
}
