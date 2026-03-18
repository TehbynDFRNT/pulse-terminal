'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Order, PortfolioPnL } from './types';
import type {
  LiveFeedResponse,
  StreamingChartBeat,
  StreamingPrice,
} from './live-feed-types';

type Listener = () => void;

const POLL_MS = 1_000;
const POLL_TIMEOUT_MS = 5_000;
const CONNECTION_STALE_MS = 15_000;
const LIVE_BEAT_RETENTION_MS = 6 * 60 * 60 * 1000;
const MAX_BEATS = 20_000;
const EMPTY_CHART_BEATS: StreamingChartBeat[] = [];
const EMPTY_ORDERS: Partial<Order>[] = [];
const EMPTY_MAP = new Map<number, StreamingPrice>();

class IBKRLiveFeedManager {
  private listeners = new Set<Listener>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private refCount = 0;
  private subscriptions = new Map<number, number>();
  private lastSuccessAt = 0;

  connected = false;
  prices = new Map<number, StreamingPrice>();
  chartBeats = new Map<number, StreamingChartBeat[]>();
  orders: Partial<Order>[] = [];
  pnl: PortfolioPnL | null = null;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addRef() {
    this.refCount++;
    if (this.refCount === 1) {
      void this.poll();
      this.pollTimer = setInterval(() => {
        void this.poll();
      }, POLL_MS);
    }
  }

  releaseRef() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.inFlight = false;
    }
  }

  subscribeMarketData(conid: number) {
    this.subscriptions.set(conid, (this.subscriptions.get(conid) ?? 0) + 1);
    void this.poll();
  }

  unsubscribeMarketData(conid: number) {
    const count = this.subscriptions.get(conid) ?? 0;
    if (count <= 1) {
      this.subscriptions.delete(conid);
      return;
    }
    this.subscriptions.set(conid, count - 1);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private getTrackedConids(): number[] {
    return Array.from(this.subscriptions.keys()).sort((left, right) => left - right);
  }

  private async poll() {
    if (this.inFlight || this.refCount <= 0) return;
    this.inFlight = true;

    try {
      const trackedConids = this.getTrackedConids();
      const params = new URLSearchParams();
      if (trackedConids.length > 0) {
        params.set('conids', trackedConids.join(','));
        const beatsSince = trackedConids
          .map((conid) => {
            const beats = this.chartBeats.get(conid) ?? EMPTY_CHART_BEATS;
            const since = beats[beats.length - 1]?.timeMs ?? 0;
            return since > 0 ? `${conid}:${since}` : null;
          })
          .filter((value): value is string => value != null);
        if (beatsSince.length > 0) {
          params.set('beatsSince', beatsSince.join(','));
        }
      }

      const search = params.toString();
      const response = await fetch(
        `/api/ibkr/live-feed${search ? `?${search}` : ''}`,
        {
          cache: 'no-store',
          signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
        }
      );

      if (!response.ok) {
        throw new Error(`live feed ${response.status}`);
      }

      const payload = (await response.json()) as LiveFeedResponse;
      const connectionChanged = this.connected !== Boolean(payload.connected);
      const changed = this.hydrate(payload, trackedConids);
      this.connected = Boolean(payload.connected);
      this.lastSuccessAt = Date.now();
      if (changed || connectionChanged) {
        this.notify();
      }
    } catch {
      const nextConnected = Date.now() - this.lastSuccessAt <= CONNECTION_STALE_MS;
      if (this.connected !== nextConnected) {
        this.connected = nextConnected;
        this.notify();
      }
    } finally {
      this.inFlight = false;
    }
  }

  private hydrate(payload: LiveFeedResponse, trackedConids: number[]): boolean {
    let changed = false;

    for (const price of payload.prices ?? []) {
      const previous = this.prices.get(price.conid);
      if (previous && isSamePrice(previous, price)) {
        continue;
      }
      this.prices.set(price.conid, price);
      changed = true;
    }

    if (trackedConids.length === 0) return changed;

    for (const conid of trackedConids) {
      const nextBeats = mergeChartBeats(
        this.chartBeats.get(conid) ?? EMPTY_CHART_BEATS,
        payload.chartBeats?.[String(conid)] ?? EMPTY_CHART_BEATS
      );
      const previous = this.chartBeats.get(conid) ?? EMPTY_CHART_BEATS;
      if (previous === nextBeats || isSameBeatSeries(previous, nextBeats)) {
        continue;
      }
      this.chartBeats.set(conid, nextBeats);
      changed = true;
    }

    return changed;
  }
}

let manager: IBKRLiveFeedManager | null = null;

function getManager(): IBKRLiveFeedManager {
  if (!manager) {
    manager = new IBKRLiveFeedManager();
  }
  return manager;
}

function isSamePrice(left: StreamingPrice, right: StreamingPrice): boolean {
  return (
    left.updated === right.updated &&
    left.chartPrice === right.chartPrice &&
    left.chartSource === right.chartSource &&
    left.displayPrice === right.displayPrice &&
    left.displaySource === right.displaySource &&
    left.bid === right.bid &&
    left.ask === right.ask &&
    left.last === right.last &&
    left.volume === right.volume &&
    left.dayLow === right.dayLow &&
    left.dayHigh === right.dayHigh
  );
}

function mergeChartBeats(
  existing: StreamingChartBeat[],
  incoming: StreamingChartBeat[]
): StreamingChartBeat[] {
  if (incoming.length === 0) {
    return existing;
  }

  const merged = new Map<string, StreamingChartBeat>();
  for (const beat of existing) {
    if (beat.value > 0) {
      merged.set(`${beat.timeMs}:${beat.value}:${beat.source}`, beat);
    }
  }
  for (const beat of incoming) {
    if (beat.value > 0) {
      merged.set(`${beat.timeMs}:${beat.value}:${beat.source}`, beat);
    }
  }

  const cutoff =
    Math.max(
      existing[existing.length - 1]?.timeMs ?? 0,
      incoming[incoming.length - 1]?.timeMs ?? 0
    ) - LIVE_BEAT_RETENTION_MS;

  const next = Array.from(merged.values())
    .filter((beat) => beat.timeMs >= cutoff)
    .sort((left, right) => left.timeMs - right.timeMs);

  return next.length > MAX_BEATS ? next.slice(next.length - MAX_BEATS) : next;
}

function isSameBeatSeries(
  left: StreamingChartBeat[],
  right: StreamingChartBeat[]
): boolean {
  if (left.length !== right.length) return false;
  if (left.length === 0) return true;

  const leftLast = left[left.length - 1]!;
  const rightLast = right[right.length - 1]!;
  return (
    leftLast.timeMs === rightLast.timeMs &&
    leftLast.value === rightLast.value &&
    leftLast.source === rightLast.source
  );
}

export type { StreamingChartBeat, StreamingPrice };

export function useIBKRConnection(enabled = true): { connected: boolean } {
  const mgr = getManager();

  useEffect(() => {
    if (!enabled) return;
    mgr.addRef();
    return () => mgr.releaseRef();
  }, [enabled, mgr]);

  const connected = useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => (enabled ? mgr.connected : false),
    () => false
  );

  return { connected };
}

export function useIBKRMarketData(
  conid: number | null,
  enabled = true
): StreamingPrice | null {
  const mgr = getManager();

  useEffect(() => {
    if (!enabled || conid == null) return;
    mgr.addRef();
    mgr.subscribeMarketData(conid);
    return () => {
      mgr.unsubscribeMarketData(conid);
      mgr.releaseRef();
    };
  }, [conid, enabled, mgr]);

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => (enabled && conid != null ? mgr.prices.get(conid) ?? null : null),
    () => null
  );
}

export function useIBKRChartBeats(
  conid: number | null,
  enabled = true
): StreamingChartBeat[] {
  const mgr = getManager();

  useEffect(() => {
    if (!enabled || conid == null) return;
    mgr.addRef();
    mgr.subscribeMarketData(conid);
    return () => {
      mgr.unsubscribeMarketData(conid);
      mgr.releaseRef();
    };
  }, [conid, enabled, mgr]);

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () =>
      enabled && conid != null
        ? mgr.chartBeats.get(conid) ?? EMPTY_CHART_BEATS
        : EMPTY_CHART_BEATS,
    () => EMPTY_CHART_BEATS
  );
}

export function useIBKROrders(): Partial<Order>[] {
  const mgr = getManager();

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => mgr.orders,
    () => EMPTY_ORDERS
  );
}

export function useIBKRPnL(): PortfolioPnL | null {
  const mgr = getManager();

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => mgr.pnl,
    () => null
  );
}

export function useIBKRMarketDataMulti(conids: number[]): Map<number, StreamingPrice> {
  const mgr = getManager();
  const prevConids = useRef<number[]>([]);
  const cachedSnapshot = useRef<Map<number, StreamingPrice>>(EMPTY_MAP);
  const lastUpdated = useRef(0);

  useEffect(() => {
    const previous = new Set(prevConids.current);
    const next = new Set(conids);

    for (const conid of conids) {
      if (!previous.has(conid)) {
        mgr.addRef();
        mgr.subscribeMarketData(conid);
      }
    }

    for (const conid of prevConids.current) {
      if (!next.has(conid)) {
        mgr.unsubscribeMarketData(conid);
        mgr.releaseRef();
      }
    }

    prevConids.current = conids;

    return () => {
      for (const conid of conids) {
        mgr.unsubscribeMarketData(conid);
        mgr.releaseRef();
      }
      prevConids.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conids.join(','), mgr]);

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => {
      let maxUpdated = 0;
      for (const conid of conids) {
        const price = mgr.prices.get(conid);
        if (price && price.updated > maxUpdated) {
          maxUpdated = price.updated;
        }
      }

      if (maxUpdated === lastUpdated.current && cachedSnapshot.current !== EMPTY_MAP) {
        return cachedSnapshot.current;
      }

      const snapshot = new Map<number, StreamingPrice>();
      for (const conid of conids) {
        const price = mgr.prices.get(conid);
        if (price) {
          snapshot.set(conid, price);
        }
      }

      cachedSnapshot.current = snapshot;
      lastUpdated.current = maxUpdated;
      return snapshot;
    },
    () => EMPTY_MAP
  );
}
