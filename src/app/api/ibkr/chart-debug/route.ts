import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataSnapshot, getHistoricalData } from '@/lib/ibkr/client';
import { analyzeChartFeed, type ChartDebugSample } from '@/lib/ibkr/chart-debug';
import {
  getChartResolution,
  getChartTimeframe,
  getHistoryRequestsForTimeframe,
} from '@/lib/ibkr/chart-presets';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conidParam = searchParams.get('conid');
  if (!conidParam) {
    return NextResponse.json({ error: 'Query parameter "conid" is required' }, { status: 400 });
  }

  const conid = parseInt(conidParam, 10);
  const timeframe = getChartTimeframe(searchParams.get('timeframe') || '5m');
  const resolution = getChartResolution(searchParams.get('resolution') || timeframe.defaultResolutionKey);
  const samplesCount = Math.min(
    Math.max(parseInt(searchParams.get('samples') || '6', 10), 2),
    12
  );
  const sampleMs = Math.min(
    Math.max(parseInt(searchParams.get('sampleMs') || '1000', 10), 250),
    5000
  );
  const outsideRth = searchParams.get('outsideRth') !== 'false';

  try {
    const [samples, historyBars] = await Promise.all([
      collectSnapshotSamples(conid, samplesCount, sampleMs),
      loadHistory(conid, timeframe, resolution.key, outsideRth),
    ]);

    return NextResponse.json({
      conid,
      timeframe: timeframe.key,
      resolution: resolution.key,
      samples,
      historyBars: {
        count: historyBars.length,
        firstTime: historyBars[0]?.time ?? null,
        lastTime: historyBars[historyBars.length - 1]?.time ?? null,
      },
      analysis: analyzeChartFeed({
        samples,
        historyBars,
        timeframe,
        resolution,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chart debug failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function collectSnapshotSamples(
  conid: number,
  samplesCount: number,
  sampleMs: number
): Promise<ChartDebugSample[]> {
  const samples: ChartDebugSample[] = [];

  for (let index = 0; index < samplesCount; index += 1) {
    const snapshot = (await getMarketDataSnapshot([conid]))[0];
    if (snapshot) {
      samples.push({
        capturedAt: Date.now(),
        updated: snapshot.updated,
        last: snapshot.last,
        displayPrice: snapshot.displayPrice,
        displaySource: snapshot.displaySource,
        bid: snapshot.bid,
        ask: snapshot.ask,
        marketDataStatus: snapshot.marketDataStatus,
        mdAvailability: snapshot.mdAvailability,
      });
    }

    if (index < samplesCount - 1) {
      await delay(sampleMs);
    }
  }

  return samples;
}

async function loadHistory(
  conid: number,
  timeframe: ReturnType<typeof getChartTimeframe>,
  resolutionKey: string,
  outsideRth: boolean
) {
  const requests = getHistoryRequestsForTimeframe(timeframe, resolutionKey);
  let lastError: string | null = null;

  for (const req of requests) {
    try {
      const bars = await getHistoricalData(conid, req.period, req.bar, outsideRth);
      if (bars.length > 0) {
        return bars;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'History fetch failed';
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }

  return [];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
