import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveMarketScheduleState,
  formatMarketSessionDetail,
  getMarketSessionPresentation,
  getMarketSessionVerbosePresentation,
  normalizeMarketSchedule,
} from './market-schedule.ts';

function toSecs(iso: string) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

test('normalizeMarketSchedule keeps liquid and extended windows and derives regular session state', () => {
  const nowMs = new Date('2026-03-11T15:00:00.000Z').getTime();
  const schedule = normalizeMarketSchedule(
    {
      exchange_time_zone: 'US/Eastern',
      schedules: {
        '20260311': {
          liquid_hours: [
            {
              opening: toSecs('2026-03-11T14:30:00.000Z'),
              closing: toSecs('2026-03-11T21:00:00.000Z'),
            },
          ],
          extended_hours: [
            {
              opening: toSecs('2026-03-11T09:00:00.000Z'),
              closing: toSecs('2026-03-12T01:00:00.000Z'),
              cancel_daily_orders: true,
            },
          ],
        },
      },
    },
    265598,
    'NASDAQ',
    nowMs
  );

  assert.equal(schedule.conid, 265598);
  assert.equal(schedule.exchange, 'NASDAQ');
  assert.equal(schedule.timezone, 'US/Eastern');
  assert.equal(schedule.days.length, 1);
  assert.equal(schedule.days[0].liquidHours.length, 1);
  assert.equal(schedule.days[0].extendedHours.length, 1);
  assert.equal(schedule.days[0].extendedHours[0].cancelDailyOrders, true);
  assert.equal(schedule.state.phase, 'regular');
  assert.equal(schedule.state.isOpen, true);
  assert.equal(
    schedule.state.nextRegularClose,
    new Date('2026-03-11T21:00:00.000Z').getTime()
  );
});

test('deriveMarketScheduleState marks the market closed and finds the next session boundary', () => {
  const schedule = normalizeMarketSchedule(
    {
      exchange_time_zone: 'US/Eastern',
      schedules: {
        '20260311': {
          liquid_hours: [
            {
              opening: toSecs('2026-03-11T14:30:00.000Z'),
              closing: toSecs('2026-03-11T21:00:00.000Z'),
            },
          ],
          extended_hours: [
            {
              opening: toSecs('2026-03-11T09:00:00.000Z'),
              closing: toSecs('2026-03-12T01:00:00.000Z'),
            },
          ],
        },
        '20260312': {
          liquid_hours: [
            {
              opening: toSecs('2026-03-12T14:30:00.000Z'),
              closing: toSecs('2026-03-12T21:00:00.000Z'),
            },
          ],
          extended_hours: [
            {
              opening: toSecs('2026-03-12T09:00:00.000Z'),
              closing: toSecs('2026-03-13T01:00:00.000Z'),
            },
          ],
        },
      },
    },
    265598,
    'NASDAQ',
    new Date('2026-03-11T22:30:00.000Z').getTime()
  );

  const state = deriveMarketScheduleState(
    schedule,
    new Date('2026-03-12T03:00:00.000Z').getTime()
  );

  assert.equal(state.phase, 'closed');
  assert.equal(state.isOpen, false);
  assert.equal(
    state.lastRegularClose,
    new Date('2026-03-11T21:00:00.000Z').getTime()
  );
  assert.equal(
    state.nextExtendedOpen,
    new Date('2026-03-12T09:00:00.000Z').getTime()
  );
  assert.equal(state.nextChangeAt, state.nextExtendedOpen);
});

test('formatMarketSessionDetail returns local-time session text with countdown', () => {
  const schedule = normalizeMarketSchedule(
    {
      exchange_time_zone: 'US/Eastern',
      schedules: {
        '20260311': {
          liquid_hours: [
            {
              opening: toSecs('2026-03-11T14:30:00.000Z'),
              closing: toSecs('2026-03-11T21:00:00.000Z'),
            },
          ],
        },
      },
    },
    265598,
    'NASDAQ',
    new Date('2026-03-11T15:00:00.000Z').getTime()
  );

  assert.equal(
    formatMarketSessionDetail(
      schedule,
      new Date('2026-03-11T15:00:00.000Z').getTime(),
      'Australia/Brisbane'
    ),
    '00:30-07:00 T-06:00:00'
  );
});

test('formatMarketSessionDetail adds seconds inside the 10 minute countdown window', () => {
  const schedule = normalizeMarketSchedule(
    {
      exchange_time_zone: 'US/Eastern',
      schedules: {
        '20260311': {
          liquid_hours: [
            {
              opening: toSecs('2026-03-11T14:30:00.000Z'),
              closing: toSecs('2026-03-11T21:00:00.000Z'),
            },
          ],
        },
      },
    },
    265598,
    'NASDAQ',
    new Date('2026-03-11T20:51:15.000Z').getTime()
  );

  assert.equal(
    formatMarketSessionDetail(
      schedule,
      new Date('2026-03-11T20:51:15.000Z').getTime(),
      'Australia/Brisbane'
    ),
    '00:30-07:00 T-00:08:45'
  );
});

test('24 hour-like sessions suppress countdown text', () => {
  const schedule = normalizeMarketSchedule(
    {
      exchange_time_zone: 'UTC',
      schedules: {
        '20260311': {
          extended_hours: [
            {
              opening: toSecs('2026-03-11T06:01:00.000Z'),
              closing: toSecs('2026-03-12T06:00:00.000Z'),
            },
          ],
        },
      },
    },
    479624278,
    'PAXOS',
    new Date('2026-03-11T12:00:00.000Z').getTime()
  );

  const presentation = getMarketSessionPresentation(
    schedule,
    new Date('2026-03-11T12:00:00.000Z').getTime(),
    'Australia/Brisbane'
  );

  assert.equal(presentation?.rangeText, '16:01-16:00 (+1d)');
  assert.equal(presentation?.countdownText, null);
  assert.equal(
    formatMarketSessionDetail(
      schedule,
      new Date('2026-03-11T12:00:00.000Z').getTime(),
      'Australia/Brisbane'
    ),
    '16:01-16:00 (+1d)'
  );
});

test('extended session verbose presentation uses close as the primary boundary', () => {
  const schedule = normalizeMarketSchedule(
    {
      exchange_time_zone: 'US/Eastern',
      schedules: {
        '20260311': {
          liquid_hours: [
            {
              opening: toSecs('2026-03-11T14:30:00.000Z'),
              closing: toSecs('2026-03-11T21:00:00.000Z'),
            },
          ],
          extended_hours: [
            {
              opening: toSecs('2026-03-11T08:00:00.000Z'),
              closing: toSecs('2026-03-12T00:00:00.000Z'),
            },
          ],
        },
      },
    },
    265598,
    'NASDAQ',
    new Date('2026-03-11T12:00:00.000Z').getTime()
  );

  const verbose = getMarketSessionVerbosePresentation(
    schedule,
    new Date('2026-03-11T12:00:00.000Z').getTime(),
    'Australia/Brisbane'
  );

  assert.equal(verbose?.phaseLabel, 'Extended Session');
  assert.equal(verbose?.primaryBoundaryLabel, 'Extended closes');
  assert.equal(verbose?.primaryBoundaryText, 'Thu 12 Mar, 10:00');
  assert.equal(verbose?.secondaryBoundaryLabel, 'Regular opens');
  assert.equal(verbose?.secondaryBoundaryText, 'Thu 12 Mar, 00:30');
});

test('empty schedules stay unknown instead of being marked closed', () => {
  const schedule = normalizeMarketSchedule(
    {
      exchange_time_zone: 'UTC',
      schedules: {},
    },
    69067924,
    'IBCMDTY',
    new Date('2026-03-16T00:00:00.000Z').getTime()
  );

  assert.equal(schedule.state.phase, 'unknown');
  assert.equal(schedule.state.isOpen, false);
  assert.equal(schedule.state.nextChangeAt, null);
});
