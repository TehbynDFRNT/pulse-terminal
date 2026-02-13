'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrdersStore } from '@/lib/store/orders';
import { useWatchlistStore } from '@/lib/store/watchlist';
import type { WatchlistItem, OrderSide, OrderType, TimeInForce } from '@/lib/ibkr/types';

interface Props {
  conid: number;
  instrument: WatchlistItem;
}

export function OrderPanel({ conid, instrument }: Props) {
  const price = useWatchlistStore((s) => s.prices[conid]);
  const {
    orderForm,
    isSubmitting,
    setSide,
    setOrderType,
    setQuantity,
    setPrice,
    setTif,
    setSubmitting,
    setOrders,
  } = useOrdersStore();

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);

    try {
      const res = await fetch('/api/ibkr/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conid,
          side: orderForm.side,
          orderType: orderForm.orderType,
          quantity: orderForm.quantity,
          ...(orderForm.orderType !== 'MKT' &&
            orderForm.price != null && { price: orderForm.price }),
          tif: orderForm.tif,
        }),
      });

      if (res.ok) {
        // Refresh orders
        const ordersRes = await fetch('/api/ibkr/orders');
        const orders = await ordersRes.json();
        if (Array.isArray(orders)) {
          setOrders(orders);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }, [conid, orderForm, setSubmitting, setOrders]);

  const needsPrice = orderForm.orderType !== 'MKT';

  return (
    <div className="px-4 py-3 flex-1 flex flex-col">
      {/* BUY / SELL Toggle */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Button
          variant={orderForm.side === 'BUY' ? 'default' : 'outline'}
          onClick={() => setSide('BUY')}
          className={`h-11 text-base font-bold ${
            orderForm.side === 'BUY'
              ? 'bg-[var(--color-pulse-buy)] hover:bg-[var(--color-pulse-buy)]/90 text-black'
              : 'hover:bg-[var(--color-pulse-buy)]/10 hover:text-[var(--color-pulse-buy)] hover:border-[var(--color-pulse-buy)]'
          }`}
        >
          BUY
        </Button>
        <Button
          variant={orderForm.side === 'SELL' ? 'default' : 'outline'}
          onClick={() => setSide('SELL')}
          className={`h-11 text-base font-bold ${
            orderForm.side === 'SELL'
              ? 'bg-[var(--color-pulse-sell)] hover:bg-[var(--color-pulse-sell)]/90 text-white'
              : 'hover:bg-[var(--color-pulse-sell)]/10 hover:text-[var(--color-pulse-sell)] hover:border-[var(--color-pulse-sell)]'
          }`}
        >
          SELL
        </Button>
      </div>

      {/* Quantity + Order Type */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
            Quantity
          </label>
          <Input
            type="number"
            value={orderForm.quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
            className="font-mono text-sm h-9 bg-secondary"
            min={1}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
            Type
          </label>
          <Select
            value={orderForm.orderType}
            onValueChange={(v) => setOrderType(v as OrderType)}
          >
            <SelectTrigger className="h-9 bg-secondary font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MKT">Market</SelectItem>
              <SelectItem value="LMT">Limit</SelectItem>
              <SelectItem value="STP">Stop</SelectItem>
              <SelectItem value="STP_LIMIT">Stop Limit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Limit Price + TIF */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
            {orderForm.orderType === 'STP' ? 'Stop Price' : 'Limit Price'}
          </label>
          <Input
            type="number"
            step="0.01"
            value={orderForm.price ?? (price?.bid || '')}
            onChange={(e) => setPrice(parseFloat(e.target.value) || null)}
            disabled={!needsPrice}
            className={`font-mono text-sm h-9 bg-secondary ${
              !needsPrice ? 'opacity-40' : ''
            }`}
            placeholder={needsPrice ? 'Price' : 'MKT'}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
            Time in Force
          </label>
          <Select
            value={orderForm.tif}
            onValueChange={(v) => setTif(v as TimeInForce)}
          >
            <SelectTrigger className="h-9 bg-secondary font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAY">DAY</SelectItem>
              <SelectItem value="GTC">GTC</SelectItem>
              <SelectItem value="IOC">IOC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Estimated Value */}
      <div className="text-xs text-muted-foreground mb-3 font-mono">
        Est. value: $
        {(
          orderForm.quantity * (needsPrice ? (orderForm.price || 0) : (price?.last || 0))
        ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || orderForm.quantity <= 0}
        className={`w-full h-10 text-sm font-bold ${
          orderForm.side === 'BUY'
            ? 'bg-[var(--color-pulse-buy)] hover:bg-[var(--color-pulse-buy)]/90 text-black'
            : 'bg-[var(--color-pulse-sell)] hover:bg-[var(--color-pulse-sell)]/90 text-white'
        }`}
      >
        {isSubmitting
          ? 'Submitting...'
          : `${orderForm.side} ${orderForm.quantity} ${instrument.symbol}`}
      </Button>
    </div>
  );
}
