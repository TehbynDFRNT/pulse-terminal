import type { CandlePoint as LivelineCandlePoint, LivelinePoint } from 'liveline';
import {
  alignToBucket,
  buildFlatWindowLinePoints,
  buildHistoricalBucketedLinePoints,
  buildHistoricalBucketedLinePointsForFullSpan,
  getBucketEndTime,
  normalizeLinePoints,
  syncLiveLinePoint,
  sortBars,
} from './chart-series.ts';
import type { ChartResolution, ChartTimeframe } from './chart-presets.ts';
import type { HistoricalBar } from './types.ts';

const MAX_LINE_POINTS = 5000;
const MAX_CANDLES = 2000;
const MAX_LIVE_SEGMENT_GAP_MS = 15_000;

export interface LiveBeatInput {
  value: number;
  updatedMs: number;
  source: 'mid' | 'last' | 'bid' | 'ask' | 'none';
}

export interface LiveBeatSeriesInput extends LiveBeatInput {}

export interface LivelineHistorySeed {
  line: LivelinePoint[];
  candles: LivelineCandlePoint[];
  lastValue: number;
  sourceBarSecs: number;
}

export interface LivelineFeedState {
  line: LivelinePoint[];
  candles: LivelineCandlePoint[];
  liveCandle: LivelineCandlePoint | null;
  value: number;
  latestMarketTime: number | null;
}

export function buildHistorySeed(
  bars: HistoricalBar[],
  timeframe: ChartTimeframe,
  resolution: ChartResolution
): LivelineHistorySeed {
  const sorted = sortBars(bars);
  if (sorted.length === 0) {
    return {
      line: [],
      candles: [],
      lastValue: 0,
      sourceBarSecs: resolution.bucketSecs,
    };
  }

  const sourceBarSecs = getSourceBarSecs(sorted);
  const line = buildHistoricalBucketedLinePointsForFullSpan(
    sorted,
    resolution.bucketSecs,
    MAX_LINE_POINTS
  );
  const candles = buildCandlesFromBars(
    sorted,
    timeframe.windowSecs,
    resolution.bucketSecs,
    sourceBarSecs
  );

  return {
    line,
    candles,
    lastValue: line[line.length - 1]?.value ?? sorted[sorted.length - 1]?.close ?? 0,
    sourceBarSecs,
  };
}

export function buildLivelineFeed(params: {
  seed: LivelineHistorySeed;
  mode: 'line' | 'candle';
  liveBeat: LiveBeatInput | null;
  liveBeats?: LiveBeatSeriesInput[];
  nowMs: number;
  marketOpen: boolean;
  hasLiveFeed: boolean;
  timeframe: ChartTimeframe;
  resolution: ChartResolution;
}): LivelineFeedState {
  const {
    seed,
    mode,
    liveBeat,
    liveBeats = [],
    nowMs,
    marketOpen,
    hasLiveFeed,
    timeframe,
    resolution,
  } = params;

  const liveValue = liveBeat?.value ?? seed.lastValue;
  const contiguousLiveBeats = getContiguousRecentLiveBeats(liveBeats);
  const beatBucketTime =
    liveBeat && liveBeat.value > 0
      ? alignToBucket(Math.floor(liveBeat.updatedMs / 1000), resolution.bucketSecs)
      : null;
  const nowBucketTime = alignToBucket(
    Math.floor(nowMs / 1000),
    resolution.bucketSecs
  );
  const latestCommittedBeatTime =
    contiguousLiveBeats.length > 0
      ? alignToBucket(
          Math.floor(
            contiguousLiveBeats[contiguousLiveBeats.length - 1].updatedMs / 1000
          ),
          resolution.bucketSecs
        )
      : null;
  const liveHeadBucketTime = beatBucketTime ?? latestCommittedBeatTime;
  const visibleEndTime = liveHeadBucketTime ?? nowBucketTime;
  const visibleStart = visibleEndTime - timeframe.windowSecs + resolution.bucketSecs;

  if (mode === 'line') {
    let line = normalizeLinePoints(seed.line, MAX_LINE_POINTS);

    if (marketOpen && hasLiveFeed && liveValue > 0) {
      const livePoints = buildLivePoints(
        contiguousLiveBeats,
        resolution.bucketSecs,
        visibleStart,
        liveHeadBucketTime ?? nowBucketTime
      );
      const liveHeadTime = liveHeadBucketTime ?? nowBucketTime;
      const firstLiveTime = livePoints[0]?.time ?? null;
      const needsCoarseHistoryHandoff = seed.sourceBarSecs > resolution.bucketSecs;
      const liveCoverageSecs =
        firstLiveTime != null
          ? liveHeadTime - firstLiveTime + resolution.bucketSecs
          : 0;
      const hasFullLiveCoverage =
        liveCoverageSecs >= seed.sourceBarSecs;
      const coarseLiveWindowStart =
        needsCoarseHistoryHandoff && hasFullLiveCoverage
          ? Math.max(
              visibleStart,
              liveHeadTime - seed.sourceBarSecs + resolution.bucketSecs
            )
          : firstLiveTime ?? liveHeadTime;
      const liveBoundary = Math.max(
        visibleStart,
        firstLiveTime != null
          ? Math.min(firstLiveTime, coarseLiveWindowStart)
          : coarseLiveWindowStart
      );
      const historyPrefix = normalizeLinePoints(
        line.filter((point) => point.time < liveBoundary),
        MAX_LINE_POINTS
      );
      const historyTail = historyPrefix[historyPrefix.length - 1] ?? null;
      const firstLivePoint = livePoints[0] ?? null;
      const bridgeValue =
        historyTail?.value ??
        firstLivePoint?.value ??
        liveValue;
      const liveBridgePoint =
        liveBoundary >= visibleStart &&
        (!historyTail || historyTail.time < liveBoundary) &&
        (!firstLivePoint || firstLivePoint.time > liveBoundary)
          ? [{ time: liveBoundary, value: bridgeValue }]
          : [];
      line = normalizeLinePoints(
        [...historyPrefix, ...liveBridgePoint, ...livePoints],
        MAX_LINE_POINTS
      );

      if (line.length === 0 && liveValue > 0) {
        const anchorBucket = liveHeadTime;
        line = buildFlatWindowLinePoints(
          anchorBucket,
          timeframe.windowSecs,
          resolution.bucketSecs,
          liveValue,
          MAX_LINE_POINTS
        );
      }

      if (liveHeadTime >= visibleStart) {
        line = syncLiveLinePoint(
          line,
          liveHeadTime,
          resolution.bucketSecs,
          liveValue,
          timeframe.windowSecs,
          MAX_LINE_POINTS
        );
      }
    } else if (line.length === 0 && liveValue > 0) {
      const anchorBucket = liveHeadBucketTime ?? nowBucketTime;
      line = buildFlatWindowLinePoints(
        anchorBucket,
        timeframe.windowSecs,
        resolution.bucketSecs,
        liveValue,
        MAX_LINE_POINTS
      );
    }

    return {
      line,
      candles: seed.candles,
      liveCandle: null,
      value: liveValue > 0 ? liveValue : line[line.length - 1]?.value ?? 0,
      latestMarketTime:
        (liveBeat ? Math.floor(liveBeat.updatedMs / 1000) : line[line.length - 1]?.time ?? beatBucketTime ?? null),
    };
  }

  const candles = seed.candles;
  if (!marketOpen || !hasLiveFeed || liveValue <= 0) {
    const close = candles[candles.length - 1]?.close ?? seed.lastValue;
    const lastHistoricalCandle = candles[candles.length - 1] ?? null;
    return {
      line: seed.line,
      candles,
      liveCandle: null,
      value: close,
      latestMarketTime:
        lastHistoricalCandle
          ? lastHistoricalCandle.time + resolution.bucketSecs - 1
          : seed.line[seed.line.length - 1]?.time ?? null,
    };
  }

  const candleTime = beatBucketTime ?? nowBucketTime;
  const previousClose =
    candles[candles.length - 1]?.close ??
    seed.line[seed.line.length - 1]?.value ??
    liveValue;
  const lastCandle = candles[candles.length - 1] ?? null;
  const lockedCandles =
    lastCandle && lastCandle.time === candleTime ? candles.slice(0, -1) : candles;
  const existingLive =
    lastCandle && lastCandle.time === candleTime ? lastCandle : null;

  const liveCandle: LivelineCandlePoint = {
    time: candleTime,
    open: existingLive?.open ?? previousClose,
    high: Math.max(existingLive?.high ?? previousClose, liveValue),
    low: Math.min(existingLive?.low ?? previousClose, liveValue),
    close: liveValue,
  };

  return {
    line: seed.line,
    candles: lockedCandles.slice(-MAX_CANDLES),
    liveCandle,
    value: liveValue,
    latestMarketTime: liveCandle.time + resolution.bucketSecs - 1,
  };
}

function getSourceBarSecs(bars: HistoricalBar[]): number {
  let minDiffSecs = Number.POSITIVE_INFINITY;

  for (let index = 1; index < bars.length; index += 1) {
    const diffSecs = Math.round((bars[index].time - bars[index - 1].time) / 1000);
    if (diffSecs > 0 && diffSecs < minDiffSecs) {
      minDiffSecs = diffSecs;
    }
  }

  return Number.isFinite(minDiffSecs) ? minDiffSecs : 60;
}

function buildCandlesFromLinePoints(
  points: LivelinePoint[],
  bucketSecs: number
): LivelineCandlePoint[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const candles: LivelineCandlePoint[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index];
    const next = sorted[index + 1];
    const bucketTime = alignToBucket(point.time, bucketSecs);

    if (candles[candles.length - 1]?.time === bucketTime) continue;

    const close =
      next && next.time <= bucketTime + bucketSecs
        ? next.value
        : point.value;

    candles.push({
      time: bucketTime,
      open: point.value,
      high: Math.max(point.value, close),
      low: Math.min(point.value, close),
      close,
    });
  }

  return candles.slice(-MAX_CANDLES);
}

function buildCandlesFromBars(
  bars: HistoricalBar[],
  _windowSecs: number,
  bucketSecs: number,
  sourceBarSecs: number
): LivelineCandlePoint[] {
  if (bars.length === 0) return [];
  const sorted = sortBars(bars);
  const fullSpanSecs = Math.max(
    bucketSecs,
    Math.floor(sorted[sorted.length - 1].time / 1000) -
      Math.floor(sorted[0].time / 1000) +
      bucketSecs
  );

  if (bucketSecs < sourceBarSecs) {
    return buildCandlesFromLinePoints(
      buildHistoricalBucketedLinePoints(
        sorted,
        fullSpanSecs,
        bucketSecs,
        MAX_LINE_POINTS
      ),
      bucketSecs
    );
  }

  const grouped = new Map<number, LivelineCandlePoint>();

  for (const bar of sorted) {
    const time = Math.floor(bar.time / 1000);
    const bucketTime = alignToBucket(time, bucketSecs);
    const existing = grouped.get(bucketTime);

    if (!existing) {
      grouped.set(bucketTime, {
        time: bucketTime,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
      continue;
    }

    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_CANDLES);
}

function buildCommittedLivePoints(
  beats: LiveBeatSeriesInput[],
  bucketSecs: number,
  visibleStart: number,
  headBucketTime: number
): LivelinePoint[] {
  const byBucket = new Map<number, LivelinePoint>();

  for (const beat of beats) {
    if (!(beat.value > 0)) continue;

    const bucketStartTime = alignToBucket(
      Math.floor(beat.updatedMs / 1000),
      bucketSecs
    );
    const bucketTime = getBucketEndTime(bucketStartTime, bucketSecs);

    if (bucketTime < visibleStart || bucketStartTime >= headBucketTime) continue;

    byBucket.set(bucketTime, {
      time: bucketTime,
      value: beat.value,
    });
  }

  return Array.from(byBucket.values()).sort((left, right) => left.time - right.time);
}

function buildLivePoints(
  beats: LiveBeatSeriesInput[],
  bucketSecs: number,
  visibleStart: number,
  headBucketTime: number
): LivelinePoint[] {
  const points = buildCommittedLivePoints(
    beats,
    bucketSecs,
    visibleStart,
    headBucketTime + bucketSecs
  );

  return normalizeLinePoints(
    points.filter((point) => point.time <= headBucketTime),
    MAX_LINE_POINTS
  );
}

function getContiguousRecentLiveBeats(
  beats: LiveBeatSeriesInput[]
): LiveBeatSeriesInput[] {
  if (beats.length <= 1) {
    return beats;
  }

  const sorted = [...beats].sort((left, right) => left.updatedMs - right.updatedMs);
  let startIndex = sorted.length - 1;

  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    const gapMs = sorted[index + 1].updatedMs - sorted[index].updatedMs;
    if (gapMs > MAX_LIVE_SEGMENT_GAP_MS) {
      break;
    }
    startIndex = index;
  }

  return sorted.slice(startIndex);
}
