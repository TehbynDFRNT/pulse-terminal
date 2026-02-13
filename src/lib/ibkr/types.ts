// ─── IBKR API Types ────────────────────────────────────────────────
// Mirrors the IBKR Client Portal API response shapes

// ─── Market Data Field Tags ────────────────────────────────────────
export const MARKET_DATA_FIELDS = {
  LAST_PRICE: '31',
  SYMBOL: '55',
  COMPANY_NAME: '58',
  BID: '84',
  BID_SIZE: '85',
  ASK: '86',
  ASK_SIZE: '88',
  LAST_SIZE: '7059',
  CHANGE: '82',
  CHANGE_PCT: '83',
  VOLUME: '7282',
  DAY_LOW: '7284',
  DAY_HIGH: '7293',
  OPEN: '7295',
  PREV_CLOSE: '7296',
} as const;

export const WATCHLIST_FIELD_LIST = Object.values(MARKET_DATA_FIELDS).join(',');

// ─── Instrument / Contract ─────────────────────────────────────────
export interface SearchResult {
  conid: number;
  name: string;
  symbol: string;
  exchange: string;
  type: string;
  allExchanges?: string[];
}

export interface ContractInfo {
  conid: number;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  exchange: string;
  validExchanges: string[];
  hasSmartRouting: boolean;
  multiplier: number;
  category: string;
  industry: string;
}

// ─── Market Data ───────────────────────────────────────────────────
export interface MarketDataSnapshot {
  conid: number;
  last: number;
  symbol: string;
  companyName: string;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  change: number;
  changePct: string;
  volume: number;
  dayLow: number;
  dayHigh: number;
  open: number;
  prevClose: number;
  updated: number;
}

export interface HistoricalBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Orders ────────────────────────────────────────────────────────
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MKT' | 'LMT' | 'STP' | 'STP_LIMIT' | 'TRAIL' | 'TRAILLMT';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'OPG';
export type OrderStatus =
  | 'Inactive'
  | 'PendingSubmit'
  | 'PreSubmitted'
  | 'Submitted'
  | 'Filled'
  | 'Cancelled';

export interface OrderParams {
  conid: number;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price?: number;
  auxPrice?: number;
  tif?: TimeInForce;
  outsideRTH?: boolean;
}

export interface Order {
  orderId: number;
  conid: number;
  symbol: string;
  name: string;
  side: OrderSide;
  quantity: number;
  filled: number;
  remaining: number;
  status: OrderStatus;
  orderType: string;
  price: string;
  avgPrice: string;
  tif: string;
  description: string;
}

export interface OrderReply {
  id: string;
  message: string[];
  isSuppressed: boolean;
  messageIds: string[];
}

export interface OrderResult {
  order_id: string;
  order_status: string;
}

// ─── Portfolio ─────────────────────────────────────────────────────
export interface Position {
  conid: number;
  symbol: string;
  position: number;
  marketPrice: number;
  marketValue: number;
  avgCost: number;
  unrealizedPnl: number;
  realizedPnl: number;
  currency: string;
  assetClass: string;
}

export interface AccountSummary {
  accountId: string;
  netLiquidity: number;
  availableFunds: number;
  buyingPower: number;
  totalCash: number;
  grossPosition: number;
  initMargin: number;
  maintMargin: number;
  cushion: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

export interface PortfolioPnL {
  dailyPnL: number;
  netLiquidity: number;
  unrealizedPnL: number;
  excessLiquidity: number;
  marketValue: number;
}

// ─── Session / Auth ────────────────────────────────────────────────
export interface AuthStatus {
  authenticated: boolean;
  competing: boolean;
  connected: boolean;
  message?: string;
}

export interface TickleResponse {
  session: string;
  ssoExpires: number;
  iserver: {
    authStatus: AuthStatus;
  };
}

// ─── Watchlist ─────────────────────────────────────────────────────
export interface WatchlistItem {
  conid: number;
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface WatchlistData {
  items: WatchlistItem[];
}
