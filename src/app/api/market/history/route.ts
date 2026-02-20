import { NextRequest, NextResponse } from 'next/server';
import yf from '@/lib/yahoo';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || 'GC=F';
  const start = req.nextUrl.searchParams.get('start') || '2020-01-01';
  const interval = (req.nextUrl.searchParams.get('interval') || '1d') as '1d' | '1wk' | '1mo';

  try {
    const result = await yf.chart(symbol, {
      period1: start,
      interval,
    });

    if (!result.quotes || result.quotes.length === 0) {
      return NextResponse.json({ error: 'No data returned' }, { status: 404 });
    }

    const data = result.quotes.map(q => ({
      time: q.date ? new Date(q.date).toISOString().slice(0, 10) : null,
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      close: q.close ?? null,
      volume: q.volume ?? null,
    })).filter(d => d.time && d.close !== null);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
