import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceLineBuckets,
  alignToBucket,
  buildHistoricalBucketedLinePoints,
  buildHistoricalBucketedLinePointsForFullSpan,
  syncLiveLinePoint,
} from './chart-series.ts';

test('buildHistoricalBucketedLinePoints densifies minute bars onto bucket cadence', () => {
  const bars = [
    { time: 60_000, open: 100, high: 100, low: 100, close: 100, volume: 0 },
    { time: 120_000, open: 101, high: 101, low: 101, close: 101, volume: 0 },
    { time: 180_000, open: 102, high: 102, low: 102, close: 102, volume: 0 },
  ];

  const points = buildHistoricalBucketedLinePoints(bars, 120, 30);

  assert.deepEqual(points, [
    { time: 119, value: 100 },
    { time: 149, value: 101 },
    { time: 179, value: 101 },
    { time: 209, value: 102 },
  ]);
});

test('buildHistoricalBucketedLinePointsForFullSpan re-buckets the full available history span', () => {
  const bars = [
    { time: 60_000, open: 100, high: 100, low: 100, close: 100, volume: 0 },
    { time: 120_000, open: 101, high: 101, low: 101, close: 101, volume: 0 },
    { time: 180_000, open: 102, high: 102, low: 102, close: 102, volume: 0 },
  ];

  const points = buildHistoricalBucketedLinePointsForFullSpan(bars, 30);

  assert.deepEqual(points, [
    { time: 89, value: 100 },
    { time: 119, value: 100 },
    { time: 149, value: 101 },
    { time: 179, value: 101 },
    { time: 209, value: 102 },
  ]);
});

test('buildHistoricalBucketedLinePoints places coarse closes at bucket end, matching the last finer close in that bucket', () => {
  const bars = [
    { time: 23 * 3600_000 + 45 * 60_000, open: 0.70510, high: 0.70520, low: 0.70493, close: 0.70516, volume: 0 },
    { time: 23 * 3600_000 + 46 * 60_000, open: 0.70516, high: 0.70534, low: 0.70511, close: 0.70520, volume: 0 },
    { time: 23 * 3600_000 + 47 * 60_000, open: 0.70520, high: 0.70527, low: 0.70513, close: 0.70526, volume: 0 },
    { time: 23 * 3600_000 + 48 * 60_000, open: 0.70526, high: 0.70536, low: 0.70508, close: 0.70509, volume: 0 },
    { time: 23 * 3600_000 + 49 * 60_000, open: 0.70509, high: 0.70511, low: 0.70489, close: 0.70501, volume: 0 },
    { time: 23 * 3600_000 + 50 * 60_000, open: 0.70501, high: 0.70501, low: 0.70482, close: 0.70486, volume: 0 },
    { time: 23 * 3600_000 + 51 * 60_000, open: 0.70486, high: 0.70500, low: 0.70482, close: 0.70495, volume: 0 },
    { time: 23 * 3600_000 + 52 * 60_000, open: 0.70495, high: 0.70530, low: 0.70493, close: 0.70516, volume: 0 },
    { time: 23 * 3600_000 + 53 * 60_000, open: 0.70516, high: 0.70546, low: 0.70504, close: 0.70531, volume: 0 },
    { time: 23 * 3600_000 + 54 * 60_000, open: 0.70531, high: 0.70568, low: 0.70518, close: 0.70564, volume: 0 },
  ];

  const points = buildHistoricalBucketedLinePointsForFullSpan(bars, 300);

  assert.deepEqual(points.slice(-2), [
    { time: 23 * 3600 + 49 * 60 + 59, value: 0.70501 },
    { time: 23 * 3600 + 54 * 60 + 59, value: 0.70564 },
  ]);
});

test('advanceLineBuckets seeds a flat visible window when history is stale', () => {
  const currentBucket = alignToBucket(1_000, 5);
  const points = advanceLineBuckets([{ time: 900, value: 10 }], currentBucket, 5, 15, 30);

  assert.deepEqual(points, [
    { time: 975, value: 15 },
    { time: 980, value: 15 },
    { time: 985, value: 15 },
    { time: 990, value: 15 },
    { time: 995, value: 15 },
    { time: 1000, value: 15 },
  ]);
});

test('advanceLineBuckets advances by bucket time and avoids duplicate timestamps', () => {
  const points = advanceLineBuckets(
    [
      { time: 990, value: 10 },
      { time: 995, value: 10 },
      { time: 995, value: 11 },
    ],
    1_005,
    5,
    12,
    30
  );

  assert.deepEqual(points, [
    { time: 990, value: 10 },
    { time: 995, value: 11 },
    { time: 1000, value: 12 },
    { time: 1005, value: 12 },
  ]);
});

test('syncLiveLinePoint updates the current bucket without forking prior buckets', () => {
  const points = syncLiveLinePoint(
    [
      { time: 995, value: 10 },
      { time: 1000, value: 10 },
    ],
    1000,
    5,
    10.75,
    30
  );

  assert.deepEqual(points, [
    { time: 995, value: 10 },
    { time: 1000, value: 10.75 },
  ]);
});

test('syncLiveLinePoint carries the prior value through missing buckets before the new beat', () => {
  const points = syncLiveLinePoint(
    [{ time: 990, value: 10 }],
    1000,
    5,
    11,
    30
  );

  assert.deepEqual(points, [
    { time: 990, value: 10 },
    { time: 995, value: 10 },
    { time: 1000, value: 11 },
  ]);
});

test('syncLiveLinePoint preserves older current history instead of re-clipping to the visible window', () => {
  const points = syncLiveLinePoint(
    [
      { time: 900, value: 8 },
      { time: 960, value: 9 },
      { time: 990, value: 10 },
      { time: 995, value: 10 },
    ],
    1000,
    5,
    11,
    30
  );

  assert.deepEqual(points, [
    { time: 900, value: 8 },
    { time: 960, value: 9 },
    { time: 990, value: 10 },
    { time: 995, value: 10 },
    { time: 1000, value: 11 },
  ]);
});
