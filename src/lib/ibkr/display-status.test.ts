import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMarketDataDisplayStatus } from './display-status.ts';

test('live entitlement plus closed schedule is reported as closed immediately', () => {
  const status = deriveMarketDataDisplayStatus({
    marketDataStatus: 'live',
    sessionPhase: 'closed',
    updated: Date.now(),
    hasHistory: true,
  });

  assert.equal(status, 'closed');
});

test('live entitlement plus extended schedule is reported as extended', () => {
  const status = deriveMarketDataDisplayStatus({
    marketDataStatus: 'live',
    sessionPhase: 'extended',
    updated: Date.now(),
    hasHistory: true,
  });

  assert.equal(status, 'extended');
});

test('live entitlement plus unknown schedule stays live when ticks are fresh', () => {
  const status = deriveMarketDataDisplayStatus({
    marketDataStatus: 'live',
    sessionPhase: 'unknown',
    updated: Date.now(),
    hasHistory: true,
  });

  assert.equal(status, 'live');
});

test('regular session schedule overrides stale-tick heuristics for live entitlements', () => {
  const status = deriveMarketDataDisplayStatus({
    marketDataStatus: 'live',
    sessionPhase: 'regular',
    updated: Date.now() - 60 * 60 * 1000,
    hasHistory: true,
    staleMs: 60_000,
  });

  assert.equal(status, 'live');
});

test('unknown market-data status with history remains historical', () => {
  const status = deriveMarketDataDisplayStatus({
    marketDataStatus: 'unknown',
    sessionPhase: 'closed',
    hasHistory: true,
  });

  assert.equal(status, 'historical');
});

test('frozen data on a closed scheduled market is presented as closed', () => {
  const status = deriveMarketDataDisplayStatus({
    marketDataStatus: 'frozen',
    sessionPhase: 'closed',
    hasHistory: true,
  });

  assert.equal(status, 'closed');
});
