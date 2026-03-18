import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePortfolioLiveValue,
  getPortfolioPerformanceTimeframe,
  toPortfolioPerformanceBars,
} from './portfolio-performance.ts';

test('toPortfolioPerformanceBars clips to the requested timeframe window', () => {
  const timeframe = getPortfolioPerformanceTimeframe('1W');
  const now = Date.UTC(2026, 2, 12);
  const points = Array.from({ length: 20 }, (_, index) => ({
    time: now - (19 - index) * 24 * 60 * 60 * 1000,
    value: 1_000_000 + index * 100,
  }));

  const bars = toPortfolioPerformanceBars(points, timeframe);

  assert.ok(bars.length <= 8);
  assert.equal(bars[0]?.close, points[points.length - bars.length]?.value);
  assert.equal(bars.at(-1)?.close, points.at(-1)?.value);
});

test('computePortfolioLiveValue adjusts same-currency positions from live quotes', () => {
  const value = computePortfolioLiveValue({
    baseCurrency: 'AUD',
    summary: {
      accountId: 'DUP873649',
      netLiquidity: 1_002_000,
      availableFunds: 1_000_000,
      buyingPower: 1_000_000,
      totalCash: 950_000,
      grossPosition: 52_000,
      initMargin: 0,
      maintMargin: 0,
      cushion: 1,
      unrealizedPnL: 0,
      realizedPnL: 0,
    },
    positions: [
      {
        conid: 1,
        symbol: 'IOZ',
        position: 1_413,
        marketPrice: 35.33,
        marketValue: 49_918.29,
        avgCost: 35.33,
        unrealizedPnl: 0,
        realizedPnl: 0,
        currency: 'AUD',
        assetClass: 'STK',
      },
    ],
    prices: new Map([
      [
        1,
        {
          displayPrice: 35.5,
          last: 35.5,
          updated: Date.now(),
        },
      ],
    ]),
  });

  assert.equal(value, 950_000 + (49_918.29 + 1_413 * (35.5 - 35.33)));
});

test('computePortfolioLiveValue falls back to net liquidity when no positions exist', () => {
  const value = computePortfolioLiveValue({
    baseCurrency: 'AUD',
    summary: {
      accountId: 'DUP873649',
      netLiquidity: 1_002_469.11,
      availableFunds: 1_001_505.68,
      buyingPower: 1_001_505.68,
      totalCash: 1_001_505.68,
      grossPosition: 0,
      initMargin: 0,
      maintMargin: 0,
      cushion: 1,
      unrealizedPnL: 0,
      realizedPnL: 0,
    },
    positions: [],
    prices: new Map(),
  });

  assert.equal(value, 1_002_469.11);
});
