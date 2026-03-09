'use client';

// ─── IBKR WebSocket React Hook ────────────────────────────────────
// Reusable hook for subscribing to real-time IBKR market data,
// order updates, and P&L via the CP Gateway WebSocket.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Order, PortfolioPnL } from './types';

// ─── Types ────────────────────────────────────────────────────────

interface WSMessage {
  topic?: string;
  conid?: number;
  server_id?: string;
  args?: unknown;
  [key: string]: unknown;
}

export interface StreamingPrice {
  conid: number;
  last: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  change: number;
  changePct: string;
  volume: number;
  dayLow: number;
  dayHigh: number;
  updated: number;
}

// ─── Shared WebSocket Singleton ───────────────────────────────────

const WS_URL = 'wss://localhost:5050/v1/api/ws';
const HEARTBEAT_MS = 55_000;
const MAX_RECONNECT = 10;

type Listener = () => void;

class IBKRWSManager {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private subscriptions = new Map<number, string>(); // conid → sub message
  private listeners = new Set<Listener>();
  private refCount = 0;

  // Shared state
  connected = false;
  prices = new Map<number, StreamingPrice>();
  orders: Partial<Order>[] = [];
  pnl: PortfolioPnL | null = null;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  // ─── Ref-counted connect/disconnect ─────────────────────────

  addRef() {
    this.refCount++;
    if (this.refCount === 1) this.connect();
  }

  releaseRef() {
    this.refCount--;
    if (this.refCount <= 0) {
      this.refCount = 0;
      this.disconnect();
    }
  }

  // ─── Market Data Subscriptions ──────────────────────────────

  subscribeMarketData(conid: number) {
    const fields = ['31', '84', '85', '86', '88', '82', '83', '7282', '7284', '7293'];
    const msg = `smd+${conid}+{"fields":${JSON.stringify(fields)}}`;
    this.subscriptions.set(conid, msg);
    this.send(msg);
  }

  unsubscribeMarketData(conid: number) {
    this.subscriptions.delete(conid);
    this.send(`umd+${conid}+{}`);
  }

  // ─── Connection ─────────────────────────────────────────────

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.connected = true;
        this.notify();

        this.heartbeatTimer = setInterval(() => this.send('tic'), HEARTBEAT_MS);

        // Subscribe to orders and P&L
        this.send('sor+{}');
        this.send('spl+{}');

        // Resubscribe market data
        for (const msg of this.subscriptions.values()) {
          this.send(msg);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          this.routeMessage(msg);
        } catch {
          // Non-JSON (tic response)
        }
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.connected = false;
        this.notify();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose will fire
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = MAX_RECONNECT; // prevent auto-reconnect
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.notify();
  }

  private send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT) return;
    if (this.refCount <= 0) return; // don't reconnect if nobody is listening

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // ─── Message Routing ────────────────────────────────────────

  private routeMessage(msg: WSMessage) {
    if (msg.topic?.startsWith('smd+')) {
      this.handleMarketData(msg);
    } else if (msg.topic?.startsWith('sor')) {
      this.handleOrderUpdate(msg);
    } else if (msg.topic?.startsWith('spl')) {
      this.handlePnLUpdate(msg);
    }
  }

  private handleMarketData(msg: WSMessage) {
    const conid = msg.conid;
    if (!conid) return;

    const existing = this.prices.get(conid);
    const updated: StreamingPrice = {
      conid,
      last: parseFieldFloat(msg['31'], existing?.last ?? 0),
      bid: parseFieldFloat(msg['84'], existing?.bid ?? 0),
      bidSize: parseFieldInt(msg['85'], existing?.bidSize ?? 0),
      ask: parseFieldFloat(msg['86'], existing?.ask ?? 0),
      askSize: parseFieldInt(msg['88'], existing?.askSize ?? 0),
      change: parseChange(String(msg['82'] || ''), existing?.change ?? 0),
      changePct: msg['83'] != null ? String(msg['83']) : (existing?.changePct ?? ''),
      volume: parseFieldInt(msg['7282'], existing?.volume ?? 0),
      dayLow: parseFieldFloat(msg['7284'], existing?.dayLow ?? 0),
      dayHigh: parseFieldFloat(msg['7293'], existing?.dayHigh ?? 0),
      updated: Date.now(),
    };

    this.prices.set(conid, updated);
    this.notify();
  }

  private handleOrderUpdate(msg: WSMessage) {
    const args = msg.args as Array<Record<string, unknown>> | undefined;
    if (!args) return;

    this.orders = args.map((o) => ({
      orderId: o.orderId as number,
      symbol: o.ticker as string,
      side: o.side as 'BUY' | 'SELL',
      quantity: o.totalSize as number,
      filled: o.filledQuantity as number,
      remaining: o.remainingQuantity as number,
      status: o.status as Order['status'],
      orderType: o.orderType as string,
      price: o.price as string,
      description: o.orderDesc as string,
    }));
    this.notify();
  }

  private handlePnLUpdate(msg: WSMessage) {
    const args = msg.args as Record<string, { dpl: number; nl: number; upl: number; uel?: number; el?: number; mv: number }> | undefined;
    if (!args) return;

    const key = Object.keys(args)[0];
    if (!key) return;
    const pnl = args[key];

    this.pnl = {
      dailyPnL: pnl.dpl,
      netLiquidity: pnl.nl,
      unrealizedPnL: pnl.upl,
      excessLiquidity: pnl.uel ?? pnl.el ?? 0,
      marketValue: pnl.mv,
    };
    this.notify();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseFieldFloat(val: unknown, fallback: number): number {
  if (val == null || val === '') return fallback;
  const n = parseFloat(String(val));
  return isNaN(n) ? fallback : n;
}

function parseFieldInt(val: unknown, fallback: number): number {
  if (val == null || val === '') return fallback;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? fallback : n;
}

function parseChange(value: string, fallback: number): number {
  if (!value) return fallback;
  const cleaned = value.replace(/^[CH]/, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

// ─── Singleton ────────────────────────────────────────────────────

let manager: IBKRWSManager | null = null;

function getManager(): IBKRWSManager {
  if (!manager) {
    manager = new IBKRWSManager();
  }
  return manager;
}

// ─── React Hooks ──────────────────────────────────────────────────

/**
 * Connect to the IBKR WebSocket and auto-manage lifecycle.
 * Returns connection status.
 */
export function useIBKRConnection(): { connected: boolean } {
  const mgr = getManager();

  useEffect(() => {
    mgr.addRef();
    return () => mgr.releaseRef();
  }, [mgr]);

  const connected = useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => mgr.connected,
    () => false // SSR
  );

  return { connected };
}

/**
 * Subscribe to streaming market data for a conid.
 * Returns the latest price data (or null if no data yet).
 */
export function useIBKRMarketData(conid: number | null): StreamingPrice | null {
  const mgr = getManager();

  useEffect(() => {
    if (conid == null) return;
    mgr.addRef();
    mgr.subscribeMarketData(conid);
    return () => {
      mgr.unsubscribeMarketData(conid);
      mgr.releaseRef();
    };
  }, [conid, mgr]);

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => (conid != null ? mgr.prices.get(conid) ?? null : null),
    () => null // SSR
  );
}

/**
 * Get streaming order updates.
 */
export function useIBKROrders(): Partial<Order>[] {
  const mgr = getManager();

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => mgr.orders,
    () => [] // SSR
  );
}

/**
 * Get streaming P&L.
 */
export function useIBKRPnL(): PortfolioPnL | null {
  const mgr = getManager();

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => mgr.pnl,
    () => null // SSR
  );
}

/**
 * Multi-conid market data subscription.
 * Returns a Map of conid → StreamingPrice.
 */
export function useIBKRMarketDataMulti(conids: number[]): Map<number, StreamingPrice> {
  const mgr = getManager();
  const prevConids = useRef<number[]>([]);

  useEffect(() => {
    const prev = new Set(prevConids.current);
    const next = new Set(conids);

    // Subscribe new
    for (const c of conids) {
      if (!prev.has(c)) {
        mgr.addRef();
        mgr.subscribeMarketData(c);
      }
    }

    // Unsubscribe removed
    for (const c of prevConids.current) {
      if (!next.has(c)) {
        mgr.unsubscribeMarketData(c);
        mgr.releaseRef();
      }
    }

    prevConids.current = conids;

    return () => {
      for (const c of conids) {
        mgr.unsubscribeMarketData(c);
        mgr.releaseRef();
      }
      prevConids.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conids.join(','), mgr]);

  return useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => {
      const result = new Map<number, StreamingPrice>();
      for (const c of conids) {
        const p = mgr.prices.get(c);
        if (p) result.set(c, p);
      }
      return result;
    },
    () => new Map() // SSR
  );
}
