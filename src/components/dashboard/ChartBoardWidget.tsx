'use client';

import { PriceChart } from '@/components/charts/PriceChart';
import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import type { ChartBoardWidget } from '@/lib/dashboard/widgets';
import { useWatchlistStore } from '@/lib/store/watchlist';

interface ChartBoardWidgetProps {
  widget: ChartBoardWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export function ChartBoardWidget({
  widget,
  onRemove,
  onEdit,
}: ChartBoardWidgetProps) {
  const snapshot = useWatchlistStore((state) => state.prices[widget.conid]);

  return (
    <BoardWidgetCard
      title={widget.title}
      subtitle={`${widget.name} · ${widget.exchange}`}
      onEdit={() => onEdit(widget.id)}
      onRemove={() => onRemove(widget.id)}
    >
      <div className="min-h-0 flex-1">
        <PriceChart
          conid={widget.conid}
          symbol={widget.symbol}
          exchange={widget.exchange}
          color={widget.color}
          className="h-full"
          stateScope={`board-chart:${widget.id}`}
          snapshotLast={snapshot?.displayPrice}
          snapshotUpdatedAt={snapshot?.updated}
          snapshotMarketDataStatus={snapshot?.marketDataStatus}
          lineOnly
          showValueLabel={false}
          showBadge={false}
          showGrid={false}
          padding={{
            top: 10,
            right: 8,
            bottom: 24,
            left: 10,
          }}
        />
      </div>
    </BoardWidgetCard>
  );
}
