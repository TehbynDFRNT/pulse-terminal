import { NextRequest, NextResponse } from 'next/server';
import yf from '@/lib/yahoo';

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'GC=F,NST.AX,EVN.AX';
  const start = req.nextUrl.searchParams.get('start') || '2024-01-01';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);

  try {
    // Fetch all in parallel
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const result = await yf.chart(symbol, {
            period1: start,
            interval: '1d' as const,
          });

          if (!result.quotes?.length) return { symbol, data: [] };

          // Normalize to percentage change from first close
          const firstClose = result.quotes.find(q => q.close)?.close;
          if (!firstClose) return { symbol, data: [] };

          const data = result.quotes
            .filter(q => q.date && q.close)
            .map(q => ({
              time: new Date(q.date!).toISOString().slice(0, 10),
              close: Math.round(q.close! * 100) / 100,
              pct: Math.round(((q.close! - firstClose) / firstClose) * 10000) / 100,
            }));

          return { symbol, data };
        } catch {
          return { symbol, data: [], error: 'fetch failed' };
        }
      }),
    );

    const out: Record<string, unknown> = {};
    for (const r of results) {
      out[r.symbol] = r;
    }

    return NextResponse.json(out, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
