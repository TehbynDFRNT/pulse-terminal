// ─── IBKR API Types ────────────────────────────────────────────────
// Mirrors the IBKR Client Portal API response shapes

import type { StreamingChartBeat } from './live-feed-types';

// ─── Market Data Field Tags ────────────────────────────────────────
export const MARKET_DATA_FIELDS = {
  LAST_PRICE: '31',
  SYMBOL: '55',
  COMPANY_NAME: '58',
  MD_AVAILABILITY: '6509',
  BID: '84',
  BID_SIZE: '88',
  ASK: '86',
  ASK_SIZE: '85',
  LAST_SIZE: '7059',
  CHANGE: '82',
  CHANGE_PCT: '83',
  VOLUME: '7282',
  DAY_LOW: '71',
  DAY_HIGH: '70',
  OPEN: '7295',
  PREV_CLOSE: '7741',
  CLOSE: '7296',
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
  rootConid?: number;
  contractMonth?: string;
  contractDisplay?: string;
  underlyingSymbol?: string;
}

export interface ScannerOption {
  code: string;
  label: string;
  instrumentTypes: string[];
  parentCode?: string;
  isLeaf?: boolean;
}

export interface ScannerFilterOption extends ScannerOption {
  group: string;
  valueType: string;
}

export interface ScannerParams {
  instruments: ScannerOption[];
  locations: ScannerOption[];
  scanTypes: ScannerOption[];
  filters: ScannerFilterOption[];
}

export interface ScannerFilterValue {
  code: string;
  value: string;
}

export interface ScannerRunRequest {
  instrument: string;
  location: string;
  scanType: string;
  filters?: ScannerFilterValue[];
}

export interface ScannerResult extends SearchResult {
  rank: number;
  scanLabel?: string;
  scanValue?: string;
  contractDescription?: string;
  availableChartPeriods?: string;
  metadata?: Record<string, string>;
  mdAvailability?: string;
  updated?: number;
  displayPrice?: number;
  displayChange?: number;
  displayChangePct?: string;
  marketDataStatus?: 'live' | 'delayed' | 'frozen' | 'unavailable' | 'unknown';
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
  displayPrice: number;
  displayChange: number;
  displayChangePct: string;
  displaySource: 'mid' | 'last' | 'bid' | 'ask' | 'none';
  symbol: string;
  companyName: string;
  mdAvailability: string;
  marketDataStatus: 'live' | 'delayed' | 'frozen' | 'unavailable' | 'unknown';
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
  hasLiveData: boolean;
}

export interface HistoricalBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartBootstrapResponse {
  conid: number;
  timeframeKey: string;
  resolutionKey: string;
  historyBars: HistoricalBar[];
  snapshot: MarketDataSnapshot | null;
  liveBeats?: StreamingChartBeat[];
  historyError?: string | null;
}

export type MarketSessionPhase =
  | 'regular'
  | 'extended'
  | 'closed'
  | 'unknown';

export interface MarketScheduleWindow {
  opening: number;
  closing: number;
  cancelDailyOrders: boolean;
}

export interface MarketScheduleDay {
  date: string;
  liquidHours: MarketScheduleWindow[];
  extendedHours: MarketScheduleWindow[];
}

export interface MarketScheduleState {
  phase: MarketSessionPhase;
  isOpen: boolean;
  isExtendedHours: boolean;
  nextChangeAt: number | null;
  nextRegularOpen: number | null;
  nextRegularClose: number | null;
  nextExtendedOpen: number | null;
  nextExtendedClose: number | null;
  lastRegularClose: number | null;
}

export interface MarketSchedule {
  conid: number;
  exchange: string | null;
  timezone: string;
  source: 'contract/trading-schedule';
  fetchedAt: number;
  days: MarketScheduleDay[];
  state: MarketScheduleState;
}

// ─── Orders ────────────────────────────────────────────────────────
export type OrderSide = 'BUY' | 'SELL';
export type TrailingType = 'amt' | '%';
export type KnownOrderType =
  | 'MKT'
  | 'LMT'
  | 'STP'
  | 'STOP_LIMIT'
  | 'MIDPRICE'
  | 'TRAIL'
  | 'TRAILLMT'
  | 'MIT'
  | 'LIT'
  | 'REL'
  | 'MOC'
  | 'LOC';
export type OrderType = KnownOrderType | (string & {});
export type KnownTimeInForce = 'DAY' | 'GTC' | 'IOC' | 'OPG' | 'GTD' | 'OVT' | 'OND';
export type TimeInForce = KnownTimeInForce | (string & {});
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
  quantity?: number;
  cashQty?: number;
  price?: number;
  auxPrice?: number;
  trailingAmt?: number;
  trailingType?: TrailingType;
  tif?: TimeInForce;
  outsideRTH?: boolean;
  manualIndicator?: boolean;
  extOperator?: string;
  secType?: string;
  listingExchange?: string;
}

export interface ContractOrderRuleSet {
  algoEligible: boolean;
  allOrNoneEligible: boolean;
  canTradeAcctIds: string[];
  cqtTypes: string[];
  cashQtyIncr: number | null;
  defaultSize: number | null;
  error: string | null;
  forceOrderPreview: boolean;
  fraqTypes: string[];
  increment: number | null;
  incrementDigits: number | null;
  orderDefaults: Record<string, Record<string, string>>;
  orderTypes: string[];
  orderTypesOutside: string[];
  overnightEligible: boolean;
  preview: boolean;
  sizeIncrement: number | null;
  tifDefaults: Record<string, string>;
  tifTypes: string[];
}

export interface ContractOrderInfo {
  conid: number;
  symbol: string;
  name: string;
  localSymbol: string;
  instrumentType: string;
  exchange: string;
  validExchanges: string[];
  currency: string;
  tradingClass: string;
  multiplier: number | null;
  regularTradingHoursOnly: boolean;
}

export interface OrderTypeOption {
  code: OrderType;
  label: string;
  raw: string;
  supportsOutsideRth: boolean;
  supportsCashQuantity: boolean;
  requiresLimitPrice: boolean;
  requiresStopPrice: boolean;
  priceLabel: string | null;
  priceRequired: boolean;
  priceAllowsZero: boolean;
  priceOptional: boolean;
  auxPriceLabel: string | null;
  auxPriceRequired: boolean;
  trailingLabel: string | null;
  trailingRequired: boolean;
  supportsTrailingPercent: boolean;
  uiSupported: boolean;
}

export interface TimeInForceOption {
  code: TimeInForce;
  label: string;
  raw: string;
  allowedOrderTypes: OrderType[];
}

export interface OrderTicket {
  contract: ContractOrderInfo;
  rules: ContractOrderRuleSet;
  orderTypes: OrderTypeOption[];
  unsupportedOrderTypes: OrderTypeOption[];
  tifOptions: TimeInForceOption[];
  defaultOrderType: OrderType;
  defaultTif: TimeInForce;
  defaultQuantity: number;
  quantityLabel: string;
  quantityStep: number;
  priceStep: number;
  priceDigits: number;
  supportsCashQuantity: boolean;
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

export interface TradeExecution {
  executionId: string;
  orderId: number;
  conid: number;
  symbol: string;
  cashFlowCurrency?: string | null;
  companyName: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  exchange: string;
  commission: number;
  netAmount: number;
  tradeTime: string;
  tradeTimeMs: number;
  description: string;
  secType: string;
  listingExchange: string;
  accountId: string;
}

export interface AccountTransactionRealizedPnlRow {
  cur: string;
  date: string;
  fxRate: number;
  side: string;
  positionSide: string;
  acctid: string;
  amt: number;
  conid: number;
}

export interface AccountTransactionRow {
  cur: string;
  date: string;
  rawDate: string;
  fxRate: number;
  pr: number;
  qty: number;
  acctid: string;
  amt: number;
  conid: number;
  type: string;
  desc: string;
}

export interface AccountTransactionsEnvelope {
  id: string;
  currency: string;
  from: number;
  to: number;
  nd: number | null;
  warning: string | null;
  accountId: string;
  conid: number;
  symbol: string;
  name: string;
  rpnl: {
    amount: number | null;
    data: AccountTransactionRealizedPnlRow[];
  } | null;
  transactions: AccountTransactionRow[];
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

export interface OrderMutationResponse extends OrderResult {
  replies: OrderReply[];
  suppressedMessageIds: string[];
}

export interface OrderPreviewAmount {
  amount: number | null;
  commission: number | null;
  total: number | null;
}

export interface OrderPreviewEffect {
  current: number | null;
  change: number | null;
  after: number | null;
}

export interface OrderWhatIfPreview {
  amount: OrderPreviewAmount;
  equity: OrderPreviewEffect;
  initial: OrderPreviewEffect;
  maintenance: OrderPreviewEffect;
  warning: string | null;
}

export interface OrderStatusDetail {
  orderId: number;
  conid: number;
  symbol: string;
  companyName: string;
  side: 'BUY' | 'SELL';
  size: number;
  totalSize: number;
  filled: number;
  remaining: number;
  currency: string;
  accountId: string;
  orderType: string;
  limitPrice: number | null;
  stopPrice: number | null;
  tif: string;
  orderStatus: string;
  orderStatusDescription: string;
  editable: boolean;
  canCancel: boolean;
  outsideRTH: boolean;
  listingExchange: string;
  secType: string;
  orderDescription: string;
  orderDescriptionWithContract: string;
  avgPrice: number | null;
  alertActive: boolean;
  orderTime: string;
}

export interface AccountAlertCondition {
  conidex: string;
  logicBind: 'a' | 'o' | 'n';
  operator: string;
  triggerMethod: string;
  type: number;
  value: string;
}

export interface AccountAlertCreateParams {
  alertName: string;
  alertMessage: string;
  alertRepeatable: 0 | 1;
  outsideRth: 0 | 1;
  sendMessage: 0 | 1;
  email?: string;
  iTWSOrdersOnly: 0 | 1;
  showPopup: 0 | 1;
  tif: 'GTC' | 'GTD';
  expireTime?: string;
  conditions: AccountAlertCondition[];
}

export interface AccountAlertSummary {
  alertId: number;
  accountId: string;
  name: string;
  active: boolean;
  orderTime: string;
  triggered: boolean;
  repeatable: boolean;
}

export interface AccountAlertDetail extends AccountAlertSummary {
  message: string | null;
  tif: string | null;
  expireTime: string | null;
  outsideRth: boolean;
  sendMessage: boolean;
  email: string | null;
  showPopup: boolean;
  conditions: AccountAlertCondition[];
  rawType: string | null;
}

export interface AccountAlertMutationResult {
  success: boolean;
  text: string;
  alertId: number | null;
  requestId: string | null;
}

export interface FyiNotification {
  id: string;
  receivedAt: number | null;
  headline: string;
  body: string;
  read: boolean;
  category: string;
}

export interface SecurityDefinition {
  conid: number;
  currency: string;
  name: string;
  assetClass: string;
  ticker: string;
  listingExchange: string;
  countryCode: string;
  allExchanges: string[];
  sector: string;
  group: string;
  sectorGroup: string;
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

export interface CashBalance {
  currency: string;
  cashBalance: number;
  settledCash: number;
  netLiquidationValue: number;
  exchangeRate: number;
  interest: number;
  baseEquivalent: number;
  unrealizedPnlBase: number;
  realizedPnlBase: number;
  entryBaseAmount: number | null;
  markToBasePnl: number | null;
  isBase: boolean;
}

export interface PortfolioPerformancePoint {
  time: number;
  value: number;
}

export interface PortfolioPerformanceSnapshot {
  value: number | null;
  updatedAt: number | null;
}

export interface PortfolioPerformanceResponse {
  accountId: string;
  baseCurrency: string;
  period: string;
  nd: number | null;
  warning: string | null;
  points: PortfolioPerformancePoint[];
  snapshot: PortfolioPerformanceSnapshot;
}

export interface PortfolioDecompositionBucket {
  key: string;
  label: string;
  value: number;
  weight: number;
  positions: number;
}

export interface PortfolioDecompositionResponse {
  accountId: string;
  baseCurrency: string | null;
  netLiquidity: number;
  grossExposure: number;
  assetClasses: PortfolioDecompositionBucket[];
  currencies: PortfolioDecompositionBucket[];
  sectors: PortfolioDecompositionBucket[];
  groups: PortfolioDecompositionBucket[];
}

export interface AccountActivityTotals {
  executions: number;
  symbols: number;
  grossBuy: number;
  grossSell: number;
  netAmount: number;
  commission: number;
}

export interface AccountActivitySymbolSummary {
  symbol: string;
  executions: number;
  grossBuy: number;
  grossSell: number;
  netAmount: number;
  commission: number;
  lastTradeAt: number;
}

export interface AccountActivityResponse {
  accountId: string;
  days: number;
  totals: AccountActivityTotals;
  bySymbol: AccountActivitySymbolSummary[];
  trades: TradeExecution[];
}

export interface InstrumentAvailability {
  key:
    | 'open-live'
    | 'open-delayed'
    | 'open-no-entitlement'
    | 'closed-cached'
    | 'closed-no-data'
    | 'historical-only'
    | 'unknown';
  label: string;
  entitled: boolean;
  venueOpen: boolean;
  hasQuote: boolean;
}

export interface InstrumentDiagnostics {
  conid: number;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string;
  updated: number | null;
  marketDataStatus: MarketDataSnapshot['marketDataStatus'];
  sessionPhase: MarketSessionPhase;
  entitled: boolean;
  hasQuote: boolean;
  availability: InstrumentAvailability;
}

export interface PortfolioAccountContext {
  accountId: string;
  selectedAccount: string;
  accounts: string[];
  isPaper: boolean;
}

export interface PortfolioSnapshot {
  account: PortfolioAccountContext;
  positions: Position[];
  summary: AccountSummary;
  pnl: PortfolioPnL | null;
  baseCurrency: string | null;
  cashBalances: CashBalance[];
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

export interface WatchlistStateData extends WatchlistData {
  prices?: MarketDataSnapshot[];
}
