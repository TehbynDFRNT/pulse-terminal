import { NextRequest, NextResponse } from 'next/server';
import { getAccountTransactions } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conid = Number(searchParams.get('conid') || 0);
  const days = Number(searchParams.get('days') || 90);

  if (!Number.isFinite(conid) || conid <= 0) {
    return NextResponse.json({ error: 'conid is required' }, { status: 400 });
  }

  try {
    const transactions = await getAccountTransactions(conid, days);
    return NextResponse.json(transactions);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
