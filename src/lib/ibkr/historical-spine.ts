import { getChartTimeframe, type ChartTimeframe } from './chart-presets.ts';
import type { HistoricalBar } from './types.ts';

export interface HistoricalSpineSource {
  historyBars: HistoricalBar[];
  requestBar: string | null;
  fetchedAt?: number;
  timeframeKey?: string;
}

interface PrioritizedSource extends HistoricalSpineSource {
  barSecs: number;
  spanMs: number;
}

const BAR_SECS: Record<string, number> = {
  '1min': 60,
  '5min': 5 * 60,
  '15min': 15 * 60,
  '30min': 30 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
};

export function buildHistoricalSpine(
  sources: HistoricalSpineSource[]
): HistoricalBar[] {
  const prioritized = sources
    .map((source) => prioritizeSource(source))
    .filter((source): source is PrioritizedSource => source != null)
    .sort(compareSources);

  if (prioritized.length === 0) {
    return [];
  }

  const coveredRanges: Array<[number, number]> = [];
  const barsByTime = new Map<number, HistoricalBar>();

  for (const source of prioritized) {
    const bars = [...source.historyBars].sort((left, right) => left.time - right.time);
    const keptBars = bars.filter((bar) => !isCovered(bar.time, coveredRanges));
    if (keptBars.length === 0) {
      continue;
    }

    for (const bar of keptBars) {
      if (!barsByTime.has(bar.time)) {
        barsByTime.set(bar.time, bar);
      }
    }

    const firstTime = keptBars[0]?.time ?? bars[0]?.time;
    const lastTime = keptBars[keptBars.length - 1]?.time ?? bars[bars.length - 1]?.time;
    if (firstTime != null && lastTime != null && lastTime >= firstTime) {
      coveredRanges.push([firstTime, lastTime]);
      normalizeRanges(coveredRanges);
    }
  }

  return Array.from(barsByTime.values()).sort((left, right) => left.time - right.time);
}

export function sliceHistoricalSpineForTimeframe(
  spine: HistoricalBar[],
  timeframe: ChartTimeframe
): HistoricalBar[] {
  if (spine.length === 0) {
    return [];
  }

  const sorted = [...spine].sort((left, right) => left.time - right.time);
  const lastTime = sorted[sorted.length - 1]?.time ?? 0;
  if (lastTime <= 0) {
    return [];
  }

  const windowStartMs = lastTime - timeframe.windowSecs * 1000;
  const visibleBars = sorted.filter((bar) => bar.time >= windowStartMs);
  const previousIndex = sorted.findLastIndex((bar) => bar.time < windowStartMs);
  const previousBar = previousIndex >= 0 ? sorted[previousIndex] : null;

  if (!previousBar) {
    return visibleBars;
  }

  return [previousBar, ...visibleBars];
}

export function hasSufficientSpineCoverageForTimeframe(
  spine: HistoricalBar[],
  timeframeKey: string
): boolean {
  const timeframe = getChartTimeframe(timeframeKey);
  const slice = sliceHistoricalSpineForTimeframe(spine, timeframe);
  if (slice.length === 0) {
    return false;
  }

  const firstVisibleIndex = slice.length > 1 ? 1 : 0;
  const firstVisible = slice[firstVisibleIndex]?.time ?? slice[0]?.time ?? 0;
  const last = slice[slice.length - 1]?.time ?? 0;
  if (last <= 0 || firstVisible <= 0 || last <= firstVisible) {
    return false;
  }

  const coveredMs = last - firstVisible;
  return coveredMs >= Math.max(0, timeframe.windowSecs * 1000 * 0.9);
}

function prioritizeSource(
  source: HistoricalSpineSource
): PrioritizedSource | null {
  if (!Array.isArray(source.historyBars) || source.historyBars.length === 0) {
    return null;
  }

  const bars = source.historyBars
    .filter((bar) => isFiniteBar(bar))
    .sort((left, right) => left.time - right.time);
  if (bars.length === 0) {
    return null;
  }

  const firstTime = bars[0]?.time ?? 0;
  const lastTime = bars[bars.length - 1]?.time ?? 0;
  return {
    ...source,
    historyBars: bars,
    barSecs: getRequestBarSecs(source.requestBar),
    spanMs: Math.max(0, lastTime - firstTime),
  };
}

function compareSources(
  left: PrioritizedSource,
  right: PrioritizedSource
): number {
  if (left.barSecs !== right.barSecs) {
    return left.barSecs - right.barSecs;
  }

  if (left.spanMs !== right.spanMs) {
    return right.spanMs - left.spanMs;
  }

  return (right.fetchedAt ?? 0) - (left.fetchedAt ?? 0);
}

function getRequestBarSecs(requestBar: string | null): number {
  if (!requestBar) {
    return Number.MAX_SAFE_INTEGER;
  }
  return BAR_SECS[requestBar] ?? Number.MAX_SAFE_INTEGER;
}

function isCovered(time: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => time >= start && time <= end);
}

function normalizeRanges(ranges: Array<[number, number]>): void {
  ranges.sort((left, right) => left[0] - right[0]);

  let index = 0;
  while (index < ranges.length - 1) {
    const current = ranges[index];
    const next = ranges[index + 1];

    if (current[1] >= next[0]) {
      current[1] = Math.max(current[1], next[1]);
      ranges.splice(index + 1, 1);
      continue;
    }

    index += 1;
  }
}

function isFiniteBar(bar: HistoricalBar | null | undefined): bar is HistoricalBar {
  return Boolean(
    bar &&
      Number.isFinite(bar.time) &&
      Number.isFinite(bar.open) &&
      Number.isFinite(bar.high) &&
      Number.isFinite(bar.low) &&
      Number.isFinite(bar.close) &&
      Number.isFinite(bar.volume)
  );
}
