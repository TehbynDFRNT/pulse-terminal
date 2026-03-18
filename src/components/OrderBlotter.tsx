'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { OrderStatusInspector } from '@/components/OrderStatusInspector';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOrdersStore } from '@/lib/store/orders';
import { useGatewayStore } from '@/lib/store/gateway';
import { getLiveOrders } from '@/lib/ibkr/gateway-client';
import type { Order } from '@/lib/ibkr/types';

const STATUS_COLORS: Record<string, string> = {
  Submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PreSubmitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PendingSubmit: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Filled: 'bg-[var(--color-pulse-green)]/20 text-[var(--color-pulse-green)] border-[var(--color-pulse-green)]/30',
  Executed: 'bg-[var(--color-pulse-green)]/20 text-[var(--color-pulse-green)] border-[var(--color-pulse-green)]/30',
  Cancelled: 'bg-muted text-muted-foreground border-border',
  Inactive: 'bg-muted text-muted-foreground border-border',
};

export function OrderBlotter() {
  const orders = useOrdersStore((s) => s.orders);
  const setOrders = useOrdersStore((s) => s.setOrders);
  const gatewayUp = useGatewayStore((s) => s.connected);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const refreshActivity = async () => {
    const liveOrders = await getLiveOrders();
    setOrders(liveOrders);
  };

  // Fetch live orders on mount (only if gateway is up)
  useEffect(() => {
    if (!gatewayUp) return;
    refreshActivity().catch(() => {});
  }, [setOrders, gatewayUp]);

  // Poll live orders from the app routes
  const inflight = useRef(false);
  useEffect(() => {
    if (!gatewayUp) return;
    const interval = setInterval(async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        await refreshActivity();
      } catch { /* retry next interval */ }
      finally { inflight.current = false; }
    }, 5000);
    return () => clearInterval(interval);
  }, [setOrders, gatewayUp]);

  const handleCancel = async (orderId: number) => {
    try {
      // Cancel still goes through Next.js (order operations are write-heavy, keep server-side)
      await fetch(`/api/ibkr/orders?orderId=${orderId}`, { method: 'DELETE' });
      await refreshActivity();
    } catch { /* ignore */ }
  };

  const canCancel = (status: string) =>
    ['Submitted', 'PreSubmitted', 'PendingSubmit'].includes(status);

  const formatOrderMeta = (order: Order) => {
    const parts = [order.orderType, order.tif].filter(Boolean);
    return parts.join(' · ');
  };

  const formatOrderDetail = (order: Order) => {
    if (order.filled > 0) {
      const avg =
        order.avgPrice && order.avgPrice !== '0.00'
          ? ` · avg ${order.avgPrice}`
          : '';
      return `Filled ${order.filled}/${order.quantity}${avg}`;
    }
    if (order.description) return order.description;
    return `${order.remaining}/${order.quantity} remaining`;
  };

  const activeOrders = orders
    .map((order) => ({
      key: `order:${order.orderId}`,
      side: order.side,
      symbol: order.symbol,
      quantity: order.quantity,
      priceText: order.price !== 'MKT' ? `${order.orderType} ${order.price}` : order.orderType,
      status: order.status,
      metaLine: formatOrderMeta(order),
      detailLine: formatOrderDetail(order),
      canCancel: canCancel(order.status),
      orderId: order.orderId,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Orders
            </h2>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{orders.filter((o) => canCancel(o.status)).length} active</span>
              <span>{orders.length} total</span>
            </div>
          </div>
          <OrderStatusInspector
            orderId={selectedOrderId}
            onClose={() => setSelectedOrderId(null)}
            onUpdated={refreshActivity}
          />
          {activeOrders.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-muted-foreground">
              No live orders
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {activeOrders.map((activity) => (
                <div
                  key={activity.key}
                  className="group flex items-center justify-between gap-2 px-3 py-2"
                  role="button"
                  onClick={() => setSelectedOrderId(activity.orderId)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold ${
                          activity.side === 'BUY'
                            ? 'text-[var(--color-pulse-green)]'
                            : 'text-[var(--color-pulse-red)]'
                        }`}
                      >
                        {activity.side}
                      </span>
                      <span className="font-mono text-sm font-medium">
                        {activity.quantity} {activity.symbol}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @ {activity.priceText}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {activity.metaLine}
                    </div>
                    {activity.detailLine ? (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {activity.detailLine}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`h-5 px-1.5 py-0 text-[10px] ${
                        STATUS_COLORS[activity.status] || ''
                      }`}
                    >
                      {activity.status}
                    </Badge>

                    {activity.canCancel && activity.orderId != null && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleCancel(activity.orderId);
                        }}
                        className="p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                        title="Cancel order"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
