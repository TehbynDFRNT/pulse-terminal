import type {
  WidgetDatasetDimensionFilters,
  WidgetDatasetKind,
} from '@/lib/dashboard/dataset-types';
import type { BoardDatasetKey, BoardDatasetQuery } from '@/lib/dashboard/widget-datasets';

export const DATA_BOARD_WIDGET_DEFINITIONS = [
  {
    type: 'series',
    label: 'Series',
    description: 'Line-based views for time-series datasets.',
    defaultTitle: 'Series',
    compatibleKinds: ['time-series'],
  },
  {
    type: 'table',
    label: 'Table',
    description: 'Row-oriented views for flat tabular datasets.',
    defaultTitle: 'Table',
    compatibleKinds: ['table', 'time-series'],
  },
  {
    type: 'metric',
    label: 'Metric',
    description: 'Compact summary cards pulled from one dataset row.',
    defaultTitle: 'Metric',
    compatibleKinds: ['table', 'time-series'],
  },
  {
    type: 'pie',
    label: 'Pie',
    description: 'Slice views from one label field and one metric field.',
    defaultTitle: 'Pie',
    compatibleKinds: ['pie', 'table'],
  },
  {
    type: 'stacked-bar',
    label: 'Stacked Bar',
    description: 'Grouped comparisons across one x field and one stack field.',
    defaultTitle: 'Stacked Bar',
    compatibleKinds: ['stacked-bar', 'table', 'time-series'],
  },
] as const satisfies ReadonlyArray<{
  type: string;
  label: string;
  description: string;
  defaultTitle: string;
  compatibleKinds: readonly WidgetDatasetKind[];
}>;

export type DataBoardWidgetType = (typeof DATA_BOARD_WIDGET_DEFINITIONS)[number]['type'];

export interface DataBoardWidgetBase {
  id: string;
  type: DataBoardWidgetType;
  title: string;
  subtitle?: string;
  datasetKey: BoardDatasetKey;
  params?: BoardDatasetQuery;
  dimensionFilters?: WidgetDatasetDimensionFilters;
  refreshIntervalMs?: number;
}

export interface SeriesDataBoardWidget extends DataBoardWidgetBase {
  type: 'series';
  baseline?: number;
  metricFields?: string[];
}

export interface TableDataBoardWidget extends DataBoardWidgetBase {
  type: 'table';
  visibleFields?: string[];
  maxRows?: number;
}

export interface MetricDataBoardWidget extends DataBoardWidgetBase {
  type: 'metric';
  metricFields?: string[];
}

export interface PieDataBoardWidget extends DataBoardWidgetBase {
  type: 'pie';
  labelField?: string;
  metricField?: string;
}

export interface StackedBarDataBoardWidget extends DataBoardWidgetBase {
  type: 'stacked-bar';
  xField?: string;
  stackField?: string;
  metricField?: string;
}

export type FutureDataBoardWidget =
  | SeriesDataBoardWidget
  | TableDataBoardWidget
  | MetricDataBoardWidget
  | PieDataBoardWidget
  | StackedBarDataBoardWidget;

export function getDataBoardWidgetDefinition(type: DataBoardWidgetType) {
  return DATA_BOARD_WIDGET_DEFINITIONS.find((definition) => definition.type === type)!;
}

export function widgetSupportsDatasetKind(
  widgetType: DataBoardWidgetType,
  datasetKind: WidgetDatasetKind
): boolean {
  const compatibleKinds = getDataBoardWidgetDefinition(widgetType)
    .compatibleKinds as readonly WidgetDatasetKind[];
  return compatibleKinds.includes(datasetKind);
}
