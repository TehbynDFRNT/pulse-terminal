import { NextRequest, NextResponse } from 'next/server';
import { getRecentTrades } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const days = Number(request.nextUrl.searchParams.get('days') || 0);
  try {
    const trades = await getRecentTrades(days);
    return NextResponse.json(trades);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Trade fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
