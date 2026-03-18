import { NextRequest, NextResponse } from 'next/server';
import {
  isOpenBBCatalogKey,
  type OpenBBCatalogKey,
} from '@/lib/openbb/catalogs';
import { buildOpenBBSidecarCatalogUrl } from '@/lib/openbb/runtime';
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

  return `OpenBB catalog returned HTTP ${status}`;
}

function collectQueryParams(req: NextRequest): {
  key: OpenBBCatalogKey | null;
  query: string;
  params: Record<string, string>;
} {
  const rawKey = req.nextUrl.searchParams.get('key');
  const key = rawKey && isOpenBBCatalogKey(rawKey) ? rawKey : null;
  const query = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const params: Record<string, string> = {};

  for (const [paramKey, value] of req.nextUrl.searchParams.entries()) {
    if (paramKey === 'key' || paramKey === 'q') continue;
    params[paramKey] = value;
  }

  return { key, query, params };
}

export async function GET(req: NextRequest) {
  const { key, query, params } = collectQueryParams(req);

  if (!key) {
    return NextResponse.json(
      { error: 'Missing or invalid OpenBB catalog key' },
      { status: 400 }
    );
  }

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

    const response = await fetch(buildOpenBBSidecarCatalogUrl(key, query, params), {
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

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        note: 'OpenBB catalog request failed',
      },
      { status: 502 }
    );
  }
}
