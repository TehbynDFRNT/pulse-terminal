'use client';

import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import type { MetricDataBoardWidget as MetricWidget } from '@/lib/dashboard/data-widgets';
import { datasetToMetricCards } from '@/lib/dashboard/dataset-adapters';
import { filterDatasetByDimensions } from '@/lib/dashboard/dataset-types';
import { useWidgetDataset } from '@/lib/dashboard/use-widget-dataset';
import { getBoardDatasetDefinition } from '@/lib/dashboard/widget-datasets';

interface MetricDataBoardWidgetProps {
  widget: MetricWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export function MetricDataBoardWidget({
  widget,
  onRemove,
  onEdit,
}: MetricDataBoardWidgetProps) {
  const definition = getBoardDatasetDefinition(widget.datasetKey);
  const { data, loading, error } = useWidgetDataset({
    key: widget.datasetKey,
    params: widget.params,
    refreshIntervalMs: widget.refreshIntervalMs ?? definition.defaultRefreshIntervalMs,
  });
  const filteredData = data
    ? filterDatasetByDimensions(data, widget.dimensionFilters)
    : null;

  const cards = filteredData
    ? datasetToMetricCards(filteredData, {
        metricFields: widget.metricFields,
      })
    : [];

  const subtitle =
    widget.subtitle ||
    (filteredData
      ? [
          filteredData.source.providers.join(', '),
          definition.label,
          `${cards.length} metrics`,
          filteredData.source.asOf ? new Date(filteredData.source.asOf).toLocaleString() : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : definition.description);

  return (
    <BoardWidgetCard
      title={widget.title}
      subtitle={subtitle}
      onEdit={() => onEdit(widget.id)}
      onRemove={() => onRemove(widget.id)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {loading && cards.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Loading metric grid…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
              {error}
            </div>
          ) : cards.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No metrics available for this dataset.
            </div>
          ) : cards.length === 1 ? (
            <div className="flex h-full items-center px-1.5 py-1 [container-type:inline-size]">
              <div className="min-w-0">
                <div className="truncate text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
                  {cards[0]?.label}
                </div>
                <div className="mt-1 truncate font-mono text-[clamp(1.875rem,18cqw,5rem)] leading-[0.88] tracking-[-0.06em] text-foreground tabular-nums">
                  {cards[0]?.value}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="grid gap-x-2 gap-y-1.5"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(4.25rem, 1fr))' }}
            >
              {cards.map((card) => (
                <div key={card.key} className="min-w-0 px-0.5 py-0.5 [container-type:inline-size]">
                  <div className="truncate text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
                    {card.label}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[clamp(0.95rem,12cqw,1.2rem)] leading-none tracking-[-0.04em] text-foreground tabular-nums">
                    {card.value}
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
