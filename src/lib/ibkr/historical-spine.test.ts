import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHistoricalSpine,
  sliceHistoricalSpineForTimeframe,
} from './historical-spine.ts';
import { getChartTimeframe } from './chart-presets.ts';
import type { HistoricalBar } from './types.ts';

function makeBars(
  startIso: string,
  count: number,
  stepHours: number,
  startValue = 100
): HistoricalBar[] {
  const startMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, index) => {
    const value = startValue + index;
    return {
      time: startMs + index * stepHours * 60 * 60 * 1000,
      open: value,
      high: value,
      low: value,
      close: value,
      volume: 1,
    };
  });
}

test('buildHistoricalSpine prefers finer bars in overlapping coverage and fills gaps with coarser bars', () => {
  const coarse = makeBars('2026-03-01T00:00:00Z', 5, 24, 10);
  const fine = makeBars('2026-03-03T00:00:00Z', 4, 1, 100);

  const spine = buildHistoricalSpine([
    {
      historyBars: coarse,
      requestBar: '1d',
      fetchedAt: 1,
      timeframeKey: '1Y',
    },
    {
      historyBars: fine,
      requestBar: '1h',
      fetchedAt: 2,
      timeframeKey: '1M',
    },
  ]);

  assert.deepEqual(
    spine.map((bar) => ({ time: bar.time, close: bar.close })),
    [
      { time: coarse[0].time, close: coarse[0].close },
      { time: coarse[1].time, close: coarse[1].close },
      { time: fine[0].time, close: fine[0].close },
      { time: fine[1].time, close: fine[1].close },
      { time: fine[2].time, close: fine[2].close },
      { time: fine[3].time, close: fine[3].close },
      { time: coarse[3].time, close: coarse[3].close },
      { time: coarse[4].time, close: coarse[4].close },
    ]
  );
});

test('sliceHistoricalSpineForTimeframe includes the prior anchor bar before the visible window', () => {
  const timeframe = getChartTimeframe('1W');
  const spine = makeBars('2026-03-01T00:00:00Z', 10, 24, 50);

  const sliced = sliceHistoricalSpineForTimeframe(spine, timeframe);

  assert.equal(sliced[0]?.time, spine[1]?.time);
  assert.equal(sliced[1]?.time, spine[2]?.time);
  assert.equal(sliced[sliced.length - 1]?.time, spine[9]?.time);
});

test('sliceHistoricalSpineForTimeframe narrows a wider source down to the requested window', () => {
  const timeframe = getChartTimeframe('4h');
  const spine = makeBars('2026-03-13T00:00:00Z', 12, 1, 200);

  const sliced = sliceHistoricalSpineForTimeframe(spine, timeframe);

  assert.equal(sliced.length, 6);
  assert.equal(sliced[0]?.time, spine[6]?.time);
  assert.equal(sliced[1]?.time, spine[7]?.time);
  assert.equal(sliced[sliced.length - 1]?.time, spine[11]?.time);
});
