// ─── IBKR Client Portal API Wrapper ────────────────────────────────
// Routes all requests through the CP Gateway (localhost:5050)
// Falls back to mock data when IBKR_MOCK_MODE=true

// Accept self-signed SSL cert from IBKR CP Gateway (server-side only).
// Node.js v25 fetch (undici) does not support per-request TLS options,
// so we disable cert validation process-wide for the gateway connection.
if (typeof process !== 'undefined' && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { conidCache } from './conid-cache';
import {
  mockSearch,
  mockSnapshot,
  mockOrders,
  mockPositions,
  mockAccountSummary,
  mockPortfolioPnL,
  mockAuthStatus,
} from './mock-data';
import type {
  SearchResult,
  ContractInfo,
  MarketDataSnapshot,
  HistoricalBar,
  OrderParams,
  Order,
  OrderResult,
  Position,
  AccountSummary,
  PortfolioPnL,
  AuthStatus,
  MARKET_DATA_FIELDS,
} from './types';
import { WATCHLIST_FIELD_LIST } from './types';

// ─── Config ────────────────────────────────────────────────────────

function getConfig() {
  const gatewayUrl = process.env.IBKR_GATEWAY_URL || 'https://localhost:5050';
  const basePath = process.env.IBKR_BASE_PATH || '/v1/api';
  return {
    baseUrl: `${gatewayUrl}${basePath}`,
    isMock: process.env.IBKR_MOCK_MODE === 'true',
    accountId: process.env.IBKR_ACCOUNT_ID || '',
  };
}

// ─── HTTP Wrapper ──────────────────────────────────────────────────

async function ibkrFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { baseUrl } = getConfig();
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'pulse-terminal/1.0',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IBKR API ${res.status}: ${text || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth & Session ────────────────────────────────────────────────

export async function checkAuthStatus(): Promise<AuthStatus> {
  if (getConfig().isMock) return mockAuthStatus();
  return ibkrFetch<AuthStatus>('/iserver/auth/status');
}

export async function tickle() {
  if (getConfig().isMock) return { session: 'mock', iserver: { authStatus: mockAuthStatus() } };
  return ibkrFetch('/tickle');
}

export async function initBrokerageSession() {
  if (getConfig().isMock) return mockAuthStatus();
  return ibkrFetch('/iserver/auth/ssodh/init', {
    method: 'POST',
    body: JSON.stringify({ publish: true, compete: true }),
  });
}

export async function getAccounts() {
  if (getConfig().isMock) {
    return {
      accounts: ['U1234567'],
      selectedAccount: 'U1234567',
      isPaper: false,
    };
  }
  return ibkrFetch<{ accounts: string[]; selectedAccount: string; isPaper: boolean }>(
    '/iserver/accounts'
  );
}

// ─── Contract Search ───────────────────────────────────────────────

export async function searchInstruments(
  query: string,
  secType?: string
): Promise<SearchResult[]> {
  if (getConfig().isMock) return mockSearch(query);

  const cached = conidCache.getSearch(query);
  if (cached) return cached;

  const params = new URLSearchParams({ symbol: query });
  if (secType) params.set('secType', secType);

  const results = await ibkrFetch<Array<{
    conid: number;
    companyName: string;
    description: string;
    sections?: Array<{
      symbol: string;
      listingExchange: string;
      exchange: string;
    }>;
  }>>(`/iserver/secdef/search?${params}`);

  const mapped: SearchResult[] = results.map((r) => ({
    conid: r.conid,
    name: r.companyName,
    symbol: r.sections?.[0]?.symbol || '',
    exchange: r.sections?.[0]?.listingExchange || '',
    type: r.description,
    allExchanges: r.sections?.[0]?.exchange?.split(';'),
  }));

  conidCache.setSearch(query, mapped);
  return mapped;
}

export async function getContractInfo(conid: number): Promise<ContractInfo> {
  const cached = conidCache.getContract(conid);
  if (cached) return cached;

  if (getConfig().isMock) {
    const { MOCK_INSTRUMENTS } = await import('./mock-data');
    const inst = MOCK_INSTRUMENTS.find((i) => i.conid === conid);
    const info: ContractInfo = {
      conid,
      symbol: inst?.symbol || 'UNK',
      name: inst?.name || 'Unknown',
      type: inst?.type || 'STK',
      currency: 'USD',
      exchange: inst?.exchange || 'SMART',
      validExchanges: [inst?.exchange || 'SMART'],
      hasSmartRouting: true,
      multiplier: 1,
      category: '',
      industry: '',
    };
    conidCache.setContract(conid, info);
    return info;
  }

  const raw = await ibkrFetch<{
    con_id: number;
    symbol: string;
    company_name: string;
    instrument_type: string;
    currency: string;
    exchange: string;
    valid_exchanges: string;
    smart_available: boolean;
    multiplier: string;
    category: string;
    industry: string;
  }>(`/iserver/contract/${conid}/info`);

  const info: ContractInfo = {
    conid: raw.con_id,
    symbol: raw.symbol,
    name: raw.company_name,
    type: raw.instrument_type,
    currency: raw.currency,
    exchange: raw.exchange,
    validExchanges: raw.valid_exchanges?.split(',') || [],
    hasSmartRouting: raw.smart_available,
    multiplier: raw.multiplier ? Number(raw.multiplier) : 1,
    category: raw.category,
    industry: raw.industry,
  };

  conidCache.setContract(conid, info);
  return info;
}

// ─── Market Data ───────────────────────────────────────────────────

export async function getMarketDataSnapshot(
  conids: number[]
): Promise<MarketDataSnapshot[]> {
  if (getConfig().isMock) return mockSnapshot(conids);

  const url = `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${WATCHLIST_FIELD_LIST}`;
  const raw = await ibkrFetch<Array<Record<string, string | number>>>(url);

  return raw.map((item) => ({
    conid: item.conid as number,
    last: parseFloat(String(item['31'] || '0')),
    symbol: String(item['55'] || ''),
    companyName: String(item['58'] || ''),
    bid: parseFloat(String(item['84'] || '0')),
    bidSize: parseInt(String(item['85'] || '0'), 10),
    ask: parseFloat(String(item['86'] || '0')),
    askSize: parseInt(String(item['88'] || '0'), 10),
    change: parseChange(String(item['82'] || '0')),
    changePct: String(item['83'] || '0%'),
    volume: parseInt(String(item['7282'] || '0'), 10),
    dayLow: parseFloat(String(item['7284'] || '0')),
    dayHigh: parseFloat(String(item['7293'] || '0')),
    open: parseFloat(String(item['7295'] || '0')),
    prevClose: parseFloat(String(item['7296'] || '0')),
    updated: item._updated as number,
  }));
}

export async function getHistoricalData(
  conid: number,
  period = '1d',
  bar = '5min',
  outsideRth = false
): Promise<HistoricalBar[]> {
  if (getConfig().isMock) {
    // Generate mock sparkline data
    const bars: HistoricalBar[] = [];
    const now = Date.now();
    let price = 100 + Math.random() * 100;
    for (let i = 0; i < 78; i++) {
      const vol = Math.random() * 0.02;
      const o = price;
      const c = price * (1 + (Math.random() - 0.48) * vol);
      bars.push({
        time: now - (78 - i) * 5 * 60 * 1000,
        open: o,
        high: Math.max(o, c) * (1 + Math.random() * 0.005),
        low: Math.min(o, c) * (1 - Math.random() * 0.005),
        close: c,
        volume: Math.round(Math.random() * 500000),
      });
      price = c;
    }
    return bars;
  }

  const params = new URLSearchParams({
    conid: String(conid),
    period,
    bar,
    outsideRth: String(outsideRth),
    barType: 'last',
  });

  const data = await ibkrFetch<{ data: Array<{ o: number; c: number; h: number; l: number; v: number; t: number }> }>(
    `/iserver/marketdata/history?${params}`
  );

  return data.data.map((b) => ({
    time: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
}

// ─── Orders ────────────────────────────────────────────────────────

export async function placeOrder(
  params: OrderParams
): Promise<OrderResult> {
  if (getConfig().isMock) {
    return {
      order_id: String(Date.now()),
      order_status: 'Submitted',
    };
  }

  const accountId = getConfig().accountId;
  const orderBody = {
    orders: [
      {
        conid: params.conid,
        orderType: params.orderType,
        side: params.side,
        quantity: params.quantity,
        tif: params.tif || 'DAY',
        outsideRTH: params.outsideRTH || false,
        cOID: `pulse-${Date.now()}`,
        ...(params.price != null && { price: params.price }),
        ...(params.auxPrice != null && { auxPrice: params.auxPrice }),
      },
    ],
  };

  const res = await ibkrFetch<OrderResult | Array<{ id: string }>>(
    `/iserver/account/${accountId}/orders`,
    { method: 'POST', body: JSON.stringify(orderBody) }
  );

  // Handle order reply messages (confirmation needed)
  if (Array.isArray(res) && res[0]?.id) {
    return confirmOrderReply(res[0].id);
  }

  return res as OrderResult;
}

async function confirmOrderReply(replyId: string): Promise<OrderResult> {
  const res = await ibkrFetch<OrderResult | Array<{ id: string }>>(
    `/iserver/reply/${replyId}`,
    { method: 'POST', body: JSON.stringify({ confirmed: true }) }
  );

  // Cascading reply messages
  if (Array.isArray(res) && res[0]?.id) {
    return confirmOrderReply(res[0].id);
  }

  return res as OrderResult;
}

export async function cancelOrder(orderId: string): Promise<{ msg: string }> {
  if (getConfig().isMock) {
    return { msg: 'Request was submitted' };
  }

  const accountId = getConfig().accountId;
  return ibkrFetch(`/iserver/account/${accountId}/order/${orderId}`, {
    method: 'DELETE',
  });
}

export async function getLiveOrders(): Promise<Order[]> {
  if (getConfig().isMock) return mockOrders();

  const data = await ibkrFetch<{ orders: Array<Record<string, unknown>> }>(
    '/iserver/account/orders?force=true'
  );

  return (data.orders || []).map((o) => ({
    orderId: o.orderId as number,
    conid: o.conid as number,
    symbol: o.ticker as string,
    name: o.companyName as string,
    side: o.side as 'BUY' | 'SELL',
    quantity: o.totalSize as number,
    filled: o.filledQuantity as number,
    remaining: o.remainingQuantity as number,
    status: o.status as Order['status'],
    orderType: o.orderType as string,
    price: o.price as string,
    avgPrice: o.avgPrice as string,
    tif: o.timeInForce as string,
    description: o.orderDesc as string,
  }));
}

// ─── Portfolio ─────────────────────────────────────────────────────

export async function getPositions(): Promise<Position[]> {
  if (getConfig().isMock) return mockPositions();

  const accountId = getConfig().accountId;
  const allPositions: Position[] = [];
  let page = 0;

  while (true) {
    const raw = await ibkrFetch<Array<Record<string, unknown>>>(
      `/portfolio/${accountId}/positions/${page}`
    );
    if (!raw || raw.length === 0) break;

    allPositions.push(
      ...raw.map((p) => ({
        conid: p.conid as number,
        symbol: p.contractDesc as string,
        position: p.position as number,
        marketPrice: p.mktPrice as number,
        marketValue: p.mktValue as number,
        avgCost: p.avgCost as number,
        unrealizedPnl: p.unrealizedPnl as number,
        realizedPnl: p.realizedPnl as number,
        currency: p.currency as string,
        assetClass: p.assetClass as string,
      }))
    );
    page++;
  }

  return allPositions;
}

export async function getAccountSummary(): Promise<AccountSummary> {
  if (getConfig().isMock) return mockAccountSummary();

  const accountId = getConfig().accountId;
  const raw = await ibkrFetch<Record<string, { amount: number; value?: string }>>(
    `/portfolio/${accountId}/summary`
  );

  return {
    accountId: raw.accountcode?.value || accountId,
    netLiquidity: raw.netliquidation?.amount || 0,
    availableFunds: raw.availablefunds?.amount || 0,
    buyingPower: raw.buyingpower?.amount || 0,
    totalCash: raw.totalcashvalue?.amount || 0,
    grossPosition: raw.grosspositionvalue?.amount || 0,
    initMargin: raw.initmarginreq?.amount || 0,
    maintMargin: raw.maintmarginreq?.amount || 0,
    cushion: raw.cushion?.amount || 0,
    unrealizedPnL: raw.unrealizedpnl?.amount || 0,
    realizedPnL: raw.realizedpnl?.amount || 0,
  };
}

export async function getPortfolioPnL(): Promise<PortfolioPnL> {
  if (getConfig().isMock) return mockPortfolioPnL();

  const data = await ibkrFetch<{ upnl: Record<string, { dpl: number; nl: number; upl: number; uel?: number; el?: number; mv: number }> }>(
    '/iserver/account/pnl/partitioned'
  );
  const key = Object.keys(data.upnl)[0];
  const pnl = data.upnl[key];

  return {
    dailyPnL: pnl.dpl,
    netLiquidity: pnl.nl,
    unrealizedPnL: pnl.upl,
    excessLiquidity: pnl.uel ?? pnl.el ?? 0, // uel is the new field, el is legacy fallback
    marketValue: pnl.mv,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function parseChange(value: string): number {
  // IBKR prefixes change with C (green/up) or H (red/down)
  const cleaned = value.replace(/^[CH]/, '');
  return parseFloat(cleaned) || 0;
}
