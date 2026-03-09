// ─── IBKR WebSocket Manager ────────────────────────────────────────
// Client-side WebSocket for real-time market data, orders, P&L
// Includes auto-reconnect, heartbeat, and subscription management

import type { MarketDataSnapshot, Order, PortfolioPnL } from './types';

type MarketDataHandler = (conid: number, data: Partial<MarketDataSnapshot>) => void;
type OrderHandler = (orders: Partial<Order>[]) => void;
type PnLHandler = (pnl: PortfolioPnL) => void;
type ConnectionHandler = (connected: boolean) => void;

interface WSMessage {
  topic?: string;
  conid?: number;
  server_id?: string;
  args?: unknown;
  [key: string]: unknown;
}

export class IBKRWebSocket {
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private subscriptions = new Set<string>();

  private onMarketData: MarketDataHandler | null = null;
  private onOrderUpdate: OrderHandler | null = null;
  private onPnLUpdate: PnLHandler | null = null;
  private onConnectionChange: ConnectionHandler | null = null;

  private wsUrl: string;

  constructor(wsUrl = 'wss://localhost:5050/v1/api/ws') {
    this.wsUrl = wsUrl;
  }

  // ─── Event Handlers ───────────────────────────────────────────

  setMarketDataHandler(handler: MarketDataHandler) {
    this.onMarketData = handler;
  }

  setOrderHandler(handler: OrderHandler) {
    this.onOrderUpdate = handler;
  }

  setPnLHandler(handler: PnLHandler) {
    this.onPnLUpdate = handler;
  }

  setConnectionHandler(handler: ConnectionHandler) {
    this.onConnectionChange = handler;
  }

  // ─── Connection ───────────────────────────────────────────────

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.onConnectionChange?.(true);

        // Start heartbeat
        this.heartbeatInterval = setInterval(() => {
          this.send('tic');
        }, 55_000);

        // Subscribe to order updates and P&L
        this.send('sor+{}');
        this.send('spl+{}');

        // Resubscribe to market data
        this.subscriptions.forEach((msg) => this.send(msg));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          this.routeMessage(msg);
        } catch {
          // Non-JSON message (e.g., tic response)
        }
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.onConnectionChange?.(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // Error will trigger onclose
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.cleanup();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent auto-reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ─── Subscriptions ────────────────────────────────────────────

  subscribeMarketData(conid: number) {
    const fields = ['31', '84', '85', '86', '88', '82', '83', '7282', '7284', '7293'];
    const msg = `smd+${conid}+{"fields":${JSON.stringify(fields)}}`;
    this.subscriptions.add(msg);
    this.send(msg);
  }

  unsubscribeMarketData(conid: number) {
    const msg = `umd+${conid}+{}`;
    // Remove matching subscription
    for (const sub of this.subscriptions) {
      if (sub.startsWith(`smd+${conid}+`)) {
        this.subscriptions.delete(sub);
      }
    }
    this.send(msg);
  }

  // ─── Internal ─────────────────────────────────────────────────

  private send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

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

    this.onMarketData?.(conid, {
      conid,
      last: parseFloat(String(msg['31'] || '0')),
      bid: parseFloat(String(msg['84'] || '0')),
      bidSize: parseInt(String(msg['85'] || '0'), 10),
      ask: parseFloat(String(msg['86'] || '0')),
      askSize: parseInt(String(msg['88'] || '0'), 10),
      change: parseChange(String(msg['82'] || '0')),
      changePct: String(msg['83'] || ''),
      volume: parseInt(String(msg['7282'] || '0'), 10),
      dayLow: parseFloat(String(msg['7284'] || '0')),
      dayHigh: parseFloat(String(msg['7293'] || '0')),
      updated: Date.now(),
    });
  }

  private handleOrderUpdate(msg: WSMessage) {
    const args = msg.args as Array<Record<string, unknown>> | undefined;
    if (!args) return;

    const orders = args.map((o) => ({
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

    this.onOrderUpdate?.(orders);
  }

  private handlePnLUpdate(msg: WSMessage) {
    const args = msg.args as Record<string, { dpl: number; nl: number; upl: number; uel?: number; el?: number; mv: number }> | undefined;
    if (!args) return;

    const key = Object.keys(args)[0];
    if (!key) return;
    const pnl = args[key];

    this.onPnLUpdate?.({
      dailyPnL: pnl.dpl,
      netLiquidity: pnl.nl,
      unrealizedPnL: pnl.upl,
      excessLiquidity: pnl.uel ?? pnl.el ?? 0,
      marketValue: pnl.mv,
    });
  }

  private cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

function parseChange(value: string): number {
  const cleaned = value.replace(/^[CH]/, '');
  return parseFloat(cleaned) || 0;
}

// Singleton for client-side use
let instance: IBKRWebSocket | null = null;

export function getWebSocket(): IBKRWebSocket {
  if (!instance) {
    instance = new IBKRWebSocket();
  }
  return instance;
}
