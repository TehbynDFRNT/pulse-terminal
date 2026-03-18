export type WidgetDatasetKind = 'time-series' | 'table' | 'pie' | 'stacked-bar';

export type WidgetDatasetValue = string | number | boolean | null;
export type WidgetDatasetDimensionFilters = Record<string, string>;

export type WidgetDatasetFieldRole = 'date' | 'dimension' | 'metric';

export type WidgetDatasetFieldFormat =
  | 'string'
  | 'number'
  | 'integer'
  | 'ratio'
  | 'percent'
  | 'currency';

export interface WidgetDatasetField {
  key: string;
  label: string;
  role: WidgetDatasetFieldRole;
  format?: WidgetDatasetFieldFormat;
  unit?: string;
  nullable?: boolean;
  nonNullCount?: number;
  uniqueValueCount?: number;
  sampleValues?: WidgetDatasetValue[];
}

export interface WidgetDatasetSourceMeta {
  adapter: string;
  providers: string[];
  route: string;
  asOf?: string;
  note?: string;
}

export interface WidgetDatasetViewMeta {
  xField?: string;
  labelField?: string;
  stackField?: string;
  defaultMetric?: string;
}

export interface WidgetDatasetRow {
  [key: string]: WidgetDatasetValue;
}

export interface WidgetDataset {
  version: 'v1';
  key: string;
  kind: WidgetDatasetKind;
  title: string;
  source: WidgetDatasetSourceMeta;
  fields: WidgetDatasetField[];
  dateField?: string;
  dimensionFields: string[];
  metricFields: string[];
  view: WidgetDatasetViewMeta;
  rows: WidgetDatasetRow[];
}

export function getDatasetField(
  dataset: WidgetDataset,
  key: string
): WidgetDatasetField | undefined {
  return dataset.fields.find((field) => field.key === key);
}

export function getDatasetMetricField(
  dataset: WidgetDataset,
  preferredMetric?: string
): WidgetDatasetField | undefined {
  const preferred =
    preferredMetric ? getDatasetField(dataset, preferredMetric) : undefined;
  if (preferred?.role === 'metric') return preferred;

  if (dataset.view.defaultMetric) {
    const fallback = getDatasetField(dataset, dataset.view.defaultMetric);
    if (fallback?.role === 'metric') return fallback;
  }

  return dataset.fields.find((field) => field.role === 'metric');
}

export function getDatasetDateField(dataset: WidgetDataset): WidgetDatasetField | undefined {
  if (dataset.dateField) {
    return getDatasetField(dataset, dataset.dateField);
  }

  return dataset.fields.find((field) => field.role === 'date');
}

function normalizeDimensionFilterValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized;
}

function normalizeDatasetFieldValue(value: WidgetDatasetValue) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function uniqueSampleValues(values: WidgetDatasetValue[], limit = 8) {
  const samples: WidgetDatasetValue[] = [];
  const seen = new Set<string>();
  let uniqueValueCount = 0;

  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;

    const marker = `${typeof value}:${String(value)}`;
    if (seen.has(marker)) continue;

    seen.add(marker);
    uniqueValueCount += 1;

    if (samples.length < limit) {
      samples.push(value);
    }
  }

  return { uniqueValueCount, samples };
}

export function filterDatasetByDimensions(
  dataset: WidgetDataset,
  filters?: WidgetDatasetDimensionFilters
): WidgetDataset {
  const activeFilters = Object.entries(filters ?? {}).filter(([fieldKey, value]) => {
    const normalizedValue = normalizeDimensionFilterValue(value);
    return (
      normalizedValue &&
      (dataset.dimensionFields.includes(fieldKey) || dataset.dateField === fieldKey)
    );
  });

  if (activeFilters.length === 0) {
    return dataset;
  }

  const rows = dataset.rows.filter((row) =>
    activeFilters.every(([fieldKey, value]) => {
      return normalizeDatasetFieldValue(row[fieldKey] ?? null) === normalizeDimensionFilterValue(value);
    })
  );

  if (rows.length === dataset.rows.length) {
    return dataset;
  }

  const fields = dataset.fields.map((field) => {
    const values = rows.map((row) => row[field.key] ?? null);
    const nonNullValues = values.filter(
      (value): value is WidgetDatasetValue =>
        value !== null && value !== undefined && value !== ''
    );
    const { uniqueValueCount, samples } = uniqueSampleValues(nonNullValues);

    return {
      ...field,
      nullable: nonNullValues.length < values.length,
      nonNullCount: nonNullValues.length,
      uniqueValueCount,
      sampleValues: samples,
    };
  });

  return {
    ...dataset,
    fields,
    rows,
  };
}
