import { NextRequest, NextResponse } from 'next/server';
import { FRED_API_KEY } from '@/lib/market-cache';

export async function GET(req: NextRequest) {
  const series = req.nextUrl.searchParams.get('series') || 'DGS10';
  const start = req.nextUrl.searchParams.get('start') || '2020-01-01';

  try {
    // Support comma-separated series for batch
    const ids = series.split(',').map(s => s.trim()).filter(Boolean);

    const results = await Promise.all(
      ids.map(async (seriesId) => {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&observation_start=${start}&sort_order=asc&api_key=${FRED_API_KEY}&file_type=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return { series_id: seriesId, data: [], error: `HTTP ${res.status}` };

        const json = await res.json();
        const observations = (json.observations || [])
          .filter((o: { value: string }) => o.value !== '.' && o.value !== '')
          .map((o: { date: string; value: string }) => ({
            time: o.date,
            value: parseFloat(o.value),
          }))
          .filter((o: { value: number }) => isFinite(o.value));

        return { series_id: seriesId, data: observations };
      }),
    );

    // If single series, return flat array for backwards compatibility
    if (results.length === 1) {
      return NextResponse.json(results[0], {
        headers: { 'Cache-Control': 'public, max-age=600' },
      });
    }

    // Multiple series — return keyed object
    const out: Record<string, unknown> = {};
    for (const r of results) {
      out[r.series_id] = r;
    }
    return NextResponse.json(out, {
      headers: { 'Cache-Control': 'public, max-age=600' },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
