// ─── Mock Data for Development ─────────────────────────────────────
// Used when IBKR_MOCK_MODE=true (no live gateway needed)

import type {
  SearchResult,
  MarketDataSnapshot,
  Order,
  Position,
  AccountSummary,
  PortfolioPnL,
  AuthStatus,
} from './types';

function randomBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomChange(base: number): { change: number; changePct: string } {
  const pct = (Math.random() - 0.4) * 4; // slight bullish bias
  const change = Math.round(base * (pct / 100) * 100) / 100;
  return { change, changePct: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` };
}

export const MOCK_INSTRUMENTS: SearchResult[] = [
  { conid: 265598, symbol: 'AAPL', name: 'APPLE INC', exchange: 'NASDAQ', type: 'STK' },
  { conid: 8314, symbol: 'IBM', name: 'INTL BUSINESS MACHINES', exchange: 'NYSE', type: 'STK' },
  { conid: 756733, symbol: 'SPY', name: 'SPDR S&P 500 ETF', exchange: 'ARCA', type: 'STK' },
  { conid: 44882024, symbol: 'SLV', name: 'ISHARES SILVER TRUST', exchange: 'ARCA', type: 'STK' },
  { conid: 272093, symbol: 'MSFT', name: 'MICROSOFT CORP', exchange: 'NASDAQ', type: 'STK' },
  { conid: 76792991, symbol: 'TSLA', name: 'TESLA INC', exchange: 'NASDAQ', type: 'STK' },
  { conid: 4815747, symbol: 'NVDA', name: 'NVIDIA CORP', exchange: 'NASDAQ', type: 'STK' },
  { conid: 15016062, symbol: 'BMA', name: 'BANCO MACRO SA', exchange: 'NYSE', type: 'STK' },
  { conid: 69067924, symbol: 'MARA', name: 'MARA HOLDINGS INC', exchange: 'NASDAQ', type: 'STK' },
  { conid: 457010218, symbol: 'SI', name: 'SILVER FUTURES', exchange: 'COMEX', type: 'FUT' },
];

const BASE_PRICES: Record<number, number> = {
  265598: 178.50,
  8314: 195.30,
  756733: 512.80,
  44882024: 28.40,
  272093: 428.60,
  76792991: 248.90,
  4815747: 875.20,
  15016062: 94.10,
  69067924: 22.50,
  457010218: 83.20,
};

export function mockSearch(query: string): SearchResult[] {
  const q = query.toLowerCase();
  return MOCK_INSTRUMENTS.filter(
    (i) =>
      i.symbol.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q)
  );
}

export function mockSnapshot(conids: number[]): MarketDataSnapshot[] {
  return conids.map((conid) => {
    const instrument = MOCK_INSTRUMENTS.find((i) => i.conid === conid);
    const base = BASE_PRICES[conid] || 100;
    const last = randomBetween(base * 0.98, base * 1.02);
    const spread = Math.max(0.01, base * 0.0005);
    const bid = Math.round((last - spread / 2) * 100) / 100;
    const ask = Math.round((last + spread / 2) * 100) / 100;
    const { change, changePct } = randomChange(base);
    const dayLow = Math.round((last - Math.abs(change) * 1.5) * 100) / 100;
    const dayHigh = Math.round((last + Math.abs(change) * 1.2) * 100) / 100;

    return {
      conid,
      last,
      symbol: instrument?.symbol || 'UNK',
      companyName: instrument?.name || 'Unknown',
      bid,
      bidSize: Math.round(Math.random() * 2000) + 100,
      ask,
      askSize: Math.round(Math.random() * 2000) + 100,
      change,
      changePct,
      volume: Math.round(Math.random() * 10000000) + 500000,
      dayLow,
      dayHigh,
      open: randomBetween(dayLow, dayHigh),
      prevClose: Math.round((last - change) * 100) / 100,
      updated: Date.now(),
    };
  });
}

export function mockOrders(): Order[] {
  return [
    {
      orderId: 1001,
      conid: 44882024,
      symbol: 'SLV',
      name: 'ISHARES SILVER TRUST',
      side: 'BUY',
      quantity: 50,
      filled: 0,
      remaining: 50,
      status: 'Submitted',
      orderType: 'Limit',
      price: '27.80',
      avgPrice: '0.00',
      tif: 'DAY',
      description: 'Buy 50 SLV @ Limit $27.80, DAY',
    },
    {
      orderId: 1002,
      conid: 265598,
      symbol: 'AAPL',
      name: 'APPLE INC',
      side: 'BUY',
      quantity: 100,
      filled: 100,
      remaining: 0,
      status: 'Filled',
      orderType: 'Market',
      price: 'MKT',
      avgPrice: '178.42',
      tif: 'DAY',
      description: 'Buy 100 AAPL @ Market, DAY',
    },
  ];
}

export function mockPositions(): Position[] {
  return [
    {
      conid: 265598,
      symbol: 'AAPL',
      position: 100,
      marketPrice: randomBetween(176, 181),
      marketValue: 0,
      avgCost: 175.10,
      unrealizedPnl: 0,
      realizedPnl: 0,
      currency: 'USD',
      assetClass: 'STK',
    },
    {
      conid: 4815747,
      symbol: 'NVDA',
      position: 25,
      marketPrice: randomBetween(860, 890),
      marketValue: 0,
      avgCost: 820.00,
      unrealizedPnl: 0,
      realizedPnl: 0,
      currency: 'USD',
      assetClass: 'STK',
    },
    {
      conid: 756733,
      symbol: 'SPY',
      position: 50,
      marketPrice: randomBetween(508, 518),
      marketValue: 0,
      avgCost: 495.30,
      unrealizedPnl: 0,
      realizedPnl: 125.40,
      currency: 'USD',
      assetClass: 'STK',
    },
  ].map((p) => ({
    ...p,
    marketValue: Math.round(p.position * p.marketPrice * 100) / 100,
    unrealizedPnl:
      Math.round(p.position * (p.marketPrice - p.avgCost) * 100) / 100,
  }));
}

export function mockAccountSummary(): AccountSummary {
  return {
    accountId: 'U1234567',
    netLiquidity: 125340.82,
    availableFunds: 98200.50,
    buyingPower: 392802.00,
    totalCash: 72500.00,
    grossPosition: 52840.82,
    initMargin: 26420.41,
    maintMargin: 26420.41,
    cushion: 0.945,
    unrealizedPnL: 2840.82,
    realizedPnL: 125.40,
  };
}

export function mockPortfolioPnL(): PortfolioPnL {
  return {
    dailyPnL: randomBetween(-500, 1200),
    netLiquidity: 125340.82,
    unrealizedPnL: 2840.82,
    excessLiquidity: 98200.50,
    marketValue: 52840.82,
  };
}

export function mockAuthStatus(): AuthStatus {
  return {
    authenticated: true,
    competing: false,
    connected: true,
  };
}
