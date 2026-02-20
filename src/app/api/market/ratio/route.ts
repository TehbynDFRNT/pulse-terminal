import { NextRequest, NextResponse } from 'next/server';
import yf from '@/lib/yahoo';

export async function GET(req: NextRequest) {
  const numerator = req.nextUrl.searchParams.get('numerator') || 'GC=F';
  const denominator = req.nextUrl.searchParams.get('denominator') || 'SI=F';
  const start = req.nextUrl.searchParams.get('start') || '2020-01-01';

  try {
    // Fetch both in parallel
    const [numResult, denResult] = await Promise.all([
      yf.chart(numerator, { period1: start, interval: '1d' }),
      yf.chart(denominator, { period1: start, interval: '1d' }),
    ]);

    if (!numResult.quotes?.length || !denResult.quotes?.length) {
      return NextResponse.json({ error: 'No data for one or both symbols' }, { status: 404 });
    }

    // Build date-indexed maps
    const denMap = new Map<string, number>();
    for (const q of denResult.quotes) {
      if (q.date && q.close) {
        denMap.set(new Date(q.date).toISOString().slice(0, 10), q.close);
      }
    }

    // Compute ratio where both dates align
    const data = numResult.quotes
      .map(q => {
        if (!q.date || !q.close) return null;
        const date = new Date(q.date).toISOString().slice(0, 10);
        const denClose = denMap.get(date);
        if (!denClose || denClose === 0) return null;
        return {
          time: date,
          value: Math.round((q.close / denClose) * 10000) / 10000,
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { numerator, denominator, data },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
