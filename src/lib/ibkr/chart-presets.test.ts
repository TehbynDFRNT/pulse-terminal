import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CHART_TIMEFRAME_KEY,
  getAvailableChartResolutions,
  getChartTimeframe,
  getHistoryRequestsForTimeframe,
} from './chart-presets.ts';

test('4h timeframe uses the direct resolution list', () => {
  const resolutions = getAvailableChartResolutions(getChartTimeframe('4h'));

  assert.deepEqual(
    resolutions.map((resolution) => resolution.key),
    ['5s', '10s', '30s', '1m', '5m', '10m', '15m']
  );
});

test('1h timeframe uses the direct resolution list', () => {
  const resolutions = getAvailableChartResolutions(getChartTimeframe('1h'));

  assert.deepEqual(
    resolutions.map((resolution) => resolution.key),
    ['1s', '5s', '10s', '30s', '1m', '5m', '10m', '15m']
  );
});

test('1M timeframe defaults to 1D and keeps the truthful direct resolution list', () => {
  const timeframe = getChartTimeframe('1M');
  const resolutions = getAvailableChartResolutions(timeframe);

  assert.equal(timeframe.defaultResolutionKey, '1D');
  assert.deepEqual(
    resolutions.map((resolution) => resolution.key),
    ['1D']
  );
});

test('1W timeframe defaults to 4h and keeps the truthful direct resolution list', () => {
  const timeframe = getChartTimeframe('1W');
  const resolutions = getAvailableChartResolutions(timeframe);

  assert.equal(timeframe.defaultResolutionKey, '4h');
  assert.deepEqual(
    resolutions.map((resolution) => resolution.key),
    ['4h', '1D']
  );
});

test('1D timeframe uses the direct resolution list', () => {
  const resolutions = getAvailableChartResolutions(getChartTimeframe('1D'));

  assert.deepEqual(
    resolutions.map((resolution) => resolution.key),
    ['5m', '10m', '15m', '1h']
  );
});

test('1Y timeframe defaults to 1W and keeps the truthful direct resolution list', () => {
  const timeframe = getChartTimeframe('1Y');
  const resolutions = getAvailableChartResolutions(timeframe);

  assert.equal(timeframe.defaultResolutionKey, '1W');
  assert.deepEqual(
    resolutions.map((resolution) => resolution.key),
    ['1W']
  );
});

test('1M timeframe prefers coverage-first history requests', () => {
  const requests = getHistoryRequestsForTimeframe(getChartTimeframe('1M'), '1h');

  assert.deepEqual(requests.slice(0, 2), [
    { period: '1Y', bar: '1d' },
    { period: '3M', bar: '4h' },
  ]);
});

test('30m timeframe keeps 1s as default and direct option', () => {
  const timeframe = getChartTimeframe('30m');
  const resolutions = getAvailableChartResolutions(timeframe);

  assert.equal(timeframe.defaultResolutionKey, '1s');
  assert.equal(resolutions[0]?.key, '1s');
});

test('default chart timeframe is 5m', () => {
  assert.equal(DEFAULT_CHART_TIMEFRAME_KEY, '5m');
  assert.equal(getChartTimeframe().key, '5m');
});
