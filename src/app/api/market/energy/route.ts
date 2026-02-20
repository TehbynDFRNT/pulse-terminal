import { NextRequest, NextResponse } from 'next/server';
import yf from '@/lib/yahoo';

/** Energy data via Yahoo Finance (crude, nat gas, uranium ETFs) */
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start') || '2024-01-01';

  const symbols: Record<string, string> = {
    'CL=F': 'WTI Crude',
    'NG=F': 'Natural Gas',
    'BZ=F': 'Brent Crude',
    'URA': 'Uranium ETF',
    'USO': 'Oil ETF',
    'UNG': 'Nat Gas ETF',
  };

  try {
    const results = await Promise.all(
      Object.entries(symbols).map(async ([symbol, name]) => {
        try {
          const result = await yf.chart(symbol, {
            period1: start,
            interval: '1d' as const,
          });

          const data = (result.quotes || [])
            .filter(q => q.date && q.close)
            .map(q => ({
              time: new Date(q.date!).toISOString().slice(0, 10),
              close: Math.round(q.close! * 100) / 100,
            }));

          return { symbol, name, data };
        } catch {
          return { symbol, name, data: [], error: 'fetch failed' };
        }
      }),
    );

    const out: Record<string, unknown> = {};
    for (const r of results) {
      out[r.symbol] = r;
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
