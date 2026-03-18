'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Liveline } from 'liveline';
import type {
  LivelinePoint,
  CandlePoint as LivelineCandlePoint,
  Padding as LivelinePadding,
} from 'liveline';
import { MarketSessionText } from '@/components/market/MarketSessionText';
import { MarketStatusInline } from '@/components/market/MarketStatus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CHART_RESOLUTIONS,
  CHART_TIMEFRAMES,
  DEFAULT_CHART_TIMEFRAME_KEY,
  getAvailableChartResolutions,
  getChartResolution,
  getChartTimeframe,
  type ChartResolution,
  type ChartTimeframe,
} from '@/lib/ibkr/chart-presets';
import {
  alignToBucket,
  buildHistoricalBucketedLinePoints,
  normalizeLinePoints,
  sortBars,
} from '@/lib/ibkr/chart-series';
import {
  getMarketDataDisplayDotClass,
  getMarketDataDisplayLabel,
  getMarketDataDisplayTextClass,
} from '@/lib/ibkr/display-status';
import { buildHistorySeed } from '@/lib/ibkr/liveline-feed';
import { useChartFeed } from '@/lib/ibkr/useChartFeed';
import type { HistoricalBar } from '@/lib/ibkr/types';
import { recordChartDiagnostic } from '@/lib/dev/chart-diagnostics';
import { useSharedChartViewStore } from '@/lib/store/chart';
import { useThemeStore } from '@/lib/store/theme';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';

interface PriceChartProps {
  conid: number;
  symbol?: string;
  exchange?: string;
  color?: string;
  height?: number;
  className?: string;
  snapshotLast?: number;
  snapshotUpdatedAt?: number;
  snapshotMarketDataStatus?: 'live' | 'delayed' | 'frozen' | 'unavailable' | 'unknown';
  defaultTimeframeKey?: string;
  defaultResolutionKey?: string;
  defaultMode?: 'line' | 'candle';
  lineOnly?: boolean;
  referenceLine?: { value: number; label?: string };
  showModeToggle?: boolean;
  showWindowControls?: boolean;
  showValueLabel?: boolean;
  showBadge?: boolean;
  showGrid?: boolean;
  padding?: LivelinePadding;
  stateScope?: string;
  streamingEnabled?: boolean;
  interactive?: boolean;
}

const MAX_LINE_POINTS = 5000;
const MAX_CANDLES = 2000;
const STALE_MARKET_THRESHOLD_SECS = 15 * 60;
const MIN_CANDLE_RESOLUTION_SECS = 60;
const CANDLE_RESOLUTION_TARGET_POINTS = 180;
const MIN_VIABLE_CANDLE_COUNT = 2;
const MIN_VIABLE_CANDLE_RATIO = 0.05;
const WINDOW_CONTRACTION_TRANSITION_MIN_MS = 650;
const WINDOW_CONTRACTION_TRANSITION_MAX_MS = 1800;
const LINE_MORPH_TRANSITION_MIN_MS = 260;
const LINE_MORPH_TRANSITION_MAX_MS = 900;
const MODE_TRANSITION_MS = 320;
const LINE_MORPH_MIN_POINTS = 72;
const LINE_MORPH_MAX_POINTS = 320;
const TIMEFRAME_TRAVERSAL_ANCHOR_KEYS = ['5m', '1h', '1D', '1M', '1Y'] as const;
const TIMEFRAME_TRAVERSAL_MIN_SEGMENT_MS = 650;
const TIMEFRAME_TRAVERSAL_COMMIT_RATIO = 0.92;
const TIMEFRAME_TRAVERSAL_MIN_COMMIT_MS = 420;
const LINE_RESOLUTION_OVERRIDES: Partial<Record<string, string[]>> = {
  '1M': ['1h', '4h', '1D'],
};

function getWindowContractionTransitionMs(
  currentWindowSecs: number,
  nextWindowSecs: number
): number {
  if (nextWindowSecs >= currentWindowSecs) {
    return WINDOW_CONTRACTION_TRANSITION_MIN_MS;
  }

  const ratio = Math.max(currentWindowSecs / Math.max(nextWindowSecs, 1), 1);
  const scaled =
    WINDOW_CONTRACTION_TRANSITION_MIN_MS +
    Math.log2(ratio) * 110;

  return Math.round(
    Math.max(
      WINDOW_CONTRACTION_TRANSITION_MIN_MS,
      Math.min(WINDOW_CONTRACTION_TRANSITION_MAX_MS, scaled)
    )
  );
}

function getWindowTraversalTransitionMs(
  currentWindowSecs: number,
  nextWindowSecs: number
): number {
  if (currentWindowSecs === nextWindowSecs) {
    return WINDOW_CONTRACTION_TRANSITION_MIN_MS;
  }

  return getWindowContractionTransitionMs(
    Math.max(currentWindowSecs, nextWindowSecs),
    Math.min(currentWindowSecs, nextWindowSecs)
  );
}

function getLineMorphTransitionMs(params: {
  currentWindowSecs: number;
  nextWindowSecs: number;
  currentBucketSecs: number;
  nextBucketSecs: number;
}): number {
  const {
    currentWindowSecs,
    nextWindowSecs,
    currentBucketSecs,
    nextBucketSecs,
  } = params;
  const windowRatio = Math.max(
    currentWindowSecs / Math.max(nextWindowSecs, 1),
    nextWindowSecs / Math.max(currentWindowSecs, 1),
    1
  );
  const bucketRatio = Math.max(
    currentBucketSecs / Math.max(nextBucketSecs, 1),
    nextBucketSecs / Math.max(currentBucketSecs, 1),
    1
  );
  const scaled =
    LINE_MORPH_TRANSITION_MIN_MS +
    Math.log2(windowRatio) * 110 +
    Math.log2(bucketRatio) * 80;

  return Math.round(
    Math.max(
      LINE_MORPH_TRANSITION_MIN_MS,
      Math.min(LINE_MORPH_TRANSITION_MAX_MS, scaled)
    )
  );
}

function countDecimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value.toString().toLowerCase();
  if (normalized.includes('e')) {
    const fixed = value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    return fixed.includes('.') ? fixed.split('.')[1].length : 0;
  }
  return normalized.includes('.') ? normalized.split('.')[1].length : 0;
}

function inferValuePrecision(values: number[]): number {
  let precision = 0;

  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    precision = Math.max(precision, countDecimals(value));
  }

  return Math.min(precision, 8);
}

function getSourceBarSecs(bars: HistoricalBar[]): number {
  let minDiffSecs = Number.POSITIVE_INFINITY;

  for (let index = 1; index < bars.length; index += 1) {
    const diffSecs = Math.round((bars[index].time - bars[index - 1].time) / 1000);
    if (diffSecs > 0 && diffSecs < minDiffSecs) {
      minDiffSecs = diffSecs;
    }
  }
  return Number.isFinite(minDiffSecs) ? minDiffSecs : 60;
}

function shiftLinePoints(
  points: LivelinePoint[],
  offsetSecs: number
): LivelinePoint[] {
  if (offsetSecs <= 0) return points;
  return points.map((point) => ({
    ...point,
    time: point.time + offsetSecs,
  }));
}

function shiftCandles(
  candles: LivelineCandlePoint[],
  offsetSecs: number
): LivelineCandlePoint[] {
  if (offsetSecs <= 0) return candles;
  return candles.map((candle) => ({
    ...candle,
    time: candle.time + offsetSecs,
  }));
}

function easeInOutCubic(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function getLineWindowRange(
  points: LivelinePoint[],
  windowSecs: number
): { startTime: number; endTime: number } | null {
  const lastTime = points[points.length - 1]?.time;
  if (!Number.isFinite(lastTime)) return null;
  return {
    startTime: lastTime - windowSecs + 1,
    endTime: lastTime,
  };
}

function getVisibleLinePoints(
  points: LivelinePoint[],
  windowSecs: number
): LivelinePoint[] {
  const range = getLineWindowRange(points, windowSecs);
  if (!range) return [];
  return points.filter((point) => point.time >= range.startTime);
}

function computeLineDisplayRange(params: {
  points: LivelinePoint[];
  currentValue: number;
  referenceValue?: number;
}): { min: number; max: number } | null {
  const { points, currentValue, referenceValue } = params;
  let min = Infinity;
  let max = -Infinity;

  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }

  if (Number.isFinite(currentValue)) {
    if (currentValue < min) min = currentValue;
    if (currentValue > max) max = currentValue;
  }

  if (referenceValue != null && Number.isFinite(referenceValue)) {
    if (referenceValue < min) min = referenceValue;
    if (referenceValue > max) max = referenceValue;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  const rawRange = max - min;
  const minRange = rawRange * 0.1 || 0.4;
  if (rawRange < minRange) {
    const mid = (min + max) / 2;
    return {
      min: mid - minRange / 2,
      max: mid + minRange / 2,
    };
  }

  const margin = rawRange * 0.12;
  return {
    min: min - margin,
    max: max + margin,
  };
}

function computeLineMorphRangeLock(params: {
  from: LivelinePoint[];
  to: LivelinePoint[];
  windowSecs: number;
  fromValue: number;
  toValue: number;
  referenceValue?: number;
}): { min: number; max: number } | null {
  const { from, to, windowSecs, fromValue, toValue, referenceValue } = params;
  const visibleFrom = getVisibleLinePoints(from, windowSecs);
  const visibleTo = getVisibleLinePoints(to, windowSecs);
  const combined = [...visibleFrom, ...visibleTo];

  return computeLineDisplayRange({
    points: combined,
    currentValue:
      Number.isFinite(fromValue) && Number.isFinite(toValue)
        ? (fromValue + toValue) / 2
        : Number.isFinite(toValue)
          ? toValue
          : fromValue,
    referenceValue,
  });
}

function computeValueDisplayRange(params: {
  values: number[];
  currentValue?: number;
  referenceValue?: number;
}): { min: number; max: number } | null {
  const { values, currentValue, referenceValue } = params;
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (currentValue != null && Number.isFinite(currentValue)) {
    if (currentValue < min) min = currentValue;
    if (currentValue > max) max = currentValue;
  }

  if (referenceValue != null && Number.isFinite(referenceValue)) {
    if (referenceValue < min) min = referenceValue;
    if (referenceValue > max) max = referenceValue;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  const rawRange = max - min;
  const minRange = rawRange * 0.1 || 0.4;
  if (rawRange < minRange) {
    const mid = (min + max) / 2;
    return {
      min: mid - minRange / 2,
      max: mid + minRange / 2,
    };
  }

  const margin = rawRange * 0.12;
  return {
    min: min - margin,
    max: max + margin,
  };
}

function computeModeTransitionRangeLock(params: {
  mode: 'line' | 'candle';
  line: LivelinePoint[];
  candles: LivelineCandlePoint[];
  liveCandle?: LivelineCandlePoint;
  windowSecs: number;
  currentValue: number;
  referenceValue?: number;
}): { min: number; max: number } | null {
  const {
    mode,
    line,
    candles,
    liveCandle,
    windowSecs,
    currentValue,
    referenceValue,
  } = params;
  const range = getLineWindowRange(line, windowSecs);
  const startTime = range?.startTime ?? -Infinity;

  if (mode === 'line') {
    return computeLineDisplayRange({
      points: getVisibleLinePoints(line, windowSecs),
      currentValue,
      referenceValue,
    });
  }

  const values: number[] = [];
  for (const candle of candles) {
    if (candle.time < startTime) continue;
    if (Number.isFinite(candle.high)) values.push(candle.high);
    if (Number.isFinite(candle.low)) values.push(candle.low);
  }

  if (liveCandle && liveCandle.time >= startTime) {
    if (Number.isFinite(liveCandle.high)) values.push(liveCandle.high);
    if (Number.isFinite(liveCandle.low)) values.push(liveCandle.low);
  }

  return computeValueDisplayRange({
    values,
    currentValue,
    referenceValue,
  });
}

function sampleLineOnGrid(
  points: LivelinePoint[],
  times: number[]
): number[] {
  if (points.length === 0) {
    return times.map(() => 0);
  }

  const sorted = normalizeLinePoints(points);
  if (sorted.length === 0) {
    return times.map(() => 0);
  }

  const values: number[] = [];
  let cursor = 0;

  for (const time of times) {
    while (cursor + 1 < sorted.length && sorted[cursor + 1].time <= time) {
      cursor += 1;
    }

    const left = sorted[cursor];
    const right = sorted[cursor + 1];

    if (!right) {
      values.push(left.value);
      continue;
    }

    if (time <= left.time) {
      values.push(left.value);
      continue;
    }

    const span = right.time - left.time;
    if (span <= 0) {
      values.push(right.value);
      continue;
    }

    const progress = (time - left.time) / span;
    values.push(left.value + (right.value - left.value) * progress);
  }

  return values;
}

function buildLineMorphSource(params: {
  from: LivelinePoint[];
  to: LivelinePoint[];
  windowSecs: number;
  lockWindow: boolean;
}): { times: number[]; fromValues: number[]; toValues: number[] } | null {
  const { from, to, windowSecs, lockWindow } = params;
  if (from.length === 0 || to.length === 0) return null;

  const fromRange = getLineWindowRange(from, windowSecs);
  const toRange = getLineWindowRange(to, windowSecs);
  if (!fromRange || !toRange) return null;

  const endTime = Math.max(fromRange.endTime, toRange.endTime);
  const startTime = lockWindow
    ? endTime - windowSecs + 1
    : Math.min(fromRange.startTime, toRange.startTime);
  if (!(endTime > startTime)) return null;

  const visibleFrom = from.filter((point) => point.time >= startTime);
  const visibleTo = to.filter((point) => point.time >= startTime);
  if (visibleFrom.length === 0 || visibleTo.length === 0) return null;

  const sampleCount = Math.max(
    LINE_MORPH_MIN_POINTS,
    Math.min(
      LINE_MORPH_MAX_POINTS,
      Math.max(visibleFrom.length, visibleTo.length)
    )
  );
  const times =
    sampleCount <= 1
      ? [endTime]
      : Array.from({ length: sampleCount }, (_, index) => {
          const progress = index / (sampleCount - 1);
          return startTime + Math.round((endTime - startTime) * progress);
        });

  return {
    times,
    fromValues: sampleLineOnGrid(visibleFrom, times),
    toValues: sampleLineOnGrid(visibleTo, times),
  };
}

function buildCandlesFromLinePoints(
  points: LivelinePoint[],
  bucketSecs: number
): LivelineCandlePoint[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const candles: LivelineCandlePoint[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index];
    const next = sorted[index + 1];
    const bucketTime = alignToBucket(point.time, bucketSecs);

    if (candles[candles.length - 1]?.time === bucketTime) continue;

    const close =
      next && next.time <= bucketTime + bucketSecs
        ? next.value
        : point.value;

    candles.push({
      time: bucketTime,
      open: point.value,
      high: Math.max(point.value, close),
      low: Math.min(point.value, close),
      close,
    });
  }

  return candles.slice(-MAX_CANDLES);
}

function buildCandlesFromBars(
  bars: HistoricalBar[],
  windowSecs: number,
  bucketSecs: number,
  sourceBarSecs: number
): LivelineCandlePoint[] {
  if (bars.length === 0) return [];
  if (bucketSecs < sourceBarSecs) {
    return buildCandlesFromLinePoints(
      buildHistoricalBucketedLinePoints(
        bars,
        windowSecs,
        bucketSecs,
        MAX_LINE_POINTS
      ),
      bucketSecs
    );
  }

  const sorted = sortBars(bars);
  const endTime = Math.floor(sorted[sorted.length - 1].time / 1000);
  const startTime = endTime - windowSecs;
  const grouped = new Map<number, LivelineCandlePoint>();

  for (const bar of sorted) {
    const time = Math.floor(bar.time / 1000);
    if (time < startTime) continue;

    const bucketTime = alignToBucket(time, bucketSecs);
    const existing = grouped.get(bucketTime);

    if (!existing) {
      grouped.set(bucketTime, {
        time: bucketTime,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
      continue;
    }

    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
  }

  return Array.from(grouped.values())
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_CANDLES);
}

function buildHistorySeries(
  bars: HistoricalBar[],
  timeframe: ChartTimeframe,
  resolution: ChartResolution
) {
  const sorted = sortBars(bars);
  const sourceBarSecs = getSourceBarSecs(sorted);
  const line = buildHistoricalBucketedLinePoints(
    sorted,
    timeframe.windowSecs,
    resolution.bucketSecs,
    MAX_LINE_POINTS
  );
  const candles = buildCandlesFromBars(
    sorted,
    timeframe.windowSecs,
    resolution.bucketSecs,
    sourceBarSecs
  );
  const lastValue = line[line.length - 1]?.value ?? sorted[sorted.length - 1]?.close ?? 0;

  return {
    line,
    candles,
    lastValue,
  };
}

function supportsResolution(
  timeframe: ChartTimeframe,
  resolution: ChartResolution,
  mode: 'line' | 'candle'
): boolean {
  if (mode === 'candle' && resolution.bucketSecs < MIN_CANDLE_RESOLUTION_SECS) {
    return false;
  }

  return getAvailableChartResolutions(timeframe).some(
    (candidate) => candidate.key === resolution.key
  );
}

function getBestResolutionForTimeframe(
  timeframe: ChartTimeframe,
  preferredResolutionKey: string | undefined,
  mode: 'line' | 'candle'
): ChartResolution {
  const visibleResolutions = getVisibleResolutionsForTimeframe(timeframe, mode);

  if (preferredResolutionKey) {
    const preferred = getChartResolution(preferredResolutionKey);
    if (visibleResolutions.some((candidate) => candidate.key === preferred.key)) {
      return preferred;
    }
  }

  const fallback = visibleResolutions[0];

  return fallback ?? getChartResolution(timeframe.defaultResolutionKey);
}

function getBestTimeframeForResolution(
  resolution: ChartResolution,
  preferredTimeframeKey: string | undefined,
  mode: 'line' | 'candle'
): ChartTimeframe {
  if (preferredTimeframeKey) {
    const preferred = getChartTimeframe(preferredTimeframeKey);
    if (supportsResolution(preferred, resolution, mode)) {
      return preferred;
    }
  }

  return (
    CHART_TIMEFRAMES.find((timeframe) =>
      supportsResolution(timeframe, resolution, mode)
    ) ?? getChartTimeframe()
  );
}

function getVisibleResolutionsForTimeframe(
  timeframe: ChartTimeframe,
  mode: 'line' | 'candle'
): ChartResolution[] {
  if (mode === 'line') {
    const overrideKeys = LINE_RESOLUTION_OVERRIDES[timeframe.key];
    if (overrideKeys) {
      const overridden = overrideKeys
        .map((key) => CHART_RESOLUTIONS.find((resolution) => resolution.key === key))
        .filter((resolution): resolution is ChartResolution => Boolean(resolution));

      if (overridden.length > 0) {
        return overridden;
      }
    }
  }

  const supported = CHART_RESOLUTIONS.filter((resolution) =>
    supportsResolution(timeframe, resolution, mode)
  );

  if (supported.length <= 1) {
    return supported;
  }

  if (mode === 'candle') {
    const visible = supported.filter(
      (resolution) =>
        timeframe.windowSecs / resolution.bucketSecs <=
        CANDLE_RESOLUTION_TARGET_POINTS
    );

    return visible.length > 0 ? visible : [supported[supported.length - 1]];
  }

  return supported;
}

function buildTimeframeTraversalPath(
  currentTimeframeKey: string,
  nextTimeframeKey: string
): ChartTimeframe[] {
  const currentTimeframe = getChartTimeframe(currentTimeframeKey);
  const nextTimeframe = getChartTimeframe(nextTimeframeKey);

  if (currentTimeframe.key === nextTimeframe.key) {
    return [];
  }

  const direction = nextTimeframe.windowSecs > currentTimeframe.windowSecs ? 1 : -1;
  const anchors = TIMEFRAME_TRAVERSAL_ANCHOR_KEYS.map((key) => getChartTimeframe(key))
    .filter((timeframe) => {
      if (direction > 0) {
        return (
          timeframe.windowSecs > currentTimeframe.windowSecs &&
          timeframe.windowSecs < nextTimeframe.windowSecs
        );
      }

      return (
        timeframe.windowSecs < currentTimeframe.windowSecs &&
        timeframe.windowSecs > nextTimeframe.windowSecs
      );
    })
    .sort((left, right) =>
      direction > 0
        ? left.windowSecs - right.windowSecs
        : right.windowSecs - left.windowSecs
    );

  const path = [...anchors, nextTimeframe];

  return path.filter(
    (timeframe, index) =>
      index === 0 || timeframe.key !== path[index - 1]?.key
  );
}

export function PriceChart({
  conid,
  symbol,
  exchange,
  color = '#00e676',
  height,
  className,
  snapshotLast,
  snapshotUpdatedAt,
  snapshotMarketDataStatus = 'unknown',
  defaultTimeframeKey,
  defaultResolutionKey,
  defaultMode = 'line',
  lineOnly = false,
  referenceLine,
  showModeToggle = true,
  showWindowControls = true,
  showValueLabel = false,
  showBadge = true,
  showGrid = true,
  padding,
  stateScope,
  streamingEnabled = true,
  interactive = true,
}: PriceChartProps) {
  const resolvedDefaultMode = lineOnly ? 'line' : defaultMode;
  const resolvedDefaultTimeframe = getChartTimeframe(
    defaultTimeframeKey ??
      (showWindowControls ? DEFAULT_CHART_TIMEFRAME_KEY : '1D')
  );
  const resolvedDefaultResolution = getBestResolutionForTimeframe(
    resolvedDefaultTimeframe,
    defaultResolutionKey ?? resolvedDefaultTimeframe.defaultResolutionKey,
    resolvedDefaultMode
  );
  const sharedView = useSharedChartViewStore((s) =>
    stateScope ? s.entries[stateScope] : undefined
  );
  const setSharedView = useSharedChartViewStore((s) => s.setEntry);
  const initialMode = lineOnly ? 'line' : sharedView?.mode ?? resolvedDefaultMode;
  const initialTimeframe = getChartTimeframe(
    sharedView?.timeframeKey ?? resolvedDefaultTimeframe.key
  );
  const initialResolution = getBestResolutionForTimeframe(
    initialTimeframe,
    sharedView?.resolutionKey ??
      defaultResolutionKey ??
      initialTimeframe.defaultResolutionKey,
    initialMode
  );
  const initialResolutionByTimeframe =
    sharedView?.resolutionByTimeframe ?? {
      [initialTimeframe.key]: initialResolution.key,
    };

  const [mode, setMode] = useState<'line' | 'candle'>(initialMode);
  const [timeframeKey, setTimeframeKey] = useState(initialTimeframe.key);
  const [viewTimeframeKey, setViewTimeframeKey] = useState(initialTimeframe.key);
  const [resolutionKey, setResolutionKey] = useState(initialResolution.key);
  const [viewResolutionKey, setViewResolutionKey] = useState(initialResolution.key);
  const [resolutionByTimeframe, setResolutionByTimeframe] = useState<
    Record<string, string>
  >(initialResolutionByTimeframe);
  const [pendingTimeframeTargetKey, setPendingTimeframeTargetKey] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const theme = useThemeStore((s) => s.theme);

  const hoverActiveRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const staleAnchorRef = useRef<{
    conid: number;
    timeframeKey: string;
    latestMarketTime: number;
  } | null>(null);
  const timeframeCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const timeframeTraversalTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const modeTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineMorphFrameRef = useRef<number | null>(null);
  const lineMorphIntentRef = useRef<{
    durationMs: number;
    lockYRange: boolean;
    lockWindow: boolean;
  } | null>(null);
  const presentedLineRef = useRef<LivelinePoint[]>([]);
  const presentedValueRef = useRef(0);
  const [staleShiftSecs, setStaleShiftSecs] = useState(0);
  const [lineMorphToken, setLineMorphToken] = useState(0);
  const [lineMorphState, setLineMorphState] = useState<{
    line: LivelinePoint[];
    value: number;
  } | null>(null);
  const [lineMorphRangeLock, setLineMorphRangeLock] = useState<{
    min: number;
    max: number;
  } | null>(null);
  const [modeTransitionRangeLock, setModeTransitionRangeLock] = useState<{
    min: number;
    max: number;
  } | null>(null);
  const [persistedModeRangeSource, setPersistedModeRangeSource] = useState<
    'line' | 'candle' | null
  >(null);
  const nowMs = useNow(1000, showWindowControls);

  useEffect(() => {
    if (timeframeCommitTimeoutRef.current) {
      clearTimeout(timeframeCommitTimeoutRef.current);
      timeframeCommitTimeoutRef.current = null;
    }
    if (!showWindowControls) {
      setMode(resolvedDefaultMode);
      setTimeframeKey(resolvedDefaultTimeframe.key);
      setViewTimeframeKey(resolvedDefaultTimeframe.key);
      setResolutionKey(resolvedDefaultResolution.key);
      setViewResolutionKey(resolvedDefaultResolution.key);
    }
    setPersistedModeRangeSource(null);
    staleAnchorRef.current = null;
    setStaleShiftSecs(0);
  }, [
    conid,
    resolvedDefaultMode,
    resolvedDefaultResolution.key,
    resolvedDefaultTimeframe.key,
    showWindowControls,
  ]);

  useEffect(() => {
    if (lineOnly && mode !== 'line') {
      setMode('line');
    }
  }, [lineOnly, mode]);

  useEffect(() => {
    return () => {
      if (timeframeCommitTimeoutRef.current) {
        clearTimeout(timeframeCommitTimeoutRef.current);
      }
      for (const timeoutId of timeframeTraversalTimeoutsRef.current) {
        clearTimeout(timeoutId);
      }
      timeframeTraversalTimeoutsRef.current = [];
      if (modeTransitionTimeoutRef.current) {
        clearTimeout(modeTransitionTimeoutRef.current);
      }
      if (lineMorphFrameRef.current != null) {
        cancelAnimationFrame(lineMorphFrameRef.current);
      }
    };
  }, []);

  const queueLineMorph = useCallback(
    (durationMs: number, options?: { lockYRange?: boolean; lockWindow?: boolean }) => {
      lineMorphIntentRef.current = {
        durationMs,
        lockYRange: options?.lockYRange ?? false,
        lockWindow: options?.lockWindow ?? false,
      };
      setLineMorphToken((previous) => previous + 1);
    },
    []
  );

  useEffect(() => {
    setViewTimeframeKey(timeframeKey);
  }, [timeframeKey]);

  useEffect(() => {
    setViewResolutionKey(resolutionKey);
  }, [resolutionKey]);

  useEffect(() => {
    if (!pendingTimeframeTargetKey) return;
    if (
      timeframeKey === pendingTimeframeTargetKey &&
      viewTimeframeKey === pendingTimeframeTargetKey
    ) {
      setPendingTimeframeTargetKey(null);
    }
  }, [pendingTimeframeTargetKey, timeframeKey, viewTimeframeKey]);

  useEffect(() => {
    setResolutionByTimeframe((previous) => {
      if (previous[timeframeKey] === resolutionKey) {
        return previous;
      }

      return {
        ...previous,
        [timeframeKey]: resolutionKey,
      };
    });
  }, [resolutionKey, timeframeKey]);

  useEffect(() => {
    if (!stateScope || !showWindowControls) return;

    setSharedView(stateScope, {
      mode,
      timeframeKey,
      resolutionKey,
      resolutionByTimeframe,
    });
  }, [
    mode,
    resolutionKey,
    resolutionByTimeframe,
    setSharedView,
    showWindowControls,
    stateScope,
    timeframeKey,
  ]);

  const feedTimeframe = getChartTimeframe(timeframeKey);
  const activeTimeframe = getChartTimeframe(viewTimeframeKey);
  const feedResolution = getBestResolutionForTimeframe(
    feedTimeframe,
    resolutionKey,
    mode
  );
  const isTimeframeWindowTransition = viewTimeframeKey !== timeframeKey;
  const activeResolution = isTimeframeWindowTransition
    ? feedResolution
    : getBestResolutionForTimeframe(activeTimeframe, viewResolutionKey, mode);
  const baseSelectableResolutions = getVisibleResolutionsForTimeframe(
    activeTimeframe,
    mode
  );

  useEffect(() => {
    if (activeTimeframe.key !== feedTimeframe.key) {
      return;
    }
    if (!supportsResolution(activeTimeframe, activeResolution, mode)) {
      setResolutionKey(
        getBestResolutionForTimeframe(activeTimeframe, resolutionKey, mode).key
      );
    }
  }, [activeResolution, activeTimeframe, feedTimeframe.key, mode, resolutionKey]);
  const {
    bootstrap,
    snapshot,
    streamData,
    connected: socketConnected,
    schedule,
    scheduleState,
    effectiveMarketDataStatus,
    displayStatus,
    line: lineData,
    lineValue,
    lineLatestMarketTime,
    candles,
    liveCandle,
    candleValue,
    candleLatestMarketTime,
    waitingForDaemonCoverage,
  } = useChartFeed({
    conid,
    exchange,
    timeframe: feedTimeframe,
    resolution: feedResolution,
    mode,
    enableFeedClock: showWindowControls,
    streamingEnabled,
    debugLabel: showWindowControls ? symbol ?? String(conid) : undefined,
  });
  const selectableResolutions = useMemo(() => {
    if (mode !== 'candle') {
      return baseSelectableResolutions;
    }

    if (bootstrap.historyBars.length === 0) {
      return baseSelectableResolutions;
    }

    const viable = baseSelectableResolutions.filter((candidate) => {
      const seed = buildHistorySeed(
        bootstrap.historyBars,
        activeTimeframe,
        candidate
      );
      const sample = seed.candles.slice(-Math.min(120, seed.candles.length));
      if (sample.length < MIN_VIABLE_CANDLE_COUNT) {
        return false;
      }

      const nonFlatCount = sample.filter(
        (candle) =>
          Math.abs(candle.high - candle.low) > 0 ||
          Math.abs(candle.close - candle.open) > 0
      ).length;

      return nonFlatCount >= Math.max(
        MIN_VIABLE_CANDLE_COUNT,
        Math.ceil(sample.length * MIN_VIABLE_CANDLE_RATIO)
      );
    });

    return viable.length > 0
      ? viable
      : [baseSelectableResolutions[baseSelectableResolutions.length - 1]].filter(
          Boolean
        ) as ChartResolution[];
  }, [
    activeTimeframe,
    baseSelectableResolutions,
    bootstrap.historyBars,
    mode,
  ]);
  const historyLoaded = bootstrap.loaded;
  const historyError =
    Boolean(bootstrap.historyError) &&
    lineData.length === 0 &&
    candles.length === 0;
  const latestMarketTime = Math.max(
    lineLatestMarketTime ?? 0,
    candleLatestMarketTime ?? 0
  ) || null;
  const staleThresholdSecs = Math.min(
    STALE_MARKET_THRESHOLD_SECS,
    activeTimeframe.windowSecs
  );
  const sessionPhase = scheduleState?.phase ?? 'unknown';

  useEffect(() => {
    if (mode !== 'candle') {
      return;
    }

    if (selectableResolutions.length === 0) {
      return;
    }

    if (selectableResolutions.some((resolution) => resolution.key === activeResolution.key)) {
      return;
    }

    const fallbackResolution = selectableResolutions[0];
    if (!fallbackResolution) {
      return;
    }

    setResolutionKey((current) =>
      current === fallbackResolution.key ? current : fallbackResolution.key
    );
  }, [activeResolution.key, mode, selectableResolutions]);

  useEffect(() => {
    if (!latestMarketTime) {
      staleAnchorRef.current = null;
      setStaleShiftSecs(0);
      return;
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    if (sessionPhase === 'closed') {
      staleAnchorRef.current = null;
      setStaleShiftSecs(0);
      return;
    }

    const existing = staleAnchorRef.current;
    if (
      existing &&
      existing.conid === conid &&
      existing.timeframeKey === activeTimeframe.key &&
      existing.latestMarketTime === latestMarketTime
    ) {
      return;
    }

    if (nowSecs - latestMarketTime <= staleThresholdSecs) {
      staleAnchorRef.current = null;
      setStaleShiftSecs(0);
      return;
    }

    staleAnchorRef.current = {
      conid,
      timeframeKey: activeTimeframe.key,
      latestMarketTime,
    };
    setStaleShiftSecs(Math.max(0, nowSecs - latestMarketTime));
  }, [
    activeTimeframe.key,
    conid,
    effectiveMarketDataStatus,
    latestMarketTime,
    sessionPhase,
    staleThresholdSecs,
  ]);
  const isClosedMarketSession = sessionPhase === 'closed';
  const isStaleMarketSession = staleShiftSecs > 0;
  const isPausedMarketSession = isStaleMarketSession;
  const displayLineData = shiftLinePoints(lineData, staleShiftSecs);
  const displayCandles = shiftCandles(candles, staleShiftSecs);
  const displayLiveCandle = liveCandle
    ? {
        ...liveCandle,
        time: liveCandle.time + staleShiftSecs,
      }
    : undefined;
  const hasLiveQuote =
    displayStatus === 'live' || displayStatus === 'extended';
  const plottedLineValue =
    displayLineData[displayLineData.length - 1]?.value ??
    displayCandles[displayCandles.length - 1]?.close ??
    snapshot?.displayPrice ??
    snapshot?.last ??
    lineValue ??
    candleValue;
  const lineRenderedValue =
    hasLiveQuote && !isStaleMarketSession && lineValue > 0
      ? lineValue
      : displayLineData[displayLineData.length - 1]?.value ??
        snapshot?.displayPrice ??
        snapshot?.last ??
        lineValue ??
        plottedLineValue;
  const candleRenderedValue =
    displayLiveCandle?.close ??
    displayCandles[displayCandles.length - 1]?.close ??
    candleValue ??
    plottedLineValue;
  const renderedValue =
    mode === 'line' ? lineRenderedValue : candleRenderedValue;
  const transitionSignature = `${mode}:${activeTimeframe.key}:${activeResolution.key}:${timeframeKey}:${resolutionKey}`;

  useEffect(() => {
    presentedLineRef.current =
      mode === 'line' && lineMorphState ? lineMorphState.line : displayLineData;
    presentedValueRef.current =
      mode === 'line' && lineMorphState ? lineMorphState.value : lineRenderedValue;
  }, [displayLineData, lineMorphState, lineRenderedValue, mode]);

  useEffect(() => {
    if (mode !== 'line') {
      if (lineMorphFrameRef.current != null) {
        cancelAnimationFrame(lineMorphFrameRef.current);
        lineMorphFrameRef.current = null;
      }
      setLineMorphState(null);
      setLineMorphRangeLock(null);
      return;
    }

    const intent = lineMorphIntentRef.current;
    if (!intent) {
      return;
    }
    lineMorphIntentRef.current = null;

    const sourceLine = presentedLineRef.current;
    const targetLine = displayLineData;
    const sourceValue = presentedValueRef.current;
    const targetValue = lineRenderedValue;
    const morphSource = buildLineMorphSource({
      from: sourceLine,
      to: targetLine,
      windowSecs: activeTimeframe.windowSecs,
      lockWindow: intent.lockWindow,
    });

    if (
      !morphSource ||
      sourceLine.length === 0 ||
      targetLine.length === 0 ||
      (sourceLine.length === targetLine.length &&
        sourceLine[sourceLine.length - 1]?.time === targetLine[targetLine.length - 1]?.time &&
        sourceValue === targetValue)
    ) {
      setLineMorphState(null);
      setLineMorphRangeLock(null);
      return;
    }

    if (intent.lockYRange) {
      setLineMorphRangeLock(
        computeLineMorphRangeLock({
          from: sourceLine,
          to: targetLine,
          windowSecs: activeTimeframe.windowSecs,
          fromValue: sourceValue,
          toValue: targetValue,
          referenceValue: referenceLine?.value,
        })
      );
    } else {
      setLineMorphRangeLock(null);
    }

    if (lineMorphFrameRef.current != null) {
      cancelAnimationFrame(lineMorphFrameRef.current);
      lineMorphFrameRef.current = null;
    }

    setLineMorphState({
      line: sourceLine,
      value: sourceValue,
    });

    const startAt = performance.now();
    const { times, fromValues, toValues } = morphSource;

    const renderFrame = (frameTime: number) => {
      const progress = Math.min(
        1,
        (frameTime - startAt) / Math.max(intent.durationMs, 1)
      );
      const eased = easeInOutCubic(progress);
      const line = times.map((time, index) => ({
        time,
        value: fromValues[index] + (toValues[index] - fromValues[index]) * eased,
      }));
      const value =
        line[line.length - 1]?.value ??
        (sourceValue + (targetValue - sourceValue) * eased);

      setLineMorphState({ line, value });

      if (progress < 1) {
        lineMorphFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      lineMorphFrameRef.current = null;
      setLineMorphState(null);
      setLineMorphRangeLock(null);
    };

    lineMorphFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (lineMorphFrameRef.current != null) {
        cancelAnimationFrame(lineMorphFrameRef.current);
        lineMorphFrameRef.current = null;
      }
      setLineMorphRangeLock(null);
    };
  }, [
    activeTimeframe.windowSecs,
    displayLineData,
    lineMorphToken,
    mode,
    referenceLine?.value,
    lineRenderedValue,
    transitionSignature,
  ]);

  const loading =
    waitingForDaemonCoverage ||
    (!historyLoaded &&
      lineData.length === 0 &&
      candles.length === 0 &&
      !liveCandle &&
      !(renderedValue > 0));
  const modeLabel =
    displayStatus === 'historical'
      ? 'Historical'
      : displayStatus === 'unknown'
        ? socketConnected
          ? 'Awaiting data'
          : 'Offline'
        : getMarketDataDisplayLabel(displayStatus);
  const presentedLineData =
    mode === 'line' && lineMorphState ? lineMorphState.line : displayLineData;
  const presentedLineRenderedValue =
    mode === 'line' && lineMorphState ? lineMorphState.value : lineRenderedValue;
  const presentedRenderedValue =
    mode === 'line' ? presentedLineRenderedValue : candleRenderedValue;
  const persistedModeRangeLock = useMemo(() => {
    if (!persistedModeRangeSource) {
      return null;
    }

    return computeModeTransitionRangeLock({
      mode: persistedModeRangeSource,
      line: presentedLineData,
      candles: displayCandles,
      liveCandle: displayLiveCandle,
      windowSecs: activeTimeframe.windowSecs,
      currentValue:
        persistedModeRangeSource === 'line'
          ? presentedLineRenderedValue
          : candleRenderedValue,
      referenceValue: referenceLine?.value,
    });
  }, [
    activeTimeframe.windowSecs,
    displayCandles,
    displayLiveCandle,
    persistedModeRangeSource,
    presentedLineData,
    presentedLineRenderedValue,
    presentedRenderedValue,
    referenceLine?.value,
    candleRenderedValue,
  ]);
  const currentDisplayedModeRangeLock = useMemo(
    () =>
      persistedModeRangeLock ??
      computeModeTransitionRangeLock({
        mode,
        line: presentedLineData,
        candles: displayCandles,
        liveCandle: displayLiveCandle,
        windowSecs: activeTimeframe.windowSecs,
        currentValue:
          mode === 'line'
            ? presentedLineRenderedValue
            : candleRenderedValue,
        referenceValue: referenceLine?.value,
      }),
    [
      activeTimeframe.windowSecs,
      candleRenderedValue,
      displayCandles,
      displayLiveCandle,
      mode,
      persistedModeRangeLock,
      presentedLineData,
      presentedLineRenderedValue,
      referenceLine?.value,
    ]
  );
  const lineTimeLock =
    isClosedMarketSession || isPausedMarketSession
      ? {
          time:
            presentedLineData[presentedLineData.length - 1]?.time ??
            displayLineData[displayLineData.length - 1]?.time ??
            0,
        }
      : undefined;
  const candleTimeLock =
    isClosedMarketSession || isPausedMarketSession
      ? {
          time:
            (displayLiveCandle
              ? displayLiveCandle.time + activeResolution.bucketSecs - 1
              : displayCandles[displayCandles.length - 1]
                ? displayCandles[displayCandles.length - 1].time +
                  activeResolution.bucketSecs -
                  1
                : presentedLineData[presentedLineData.length - 1]?.time) ?? 0,
        }
      : undefined;

  const valuePrecision = inferValuePrecision([
    snapshot?.displayPrice ?? snapshot?.last ?? NaN,
    streamData?.chartPrice ?? NaN,
    streamData?.displayPrice ?? NaN,
    streamData?.last ?? NaN,
    streamData?.bid ?? NaN,
    streamData?.ask ?? NaN,
    ...lineData.slice(-48).map((point) => point.value),
    ...candles.slice(-24).flatMap((candle) => [candle.open, candle.high, candle.low, candle.close]),
  ]);
  const chartPrecision = Math.min(valuePrecision, 5);

  const formatPrice = useCallback((input: number) => {
    if (!Number.isFinite(input)) return '—';
    return chartPrecision > 0 ? input.toFixed(chartPrecision) : String(input);
  }, [chartPrecision]);

  const formatChartTime = useCallback((displayTime: number) => {
    const actual = new Date((displayTime - staleShiftSecs) * 1000);
    if (activeTimeframe.windowSecs >= 180 * 24 * 60 * 60) {
      return actual.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });
    }

    if (activeTimeframe.windowSecs >= 86400) {
      return actual.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }

    return actual.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: activeResolution.bucketSecs < 60 ? '2-digit' : undefined,
    });
  }, [activeResolution.bucketSecs, activeTimeframe.windowSecs, staleShiftSecs]);

  const resolutionControlsVisible =
    showWindowControls &&
    CHART_RESOLUTIONS.length > 1 &&
    (mode === 'candle' || displayStatus === 'live' || displayStatus === 'extended');
  const modeToggleVisible = showModeToggle && !lineOnly;
  const selectableTimeframes = CHART_TIMEFRAMES.filter(
    (timeframe) => timeframe.key !== '30m' && timeframe.key !== '4h'
  );
  const livelineKey = `${conid}:${isStaleMarketSession ? staleShiftSecs : 0}`;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !showWindowControls) return;

    const tail = presentedLineData[presentedLineData.length - 1] ?? null;
    const prevTail = presentedLineData[presentedLineData.length - 2] ?? null;
    recordChartDiagnostic({
      event: 'price-chart:render',
      scope: `${symbol ?? conid}:${activeTimeframe.key}:${activeResolution.key}:${mode}`,
      signature: [
        displayStatus,
        loading ? 'loading' : 'ready',
        historyLoaded ? 'history-loaded' : 'history-pending',
        presentedLineData.length > 0 ? 'has-line' : 'no-line',
        displayCandles.length > 0 ? 'has-candles' : 'no-candles',
        tail != null && latestMarketTime != null && tail.time === latestMarketTime
          ? 'tail-at-head-time'
          : 'tail-behind-head',
        tail != null && tail.value === presentedRenderedValue
          ? 'tail-equals-rendered'
          : 'tail-differs-rendered',
      ].join(':'),
      summary: {
        conid,
        displayStatus,
        loading,
        linePoints: presentedLineData.length,
        candles: displayCandles.length,
        tailTime: tail?.time ?? null,
        tailValue: tail?.value ?? null,
        renderedValue: presentedRenderedValue,
        waitingForDaemonCoverage,
      },
      detail: {
        symbol: symbol ?? conid,
        conid,
        timeframe: activeTimeframe.key,
        resolution: activeResolution.key,
        mode,
        displayStatus,
        loading,
        historyLoaded,
        historyError: bootstrap.historyError,
        linePoints: presentedLineData.length,
        candles: displayCandles.length,
        liveCandleTime: displayLiveCandle?.time ?? null,
        tail,
        prevTail,
        renderedValue: presentedRenderedValue,
        liveValue: renderedValue,
        plottedLineValue,
        staleShiftSecs,
        waitingForDaemonCoverage,
        morphing: Boolean(lineMorphState),
        expected: {
          lineTailShouldStayBehindRenderedValue:
            tail != null
              ? tail.value !== presentedRenderedValue || tail.time !== latestMarketTime
              : null,
          historyShouldOnlyPrependBehindLiveHead: true,
          liveDotShouldTrackRenderedValue: true,
        },
      },
    });
  }, [
    activeResolution.bucketSecs,
    activeResolution.key,
    activeTimeframe.key,
    bootstrap.historyError,
    conid,
    displayCandles.length,
    displayLineData,
    displayLiveCandle?.time,
    displayStatus,
    historyLoaded,
    lineMorphState,
    latestMarketTime,
    lineRenderedValue,
    loading,
    mode,
    plottedLineValue,
    presentedLineData,
    presentedRenderedValue,
    renderedValue,
    showWindowControls,
    staleShiftSecs,
    symbol,
    waitingForDaemonCoverage,
  ]);

  const selectTimeframe = useCallback((nextTimeframeKey: string) => {
    setPersistedModeRangeSource(null);
    const nextTimeframe = getChartTimeframe(nextTimeframeKey);
    setPendingTimeframeTargetKey(nextTimeframe.key);
    const traversalPath = buildTimeframeTraversalPath(
      activeTimeframe.key,
      nextTimeframe.key
    );
    const totalTransitionMs = getWindowTraversalTransitionMs(
      activeTimeframe.windowSecs,
      nextTimeframe.windowSecs
    );
    const nextResolution = getBestResolutionForTimeframe(
      nextTimeframe,
      resolutionByTimeframe[nextTimeframe.key] ?? activeResolution.key,
      mode
    );

    if (timeframeCommitTimeoutRef.current) {
      clearTimeout(timeframeCommitTimeoutRef.current);
      timeframeCommitTimeoutRef.current = null;
    }
    for (const timeoutId of timeframeTraversalTimeoutsRef.current) {
      clearTimeout(timeoutId);
    }
    timeframeTraversalTimeoutsRef.current = [];

    if (traversalPath.length > 1) {
      setViewTimeframeKey(nextTimeframe.key);
      setTimeframeKey(nextTimeframe.key);
      setViewResolutionKey(nextResolution.key);
      setResolutionKey((currentResolutionKey) =>
        currentResolutionKey === nextResolution.key
          ? currentResolutionKey
          : nextResolution.key
      );
      return;
    }

    const isContraction =
      nextTimeframe.windowSecs < activeTimeframe.windowSecs;
    const transitionMs = getWindowContractionTransitionMs(
      activeTimeframe.windowSecs,
      nextTimeframe.windowSecs
    );
    if (isContraction) {
      setViewTimeframeKey(nextTimeframe.key);
      timeframeCommitTimeoutRef.current = setTimeout(() => {
        setTimeframeKey(nextTimeframe.key);
        setViewResolutionKey(nextResolution.key);
        if (nextResolution.key !== resolutionKey) {
          setResolutionKey(nextResolution.key);
        }
        timeframeCommitTimeoutRef.current = null;
      }, transitionMs);
      return;
    }

    setViewTimeframeKey(nextTimeframe.key);
    setTimeframeKey(nextTimeframe.key);
    setViewResolutionKey(nextResolution.key);
    if (nextResolution.key !== resolutionKey) {
      setResolutionKey(nextResolution.key);
    }
  }, [
    activeResolution.bucketSecs,
    activeResolution.key,
    activeTimeframe.key,
    activeTimeframe.windowSecs,
    mode,
    resolutionByTimeframe,
    resolutionKey,
  ]);

  const selectResolution = useCallback((nextResolutionKey: string) => {
    setPersistedModeRangeSource(null);
    const nextResolution = getChartResolution(nextResolutionKey);
    const nextTimeframe = getBestTimeframeForResolution(
      nextResolution,
      activeTimeframe.key,
      mode
    );
    const resolvedResolution = getBestResolutionForTimeframe(
      nextTimeframe,
      nextResolution.key,
      mode
    );
    const lineMorphMs = getLineMorphTransitionMs({
      currentWindowSecs: activeTimeframe.windowSecs,
      nextWindowSecs: nextTimeframe.windowSecs,
      currentBucketSecs: activeResolution.bucketSecs,
      nextBucketSecs: resolvedResolution.bucketSecs,
    });

    const isSameTimeframe = nextTimeframe.key === activeTimeframe.key;
    queueLineMorph(lineMorphMs, {
      lockYRange: isSameTimeframe,
      lockWindow: isSameTimeframe,
    });
    if (nextTimeframe.key !== timeframeKey) {
      setTimeframeKey(nextTimeframe.key);
    }
    if (resolvedResolution.key !== resolutionKey) {
      setResolutionKey(resolvedResolution.key);
    }
  }, [
    activeResolution.bucketSecs,
    activeTimeframe.key,
    activeTimeframe.windowSecs,
    mode,
    queueLineMorph,
    resolutionKey,
    timeframeKey,
  ]);

  const selectMode = useCallback((nextMode: 'line' | 'candle') => {
    if (nextMode === mode) return;

    if (modeTransitionTimeoutRef.current) {
      clearTimeout(modeTransitionTimeoutRef.current);
      modeTransitionTimeoutRef.current = null;
    }

    setModeTransitionRangeLock(currentDisplayedModeRangeLock);
    setPersistedModeRangeSource((current) => current ?? mode);
    setMode(nextMode);
    modeTransitionTimeoutRef.current = setTimeout(() => {
      setModeTransitionRangeLock(null);
      modeTransitionTimeoutRef.current = null;
    }, MODE_TRANSITION_MS + 40);
  }, [
    currentDisplayedModeRangeLock,
    mode,
  ]);

  useEffect(() => {
    if (!interactive) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (spaceHeldRef.current) return;
      spaceHeldRef.current = true;
      if (hoverActiveRef.current) {
        setPaused(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      spaceHeldRef.current = false;
      setPaused(false);
    };

    const handleBlur = () => {
      spaceHeldRef.current = false;
      setPaused(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [interactive]);

  return (
    <div
      className={cn('flex min-h-0 flex-col overflow-hidden', className)}
      style={height == null ? undefined : { height }}
      onMouseEnter={
        interactive
          ? () => {
              hoverActiveRef.current = true;
              if (spaceHeldRef.current) {
                setPaused(true);
              }
            }
          : undefined
      }
      onMouseLeave={
        interactive
          ? () => {
              hoverActiveRef.current = false;
              setPaused(false);
            }
          : undefined
      }
    >
      <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-1.5">
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {symbol && (
            <span className="text-[11px] font-medium uppercase tracking-wider text-foreground/80">
              {symbol}
            </span>
          )}
          <MarketStatusInline
            status={displayStatus}
            className="gap-1.5"
            textClassName={cn('text-[9px] uppercase tracking-wider', getMarketDataDisplayTextClass(displayStatus))}
            dotClassName={cn('h-1.5 w-1.5', getMarketDataDisplayDotClass(displayStatus))}
          />
          {historyError && (
            <span className="text-[9px] uppercase text-amber-500/70">
              History unavailable
            </span>
          )}
          {showWindowControls && (
            <MarketSessionText
              schedule={schedule}
              nowMs={nowMs}
              status={displayStatus}
              sessionPhase={sessionPhase}
              className="basis-full pt-0.5 sm:basis-auto sm:pt-0"
            />
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-x-2">
          {resolutionControlsVisible && (
            <div className="shrink-0">
              <Select
                value={activeResolution.key}
                onValueChange={(value) => selectResolution(value)}
              >
                <SelectTrigger
                  size="sm"
                  className="h-6 justify-start gap-1.5 border-border/70 bg-background/70 px-2 pr-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-foreground shadow-none data-[size=sm]:h-6 [&_svg]:size-3.5"
                >
                  <SelectValue placeholder="Tick" />
                </SelectTrigger>
                <SelectContent
                  align="end"
                  className="border-border bg-popover text-popover-foreground"
                >
                  {selectableResolutions.map((resolution) => (
                    <SelectItem
                      key={resolution.key}
                      value={resolution.key}
                      className="font-mono text-[10px] uppercase tracking-wider"
                    >
                      {resolution.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showWindowControls && selectableTimeframes.length > 1 && (
            <div className="shrink-0">
              <Select
                value={pendingTimeframeTargetKey ?? timeframeKey}
                onValueChange={(value) => selectTimeframe(value)}
              >
                <SelectTrigger
                  size="sm"
                  className="h-6 justify-start gap-1.5 border-border/70 bg-background/70 px-2 pr-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-foreground shadow-none data-[size=sm]:h-6 [&_svg]:size-3.5"
                >
                  <SelectValue placeholder="Frame" />
                </SelectTrigger>
                <SelectContent
                  align="end"
                  className="border-border bg-popover text-popover-foreground"
                >
                  {selectableTimeframes.map((timeframe) => (
                    <SelectItem
                      key={timeframe.key}
                      value={timeframe.key}
                      className="font-mono text-[10px] uppercase tracking-wider"
                    >
                      {timeframe.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {modeToggleVisible && (
            <div className="grid h-6 shrink-0 grid-cols-2 overflow-hidden rounded border border-border/70 bg-background/70">
              {(['line', 'candle'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectMode(option)}
                  className={cn(
                    'min-w-[4.75rem] px-2 py-0.5 text-center text-[9px] uppercase tracking-wider transition-colors',
                    mode === option
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option === 'line' ? 'Line' : 'Candles'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div key={livelineKey} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            mode === 'line' ? 'pointer-events-auto z-10' : 'pointer-events-none z-0',
            mode === 'line' ? 'opacity-100' : 'opacity-0'
          )}
          style={{ transitionDuration: `${MODE_TRANSITION_MS}ms` }}
        >
          <Liveline
            data={presentedLineData}
            value={presentedLineRenderedValue}
            color={color}
            theme={theme}
            window={activeTimeframe.windowSecs}
            grid={showGrid}
            badge={showBadge}
            momentum
            fill={false}
            scrub={interactive}
            showValue={showValueLabel}
            valueMomentumColor
            pulse={hasLiveQuote && !isPausedMarketSession}
            loading={loading}
            paused={paused || isPausedMarketSession}
            emptyText={socketConnected ? 'Waiting for data...' : 'Connecting...'}
            formatValue={formatPrice}
            formatTime={formatChartTime}
            referenceLine={referenceLine}
            padding={padding}
            rangeLock={
              modeTransitionRangeLock ??
              lineMorphRangeLock ??
              (mode === 'line' ? persistedModeRangeLock : null) ??
              undefined
            }
            timeLock={lineTimeLock?.time ? lineTimeLock : undefined}
          />
        </div>
        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            mode === 'candle' ? 'pointer-events-auto z-10' : 'pointer-events-none z-0',
            mode === 'candle' ? 'opacity-100' : 'opacity-0'
          )}
          style={{ transitionDuration: `${MODE_TRANSITION_MS}ms` }}
        >
          <Liveline
            mode="candle"
            candles={displayCandles}
            candleWidth={activeResolution.bucketSecs}
            liveCandle={displayLiveCandle}
            data={[]}
            value={candleRenderedValue}
            color={color}
            theme={theme}
            window={activeTimeframe.windowSecs}
            grid={showGrid}
            badge={showBadge}
            momentum
            fill={false}
            scrub={interactive}
            showValue={showValueLabel}
            valueMomentumColor
            pulse={hasLiveQuote && !isPausedMarketSession}
            loading={loading}
            paused={paused || isPausedMarketSession}
            emptyText={socketConnected ? 'Waiting for data...' : 'Connecting...'}
            formatValue={formatPrice}
            formatTime={formatChartTime}
            referenceLine={referenceLine}
            padding={padding}
            rangeLock={
              modeTransitionRangeLock ??
              (mode === 'candle' ? persistedModeRangeLock : null) ??
              undefined
            }
            timeLock={candleTimeLock?.time ? candleTimeLock : undefined}
          />
        </div>
      </div>
    </div>
  );
}
