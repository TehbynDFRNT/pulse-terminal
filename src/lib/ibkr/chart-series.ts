import type { LivelinePoint } from 'liveline';
import type { HistoricalBar } from '@/lib/ibkr/types';

const DEFAULT_MAX_LINE_POINTS = 5000;

export function alignToBucket(time: number, bucketSecs: number): number {
  return Math.floor(time / bucketSecs) * bucketSecs;
}

export function getBucketEndTime(bucketStart: number, bucketSecs: number): number {
  return bucketStart + bucketSecs - 1;
}

export function sortBars(bars: HistoricalBar[]): HistoricalBar[] {
  return [...bars].sort((a, b) => a.time - b.time);
}

export function normalizeLinePoints(
  points: LivelinePoint[],
  maxPoints = DEFAULT_MAX_LINE_POINTS
): LivelinePoint[] {
  const next: LivelinePoint[] = [];

  for (const point of [...points].sort((a, b) => a.time - b.time)) {
    if (!Number.isFinite(point.time) || !Number.isFinite(point.value)) continue;

    const last = next[next.length - 1];
    if (last && last.time === point.time) {
      next[next.length - 1] = point;
      continue;
    }

    next.push(point);
  }

  return next.length > maxPoints
    ? next.slice(next.length - maxPoints)
    : next;
}

export function buildHistoricalBucketedLinePoints(
  bars: HistoricalBar[],
  windowSecs: number,
  bucketSecs: number,
  maxPoints = DEFAULT_MAX_LINE_POINTS
): LivelinePoint[] {
  const sorted = sortBars(bars);
  if (sorted.length === 0) return [];

  const endTime = alignToBucket(
    Math.floor(sorted[sorted.length - 1].time / 1000),
    bucketSecs
  );
  const startTime = endTime - windowSecs + bucketSecs;
  return buildBucketedLinePointsForRange(
    sorted,
    startTime,
    endTime,
    bucketSecs,
    maxPoints
  );
}

export function buildHistoricalBucketedLinePointsForFullSpan(
  bars: HistoricalBar[],
  bucketSecs: number,
  maxPoints = DEFAULT_MAX_LINE_POINTS
): LivelinePoint[] {
  const sorted = sortBars(bars);
  if (sorted.length === 0) return [];

  const startTime = alignToBucket(
    Math.floor(sorted[0].time / 1000),
    bucketSecs
  );
  const endTime = alignToBucket(
    Math.floor(sorted[sorted.length - 1].time / 1000),
    bucketSecs
  );

  return buildBucketedLinePointsForRange(
    sorted,
    startTime,
    endTime,
    bucketSecs,
    maxPoints
  );
}

function buildBucketedLinePointsForRange(
  sorted: HistoricalBar[],
  startTime: number,
  endTime: number,
  bucketSecs: number,
  maxPoints: number
): LivelinePoint[] {
  const points: LivelinePoint[] = [];
  let lastKnownValue: number | null = null;
  let barIndex = 0;

  for (let bucketTime = startTime; bucketTime <= endTime; bucketTime += bucketSecs) {
    const bucketEndTime = getBucketEndTime(bucketTime, bucketSecs);

    while (
      barIndex < sorted.length &&
      Math.floor(sorted[barIndex].time / 1000) <= bucketEndTime
    ) {
      lastKnownValue = sorted[barIndex].close;
      barIndex += 1;
    }

    if (lastKnownValue == null) continue;
    points.push({ time: bucketEndTime, value: lastKnownValue });
  }

  return normalizeLinePoints(points, maxPoints);
}

export function buildHistoricalLinePoints(
  bars: HistoricalBar[],
  _windowSecs: number,
  maxPoints = DEFAULT_MAX_LINE_POINTS
): LivelinePoint[] {
  const sorted = sortBars(bars);
  if (sorted.length === 0) return [];

  const points = sorted
    .map((bar) => ({
      time: getBucketEndTime(Math.floor(bar.time / 1000), 60),
      value: bar.close,
    }));

  return normalizeLinePoints(points, maxPoints);
}

export function buildFlatWindowLinePoints(
  endTime: number,
  windowSecs: number,
  bucketSecs: number,
  value: number,
  maxPoints = DEFAULT_MAX_LINE_POINTS
): LivelinePoint[] {
  if (!Number.isFinite(value) || value <= 0) return [];

  const points: LivelinePoint[] = [];
  const startTime = endTime - windowSecs + bucketSecs;

  for (let bucketTime = startTime; bucketTime <= endTime; bucketTime += bucketSecs) {
    points.push({ time: bucketTime, value });
  }

  return normalizeLinePoints(points, maxPoints);
}

export function advanceLineBuckets(
  points: LivelinePoint[],
  bucketTime: number,
  bucketSecs: number,
  currentValue: number,
  windowSecs: number,
  maxPoints = DEFAULT_MAX_LINE_POINTS
): LivelinePoint[] {
  const visibleStart = bucketTime - windowSecs + bucketSecs;
  const normalized = normalizeLinePoints(points, maxPoints);
  const lastVisiblePoint = normalized[normalized.length - 1];

  if (!lastVisiblePoint || lastVisiblePoint.time < visibleStart) {
    return buildFlatWindowLinePoints(
      bucketTime,
      windowSecs,
      bucketSecs,
      currentValue,
      maxPoints
    );
  }

  const next = normalized.slice();
  let lastTime = next[next.length - 1].time;

  while (lastTime < bucketTime) {
    lastTime += bucketSecs;
    next.push({ time: lastTime, value: currentValue });
  }

  return normalizeLinePoints(next, maxPoints);
}

export function syncLiveLinePoint(
  points: LivelinePoint[],
  bucketTime: number,
  bucketSecs: number,
  currentValue: number,
  windowSecs: number,
  maxPoints = DEFAULT_MAX_LINE_POINTS
): LivelinePoint[] {
  const visibleStart = bucketTime - windowSecs + bucketSecs;
  const normalized = normalizeLinePoints(points, maxPoints);
  const lastVisiblePoint = normalized[normalized.length - 1];

  if (!lastVisiblePoint || lastVisiblePoint.time < visibleStart) {
    return buildFlatWindowLinePoints(
      bucketTime,
      windowSecs,
      bucketSecs,
      currentValue,
      maxPoints
    );
  }

  const next = normalized.slice();
  const last = next[next.length - 1];

  if (last.time === bucketTime) {
    next[next.length - 1] = {
      time: bucketTime,
      value: currentValue,
    };
    return normalizeLinePoints(next, maxPoints);
  }

  let cursor = last.time;
  const carryValue = last.value;

  while (cursor + bucketSecs < bucketTime) {
    cursor += bucketSecs;
    next.push({
      time: cursor,
      value: carryValue,
    });
  }

  next.push({
    time: bucketTime,
    value: currentValue,
  });

  return normalizeLinePoints(next, maxPoints);
}
