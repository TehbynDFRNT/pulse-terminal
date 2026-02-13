import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataSnapshot, getHistoricalData } from '@/lib/ibkr/client';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conidsParam = searchParams.get('conids');
  const historyConid = searchParams.get('history');

  // Historical data request
  if (historyConid) {
    const period = searchParams.get('period') || '1d';
    const bar = searchParams.get('bar') || '5min';

    try {
      const bars = await getHistoricalData(
        parseInt(historyConid, 10),
        period,
        bar
      );
      return NextResponse.json(bars);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'History fetch failed';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Snapshot request
  if (!conidsParam) {
    return NextResponse.json(
      { error: 'Query parameter "conids" or "history" is required' },
      { status: 400 }
    );
  }

  const conids = conidsParam.split(',').map((id) => parseInt(id.trim(), 10));

  try {
    const snapshots = await getMarketDataSnapshot(conids);
    return NextResponse.json(snapshots);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Snapshot fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
