'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOrdersStore } from '@/lib/store/orders';

const STATUS_COLORS: Record<string, string> = {
  Submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PreSubmitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PendingSubmit: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Filled: 'bg-[var(--color-pulse-green)]/20 text-[var(--color-pulse-green)] border-[var(--color-pulse-green)]/30',
  Cancelled: 'bg-muted text-muted-foreground border-border',
  Inactive: 'bg-muted text-muted-foreground border-border',
};

export function OrderBlotter() {
  const orders = useOrdersStore((s) => s.orders);
  const setOrders = useOrdersStore((s) => s.setOrders);

  // Fetch orders on mount
  useEffect(() => {
    fetch('/api/ibkr/orders')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setOrders(data);
      })
      .catch(() => {});
  }, [setOrders]);

  // Poll for order updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/ibkr/orders');
        const data = await res.json();
        if (Array.isArray(data)) setOrders(data);
      } catch { /* retry next interval */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [setOrders]);

  const handleCancel = async (orderId: number) => {
    try {
      await fetch(`/api/ibkr/orders?orderId=${orderId}`, {
        method: 'DELETE',
      });
      // Refresh orders
      const res = await fetch('/api/ibkr/orders');
      const data = await res.json();
      if (Array.isArray(data)) setOrders(data);
    } catch { /* ignore */ }
  };

  const canCancel = (status: string) =>
    ['Submitted', 'PreSubmitted', 'PendingSubmit'].includes(status);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Orders
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {orders.filter((o) => canCancel(o.status)).length} active
        </span>
      </div>

      <ScrollArea className="flex-1">
        {orders.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No orders
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {orders.map((order) => (
              <div
                key={order.orderId}
                className="px-3 py-2 flex items-center justify-between gap-2 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold ${
                        order.side === 'BUY'
                          ? 'text-[var(--color-pulse-green)]'
                          : 'text-[var(--color-pulse-red)]'
                      }`}
                    >
                      {order.side}
                    </span>
                    <span className="font-mono text-sm font-medium">
                      {order.quantity} {order.symbol}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @ {order.orderType} {order.price !== 'MKT' ? `$${order.price}` : ''}
                    </span>
                  </div>
                  {order.filled > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Filled: {order.filled}/{order.quantity}
                      {order.avgPrice !== '0.00' && ` avg $${order.avgPrice}`}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-5 ${
                      STATUS_COLORS[order.status] || ''
                    }`}
                  >
                    {order.status}
                  </Badge>

                  {canCancel(order.status) && (
                    <button
                      onClick={() => handleCancel(order.orderId)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
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
      </ScrollArea>
    </div>
  );
}
