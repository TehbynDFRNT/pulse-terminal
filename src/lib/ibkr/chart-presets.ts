export interface HistoryRequest {
  period: string;
  bar: string;
}

export interface ChartTimeframe {
  key: string;
  label: string;
  windowSecs: number;
  defaultResolutionKey: string;
  resolutionKeys: string[];
  requests: HistoryRequest[];
}

export interface ChartResolution {
  key: string;
  label: string;
  bucketSecs: number;
}

const BAR_SECS: Record<string, number> = {
  '1min': 60,
  '5min': 5 * 60,
  '15min': 15 * 60,
  '30min': 30 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
};

export const CHART_TIMEFRAMES: ChartTimeframe[] = [
  {
    key: '5m',
    label: '5m',
    windowSecs: 5 * 60,
    defaultResolutionKey: '5s',
    resolutionKeys: ['1s', '5s', '10s', '30s', '1m'],
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
    ],
  },
  {
    key: '15m',
    label: '15m',
    windowSecs: 15 * 60,
    defaultResolutionKey: '10s',
    resolutionKeys: ['1s', '5s', '10s', '30s', '1m'],
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
    ],
  },
  {
    key: '30m',
    label: '30m',
    windowSecs: 30 * 60,
    defaultResolutionKey: '1s',
    resolutionKeys: ['1s', '5s', '10s', '30s', '1m', '5m', '10m', '15m'],
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
    ],
  },
  {
    key: '1h',
    label: '1h',
    windowSecs: 60 * 60,
    defaultResolutionKey: '30s',
    resolutionKeys: ['1s', '5s', '10s', '30s', '1m', '5m', '10m', '15m'],
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
    ],
  },
  {
    key: '4h',
    label: '4h',
    windowSecs: 4 * 60 * 60,
    defaultResolutionKey: '1m',
    resolutionKeys: ['5s', '10s', '30s', '1m', '5m', '10m', '15m'],
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
      { period: '3M', bar: '4h' },
    ],
  },
  {
    key: '1D',
    label: '1D',
    windowSecs: 24 * 60 * 60,
    defaultResolutionKey: '5m',
    resolutionKeys: ['5m', '10m', '15m', '1h'],
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
      { period: '1Y', bar: '1d' },
    ],
  },
  {
    key: '1W',
    label: '1W',
    windowSecs: 7 * 24 * 60 * 60,
    defaultResolutionKey: '4h',
    resolutionKeys: ['4h', '1D'],
    requests: [
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
      { period: '3M', bar: '4h' },
      { period: '1Y', bar: '1d' },
    ],
  },
  {
    key: '1M',
    label: '1M',
    windowSecs: 30 * 24 * 60 * 60,
    defaultResolutionKey: '1D',
    resolutionKeys: ['1D'],
    requests: [
      { period: '1Y', bar: '1d' },
      { period: '3M', bar: '4h' },
      { period: '1M', bar: '1h' },
    ],
  },
  {
    key: '3M',
    label: '3M',
    windowSecs: 90 * 24 * 60 * 60,
    defaultResolutionKey: '4h',
    resolutionKeys: ['1h', '4h', '1D'],
    requests: [
      { period: '1Y', bar: '1d' },
      { period: '3M', bar: '4h' },
    ],
  },
  {
    key: '1Y',
    label: '1Y',
    windowSecs: 365 * 24 * 60 * 60,
    defaultResolutionKey: '1W',
    resolutionKeys: ['1W'],
    requests: [
      { period: '1Y', bar: '1d' },
      { period: '5Y', bar: '1w' },
    ],
  },
];

export const CHART_RESOLUTIONS: ChartResolution[] = [
  { key: '1s', label: '1s', bucketSecs: 1 },
  { key: '5s', label: '5s', bucketSecs: 5 },
  { key: '10s', label: '10s', bucketSecs: 10 },
  { key: '30s', label: '30s', bucketSecs: 30 },
  { key: '1m', label: '1m', bucketSecs: 60 },
  { key: '5m', label: '5m', bucketSecs: 5 * 60 },
  { key: '10m', label: '10m', bucketSecs: 10 * 60 },
  { key: '15m', label: '15m', bucketSecs: 15 * 60 },
  { key: '1h', label: '1h', bucketSecs: 60 * 60 },
  { key: '4h', label: '4h', bucketSecs: 4 * 60 * 60 },
  { key: '1D', label: '1D', bucketSecs: 24 * 60 * 60 },
  { key: '1W', label: '1W', bucketSecs: 7 * 24 * 60 * 60 },
];

export const DEFAULT_CHART_TIMEFRAME_KEY = '5m';

export function getChartTimeframe(key?: string): ChartTimeframe {
  return (
    CHART_TIMEFRAMES.find((timeframe) => timeframe.key === key) ??
    CHART_TIMEFRAMES.find((timeframe) => timeframe.key === DEFAULT_CHART_TIMEFRAME_KEY) ??
    CHART_TIMEFRAMES[0]
  );
}

export function getChartResolution(key?: string): ChartResolution {
  return CHART_RESOLUTIONS.find((resolution) => resolution.key === key) ?? CHART_RESOLUTIONS[0];
}

export function getChartPreset(key?: string): ChartTimeframe {
  return getChartTimeframe(key);
}

export function getHistoryRequestsForTimeframe(
  timeframe: ChartTimeframe,
  resolutionKey?: string
): HistoryRequest[] {
  if (timeframe.windowSecs >= 30 * 24 * 60 * 60) {
    return timeframe.requests;
  }

  const resolutionSecs = resolutionKey
    ? getChartResolution(resolutionKey).bucketSecs
    : null;

  if (!resolutionSecs) {
    return timeframe.requests;
  }

  const ranked = [...timeframe.requests].sort((left, right) => {
    const leftSecs = getHistoryBarSecs(left.bar);
    const rightSecs = getHistoryBarSecs(right.bar);

    const leftEligible = leftSecs <= resolutionSecs;
    const rightEligible = rightSecs <= resolutionSecs;

    if (leftEligible !== rightEligible) {
      return leftEligible ? -1 : 1;
    }

    return leftSecs - rightSecs;
  });

  return ranked;
}

export function findTimeframeByWindowSecs(windowSecs: number): ChartTimeframe {
  return (
    CHART_TIMEFRAMES.find((timeframe) => timeframe.windowSecs === windowSecs) ??
    getChartTimeframe()
  );
}

export function getAvailableChartResolutions(
  timeframe: ChartTimeframe
): ChartResolution[] {
  const allowed = timeframe.resolutionKeys
    .map((key) => CHART_RESOLUTIONS.find((resolution) => resolution.key === key))
    .filter((resolution): resolution is ChartResolution => Boolean(resolution));

  return allowed.length > 0 ? allowed : [getChartResolution(timeframe.defaultResolutionKey)];
}

function getHistoryBarSecs(bar: string): number {
  return BAR_SECS[bar] ?? Number.MAX_SAFE_INTEGER;
}
