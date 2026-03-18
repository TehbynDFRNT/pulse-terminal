'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Liveline } from 'liveline';
import type {
  CandlePoint as LivelineCandlePoint,
  LivelinePoint,
  LivelineSeries,
} from 'liveline';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useThemeStore } from '@/lib/store/theme';
import { cn } from '@/lib/utils';

interface DataChartProps {
  series: LivelineSeries[];
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  referenceLine?: { value: number; label?: string };
  formatValue?: (value: number) => string;
  showGrid?: boolean;
  className?: string;
}

interface ChartWindowOption {
  key: string;
  label: string;
  kind: 'fixed' | 'calendar' | 'all';
  seconds?: number;
  unit?: 'hour' | 'day' | 'week' | 'month' | 'year';
  count?: number;
}

interface ChartResolutionOption {
  key: string;
  label: string;
  kind: 'raw' | 'fixed' | 'calendar';
  seconds?: number;
  unit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

const HOUR_SECS = 60 * 60;
const DAY_SECS = 24 * HOUR_SECS;
const WEEK_SECS = 7 * DAY_SECS;
const MONTH_SECS = 30 * DAY_SECS;
const QUARTER_SECS = 3 * MONTH_SECS;
const YEAR_SECS = 365 * DAY_SECS;

const WINDOW_CANDIDATES: ChartWindowOption[] = [
  { key: '1H', label: '1H', kind: 'fixed', seconds: HOUR_SECS },
  { key: '4H', label: '4H', kind: 'fixed', seconds: 4 * HOUR_SECS },
  { key: '1D', label: '1D', kind: 'calendar', unit: 'day', count: 1 },
  { key: '1W', label: '1W', kind: 'calendar', unit: 'week', count: 1 },
  { key: '1M', label: '1M', kind: 'calendar', unit: 'month', count: 1 },
  { key: '3M', label: '3M', kind: 'calendar', unit: 'month', count: 3 },
  { key: '6M', label: '6M', kind: 'calendar', unit: 'month', count: 6 },
  { key: '1Y', label: '1Y', kind: 'calendar', unit: 'year', count: 1 },
  { key: '3Y', label: '3Y', kind: 'calendar', unit: 'year', count: 3 },
  { key: '5Y', label: '5Y', kind: 'calendar', unit: 'year', count: 5 },
  { key: '10Y', label: '10Y', kind: 'calendar', unit: 'year', count: 10 },
];

const RESOLUTION_CANDIDATES: ChartResolutionOption[] = [
  { key: 'raw', label: 'Raw', kind: 'raw' },
  { key: '5m', label: '5M', kind: 'fixed', seconds: 5 * 60 },
  { key: '15m', label: '15M', kind: 'fixed', seconds: 15 * 60 },
  { key: '1h', label: '1H', kind: 'fixed', seconds: HOUR_SECS },
  { key: '4h', label: '4H', kind: 'fixed', seconds: 4 * HOUR_SECS },
  { key: '1D', label: '1D', kind: 'calendar', unit: 'day' },
  { key: '1W', label: '1W', kind: 'calendar', unit: 'week' },
  { key: '1M', label: '1M', kind: 'calendar', unit: 'month' },
  { key: '1Q', label: '1Q', kind: 'calendar', unit: 'quarter' },
  { key: '1Y', label: '1Y', kind: 'calendar', unit: 'year' },
];

function sortAndNormalizeSeries(series: LivelineSeries[]): LivelineSeries[] {
  return series
    .map((entry) => ({
      ...entry,
      data: [...entry.data]
        .filter(
          (point) =>
            Number.isFinite(point.time) &&
            Number.isFinite(point.value)
        )
        .sort((left, right) => left.time - right.time),
    }))
    .filter((entry) => entry.data.length > 0)
    .map((entry) => ({
      ...entry,
      value: entry.data[entry.data.length - 1]?.value ?? entry.value,
    }));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function inferCadenceSeconds(series: LivelineSeries[]): number {
  const diffs: number[] = [];

  for (const entry of series) {
    for (let index = 1; index < entry.data.length; index += 1) {
      const diff = entry.data[index].time - entry.data[index - 1].time;
      if (diff > 0) {
        diffs.push(diff);
      }
      if (diffs.length >= 256) break;
    }
    if (diffs.length >= 256) break;
  }

  return median(diffs) ?? DAY_SECS;
}

function approximateOptionSeconds(option: ChartWindowOption | ChartResolutionOption): number {
  if (option.kind === 'fixed') return option.seconds ?? DAY_SECS;
  if (option.kind === 'raw' || option.kind === 'all') return DAY_SECS;

  const count = 'count' in option ? option.count ?? 1 : 1;

  switch (option.unit) {
    case 'hour':
      return count * HOUR_SECS;
    case 'day':
      return count * DAY_SECS;
    case 'week':
      return count * WEEK_SECS;
    case 'month':
      return count * MONTH_SECS;
    case 'quarter':
      return QUARTER_SECS;
    case 'year':
      return count * YEAR_SECS;
    default:
      return DAY_SECS;
  }
}

function addUtcParts(
  date: Date,
  delta: { hours?: number; days?: number; weeks?: number; months?: number; years?: number }
): Date {
  const next = new Date(date.getTime());

  if (delta.hours) next.setUTCHours(next.getUTCHours() + delta.hours);
  if (delta.days) next.setUTCDate(next.getUTCDate() + delta.days);
  if (delta.weeks) next.setUTCDate(next.getUTCDate() + delta.weeks * 7);
  if (delta.months) next.setUTCMonth(next.getUTCMonth() + delta.months);
  if (delta.years) next.setUTCFullYear(next.getUTCFullYear() + delta.years);

  return next;
}

function resolveWindowStartTime(
  latestTime: number,
  option: ChartWindowOption
): number {
  if (option.kind === 'all') return Number.NEGATIVE_INFINITY;
  if (option.kind === 'fixed') {
    return latestTime - (option.seconds ?? DAY_SECS) + 1;
  }

  const latestDate = new Date(latestTime * 1000);
  switch (option.unit) {
    case 'day':
      return Math.floor(addUtcParts(latestDate, { days: -(option.count ?? 1) }).getTime() / 1000) + 1;
    case 'week':
      return Math.floor(addUtcParts(latestDate, { weeks: -(option.count ?? 1) }).getTime() / 1000) + 1;
    case 'month':
      return Math.floor(addUtcParts(latestDate, { months: -(option.count ?? 1) }).getTime() / 1000) + 1;
    case 'year':
      return Math.floor(addUtcParts(latestDate, { years: -(option.count ?? 1) }).getTime() / 1000) + 1;
    default:
      return Number.NEGATIVE_INFINITY;
  }
}

function startOfUtcWeek(date: Date): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDay();
  const offset = (day + 6) % 7;
  next.setUTCDate(next.getUTCDate() - offset);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function resolveBucketTime(time: number, option: ChartResolutionOption): number {
  if (option.kind === 'raw') return time;
  if (option.kind === 'fixed') {
    const bucketSecs = option.seconds ?? DAY_SECS;
    return Math.floor(time / bucketSecs) * bucketSecs;
  }

  const date = new Date(time * 1000);
  switch (option.unit) {
    case 'day':
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      ) / 1000;
    case 'week':
      return Math.floor(startOfUtcWeek(date).getTime() / 1000);
    case 'month':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
    case 'quarter':
      return (
        Date.UTC(
          date.getUTCFullYear(),
          Math.floor(date.getUTCMonth() / 3) * 3,
          1
        ) / 1000
      );
    case 'year':
      return Date.UTC(date.getUTCFullYear(), 0, 1) / 1000;
    default:
      return time;
  }
}

function filterSeriesForWindow(
  series: LivelineSeries[],
  startTime: number
): LivelineSeries[] {
  return series
    .map((entry) => ({
      ...entry,
      data: entry.data.filter((point) => point.time >= startTime),
    }))
    .filter((entry) => entry.data.length > 0)
    .map((entry) => ({
      ...entry,
      value: entry.data[entry.data.length - 1]?.value ?? entry.value,
    }));
}

function bucketSeriesPoints(
  points: LivelinePoint[],
  option: ChartResolutionOption
): LivelinePoint[] {
  if (option.kind === 'raw') return points;

  const buckets = new Map<number, LivelinePoint>();

  for (const point of points) {
    const bucketTime = resolveBucketTime(point.time, option);
    buckets.set(bucketTime, {
      time: bucketTime,
      value: point.value,
    });
  }

  return Array.from(buckets.values()).sort((left, right) => left.time - right.time);
}

function bucketSeries(
  series: LivelineSeries[],
  option: ChartResolutionOption
): LivelineSeries[] {
  return series
    .map((entry) => {
      const points = bucketSeriesPoints(entry.data, option);

      return {
        ...entry,
        data: points,
        value: points[points.length - 1]?.value ?? entry.value,
      };
    })
    .filter((entry) => entry.data.length > 0);
}

function buildCandles(
  points: LivelinePoint[],
  option: ChartResolutionOption
): LivelineCandlePoint[] {
  if (points.length === 0) return [];

  const buckets = new Map<number, LivelineCandlePoint>();

  for (const point of points) {
    const bucketTime = resolveBucketTime(point.time, option);
    const existing = buckets.get(bucketTime);

    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
      });
      continue;
    }

    existing.high = Math.max(existing.high, point.value);
    existing.low = Math.min(existing.low, point.value);
    existing.close = point.value;
  }

  return Array.from(buckets.values()).sort((left, right) => left.time - right.time);
}

function countVisiblePoints(series: LivelineSeries[], startTime: number): number {
  return series.reduce((maxCount, entry) => {
    const nextCount = entry.data.filter((point) => point.time >= startTime).length;
    return Math.max(maxCount, nextCount);
  }, 0);
}

function deriveWindowOptions(
  series: LivelineSeries[],
  cadenceSecs: number
): ChartWindowOption[] {
  const earliestTime = Math.min(...series.map((entry) => entry.data[0]?.time ?? Infinity));
  const latestTime = Math.max(
    ...series.map((entry) => entry.data[entry.data.length - 1]?.time ?? Number.NEGATIVE_INFINITY)
  );
  const spanSecs = Math.max(0, latestTime - earliestTime);

  const options = WINDOW_CANDIDATES.filter((option) => {
    const approxSecs = approximateOptionSeconds(option);
    if (approxSecs >= spanSecs * 0.98) return false;
    if (approxSecs < cadenceSecs * 6) return false;

    const visibleCount = countVisiblePoints(series, resolveWindowStartTime(latestTime, option));
    return visibleCount >= 4;
  });

  return [
    ...options,
    {
      key: 'all',
      label: 'All',
      kind: 'all',
    },
  ];
}

function getDefaultWindowKey(
  options: ChartWindowOption[],
  series: LivelineSeries[]
): string {
  const latestTime = Math.max(
    ...series.map((entry) => entry.data[entry.data.length - 1]?.time ?? Number.NEGATIVE_INFINITY)
  );

  for (const option of options) {
    if (option.kind === 'all') continue;

    const visibleCount = countVisiblePoints(series, resolveWindowStartTime(latestTime, option));
    if (visibleCount >= 24 && visibleCount <= 180) {
      return option.key;
    }
  }

  return options[options.length - 1]?.key ?? 'all';
}

function deriveResolutionOptions(
  cadenceSecs: number,
  activeWindow: ChartWindowOption
): ChartResolutionOption[] {
  const windowApproxSecs =
    activeWindow.kind === 'all'
      ? Number.POSITIVE_INFINITY
      : approximateOptionSeconds(activeWindow);

  return RESOLUTION_CANDIDATES.filter((option) => {
    if (option.kind === 'raw') return true;

    const approxSecs = approximateOptionSeconds(option);
    if (approxSecs <= cadenceSecs * 1.5) return false;

    if (Number.isFinite(windowApproxSecs)) {
      const expectedBuckets = windowApproxSecs / approxSecs;
      if (expectedBuckets < 2) return false;
      if (expectedBuckets > 320) return false;
    }

    return true;
  });
}

function getDefaultResolutionKey(
  options: ChartResolutionOption[],
  series: LivelineSeries[],
  startTime: number
): string {
  const visiblePoints = countVisiblePoints(series, startTime);
  if (visiblePoints <= 160) return 'raw';

  const latestTime = Math.max(
    ...series.map((entry) => entry.data[entry.data.length - 1]?.time ?? Number.NEGATIVE_INFINITY)
  );
  const windowSecs = Math.max(1, latestTime - startTime);

  for (const option of options) {
    if (option.kind === 'raw') continue;

    const approxSecs = approximateOptionSeconds(option);
    const expectedBuckets = windowSecs / Math.max(approxSecs, 1);
    if (expectedBuckets >= 24 && expectedBuckets <= 120) {
      return option.key;
    }
  }

  return 'raw';
}

function inferRawCandleResolution(cadenceSecs: number): ChartResolutionOption {
  const candidate =
    RESOLUTION_CANDIDATES
      .filter((option) => option.kind !== 'raw')
      .map((option) => ({
        option,
        distance: Math.abs(approximateOptionSeconds(option) - cadenceSecs),
      }))
      .sort((left, right) => left.distance - right.distance)[0]?.option;

  return candidate ?? { key: '1D', label: '1D', kind: 'calendar', unit: 'day' };
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

function inferValuePrecision(series: LivelineSeries[]): number {
  let precision = 0;

  for (const entry of series) {
    for (const point of entry.data) {
      precision = Math.max(precision, countDecimals(point.value));
    }
  }

  return Math.min(precision, 6);
}

function createFallbackValueFormatter(series: LivelineSeries[]) {
  const precision = inferValuePrecision(series);

  return (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: precision > 0 ? Math.min(precision, 2) : 0,
      maximumFractionDigits: precision > 0 ? precision : 2,
    });
}

function createTimeFormatter(params: {
  windowOption: ChartWindowOption;
  resolutionOption: ChartResolutionOption;
  preferUtc: boolean;
}) {
  const { windowOption, resolutionOption, preferUtc } = params;
  const windowApproxSecs =
    windowOption.kind === 'all'
      ? YEAR_SECS
      : approximateOptionSeconds(windowOption);
  const resolutionApproxSecs =
    resolutionOption.kind === 'raw'
      ? 0
      : approximateOptionSeconds(resolutionOption);

  const usesTime = windowApproxSecs <= 2 * DAY_SECS || resolutionApproxSecs < DAY_SECS;
  const usesDay = windowApproxSecs <= 90 * DAY_SECS;
  const usesMonth = windowApproxSecs <= 2 * YEAR_SECS;

  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: preferUtc ? 'UTC' : undefined,
    ...(usesTime
      ? usesDay
        ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : usesDay
        ? { month: 'short', day: 'numeric' }
        : usesMonth
          ? { month: 'short', year: 'numeric' }
          : { year: 'numeric' }),
  });

  return (time: number) => formatter.format(new Date(time * 1000));
}

export function DataChart({
  series,
  loading = false,
  error,
  emptyText = 'No data to display',
  referenceLine,
  formatValue,
  showGrid = true,
  className,
}: DataChartProps) {
  const theme = useThemeStore((state) => state.theme);
  const normalizedSeries = useMemo(() => sortAndNormalizeSeries(series), [series]);
  const seriesIdentityRef = useRef<string>('');
  const cadenceSecs = useMemo(
    () => inferCadenceSeconds(normalizedSeries),
    [normalizedSeries]
  );
  const preferUtc = useMemo(
    () =>
      cadenceSecs >= DAY_SECS ||
      normalizedSeries.every((entry) =>
        entry.data.every((point) => point.time % DAY_SECS === 0)
      ),
    [cadenceSecs, normalizedSeries]
  );
  const windowOptions = useMemo(
    () =>
      normalizedSeries.length > 0
        ? deriveWindowOptions(normalizedSeries, cadenceSecs)
        : [{ key: 'all', label: 'All', kind: 'all' as const }],
    [cadenceSecs, normalizedSeries]
  );
  const [windowKey, setWindowKey] = useState<string>('all');
  const seriesIdentity = useMemo(
    () => normalizedSeries.map((entry) => entry.id).join('|'),
    [normalizedSeries]
  );
  const defaultWindowKey = useMemo(
    () => getDefaultWindowKey(windowOptions, normalizedSeries),
    [normalizedSeries, windowOptions]
  );

  useEffect(() => {
    if (seriesIdentity && seriesIdentityRef.current !== seriesIdentity) {
      seriesIdentityRef.current = seriesIdentity;
      setWindowKey(defaultWindowKey);
      return;
    }

    setWindowKey((current) =>
      windowOptions.some((option) => option.key === current)
        ? current
        : defaultWindowKey
    );
  }, [defaultWindowKey, seriesIdentity, windowOptions]);

  const activeWindow = useMemo(
    () =>
      windowOptions.find((option) => option.key === windowKey) ??
      windowOptions[windowOptions.length - 1],
    [windowKey, windowOptions]
  );

  const latestTime = useMemo(
    () =>
      Math.max(
        ...normalizedSeries.map(
          (entry) => entry.data[entry.data.length - 1]?.time ?? Number.NEGATIVE_INFINITY
        )
      ),
    [normalizedSeries]
  );
  const windowStartTime = useMemo(
    () =>
      activeWindow
        ? resolveWindowStartTime(latestTime, activeWindow)
        : Number.NEGATIVE_INFINITY,
    [activeWindow, latestTime]
  );
  const visibleRawSeries = useMemo(
    () => filterSeriesForWindow(normalizedSeries, windowStartTime),
    [normalizedSeries, windowStartTime]
  );
  const resolutionOptions = useMemo(
    () =>
      activeWindow
        ? deriveResolutionOptions(cadenceSecs, activeWindow)
        : [{ key: 'raw', label: 'Raw', kind: 'raw' as const }],
    [activeWindow, cadenceSecs]
  );
  const [resolutionKey, setResolutionKey] = useState<string>('raw');
  const defaultResolutionKey = useMemo(
    () => getDefaultResolutionKey(resolutionOptions, normalizedSeries, windowStartTime),
    [normalizedSeries, resolutionOptions, windowStartTime]
  );

  useEffect(() => {
    setResolutionKey((current) =>
      resolutionOptions.some((option) => option.key === current)
        ? current
        : defaultResolutionKey
    );
  }, [defaultResolutionKey, resolutionOptions]);

  const activeResolution = useMemo(
    () =>
      resolutionOptions.find((option) => option.key === resolutionKey) ??
      resolutionOptions[0],
    [resolutionKey, resolutionOptions]
  );
  const plottedSeries = useMemo(
    () =>
      activeResolution
        ? bucketSeries(visibleRawSeries, activeResolution)
        : visibleRawSeries,
    [activeResolution, visibleRawSeries]
  );
  const primarySeries = plottedSeries[0] ?? null;

  const resolvedFormatValue = useMemo(
    () => formatValue ?? createFallbackValueFormatter(plottedSeries),
    [formatValue, plottedSeries]
  );
  const formatTime = useMemo(
    () =>
      createTimeFormatter({
        windowOption: activeWindow ?? { key: 'all', label: 'All', kind: 'all' },
        resolutionOption: activeResolution ?? { key: 'raw', label: 'Raw', kind: 'raw' },
        preferUtc,
      }),
    [activeResolution, activeWindow, preferUtc]
  );

  const showControlBar =
    windowOptions.length > 1 ||
    resolutionOptions.length > 1;
  const chartHasData = plottedSeries.length > 0;
  const primaryData = primarySeries?.data ?? [];
  const primaryValue = primarySeries?.value ?? primaryData[primaryData.length - 1]?.value ?? 0;

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {showControlBar ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border/60 px-3 py-2">
          {resolutionOptions.length > 1 ? (
            <div className="shrink-0">
              <Select value={resolutionKey} onValueChange={setResolutionKey}>
                <SelectTrigger
                  size="sm"
                  className="h-6 justify-start gap-1.5 border-border/70 bg-background/70 px-2 pr-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-foreground shadow-none data-[size=sm]:h-6 [&_svg]:size-3.5"
                >
                  <SelectValue placeholder="Resolution" />
                </SelectTrigger>
                <SelectContent align="end" className="border-border bg-popover text-popover-foreground">
                  {resolutionOptions.map((option) => (
                    <SelectItem
                      key={option.key}
                      value={option.key}
                      className="font-mono text-[10px] uppercase tracking-wider"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {windowOptions.length > 1 ? (
            <div className="shrink-0">
              <Select value={windowKey} onValueChange={setWindowKey}>
                <SelectTrigger
                  size="sm"
                  className="h-6 justify-start gap-1.5 border-border/70 bg-background/70 px-2 pr-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-foreground shadow-none data-[size=sm]:h-6 [&_svg]:size-3.5"
                >
                  <SelectValue placeholder="Frame" />
                </SelectTrigger>
                <SelectContent align="end" className="border-border bg-popover text-popover-foreground">
                  {windowOptions.map((option) => (
                    <SelectItem
                      key={option.key}
                      value={option.key}
                      className="font-mono text-[10px] uppercase tracking-wider"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {!chartHasData && error && !loading ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
            {error}
          </div>
        ) : (
          <div className="h-full">
            <Liveline
              data={primaryData}
              value={primaryValue}
              series={plottedSeries.length > 1 ? plottedSeries : undefined}
              color={primarySeries?.color ?? '#3b82f6'}
              theme={theme}
              window={
                activeWindow?.kind === 'all'
                  ? Math.max(
                      60,
                      latestTime -
                        Math.min(
                          ...normalizedSeries.map((entry) => entry.data[0]?.time ?? latestTime)
                        ) +
                        cadenceSecs
                    )
                  : Math.max(60, latestTime - windowStartTime + cadenceSecs)
              }
              grid={showGrid}
              badge
              momentum={false}
              fill={false}
              scrub
              loading={loading}
              paused
              emptyText={emptyText}
              pulse={false}
              formatValue={resolvedFormatValue}
              formatTime={formatTime}
              referenceLine={referenceLine}
              seriesToggleCompact
              padding={{
                top: 10,
                right: showGrid ? 56 : 18,
                bottom: 24,
                left: 10,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
