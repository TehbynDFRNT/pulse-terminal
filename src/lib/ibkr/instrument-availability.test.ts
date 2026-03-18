import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveInstrumentAvailability } from './instrument-availability.ts';

test('open live market is surfaced as open live', () => {
  const availability = deriveInstrumentAvailability({
    scheduleState: {
      phase: 'regular',
      isOpen: true,
      isExtendedHours: false,
      nextChangeAt: null,
      nextRegularOpen: null,
      nextRegularClose: null,
      nextExtendedOpen: null,
      nextExtendedClose: null,
      lastRegularClose: null,
    },
    snapshot: {
      conid: 1,
      last: 1,
      displayPrice: 1,
      displayChange: 0,
      displayChangePct: '0%',
      displaySource: 'last',
      symbol: 'BTC',
      companyName: 'Bitcoin',
      mdAvailability: 'S',
      marketDataStatus: 'live',
      bid: 1,
      bidSize: 1,
      ask: 1,
      askSize: 1,
      change: 0,
      changePct: '0%',
      volume: 0,
      dayLow: 0,
      dayHigh: 0,
      open: 0,
      prevClose: 0,
      updated: Date.now(),
      hasLiveData: true,
    },
  });

  assert.equal(availability.key, 'open-live');
  assert.equal(availability.entitled, true);
});

test('open market without usable market data is flagged as no entitlement', () => {
  const availability = deriveInstrumentAvailability({
    scheduleState: {
      phase: 'regular',
      isOpen: true,
      isExtendedHours: false,
      nextChangeAt: null,
      nextRegularOpen: null,
      nextRegularClose: null,
      nextExtendedOpen: null,
      nextExtendedClose: null,
      lastRegularClose: null,
    },
    snapshot: {
      conid: 1,
      last: 0,
      displayPrice: 0,
      displayChange: 0,
      displayChangePct: '0%',
      displaySource: 'none',
      symbol: 'BTC',
      companyName: 'Bitcoin',
      mdAvailability: '',
      marketDataStatus: 'unknown',
      bid: 0,
      bidSize: 0,
      ask: 0,
      askSize: 0,
      change: 0,
      changePct: '0%',
      volume: 0,
      dayLow: 0,
      dayHigh: 0,
      open: 0,
      prevClose: 0,
      updated: 0,
      hasLiveData: false,
    },
  });

  assert.equal(availability.key, 'open-no-entitlement');
  assert.equal(availability.entitled, false);
});

test('closed market with frozen quote is treated as closed cached', () => {
  const availability = deriveInstrumentAvailability({
    scheduleState: {
      phase: 'closed',
      isOpen: false,
      isExtendedHours: false,
      nextChangeAt: null,
      nextRegularOpen: null,
      nextRegularClose: null,
      nextExtendedOpen: null,
      nextExtendedClose: null,
      lastRegularClose: null,
    },
    snapshot: {
      conid: 1,
      last: 1,
      displayPrice: 1,
      displayChange: 0,
      displayChangePct: '0%',
      displaySource: 'last',
      symbol: 'BTC',
      companyName: 'Bitcoin',
      mdAvailability: 'Z',
      marketDataStatus: 'frozen',
      bid: 1,
      bidSize: 1,
      ask: 1,
      askSize: 1,
      change: 0,
      changePct: '0%',
      volume: 0,
      dayLow: 0,
      dayHigh: 0,
      open: 0,
      prevClose: 0,
      updated: Date.now(),
      hasLiveData: false,
    },
  });

  assert.equal(availability.key, 'closed-cached');
});

test('live quote with unknown schedule is surfaced as live with unavailable session metadata', () => {
  const availability = deriveInstrumentAvailability({
    scheduleState: {
      phase: 'unknown',
      isOpen: false,
      isExtendedHours: false,
      nextChangeAt: null,
      nextRegularOpen: null,
      nextRegularClose: null,
      nextExtendedOpen: null,
      nextExtendedClose: null,
      lastRegularClose: null,
    },
    snapshot: {
      conid: 1,
      last: 4975,
      displayPrice: 4975,
      displayChange: 0,
      displayChangePct: '0%',
      displaySource: 'mid',
      symbol: 'XAUUSD',
      companyName: 'Gold',
      mdAvailability: 'R',
      marketDataStatus: 'live',
      bid: 4974,
      bidSize: 1,
      ask: 4976,
      askSize: 1,
      change: 0,
      changePct: '0%',
      volume: 0,
      dayLow: 0,
      dayHigh: 0,
      open: 0,
      prevClose: 0,
      updated: Date.now(),
      hasLiveData: true,
    },
  });

  assert.equal(availability.key, 'open-live');
  assert.equal(availability.label, 'Live · Session unavailable');
});
