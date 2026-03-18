import { buildHistoricalBucketedLinePoints } from './chart-series.ts';
import type { ChartResolution, ChartTimeframe } from './chart-presets.ts';
import type { HistoricalBar, MarketDataSnapshot } from './types.ts';

export interface ChartDebugSample {
  capturedAt: number;
  updated: number;
  last: number;
  displayPrice: number;
  displaySource: MarketDataSnapshot['displaySource'];
  bid: number;
  ask: number;
  marketDataStatus: MarketDataSnapshot['marketDataStatus'];
  mdAvailability: string;
}

export interface ChartDebugAnalysis {
  midpointChanges: number;
  lastTradeChanges: number;
  sampleCadenceMs: number[];
  sampleRange: number;
  visibleRange: number;
  sampleRangeShare: number;
  historyBarSecs: number;
  resolutionBucketSecs: number;
  historyDominatesShortWindow: boolean;
  midpointLikelyChangingEachSample: boolean;
  assumptions: {
    midpointNotChangingEverySecond: boolean;
    moveTooSmallForVisibleRange: boolean;
    minuteBackfillDominating: boolean;
  };
}

export function analyzeChartFeed(params: {
  samples: ChartDebugSample[];
  historyBars: HistoricalBar[];
  timeframe: ChartTimeframe;
  resolution: ChartResolution;
}): ChartDebugAnalysis {
  const { samples, historyBars, timeframe, resolution } = params;
  const midpointChanges = countChanges(samples.map((sample) => sample.displayPrice));
  const lastTradeChanges = countChanges(samples.map((sample) => sample.last));
  const sampleCadenceMs = getCadence(samples.map((sample) => sample.updated || sample.capturedAt));

  const sampleValues = samples
    .map((sample) => sample.displayPrice)
    .filter((value) => Number.isFinite(value) && value > 0);
  const sampleMin = sampleValues.length > 0 ? Math.min(...sampleValues) : 0;
  const sampleMax = sampleValues.length > 0 ? Math.max(...sampleValues) : 0;
  const sampleRange = sampleValues.length > 1 ? sampleMax - sampleMin : 0;

  const linePoints = buildHistoricalBucketedLinePoints(
    historyBars,
    timeframe.windowSecs,
    resolution.bucketSecs
  );
  const visibleValues = linePoints
    .map((point) => point.value)
    .concat(sampleValues)
    .filter((value) => Number.isFinite(value) && value > 0);
  const visibleMin = visibleValues.length > 0 ? Math.min(...visibleValues) : 0;
  const visibleMax = visibleValues.length > 0 ? Math.max(...visibleValues) : 0;
  const visibleRange = visibleValues.length > 1 ? visibleMax - visibleMin : 0;
  const sampleRangeShare =
    visibleRange > 0 && sampleRange > 0 ? sampleRange / visibleRange : 0;

  const historyBarSecs = inferHistoryBarSecs(historyBars);
  const midpointLikelyChangingEachSample =
    samples.length > 1 && midpointChanges >= samples.length - 2;

  return {
    midpointChanges,
    lastTradeChanges,
    sampleCadenceMs,
    sampleRange,
    visibleRange,
    sampleRangeShare,
    historyBarSecs,
    resolutionBucketSecs: resolution.bucketSecs,
    historyDominatesShortWindow: historyBarSecs > resolution.bucketSecs,
    midpointLikelyChangingEachSample,
    assumptions: {
      midpointNotChangingEverySecond: !midpointLikelyChangingEachSample,
      moveTooSmallForVisibleRange:
        sampleRange > 0 && visibleRange > 0 && sampleRangeShare < 0.05,
      minuteBackfillDominating: historyBarSecs > resolution.bucketSecs,
    },
  };
}

function countChanges(values: number[]): number {
  let changes = 0;
  let previous: number | null = null;

  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    if (previous != null && value !== previous) {
      changes += 1;
    }
    previous = value;
  }

  return changes;
}

function getCadence(times: number[]): number[] {
  const cadence: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    const diff = times[index] - times[index - 1];
    if (Number.isFinite(diff) && diff > 0) {
      cadence.push(diff);
    }
  }
  return cadence;
}

function inferHistoryBarSecs(bars: HistoricalBar[]): number {
  for (let index = 1; index < bars.length; index += 1) {
    const diffSecs = Math.round((bars[index].time - bars[index - 1].time) / 1000);
    if (diffSecs > 0) return diffSecs;
  }
  return 0;
}
