// ─── Mock Data for Development ─────────────────────────────────────
// Used when IBKR_MOCK_MODE=true (no live gateway needed)

import type {
  SearchResult,
  ScannerParams,
  ScannerRunRequest,
  ScannerResult,
  MarketSchedule,
  MarketDataSnapshot,
  Order,
  AccountTransactionsEnvelope,
  Position,
  AccountSummary,
  PortfolioPnL,
  CashBalance,
  PortfolioPerformanceResponse,
  AuthStatus,
} from './types';
import { getDisplayPrice } from './display-price';

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
  { conid: 474219659, symbol: 'MARA', name: 'MARA HOLDINGS INC', exchange: 'NASDAQ', type: 'STK' },
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
  474219659: 22.50,
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

export function mockScannerParams(): ScannerParams {
  return {
    instruments: [
      { code: 'STK', label: 'Stocks', instrumentTypes: ['STK'] },
      { code: 'CASH', label: 'FX', instrumentTypes: ['CASH'] },
      { code: 'CRYPTO', label: 'Crypto', instrumentTypes: ['CRYPTO'] },
    ],
    locations: [
      { code: 'STK.US.MAJOR', label: 'US Major Stocks', instrumentTypes: ['STK'] },
      { code: 'STK.US.MINOR', label: 'US Minor Stocks', instrumentTypes: ['STK'] },
      { code: 'CASH.IDEALPRO', label: 'IDEALPRO FX', instrumentTypes: ['CASH'] },
      { code: 'CRYPTO.PAXOS', label: 'PAXOS Crypto', instrumentTypes: ['CRYPTO'] },
    ],
    scanTypes: [
      { code: 'TOP_PERC_GAIN', label: 'Top % Gainers', instrumentTypes: ['STK', 'CRYPTO'] },
      { code: 'TOP_PERC_LOSE', label: 'Top % Losers', instrumentTypes: ['STK', 'CRYPTO'] },
      { code: 'MOST_ACTIVE', label: 'Most Active', instrumentTypes: ['STK'] },
      { code: 'HOT_BY_VOLUME', label: 'Hot by Volume', instrumentTypes: ['CASH'] },
    ],
    filters: [
      { code: 'priceAbove', label: 'Price Above', instrumentTypes: ['STK', 'CRYPTO'], group: 'price', valueType: 'number' },
      { code: 'priceBelow', label: 'Price Below', instrumentTypes: ['STK', 'CRYPTO'], group: 'price', valueType: 'number' },
      { code: 'volumeAbove', label: 'Volume Above', instrumentTypes: ['STK'], group: 'volume', valueType: 'number' },
      { code: 'changePercAbove', label: 'Change % Above', instrumentTypes: ['STK', 'CRYPTO'], group: 'performance', valueType: 'number' },
      { code: 'changePercBelow', label: 'Change % Below', instrumentTypes: ['STK', 'CRYPTO'], group: 'performance', valueType: 'number' },
      { code: 'marketCapAbove', label: 'Market Cap Above', instrumentTypes: ['STK'], group: 'fundamental', valueType: 'number' },
    ],
  };
}

export function mockRunScanner(request: ScannerRunRequest): ScannerResult[] {
  const instruments = MOCK_INSTRUMENTS.filter((instrument) => {
    if (request.instrument === 'STK') return instrument.type === 'STK';
    if (request.instrument === 'CASH') return instrument.type === 'CASH';
    if (request.instrument === 'CRYPTO') return instrument.type === 'CRYPTO';
    return true;
  });

  return instruments.slice(0, 10).map((instrument, index) => ({
    ...instrument,
    rank: index + 1,
    scanLabel: request.scanType,
    scanValue: String(randomBetween(-5, 12)),
    mdAvailability: 'R',
    marketDataStatus: 'live',
  }));
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
    const prevClose = Math.round((last - change) * 100) / 100;
    const display = getDisplayPrice({
      last,
      bid,
      ask,
      prevClose,
      change,
      changePct,
    });

    return {
      conid,
      last,
      displayPrice: display.displayPrice,
      displayChange: display.displayChange,
      displayChangePct: display.displayChangePct,
      displaySource: display.displaySource,
      symbol: instrument?.symbol || 'UNK',
      companyName: instrument?.name || 'Unknown',
      mdAvailability: 'R',
      marketDataStatus: 'live',
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
      prevClose,
      updated: Date.now(),
      hasLiveData: true,
    };
  });
}

export function mockMarketSchedule(conid: number, exchange?: string): MarketSchedule {
  const now = new Date();
  const days: MarketSchedule['days'] = [];
  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);

  for (let offset = 0; offset < 5; offset += 1) {
    const day = new Date(base.getTime() + offset * 24 * 60 * 60 * 1000);
    const dayOfWeek = day.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const date = day.toISOString().slice(0, 10).replace(/-/g, '');
    const liquidOpen = new Date(day);
    liquidOpen.setUTCHours(14, 30, 0, 0);
    const liquidClose = new Date(day);
    liquidClose.setUTCHours(21, 0, 0, 0);
    const extendedOpen = new Date(day);
    extendedOpen.setUTCHours(9, 0, 0, 0);
    const extendedClose = new Date(day);
    extendedClose.setUTCHours(1, 0, 0, 0);
    extendedClose.setUTCDate(extendedClose.getUTCDate() + 1);

    days.push({
      date,
      liquidHours: [
        {
          opening: liquidOpen.getTime(),
          closing: liquidClose.getTime(),
          cancelDailyOrders: true,
        },
      ],
      extendedHours: [
        {
          opening: extendedOpen.getTime(),
          closing: extendedClose.getTime(),
          cancelDailyOrders: true,
        },
      ],
    });
  }

  return {
    conid,
    exchange: exchange ?? null,
    timezone: 'US/Eastern',
    source: 'contract/trading-schedule',
    fetchedAt: Date.now(),
    days,
    state: {
      phase: 'regular',
      isOpen: true,
      isExtendedHours: false,
      nextChangeAt: days[0]?.liquidHours[0]?.closing ?? null,
      nextRegularOpen: null,
      nextRegularClose: days[0]?.liquidHours[0]?.closing ?? null,
      nextExtendedOpen: null,
      nextExtendedClose: days[0]?.extendedHours[0]?.closing ?? null,
      lastRegularClose: null,
    },
  };
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

export function mockTransactionsEnvelope(conid: number): AccountTransactionsEnvelope {
  const instrument = MOCK_INSTRUMENTS.find((item) => item.conid === conid);
  return {
    id: 'getTransactions',
    currency: 'USD',
    from: Date.now() - 30 * 24 * 60 * 60 * 1000,
    to: Date.now(),
    nd: 30,
    warning: null,
    accountId: 'U1234567',
    conid,
    symbol: instrument?.symbol || 'UNK',
    name: instrument?.name || 'Unknown',
    rpnl: {
      amount: 125.4,
      data: [
        {
          cur: 'USD',
          date: '20260310',
          fxRate: 1,
          side: 'L',
          positionSide: 'long',
          acctid: 'U1234567',
          amt: 125.4,
          conid,
        },
      ],
    },
    transactions: [
      {
        cur: 'USD',
        date: 'Tue Mar 10 00:00:00 EDT 2026',
        rawDate: '20260310',
        fxRate: 1,
        pr: BASE_PRICES[conid] || 100,
        qty: 100,
        acctid: 'U1234567',
        amt: -(BASE_PRICES[conid] || 100) * 100,
        conid,
        type: 'Buy',
        desc: instrument?.name || 'Mock Instrument',
      },
      {
        cur: 'USD',
        date: 'Tue Mar 11 00:00:00 EDT 2026',
        rawDate: '20260311',
        fxRate: 1,
        pr: (BASE_PRICES[conid] || 100) * 1.0125,
        qty: -100,
        acctid: 'U1234567',
        amt: (BASE_PRICES[conid] || 100) * 101.25,
        conid,
        type: 'Sell',
        desc: instrument?.name || 'Mock Instrument',
      },
    ],
  };
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

export function mockCashBalances(): { baseCurrency: string; cashBalances: CashBalance[] } {
  return {
    baseCurrency: 'AUD',
    cashBalances: [
      {
        currency: 'AUD',
        cashBalance: 976502.9,
        settledCash: 976502.9,
        netLiquidationValue: 977466.3,
        exchangeRate: 1,
        interest: 963.41,
        baseEquivalent: 976502.9,
        unrealizedPnlBase: 0,
        realizedPnlBase: 0,
        entryBaseAmount: null,
        markToBasePnl: null,
        isBase: true,
      },
      {
        currency: 'USD',
        cashBalance: 17705.75,
        settledCash: 17705.75,
        netLiquidationValue: 17705.75,
        exchangeRate: 1.41198,
        interest: 0,
        baseEquivalent: 25000,
        unrealizedPnlBase: 0,
        realizedPnlBase: 0,
        entryBaseAmount: 25000,
        markToBasePnl: 0,
        isBase: false,
      },
    ],
  };
}

export function mockPortfolioPerformance(period: string): PortfolioPerformanceResponse {
  const now = new Date();
  const points: PortfolioPerformanceResponse['points'] = [];
  const dayCount =
    period === '1D'
      ? 1
      : period === '7D'
        ? 7
        : period === '1M'
          ? 30
          : 120;
  const base = 125_000;

  for (let index = dayCount - 1; index >= 0; index -= 1) {
    const pointDate = new Date(now);
    pointDate.setUTCDate(now.getUTCDate() - index);
    pointDate.setUTCHours(0, 0, 0, 0);
    points.push({
      time: pointDate.getTime(),
      value: Math.round((base + (dayCount - index) * 45 + Math.sin(index / 3) * 220) * 100) / 100,
    });
  }

  const latest = points[points.length - 1] ?? null;

  return {
    accountId: 'U1234567',
    baseCurrency: 'USD',
    period,
    nd: dayCount,
    warning: null,
    points,
    snapshot: {
      value: latest?.value ?? null,
      updatedAt: latest?.time ?? null,
    },
  };
}

export function mockAuthStatus(): AuthStatus {
  return {
    authenticated: true,
    competing: false,
    connected: true,
  };
}
