import type { ChartResolution, ChartTimeframe } from './chart-presets';
import type {
  AccountSummary,
  HistoricalBar,
  PortfolioPerformancePoint,
  Position,
} from './types';

export interface PortfolioPerformanceTimeframe extends ChartTimeframe {
  performancePeriod: string;
}

export interface PortfolioLivePrice {
  displayPrice: number;
  last: number;
  updated: number;
}

export const PORTFOLIO_PERFORMANCE_TIMEFRAMES: PortfolioPerformanceTimeframe[] = [
  {
    key: '1W',
    label: '1W',
    windowSecs: 7 * 24 * 60 * 60,
    defaultResolutionKey: '1h',
    resolutionKeys: ['1h', '4h', '1D'],
    performancePeriod: '7D',
    requests: [],
  },
  {
    key: '1M',
    label: '1M',
    windowSecs: 30 * 24 * 60 * 60,
    defaultResolutionKey: '4h',
    resolutionKeys: ['4h', '1D'],
    performancePeriod: '1M',
    requests: [],
  },
  {
    key: '3M',
    label: '3M',
    windowSecs: 90 * 24 * 60 * 60,
    defaultResolutionKey: '1D',
    resolutionKeys: ['1D'],
    performancePeriod: '1Y',
    requests: [],
  },
  {
    key: '1Y',
    label: '1Y',
    windowSecs: 365 * 24 * 60 * 60,
    defaultResolutionKey: '1D',
    resolutionKeys: ['1D'],
    performancePeriod: '1Y',
    requests: [],
  },
];

export function getPortfolioPerformanceTimeframe(
  key?: string
): PortfolioPerformanceTimeframe {
  return (
    PORTFOLIO_PERFORMANCE_TIMEFRAMES.find((timeframe) => timeframe.key === key) ??
    PORTFOLIO_PERFORMANCE_TIMEFRAMES[1]
  );
}

export function toPortfolioPerformanceBars(
  points: PortfolioPerformancePoint[],
  timeframe: PortfolioPerformanceTimeframe
): HistoricalBar[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort((left, right) => left.time - right.time);
  const latestTime = sorted[sorted.length - 1]?.time ?? 0;
  const startTime = latestTime - timeframe.windowSecs * 1000;

  return sorted
    .filter((point) => point.time >= startTime)
    .map((point, index, visible) => {
      const previousValue =
        visible[index - 1]?.value ?? point.value;
      const nextValue = visible[index + 1]?.value ?? point.value;
      return {
        time: point.time,
        open: previousValue,
        high: Math.max(previousValue, point.value, nextValue),
        low: Math.min(previousValue, point.value, nextValue),
        close: point.value,
        volume: 0,
      };
    });
}

export function computePortfolioLiveValue(params: {
  baseCurrency: string;
  summary: AccountSummary | null;
  positions: Position[];
  prices: Map<number, PortfolioLivePrice>;
}): number {
  const { baseCurrency, summary, positions, prices } = params;
  if (!summary) return 0;
  if (positions.length === 0) return summary.netLiquidity;

  const adjustedGross = positions.reduce((total, position) => {
    const stream = prices.get(position.conid);
    const livePrice = stream?.displayPrice || stream?.last || 0;

    if (position.currency !== baseCurrency || !(livePrice > 0)) {
      return total + position.marketValue;
    }

    const adjustedMarketValue =
      position.marketValue +
      position.position * (livePrice - position.marketPrice);

    return total + adjustedMarketValue;
  }, 0);

  return summary.totalCash + adjustedGross;
}

export function getPortfolioPerformanceResolution(
  timeframe: PortfolioPerformanceTimeframe,
  getChartResolution: (key?: string) => ChartResolution
): ChartResolution {
  return getChartResolution(timeframe.defaultResolutionKey);
}
