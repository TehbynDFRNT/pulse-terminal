import type { ChartTimeframe } from './chart-presets';
import type { HistoricalBar } from './types';

const MEDIUM_WINDOW_THRESHOLD_SECS = 24 * 60 * 60;
const LONG_WINDOW_THRESHOLD_SECS = 30 * 24 * 60 * 60;
const MIN_MEDIUM_WINDOW_COVERAGE_RATIO = 0.9;
const MIN_LONG_WINDOW_COVERAGE_RATIO = 0.8;

const REQUEST_BAR_SECS: Record<string, number> = {
  '1min': 60,
  '5min': 5 * 60,
  '15min': 15 * 60,
  '30min': 30 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
};

export function getHistoryCoverageRatio(
  bars: HistoricalBar[],
  timeframe: ChartTimeframe,
  requestBar: string
): number {
  if (bars.length === 0) return 0;

  const firstSecs = Math.floor(bars[0].time / 1000);
  const lastSecs = Math.floor(bars[bars.length - 1].time / 1000);
  const barSecs = estimateBarSecs(bars, requestBar);
  const coveredWindowSecs = Math.max(0, lastSecs - firstSecs) + barSecs;

  return coveredWindowSecs / timeframe.windowSecs;
}

export function hasSufficientHistoryCoverage(
  bars: HistoricalBar[],
  timeframe: ChartTimeframe,
  requestBar: string
): boolean {
  if (bars.length === 0) return false;
  const coverageRatio = getHistoryCoverageRatio(bars, timeframe, requestBar);

  if (timeframe.windowSecs < MEDIUM_WINDOW_THRESHOLD_SECS) return true;
  if (timeframe.windowSecs < LONG_WINDOW_THRESHOLD_SECS) {
    return coverageRatio >= MIN_MEDIUM_WINDOW_COVERAGE_RATIO;
  }

  return coverageRatio >= MIN_LONG_WINDOW_COVERAGE_RATIO;
}

function estimateBarSecs(bars: HistoricalBar[], requestBar: string): number {
  for (let index = 1; index < bars.length; index += 1) {
    const diffSecs = Math.round((bars[index].time - bars[index - 1].time) / 1000);
    if (diffSecs > 0) return diffSecs;
  }

  return REQUEST_BAR_SECS[requestBar] ?? 0;
}
