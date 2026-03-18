import test from 'node:test';
import assert from 'node:assert/strict';
import { getChartBeatPrice, getDisplayPrice } from './display-price.ts';

test('getDisplayPrice prefers midpoint when bid and ask are available', () => {
  const result = getDisplayPrice({
    last: 100,
    bid: 101,
    ask: 103,
    prevClose: 100,
  });

  assert.equal(result.displayPrice, 102);
  assert.equal(result.displayChange, 2);
  assert.equal(result.displayChangePct, '2%');
  assert.equal(result.displaySource, 'mid');
});

test('getDisplayPrice falls back to last when no valid quote midpoint exists', () => {
  const result = getDisplayPrice({
    last: 99.5,
    bid: 0,
    ask: 0,
    prevClose: 100,
  });

  assert.equal(result.displayPrice, 99.5);
  assert.equal(result.displayChange, -0.5);
  assert.equal(result.displayChangePct, '-0.5%');
  assert.equal(result.displaySource, 'last');
});

test('getChartBeatPrice prefers a fresh last trade beat over midpoint', () => {
  const result = getChartBeatPrice({
    last: 101,
    bid: 100,
    ask: 102,
    preferLast: true,
  });

  assert.equal(result.chartPrice, 101);
  assert.equal(result.chartSource, 'last');
});

test('getChartBeatPrice falls back to midpoint between trade beats', () => {
  const result = getChartBeatPrice({
    last: 101,
    bid: 100,
    ask: 102,
    preferLast: false,
  });

  assert.equal(result.chartPrice, 101);
  assert.equal(result.chartSource, 'mid');
});
