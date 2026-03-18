import { NextRequest, NextResponse } from 'next/server';
import { getAccountActivity } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const days = Number(request.nextUrl.searchParams.get('days') || 7);

  try {
    const activity = await getAccountActivity(days);
    return NextResponse.json(activity);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Account activity failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
