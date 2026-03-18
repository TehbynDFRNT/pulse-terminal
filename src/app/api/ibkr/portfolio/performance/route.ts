import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioPerformance } from '@/lib/ibkr/client';
import {
  getPortfolioPerformanceTimeframe,
  toPortfolioPerformanceBars,
} from '@/lib/ibkr/portfolio-performance';
import type { PortfolioPerformanceResponse } from '@/lib/ibkr/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const timeframeKey = request.nextUrl.searchParams.get('timeframe') || '1M';
  const timeframe = getPortfolioPerformanceTimeframe(timeframeKey);

  try {
    const performance = await getPortfolioPerformance(timeframe.performancePeriod);
    const payload: PortfolioPerformanceResponse = {
      ...performance,
      points: toPortfolioPerformanceBars(
        performance.points,
        timeframe
      ).map((bar) => ({
        time: bar.time,
        value: bar.close,
      })),
      snapshot: performance.snapshot,
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Portfolio performance failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
