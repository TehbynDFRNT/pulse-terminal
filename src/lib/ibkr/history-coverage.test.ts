import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getChartTimeframe,
} from './chart-presets.ts';
import {
  getHistoryCoverageRatio,
  hasSufficientHistoryCoverage,
} from './history-coverage.ts';
import type { HistoricalBar } from './types.ts';

function makeBars(startIso: string, count: number, stepHours: number): HistoricalBar[] {
  const startMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, index) => {
    const time = startMs + index * stepHours * 60 * 60 * 1000;
    return {
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 1,
      time,
    };
  });
}

test('accepts short windows without long-window coverage enforcement', () => {
  const timeframe = getChartTimeframe('5m');
  const bars = makeBars('2026-03-12T00:00:00Z', 3, 1);

  assert.equal(hasSufficientHistoryCoverage(bars, timeframe, '1h'), true);
});

test('rejects partial 1D intraday history coverage', () => {
  const timeframe = getChartTimeframe('1D');
  const bars = makeBars('2026-03-12T00:00:00Z', 10, 1);

  assert.equal(hasSufficientHistoryCoverage(bars, timeframe, '1h'), false);
  assert.ok(getHistoryCoverageRatio(bars, timeframe, '1h') < 0.9);
});

test('rejects partial 1W history coverage', () => {
  const timeframe = getChartTimeframe('1W');
  const bars = makeBars('2026-03-09T00:00:00Z', 5, 24);

  assert.equal(hasSufficientHistoryCoverage(bars, timeframe, '1d'), false);
  assert.ok(getHistoryCoverageRatio(bars, timeframe, '1d') < 0.9);
});

test('rejects partial 3M intraday history coverage', () => {
  const timeframe = getChartTimeframe('3M');
  const bars = makeBars('2026-02-23T08:00:00Z', 96, 4);

  assert.equal(hasSufficientHistoryCoverage(bars, timeframe, '4h'), false);
  assert.ok(getHistoryCoverageRatio(bars, timeframe, '4h') < 0.8);
});

test('accepts full 3M daily history coverage', () => {
  const timeframe = getChartTimeframe('3M');
  const bars = makeBars('2025-12-13T00:00:00Z', 91, 24);

  assert.equal(hasSufficientHistoryCoverage(bars, timeframe, '1d'), true);
  assert.ok(getHistoryCoverageRatio(bars, timeframe, '1d') >= 0.8);
});
