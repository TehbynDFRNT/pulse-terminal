import { NextRequest, NextResponse } from 'next/server';
import { getMarketSchedule } from '@/lib/ibkr/client';
import { buildFallbackMarketSchedule } from '@/lib/ibkr/market-schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conidParam = searchParams.get('conid');
  const exchange = searchParams.get('exchange') || undefined;

  if (!conidParam) {
    return NextResponse.json(
      { error: 'Query parameter "conid" is required' },
      { status: 400 }
    );
  }

  const conid = Number.parseInt(conidParam, 10);
  if (!Number.isFinite(conid) || conid <= 0) {
    return NextResponse.json({ error: 'Invalid "conid"' }, { status: 400 });
  }

  try {
    const schedule = await getMarketSchedule(conid, exchange);
    return NextResponse.json(schedule);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Schedule fetch failed';
    console.warn('[ibkr] schedule fallback', { conid, exchange, message });
    return NextResponse.json(buildFallbackMarketSchedule(conid, exchange));
  }
}
