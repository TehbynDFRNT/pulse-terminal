'use client';

import type { BoardWidget } from '@/lib/dashboard/widgets';
import { ChartBoardWidget } from '@/components/dashboard/ChartBoardWidget';
import { HeatmapBoardWidget } from '@/components/dashboard/HeatmapBoardWidget';
import { MetricDataBoardWidget } from '@/components/dashboard/MetricDataBoardWidget';
import { PieDataBoardWidget } from '@/components/dashboard/PieDataBoardWidget';
import { SeriesDataBoardWidget } from '@/components/dashboard/SeriesDataBoardWidget';
import { ScreenerListBoardWidget } from '@/components/dashboard/ScreenerListBoardWidget';
import { StackedBarDataBoardWidget } from '@/components/dashboard/StackedBarDataBoardWidget';
import { TableDataBoardWidget } from '@/components/dashboard/TableDataBoardWidget';

interface BoardWidgetRendererProps {
  widget: BoardWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export function BoardWidgetRenderer({
  widget,
  onRemove,
  onEdit,
}: BoardWidgetRendererProps) {
  switch (widget.type) {
    case 'chart':
      return <ChartBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    case 'watchlist-heatmap':
      return <HeatmapBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    case 'screener-list':
      return <ScreenerListBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    case 'series':
      return <SeriesDataBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    case 'table':
      return <TableDataBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    case 'metric':
      return <MetricDataBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    case 'pie':
      return <PieDataBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    case 'stacked-bar':
      return <StackedBarDataBoardWidget widget={widget} onRemove={onRemove} onEdit={onEdit} />;
    default:
      return null;
  }
}
