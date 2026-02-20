import { NextRequest, NextResponse } from 'next/server';

/**
 * Flows route — insider/institutional data.
 * FMP free tier blocks these endpoints (402). Currently returns empty.
 * TODO: Find alternative data source for insider transaction data.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || 'GLD';

  return NextResponse.json({
    symbol,
    insider: [],
    institutional: [],
    note: 'Insider/institutional flow data requires a paid data provider. FMP free tier returns 402.',
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
