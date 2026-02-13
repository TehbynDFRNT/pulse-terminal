import { NextRequest, NextResponse } from 'next/server';
import { searchInstruments } from '@/lib/ibkr/client';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q');
  const secType = searchParams.get('secType') || undefined;

  if (!query || query.length < 1) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    const results = await searchInstruments(query, secType);
    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
