'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createAlert,
  deleteAlert,
  getAlerts,
  getNotifications,
  setAlertActive,
} from '@/lib/ibkr/gateway-client';
import type { AccountAlertCreateParams, AccountAlertSummary, FyiNotification } from '@/lib/ibkr/types';
import { useGatewayStore } from '@/lib/store/gateway';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatPrice } from '@/lib/utils';

export function AlertsPanel() {
  const gatewayUp = useGatewayStore((s) => s.connected);
  const selectedConid = useWatchlistStore((s) => s.selectedConid);
  const items = useWatchlistStore((s) => s.items);
  const prices = useWatchlistStore((s) => s.prices);
  const instrument = items.find((item) => item.conid === selectedConid) ?? null;
  const referencePrice =
    (selectedConid ? prices[selectedConid]?.displayPrice : 0) ||
    (selectedConid ? prices[selectedConid]?.last : 0) ||
    0;

  const [alerts, setAlerts] = useState<AccountAlertSummary[]>([]);
  const [notifications, setNotifications] = useState<FyiNotification[]>([]);
  const [targetPrice, setTargetPrice] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [nextAlerts, nextNotifications] = await Promise.all([
      getAlerts(),
      getNotifications(),
    ]);
    setAlerts(nextAlerts);
    setNotifications(nextNotifications);
  };

  useEffect(() => {
    if (!gatewayUp) return;
    let cancelled = false;

    const refresh = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextAlerts, nextNotifications] = await Promise.all([
          getAlerts(),
          getNotifications(),
        ]);
        if (!cancelled) {
          setAlerts(nextAlerts);
          setNotifications(nextNotifications);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load alerts');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [gatewayUp]);

  useEffect(() => {
    if (!instrument || referencePrice <= 0) return;
    setTargetPrice(referencePrice.toFixed(referencePrice >= 1 ? 2 : 5));
  }, [instrument?.conid, referencePrice]);

  const handleCreate = async () => {
    if (!instrument) return;
    const price = Number(targetPrice);
    if (!(price > 0)) {
      setError('Target price must be greater than zero.');
      return;
    }

    const payload: AccountAlertCreateParams = {
      alertName: `${instrument.symbol} ${direction} ${price}`,
      alertMessage: `${instrument.symbol} ${direction} ${price}`,
      alertRepeatable: 0,
      outsideRth: 1,
      sendMessage: 0,
      iTWSOrdersOnly: 0,
      showPopup: 0,
      tif: 'GTC',
      conditions: [
        {
          conidex: `${instrument.conid}@${instrument.exchange}`,
          logicBind: 'n',
          operator: direction === 'below' ? '<=' : '>=',
          triggerMethod: '0',
          type: 1,
          value: String(price),
        },
      ],
    };

    setCreating(true);
    setError(null);
    try {
      await createAlert(payload);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alert');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (alert: AccountAlertSummary) => {
    setMutatingId(alert.alertId);
    setError(null);
    try {
      await setAlertActive(alert.alertId, !alert.active);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert');
    } finally {
      setMutatingId(null);
    }
  };

  const handleDelete = async (alertId: number) => {
    setMutatingId(alertId);
    setError(null);
    try {
      await deleteAlert(alertId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete alert');
    } finally {
      setMutatingId(null);
    }
  };

  const selectedLabel = useMemo(() => {
    if (!instrument) return 'Select an instrument to create an alert';
    const ref =
      referencePrice > 0 ? ` · ref ${formatPrice(referencePrice, -1)}` : '';
    return `${instrument.symbol} · ${instrument.exchange}${ref}`;
  }, [instrument, referencePrice]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="border-b border-border/50 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Alerting
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{selectedLabel}</div>
          <div className="mt-3 grid grid-cols-[120px_1fr_auto] gap-2">
            <button
              type="button"
              onClick={() => setDirection((value) => (value === 'above' ? 'below' : 'above'))}
              className={cn(
                'rounded border px-3 py-2 text-xs uppercase tracking-wider',
                direction === 'above'
                  ? 'border-emerald-500/40 text-emerald-400'
                  : 'border-red-500/40 text-red-400'
              )}
            >
              {direction === 'above' ? 'Above' : 'Below'}
            </button>
            <Input
              type="number"
              value={targetPrice}
              onChange={(event) => setTargetPrice(event.target.value)}
              className="h-9 bg-secondary font-mono text-sm"
              placeholder="Target price"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCreate()}
              disabled={!instrument || creating}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
          {error ? <div className="mt-2 text-xs text-red-400">{error}</div> : null}
        </div>

        <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="min-h-0 border-b border-border/50 lg:border-b-0 lg:border-r">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Alerts
          </div>
          {loading && alerts.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Loading alerts…</div>
          ) : alerts.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">No account alerts.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {alerts.map((alert) => (
                <div key={alert.alertId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-foreground">{alert.name}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {alert.orderTime || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={mutatingId === alert.alertId}
                      onClick={() => void handleToggle(alert)}
                    >
                      {alert.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={mutatingId === alert.alertId}
                      onClick={() => void handleDelete(alert.alertId)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          <div className="min-h-0">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No FYI notifications.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {notifications.slice(0, 20).map((notification) => (
                <div key={notification.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-xs text-foreground">{notification.headline}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {notification.category || 'FYI'}
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {notification.receivedAt
                      ? new Date(notification.receivedAt).toLocaleString()
                      : '—'}
                  </div>
                  {notification.body ? (
                    <div className="mt-1 text-xs text-muted-foreground">{notification.body}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
