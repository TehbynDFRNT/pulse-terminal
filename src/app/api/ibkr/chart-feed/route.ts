import { NextRequest, NextResponse } from 'next/server';
import {
  getChartPreset,
  getHistoryRequestsForTimeframe,
} from '@/lib/ibkr/chart-presets';
import {
  getHistoryCoverageRatio,
  hasSufficientHistoryCoverage,
} from '@/lib/ibkr/history-coverage';
import {
  getHistoricalData,
  getMarketDataSnapshot,
  IbkrRequestError,
} from '@/lib/ibkr/client';
import {
  getChartBootstrapEntriesForConid,
  setChartBootstrapEntry,
} from '@/lib/ibkr/chart-bootstrap-store';
import {
  ensureLiveFeedDaemon,
  getLiveFeedSeedBeats,
  registerTrackedConids,
} from '@/lib/ibkr/live-feed-store';
import { loadWatchlistState, mergeWatchlistSnapshots } from '@/lib/ibkr/watchlist-state';
import {
  buildHistoricalSpine,
  sliceHistoricalSpineForTimeframe,
} from '@/lib/ibkr/historical-spine';
import type { ChartBootstrapResponse, MarketDataSnapshot } from '@/lib/ibkr/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = request.nextUrl;
  const conidParam = searchParams.get('conid');
  const timeframeKey = searchParams.get('timeframe') || '5m';
  const resolutionKey = searchParams.get('resolution') || undefined;
  const outsideRth = searchParams.get('outsideRth') !== 'false';

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

  const preset = getChartPreset(timeframeKey);
  const cachedSnapshotPromise = loadCachedSnapshot(conid);
  await registerTrackedConids([conid]);
  await ensureLiveFeedDaemon();
  const snapshotPromise = loadSnapshot(conid, cachedSnapshotPromise);
  const historyResult =
    (await loadPrewarmedHistory(conid, preset)) ??
    (await loadHistoryWithFallback(conid, preset, outsideRth));
  const [snapshot, liveBeats] = await Promise.all([
    snapshotPromise,
    getLiveFeedSeedBeats(conid, preset.windowSecs * 1000),
  ]);

  const payload: ChartBootstrapResponse = {
    conid,
    timeframeKey: preset.key,
    resolutionKey: resolutionKey ?? preset.defaultResolutionKey,
    historyBars: historyResult.bars,
    snapshot,
    liveBeats,
    historyError: historyResult.error,
  };

  if (process.env.NODE_ENV === 'development') {
    console.info('[chart-feed]', {
      conid,
      timeframeKey: payload.timeframeKey,
      resolutionKey: payload.resolutionKey,
      outsideRth,
      historyBars: payload.historyBars.length,
      historyError: payload.historyError ?? null,
      snapshotPrice: payload.snapshot?.displayPrice ?? payload.snapshot?.last ?? null,
      snapshotStatus: payload.snapshot?.marketDataStatus ?? null,
      snapshotUpdated: payload.snapshot?.updated ?? null,
      liveBeats: payload.liveBeats?.length ?? 0,
      historySource: historyResult.source,
      durationMs: Date.now() - startedAt,
      expected: {
        historyOnlyBackfillsLeftSide: true,
        liveSeedAvailableWhenSnapshotExists: Boolean(payload.snapshot),
      },
    });
  }

  return NextResponse.json(payload);
}

async function loadSnapshot(
  conid: number,
  cachedSnapshotPromise: Promise<MarketDataSnapshot | null>
): Promise<MarketDataSnapshot | null> {
  try {
    const snapshots = await getMarketDataSnapshot([conid]);
    const snapshot = snapshots[0] ?? null;
    if (snapshot) {
      await mergeWatchlistSnapshots([snapshot]);
    }
    return snapshot;
  } catch {
    return cachedSnapshotPromise;
  }
}

async function loadCachedSnapshot(conid: number): Promise<MarketDataSnapshot | null> {
  try {
    const state = await loadWatchlistState();
    return state.prices?.find((snapshot) => snapshot.conid === conid) ?? null;
  } catch {
    return null;
  }
}

async function loadPrewarmedHistory(
  conid: number,
  preset: ReturnType<typeof getChartPreset>
) {
  const cachedEntries = await getChartBootstrapEntriesForConid(conid);
  if (cachedEntries.length === 0) {
    return null;
  }

  const spine = buildHistoricalSpine(
    cachedEntries.map((entry) => ({
      historyBars: entry.historyBars,
      requestBar: entry.requestBar,
      fetchedAt: entry.fetchedAt,
      timeframeKey: entry.timeframeKey,
    }))
  );
  const sliced = sliceHistoricalSpineForTimeframe(spine, preset);
  const requestBar = inferRequestBarForSlice(cachedEntries, sliced) ?? '1min';

  if (!hasSufficientHistoryCoverage(sliced, preset, requestBar)) {
    return null;
  }

  return {
    bars: sliced,
    error: null,
    source: 'daemon-spine' as const,
  };
}

function inferRequestBarForSlice(
  entries: Awaited<ReturnType<typeof getChartBootstrapEntriesForConid>>,
  slicedBars: ChartBootstrapResponse['historyBars']
): string | null {
  if (slicedBars.length === 0) {
    return null;
  }

  const startTime = slicedBars[0]?.time ?? 0;
  const endTime = slicedBars[slicedBars.length - 1]?.time ?? 0;
  const covering = entries.filter((entry) => {
    const first = entry.historyBars[0]?.time ?? Number.POSITIVE_INFINITY;
    const last =
      entry.historyBars[entry.historyBars.length - 1]?.time ??
      Number.NEGATIVE_INFINITY;
    return first <= endTime && last >= startTime;
  });

  const barRank: Record<string, number> = {
    '1min': 1,
    '5min': 2,
    '15min': 3,
    '30min': 4,
    '1h': 5,
    '4h': 6,
    '1d': 7,
    '1w': 8,
  };

  return covering
    .map((entry) => entry.requestBar)
    .filter((requestBar): requestBar is string => Boolean(requestBar))
    .sort((left, right) => (barRank[left] ?? Number.MAX_SAFE_INTEGER) - (barRank[right] ?? Number.MAX_SAFE_INTEGER))[0] ?? null;
}

async function loadHistoryWithFallback(
  conid: number,
  preset: ReturnType<typeof getChartPreset>,
  outsideRth: boolean
) {
  const requests = getHistoryRequestsForTimeframe(preset);
  let lastError: string | null = null;
  let bestBars: ChartBootstrapResponse['historyBars'] = [];
  let bestCoverageRatio = 0;
  let bestRequest: { period: string; bar: string } | null = null;

  for (const request of requests) {
    try {
      const bars = await getHistoricalData(
        conid,
        request.period,
        request.bar,
        outsideRth
      );
      if (bars.length > 0) {
        const coverageRatio = getHistoryCoverageRatio(bars, preset, request.bar);
        if (coverageRatio > bestCoverageRatio) {
          bestBars = bars;
          bestCoverageRatio = coverageRatio;
          bestRequest = request;
        }

        if (hasSufficientHistoryCoverage(bars, preset, request.bar)) {
          await setChartBootstrapEntry({
            conid,
            timeframeKey: preset.key,
            historyBars: bars,
            historyError: null,
            fetchedAt: Date.now(),
            requestPeriod: request.period,
            requestBar: request.bar,
            coverageRatio,
          });
          return {
            bars,
            error: null as string | null,
            source: 'live-fetch' as const,
          };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'History fetch failed';
      lastError = message;
      if (!isNonFatalHistoryError(error)) {
        break;
      }
    }
  }

  await setChartBootstrapEntry({
    conid,
    timeframeKey: preset.key,
    historyBars: bestBars,
    historyError:
      bestBars.length > 0 && lastError == null && bestCoverageRatio > 0
        ? 'Available history does not cover the full requested window'
        : lastError,
    fetchedAt: Date.now(),
    requestPeriod: bestRequest?.period ?? null,
    requestBar: bestRequest?.bar ?? null,
    coverageRatio: bestCoverageRatio > 0 ? bestCoverageRatio : null,
  });

  return {
    bars: bestBars,
    error:
      bestBars.length > 0 && lastError == null && bestCoverageRatio > 0
        ? 'Available history does not cover the full requested window'
        : lastError,
    source: 'live-fetch' as const,
  };
}

function isNonFatalHistoryError(error: unknown): boolean {
  if (error instanceof IbkrRequestError) {
    if (error.status === 503 || error.status === 504) return true;
    const message = error.responseText.toLowerCase();
    return (
      message.includes('service unavailable') ||
      message.includes('no data') ||
      message.includes('no historical data') ||
      message.includes('outside of data farm')
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('temporarily unavailable') ||
      message.includes('timed out') ||
      message.includes('service unavailable') ||
      message.includes('no data') ||
      message.includes('no historical data')
    );
  }

  return false;
}
