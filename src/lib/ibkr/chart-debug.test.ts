import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeChartFeed } from './chart-debug.ts';
import { getChartResolution, getChartTimeframe } from './chart-presets.ts';

test('analyzeChartFeed flags minute backfill dominance when resolution is below history cadence', () => {
  const analysis = analyzeChartFeed({
    samples: [
      {
        capturedAt: 1000,
        updated: 1000,
        last: 1.1,
        displayPrice: 1.101,
        displaySource: 'mid',
        bid: 1.1,
        ask: 1.102,
        marketDataStatus: 'live',
        mdAvailability: 'RB',
      },
      {
        capturedAt: 2000,
        updated: 2000,
        last: 1.1,
        displayPrice: 1.102,
        displaySource: 'mid',
        bid: 1.101,
        ask: 1.103,
        marketDataStatus: 'live',
        mdAvailability: 'RB',
      },
    ],
    historyBars: [
      { time: 60_000, open: 1, high: 1, low: 1, close: 1, volume: 0 },
      { time: 120_000, open: 1, high: 1, low: 1, close: 1, volume: 0 },
    ],
    timeframe: getChartTimeframe('5m'),
    resolution: getChartResolution('1s'),
  });

  assert.equal(analysis.assumptions.minuteBackfillDominating, true);
  assert.equal(analysis.assumptions.midpointNotChangingEverySecond, false);
});

test('analyzeChartFeed flags tiny sample movement against a wide visible range', () => {
  const analysis = analyzeChartFeed({
    samples: [
      {
        capturedAt: 1000,
        updated: 1000,
        last: 10,
        displayPrice: 10.001,
        displaySource: 'mid',
        bid: 10,
        ask: 10.002,
        marketDataStatus: 'live',
        mdAvailability: 'RB',
      },
      {
        capturedAt: 2000,
        updated: 2000,
        last: 10,
        displayPrice: 10.002,
        displaySource: 'mid',
        bid: 10.001,
        ask: 10.003,
        marketDataStatus: 'live',
        mdAvailability: 'RB',
      },
    ],
    historyBars: [
      { time: 60_000, open: 5, high: 15, low: 5, close: 15, volume: 0 },
      { time: 120_000, open: 15, high: 15, low: 5, close: 5, volume: 0 },
    ],
    timeframe: getChartTimeframe('5m'),
    resolution: getChartResolution('1s'),
  });

  assert.equal(analysis.assumptions.moveTooSmallForVisibleRange, true);
});
