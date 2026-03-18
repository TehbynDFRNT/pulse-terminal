import { NextRequest, NextResponse } from 'next/server';
import { getChartBootstrapEntriesForConid } from '@/lib/ibkr/chart-bootstrap-store';
import { CHART_TIMEFRAMES } from '@/lib/ibkr/chart-presets';
import {
  buildHistoricalSpine,
  hasSufficientSpineCoverageForTimeframe,
  sliceHistoricalSpineForTimeframe,
} from '@/lib/ibkr/historical-spine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conidParam = searchParams.get('conid');

  if (!conidParam) {
    return NextResponse.json(
      { error: 'Query parameter "conid" is required' },
      { status: 400 }
    );
  }

  const conid = Number.parseInt(conidParam, 10);
  if (!Number.isFinite(conid) || conid <= 0) {
    return NextResponse.json({ error: 'Invalid conid' }, { status: 400 });
  }

  const entries = await getChartBootstrapEntriesForConid(conid);
  const spine = buildHistoricalSpine(
    entries.map((entry) => ({
      historyBars: entry.historyBars,
      requestBar: entry.requestBar,
      fetchedAt: entry.fetchedAt,
      timeframeKey: entry.timeframeKey,
    }))
  );
  const latestFetchedAt = entries.reduce(
    (max, entry) => Math.max(max, entry.fetchedAt),
    0
  );
  const normalizedEntries = CHART_TIMEFRAMES.map((timeframe) => {
    const hasCoverage = hasSufficientSpineCoverageForTimeframe(spine, timeframe.key);
    const historyBars = hasCoverage
      ? sliceHistoricalSpineForTimeframe(spine, timeframe)
      : [];
    return {
      timeframeKey: timeframe.key,
      historyBars,
      historyError:
        hasCoverage ? null : 'Available history does not cover the full requested window',
      fetchedAt: latestFetchedAt,
    };
  }).filter((entry) => entry.historyBars.length > 0);

  return NextResponse.json({
    conid,
    entries: normalizedEntries,
  });
}
