'use client';

import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import type { TableDataBoardWidget as TableWidget } from '@/lib/dashboard/data-widgets';
import {
  datasetToTableModel,
  formatDatasetTableCell,
} from '@/lib/dashboard/dataset-adapters';
import { filterDatasetByDimensions } from '@/lib/dashboard/dataset-types';
import { useWidgetDataset } from '@/lib/dashboard/use-widget-dataset';
import { getBoardDatasetDefinition } from '@/lib/dashboard/widget-datasets';

interface TableDataBoardWidgetProps {
  widget: TableWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export function TableDataBoardWidget({
  widget,
  onRemove,
  onEdit,
}: TableDataBoardWidgetProps) {
  const definition = getBoardDatasetDefinition(widget.datasetKey);
  const { data, loading, error } = useWidgetDataset({
    key: widget.datasetKey,
    params: widget.params,
    refreshIntervalMs: widget.refreshIntervalMs ?? definition.defaultRefreshIntervalMs,
  });
  const filteredData = data
    ? filterDatasetByDimensions(data, widget.dimensionFilters)
    : null;

  const model = filteredData
    ? datasetToTableModel(filteredData, {
        visibleFields: widget.visibleFields,
        maxRows: widget.maxRows,
      })
    : { columns: [], rows: [] };

  const subtitle =
    widget.subtitle ||
    (filteredData
      ? [
          filteredData.source.providers.join(', '),
          definition.label,
          `${filteredData.rows.length} rows`,
          filteredData.source.asOf
            ? new Date(filteredData.source.asOf).toLocaleString()
            : null,
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
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && model.rows.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Loading dataset rows…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
              {error}
            </div>
          ) : model.rows.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No rows available for this dataset.
            </div>
          ) : (
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead className="sticky top-0 bg-card/95 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  {model.columns.map((column) => (
                    <th
                      key={column.key}
                      className={`px-3 py-2 font-medium ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-border/50">
                    {model.columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-2 ${column.align === 'right' ? 'text-right' : 'text-left'} text-foreground`}
                      >
                        {filteredData
                          ? formatDatasetTableCell(
                              filteredData,
                              column.key,
                              row[column.key] ?? null
                            )
                          : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </BoardWidgetCard>
  );
}
