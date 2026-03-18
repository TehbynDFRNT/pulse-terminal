import { NextRequest, NextResponse } from 'next/server';
import { searchInstruments } from '@/lib/ibkr/client';
import { sanitizeInstrumentSearchQuery } from '@/lib/ibkr/search-query';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = sanitizeInstrumentSearchQuery(searchParams.get('q'));
  const secType = searchParams.get('secType') || undefined;

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    const results = await searchInstruments(query, secType);
    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    if (message.toLowerCase().includes('no contracts found')) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
