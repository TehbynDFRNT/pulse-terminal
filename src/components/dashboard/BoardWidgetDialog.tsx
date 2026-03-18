'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  LayoutGrid,
  LineChart,
  PieChart,
  Search,
  TableProperties,
} from 'lucide-react';
import {
  BOARD_WIDGET_DEFINITIONS,
  createChartBoardWidget,
  createMetricBoardWidget,
  createPieBoardWidget,
  createScreenerListBoardWidget,
  createSeriesBoardWidget,
  createStackedBarBoardWidget,
  createTableBoardWidget,
  createWatchlistHeatmapWidget,
  getBoardWidgetDefinition,
  type BoardWidget,
  type BoardWidgetType,
} from '@/lib/dashboard/widgets';
import type { DataBoardWidgetType, FutureDataBoardWidget } from '@/lib/dashboard/data-widgets';
import {
  type BoardDatasetParamField,
  type BoardDatasetDefinition,
  getBoardDatasetDefinition,
  getBoardDatasetInitialParams,
  getCompatibleBoardDatasets,
  isBoardDatasetKey,
  resolveBoardDatasetParams,
  type BoardDatasetKey,
} from '@/lib/dashboard/widget-datasets';
import { formatDatasetValue } from '@/lib/dashboard/dataset-adapters';
import { useWidgetDataset } from '@/lib/dashboard/use-widget-dataset';
import {
  filterDatasetByDimensions,
  type WidgetDataset,
  type WidgetDatasetDimensionFilters,
  type WidgetDatasetField,
} from '@/lib/dashboard/dataset-types';
import {
  buildOpenBBCatalogUrl,
  type OpenBBCatalogOption,
} from '@/lib/openbb/catalogs';
import type { ScannerParams, SearchResult, WatchlistItem } from '@/lib/ibkr/types';
import {
  getCompactScannerParams,
  searchInstruments,
} from '@/lib/ibkr/gateway-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface BoardWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWidget: BoardWidget | null;
  watchlistItems: WatchlistItem[];
  selectedInstrument: WatchlistItem | null;
  widgetCount: number;
  onSave: (widget: BoardWidget) => void;
}

interface ChartInstrumentChoice {
  conid: number;
  symbol: string;
  name: string;
  exchange: string;
}

const HEATMAP_LIMIT_OPTIONS = ['4', '6', '8', '12', '16'];
const SCREENER_LIMIT_OPTIONS = ['5', '8', '10', '15', '20'];
const DEFAULT_DATASET_KEY: BoardDatasetKey = 'macro.us-10y-yield';
const DATASET_PARAM_SELECT_ALL_VALUE = '__all__';

function isDataWidgetType(type: BoardWidgetType): type is DataBoardWidgetType {
  return (
    type === 'series' ||
    type === 'table' ||
    type === 'metric' ||
    type === 'pie' ||
    type === 'stacked-bar'
  );
}

function getDefaultDatasetKey(widgetType: DataBoardWidgetType): BoardDatasetKey {
  return getCompatibleBoardDatasets(widgetType)[0]?.key ?? DEFAULT_DATASET_KEY;
}

function isDataWidget(widget: BoardWidget | null): widget is FutureDataBoardWidget {
  return Boolean(widget && isDataWidgetType(widget.type));
}

function widgetTypeIcon(type: BoardWidgetType) {
  switch (type) {
    case 'watchlist-heatmap':
      return LayoutGrid;
    case 'screener-list':
    case 'table':
      return TableProperties;
    case 'series':
      return LineChart;
    case 'metric':
      return Activity;
    case 'pie':
      return PieChart;
    case 'stacked-bar':
      return BarChart3;
    case 'chart':
    default:
      return Search;
  }
}

function widgetSourceKind(type: BoardWidgetType): 'IBKR' | 'OpenBB' {
  return isDataWidgetType(type) ? 'OpenBB' : 'IBKR';
}

function toChartChoice(
  item: Pick<WatchlistItem | SearchResult, 'conid' | 'symbol' | 'name' | 'exchange'>
): ChartInstrumentChoice {
  return {
    conid: item.conid,
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchange,
  };
}

function sortSearchResults(results: SearchResult[]) {
  return [...results].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

function toDatasetParamFormState(
  datasetKey: BoardDatasetKey,
  params?: Record<string, unknown>
): Record<string, string> {
  const next = getBoardDatasetInitialParams(datasetKey);

  if (!params) return next;

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    next[key] = String(value);
  }

  return next;
}

function sanitizeFieldSelection(
  current: string[],
  allowed: string[],
  fallback: string[] = []
): string[] {
  if (allowed.length === 0) {
    return current.length === 0 ? current : [];
  }

  const next = current.filter((field) => allowed.includes(field));
  if (
    next.length > 0 &&
    next.length === current.length &&
    next.every((field, index) => field === current[index])
  ) {
    return current;
  }
  if (next.length > 0) return next;

  const preferred = fallback.filter((field) => allowed.includes(field));
  if (preferred.length > 0) {
    if (
      preferred.length === current.length &&
      preferred.every((field, index) => field === current[index])
    ) {
      return current;
    }
    return preferred;
  }

  const defaultSelection = allowed.slice(0, Math.min(allowed.length, 4));
  if (
    defaultSelection.length === current.length &&
    defaultSelection.every((field, index) => field === current[index])
  ) {
    return current;
  }

  return defaultSelection;
}

function sanitizeSingleField(
  current: string,
  allowed: string[],
  fallback?: string
): string {
  if (current && allowed.includes(current)) return current;
  if (fallback && allowed.includes(fallback)) return fallback;
  return allowed[0] ?? '';
}

function toggleField(current: string[], field: string) {
  return current.includes(field)
    ? current.filter((candidate) => candidate !== field)
    : [...current, field];
}

function sanitizeDimensionFilters(
  current: WidgetDatasetDimensionFilters,
  allowedFields: string[]
): WidgetDatasetDimensionFilters {
  return Object.fromEntries(
    Object.entries(current).filter(
      ([fieldKey, value]) => allowedFields.includes(fieldKey) && value.trim() !== ''
    )
  );
}

function formatFieldExampleValue(field: WidgetDatasetField, value: unknown): string {
  const formatted = formatDatasetValue(
    value === undefined ? null : (value as string | number | boolean | null),
    field
  );

  if (formatted.length <= 28) return formatted;
  return `${formatted.slice(0, 25)}...`;
}

function formatFieldSampleHeadline(field: WidgetDatasetField): string | null {
  if (!field.sampleValues?.length) return null;

  if (field.role === 'date' && field.sampleValues.length > 1) {
    const first = formatFieldExampleValue(field, field.sampleValues[0]);
    const last = formatFieldExampleValue(
      field,
      field.sampleValues[field.sampleValues.length - 1]
    );
    return `${first} -> ${last}`;
  }

  if (field.role === 'metric') {
    return field.sampleValues
      .slice(0, 3)
      .map((value) => formatFieldExampleValue(field, value))
      .join(' · ');
  }

  return null;
}

function getFieldSampleChips(field: WidgetDatasetField): string[] {
  if (!field.sampleValues?.length) return [];

  if (field.role === 'date') {
    return [];
  }

  const limit = field.role === 'metric' ? 4 : 3;
  return field.sampleValues
    .slice(0, limit)
    .map((value) => formatFieldExampleValue(field, value));
}

function normalizeSuggestionValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function uniqueSuggestions(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function fieldOriginLabel(field: BoardDatasetParamField) {
  return field.origin === 'app' ? 'Pulse' : 'OpenBB';
}

function formatParamDefaultValue(field: BoardDatasetParamField) {
  if (field.defaultValue === undefined) return null;
  if (typeof field.defaultValue === 'boolean') {
    return field.defaultValue ? 'true' : 'false';
  }
  return String(field.defaultValue);
}

function resolveParamPresetValue(value: string, mode: 'literal' | 'lookback' = 'literal') {
  if (mode === 'literal') return value;

  const match = value.match(/^(\d+)([dym])$/i);
  if (!match) return value;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const next = new Date();

  if (unit === 'y') {
    next.setFullYear(next.getFullYear() - amount);
  } else if (unit === 'm') {
    next.setMonth(next.getMonth() - amount);
  } else if (unit === 'd') {
    next.setDate(next.getDate() - amount);
  }

  return next.toISOString().slice(0, 10);
}

function getParamFieldSuggestions(
  field: BoardDatasetParamField,
  datasetPreview: WidgetDataset | null | undefined
): string[] {
  const suggestions: string[] = [];

  if (field.suggestFromFieldKey && datasetPreview) {
    const suggestKey = field.suggestFromFieldKey;
    const previewField = datasetPreview.fields.find(
      (candidate) => candidate.key === suggestKey
    );

    if (previewField?.sampleValues?.length) {
      suggestions.push(
        ...previewField.sampleValues
          .map((value) => normalizeSuggestionValue(value))
          .filter((value): value is string => Boolean(value))
      );
    }

    const rowSuggestions = datasetPreview.rows
      .map((row) => normalizeSuggestionValue(row[suggestKey]))
      .filter((value): value is string => Boolean(value));

    suggestions.push(...rowSuggestions);
  }

  return uniqueSuggestions(suggestions);
}

function getParamFieldSelectOptions(
  field: BoardDatasetParamField,
  datasetPreview: WidgetDataset | null | undefined,
  currentValue?: string
) {
  if (field.options?.length) {
    return field.options;
  }

  const suggestions = getParamFieldSuggestions(field, datasetPreview);
  const normalizedCurrentValue = normalizeSuggestionValue(currentValue);
  const values = normalizedCurrentValue
    ? uniqueSuggestions([normalizedCurrentValue, ...suggestions])
    : suggestions;

  return values.map((value) => ({
    value,
    label: value,
  }));
}

function getDimensionFilterOptions(
  dataset: WidgetDataset | null | undefined,
  currentFilters: WidgetDatasetDimensionFilters,
  fieldKey: string
) {
  if (!dataset) return [];

  const rows = dataset.rows.filter((row) =>
    Object.entries(currentFilters).every(([activeFieldKey, activeValue]) => {
      if (activeFieldKey === fieldKey) return true;
      const normalizedActiveValue = normalizeSuggestionValue(activeValue);
      if (!normalizedActiveValue) return true;
      const rowValue = normalizeSuggestionValue(row[activeFieldKey]);
      return rowValue === normalizedActiveValue;
    })
  );

  return uniqueSuggestions(
    rows
      .map((row) => normalizeSuggestionValue(row[fieldKey]))
      .filter((value): value is string => Boolean(value))
  );
}

interface SearchableParamInputProps {
  field: BoardDatasetParamField;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}

function SearchableParamInput({
  field,
  value,
  suggestions,
  onChange,
}: SearchableParamInputProps) {
  const [open, setOpen] = useState(false);
  const deferredValue = useDeferredValue(value.trim().toLowerCase());

  const filteredSuggestions = useMemo(() => {
    const next = deferredValue
      ? suggestions.filter((candidate) =>
          candidate.toLowerCase().includes(deferredValue)
        )
      : suggestions;

    return next.slice(0, 10);
  }, [deferredValue, suggestions]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          type="text"
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 100);
          }}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="pr-9"
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
        </div>
      </div>

      {open ? (
        <div className="max-h-40 overflow-auto rounded-md border border-border/70 bg-background/80 p-1">
          {filteredSuggestions.length ? (
            <div className="space-y-1">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(suggestion);
                    setOpen(false);
                  }}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left font-mono text-sm text-foreground transition-colors hover:bg-accent/50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-2 py-2 text-[11px] text-muted-foreground">
              No matching suggestions. You can still enter a raw value.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface OpenBBCatalogResponse {
  key: string;
  query: string;
  options: OpenBBCatalogOption[];
  note?: string;
}

interface CatalogParamInputProps {
  field: BoardDatasetParamField;
  value: string;
  datasetSourceKey?: string;
  datasetParams?: Record<string, string>;
  onChange: (value: string) => void;
}

function CatalogParamInput({
  field,
  value,
  datasetSourceKey,
  datasetParams,
  onChange,
}: CatalogParamInputProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenBBCatalogOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const deferredValue = useDeferredValue(value.trim());

  useEffect(() => {
    if (!open || !field.catalogKey) return;

    const minimumQueryLength = field.catalogKey === 'ibkr-symbol' ? 1 : 2;
    if (deferredValue.length < minimumQueryLength) {
      setOptions([]);
      setError('');
      setNote(`Enter at least ${minimumQueryLength} character${minimumQueryLength === 1 ? '' : 's'} to search the catalog.`);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError('');

      try {
        if (field.catalogKey === 'ibkr-symbol') {
          const results = sortSearchResults(await searchInstruments(deferredValue));
          const mappedOptions: OpenBBCatalogOption[] = [];
          const seen = new Set<string>();

          for (const result of results) {
            const symbol = result.symbol.trim();
            if (!symbol || seen.has(symbol)) continue;
            seen.add(symbol);
            mappedOptions.push({
              value: symbol,
              label: symbol,
              description: result.name,
              meta: result.exchange,
            });
            if (mappedOptions.length >= 25) break;
          }

          setOptions(mappedOptions);
          setNote('');
        } else {
          const openbbCatalogKey = field.catalogKey;
          if (!openbbCatalogKey) {
            setOptions([]);
            setNote('');
            return;
          }

          const extraParams =
            openbbCatalogKey === 'dataset-field' && datasetSourceKey
              ? {
                  dataset_key: datasetSourceKey,
                  field: field.suggestFromFieldKey || field.key,
                  ...Object.fromEntries(
                    Object.entries(datasetParams ?? {}).filter(
                      ([paramKey, paramValue]) =>
                        paramKey !== field.key &&
                        paramValue.trim() !== ''
                    )
                  ),
                }
              : {};

          const response = await fetch(
            buildOpenBBCatalogUrl(openbbCatalogKey, deferredValue, extraParams),
            {
              signal: controller.signal,
              headers: { Accept: 'application/json' },
              cache: 'no-store',
            }
          );
          const payload = (await response.json()) as OpenBBCatalogResponse & {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(payload.error || 'Catalog lookup failed');
          }

          setOptions(Array.isArray(payload.options) ? payload.options : []);
          setNote(payload.note || '');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setOptions([]);
        setNote('');
        setError(err instanceof Error ? err.message : 'Catalog lookup failed');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [
    datasetSourceKey,
    datasetParams,
    deferredValue,
    field.catalogKey,
    field.key,
    field.suggestFromFieldKey,
    open,
  ]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          type="text"
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 100);
          }}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="pr-9"
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
        </div>
      </div>

      {open ? (
        <div className="max-h-56 overflow-auto rounded-md border border-border/70 bg-background/90 p-1">
          {loading ? (
            <div className="px-2 py-2 text-[11px] text-muted-foreground">
              Searching catalog...
            </div>
          ) : error ? (
            <div className="px-2 py-2 text-[11px] text-destructive">{error}</div>
          ) : options.length ? (
            <div className="space-y-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-foreground">{option.label}</div>
                    {option.description ? (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {option.description}
                      </div>
                    ) : null}
                  </div>
                  {option.meta ? (
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      {option.meta}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-2 py-2 text-[11px] text-muted-foreground">
              {note || 'No catalog matches. You can still enter a raw value.'}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function BoardWidgetDialog({
  open,
  onOpenChange,
  initialWidget,
  watchlistItems,
  selectedInstrument,
  widgetCount,
  onSave,
}: BoardWidgetDialogProps) {
  const isEditing = Boolean(initialWidget);
  const paramsRequestIdRef = useRef(0);
  const initializedDialogKeyRef = useRef<string | null>(null);

  const [widgetType, setWidgetType] = useState<BoardWidgetType>('chart');
  const [title, setTitle] = useState('');

  const [chartChoice, setChartChoice] = useState<ChartInstrumentChoice | null>(null);
  const [chartQuery, setChartQuery] = useState('');
  const [chartResults, setChartResults] = useState<SearchResult[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');

  const [heatmapConids, setHeatmapConids] = useState<number[]>([]);
  const [heatmapMaxItems, setHeatmapMaxItems] = useState('8');

  const [scannerParams, setScannerParams] = useState<ScannerParams | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scannerInstrument, setScannerInstrument] = useState('STK');
  const [scannerLocation, setScannerLocation] = useState('');
  const [scannerScanType, setScannerScanType] = useState('');
  const [scannerLimit, setScannerLimit] = useState('8');

  const [datasetKey, setDatasetKey] = useState<BoardDatasetKey>(DEFAULT_DATASET_KEY);
  const [datasetParams, setDatasetParams] = useState<Record<string, string>>(
    getBoardDatasetInitialParams(DEFAULT_DATASET_KEY)
  );
  const [dimensionFilters, setDimensionFilters] = useState<WidgetDatasetDimensionFilters>({});
  const [seriesMetricFields, setSeriesMetricFields] = useState<string[]>([]);
  const [tableVisibleFields, setTableVisibleFields] = useState<string[]>([]);
  const [tableMaxRows, setTableMaxRows] = useState('24');
  const [metricFields, setMetricFields] = useState<string[]>([]);
  const [pieLabelField, setPieLabelField] = useState('');
  const [pieMetricField, setPieMetricField] = useState('');
  const [stackedBarXField, setStackedBarXField] = useState('');
  const [stackedBarStackField, setStackedBarStackField] = useState('');
  const [stackedBarMetricField, setStackedBarMetricField] = useState('');

  const selectedWidgetDefinition = getBoardWidgetDefinition(widgetType);
  const datasetOptions = useMemo(
    () => (isDataWidgetType(widgetType) ? getCompatibleBoardDatasets(widgetType) : []),
    [widgetType]
  );
  const selectedDatasetDefinition: BoardDatasetDefinition | null =
    isDataWidgetType(widgetType) && isBoardDatasetKey(datasetKey)
      ? getBoardDatasetDefinition(datasetKey)
      : null;
  const selectedDatasetParamFields = selectedDatasetDefinition?.paramFields ?? [];
  const deferredDatasetParams = useDeferredValue(datasetParams);
  const resolvedPreviewParams = useMemo(
    () =>
      isDataWidgetType(widgetType)
        ? resolveBoardDatasetParams(datasetKey, deferredDatasetParams)
        : {},
    [datasetKey, deferredDatasetParams, widgetType]
  );
  const {
    data: rawDatasetPreview,
    loading: datasetPreviewLoading,
    error: datasetPreviewError,
  } = useWidgetDataset({
    key: datasetKey,
    params: resolvedPreviewParams,
    enabled: open && isDataWidgetType(widgetType),
  });
  const datasetPreview = useMemo(
    () =>
      rawDatasetPreview
        ? filterDatasetByDimensions(rawDatasetPreview, dimensionFilters)
        : null,
    [dimensionFilters, rawDatasetPreview]
  );
  const previewFields = useMemo(() => datasetPreview?.fields ?? [], [datasetPreview?.fields]);
  const previewFieldKeys = useMemo(
    () => previewFields.map((field) => field.key),
    [previewFields]
  );
  const previewMetricFieldKeys = useMemo(
    () => datasetPreview?.metricFields ?? [],
    [datasetPreview?.metricFields]
  );
  const previewDimensionFieldKeys = useMemo(
    () => datasetPreview?.dimensionFields ?? [],
    [datasetPreview?.dimensionFields]
  );
  const rawPreviewDimensionFieldKeys = useMemo(
    () => rawDatasetPreview?.dimensionFields ?? [],
    [rawDatasetPreview?.dimensionFields]
  );
  const previewDateField = datasetPreview?.dateField ?? '';
  const previewCategoryFieldKeys = useMemo(
    () => [
      ...(previewDateField ? [previewDateField] : []),
      ...previewDimensionFieldKeys,
    ],
    [previewDateField, previewDimensionFieldKeys]
  );
  const previewStackFieldKeys = useMemo(
    () => previewDimensionFieldKeys.filter((field) => field !== stackedBarXField),
    [previewDimensionFieldKeys, stackedBarXField]
  );
  const previewSampleRow =
    datasetPreview?.rows[
      datasetPreview?.dateField ? datasetPreview.rows.length - 1 : 0
    ] ?? null;

  const resetChartSearch = () => {
    setChartQuery('');
    setChartResults([]);
    setChartError('');
    setChartLoading(false);
  };

  const loadScannerParams = useCallback(async (instrument: string) => {
    const requestId = ++paramsRequestIdRef.current;
    setScannerLoading(true);
    setScannerError('');

    try {
      const next = await getCompactScannerParams(instrument);
      if (paramsRequestIdRef.current !== requestId) return;
      setScannerParams(next);
    } catch (err) {
      if (paramsRequestIdRef.current !== requestId) return;
      setScannerParams(null);
      setScannerError(err instanceof Error ? err.message : 'Failed to load screener config');
    } finally {
      if (paramsRequestIdRef.current === requestId) {
        setScannerLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      initializedDialogKeyRef.current = null;
      return;
    }

    const initializationKey = initialWidget ? `edit:${initialWidget.id}` : 'new';
    if (initializedDialogKeyRef.current === initializationKey) return;
    initializedDialogKeyRef.current = initializationKey;

    if (initialWidget) {
      setWidgetType(initialWidget.type);
      setTitle(initialWidget.title);

      if (initialWidget.type === 'chart') {
        setChartChoice(toChartChoice(initialWidget));
      } else {
        setChartChoice(selectedInstrument ? toChartChoice(selectedInstrument) : null);
      }

      if (initialWidget.type === 'watchlist-heatmap') {
        setHeatmapConids(initialWidget.conids);
        setHeatmapMaxItems(String(initialWidget.maxItems));
      } else {
        setHeatmapConids(watchlistItems.slice(0, 8).map((item) => item.conid));
        setHeatmapMaxItems('8');
      }

      if (initialWidget.type === 'screener-list') {
        setScannerInstrument(initialWidget.instrument);
        setScannerLocation(initialWidget.location);
        setScannerScanType(initialWidget.scanType);
        setScannerLimit(String(initialWidget.limit));
      } else {
        setScannerInstrument('STK');
        setScannerLocation('');
        setScannerScanType('');
        setScannerLimit('8');
      }

      if (isDataWidget(initialWidget)) {
        setDatasetKey(initialWidget.datasetKey);
        setDatasetParams(toDatasetParamFormState(initialWidget.datasetKey, initialWidget.params));
        setDimensionFilters(initialWidget.dimensionFilters ?? {});
        setSeriesMetricFields(
          initialWidget.type === 'series' ? initialWidget.metricFields ?? [] : []
        );
        setTableVisibleFields(
          initialWidget.type === 'table' ? initialWidget.visibleFields ?? [] : []
        );
        setTableMaxRows(
          initialWidget.type === 'table' && initialWidget.maxRows
            ? String(initialWidget.maxRows)
            : String(
                getBoardDatasetDefinition(initialWidget.datasetKey).defaults?.table?.maxRows ??
                  24
              )
        );
        setMetricFields(
          initialWidget.type === 'metric' ? initialWidget.metricFields ?? [] : []
        );
        setPieLabelField(initialWidget.type === 'pie' ? initialWidget.labelField ?? '' : '');
        setPieMetricField(initialWidget.type === 'pie' ? initialWidget.metricField ?? '' : '');
        setStackedBarXField(
          initialWidget.type === 'stacked-bar' ? initialWidget.xField ?? '' : ''
        );
        setStackedBarStackField(
          initialWidget.type === 'stacked-bar' ? initialWidget.stackField ?? '' : ''
        );
        setStackedBarMetricField(
          initialWidget.type === 'stacked-bar' ? initialWidget.metricField ?? '' : ''
        );
      } else {
        const nextDatasetKey = getDefaultDatasetKey('series');
        setDatasetKey(nextDatasetKey);
        setDatasetParams(getBoardDatasetInitialParams(nextDatasetKey));
        setDimensionFilters({});
        const defaults = getBoardDatasetDefinition(nextDatasetKey).defaults;
        setSeriesMetricFields(defaults?.series?.metricFields ?? []);
        setTableVisibleFields(defaults?.table?.visibleFields ?? []);
        setTableMaxRows(String(defaults?.table?.maxRows ?? 24));
        setMetricFields(defaults?.metric?.metricFields ?? []);
        setPieLabelField(defaults?.pie?.labelField ?? '');
        setPieMetricField(defaults?.pie?.metricField ?? '');
        setStackedBarXField(defaults?.stackedBar?.xField ?? '');
        setStackedBarStackField(defaults?.stackedBar?.stackField ?? '');
        setStackedBarMetricField(defaults?.stackedBar?.metricField ?? '');
      }
    } else {
      setWidgetType('chart');
      setTitle('');
      setChartChoice(selectedInstrument ? toChartChoice(selectedInstrument) : null);
      setHeatmapConids(watchlistItems.slice(0, 8).map((item) => item.conid));
      setHeatmapMaxItems('8');
      setScannerInstrument('STK');
      setScannerLocation('');
      setScannerScanType('');
      setScannerLimit('8');
      const nextDatasetKey = getDefaultDatasetKey('series');
      setDatasetKey(nextDatasetKey);
      setDatasetParams(getBoardDatasetInitialParams(nextDatasetKey));
      setDimensionFilters({});
      const defaults = getBoardDatasetDefinition(nextDatasetKey).defaults;
      setSeriesMetricFields(defaults?.series?.metricFields ?? []);
      setTableVisibleFields(defaults?.table?.visibleFields ?? []);
      setTableMaxRows(String(defaults?.table?.maxRows ?? 24));
      setMetricFields(defaults?.metric?.metricFields ?? []);
      setPieLabelField(defaults?.pie?.labelField ?? '');
      setPieMetricField(defaults?.pie?.metricField ?? '');
      setStackedBarXField(defaults?.stackedBar?.xField ?? '');
      setStackedBarStackField(defaults?.stackedBar?.stackField ?? '');
      setStackedBarMetricField(defaults?.stackedBar?.metricField ?? '');
    }

    resetChartSearch();
    setScannerParams(null);
    setScannerError('');
    setScannerLoading(false);
  }, [initialWidget, open, selectedInstrument, watchlistItems]);

  useEffect(() => {
    if (!open || widgetType !== 'screener-list') return;
    void loadScannerParams(scannerInstrument || 'STK');
  }, [loadScannerParams, open, scannerInstrument, widgetType]);

  useEffect(() => {
    if (!scannerParams || widgetType !== 'screener-list') return;

    const locations = scannerParams.locations;
    const scanTypes = scannerParams.scanTypes;

    if (!locations.some((option) => option.code === scannerLocation)) {
      setScannerLocation(locations[0]?.code ?? '');
    }

    if (!scanTypes.some((option) => option.code === scannerScanType)) {
      setScannerScanType(scanTypes[0]?.code ?? '');
    }
  }, [scannerLocation, scannerParams, scannerScanType, widgetType]);

  useEffect(() => {
    if (!open || !isDataWidgetType(widgetType)) return;

    const compatible = getCompatibleBoardDatasets(widgetType);
    if (compatible.length === 0) return;

    if (!compatible.some((option) => option.key === datasetKey)) {
      const nextDatasetKey = compatible[0].key;
      setDatasetKey(nextDatasetKey);
      setDatasetParams(getBoardDatasetInitialParams(nextDatasetKey));
      setDimensionFilters({});
    }
  }, [datasetKey, open, widgetType]);

  useEffect(() => {
    if (!open) return;

    setDimensionFilters((current) =>
      sanitizeDimensionFilters(current, rawPreviewDimensionFieldKeys)
    );
  }, [open, rawPreviewDimensionFieldKeys]);

  useEffect(() => {
    if (!open || !isDataWidgetType(widgetType) || !selectedDatasetDefinition || !datasetPreview) {
      return;
    }

    const defaults = selectedDatasetDefinition.defaults;

    setSeriesMetricFields((current) =>
      sanitizeFieldSelection(
        current,
        previewMetricFieldKeys,
        defaults?.series?.metricFields ?? previewMetricFieldKeys
      )
    );
    setTableVisibleFields((current) =>
      sanitizeFieldSelection(
        current,
        previewFieldKeys,
        defaults?.table?.visibleFields ?? previewFieldKeys.slice(0, 6)
      )
    );
    setTableMaxRows((current) => current || String(defaults?.table?.maxRows ?? 24));
    setMetricFields((current) =>
      sanitizeFieldSelection(
        current,
        previewMetricFieldKeys,
        defaults?.metric?.metricFields ?? previewMetricFieldKeys.slice(0, 4)
      )
    );
    setPieLabelField((current) =>
      sanitizeSingleField(
        current,
        previewDimensionFieldKeys,
        defaults?.pie?.labelField ?? previewDimensionFieldKeys[0]
      )
    );
    setPieMetricField((current) =>
      sanitizeSingleField(
        current,
        previewMetricFieldKeys,
        defaults?.pie?.metricField ??
          datasetPreview.view.defaultMetric ??
          previewMetricFieldKeys[0]
      )
    );
    setStackedBarXField((current) =>
      sanitizeSingleField(
        current,
        previewCategoryFieldKeys,
        defaults?.stackedBar?.xField ??
          datasetPreview.view.xField ??
          previewDateField ??
          previewDimensionFieldKeys[0]
      )
    );
    setStackedBarMetricField((current) =>
      sanitizeSingleField(
        current,
        previewMetricFieldKeys,
        defaults?.stackedBar?.metricField ??
          datasetPreview.view.defaultMetric ??
          previewMetricFieldKeys[0]
      )
    );
  }, [
    datasetPreview,
    open,
    previewCategoryFieldKeys,
    previewDateField,
    previewDimensionFieldKeys,
    previewFieldKeys,
    previewMetricFieldKeys,
    selectedDatasetDefinition,
    widgetType,
  ]);

  useEffect(() => {
    if (!open || !datasetPreview) return;

    const defaults = selectedDatasetDefinition?.defaults;
    setStackedBarStackField((current) =>
      sanitizeSingleField(
        current,
        previewStackFieldKeys,
        defaults?.stackedBar?.stackField ??
          datasetPreview.view.stackField ??
          previewStackFieldKeys[0]
      )
    );
  }, [datasetPreview, open, previewStackFieldKeys, selectedDatasetDefinition, stackedBarXField]);

  const executeChartSearch = async () => {
    if (!chartQuery.trim()) {
      setChartResults([]);
      setChartError('');
      return;
    }

    setChartLoading(true);
    setChartError('');
    try {
      const next = await searchInstruments(chartQuery.trim());
      setChartResults(sortSearchResults(next).slice(0, 12));
    } catch (err) {
      setChartResults([]);
      setChartError(err instanceof Error ? err.message : 'Instrument lookup failed');
    } finally {
      setChartLoading(false);
    }
  };

  const toggleHeatmapConid = (conid: number) => {
    setHeatmapConids((current) =>
      current.includes(conid)
        ? current.filter((candidate) => candidate !== conid)
        : [...current, conid]
    );
  };

  const chartWatchlistOptions = useMemo(
    () =>
      watchlistItems.map((item) => ({
        code: String(item.conid),
        label: `${item.symbol} · ${item.exchange}`,
      })),
    [watchlistItems]
  );

  const saveWidget = () => {
    let nextWidget: BoardWidget | null = null;

    if (widgetType === 'chart') {
      if (!chartChoice) return;
      const created = createChartBoardWidget(chartChoice, widgetCount, { title });
      nextWidget = initialWidget?.type === 'chart'
        ? {
            ...created,
            id: initialWidget.id,
            color: initialWidget.color,
          }
        : created;
    }

    if (widgetType === 'watchlist-heatmap') {
      if (heatmapConids.length === 0) return;
      const selectedItems = watchlistItems.filter((item) => heatmapConids.includes(item.conid));
      const created = createWatchlistHeatmapWidget(selectedItems, widgetCount, {
        title,
        maxItems: Number(heatmapMaxItems),
      });
      nextWidget = initialWidget?.type === 'watchlist-heatmap'
        ? {
            ...created,
            id: initialWidget.id,
          }
        : created;
    }

    if (widgetType === 'screener-list') {
      if (!scannerParams || !scannerLocation || !scannerScanType) return;
      const instrumentLabel =
        scannerParams.instruments.find((option) => option.code === scannerInstrument)?.label ||
        scannerInstrument;
      const locationLabel =
        scannerParams.locations.find((option) => option.code === scannerLocation)?.label ||
        scannerLocation;
      const scanLabel =
        scannerParams.scanTypes.find((option) => option.code === scannerScanType)?.label ||
        scannerScanType;

      const created = createScreenerListBoardWidget(
        {
          instrument: scannerInstrument,
          instrumentLabel,
          location: scannerLocation,
          locationLabel,
          scanType: scannerScanType,
          scanLabel,
          limit: Number(scannerLimit),
          title,
        },
        widgetCount
      );
      nextWidget = initialWidget?.type === 'screener-list'
        ? {
            ...created,
            id: initialWidget.id,
          }
        : created;
    }

    if (isDataWidgetType(widgetType)) {
      const params = resolveBoardDatasetParams(datasetKey, datasetParams);
      const resolvedDimensionFilters = sanitizeDimensionFilters(
        dimensionFilters,
        rawPreviewDimensionFieldKeys
      );
      const nextDimensionFilters =
        Object.keys(resolvedDimensionFilters).length > 0
          ? resolvedDimensionFilters
          : undefined;

      switch (widgetType) {
        case 'series': {
          const created = createSeriesBoardWidget(
            {
              datasetKey,
              params,
              dimensionFilters: nextDimensionFilters,
              title,
              metricFields: seriesMetricFields,
            },
            widgetCount
          );
          nextWidget = initialWidget?.type === 'series' ? { ...created, id: initialWidget.id } : created;
          break;
        }
        case 'table': {
          const created = createTableBoardWidget(
            {
              datasetKey,
              params,
              dimensionFilters: nextDimensionFilters,
              title,
              visibleFields: tableVisibleFields,
              maxRows: Math.max(1, Number(tableMaxRows) || 24),
            },
            widgetCount
          );
          nextWidget = initialWidget?.type === 'table' ? { ...created, id: initialWidget.id } : created;
          break;
        }
        case 'metric': {
          const created = createMetricBoardWidget(
            {
              datasetKey,
              params,
              dimensionFilters: nextDimensionFilters,
              title,
              metricFields,
            },
            widgetCount
          );
          nextWidget = initialWidget?.type === 'metric' ? { ...created, id: initialWidget.id } : created;
          break;
        }
        case 'pie': {
          const created = createPieBoardWidget(
            {
              datasetKey,
              params,
              dimensionFilters: nextDimensionFilters,
              title,
              labelField: pieLabelField || undefined,
              metricField: pieMetricField || undefined,
            },
            widgetCount
          );
          nextWidget = initialWidget?.type === 'pie' ? { ...created, id: initialWidget.id } : created;
          break;
        }
        case 'stacked-bar': {
          const created = createStackedBarBoardWidget(
            {
              datasetKey,
              params,
              dimensionFilters: nextDimensionFilters,
              title,
              xField: stackedBarXField || undefined,
              stackField: stackedBarStackField || undefined,
              metricField: stackedBarMetricField || undefined,
            },
            widgetCount
          );
          nextWidget = initialWidget?.type === 'stacked-bar'
            ? { ...created, id: initialWidget.id }
            : created;
          break;
        }
      }
    }

    if (!nextWidget) return;
    onSave(nextWidget);
    onOpenChange(false);
  };

  const chartSearchSummary = chartLoading
    ? 'Searching IBKR contracts'
    : chartError
      ? chartError
      : chartResults.length > 0
        ? `${chartResults.length} candidates`
        : 'Search IBKR directly or pick from the watchlist.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid max-h-[calc(100dvh-7rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-h-[calc(100dvh-8rem)] sm:max-w-5xl"
        showCloseButton
      >
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>{isEditing ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
          <DialogDescription>
            Configure widget type first. Dataset-backed widgets use internal contracts so providers stay behind the route boundary.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[310px_minmax(0,1fr)]">
            <div className="max-h-56 overflow-y-auto overscroll-contain border-b border-border/60 lg:h-full lg:max-h-none lg:border-r lg:border-b-0">
              <div className="px-4 py-4">
                <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Widget Type
                </div>
                <div className="space-y-2">
                  {BOARD_WIDGET_DEFINITIONS.map((definition) => {
                    const Icon = widgetTypeIcon(definition.type);
                    const sourceKind = widgetSourceKind(definition.type);
                    return (
                      <button
                        key={definition.type}
                        type="button"
                        onClick={() => setWidgetType(definition.type)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                          widgetType === definition.type
                            ? 'border-primary/50 bg-primary/10 text-foreground'
                            : 'border-border/70 bg-background hover:bg-accent/40'
                        )}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-mono text-xs uppercase tracking-[0.18em]">
                              {definition.label}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]',
                                sourceKind === 'OpenBB'
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                  : 'border-border/70 bg-background/70 text-muted-foreground'
                              )}
                            >
                              {sourceKind}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {definition.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto]">
              <div className="min-h-0 overflow-y-auto overscroll-contain">
                <div className="space-y-4 px-6 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                        {selectedWidgetDefinition.label}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]',
                          widgetSourceKind(widgetType) === 'OpenBB'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-border/70 bg-background/70 text-muted-foreground'
                        )}
                      >
                        {widgetSourceKind(widgetType)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {selectedWidgetDefinition.description}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                      Title
                    </div>
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={selectedWidgetDefinition.defaultTitle}
                    />
                  </div>

                  <Separator />

                  {widgetType === 'chart' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Instrument
                          </div>
                          {selectedInstrument ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => setChartChoice(toChartChoice(selectedInstrument))}
                            >
                              Use Selected
                            </Button>
                          ) : null}
                        </div>
                        <Select
                          value={chartChoice ? String(chartChoice.conid) : undefined}
                          onValueChange={(value) => {
                            const next = watchlistItems.find((item) => item.conid === Number(value));
                            if (next) {
                              setChartChoice(toChartChoice(next));
                            }
                          }}
                        >
                          <SelectTrigger className="font-mono text-sm">
                            <SelectValue placeholder="Pick from watchlist" />
                          </SelectTrigger>
                          <SelectContent>
                            {chartWatchlistOptions.map((option) => (
                              <SelectItem key={option.code} value={option.code} className="font-mono text-sm">
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          IBKR Search
                        </div>
                        <form
                          className="flex gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void executeChartSearch();
                          }}
                        >
                          <Input
                            value={chartQuery}
                            onChange={(event) => setChartQuery(event.target.value)}
                            placeholder="Search symbol or company"
                          />
                          <Button type="submit" variant="outline">
                            Search
                          </Button>
                        </form>
                        <div className="text-xs text-muted-foreground">{chartSearchSummary}</div>
                        {chartResults.length > 0 ? (
                          <div className="rounded-lg border border-border/70">
                            {chartResults.map((result) => (
                              <button
                                key={`${result.conid}:${result.exchange}`}
                                type="button"
                                onClick={() => setChartChoice(toChartChoice(result))}
                                className={cn(
                                  'flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2 text-left last:border-b-0 hover:bg-accent/40',
                                  chartChoice?.conid === result.conid && 'bg-accent/50'
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-mono text-xs uppercase tracking-[0.18em] text-foreground">
                                    {result.contractDisplay || result.symbol}
                                  </div>
                                  <div className="truncate text-[10px] text-muted-foreground">
                                    {result.name} · {result.exchange}
                                  </div>
                                </div>
                                <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  {result.type}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          Active Instrument
                        </div>
                        <div className="mt-2 font-mono text-sm text-foreground">
                          {chartChoice ? `${chartChoice.symbol} · ${chartChoice.exchange}` : 'No instrument selected'}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {chartChoice?.name || 'Choose from watchlist or search IBKR directly.'}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {widgetType === 'watchlist-heatmap' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          Instruments
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>{heatmapConids.length} selected</span>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => setHeatmapConids(watchlistItems.map((item) => item.conid))}
                            >
                              All
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => setHeatmapConids([])}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {watchlistItems.map((item) => {
                            const active = heatmapConids.includes(item.conid);
                            return (
                              <button
                                key={item.conid}
                                type="button"
                                onClick={() => toggleHeatmapConid(item.conid)}
                                className={cn(
                                  'rounded-lg border px-3 py-2 text-left transition-colors',
                                  active
                                    ? 'border-primary/50 bg-primary/10 text-foreground'
                                    : 'border-border/70 hover:bg-accent/40'
                                )}
                              >
                                <div className="font-mono text-xs uppercase tracking-[0.18em]">
                                  {item.symbol}
                                </div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  {item.name} · {item.exchange}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          Max Items
                        </div>
                        <Select value={heatmapMaxItems} onValueChange={setHeatmapMaxItems}>
                          <SelectTrigger className="font-mono text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HEATMAP_LIMIT_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option} className="font-mono text-sm">
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}

                  {widgetType === 'screener-list' ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Instrument
                          </div>
                          <Select value={scannerInstrument} onValueChange={setScannerInstrument}>
                            <SelectTrigger className="font-mono text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(scannerParams?.instruments ?? []).map((option) => (
                                <SelectItem key={option.code} value={option.code} className="font-mono text-sm">
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Limit
                          </div>
                          <Select value={scannerLimit} onValueChange={setScannerLimit}>
                            <SelectTrigger className="font-mono text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SCREENER_LIMIT_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option} className="font-mono text-sm">
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Location
                          </div>
                          <Select value={scannerLocation || undefined} onValueChange={setScannerLocation}>
                            <SelectTrigger className="font-mono text-sm">
                              <SelectValue placeholder={scannerLoading ? 'Loading' : 'Choose location'} />
                            </SelectTrigger>
                            <SelectContent>
                              {(scannerParams?.locations ?? []).map((option) => (
                                <SelectItem key={option.code} value={option.code} className="font-mono text-sm">
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Scan
                          </div>
                          <Select value={scannerScanType || undefined} onValueChange={setScannerScanType}>
                            <SelectTrigger className="font-mono text-sm">
                              <SelectValue placeholder={scannerLoading ? 'Loading' : 'Choose scan'} />
                            </SelectTrigger>
                            <SelectContent>
                              {(scannerParams?.scanTypes ?? []).map((option) => (
                                <SelectItem key={option.code} value={option.code} className="font-mono text-sm">
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
                        {scannerLoading
                          ? 'Loading screener options from IBKR.'
                          : scannerError
                            ? scannerError
                            : 'Scanner widget runs through the same IBKR screener route as the dialog, just persisted into the board.'}
                      </div>
                    </div>
                  ) : null}

                  {isDataWidgetType(widgetType) && selectedDatasetDefinition ? (
                    <div className="flex flex-col gap-5">
                      <div className="order-1 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Dataset
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]"
                            >
                              {selectedDatasetDefinition.kind}
                            </Badge>
                            {datasetPreview ? (
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]"
                              >
                                {datasetPreview.rows.length} rows
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <Select
                          value={datasetKey}
                          onValueChange={(value) => {
                            if (!isBoardDatasetKey(value)) return;
                            setDatasetKey(value);
                            setDatasetParams(getBoardDatasetInitialParams(value));
                            setDimensionFilters({});
                            const defaults = getBoardDatasetDefinition(value).defaults;
                            setSeriesMetricFields(defaults?.series?.metricFields ?? []);
                            setTableVisibleFields(defaults?.table?.visibleFields ?? []);
                            setTableMaxRows(String(defaults?.table?.maxRows ?? 24));
                            setMetricFields(defaults?.metric?.metricFields ?? []);
                            setPieLabelField(defaults?.pie?.labelField ?? '');
                            setPieMetricField(defaults?.pie?.metricField ?? '');
                            setStackedBarXField(defaults?.stackedBar?.xField ?? '');
                            setStackedBarStackField(defaults?.stackedBar?.stackField ?? '');
                            setStackedBarMetricField(defaults?.stackedBar?.metricField ?? '');
                          }}
                        >
                          <SelectTrigger className="font-mono text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {datasetOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key} className="font-mono text-sm">
                                {option.definition.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          {selectedDatasetDefinition.description}
                        </div>
                      </div>

                      <div className="order-2 space-y-3">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          Source Query
                        </div>
                        {selectedDatasetParamFields.length ? (
                          <div className="overflow-hidden rounded-md border border-border/60">
                            <div className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,14rem)] gap-3 border-b border-border/60 bg-background/50 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              <div>Field</div>
                              <div>Input</div>
                              <div>Status</div>
                            </div>
                            <div className="divide-y divide-border/50">
                              {selectedDatasetParamFields.map((field) => {
                                const suggestions = getParamFieldSuggestions(field, rawDatasetPreview);
                                const selectOptions = getParamFieldSelectOptions(
                                  field,
                                  rawDatasetPreview,
                                  datasetParams[field.key]
                                );
                                const usesSearchableSuggestions =
                                  field.input === 'text' && suggestions.length > 0;
                                const defaultValue = formatParamDefaultValue(field);

                                return (
                                  <div
                                    key={field.key}
                                    className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,14rem)] gap-3 px-3 py-3"
                                  >
                                    <div className="min-w-0 space-y-1">
                                      <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
                                        {field.label}
                                      </div>
                                      <div className="truncate text-[10px] text-muted-foreground">
                                        {field.key}
                                      </div>
                                      {field.description ? (
                                        <div className="text-[11px] text-muted-foreground">
                                          {field.description}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="space-y-2">
                                      {(() => {
                                        if (field.input === 'select') {
                                          return (
                                            <Select
                                              value={
                                                datasetParams[field.key]?.trim()
                                                  ? datasetParams[field.key]
                                                  : DATASET_PARAM_SELECT_ALL_VALUE
                                              }
                                              onValueChange={(value) =>
                                                setDatasetParams((current) => ({
                                                  ...current,
                                                  [field.key]:
                                                    value === DATASET_PARAM_SELECT_ALL_VALUE
                                                      ? ''
                                                      : value,
                                                }))
                                              }
                                            >
                                              <SelectTrigger className="font-mono text-sm">
                                                <SelectValue
                                                  placeholder={field.placeholder || 'All values'}
                                                />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem
                                                  value={DATASET_PARAM_SELECT_ALL_VALUE}
                                                  className="font-mono text-sm text-muted-foreground"
                                                >
                                                  All values
                                                </SelectItem>
                                                {selectOptions.map((option) => (
                                                  <SelectItem
                                                    key={option.value}
                                                    value={option.value}
                                                    className="font-mono text-sm"
                                                  >
                                                    {option.label}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          );
                                        }

                                        if (field.catalogKey && field.input === 'text') {
                                          return (
                                            <CatalogParamInput
                                              field={field}
                                              value={datasetParams[field.key] ?? ''}
                                              datasetSourceKey={selectedDatasetDefinition.source.key}
                                              datasetParams={datasetParams}
                                              onChange={(value) =>
                                                setDatasetParams((current) => ({
                                                  ...current,
                                                  [field.key]: value,
                                                }))
                                              }
                                            />
                                          );
                                        }

                                        if (usesSearchableSuggestions) {
                                          return (
                                            <SearchableParamInput
                                              field={field}
                                              value={datasetParams[field.key] ?? ''}
                                              suggestions={suggestions}
                                              onChange={(value) =>
                                                setDatasetParams((current) => ({
                                                  ...current,
                                                  [field.key]: value,
                                                }))
                                              }
                                            />
                                          );
                                        }

                                        return (
                                          <Input
                                            type={
                                              field.input === 'date'
                                                ? 'date'
                                                : field.input === 'number'
                                                  ? 'number'
                                                  : 'text'
                                            }
                                            value={datasetParams[field.key] ?? ''}
                                            onChange={(event) =>
                                              setDatasetParams((current) => ({
                                                ...current,
                                                [field.key]: event.target.value,
                                              }))
                                            }
                                            inputMode={
                                              field.input === 'number' ? 'numeric' : 'text'
                                            }
                                            placeholder={field.placeholder}
                                          />
                                        );
                                      })()}

                                      {field.presets?.length ? (
                                        <div className="flex flex-wrap gap-2">
                                          {field.presets.map((preset) => (
                                            <Button
                                              key={`${field.key}:${preset.label}`}
                                              type="button"
                                              variant="outline"
                                              size="xs"
                                              onClick={() =>
                                                setDatasetParams((current) => ({
                                                  ...current,
                                                  [field.key]: resolveParamPresetValue(
                                                    preset.value,
                                                    preset.mode
                                                  ),
                                                }))
                                              }
                                            >
                                              {preset.label}
                                            </Button>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex flex-wrap gap-1.5">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.14em]',
                                            field.origin === 'app'
                                              ? 'border-border/70 bg-background/70 text-muted-foreground'
                                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                          )}
                                        >
                                          {fieldOriginLabel(field)}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.14em]"
                                        >
                                          {field.required ? 'Required' : 'Optional'}
                                        </Badge>
                                      </div>
                                      {defaultValue ? (
                                        <div className="text-[11px] text-muted-foreground">
                                          Default: <span className="font-mono">{defaultValue}</span>
                                        </div>
                                      ) : null}
                                      <div className="text-[11px] text-muted-foreground">
                                        {field.origin === 'app'
                                          ? 'Applied by the Pulse shaper after the OpenBB response is loaded.'
                                          : 'Passed through to the underlying OpenBB command.'}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md border border-border/60 px-3 py-3 text-xs text-muted-foreground">
                            This dataset has no explicit source-query controls. Use dataset slice
                            and widget mapping below.
                          </div>
                        )}
                      </div>

                      {rawPreviewDimensionFieldKeys.length ? (
                        <div className="order-3 space-y-3">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Dataset Slice
                          </div>
                          <div className="overflow-hidden rounded-md border border-border/60">
                            <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,12rem)] gap-3 border-b border-border/60 bg-background/50 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              <div>Field</div>
                              <div>Selection</div>
                              <div>Example</div>
                            </div>
                            <div className="divide-y divide-border/50">
                              {rawPreviewDimensionFieldKeys.map((fieldKey) => {
                                const field = rawDatasetPreview?.fields.find(
                                  (candidate) => candidate.key === fieldKey
                                );
                                if (!field) return null;

                                const options = getDimensionFilterOptions(
                                  rawDatasetPreview,
                                  dimensionFilters,
                                  field.key
                                );
                                const sampleValue =
                                  formatFieldSampleHeadline(field) ??
                                  getFieldSampleChips(field).join(' · ') ??
                                  '—';

                                return (
                                  <div
                                    key={field.key}
                                    className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,12rem)] gap-3 px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
                                        {field.label}
                                      </div>
                                      <div className="truncate text-[10px] text-muted-foreground">
                                        {field.key}
                                      </div>
                                    </div>
                                    <div>
                                      <Select
                                        value={
                                          dimensionFilters[field.key]?.trim()
                                            ? dimensionFilters[field.key]
                                            : DATASET_PARAM_SELECT_ALL_VALUE
                                        }
                                        onValueChange={(value) =>
                                          setDimensionFilters((current) => {
                                            const next = { ...current };
                                            if (value === DATASET_PARAM_SELECT_ALL_VALUE) {
                                              delete next[field.key];
                                            } else {
                                              next[field.key] = value;
                                            }
                                            return next;
                                          })
                                        }
                                      >
                                        <SelectTrigger className="h-8 font-mono text-sm">
                                          <SelectValue placeholder="All values" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem
                                            value={DATASET_PARAM_SELECT_ALL_VALUE}
                                            className="font-mono text-sm text-muted-foreground"
                                          >
                                            All values
                                          </SelectItem>
                                          {options.map((option) => (
                                            <SelectItem
                                              key={`${field.key}:${option}`}
                                              value={option}
                                              className="font-mono text-sm"
                                            >
                                              {option}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="self-center text-[11px] text-muted-foreground">
                                      {sampleValue || '—'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="order-5 space-y-3">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                          Schema Preview
                        </div>
                        <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3">
                          {datasetPreviewLoading && !datasetPreview ? (
                            <div className="text-xs text-muted-foreground">
                              Inspecting the shaped dataset contract through the OpenBB route.
                            </div>
                          ) : datasetPreviewError ? (
                            <div className="text-xs text-destructive">{datasetPreviewError}</div>
                          ) : datasetPreview ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className="px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]"
                                >
                                  {datasetPreview.source.providers.join(', ')}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]"
                                >
                                  {datasetPreview.source.route}
                                </Badge>
                                {datasetPreview.source.asOf ? (
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(datasetPreview.source.asOf).toLocaleString()}
                                  </span>
                                ) : null}
                              </div>

                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-md border border-border/60 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Date Field
                                  </div>
                                  <div className="mt-1 font-mono text-xs text-foreground">
                                    {previewDateField || 'None'}
                                  </div>
                                </div>
                                <div className="rounded-md border border-border/60 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Other Dimensions
                                  </div>
                                  <div className="mt-1 font-mono text-xs text-foreground">
                                    {previewDimensionFieldKeys.length}
                                  </div>
                                  <div className="mt-1 text-[10px] text-muted-foreground">
                                    {previewDateField ? 'Date is tracked separately' : 'No date axis'}
                                  </div>
                                </div>
                                <div className="rounded-md border border-border/60 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    Metrics
                                  </div>
                                  <div className="mt-1 font-mono text-xs text-foreground">
                                    {previewMetricFieldKeys.length}
                                  </div>
                                </div>
                              </div>

                              {previewFields.length ? (
                                <div className="overflow-hidden rounded-md border border-border/60">
                                  <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,7rem)_minmax(0,1fr)] gap-3 border-b border-border/60 bg-background/50 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    <div>Field</div>
                                    <div>Type</div>
                                    <div>Example</div>
                                  </div>
                                  <div className="divide-y divide-border/50">
                                    {previewFields.map((field) => {
                                      const sampleHeadline = formatFieldSampleHeadline(field);
                                      const sampleChips = getFieldSampleChips(field);
                                      const example =
                                        sampleHeadline ||
                                        sampleChips.join(' · ') ||
                                        '—';

                                      return (
                                        <div
                                          key={field.key}
                                          className="grid grid-cols-[minmax(0,11rem)_minmax(0,7rem)_minmax(0,1fr)] gap-3 px-3 py-2"
                                        >
                                          <div className="min-w-0">
                                            <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
                                              {field.label}
                                            </div>
                                            <div className="truncate text-[10px] text-muted-foreground">
                                              {field.key}
                                            </div>
                                          </div>
                                          <div className="text-[11px] text-muted-foreground">
                                            <div>{field.role}</div>
                                            <div>{field.format || 'string'}</div>
                                            {typeof field.uniqueValueCount === 'number' ? (
                                              <div>{field.uniqueValueCount} values</div>
                                            ) : null}
                                          </div>
                                          <div className="self-center text-[11px] text-muted-foreground">
                                            {example}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {previewSampleRow ? (
                                <div className="space-y-2">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    {previewDateField ? 'Latest Row Sample' : 'Sample Row'}
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {previewFields.slice(0, 6).map((field) => (
                                      <div
                                        key={field.key}
                                        className="rounded-md border border-border/60 px-3 py-2"
                                      >
                                        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                          {field.label}
                                        </div>
                                        <div className="mt-1 font-mono text-xs text-foreground">
                                          {previewSampleRow[field.key] === null ||
                                          previewSampleRow[field.key] === undefined ||
                                          previewSampleRow[field.key] === ''
                                            ? '—'
                                            : formatDatasetValue(
                                                previewSampleRow[field.key],
                                                field
                                              )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              Waiting for dataset preview.
                            </div>
                          )}
                        </div>
                      </div>

                      {datasetPreview ? (
                        <div className="order-4 space-y-3">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                            Widget Mapping
                          </div>

                          {widgetType === 'series' ? (
                            <div className="space-y-2">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                Series Metrics
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {previewFields
                                  .filter((field) => previewMetricFieldKeys.includes(field.key))
                                  .map((field) => {
                                    const active = seriesMetricFields.includes(field.key);
                                    return (
                                      <button
                                        key={field.key}
                                        type="button"
                                        onClick={() =>
                                          setSeriesMetricFields((current) =>
                                            toggleField(current, field.key)
                                          )
                                        }
                                        className={cn(
                                          'rounded-lg border px-3 py-2 text-left transition-colors',
                                          active
                                            ? 'border-primary/50 bg-primary/10 text-foreground'
                                            : 'border-border/70 hover:bg-accent/40'
                                        )}
                                      >
                                        <div className="font-mono text-xs uppercase tracking-[0.16em]">
                                          {field.label}
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                          {field.key}
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : null}

                          {widgetType === 'table' ? (
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  Visible Columns
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {previewFields.map((field) => {
                                    const active = tableVisibleFields.includes(field.key);
                                    return (
                                      <button
                                        key={field.key}
                                        type="button"
                                        onClick={() =>
                                          setTableVisibleFields((current) =>
                                            toggleField(current, field.key)
                                          )
                                        }
                                        className={cn(
                                          'rounded-lg border px-3 py-2 text-left transition-colors',
                                          active
                                            ? 'border-primary/50 bg-primary/10 text-foreground'
                                            : 'border-border/70 hover:bg-accent/40'
                                        )}
                                      >
                                        <div className="font-mono text-xs uppercase tracking-[0.16em]">
                                          {field.label}
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                          {field.key}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  Max Rows
                                </div>
                                <Input
                                  type="number"
                                  value={tableMaxRows}
                                  onChange={(event) => setTableMaxRows(event.target.value)}
                                  inputMode="numeric"
                                />
                              </div>
                            </div>
                          ) : null}

                          {widgetType === 'metric' ? (
                            <div className="space-y-2">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                Metric Fields
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {previewFields
                                  .filter((field) => previewMetricFieldKeys.includes(field.key))
                                  .map((field) => {
                                    const active = metricFields.includes(field.key);
                                    return (
                                      <button
                                        key={field.key}
                                        type="button"
                                        onClick={() =>
                                          setMetricFields((current) =>
                                            toggleField(current, field.key)
                                          )
                                        }
                                        className={cn(
                                          'rounded-lg border px-3 py-2 text-left transition-colors',
                                          active
                                            ? 'border-primary/50 bg-primary/10 text-foreground'
                                            : 'border-border/70 hover:bg-accent/40'
                                        )}
                                      >
                                        <div className="font-mono text-xs uppercase tracking-[0.16em]">
                                          {field.label}
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                          {field.key}
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : null}

                          {widgetType === 'pie' ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  Label Field
                                </div>
                                <Select value={pieLabelField || undefined} onValueChange={setPieLabelField}>
                                  <SelectTrigger className="font-mono text-sm">
                                    <SelectValue placeholder="Choose label field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {previewFields
                                      .filter((field) => previewDimensionFieldKeys.includes(field.key))
                                      .map((field) => (
                                        <SelectItem
                                          key={field.key}
                                          value={field.key}
                                          className="font-mono text-sm"
                                        >
                                          {field.label}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  Metric Field
                                </div>
                                <Select
                                  value={pieMetricField || undefined}
                                  onValueChange={setPieMetricField}
                                >
                                  <SelectTrigger className="font-mono text-sm">
                                    <SelectValue placeholder="Choose metric field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {previewFields
                                      .filter((field) => previewMetricFieldKeys.includes(field.key))
                                      .map((field) => (
                                        <SelectItem
                                          key={field.key}
                                          value={field.key}
                                          className="font-mono text-sm"
                                        >
                                          {field.label}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ) : null}

                          {widgetType === 'stacked-bar' ? (
                            <div className="grid gap-4 sm:grid-cols-3">
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  X Field
                                </div>
                                <Select
                                  value={stackedBarXField || undefined}
                                  onValueChange={setStackedBarXField}
                                >
                                  <SelectTrigger className="font-mono text-sm">
                                    <SelectValue placeholder="Choose x field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {previewFields
                                      .filter((field) => previewCategoryFieldKeys.includes(field.key))
                                      .map((field) => (
                                        <SelectItem
                                          key={field.key}
                                          value={field.key}
                                          className="font-mono text-sm"
                                        >
                                          {field.label}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  Stack Field
                                </div>
                                <Select
                                  value={stackedBarStackField || undefined}
                                  onValueChange={setStackedBarStackField}
                                >
                                  <SelectTrigger className="font-mono text-sm">
                                    <SelectValue placeholder="Choose stack field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {previewFields
                                      .filter((field) => previewStackFieldKeys.includes(field.key))
                                      .map((field) => (
                                        <SelectItem
                                          key={field.key}
                                          value={field.key}
                                          className="font-mono text-sm"
                                        >
                                          {field.label}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  Metric Field
                                </div>
                                <Select
                                  value={stackedBarMetricField || undefined}
                                  onValueChange={setStackedBarMetricField}
                                >
                                  <SelectTrigger className="font-mono text-sm">
                                    <SelectValue placeholder="Choose metric field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {previewFields
                                      .filter((field) => previewMetricFieldKeys.includes(field.key))
                                      .map((field) => (
                                        <SelectItem
                                          key={field.key}
                                          value={field.key}
                                          className="font-mono text-sm"
                                        >
                                          {field.label}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="order-6 rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
                        This widget stores the app-level dataset key, shaped query params, and widget mapping fields. OpenBB stays behind the internal route contract, but the output mapping now keys off the returned dataset schema.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <DialogFooter className="border-t border-border/60 px-6 py-3">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveWidget}
                  disabled={
                    (widgetType === 'chart' && !chartChoice) ||
                    (widgetType === 'watchlist-heatmap' && heatmapConids.length === 0) ||
                    (widgetType === 'screener-list' &&
                      (!!scannerLoading || !scannerLocation || !scannerScanType)) ||
                    (isDataWidgetType(widgetType) &&
                      (!datasetPreview ||
                        !!datasetPreviewError ||
                        (widgetType === 'series' && seriesMetricFields.length === 0) ||
                        (widgetType === 'table' && tableVisibleFields.length === 0) ||
                        (widgetType === 'metric' && metricFields.length === 0) ||
                        (widgetType === 'pie' && (!pieLabelField || !pieMetricField)) ||
                        (widgetType === 'stacked-bar' &&
                          (!stackedBarXField ||
                            !stackedBarStackField ||
                            !stackedBarMetricField))))
                  }
                >
                  {isEditing ? 'Save Widget' : 'Add Widget'}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
