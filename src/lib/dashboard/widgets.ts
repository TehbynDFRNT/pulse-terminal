import type { Layout, ResponsiveLayouts } from 'react-grid-layout';
import type { SearchResult, WatchlistItem } from '@/lib/ibkr/types';
import type { WidgetDatasetDimensionFilters } from '@/lib/dashboard/dataset-types';
import {
  DATA_BOARD_WIDGET_DEFINITIONS,
  type FutureDataBoardWidget,
  type MetricDataBoardWidget,
  type PieDataBoardWidget,
  type SeriesDataBoardWidget,
  type StackedBarDataBoardWidget,
  type TableDataBoardWidget,
} from '@/lib/dashboard/data-widgets';
import {
  getBoardDatasetDefinition,
  isBoardDatasetKey,
  type BoardDatasetKey,
  type BoardDatasetQuery,
} from '@/lib/dashboard/widget-datasets';

export const DASHBOARD_CHART_COLORS = [
  '#00e676',
  '#3b82f6',
  '#f59e0b',
  '#e040fb',
  '#ff9100',
  '#00e5ff',
  '#ff1744',
  '#76ff03',
  '#448aff',
  '#ffea00',
] as const;

export const BOARD_BREAKPOINTS = {
  lg: 1400,
  md: 1100,
  sm: 768,
  xs: 480,
  xxs: 0,
} as const;

export const BOARD_COLS = {
  lg: 24,
  md: 20,
  sm: 12,
  xs: 8,
  xxs: 2,
} as const;

const CORE_BOARD_WIDGET_DEFINITIONS = [
  {
    type: 'chart',
    label: 'Chart',
    description: 'Single-instrument IBKR chart widget.',
    defaultTitle: 'Chart',
  },
  {
    type: 'watchlist-heatmap',
    label: 'Watchlist Heatmap',
    description: 'Multi-instrument pulse tiles from the live watchlist feed.',
    defaultTitle: 'Heatmap',
  },
  {
    type: 'screener-list',
    label: 'Screener List',
    description: 'IBKR scanner results with live reruns on the board.',
    defaultTitle: 'Screener',
  },
] as const;

export const BOARD_WIDGET_DEFINITIONS = [
  ...CORE_BOARD_WIDGET_DEFINITIONS,
  ...DATA_BOARD_WIDGET_DEFINITIONS,
] as const;

export type BoardBreakpoint = keyof typeof BOARD_BREAKPOINTS;
export type BoardLayouts = ResponsiveLayouts<BoardBreakpoint>;
export type BoardWidgetType = (typeof BOARD_WIDGET_DEFINITIONS)[number]['type'];

export interface BoardWidgetBase {
  id: string;
  type: BoardWidgetType;
  title: string;
}

export interface ChartBoardWidget extends BoardWidgetBase {
  type: 'chart';
  conid: number;
  symbol: string;
  name: string;
  exchange: string;
  color: string;
}

export interface WatchlistHeatmapBoardWidget extends BoardWidgetBase {
  type: 'watchlist-heatmap';
  conids: number[];
  maxItems: number;
}

export interface ScreenerListBoardWidget extends BoardWidgetBase {
  type: 'screener-list';
  instrument: string;
  instrumentLabel: string;
  location: string;
  locationLabel: string;
  scanType: string;
  scanLabel: string;
  limit: number;
}

export type BoardWidget =
  | ChartBoardWidget
  | WatchlistHeatmapBoardWidget
  | ScreenerListBoardWidget
  | FutureDataBoardWidget;

interface LayoutPreset {
  w: number;
  h: number;
  minW: number;
  minH: number;
}

const BOARD_LAYOUT_COLUMN_SCALE: Record<BoardBreakpoint, number> = {
  lg: 2,
  md: 2,
  sm: 2,
  xs: 2,
  xxs: 1,
};
const BOARD_LAYOUT_ROW_SCALE = 2;

function scaleLayoutPresets(
  presets: Record<BoardBreakpoint, LayoutPreset>
): Record<BoardBreakpoint, LayoutPreset> {
  return Object.fromEntries(
    (Object.keys(presets) as BoardBreakpoint[]).map((breakpoint) => {
      const preset = presets[breakpoint];
      const columnScale = BOARD_LAYOUT_COLUMN_SCALE[breakpoint];

      return [
        breakpoint,
        {
          w: preset.w * columnScale,
          h: preset.h * BOARD_LAYOUT_ROW_SCALE,
          minW: preset.minW * columnScale,
          minH: preset.minH * BOARD_LAYOUT_ROW_SCALE,
        },
      ];
    })
  ) as Record<BoardBreakpoint, LayoutPreset>;
}

const BASE_CHART_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 4, h: 11, minW: 2, minH: 8 },
  md: { w: 5, h: 10, minW: 2, minH: 8 },
  sm: { w: 6, h: 9, minW: 2, minH: 7 },
  xs: { w: 4, h: 8, minW: 2, minH: 7 },
  xxs: { w: 2, h: 8, minW: 1, minH: 7 },
};
const CHART_LAYOUT_PRESETS = scaleLayoutPresets(BASE_CHART_LAYOUT_PRESETS);

const BASE_HEATMAP_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 4, h: 6, minW: 2, minH: 4 },
  md: { w: 5, h: 6, minW: 2, minH: 4 },
  sm: { w: 6, h: 6, minW: 2, minH: 4 },
  xs: { w: 4, h: 5, minW: 2, minH: 4 },
  xxs: { w: 2, h: 5, minW: 1, minH: 4 },
};
const HEATMAP_LAYOUT_PRESETS = scaleLayoutPresets(BASE_HEATMAP_LAYOUT_PRESETS);

const BASE_SCREENER_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 5, h: 9, minW: 3, minH: 7 },
  md: { w: 6, h: 9, minW: 3, minH: 7 },
  sm: { w: 6, h: 8, minW: 3, minH: 7 },
  xs: { w: 4, h: 8, minW: 2, minH: 7 },
  xxs: { w: 2, h: 8, minW: 2, minH: 7 },
};
const SCREENER_LAYOUT_PRESETS = scaleLayoutPresets(BASE_SCREENER_LAYOUT_PRESETS);

const BASE_SERIES_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 4, h: 10, minW: 2, minH: 7 },
  md: { w: 5, h: 9, minW: 2, minH: 7 },
  sm: { w: 6, h: 8, minW: 2, minH: 7 },
  xs: { w: 4, h: 8, minW: 2, minH: 7 },
  xxs: { w: 2, h: 8, minW: 1, minH: 7 },
};
const SERIES_LAYOUT_PRESETS = scaleLayoutPresets(BASE_SERIES_LAYOUT_PRESETS);

const BASE_TABLE_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 5, h: 9, minW: 3, minH: 7 },
  md: { w: 6, h: 9, minW: 3, minH: 7 },
  sm: { w: 6, h: 8, minW: 3, minH: 7 },
  xs: { w: 4, h: 8, minW: 2, minH: 7 },
  xxs: { w: 2, h: 8, minW: 2, minH: 7 },
};
const TABLE_LAYOUT_PRESETS = scaleLayoutPresets(BASE_TABLE_LAYOUT_PRESETS);

const BASE_METRIC_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 4, h: 4, minW: 1, minH: 3 },
  md: { w: 4, h: 4, minW: 1, minH: 3 },
  sm: { w: 6, h: 4, minW: 1, minH: 3 },
  xs: { w: 4, h: 4, minW: 1, minH: 3 },
  xxs: { w: 2, h: 4, minW: 1, minH: 3 },
};
const METRIC_LAYOUT_PRESETS = scaleLayoutPresets(BASE_METRIC_LAYOUT_PRESETS);

const BASE_PIE_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 4, h: 8, minW: 2, minH: 6 },
  md: { w: 5, h: 8, minW: 2, minH: 6 },
  sm: { w: 6, h: 7, minW: 2, minH: 6 },
  xs: { w: 4, h: 7, minW: 2, minH: 6 },
  xxs: { w: 2, h: 7, minW: 1, minH: 6 },
};
const PIE_LAYOUT_PRESETS = scaleLayoutPresets(BASE_PIE_LAYOUT_PRESETS);

const BASE_STACKED_BAR_LAYOUT_PRESETS: Record<BoardBreakpoint, LayoutPreset> = {
  lg: { w: 5, h: 8, minW: 3, minH: 6 },
  md: { w: 6, h: 8, minW: 3, minH: 6 },
  sm: { w: 6, h: 8, minW: 3, minH: 6 },
  xs: { w: 4, h: 7, minW: 2, minH: 6 },
  xxs: { w: 2, h: 7, minW: 2, minH: 6 },
};
const STACKED_BAR_LAYOUT_PRESETS = scaleLayoutPresets(BASE_STACKED_BAR_LAYOUT_PRESETS);

const DEFAULT_HEATMAP_MAX_ITEMS = 8;
const DEFAULT_SCREENER_LIMIT = 8;

function createWidgetId(
  type: BoardWidgetType,
  seed: string | number,
  index: number
): string {
  return `${type}:${seed}:${Date.now().toString(36)}:${index}`;
}

function resolveWidgetTitle(
  datasetKey: BoardDatasetKey,
  title: string | undefined
): string {
  return title?.trim() || getBoardDatasetDefinition(datasetKey).defaultTitle;
}

function getLayoutPresets(widgetType: BoardWidgetType) {
  switch (widgetType) {
    case 'watchlist-heatmap':
      return HEATMAP_LAYOUT_PRESETS;
    case 'screener-list':
    case 'table':
      return TABLE_LAYOUT_PRESETS;
    case 'series':
      return SERIES_LAYOUT_PRESETS;
    case 'metric':
      return METRIC_LAYOUT_PRESETS;
    case 'pie':
      return PIE_LAYOUT_PRESETS;
    case 'stacked-bar':
      return STACKED_BAR_LAYOUT_PRESETS;
    case 'chart':
    default:
      return CHART_LAYOUT_PRESETS;
  }
}

function isDatasetParamValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isDatasetParamsRecord(value: unknown): value is BoardDatasetQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(isDatasetParamValue);
}

function isDimensionFiltersRecord(value: unknown): value is WidgetDatasetDimensionFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((inner) => typeof inner === 'string');
}

function isBaseWidgetRecord(record: Record<string, unknown>): boolean {
  return typeof record.id === 'string' && typeof record.title === 'string';
}

function isDataWidgetBaseRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.datasetKey === 'string' &&
    isBoardDatasetKey(record.datasetKey) &&
    (typeof record.subtitle === 'undefined' || typeof record.subtitle === 'string') &&
    (typeof record.refreshIntervalMs === 'undefined' || typeof record.refreshIntervalMs === 'number') &&
    (typeof record.params === 'undefined' || isDatasetParamsRecord(record.params)) &&
    (typeof record.dimensionFilters === 'undefined' ||
      isDimensionFiltersRecord(record.dimensionFilters))
  );
}

export function getBoardWidgetDefinition(type: BoardWidgetType) {
  return BOARD_WIDGET_DEFINITIONS.find((definition) => definition.type === type)!;
}

export function createChartBoardWidget(
  item: Pick<SearchResult | WatchlistItem, 'conid' | 'symbol' | 'name' | 'exchange'>,
  index: number,
  options?: { title?: string; color?: string }
): ChartBoardWidget {
  return {
    id: createWidgetId('chart', item.conid, index),
    type: 'chart',
    title: options?.title?.trim() || item.symbol,
    conid: item.conid,
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchange,
    color: options?.color || DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length],
  };
}

export function createWatchlistHeatmapWidget(
  items: Array<Pick<WatchlistItem, 'conid'>>,
  index: number,
  options?: { title?: string; maxItems?: number }
): WatchlistHeatmapBoardWidget {
  return {
    id: createWidgetId('watchlist-heatmap', 'watchlist', index),
    type: 'watchlist-heatmap',
    title: options?.title?.trim() || 'Watchlist Heatmap',
    conids: items.map((item) => item.conid),
    maxItems: Math.max(1, options?.maxItems ?? DEFAULT_HEATMAP_MAX_ITEMS),
  };
}

export function createScreenerListBoardWidget(
  config: {
    instrument: string;
    instrumentLabel: string;
    location: string;
    locationLabel: string;
    scanType: string;
    scanLabel: string;
    limit?: number;
    title?: string;
  },
  index: number
): ScreenerListBoardWidget {
  return {
    id: createWidgetId('screener-list', `${config.instrument}:${config.scanType}`, index),
    type: 'screener-list',
    title: config.title?.trim() || `${config.instrumentLabel} ${config.scanLabel}`,
    instrument: config.instrument,
    instrumentLabel: config.instrumentLabel,
    location: config.location,
    locationLabel: config.locationLabel,
    scanType: config.scanType,
    scanLabel: config.scanLabel,
    limit: Math.max(1, config.limit ?? DEFAULT_SCREENER_LIMIT),
  };
}

export function createSeriesBoardWidget(
  config: {
    datasetKey: BoardDatasetKey;
    params?: BoardDatasetQuery;
    dimensionFilters?: WidgetDatasetDimensionFilters;
    title?: string;
    subtitle?: string;
    refreshIntervalMs?: number;
    baseline?: number;
    metricFields?: string[];
  },
  index: number
): SeriesDataBoardWidget {
  return {
    id: createWidgetId('series', config.datasetKey, index),
    type: 'series',
    title: resolveWidgetTitle(config.datasetKey, config.title),
    subtitle: config.subtitle,
    datasetKey: config.datasetKey,
    params: config.params,
    dimensionFilters: config.dimensionFilters,
    refreshIntervalMs: config.refreshIntervalMs,
    baseline: config.baseline,
    metricFields: config.metricFields,
  };
}

export function createTableBoardWidget(
  config: {
    datasetKey: BoardDatasetKey;
    params?: BoardDatasetQuery;
    dimensionFilters?: WidgetDatasetDimensionFilters;
    title?: string;
    subtitle?: string;
    refreshIntervalMs?: number;
    visibleFields?: string[];
    maxRows?: number;
  },
  index: number
): TableDataBoardWidget {
  return {
    id: createWidgetId('table', config.datasetKey, index),
    type: 'table',
    title: resolveWidgetTitle(config.datasetKey, config.title),
    subtitle: config.subtitle,
    datasetKey: config.datasetKey,
    params: config.params,
    dimensionFilters: config.dimensionFilters,
    refreshIntervalMs: config.refreshIntervalMs,
    visibleFields: config.visibleFields,
    maxRows: config.maxRows,
  };
}

export function createMetricBoardWidget(
  config: {
    datasetKey: BoardDatasetKey;
    params?: BoardDatasetQuery;
    dimensionFilters?: WidgetDatasetDimensionFilters;
    title?: string;
    subtitle?: string;
    refreshIntervalMs?: number;
    metricFields?: string[];
  },
  index: number
): MetricDataBoardWidget {
  return {
    id: createWidgetId('metric', config.datasetKey, index),
    type: 'metric',
    title: resolveWidgetTitle(config.datasetKey, config.title),
    subtitle: config.subtitle,
    datasetKey: config.datasetKey,
    params: config.params,
    dimensionFilters: config.dimensionFilters,
    refreshIntervalMs: config.refreshIntervalMs,
    metricFields: config.metricFields,
  };
}

export function createPieBoardWidget(
  config: {
    datasetKey: BoardDatasetKey;
    params?: BoardDatasetQuery;
    dimensionFilters?: WidgetDatasetDimensionFilters;
    title?: string;
    subtitle?: string;
    refreshIntervalMs?: number;
    labelField?: string;
    metricField?: string;
  },
  index: number
): PieDataBoardWidget {
  return {
    id: createWidgetId('pie', config.datasetKey, index),
    type: 'pie',
    title: resolveWidgetTitle(config.datasetKey, config.title),
    subtitle: config.subtitle,
    datasetKey: config.datasetKey,
    params: config.params,
    dimensionFilters: config.dimensionFilters,
    refreshIntervalMs: config.refreshIntervalMs,
    labelField: config.labelField,
    metricField: config.metricField,
  };
}

export function createStackedBarBoardWidget(
  config: {
    datasetKey: BoardDatasetKey;
    params?: BoardDatasetQuery;
    dimensionFilters?: WidgetDatasetDimensionFilters;
    title?: string;
    subtitle?: string;
    refreshIntervalMs?: number;
    xField?: string;
    stackField?: string;
    metricField?: string;
  },
  index: number
): StackedBarDataBoardWidget {
  return {
    id: createWidgetId('stacked-bar', config.datasetKey, index),
    type: 'stacked-bar',
    title: resolveWidgetTitle(config.datasetKey, config.title),
    subtitle: config.subtitle,
    datasetKey: config.datasetKey,
    params: config.params,
    dimensionFilters: config.dimensionFilters,
    refreshIntervalMs: config.refreshIntervalMs,
    xField: config.xField,
    stackField: config.stackField,
    metricField: config.metricField,
  };
}

export function createDefaultBoardLayouts(widget: BoardWidget): BoardLayouts {
  const presets = getLayoutPresets(widget.type);
  return Object.fromEntries(
    Object.entries(presets).map(([breakpoint, preset]) => [
      breakpoint,
      [
        {
          i: widget.id,
          x: 0,
          y: 0,
          w: preset.w,
          h: preset.h,
          minW: preset.minW,
          minH: preset.minH,
        },
      ],
    ])
  ) as BoardLayouts;
}

export function addWidgetToLayouts(
  layouts: BoardLayouts,
  widget: BoardWidget
): BoardLayouts {
  const next = { ...layouts };
  const presets = getLayoutPresets(widget.type);

  for (const breakpoint of Object.keys(BOARD_BREAKPOINTS) as BoardBreakpoint[]) {
    const preset = presets[breakpoint];
    const cols = BOARD_COLS[breakpoint];
    const current = [...(next[breakpoint] ?? [])];
    const rowWidth = Math.max(cols - preset.w, 0);
    const x = rowWidth > 0 ? (current.length * preset.w) % (rowWidth + 1) : 0;
    const y = current.reduce((max, item) => Math.max(max, item.y + item.h), 0);

    current.push({
      i: widget.id,
      x,
      y,
      w: Math.min(preset.w, cols),
      h: preset.h,
      minW: Math.min(preset.minW, cols),
      minH: preset.minH,
    });

    next[breakpoint] = current;
  }

  return next;
}

export function pruneLayoutsForWidgets(
  layouts: BoardLayouts,
  widgets: BoardWidget[]
): BoardLayouts {
  const allowed = new Set(widgets.map((widget) => widget.id));
  const next = { ...layouts };

  for (const breakpoint of Object.keys(BOARD_BREAKPOINTS) as BoardBreakpoint[]) {
    next[breakpoint] = (next[breakpoint] ?? []).filter((item) => allowed.has(item.i));
  }

  return next;
}

export function normalizeBoardLayouts(
  widgets: BoardWidget[],
  layouts?: Partial<Record<BoardBreakpoint, Layout>>
): BoardLayouts {
  let next = pruneLayoutsForWidgets((layouts ?? {}) as BoardLayouts, widgets);

  for (const breakpoint of Object.keys(BOARD_BREAKPOINTS) as BoardBreakpoint[]) {
    const current = next[breakpoint] ?? [];
    const baseCols = BOARD_COLS[breakpoint];
    const effectiveCols = Math.max(
      baseCols,
      current.reduce((max, item) => Math.max(max, item.x + item.w), 0)
    );

    next[breakpoint] = current.map((item) => {
      const widget = widgets.find((candidate) => candidate.id === item.i);
      if (!widget) return item;

      const preset = getLayoutPresets(widget.type)[breakpoint];
      const minW = Math.min(preset.minW, effectiveCols);
      const width = Math.min(Math.max(item.w, minW), effectiveCols);

      return {
        ...item,
        w: width,
        h: Math.max(item.h, preset.minH),
        x: Math.max(0, Math.min(item.x, effectiveCols - width)),
        minW,
        minH: preset.minH,
      };
    });
  }

  for (const widget of widgets) {
    const existsEverywhere = (Object.keys(BOARD_BREAKPOINTS) as BoardBreakpoint[]).every(
      (breakpoint) => (next[breakpoint] ?? []).some((item) => item.i === widget.id)
    );

    if (!existsEverywhere) {
      next = addWidgetToLayouts(next, widget);
    }
  }

  return next;
}

export function isBoardWidget(value: unknown): value is BoardWidget {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!isBaseWidgetRecord(record)) return false;

  switch (record.type) {
    case 'chart':
      return (
        typeof record.conid === 'number' &&
        typeof record.symbol === 'string' &&
        typeof record.name === 'string' &&
        typeof record.exchange === 'string' &&
        typeof record.color === 'string'
      );
    case 'watchlist-heatmap':
      return (
        Array.isArray(record.conids) &&
        record.conids.every((conid) => typeof conid === 'number') &&
        typeof record.maxItems === 'number'
      );
    case 'screener-list':
      return (
        typeof record.instrument === 'string' &&
        typeof record.instrumentLabel === 'string' &&
        typeof record.location === 'string' &&
        typeof record.locationLabel === 'string' &&
        typeof record.scanType === 'string' &&
        typeof record.scanLabel === 'string' &&
        typeof record.limit === 'number'
      );
    case 'series':
      return (
        isDataWidgetBaseRecord(record) &&
        (typeof record.baseline === 'undefined' || typeof record.baseline === 'number') &&
        (typeof record.metricFields === 'undefined' ||
          (Array.isArray(record.metricFields) &&
            record.metricFields.every((field) => typeof field === 'string')))
      );
    case 'table':
      return (
        isDataWidgetBaseRecord(record) &&
        (typeof record.maxRows === 'undefined' || typeof record.maxRows === 'number') &&
        (typeof record.visibleFields === 'undefined' ||
          (Array.isArray(record.visibleFields) &&
            record.visibleFields.every((field) => typeof field === 'string')))
      );
    case 'metric':
      return (
        isDataWidgetBaseRecord(record) &&
        (typeof record.metricFields === 'undefined' ||
          (Array.isArray(record.metricFields) &&
            record.metricFields.every((field) => typeof field === 'string')))
      );
    case 'pie':
      return (
        isDataWidgetBaseRecord(record) &&
        (typeof record.labelField === 'undefined' || typeof record.labelField === 'string') &&
        (typeof record.metricField === 'undefined' || typeof record.metricField === 'string')
      );
    case 'stacked-bar':
      return (
        isDataWidgetBaseRecord(record) &&
        (typeof record.xField === 'undefined' || typeof record.xField === 'string') &&
        (typeof record.stackField === 'undefined' || typeof record.stackField === 'string') &&
        (typeof record.metricField === 'undefined' || typeof record.metricField === 'string')
      );
    default:
      return false;
  }
}
