'use client';

import { DataChart } from '@/components/charts/DataChart';
import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import type { SeriesDataBoardWidget as SeriesWidget } from '@/lib/dashboard/data-widgets';
import {
  datasetToLivelineSeriesWithOptions,
  formatDatasetValue,
} from '@/lib/dashboard/dataset-adapters';
import {
  filterDatasetByDimensions,
  getDatasetMetricField,
} from '@/lib/dashboard/dataset-types';
import { useWidgetDataset } from '@/lib/dashboard/use-widget-dataset';
import { getBoardDatasetDefinition } from '@/lib/dashboard/widget-datasets';

interface SeriesDataBoardWidgetProps {
  widget: SeriesWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export function SeriesDataBoardWidget({
  widget,
  onRemove,
  onEdit,
}: SeriesDataBoardWidgetProps) {
  const definition = getBoardDatasetDefinition(widget.datasetKey);
  const { data, loading, error } = useWidgetDataset({
    key: widget.datasetKey,
    params: widget.params,
    refreshIntervalMs: widget.refreshIntervalMs ?? definition.defaultRefreshIntervalMs,
  });
  const filteredData = data
    ? filterDatasetByDimensions(data, widget.dimensionFilters)
    : null;

  const series = filteredData
    ? datasetToLivelineSeriesWithOptions(filteredData, {
        metricFields: widget.metricFields,
      })
    : [];
  const primaryMetricField = filteredData
    ? getDatasetMetricField(filteredData, widget.metricFields?.[0])
    : undefined;
  const subtitle =
    widget.subtitle ||
    (filteredData
      ? [
          filteredData.source.providers.join(', '),
          definition.label,
          `${series.length} series`,
          filteredData.source.asOf ? new Date(filteredData.source.asOf).toLocaleString() : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : definition.description);
  const formatValue = primaryMetricField
    ? (value: number) => formatDatasetValue(value, primaryMetricField)
    : undefined;

  return (
    <BoardWidgetCard
      title={widget.title}
      subtitle={subtitle}
      onEdit={() => onEdit(widget.id)}
      onRemove={() => onRemove(widget.id)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          {series.length === 0 && !loading && !error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No series rows available for this dataset.
            </div>
          ) : (
            <DataChart
              series={series}
              loading={loading}
              error={error || null}
              showGrid={false}
              referenceLine={
                typeof widget.baseline === 'number'
                  ? { value: widget.baseline }
                  : undefined
              }
              formatValue={formatValue}
            />
          )}
        </div>
      </div>
    </BoardWidgetCard>
  );
}
