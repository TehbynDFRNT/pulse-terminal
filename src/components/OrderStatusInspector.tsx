'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getOrderStatus, modifyOrder } from '@/lib/ibkr/gateway-client';
import type { OrderMutationResponse, OrderStatusDetail, TimeInForce } from '@/lib/ibkr/types';
import { cn, formatPrice } from '@/lib/utils';

const TIF_OPTIONS: TimeInForce[] = ['DAY', 'GTC', 'IOC', 'OPG', 'GTD', 'OVT', 'OND'];

export function OrderStatusInspector({
  orderId,
  onClose,
  onUpdated,
}: {
  orderId: number | null;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}) {
  const [detail, setDetail] = useState<OrderStatusDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [tif, setTif] = useState<TimeInForce>('DAY');
  const [outsideRth, setOutsideRth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replyResult, setReplyResult] = useState<OrderMutationResponse | null>(null);

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await getOrderStatus(orderId);
        if (!cancelled) {
          setDetail(next);
          setQuantity(String(next.totalSize));
          setPrice(next.limitPrice == null ? '' : String(next.limitPrice));
          setTif(next.tif as TimeInForce);
          setOutsideRth(next.outsideRTH);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load order status');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!orderId) return null;

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setReplyResult(null);
    try {
      const result = await modifyOrder(orderId, {
        quantity: Number(quantity) || detail.totalSize,
        price: price.trim() === '' ? undefined : Number(price),
        tif,
        outsideRTH: outsideRth,
      });
      setReplyResult(result);
      await onUpdated();
      const refreshed = await getOrderStatus(orderId);
      setDetail(refreshed);
      setQuantity(String(refreshed.totalSize));
      setPrice(refreshed.limitPrice == null ? '' : String(refreshed.limitPrice));
      setTif(refreshed.tif as TimeInForce);
      setOutsideRth(refreshed.outsideRTH);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modify failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ibkr/orders?orderId=${orderId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Cancel failed');
      }
      await onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-border/60 bg-background/80 px-3 py-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Order Detail
          </div>
          <div className="mt-1 font-mono text-sm text-foreground">
            {detail?.orderDescriptionWithContract || `Order ${orderId}`}
          </div>
        </div>
        <Button type="button" size="xs" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>

      {loading && !detail ? (
        <div className="text-xs text-muted-foreground">Loading order detail…</div>
      ) : error ? (
        <div className="text-xs text-red-400">{error}</div>
      ) : detail ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded border border-border/70 bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Status
              </div>
              <div className="mt-1 text-xs text-foreground">{detail.orderStatusDescription}</div>
            </div>
            <div className="rounded border border-border/70 bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Filled
              </div>
              <div className="mt-1 font-mono text-xs text-foreground">
                {detail.filled} / {detail.totalSize}
              </div>
            </div>
            <div className="rounded border border-border/70 bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Avg Price
              </div>
              <div className="mt-1 font-mono text-xs text-foreground">
                {detail.avgPrice == null ? '—' : formatPrice(detail.avgPrice, -1)}
              </div>
            </div>
            <div className="rounded border border-border/70 bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Route
              </div>
              <div className="mt-1 text-xs text-foreground">
                {detail.listingExchange || 'Auto'}
              </div>
            </div>
          </div>

          {detail.editable ? (
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Quantity
                </label>
                <Input
                  type="number"
                  className="h-9 bg-secondary font-mono text-sm"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Limit
                </label>
                <Input
                  type="number"
                  className="h-9 bg-secondary font-mono text-sm"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={detail.orderType === 'MKT'}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  TIF
                </label>
                <Select value={tif} onValueChange={(value) => setTif(value as TimeInForce)}>
                  <SelectTrigger className="h-9 bg-secondary font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIF_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant={outsideRth ? 'default' : 'outline'}
                  className="h-9 w-full"
                  onClick={() => setOutsideRth((value) => !value)}
                >
                  {outsideRth ? 'Outside RTH On' : 'Outside RTH Off'}
                </Button>
              </div>
            </div>
          ) : null}

          {replyResult?.replies.length ? (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-amber-400">
                Confirmed Messages
              </div>
              <div className="mt-1 space-y-1 text-xs text-amber-300">
                {replyResult.replies.map((reply) => (
                  <div key={reply.id}>{reply.message.join(' ')}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCancel()}
              disabled={!detail.canCancel || saving}
            >
              Cancel Order
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!detail.editable || saving}
            >
              {saving ? 'Updating…' : 'Apply Update'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
