import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistorySeed, buildLivelineFeed } from './liveline-feed.ts';
import { getChartResolution, getChartTimeframe } from './chart-presets.ts';

test('buildLivelineFeed preserves seeded history and only advances the live edge', () => {
  const timeframe = getChartTimeframe('5m');
  const resolution = getChartResolution('1s');
  const seed = buildHistorySeed(
    [
      { time: 60_000, open: 100, high: 100, low: 100, close: 100, volume: 0 },
      { time: 120_000, open: 101, high: 101, low: 101, close: 101, volume: 0 },
      { time: 180_000, open: 102, high: 102, low: 102, close: 102, volume: 0 },
    ],
    timeframe,
    resolution
  );

  const nowMs = 300_000;
  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 103,
      updatedMs: nowMs,
      source: 'mid',
    },
    nowMs,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.ok(feed.line.every((point, index, arr) => index === 0 || point.time > arr[index - 1].time));
  assert.equal(feed.line[0]?.time, 60);
  assert.equal(feed.line[0]?.value, 100);
  assert.equal(feed.line[feed.line.length - 1]?.time, 300);
  assert.equal(feed.line[feed.line.length - 1]?.value, 103);
  assert.equal(feed.value, 103);
  assert.ok(feed.line.some((point) => point.time === 180 && point.value === 102));
  assert.ok(feed.line.some((point) => point.time === 300 && point.value === 103));
});

test('buildHistorySeed normalizes the displayed line to the active resolution across the full seed span', () => {
  const timeframe = getChartTimeframe('30m');
  const resolution = getChartResolution('30s');
  const seed = buildHistorySeed(
    [
      { time: 60_000, open: 100, high: 100, low: 100, close: 100, volume: 0 },
      { time: 120_000, open: 101, high: 101, low: 101, close: 101, volume: 0 },
      { time: 180_000, open: 102, high: 102, low: 102, close: 102, volume: 0 },
    ],
    timeframe,
    resolution
  );

  assert.deepEqual(seed.line, [
    { time: 89, value: 100 },
    { time: 119, value: 100 },
    { time: 149, value: 101 },
    { time: 179, value: 101 },
    { time: 209, value: 102 },
  ]);
});

test('buildHistorySeed anchors rebucketed coarse closes at bucket end', () => {
  const timeframe = getChartTimeframe('15m');
  const resolution = getChartResolution('5m');
  const seed = buildHistorySeed(
    [
      { time: (23 * 3600 + 45 * 60) * 1000, open: 0.70510, high: 0.70520, low: 0.70493, close: 0.70516, volume: 0 },
      { time: (23 * 3600 + 46 * 60) * 1000, open: 0.70516, high: 0.70534, low: 0.70511, close: 0.70520, volume: 0 },
      { time: (23 * 3600 + 47 * 60) * 1000, open: 0.70520, high: 0.70527, low: 0.70513, close: 0.70526, volume: 0 },
      { time: (23 * 3600 + 48 * 60) * 1000, open: 0.70526, high: 0.70536, low: 0.70508, close: 0.70509, volume: 0 },
      { time: (23 * 3600 + 49 * 60) * 1000, open: 0.70509, high: 0.70511, low: 0.70489, close: 0.70501, volume: 0 },
      { time: (23 * 3600 + 50 * 60) * 1000, open: 0.70501, high: 0.70501, low: 0.70482, close: 0.70486, volume: 0 },
      { time: (23 * 3600 + 51 * 60) * 1000, open: 0.70486, high: 0.70500, low: 0.70482, close: 0.70495, volume: 0 },
      { time: (23 * 3600 + 52 * 60) * 1000, open: 0.70495, high: 0.70530, low: 0.70493, close: 0.70516, volume: 0 },
      { time: (23 * 3600 + 53 * 60) * 1000, open: 0.70516, high: 0.70546, low: 0.70504, close: 0.70531, volume: 0 },
      { time: (23 * 3600 + 54 * 60) * 1000, open: 0.70531, high: 0.70568, low: 0.70518, close: 0.70564, volume: 0 },
    ],
    timeframe,
    resolution
  );

  assert.equal(seed.line[seed.line.length - 1]?.time, 23 * 3600 + 54 * 60 + 59);
  assert.equal(seed.line[seed.line.length - 1]?.value, 0.70564);
});

test('buildHistorySeed preserves non-flat candles when mixed-cadence history includes finer bars', () => {
  const timeframe = getChartTimeframe('1Y');
  const resolution = getChartResolution('1D');
  const seed = buildHistorySeed(
    [
      { time: 0, open: 10, high: 12, low: 9, close: 11, volume: 0 },
      { time: 7 * 24 * 60 * 60 * 1000, open: 11, high: 14, low: 10, close: 13, volume: 0 },
      { time: 8 * 24 * 60 * 60 * 1000, open: 13, high: 15, low: 12, close: 14, volume: 0 },
      { time: 9 * 24 * 60 * 60 * 1000, open: 14, high: 16, low: 13, close: 15, volume: 0 },
    ],
    timeframe,
    resolution
  );

  const tail = seed.candles.slice(-3);

  assert.equal(tail.length, 3);
  assert.deepEqual(
    tail.map((candle) => ({
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
    [
      { open: 13, high: 15, low: 12, close: 14 },
      { open: 14, high: 16, low: 13, close: 15 },
      { open: 11, high: 14, low: 10, close: 13 },
    ].sort((left, right) => left.open - right.open)
  );
});

test('buildLivelineFeed uses recent live beat history instead of dragging one live value forward', () => {
  const timeframe = getChartTimeframe('5m');
  const resolution = getChartResolution('1s');
  const seed = buildHistorySeed([], timeframe, resolution);
  const nowMs = 305_000;

  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 103,
      updatedMs: 305_000,
      source: 'mid',
    },
    liveBeats: [
      { value: 100, updatedMs: 301_000, source: 'mid' },
      { value: 101, updatedMs: 302_000, source: 'mid' },
      { value: 102, updatedMs: 303_000, source: 'mid' },
      { value: 103, updatedMs: 305_000, source: 'mid' },
    ],
    nowMs,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.equal(feed.line[feed.line.length - 1]?.time, 305);
  assert.equal(feed.line[feed.line.length - 1]?.value, 103);
  assert.equal(feed.value, 103);
  assert.ok(feed.line.some((point) => point.time === 305 && point.value === 103));
  assert.ok(feed.line.some((point) => point.time === 303 && point.value === 102));
  assert.ok(feed.line.some((point) => point.time === 302 && point.value === 101));
  assert.ok(feed.line.some((point) => point.time === 301 && point.value === 100));
});

test('buildLivelineFeed seeds a live-owned right edge before coarse history can dominate it', () => {
  const timeframe = getChartTimeframe('5m');
  const resolution = getChartResolution('1s');
  const seed = buildHistorySeed(
    [
      { time: 5_520_000, open: 69859, high: 69859, low: 69859, close: 69859, volume: 0 },
      { time: 5_580_000, open: 69855, high: 69855, low: 69855, close: 69855, volume: 0 },
    ],
    timeframe,
    resolution
  );

  const nowMs = 5_585_000;
  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 69855.875,
      updatedMs: nowMs,
      source: 'mid',
    },
    nowMs,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.equal(feed.line[feed.line.length - 1]?.time, 5585);
  assert.equal(feed.line[feed.line.length - 1]?.value, 69855.875);
  assert.equal(feed.value, 69855.875);
  assert.ok(
    feed.line.some(
      (point) => point.time === 5580 && point.value === 69855
    )
  );
  assert.ok(
    feed.line.some(
      (point) => point.time === 5585 && point.value === 69855.875
    )
  );
});

test('buildLivelineFeed holds the handoff boundary at the coarse history value until live points begin', () => {
  const timeframe = getChartTimeframe('5m');
  const resolution = getChartResolution('1s');
  const seed = buildHistorySeed(
    [
      { time: 5_520_000, open: 100, high: 100, low: 100, close: 100, volume: 0 },
    ],
    timeframe,
    resolution
  );

  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 102,
      updatedMs: 5_585_000,
      source: 'mid',
    },
    liveBeats: [
      { value: 101, updatedMs: 5_583_000, source: 'mid' },
      { value: 102, updatedMs: 5_585_000, source: 'mid' },
    ],
    nowMs: 5_585_000,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.ok(feed.line.some((point) => point.time === 5520 && point.value === 100));
  assert.ok(!feed.line.some((point) => point.time > 5520 && point.time < 5583));
  assert.ok(feed.line.some((point) => point.time === 5583 && point.value === 101));
  assert.ok(feed.line.some((point) => point.time === 5585 && point.value === 102));
});

test('buildLivelineFeed does not pull the coarse/live boundary backward before a full source bar of live coverage exists', () => {
  const timeframe = getChartTimeframe('5m');
  const resolution = getChartResolution('1s');
  const seed = buildHistorySeed(
    [
      { time: 5_520_000, open: 100, high: 100, low: 100, close: 100, volume: 0 },
      { time: 5_580_000, open: 110, high: 110, low: 110, close: 110, volume: 0 },
    ],
    timeframe,
    resolution
  );

  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 111,
      updatedMs: 5_585_000,
      source: 'mid',
    },
    liveBeats: [
      { value: 111, updatedMs: 5_585_000, source: 'mid' },
    ],
    nowMs: 5_585_000,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.ok(feed.line.some((point) => point.time === 5580 && point.value === 110));
  assert.ok(feed.line.some((point) => point.time === 5526 && point.value === 100));
  assert.ok(
    !feed.line.some(
      (point) => point.time > 5580 && point.time < 5585 && point.value === 100
    )
  );
  assert.ok(feed.line.some((point) => point.time === 5585 && point.value === 111));
});

test('buildLivelineFeed keeps the last line point aligned to the latest live beat', () => {
  const timeframe = getChartTimeframe('5m');
  const resolution = getChartResolution('1s');
  const seed = buildHistorySeed([], timeframe, resolution);

  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 103,
      updatedMs: 305_000,
      source: 'mid',
    },
    nowMs: 310_000,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.equal(feed.line[feed.line.length - 1]?.time, 305);
  assert.equal(feed.line[feed.line.length - 1]?.value, 103);
  assert.equal(feed.value, 103);
  assert.equal(feed.latestMarketTime, 305);
});

test('buildLivelineFeed preserves older seed history when the active window is smaller', () => {
  const timeframe = getChartTimeframe('5m');
  const resolution = getChartResolution('1s');
  const seed = buildHistorySeed(
    [
      { time: 60_000, open: 100, high: 100, low: 100, close: 100, volume: 0 },
      { time: 120_000, open: 101, high: 101, low: 101, close: 101, volume: 0 },
      { time: 180_000, open: 102, high: 102, low: 102, close: 102, volume: 0 },
      { time: 240_000, open: 103, high: 103, low: 103, close: 103, volume: 0 },
      { time: 300_000, open: 104, high: 104, low: 104, close: 104, volume: 0 },
    ],
    timeframe,
    resolution
  );

  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 105,
      updatedMs: 600_000,
      source: 'mid',
    },
    nowMs: 600_000,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.ok(feed.line.some((point) => point.time === 60 && point.value === 100));
  assert.ok(feed.line.some((point) => point.time === 300 && point.value === 104));
  assert.equal(feed.line[feed.line.length - 1]?.time, 600);
  assert.equal(feed.line[feed.line.length - 1]?.value, 105);
});

test('buildLivelineFeed ignores stale disconnected live beat islands after a long gap', () => {
  const timeframe = getChartTimeframe('4h');
  const resolution = getChartResolution('1m');
  const seed = buildHistorySeed([], timeframe, resolution);

  const feed = buildLivelineFeed({
    seed,
    mode: 'line',
    liveBeat: {
      value: 104,
      updatedMs: 18_000_000,
      source: 'mid',
    },
    liveBeats: [
      { value: 100, updatedMs: 7_200_000, source: 'mid' },
      { value: 101, updatedMs: 7_260_000, source: 'mid' },
      { value: 104, updatedMs: 18_000_000, source: 'mid' },
    ],
    nowMs: 18_000_000,
    marketOpen: true,
    hasLiveFeed: true,
    timeframe,
    resolution,
  });

  assert.ok(!feed.line.some((point) => point.time === 7200));
  assert.equal(feed.line[feed.line.length - 1]?.time, 18000);
  assert.equal(feed.line[feed.line.length - 1]?.value, 104);
});
