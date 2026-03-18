import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataSnapshot, getHistoricalData } from '@/lib/ibkr/client';
import { getChartPreset, getHistoryRequestsForTimeframe } from '@/lib/ibkr/chart-presets';
import { mergeWatchlistSnapshots } from '@/lib/ibkr/watchlist-state';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conidsParam = searchParams.get('conids');
  const historyConid = searchParams.get('history');

  // Historical data request
  if (historyConid) {
    const period = searchParams.get('period') || '1d';
    const bar = searchParams.get('bar') || '5min';
    const presetKey = searchParams.get('preset');
    const resolutionKey = searchParams.get('resolution') || undefined;
    const outsideRth = searchParams.get('outsideRth') !== 'false';
    const conid = parseInt(historyConid, 10);

    try {
      if (presetKey) {
        const preset = getChartPreset(presetKey);
        const requests = getHistoryRequestsForTimeframe(preset, resolutionKey);
        let lastError: string | null = null;

        for (const request of requests) {
          try {
            const bars = await getHistoricalData(
              conid,
              request.period,
              request.bar,
              outsideRth
            );
            if (bars.length > 0) {
              return NextResponse.json(bars);
            }
          } catch (err) {
            lastError = err instanceof Error ? err.message : 'History fetch failed';
          }
        }

        if (isNonFatalHistoryError(lastError)) {
          return NextResponse.json([]);
        }

        return NextResponse.json(
          { error: lastError || 'History fetch failed' },
          { status: 502 }
        );
      }

      const bars = await getHistoricalData(conid, period, bar, outsideRth);
      return NextResponse.json(bars);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'History fetch failed';
      if (isNonFatalHistoryError(message)) {
        return NextResponse.json([]);
      }
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
    await mergeWatchlistSnapshots(snapshots);
    return NextResponse.json(snapshots);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Snapshot fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function isNonFatalHistoryError(message: string | null | undefined): boolean {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('temporarily unavailable') ||
    normalized.includes('timed out') ||
    normalized.includes('service unavailable') ||
    normalized.includes('no data') ||
    normalized.includes('no historical data') ||
    normalized.includes('not found') ||
    normalized.includes('outside of data farm') ||
    normalized.includes('no market data permissions')
  );
}
