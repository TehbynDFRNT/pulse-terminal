'use client';

import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import type { StackedBarDataBoardWidget as StackedBarWidget } from '@/lib/dashboard/data-widgets';
import {
  datasetToStackedBars,
  formatDatasetValue,
} from '@/lib/dashboard/dataset-adapters';
import { filterDatasetByDimensions } from '@/lib/dashboard/dataset-types';
import { useWidgetDataset } from '@/lib/dashboard/use-widget-dataset';
import { getBoardDatasetDefinition } from '@/lib/dashboard/widget-datasets';

interface StackedBarDataBoardWidgetProps {
  widget: StackedBarWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

const BAR_COLORS = ['#00e676', '#448aff', '#ff9100', '#e040fb', '#ff1744', '#00e5ff', '#ffea00'];

export function StackedBarDataBoardWidget({
  widget,
  onRemove,
  onEdit,
}: StackedBarDataBoardWidgetProps) {
  const definition = getBoardDatasetDefinition(widget.datasetKey);
  const { data, loading, error } = useWidgetDataset({
    key: widget.datasetKey,
    params: widget.params,
    refreshIntervalMs: widget.refreshIntervalMs ?? definition.defaultRefreshIntervalMs,
  });
  const filteredData = data
    ? filterDatasetByDimensions(data, widget.dimensionFilters)
    : null;

  const bars = filteredData
    ? datasetToStackedBars(filteredData, {
        xField: widget.xField,
        stackField: widget.stackField,
        metricField: widget.metricField,
      })
    : [];
  const metricFieldKey =
    widget.metricField ||
    filteredData?.view.defaultMetric ||
    filteredData?.metricFields[0] ||
    '';
  const metricField = filteredData?.fields.find((field) => field.key === metricFieldKey);

  const subtitle =
    widget.subtitle ||
    (filteredData
      ? [
          filteredData.source.providers.join(', '),
          definition.label,
          `${bars.length} bars`,
          filteredData.source.asOf
            ? new Date(filteredData.source.asOf).toLocaleString()
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : definition.description);

  const maxTotal = bars.reduce((max, bar) => Math.max(max, bar.total), 0);

  return (
    <BoardWidgetCard
      title={widget.title}
      subtitle={subtitle}
      onEdit={() => onEdit(widget.id)}
      onRemove={() => onRemove(widget.id)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {loading && bars.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Loading stacked bars…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
              {error}
            </div>
          ) : bars.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No stackable rows available for this dataset.
            </div>
          ) : (
            <div className="space-y-3">
              {bars.map((bar) => (
                <div key={bar.key}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-foreground">{bar.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatDatasetValue(bar.total, metricField)}
                    </span>
                  </div>
                  <div className="flex h-4 overflow-hidden rounded-full bg-muted/40">
                    {bar.segments.map((segment, index) => (
                      <div
                        key={segment.key}
                        className="h-full"
                        style={{
                          width: `${maxTotal > 0 ? (segment.value / maxTotal) * 100 : 0}%`,
                          backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                        }}
                        title={`${segment.label}: ${formatDatasetValue(segment.value, metricField)}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {bar.segments.map((segment, index) => (
                      <div key={segment.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: BAR_COLORS[index % BAR_COLORS.length] }}
                        />
                        <span>{segment.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BoardWidgetCard>
  );
}
