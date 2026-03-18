'use client';

import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import type { PieDataBoardWidget as PieWidget } from '@/lib/dashboard/data-widgets';
import { datasetToPieSlices, formatDatasetValue } from '@/lib/dashboard/dataset-adapters';
import { filterDatasetByDimensions } from '@/lib/dashboard/dataset-types';
import { useWidgetDataset } from '@/lib/dashboard/use-widget-dataset';
import { getBoardDatasetDefinition } from '@/lib/dashboard/widget-datasets';

interface PieDataBoardWidgetProps {
  widget: PieWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

const PIE_COLORS = ['#00e676', '#448aff', '#ff9100', '#e040fb', '#ff1744', '#00e5ff', '#ffea00'];

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle - 90) * (Math.PI / 180);
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return [
    'M',
    start.x,
    start.y,
    'A',
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(' ');
}

export function PieDataBoardWidget({
  widget,
  onRemove,
  onEdit,
}: PieDataBoardWidgetProps) {
  const definition = getBoardDatasetDefinition(widget.datasetKey);
  const { data, loading, error } = useWidgetDataset({
    key: widget.datasetKey,
    params: widget.params,
    refreshIntervalMs: widget.refreshIntervalMs ?? definition.defaultRefreshIntervalMs,
  });
  const filteredData = data
    ? filterDatasetByDimensions(data, widget.dimensionFilters)
    : null;

  const slices = filteredData
    ? datasetToPieSlices(filteredData, {
        labelField: widget.labelField,
        metricField: widget.metricField,
      })
    : [];
  const metricFieldKey =
    widget.metricField || filteredData?.view.defaultMetric || filteredData?.metricFields[0] || '';
  const metricField = filteredData?.fields.find((field) => field.key === metricFieldKey);

  const subtitle =
    widget.subtitle ||
    (filteredData
      ? [
          filteredData.source.providers.join(', '),
          definition.label,
          `${slices.length} slices`,
          filteredData.source.asOf
            ? new Date(filteredData.source.asOf).toLocaleString()
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : definition.description);

  let runningAngle = 0;

  return (
    <BoardWidgetCard
      title={widget.title}
      subtitle={subtitle}
      onEdit={() => onEdit(widget.id)}
      onRemove={() => onRemove(widget.id)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 p-3">
          {loading && slices.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Loading pie slices…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
              {error}
            </div>
          ) : slices.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No sliceable rows available for this dataset.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center">
                <svg viewBox="0 0 160 160" className="h-44 w-44">
                  <circle cx="80" cy="80" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
                  {slices.map((slice, index) => {
                    const startAngle = runningAngle;
                    const sweep = slice.share * 360;
                    runningAngle += sweep;
                    return (
                      <path
                        key={slice.key}
                        d={describeArc(80, 80, 46, startAngle, startAngle + sweep)}
                        fill="none"
                        stroke={PIE_COLORS[index % PIE_COLORS.length]}
                        strokeWidth="18"
                        strokeLinecap="butt"
                      />
                    );
                  })}
                  <text
                    x="80"
                    y="76"
                    textAnchor="middle"
                    className="fill-foreground font-mono text-[11px]"
                  >
                    {widget.title}
                  </text>
                  <text
                    x="80"
                    y="92"
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px]"
                  >
                    {slices.length} slices
                  </text>
                </svg>
              </div>

              <div className="space-y-2 overflow-auto">
                {slices.map((slice, index) => (
                  <div key={slice.key} className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-foreground">{slice.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {(slice.share * 100).toFixed(1)}% · {formatDatasetValue(slice.value, metricField)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </BoardWidgetCard>
  );
}
