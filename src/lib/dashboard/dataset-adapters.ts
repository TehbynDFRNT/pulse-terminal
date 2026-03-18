import type { ChartSeries } from '@/components/charts/MultiLineChart';
import type { LivelinePoint, LivelineSeries } from 'liveline';
import type {
  WidgetDataset,
  WidgetDatasetField,
  WidgetDatasetRow,
  WidgetDatasetValue,
} from '@/lib/dashboard/dataset-types';
import { getDatasetDateField, getDatasetMetricField } from '@/lib/dashboard/dataset-types';

export interface DatasetTableColumn {
  key: string;
  label: string;
  align: 'left' | 'right';
  role: WidgetDatasetField['role'];
}

export interface DatasetTableModel {
  columns: DatasetTableColumn[];
  rows: WidgetDatasetRow[];
}

export interface DatasetMetricCard {
  key: string;
  label: string;
  value: string;
  rawValue: WidgetDatasetValue;
}

export interface DatasetPieSlice {
  key: string;
  label: string;
  value: number;
  share: number;
}

export interface DatasetStackedBarSegment {
  key: string;
  label: string;
  value: number;
}

export interface DatasetStackedBar {
  key: string;
  label: string;
  total: number;
  segments: DatasetStackedBarSegment[];
}

export interface DatasetLivelineSeries extends LivelineSeries {
  data: LivelinePoint[];
}

function toTimestamp(value: WidgetDatasetValue): number {
  if (typeof value !== 'string') return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function toNumeric(value: WidgetDatasetValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCellValue(value: WidgetDatasetValue, field?: WidgetDatasetField): string {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (typeof value === 'number') {
    if (!field) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });

    switch (field.format) {
      case 'integer':
        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
      case 'ratio':
        return `${(value * 100).toFixed(2)}${field.unit || '%'}`;
      case 'percent':
        return `${value.toFixed(2)}${field.unit || '%'}`;
      case 'currency':
        return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      case 'number':
      default:
        return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
  }

  return String(value);
}

function buildSeriesLabel(
  dataset: WidgetDataset,
  row: WidgetDatasetRow,
  metricKey: string
): string {
  const dimensionBits = dataset.dimensionFields
    .map((fieldKey) => row[fieldKey])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));

  const metricField = dataset.fields.find((field) => field.key === metricKey);
  const metricLabel = metricField?.label || metricKey;

  if (dimensionBits.length === 0 && dataset.metricFields.length === 1) {
    return metricLabel;
  }

  if (dimensionBits.length === 0) return metricLabel;
  if (dataset.metricFields.length === 1) return dimensionBits.join(' · ');
  return `${dimensionBits.join(' · ')} · ${metricLabel}`;
}

export function datasetToChartSeries(dataset: WidgetDataset): ChartSeries[] {
  return datasetToChartSeriesWithOptions(dataset);
}

function toUnixSeconds(value: string): number | null {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 1000;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
}

export function datasetToChartSeriesWithOptions(
  dataset: WidgetDataset,
  options?: { metricFields?: string[] }
): ChartSeries[] {
  const dateField = getDatasetDateField(dataset);
  if (!dateField) return [];
  const allowedMetricFields =
    options?.metricFields && options.metricFields.length > 0
      ? dataset.metricFields.filter((metricField) => options.metricFields?.includes(metricField))
      : dataset.metricFields;

  const grouped = new Map<string, { label: string; data: Array<{ time: string; value: number }> }>();

  for (const row of dataset.rows) {
    const timeValue = row[dateField.key];
    if (typeof timeValue !== 'string' || !timeValue) continue;

    for (const metricKey of allowedMetricFields) {
      const numeric = toNumeric(row[metricKey]);
      if (numeric === null) continue;

      const label = buildSeriesLabel(dataset, row, metricKey);
      const groupKey = `${label}::${metricKey}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, { label, data: [] });
      }

      grouped.get(groupKey)!.data.push({ time: timeValue, value: numeric });
    }
  }

  const palette = ['#00e676', '#448aff', '#ff9100', '#e040fb', '#ff1744', '#00e5ff', '#ffea00'];

  return Array.from(grouped.values())
    .map((group, index) => ({
      label: group.label,
      color: palette[index % palette.length],
      data: [...group.data].sort((left, right) => toTimestamp(left.time) - toTimestamp(right.time)),
    }))
    .filter((series) => series.data.length > 0);
}

export function datasetToLivelineSeriesWithOptions(
  dataset: WidgetDataset,
  options?: { metricFields?: string[] }
): DatasetLivelineSeries[] {
  return datasetToChartSeriesWithOptions(dataset, options)
    .map((series, index) => {
      const points = series.data
        .map((point) => {
          const time = toUnixSeconds(point.time);
          if (time === null) return null;

          return {
            time,
            value: point.value,
          } satisfies LivelinePoint;
        })
        .filter((point): point is LivelinePoint => Boolean(point))
        .sort((left, right) => left.time - right.time);

      return {
        id: `${series.label}:${index}`,
        label: series.label,
        color: series.color,
        data: points,
        value: points[points.length - 1]?.value ?? 0,
      } satisfies DatasetLivelineSeries;
    })
    .filter((series) => series.data.length > 0);
}

export function datasetToTableModel(
  dataset: WidgetDataset,
  options?: { visibleFields?: string[]; maxRows?: number }
): DatasetTableModel {
  const visibleKeys =
    options?.visibleFields && options.visibleFields.length > 0
      ? options.visibleFields
      : dataset.fields.map((field) => field.key);

  const columns = visibleKeys
    .map((key) => dataset.fields.find((field) => field.key === key))
    .filter((field): field is WidgetDatasetField => Boolean(field))
    .map((field) => ({
      key: field.key,
      label: field.label,
      align: field.role === 'metric' ? ('right' as const) : ('left' as const),
      role: field.role,
    }));

  const sourceRows =
    options?.maxRows && dataset.dateField
      ? dataset.rows.slice(-options.maxRows)
      : options?.maxRows
        ? dataset.rows.slice(0, options.maxRows)
        : dataset.rows;

  const rows = sourceRows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.key, row[column.key] ?? null]))
  );

  return { columns, rows };
}

export function datasetToMetricCards(
  dataset: WidgetDataset,
  options?: { metricFields?: string[]; rowIndex?: number }
): DatasetMetricCard[] {
  const resolvedRowIndex =
    typeof options?.rowIndex === 'number'
      ? options.rowIndex
      : dataset.dateField
        ? dataset.rows.length - 1
        : 0;
  const row = dataset.rows[resolvedRowIndex];
  if (!row) return [];

  const metricKeys =
    options?.metricFields && options.metricFields.length > 0
      ? options.metricFields
      : dataset.metricFields;

  return metricKeys
    .map((key) => dataset.fields.find((field) => field.key === key))
    .filter((field): field is WidgetDatasetField => Boolean(field))
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: formatCellValue(row[field.key], field),
      rawValue: row[field.key] ?? null,
    }));
}

export function datasetToPieSlices(
  dataset: WidgetDataset,
  options?: { labelField?: string; metricField?: string }
): DatasetPieSlice[] {
  const labelField = options?.labelField || dataset.view.labelField || dataset.dimensionFields[0];
  const metricField =
    options?.metricField ||
    dataset.view.defaultMetric ||
    getDatasetMetricField(dataset)?.key;

  if (!labelField || !metricField) return [];

  const totals = new Map<string, number>();

  for (const row of dataset.rows) {
    const labelValue = row[labelField];
    const metricValue = toNumeric(row[metricField]);
    if (labelValue === null || labelValue === undefined || metricValue === null) continue;
    const label = String(labelValue);
    totals.set(label, (totals.get(label) || 0) + metricValue);
  }

  const aggregate = Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);

  const totalValue = aggregate.reduce((sum, item) => sum + item.value, 0);
  if (totalValue <= 0) return [];

  return aggregate.map((item) => ({
    key: item.label,
    label: item.label,
    value: item.value,
    share: item.value / totalValue,
  }));
}

export function datasetToStackedBars(
  dataset: WidgetDataset,
  options?: { xField?: string; stackField?: string; metricField?: string }
): DatasetStackedBar[] {
  const xField =
    options?.xField ||
    dataset.view.xField ||
    dataset.dateField ||
    dataset.dimensionFields[0];
  const stackField =
    options?.stackField ||
    dataset.view.stackField ||
    dataset.dimensionFields.find((key) => key !== xField);
  const metricField =
    options?.metricField ||
    dataset.view.defaultMetric ||
    getDatasetMetricField(dataset)?.key;

  if (!xField || !stackField || !metricField) return [];

  const buckets = new Map<string, Map<string, number>>();

  for (const row of dataset.rows) {
    const xValue = row[xField];
    const stackValue = row[stackField];
    const metricValue = toNumeric(row[metricField]);
    if (
      xValue === null ||
      xValue === undefined ||
      stackValue === null ||
      stackValue === undefined ||
      metricValue === null
    ) {
      continue;
    }

    const category = String(xValue);
    const stack = String(stackValue);

    if (!buckets.has(category)) {
      buckets.set(category, new Map());
    }

    const categoryBucket = buckets.get(category)!;
    categoryBucket.set(stack, (categoryBucket.get(stack) || 0) + metricValue);
  }

  return Array.from(buckets.entries())
    .map(([label, segments]) => {
      const segmentList = Array.from(segments.entries())
        .map(([segmentLabel, value]) => ({
          key: segmentLabel,
          label: segmentLabel,
          value,
        }))
        .sort((left, right) => right.value - left.value);

      return {
        key: label,
        label,
        total: segmentList.reduce((sum, segment) => sum + segment.value, 0),
        segments: segmentList,
      };
    })
    .sort((left, right) => {
      const leftDate = Date.parse(left.label);
      const rightDate = Date.parse(right.label);
      if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
        return leftDate - rightDate;
      }
      return right.total - left.total;
    });
}

export function formatDatasetTableCell(
  dataset: WidgetDataset,
  columnKey: string,
  value: WidgetDatasetValue
): string {
  return formatCellValue(value, dataset.fields.find((field) => field.key === columnKey));
}

export function formatDatasetValue(
  value: WidgetDatasetValue,
  field?: WidgetDatasetField
): string {
  return formatCellValue(value, field);
}
