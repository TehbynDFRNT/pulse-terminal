import { NextResponse } from 'next/server';
import { getCached, setCached, getCacheAge, FRED_API_KEY } from '@/lib/market-cache';

const CACHE_KEY = 'macro';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (FRED updates daily)

const SERIES_MAP: Record<string, string> = {
  DGS10: '10Y Yield',
  DGS2: '2Y Yield',
  T10Y2Y: 'Yield Spread',
  FEDFUNDS: 'Fed Funds',
  T10YIE: 'Breakeven Infl',
  DFII10: 'Real Rate 10Y',
  STLFSI4: 'Fin Stress',
  M2SL: 'M2 Supply',
  DTWEXBGS: 'Dollar Index',
  UNRATE: 'Unemployment',
};

interface FredObs {
  date: string;
  value: string;
}

async function fetchSeries(seriesId: string): Promise<{ label: string; value: number | null; date?: string; error?: string }> {
  const label = SERIES_MAP[seriesId] || seriesId;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=5&api_key=${FRED_API_KEY}&file_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { label, value: null, error: `HTTP ${res.status}` };

    const json = await res.json();
    const observations: FredObs[] = json.observations || [];

    // Find first non-missing observation
    for (const obs of observations) {
      if (obs.value !== '.' && obs.value !== '') {
        const val = parseFloat(obs.value);
        if (isFinite(val)) {
          return { label, value: Math.round(val * 10000) / 10000, date: obs.date };
        }
      }
    }
    return { label, value: null, error: 'No valid observations' };
  } catch (e: unknown) {
    return { label, value: null, error: e instanceof Error ? e.message.slice(0, 80) : String(e) };
  }
}

async function fetchMacro(): Promise<Record<string, { label: string; value: number | null; date?: string; error?: string }>> {
  const ids = Object.keys(SERIES_MAP);
  // All in parallel — FRED handles it fine
  const results = await Promise.all(ids.map(id => fetchSeries(id)));

  const out: Record<string, { label: string; value: number | null; date?: string; error?: string }> = {};
  ids.forEach((id, i) => { out[id] = results[i]; });
  return out;
}

export async function GET() {
  if (!FRED_API_KEY) {
    return NextResponse.json(
      { error: 'FRED_API_KEY is not configured' },
      { status: 503 },
    );
  }

  try {
    const cached = getCached<Record<string, unknown>>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      const age = getCacheAge(CACHE_KEY);
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'X-Cache': 'HIT',
          'X-Cache-Age': String(age ?? 0),
        },
      });
    }

    const data = await fetchMacro();
    setCached(CACHE_KEY, data);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
