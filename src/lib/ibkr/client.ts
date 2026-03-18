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
  mockScannerParams,
  mockRunScanner,
  mockMarketSchedule,
  mockSnapshot,
  mockOrders,
  mockTransactionsEnvelope,
  mockPositions,
  mockAccountSummary,
  mockPortfolioPnL,
  mockPortfolioPerformance,
  mockCashBalances,
  mockAuthStatus,
} from './mock-data';
import type {
  SearchResult,
  ScannerFilterValue,
  ScannerParams,
  ScannerResult,
  ScannerRunRequest,
  ContractInfo,
  ContractOrderInfo,
  ContractOrderRuleSet,
  OrderTicket,
  MarketDataSnapshot,
  MarketSchedule,
  HistoricalBar,
  OrderParams,
  Order,
  OrderMutationResponse,
  OrderPreviewEffect,
  OrderPreviewAmount,
  OrderReply,
  OrderStatusDetail,
  OrderWhatIfPreview,
  TradeExecution,
  AccountTransactionsEnvelope,
  AccountAlertCreateParams,
  AccountAlertDetail,
  AccountAlertMutationResult,
  AccountAlertSummary,
  FyiNotification,
  Position,
  AccountSummary,
  PortfolioPnL,
  CashBalance,
  PortfolioPerformanceResponse,
  AuthStatus,
  SecurityDefinition,
  PortfolioDecompositionResponse,
  AccountActivityResponse,
  InstrumentDiagnostics,
  MARKET_DATA_FIELDS,
} from './types';
import { WATCHLIST_FIELD_LIST } from './types';
import { buildOrderTicket } from './order-ticket';
import { canonicalizeOrderType, canonicalizeTimeInForce } from './order-ticket';
import { normalizeMarketSchedule } from './market-schedule';
import { getDisplayPrice } from './display-price';
import { buildAccountActivity } from './account-activity';
import { buildPortfolioDecomposition } from './portfolio-decomposition';
import { deriveInstrumentAvailability } from './instrument-availability';
import {
  buildInstrumentSearchQueries,
  compactInstrumentSearchText,
  normalizeInstrumentSearchText,
  parseExplicitFutureQuery,
  type ExplicitFutureQuery,
} from './search-query';

// ─── Config ────────────────────────────────────────────────────────

function getConfig() {
  const gatewayUrl = canonicalizeGatewayUrl(
    process.env.IBKR_GATEWAY_URL || 'https://localhost:5050'
  );
  const basePath = process.env.IBKR_BASE_PATH || '/v1/api';
  return {
    baseUrl: `${gatewayUrl}${basePath}`,
    isMock: process.env.IBKR_MOCK_MODE === 'true',
    accountId: process.env.IBKR_ACCOUNT_ID || '',
  };
}

function canonicalizeGatewayUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === '127.0.0.1' || url.hostname === '::1') {
      url.hostname = 'localhost';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return value.replace('127.0.0.1', 'localhost').replace('[::1]', 'localhost').replace(/\/+$/, '');
  }
}

const SCANNER_PARAMS_TTL_MS = 15 * 60 * 1000;
const MARKET_SCHEDULE_TTL_MS = 30 * 60 * 1000;
const ORDER_TICKET_TTL_MS = 10 * 60 * 1000;
const HISTORY_SKIP_TTL_MS = 5 * 60 * 1000;
const TRANSACTIONS_TTL_MS = 15 * 60 * 1000;
const PORTFOLIO_PERFORMANCE_TTL_MS = 15 * 60 * 1000;
const ACCOUNTS_TTL_MS = 60 * 1000;
const PORTFOLIO_SLICE_TTL_MS = 5 * 1000;
const RECENT_TRADES_TTL_MS = 30 * 1000;
const SECURITY_DEFINITION_TTL_MS = 60 * 60 * 1000;
const FUTURE_SEARCH_VARIANT_TTL_MS = 24 * 60 * 60 * 1000;
const FUTURE_SEARCH_VARIANT_LIMIT = 4;
const FUTURE_SEARCH_PROBE_MONTH_COUNT = 12;
const FUTURE_SEARCH_EXCHANGES = new Set([
  'CBOT',
  'CFE',
  'CME',
  'COMEX',
  'EUREX',
  'HKFE',
  'ICEUS',
  'IPE',
  'MGE',
  'NYMEX',
  'OSE.JPN',
  'SGX',
  'TOCOM',
]);
const futureSearchVariantCache = new Map<
  string,
  {
    data: SearchResult | null;
    timestamp: number;
  }
>();
let scannerParamsCache:
  | {
      data: ScannerParams;
      timestamp: number;
    }
  | null = null;
const marketScheduleCache = new Map<
  string,
  {
    data: MarketSchedule;
    timestamp: number;
  }
>();
const orderTicketCache = new Map<
  string,
  {
    data: OrderTicket;
    timestamp: number;
  }
>();
const historySkipCache = new Map<string, number>();
const transactionsCache = new Map<
  string,
  {
    data: AccountTransactionsEnvelope;
    timestamp: number;
  }
>();
const portfolioPerformanceCache = new Map<
  string,
  {
    data: PortfolioPerformanceResponse;
    timestamp: number;
  }
>();
let accountsCache:
  | {
      data: { accounts: string[]; selectedAccount: string; isPaper: boolean };
      timestamp: number;
    }
  | null = null;
let accountsInflight:
  | Promise<{ accounts: string[]; selectedAccount: string; isPaper: boolean }>
  | null = null;
let positionsCache:
  | {
      data: Position[];
      timestamp: number;
    }
  | null = null;
let positionsInflight: Promise<Position[]> | null = null;
let accountSummaryCache:
  | {
      data: AccountSummary;
      timestamp: number;
    }
  | null = null;
let accountSummaryInflight: Promise<AccountSummary> | null = null;
let portfolioPnLCache:
  | {
      data: PortfolioPnL;
      timestamp: number;
    }
  | null = null;
let portfolioPnLInflight: Promise<PortfolioPnL> | null = null;
let cashBalancesCache:
  | {
      data: {
        baseCurrency: string | null;
        cashBalances: CashBalance[];
      };
      timestamp: number;
    }
  | null = null;
let cashBalancesInflight:
  | Promise<{
      baseCurrency: string | null;
      cashBalances: CashBalance[];
    }>
  | null = null;
const recentTradesCache = new Map<
  number,
  {
    data: TradeExecution[];
    timestamp: number;
  }
>();
const recentTradesInflight = new Map<number, Promise<TradeExecution[]>>();
const securityDefinitionCache = new Map<
  number,
  {
    data: SecurityDefinition;
    timestamp: number;
  }
>();

// ─── HTTP Wrapper ──────────────────────────────────────────────────

async function ibkrFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  const { baseUrl } = getConfig();
  const url = `${baseUrl}${path}`;

  console.log(`[ibkr] → ${path}`);
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'pulse-terminal/1.0',
      ...options.headers,
    },
  });
  console.log(`[ibkr] ← ${path} ${res.status}`);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new IbkrRequestError(res.status, text || res.statusText);
  }

  return res.json() as Promise<T>;
}

async function ibkrFetchText(
  path: string,
  options: RequestInit = {}
): Promise<string> {
  const { baseUrl } = getConfig();
  const url = `${baseUrl}${path}`;

  console.log(`[ibkr] → ${path}`);
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'pulse-terminal/1.0',
      ...options.headers,
    },
  });
  console.log(`[ibkr] ← ${path} ${res.status}`);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new IbkrRequestError(res.status, text || res.statusText);
  }

  return res.text();
}

export class IbkrRequestError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string) {
    super(`IBKR API ${status}: ${responseText}`);
    this.name = 'IbkrRequestError';
    this.status = status;
    this.responseText = responseText;
  }
}

function containsIbkrEmptyResponseMessage(value: string) {
  return value.toLowerCase().includes('finished: empty response is received');
}

export function isIbkrEmptyResponseError(error: unknown): boolean {
  if (error instanceof IbkrRequestError) {
    return containsIbkrEmptyResponseMessage(error.responseText);
  }

  if (error instanceof Error) {
    return containsIbkrEmptyResponseMessage(error.message);
  }

  return false;
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

  if (accountsCache && Date.now() - accountsCache.timestamp < ACCOUNTS_TTL_MS) {
    return accountsCache.data;
  }

  if (accountsInflight) {
    return accountsInflight;
  }

  const request = ibkrFetch<{
    accounts: string[];
    selectedAccount: string;
    isPaper: boolean;
  }>('/iserver/accounts')
    .then((data) => {
      accountsCache = {
        data,
        timestamp: Date.now(),
      };
      return data;
    })
    .finally(() => {
      accountsInflight = null;
    });

  accountsInflight = request;
  return request;
}

export async function getPortfolioAccountContext() {
  const accounts = await getAccounts();
  return {
    accountId: accounts.selectedAccount,
    selectedAccount: accounts.selectedAccount,
    accounts: accounts.accounts,
    isPaper: accounts.isPaper,
  };
}

// ─── Contract Search ───────────────────────────────────────────────

interface IbkrSearchRow {
  conid: number | string;
  companyName: string | null;
  companyHeader?: string;
  symbol?: string;
  description: string | null;
  secType?: string;
  sections?: Array<{
    secType: string;
    exchange?: string;
    months?: string;
  }>;
}

export async function searchInstruments(
  query: string,
  secType?: string
): Promise<SearchResult[]> {
  if (getConfig().isMock) return mockSearch(query);

  const cached = conidCache.getSearch(query, secType);
  if (cached) return cached;

  const variantQueries = buildInstrumentSearchQueries(query);
  const rawResults: IbkrSearchRow[] = [];

  for (const variantQuery of variantQueries) {
    rawResults.push(...(await fetchInstrumentSearchRows(variantQuery, secType)));

    if (secType?.toUpperCase() === 'FUT') {
      rawResults.push(...(await fetchInstrumentSearchRows(variantQuery)));
    }
  }

  const results = dedupeIbkrSearchRows(rawResults);

  if (results.length === 0) {
    conidCache.setSearch(query, [], secType);
    return [];
  }

  const explicitFuture = parseExplicitFutureQuery(query);

  const baseResults: SearchResult[] = results
    .filter((r) => r.companyName != null || r.companyHeader != null)
    .map((r) => {
      const conid =
        typeof r.conid === 'string' ? parseInt(r.conid, 10) : r.conid;

      // Parse exchange from companyHeader "APPLE INC (NASDAQ)" or description
      const headerMatch = r.companyHeader?.match(/\(([^)]+)\)$/);
      const exchange = headerMatch?.[1] || r.description || '';
      // Collect all exchanges from sections that have them
      const allExchanges = r.sections
        ?.filter((s) => s.exchange)
        .flatMap((s) => s.exchange!.split(';'))
        .filter(Boolean);
      // secType from top-level or first section
      const type = r.secType || r.sections?.[0]?.secType || 'STK';

      return {
        conid,
        name: r.companyName || r.companyHeader?.replace(/\s*\([^)]+\)$/, '') || '',
        symbol: r.symbol || '',
        exchange,
        type,
        allExchanges,
      };
    })
    // IBKR sometimes returns placeholder rows with conid -1; they are not tradable
    // and break React key stability in the search dropdowns.
    .filter((r) => Number.isFinite(r.conid) && r.conid > 0);

  const futureVariants = await resolveFutureSearchVariants(
    results,
    query,
    secType,
    explicitFuture
  );
  const combinedResults =
    secType?.toUpperCase() === 'FUT'
      ? futureVariants
      : explicitFuture && futureVariants.length > 0
        ? futureVariants
        : [...futureVariants, ...baseResults];
  const mapped = sortSearchResults(
    dedupeSearchResults(combinedResults),
    query,
    secType,
    explicitFuture
  );

  conidCache.setSearch(query, mapped, secType);
  return mapped;
}

export async function getScannerParams(): Promise<ScannerParams> {
  if (getConfig().isMock) return mockScannerParams();

  if (
    scannerParamsCache &&
    Date.now() - scannerParamsCache.timestamp < SCANNER_PARAMS_TTL_MS
  ) {
    return scannerParamsCache.data;
  }

  const raw = await ibkrFetchText('/iserver/scanner/params');
  const parsed = parseScannerParams(raw);
  scannerParamsCache = { data: parsed, timestamp: Date.now() };
  return parsed;
}

export async function runScanner(
  request: ScannerRunRequest
): Promise<ScannerResult[]> {
  if (getConfig().isMock) return mockRunScanner(request);

  const scannerRequestBody = JSON.stringify({
    instrument: request.instrument,
    location: request.location,
    type: request.scanType,
    filter: (request.filters ?? []).map((filter) => ({
      code: filter.code,
      value: filter.value,
    })),
  });

  let raw: unknown;

  try {
    raw = await ibkrFetch<unknown>('/iserver/scanner/run', {
      method: 'POST',
      body: scannerRequestBody,
    });
  } catch (error) {
    if (!isIbkrEmptyResponseError(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    raw = await ibkrFetch<unknown>('/iserver/scanner/run', {
      method: 'POST',
      body: scannerRequestBody,
    });
  }

  const results = normalizeScannerResults(raw, request.instrument);

  if (results.length === 0) {
    return results;
  }

  try {
    const conids = results.map((result) => result.conid);
    let snapshots = await getMarketDataSnapshot(conids);

    if (snapshots.length > 0 && snapshots.every((snapshot) => !snapshot.mdAvailability)) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      snapshots = await getMarketDataSnapshot(conids);
    }

    const snapshotsByConid = new Map(
      snapshots.map((snapshot) => [snapshot.conid, snapshot] as const)
    );

    return results.map((result) => {
      const snapshot = snapshotsByConid.get(result.conid);
      if (!snapshot) return result;
      const derivedScanValue = deriveScannerValueFromSnapshot(result.scanLabel, snapshot);
      return {
        ...result,
        scanValue: coalesceScannerValue(result.scanValue, derivedScanValue),
        mdAvailability: snapshot.mdAvailability,
        updated: snapshot.updated,
        displayPrice: snapshot.displayPrice,
        displayChange: snapshot.displayChange,
        displayChangePct: snapshot.displayChangePct,
        marketDataStatus: snapshot.marketDataStatus,
      };
    });
  } catch (err) {
    console.warn('[ibkr] scanner snapshot enrichment failed', err);
    return results;
  }
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

export async function getSecurityDefinitions(
  conids: number[]
): Promise<SecurityDefinition[]> {
  const uniqueConids = Array.from(
    new Set(conids.filter((conid) => Number.isFinite(conid) && conid > 0))
  );
  if (uniqueConids.length === 0) return [];

  const fresh = uniqueConids
    .map((conid) => {
      const cached = securityDefinitionCache.get(conid);
      if (!cached) return null;
      if (Date.now() - cached.timestamp > SECURITY_DEFINITION_TTL_MS) {
        securityDefinitionCache.delete(conid);
        return null;
      }
      return cached.data;
    })
    .filter((entry): entry is SecurityDefinition => entry != null);

  const missing = uniqueConids.filter((conid) => !securityDefinitionCache.has(conid));
  if (missing.length === 0) {
    return fresh;
  }

  if (getConfig().isMock) {
    const definitions = missing.map((conid) => ({
      conid,
      currency: 'USD',
      name: `Contract ${conid}`,
      assetClass: 'STK',
      ticker: `C${conid}`,
      listingExchange: 'SMART',
      countryCode: 'US',
      allExchanges: ['SMART'],
      sector: 'Mock',
      group: 'Mock',
      sectorGroup: 'Mock',
    }));
    for (const definition of definitions) {
      securityDefinitionCache.set(definition.conid, {
        data: definition,
        timestamp: Date.now(),
      });
    }
    return [...fresh, ...definitions];
  }

  const chunks: number[][] = [];
  for (let index = 0; index < missing.length; index += 200) {
    chunks.push(missing.slice(index, index + 200));
  }

  const fetched: SecurityDefinition[] = [];
  for (const chunk of chunks) {
    const raw = await ibkrFetch<{
      secdef?: Array<{
        conid?: number | string;
        currency?: string;
        name?: string;
        assetClass?: string;
        ticker?: string;
        listingExchange?: string;
        countryCode?: string;
        allExchanges?: string;
        sector?: string;
        group?: string;
        sectorGroup?: string;
      }>;
    }>(`/trsrv/secdef?conids=${chunk.join(',')}`);

    for (const item of raw.secdef || []) {
      const conid = Number(item.conid || 0);
      if (!(conid > 0)) continue;
      const definition: SecurityDefinition = {
        conid,
        currency: String(item.currency || ''),
        name: String(item.name || ''),
        assetClass: String(item.assetClass || ''),
        ticker: String(item.ticker || ''),
        listingExchange: String(item.listingExchange || ''),
        countryCode: String(item.countryCode || ''),
        allExchanges: String(item.allExchanges || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        sector: String(item.sector || ''),
        group: String(item.group || ''),
        sectorGroup: String(item.sectorGroup || ''),
      };
      securityDefinitionCache.set(conid, {
        data: definition,
        timestamp: Date.now(),
      });
      fetched.push(definition);
    }
  }

  return [...fresh, ...fetched];
}

export async function getOrderTicket(
  conid: number,
  side: 'BUY' | 'SELL' = 'BUY'
): Promise<OrderTicket> {
  const cacheKey = `${conid}:${side}`;
  const cached = orderTicketCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ORDER_TICKET_TTL_MS) {
    return cached.data;
  }

  if (getConfig().isMock) {
    const info = await getContractInfo(conid);
    const ticket = buildOrderTicket(
      {
        conid: info.conid,
        symbol: info.symbol,
        name: info.name,
        localSymbol: info.symbol,
        instrumentType: info.type,
        exchange: info.exchange,
        validExchanges: info.validExchanges,
        currency: info.currency,
        tradingClass: info.symbol,
        multiplier: info.multiplier || null,
        regularTradingHoursOnly: true,
      },
      {
        algoEligible: false,
        allOrNoneEligible: false,
        canTradeAcctIds: [],
        cqtTypes: [],
        cashQtyIncr: null,
        defaultSize: 1,
        error: null,
        forceOrderPreview: false,
        fraqTypes: [],
        increment: 0.01,
        incrementDigits: 2,
        orderDefaults: {},
        orderTypes: ['market', 'limit', 'stop', 'stop_limit'],
        orderTypesOutside: ['limit', 'stop_limit'],
        overnightEligible: false,
        preview: true,
        sizeIncrement: 1,
        tifDefaults: { TIF: 'DAY', SIZE: '1' },
        tifTypes: ['DAY/o,a', 'GTC/o,a', 'IOC/MARKET,LIMIT,a'],
      }
    );
    orderTicketCache.set(cacheKey, { data: ticket, timestamp: Date.now() });
    return ticket;
  }

  const raw = await ibkrFetch<{
    con_id: number;
    symbol: string;
    company_name: string;
    local_symbol?: string;
    instrument_type: string;
    exchange: string;
    valid_exchanges?: string;
    currency: string;
    trading_class?: string;
    multiplier?: string | null;
    r_t_h?: boolean;
    rules: {
      algoEligible?: boolean;
      allOrNoneEligible?: boolean;
      canTradeAcctIds?: string[];
      cqtTypes?: string[];
      cashQtyIncr?: number | null;
      defaultSize?: number | null;
      error?: string | null;
      forceOrderPreview?: boolean;
      fraqTypes?: string[];
      increment?: number | null;
      incrementDigits?: number | null;
      orderDefaults?: Record<string, Record<string, string>>;
      orderTypes?: string[];
      orderTypesOutside?: string[];
      overnightEligible?: boolean;
      preview?: boolean;
      sizeIncrement?: number | null;
      tifDefaults?: Record<string, string>;
      tifTypes?: string[];
    };
  }>(`/iserver/contract/${conid}/info-and-rules?isBuy=${String(side === 'BUY')}`);

  const contract: ContractOrderInfo = {
    conid: raw.con_id,
    symbol: raw.symbol,
    name: raw.company_name,
    localSymbol: raw.local_symbol || raw.symbol,
    instrumentType: raw.instrument_type,
    exchange: raw.exchange,
    validExchanges: raw.valid_exchanges?.split(',').filter(Boolean) || [],
    currency: raw.currency,
    tradingClass: raw.trading_class || raw.symbol,
    multiplier: raw.multiplier ? Number(raw.multiplier) : null,
    regularTradingHoursOnly: Boolean(raw.r_t_h),
  };

  const rules: ContractOrderRuleSet = {
    algoEligible: Boolean(raw.rules?.algoEligible),
    allOrNoneEligible: Boolean(raw.rules?.allOrNoneEligible),
    canTradeAcctIds: raw.rules?.canTradeAcctIds || [],
    cqtTypes: raw.rules?.cqtTypes || [],
    cashQtyIncr: raw.rules?.cashQtyIncr ?? null,
    defaultSize: raw.rules?.defaultSize ?? null,
    error: raw.rules?.error ?? null,
    forceOrderPreview: Boolean(raw.rules?.forceOrderPreview),
    fraqTypes: raw.rules?.fraqTypes || [],
    increment: raw.rules?.increment ?? null,
    incrementDigits: raw.rules?.incrementDigits ?? null,
    orderDefaults: raw.rules?.orderDefaults || {},
    orderTypes: raw.rules?.orderTypes || [],
    orderTypesOutside: raw.rules?.orderTypesOutside || [],
    overnightEligible: Boolean(raw.rules?.overnightEligible),
    preview: Boolean(raw.rules?.preview),
    sizeIncrement: raw.rules?.sizeIncrement ?? null,
    tifDefaults: raw.rules?.tifDefaults || {},
    tifTypes: raw.rules?.tifTypes || [],
  };

  const ticket = buildOrderTicket(contract, rules);
  orderTicketCache.set(cacheKey, { data: ticket, timestamp: Date.now() });
  return ticket;
}

// ─── Market Data ───────────────────────────────────────────────────

export async function getMarketDataSnapshot(
  conids: number[]
): Promise<MarketDataSnapshot[]> {
  if (getConfig().isMock) return mockSnapshot(conids);

  const url = `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${WATCHLIST_FIELD_LIST}`;
  const raw = await ibkrFetch<Array<Record<string, string | number>>>(url);

  return raw.map((item) => {
    const marketDataStatus = parseMarketDataStatus(item['6509']);
    const last = parseNumericField(item['31']);
    const bid = parseNumericField(item['84']);
    const ask = parseNumericField(item['86']);
    const change = parseChange(String(item['82'] || '0'));
    const changePct = String(item['83'] || '0%');
    const prevClose = parseNumericField(item['7741'] ?? item['7296']);
    const display = getDisplayPrice({
      last,
      bid,
      ask,
      prevClose,
      change,
      changePct,
    });

    return {
      conid: item.conid as number,
      last,
      displayPrice: display.displayPrice,
      displayChange: display.displayChange,
      displayChangePct: display.displayChangePct,
      displaySource: display.displaySource,
      symbol: String(item['55'] || ''),
      companyName: String(item['58'] || ''),
      mdAvailability: String(item['6509'] || ''),
      marketDataStatus,
      bid,
      bidSize: Math.round(parseNumericField(item['88'])),
      ask,
      askSize: Math.round(parseNumericField(item['85'])),
      change,
      changePct,
      volume: Math.round(parseNumericField(item['7282_raw'] ?? item['7282'])),
      dayLow: parseNumericField(item['71']),
      dayHigh: parseNumericField(item['70']),
      open: parseNumericField(item['7295']),
      prevClose,
      updated: item._updated as number,
      hasLiveData: marketDataStatus === 'live',
    };
  });
}

export async function getMarketSchedule(
  conid: number,
  exchange?: string
): Promise<MarketSchedule> {
  if (getConfig().isMock) return mockMarketSchedule(conid, exchange);

  const cacheKey = `${conid}:${exchange ?? ''}`;
  const cached = marketScheduleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MARKET_SCHEDULE_TTL_MS) {
    return cached.data;
  }

  const params = new URLSearchParams({
    conid: String(conid),
  });
  if (exchange) params.set('exchange', exchange);

  const raw = await ibkrFetch<{
    exchange_time_zone?: string;
    schedules?: Record<
      string,
      {
        liquid_hours?: Array<{
          opening?: number | string;
          closing?: number | string;
          cancel_daily_orders?: boolean;
        }>;
        extended_hours?: Array<{
          opening?: number | string;
          closing?: number | string;
          cancel_daily_orders?: boolean;
        }>;
      }
    >;
  }>(`/contract/trading-schedule?${params}`);

  const normalized = normalizeMarketSchedule(raw, conid, exchange);
  marketScheduleCache.set(cacheKey, {
    data: normalized,
    timestamp: Date.now(),
  });
  return normalized;
}

export async function getHistoricalData(
  conid: number,
  period = '1d',
  bar = '5min',
  outsideRth = true
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

  const historyKey = `${conid}:${period}:${bar}:${outsideRth ? '1' : '0'}`;
  const skippedAt = historySkipCache.get(historyKey);
  if (skippedAt && Date.now() - skippedAt < HISTORY_SKIP_TTL_MS) {
    throw new Error('History request temporarily unavailable');
  }

  const params = new URLSearchParams({
    conid: String(conid),
    period,
    bar,
    outsideRth: String(outsideRth),
    barType: 'last',
  });

  let data: {
    volumeFactor?: number;
    data: Array<{ o: number; c: number; h: number; l: number; v: number; t: number }>;
  };

  try {
    data = await ibkrFetch<{
      volumeFactor?: number;
      data: Array<{ o: number; c: number; h: number; l: number; v: number; t: number }>;
    }>(
      `/iserver/marketdata/history?${params}`,
      {},
      6000
    );
    historySkipCache.delete(historyKey);
  } catch (error) {
    if (shouldTemporarilySkipHistoryRequest(error)) {
      historySkipCache.set(historyKey, Date.now());
    }
    throw error;
  }

  return data.data.map((b) => ({
    time: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v * (data.volumeFactor ?? 1),
  }));
}

function shouldTemporarilySkipHistoryRequest(error: unknown): boolean {
  if (error instanceof IbkrRequestError) {
    if (error.status === 503 || error.status === 504) return true;
    const message = error.responseText.toLowerCase();
    return (
      message.includes('service unavailable') ||
      message.includes('no data') ||
      message.includes('no historical data')
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timed out') ||
      message.includes('service unavailable') ||
      message.includes('no data') ||
      message.includes('no historical data')
    );
  }

  return false;
}

// ─── Orders ────────────────────────────────────────────────────────

async function getTradingAccountId() {
  const configuredAccountId = getConfig().accountId;
  if (configuredAccountId) return configuredAccountId;
  return (await getPortfolioAccountContext()).accountId;
}

function mapOrderReply(raw: Record<string, unknown>): OrderReply | null {
  const id = raw.id;
  const message = raw.message;
  if (typeof id !== 'string' || !Array.isArray(message)) return null;
  return {
    id,
    message: message.map((entry) => String(entry)),
    isSuppressed: Boolean(raw.isSuppressed),
    messageIds: Array.isArray(raw.messageIds)
      ? raw.messageIds.map((entry) => String(entry))
      : [],
  };
}

function buildOrderEnvelope(params: OrderParams) {
  return {
    orders: [
      {
        conid: params.conid,
        orderType: params.orderType,
        side: params.side,
        quantity: params.quantity,
        tif: params.tif || 'DAY',
        outsideRTH: params.outsideRTH || false,
        cOID: `pulse-${Date.now()}`,
        ...(params.cashQty != null && { cashQty: params.cashQty }),
        ...(params.price != null && { price: params.price }),
        ...(params.auxPrice != null && { auxPrice: params.auxPrice }),
        ...(params.trailingAmt != null && { trailingAmt: params.trailingAmt }),
        ...(params.trailingType && { trailingType: params.trailingType }),
        ...(params.manualIndicator != null && { manualIndicator: params.manualIndicator }),
        ...(params.extOperator && { extOperator: params.extOperator }),
        ...(params.secType && { secType: `${params.conid}:${params.secType}` }),
        ...(params.listingExchange && { listingExchange: params.listingExchange }),
      },
    ],
  };
}

async function confirmOrderReply(
  replyId: string,
  replies: OrderReply[]
): Promise<OrderMutationResponse> {
  const res = await ibkrFetch<OrderMutationResponse | Array<Record<string, unknown>>>(
    `/iserver/reply/${replyId}`,
    { method: 'POST', body: JSON.stringify({ confirmed: true }) }
  );

  if (Array.isArray(res)) {
    const nextReply = mapOrderReply(res[0] || {});
    if (nextReply) {
      replies.push(nextReply);
      return confirmOrderReply(nextReply.id, replies);
    }
  }

  const result = res as OrderMutationResponse;
  return {
    ...result,
    replies,
    suppressedMessageIds: Array.from(
      new Set(replies.flatMap((reply) => reply.messageIds))
    ),
  };
}

async function submitOrderMutation(
  path: string,
  options: RequestInit
): Promise<OrderMutationResponse> {
  const res = await ibkrFetch<OrderMutationResponse | Array<Record<string, unknown>>>(
    path,
    options
  );

  if (Array.isArray(res)) {
    const firstReply = mapOrderReply(res[0] || {});
    if (firstReply) {
      return confirmOrderReply(firstReply.id, [firstReply]);
    }
  }

  const result = res as OrderMutationResponse;
  return {
    ...result,
    replies: [],
    suppressedMessageIds: [],
  };
}

function parseOrderPreviewAmount(raw: Record<string, unknown>): OrderPreviewAmount {
  return {
    amount: parseIbkrPreviewNumber(raw.amount),
    commission: parseIbkrPreviewNumber(raw.commission),
    total: parseIbkrPreviewNumber(raw.total),
  };
}

function parseOrderPreviewEffect(raw: Record<string, unknown>): OrderPreviewEffect {
  return {
    current: parseIbkrPreviewNumber(raw.current),
    change: parseIbkrPreviewNumber(raw.change),
    after: parseIbkrPreviewNumber(raw.after),
  };
}

function parseIbkrPreviewNumber(value: unknown): number | null {
  if (value == null) return null;

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.+-]/g, '');

  if (!cleaned) return null;

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function placeOrder(
  params: OrderParams
): Promise<OrderMutationResponse> {
  if (getConfig().isMock) {
    return {
      order_id: String(Date.now()),
      order_status: 'Submitted',
      replies: [],
      suppressedMessageIds: [],
    };
  }

  const accountId = await getTradingAccountId();
  return submitOrderMutation(
    `/iserver/account/${accountId}/orders`,
    { method: 'POST', body: JSON.stringify(buildOrderEnvelope(params)) }
  );
}

export async function cancelOrder(orderId: string): Promise<{ msg: string }> {
  if (getConfig().isMock) {
    return { msg: 'Request was submitted' };
  }

  const accountId = await getTradingAccountId();
  return ibkrFetch(`/iserver/account/${accountId}/order/${orderId}`, {
    method: 'DELETE',
  });
}

export async function previewOrder(
  params: OrderParams
): Promise<OrderWhatIfPreview> {
  if (getConfig().isMock) {
    return {
      amount: { amount: 0, commission: 0, total: 0 },
      equity: { current: 0, change: 0, after: 0 },
      initial: { current: 0, change: 0, after: 0 },
      maintenance: { current: 0, change: 0, after: 0 },
      warning: null,
    };
  }

  const accountId = await getTradingAccountId();
  const raw = await ibkrFetch<{
    amount?: Record<string, unknown>;
    equity?: Record<string, unknown>;
    initial?: Record<string, unknown>;
    maintenance?: Record<string, unknown>;
    warn?: string;
  }>(`/iserver/account/${accountId}/orders/whatif`, {
    method: 'POST',
    body: JSON.stringify(buildOrderEnvelope(params)),
  });

  return {
    amount: parseOrderPreviewAmount(raw.amount || {}),
    equity: parseOrderPreviewEffect(raw.equity || {}),
    initial: parseOrderPreviewEffect(raw.initial || {}),
    maintenance: parseOrderPreviewEffect(raw.maintenance || {}),
    warning: raw.warn ? String(raw.warn) : null,
  };
}

export async function getOrderStatus(
  orderId: string | number
): Promise<OrderStatusDetail> {
  if (getConfig().isMock) {
    return {
      orderId: Number(orderId),
      conid: 0,
      symbol: 'MOCK',
      companyName: 'Mock Contract',
      side: 'BUY',
      size: 1,
      totalSize: 1,
      filled: 0,
      remaining: 1,
      currency: 'USD',
      accountId: 'U1234567',
      orderType: 'MKT',
      limitPrice: null,
      stopPrice: null,
      tif: 'DAY',
      orderStatus: 'Submitted',
      orderStatusDescription: 'Submitted',
      editable: true,
      canCancel: true,
      outsideRTH: false,
      listingExchange: 'SMART',
      secType: 'STK',
      orderDescription: 'Buy 1 MOCK Market DAY',
      orderDescriptionWithContract: 'Buy 1 MOCK Market DAY',
      avgPrice: null,
      alertActive: false,
      orderTime: '',
    };
  }

  const raw = await ibkrFetch<Record<string, unknown>>(
    `/iserver/account/order/status/${orderId}`
  );

  const totalSize = Number(raw.total_size || raw.size || 0);
  const filled = Number(raw.cum_fill || 0);

  return {
    orderId: Number(raw.order_id || orderId),
    conid: Number(raw.conid || 0),
    symbol: String(raw.symbol || raw.contract_description_1 || ''),
    companyName: String(raw.company_name || ''),
    side: String(raw.side || 'B') === 'S' ? 'SELL' : 'BUY',
    size: Number(raw.size || 0),
    totalSize,
    filled,
    remaining: Math.max(totalSize - filled, 0),
    currency: String(raw.currency || ''),
    accountId: String(raw.account || ''),
    orderType: canonicalizeOrderType(String(raw.order_type || 'MKT')),
    limitPrice:
      raw.limit_price == null || raw.limit_price === ''
        ? null
        : Number(raw.limit_price),
    stopPrice:
      raw.stop_price == null || raw.stop_price === ''
        ? null
        : Number(raw.stop_price),
    tif: canonicalizeTimeInForce(String(raw.tif || 'DAY')),
    orderStatus: String(raw.order_status || ''),
    orderStatusDescription: String(raw.order_status_description || ''),
    editable: !Boolean(raw.order_not_editable),
    canCancel: !Boolean(raw.cannot_cancel_order),
    outsideRTH: Boolean(raw.outside_rth),
    listingExchange: String(raw.listing_exchange || ''),
    secType: String(raw.sec_type || ''),
    orderDescription: String(raw.order_description || ''),
    orderDescriptionWithContract: String(
      raw.order_description_with_contract || raw.order_description || ''
    ),
    avgPrice:
      raw.avg_price == null || raw.avg_price === ''
        ? null
        : Number(raw.avg_price),
    alertActive: Boolean(raw.alert_active),
    orderTime: String(raw.order_time || ''),
  };
}

export async function modifyOrder(
  orderId: string | number,
  updates: Partial<OrderParams>
): Promise<OrderMutationResponse> {
  if (getConfig().isMock) {
    return {
      order_id: String(orderId),
      order_status: 'Submitted',
      replies: [],
      suppressedMessageIds: [],
    };
  }

  const [accountId, current] = await Promise.all([
    getTradingAccountId(),
    getOrderStatus(orderId),
  ]);

  const body: Record<string, unknown> = {
    conid: current.conid,
    orderType: updates.orderType || current.orderType,
    side: updates.side || current.side,
    quantity: updates.quantity ?? current.totalSize,
    tif: updates.tif || current.tif,
    outsideRTH: updates.outsideRTH ?? current.outsideRTH,
  };

  const limitPrice = updates.price ?? current.limitPrice;
  const stopPrice = updates.auxPrice ?? current.stopPrice;
  if (limitPrice != null) body.price = limitPrice;
  if (stopPrice != null) body.auxPrice = stopPrice;
  if (updates.listingExchange || current.listingExchange) {
    body.listingExchange = updates.listingExchange || current.listingExchange;
  }
  if (updates.secType || current.secType) {
    body.secType = updates.secType || current.secType;
  }

  return submitOrderMutation(`/iserver/account/${accountId}/order/${orderId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function suppressOrderReplyMessages(
  messageIds: string[]
): Promise<{ status: string }> {
  if (getConfig().isMock) return { status: 'submitted' };
  return ibkrFetch('/iserver/questions/suppress', {
    method: 'POST',
    body: JSON.stringify({ messageIds }),
  });
}

export async function resetSuppressedOrderReplies(): Promise<{ status: string }> {
  if (getConfig().isMock) return { status: 'submitted' };
  return ibkrFetch('/iserver/questions/suppress/reset', {
    method: 'POST',
    body: JSON.stringify({}),
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

function normalizeTradeNetAmount(side: 'BUY' | 'SELL', rawNetAmount: number) {
  if (!Number.isFinite(rawNetAmount) || rawNetAmount === 0) return 0;
  return side === 'BUY' ? -Math.abs(rawNetAmount) : Math.abs(rawNetAmount);
}

function getTradeDisplaySymbol(secType: string, symbol: string, contractDescription: string) {
  if (
    secType.toUpperCase() === 'CASH' &&
    contractDescription.includes('.') &&
    contractDescription.length >= symbol.length
  ) {
    return contractDescription;
  }
  return symbol || contractDescription;
}

function getTradeCashFlowCurrency(secType: string, contractDescription: string) {
  if (secType.toUpperCase() !== 'CASH') return null;
  const parts = contractDescription.split('.');
  if (parts.length === 2 && parts[1] && /^[A-Z]{3,}$/.test(parts[1])) {
    return parts[1];
  }
  return null;
}

function convertRowAmountToBase(
  amount: number,
  currency: string,
  baseCurrency: string | null,
  exchangeRate: number
) {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (!baseCurrency || currency === baseCurrency) return amount;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return 0;
  return amount * exchangeRate;
}

function deriveCashBalanceBaseOutcome(
  balance: Pick<CashBalance, 'currency' | 'cashBalance' | 'baseEquivalent' | 'isBase'>,
  baseCurrency: string | null,
  recentTrades: TradeExecution[]
) {
  if (!baseCurrency || balance.isBase || recentTrades.length === 0) {
    return {
      entryBaseAmount: null,
      markToBasePnl: null,
    };
  }

  const balanceMagnitude = Math.abs(balance.cashBalance);
  const balanceSign = Math.sign(balance.cashBalance);
  if (balanceMagnitude <= 0.000001 || balanceSign === 0) {
    return {
      entryBaseAmount: null,
      markToBasePnl: null,
    };
  }

  const tolerance = Math.max(0.01, balanceMagnitude * 0.01);
  const directPairSymbol = baseCurrency ? `${baseCurrency}.${balance.currency}` : null;
  const match = recentTrades
    .filter(
      (trade) =>
        trade.secType === 'CASH' &&
        (trade.symbol === baseCurrency || trade.symbol === directPairSymbol) &&
        Math.sign(trade.netAmount) === balanceSign &&
        Math.abs(Math.abs(trade.netAmount) - balanceMagnitude) <= tolerance &&
        trade.size > 0
    )
    .sort((left, right) => {
      const leftDelta = Math.abs(Math.abs(left.netAmount) - balanceMagnitude);
      const rightDelta = Math.abs(Math.abs(right.netAmount) - balanceMagnitude);
      if (leftDelta !== rightDelta) {
        return leftDelta - rightDelta;
      }
      return right.tradeTimeMs - left.tradeTimeMs;
    })[0];

  if (!match) {
    return {
      entryBaseAmount: null,
      markToBasePnl: null,
    };
  }

  const entryBaseAmount = Math.abs(match.size);
  const exposureSign = Math.sign(balance.baseEquivalent || balance.cashBalance);

  return {
    entryBaseAmount,
    markToBasePnl:
      exposureSign === 0
        ? null
        : exposureSign * (Math.abs(balance.baseEquivalent) - entryBaseAmount),
  };
}

export async function getRecentTrades(days = 0): Promise<TradeExecution[]> {
  if (getConfig().isMock) return [];

  const cached = recentTradesCache.get(days);
  if (cached && Date.now() - cached.timestamp < RECENT_TRADES_TTL_MS) {
    return cached.data;
  }

  const inflight = recentTradesInflight.get(days);
  if (inflight) {
    return inflight;
  }

  const params = new URLSearchParams();
  if (days > 0) params.set('days', String(days));
  const query = params.size > 0 ? `?${params}` : '';
  const request = ibkrFetch<Array<Record<string, unknown>>>(
    `/iserver/account/trades${query}`
  )
    .then((data) => {
      const trades: TradeExecution[] = (data || []).map((trade) => {
        const side: TradeExecution['side'] =
          String(trade.side || 'B') === 'S' ? 'SELL' : 'BUY';
        const secType = String(trade.sec_type || '');
        const rawSymbol = String(trade.symbol || '');
        const contractDescription = String(trade.contract_description_1 || '');
        const symbol = getTradeDisplaySymbol(secType, rawSymbol, contractDescription);

        return {
          side,
          executionId: String(trade.execution_id || ''),
          orderId: Number(trade.order_id || 0),
          conid: Number(trade.conid || 0),
          symbol,
          cashFlowCurrency: getTradeCashFlowCurrency(secType, contractDescription),
          companyName: String(trade.company_name || ''),
          size: Number(trade.size || 0),
          price: Number(trade.price || 0),
          exchange: String(trade.exchange || ''),
          commission: Number(trade.commission || 0),
          netAmount: normalizeTradeNetAmount(
            side,
            Number(trade.net_amount || 0)
          ),
          tradeTime: String(trade.trade_time || ''),
          tradeTimeMs: Number(trade.trade_time_r || 0),
          description: String(trade.order_description || ''),
          secType,
          listingExchange: String(trade.listing_exchange || ''),
          accountId: String(trade.account || trade.accountCode || ''),
        };
      });

      recentTradesCache.set(days, {
        data: trades,
        timestamp: Date.now(),
      });

      return trades;
    })
    .finally(() => {
      recentTradesInflight.delete(days);
    });

  recentTradesInflight.set(days, request);
  return request;
}

export async function getAccountActivity(
  days = 7
): Promise<AccountActivityResponse> {
  if (getConfig().isMock) {
    return buildAccountActivity({
      accountId: 'U1234567',
      days,
      trades: [],
    });
  }

  const account = await getPortfolioAccountContext();
  const trades = await getRecentTrades(days);
  return buildAccountActivity({
    accountId: account.accountId,
    days,
    trades,
  });
}

export async function getAccountTransactions(
  conid: number,
  days = 90
): Promise<AccountTransactionsEnvelope> {
  if (getConfig().isMock) return mockTransactionsEnvelope(conid);

  const cacheKey = `${conid}:${days}`;
  const cached = transactionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRANSACTIONS_TTL_MS) {
    return cached.data;
  }

  const [account, contract] = await Promise.all([
    getPortfolioAccountContext(),
    getContractInfo(conid),
  ]);

  const raw = await ibkrFetch<{
    id?: string;
    currency?: string;
    from?: number;
    to?: number;
    nd?: number;
    warning?: string;
    rpnl?: {
      data?: Array<Record<string, unknown>>;
      amt?: string | number;
    };
    transactions?: Array<Record<string, unknown>>;
  }>('/pa/transactions', {
    method: 'POST',
    body: JSON.stringify({
      acctIds: [account.accountId],
      conids: [conid],
      currency: contract.currency,
      days,
    }),
  });

  const envelope: AccountTransactionsEnvelope = {
    id: String(raw.id || 'getTransactions'),
    currency: String(raw.currency || contract.currency || ''),
    from: Number(raw.from || 0),
    to: Number(raw.to || 0),
    nd: raw.nd == null ? null : Number(raw.nd),
    warning: raw.warning ? String(raw.warning) : null,
    accountId: account.accountId,
    conid,
    symbol: contract.symbol,
    name: contract.name,
    rpnl: raw.rpnl
      ? {
          amount:
            raw.rpnl.amt == null ? null : Number.parseFloat(String(raw.rpnl.amt)),
          data: (raw.rpnl.data || []).map((row) => ({
            cur: String(row.cur || ''),
            date: String(row.date || ''),
            fxRate: Number(row.fxRate || 0),
            side: String(row.side || ''),
            positionSide: String(row.positionSide || ''),
            acctid: String(row.acctid || account.accountId),
            amt: Number.parseFloat(String(row.amt || 0)),
            conid: Number(row.conid || conid),
          })),
        }
      : null,
    transactions: (raw.transactions || []).map((row) => ({
      cur: String(row.cur || ''),
      date: String(row.date || ''),
      rawDate: String(row.rawDate || ''),
      fxRate: Number(row.fxRate || 0),
      pr: Number(row.pr || 0),
      qty: Number(row.qty || 0),
      acctid: String(row.acctid || account.accountId),
      amt: Number(row.amt || 0),
      conid: Number(row.conid || conid),
      type: String(row.type || ''),
      desc: String(row.desc || contract.name || ''),
    })),
  };

  transactionsCache.set(cacheKey, { data: envelope, timestamp: Date.now() });
  return envelope;
}

function mapAlertSummary(raw: Record<string, unknown>): AccountAlertSummary {
  return {
    alertId: Number(raw.order_id || 0),
    accountId: String(raw.account || ''),
    name: String(raw.alert_name || ''),
    active: Number(raw.alert_active || 0) === 1,
    orderTime: String(raw.order_time || ''),
    triggered: Boolean(raw.alert_triggered),
    repeatable: Number(raw.alert_repeatable || 0) === 1,
  };
}

export async function getAlerts(): Promise<AccountAlertSummary[]> {
  if (getConfig().isMock) return [];

  const accountId = await getTradingAccountId();
  const raw = await ibkrFetch<Array<Record<string, unknown>>>(
    `/iserver/account/${accountId}/alerts`
  );

  return (raw || []).map(mapAlertSummary);
}

export async function getAlertDetails(
  alertId: string | number
): Promise<AccountAlertDetail> {
  if (getConfig().isMock) {
    return {
      alertId: Number(alertId),
      accountId: 'U1234567',
      name: 'Mock Alert',
      active: true,
      orderTime: '',
      triggered: false,
      repeatable: false,
      message: null,
      tif: 'GTC',
      expireTime: null,
      outsideRth: true,
      sendMessage: false,
      email: null,
      showPopup: false,
      conditions: [],
      rawType: null,
    };
  }

  const raw = await ibkrFetch<Record<string, unknown>>(
    `/iserver/account/alert/${alertId}?type=Q`
  );
  const summary = mapAlertSummary(raw);

  return {
    ...summary,
    message: raw.alert_message ? String(raw.alert_message) : null,
    tif: raw.tif ? String(raw.tif) : null,
    expireTime: raw.expire_time ? String(raw.expire_time) : null,
    outsideRth: Number(raw.outside_rth || 0) === 1,
    sendMessage: Number(raw.send_message || 0) === 1,
    email: raw.email ? String(raw.email) : null,
    showPopup: Number(raw.show_popup || 0) === 1,
    conditions: Array.isArray(raw.conditions)
      ? raw.conditions.map((condition) => {
          const item = condition as Record<string, unknown>;
          return {
            conidex: String(item.conidex || ''),
            logicBind: String(item.logicBind || 'n') as 'a' | 'o' | 'n',
            operator: String(item.operator || ''),
            triggerMethod: String(item.triggerMethod || '0'),
            type: Number(item.type || 0),
            value: String(item.value || ''),
          };
        })
      : [],
    rawType: raw.type ? String(raw.type) : null,
  };
}

export async function createAlert(
  params: AccountAlertCreateParams
): Promise<AccountAlertMutationResult> {
  if (getConfig().isMock) {
    return {
      success: true,
      text: 'Submitted',
      alertId: Date.now(),
      requestId: null,
    };
  }

  const accountId = await getTradingAccountId();
  const raw = await ibkrFetch<Record<string, unknown>>(
    `/iserver/account/${accountId}/alert`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );

  return {
    success: Boolean(raw.success),
    text: String(raw.text || ''),
    alertId: raw.order_id == null ? null : Number(raw.order_id),
    requestId: raw.request_id == null ? null : String(raw.request_id),
  };
}

export async function setAlertActive(
  alertId: string | number,
  active: boolean
): Promise<AccountAlertMutationResult> {
  if (getConfig().isMock) {
    return {
      success: true,
      text: 'Request was submitted',
      alertId: Number(alertId),
      requestId: null,
    };
  }

  const accountId = await getTradingAccountId();
  const raw = await ibkrFetch<Record<string, unknown>>(
    `/iserver/account/${accountId}/alert/activate`,
    {
      method: 'POST',
      body: JSON.stringify({
        alertId: Number(alertId),
        alertActive: active ? 1 : 0,
      }),
    }
  );

  return {
    success: Boolean(raw.success),
    text: String(raw.text || ''),
    alertId: Number(alertId),
    requestId: raw.request_id == null ? null : String(raw.request_id),
  };
}

export async function deleteAlert(
  alertId: string | number
): Promise<AccountAlertMutationResult> {
  if (getConfig().isMock) {
    return {
      success: true,
      text: 'Request was submitted',
      alertId: Number(alertId),
      requestId: null,
    };
  }

  const accountId = await getTradingAccountId();
  const raw = await ibkrFetch<Record<string, unknown>>(
    `/iserver/account/${accountId}/alert/${alertId}`,
    {
      method: 'DELETE',
    }
  );

  return {
    success: Boolean(raw.success),
    text: String(raw.text || ''),
    alertId: Number(alertId),
    requestId: raw.request_id == null ? null : String(raw.request_id),
  };
}

export async function getNotifications(): Promise<FyiNotification[]> {
  if (getConfig().isMock) return [];

  const raw = await ibkrFetch<Array<Record<string, unknown>>>('/fyi/notifications');

  return (raw || []).map((item) => ({
    id: String(item.ID || ''),
    receivedAt:
      item.D == null ? null : Math.round(Number.parseFloat(String(item.D)) * 1000),
    headline: String(item.MS || ''),
    body: String(item.MD || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    read: Number(item.R || 0) === 1,
    category: String(item.FC || ''),
  }));
}

export async function getPortfolioPerformance(
  period: string
): Promise<PortfolioPerformanceResponse> {
  if (getConfig().isMock) return mockPortfolioPerformance(period);

  const cacheKey = period;
  const cached = portfolioPerformanceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PORTFOLIO_PERFORMANCE_TTL_MS) {
    return cached.data;
  }

  const account = await getPortfolioAccountContext();
  const raw = await ibkrFetch<{
    nd?: number;
    id?: string;
    included?: string[];
    currencyType?: string;
    nav?: {
      dates?: string[];
      data?: Array<{
        id?: string;
        idType?: string;
        start?: string;
        end?: string;
        baseCurrency?: string;
        startNAV?: {
          date?: string;
          val?: number | string;
        };
        navs?: Array<number | string>;
      }>;
    };
  }>('/pa/performance', {
    method: 'POST',
    body: JSON.stringify({
      acctIds: [account.accountId],
      period,
    }),
  });

  const navDates = raw.nav?.dates ?? [];
  const navData = raw.nav?.data?.[0];
  const navs = navData?.navs ?? [];
  const points = navDates
    .map((date, index) => {
      const value = navs[index];
      const time = parseIbkrDateToUtcMs(date);
      const numericValue =
        value == null ? NaN : Number.parseFloat(String(value));
      if (!Number.isFinite(time) || !Number.isFinite(numericValue)) {
        return null;
      }
      return {
        time,
        value: numericValue,
      };
    })
    .filter((point): point is PortfolioPerformanceResponse['points'][number] => point != null);

  const latest = points[points.length - 1] ?? null;
  const response: PortfolioPerformanceResponse = {
    accountId: account.accountId,
    baseCurrency: navData?.baseCurrency || 'USD',
    period,
    nd: raw.nd == null ? null : Number(raw.nd),
    warning:
      points.length === 0
        ? 'No performance data returned for this period'
        : null,
    points,
    snapshot: {
      value: latest?.value ?? null,
      updatedAt: latest?.time ?? null,
    },
  };

  portfolioPerformanceCache.set(cacheKey, {
    data: response,
    timestamp: Date.now(),
  });

  return response;
}

export async function getPortfolioDecomposition(): Promise<PortfolioDecompositionResponse> {
  const [account, summary, positions, cash] = await Promise.all([
    getPortfolioAccountContext(),
    getAccountSummary(),
    getPositions(),
    getCashBalances(),
  ]);
  const definitions = await getSecurityDefinitions(positions.map((position) => position.conid));

  return buildPortfolioDecomposition({
    accountId: account.accountId,
    baseCurrency: cash.baseCurrency,
    summary,
    positions,
    cashBalances: cash.cashBalances,
    securityDefinitions: definitions,
  });
}

export async function getInstrumentDiagnostics(
  conid: number,
  exchange?: string
): Promise<InstrumentDiagnostics> {
  const [contract, snapshot, schedule] = await Promise.all([
    getContractInfo(conid),
    getMarketDataSnapshot([conid]).then((results) => results[0] ?? null),
    getMarketSchedule(conid, exchange),
  ]);
  const availability = deriveInstrumentAvailability({
    snapshot,
    scheduleState: schedule.state,
  });

  return {
    conid,
    symbol: contract.symbol,
    name: contract.name,
    exchange: exchange || contract.exchange || null,
    currency: contract.currency,
    updated: snapshot?.updated ?? null,
    marketDataStatus: snapshot?.marketDataStatus ?? 'unknown',
    sessionPhase: schedule.state.phase,
    entitled: availability.entitled,
    hasQuote: availability.hasQuote,
    availability,
  };
}

// ─── Portfolio ─────────────────────────────────────────────────────

export async function getPositions(): Promise<Position[]> {
  if (getConfig().isMock) return mockPositions();

  if (
    positionsCache &&
    Date.now() - positionsCache.timestamp < PORTFOLIO_SLICE_TTL_MS
  ) {
    return positionsCache.data;
  }

  if (positionsInflight) {
    return positionsInflight;
  }

  const accountId = getConfig().accountId;
  const request = (async () => {
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

    positionsCache = {
      data: allPositions,
      timestamp: Date.now(),
    };
    return allPositions;
  })().finally(() => {
    positionsInflight = null;
  });

  positionsInflight = request;
  return request;
}

export async function getAccountSummary(): Promise<AccountSummary> {
  if (getConfig().isMock) return mockAccountSummary();

  if (
    accountSummaryCache &&
    Date.now() - accountSummaryCache.timestamp < PORTFOLIO_SLICE_TTL_MS
  ) {
    return accountSummaryCache.data;
  }

  if (accountSummaryInflight) {
    return accountSummaryInflight;
  }

  const accountId = getConfig().accountId;
  const request = ibkrFetch<Record<string, { amount: number; value?: string }>>(
    `/portfolio/${accountId}/summary`
  )
    .then((raw) => {
      const summary: AccountSummary = {
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

      accountSummaryCache = {
        data: summary,
        timestamp: Date.now(),
      };
      return summary;
    })
    .finally(() => {
      accountSummaryInflight = null;
    });

  accountSummaryInflight = request;
  return request;
}

export async function getPortfolioPnL(): Promise<PortfolioPnL> {
  if (getConfig().isMock) return mockPortfolioPnL();

  if (
    portfolioPnLCache &&
    Date.now() - portfolioPnLCache.timestamp < PORTFOLIO_SLICE_TTL_MS
  ) {
    return portfolioPnLCache.data;
  }

  if (portfolioPnLInflight) {
    return portfolioPnLInflight;
  }

  const request = ibkrFetch<{ upnl: Record<string, { dpl: number; nl: number; upl: number; uel?: number; el?: number; mv: number }> }>(
    '/iserver/account/pnl/partitioned'
  )
    .then((data) => {
      const pnl =
        Object.values(data.upnl || {}).find(
          (entry): entry is { dpl: number; nl: number; upl: number; uel?: number; el?: number; mv: number } =>
            !!entry &&
            typeof entry === 'object' &&
            typeof entry.dpl === 'number' &&
            typeof entry.nl === 'number' &&
            typeof entry.upl === 'number'
        ) ?? null;

      const response: PortfolioPnL = !pnl
        ? {
            dailyPnL: 0,
            netLiquidity: 0,
            unrealizedPnL: 0,
            excessLiquidity: 0,
            marketValue: 0,
          }
        : {
            dailyPnL: pnl.dpl,
            netLiquidity: pnl.nl,
            unrealizedPnL: pnl.upl,
            excessLiquidity: pnl.uel ?? pnl.el ?? 0,
            marketValue: pnl.mv,
          };

      portfolioPnLCache = {
        data: response,
        timestamp: Date.now(),
      };

      return response;
    })
    .finally(() => {
      portfolioPnLInflight = null;
    });

  portfolioPnLInflight = request;
  return request;
}

export async function getCashBalances(): Promise<{
  baseCurrency: string | null;
  cashBalances: CashBalance[];
}> {
  if (getConfig().isMock) return mockCashBalances();

  if (
    cashBalancesCache &&
    Date.now() - cashBalancesCache.timestamp < PORTFOLIO_SLICE_TTL_MS
  ) {
    return cashBalancesCache.data;
  }

  if (cashBalancesInflight) {
    return cashBalancesInflight;
  }

  const accountId = getConfig().accountId;
  const request = Promise.all([
    ibkrFetch<Record<string, Record<string, unknown>>>(`/portfolio/${accountId}/ledger`),
    getRecentTrades(30).catch(() => []),
  ])
    .then(([raw, recentTrades]) => {
      const ledgerRows = Object.values(raw || {}).filter(
        (entry): entry is Record<string, unknown> =>
          !!entry && typeof entry === 'object' && typeof entry.currency === 'string'
      );

      const baseCurrency =
        (
          ledgerRows.find(
            (entry) => entry.currency !== 'BASE' && Number(entry.exchangerate ?? 0) === 1
          )?.currency as string | undefined
        ) ?? null;

      const cashBalances = ledgerRows
        .filter((entry) => entry.currency !== 'BASE')
        .map((entry) => {
          const currency = String(entry.currency);
          const cashBalance = Number(entry.cashbalance ?? 0);
          const exchangeRate = Number(entry.exchangerate ?? 0);
          const baseEquivalent =
            baseCurrency && currency === baseCurrency
              ? cashBalance
              : exchangeRate > 0
                ? cashBalance * exchangeRate
                : 0;
          const unrealizedPnlBase = convertRowAmountToBase(
            Number(entry.unrealizedpnl ?? 0),
            currency,
            baseCurrency,
            exchangeRate
          );
          const realizedPnlBase = convertRowAmountToBase(
            Number(entry.realizedpnl ?? 0),
            currency,
            baseCurrency,
            exchangeRate
          );
          const derivedOutcome = deriveCashBalanceBaseOutcome(
            {
              currency,
              cashBalance,
              baseEquivalent,
              isBase: Boolean(baseCurrency && currency === baseCurrency),
            },
            baseCurrency,
            recentTrades
          );
          return {
            currency,
            cashBalance,
            settledCash: Number(entry.settledcash ?? 0),
            netLiquidationValue: Number(entry.netliquidationvalue ?? 0),
            exchangeRate,
            interest: Number(entry.interest ?? 0),
            baseEquivalent,
            unrealizedPnlBase,
            realizedPnlBase,
            entryBaseAmount: derivedOutcome.entryBaseAmount,
            markToBasePnl:
              derivedOutcome.markToBasePnl ??
              (unrealizedPnlBase !== 0 || realizedPnlBase !== 0
                ? unrealizedPnlBase + realizedPnlBase
                : null),
            isBase: Boolean(baseCurrency && currency === baseCurrency),
          } satisfies CashBalance;
        })
        .filter((entry) => Math.abs(entry.cashBalance) > 0.000001);

      const response = {
        baseCurrency,
        cashBalances,
      };

      cashBalancesCache = {
        data: response,
        timestamp: Date.now(),
      };

      return response;
    })
    .finally(() => {
      cashBalancesInflight = null;
    });

  cashBalancesInflight = request;
  return request;
}

// ─── Helpers ───────────────────────────────────────────────────────

function parseIbkrDateToUtcMs(raw: string): number {
  if (!/^\d{8}$/.test(raw)) return Number.NaN;
  const year = Number.parseInt(raw.slice(0, 4), 10);
  const month = Number.parseInt(raw.slice(4, 6), 10) - 1;
  const day = Number.parseInt(raw.slice(6, 8), 10);
  return Date.UTC(year, month, day);
}

async function resolveFutureSearchVariants(
  results: IbkrSearchRow[],
  query: string,
  secType?: string,
  explicitFuture?: ExplicitFutureQuery | null
): Promise<SearchResult[]> {
  const querySymbol = query.trim().toUpperCase();
  const futuresOnly = secType?.toUpperCase() === 'FUT';
  const normalizedQuery = normalizeInstrumentSearchText(query);
  const resolved: SearchResult[] = [];
  const tasks: Promise<SearchResult | null>[] = [];

  for (const raw of results) {
    const rootConid =
      typeof raw.conid === 'string' ? Number.parseInt(raw.conid, 10) : raw.conid;
    if (!(rootConid > 0)) continue;

    const symbol = String(raw.symbol || '').trim();
    const companyName =
      raw.companyName ||
      raw.companyHeader?.replace(/\s*[-(].*$/, '') ||
      symbol;
    const searchNameText = normalizeInstrumentSearchText(
      [companyName, raw.companyHeader].filter(Boolean).join(' ')
    );
    const futSection = raw.sections?.find(
      (section) => section.secType === 'FUT' && section.exchange
    );

    const exactSymbolMatch = symbol.toUpperCase() === querySymbol;
    const strongNameMatch =
      normalizedQuery.length >= 6 && searchNameText.includes(normalizedQuery);
    const explicitFutureSymbolMatch =
      explicitFuture?.symbol != null &&
      symbol.toUpperCase() === explicitFuture.symbol.toUpperCase();
    if (!futuresOnly && !exactSymbolMatch && !strongNameMatch && !explicitFutureSymbolMatch) {
      continue;
    }

    const exchange = getSearchRowExchange(raw, futSection?.exchange);
    if (!exchange) continue;

    if (explicitFuture && explicitFutureSymbolMatch) {
      const direct = await resolveFutureSearchVariant({
        rootConid,
        symbol,
        name: companyName,
        exchange,
        month: explicitFuture.month,
      });
      if (direct) {
        resolved.push(direct);
        continue;
      }
    }

    const months = String(futSection?.months || '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, FUTURE_SEARCH_VARIANT_LIMIT);

    if (months.length === 0) {
      if (
        (!exactSymbolMatch && !strongNameMatch && !explicitFutureSymbolMatch) ||
        !isLikelyFutureExchange(exchange)
      ) {
        continue;
      }
      resolved.push(
        ...(await probeFutureSearchVariants({
          rootConid,
          symbol,
          name: companyName,
          exchange,
        }))
      );
      continue;
    }

    for (const month of months) {
      tasks.push(
        resolveFutureSearchVariant({
          rootConid,
          symbol,
          name: companyName,
          exchange,
          month,
        })
      );
    }
  }

  if (tasks.length === 0) {
    return dedupeSearchResults(resolved);
  }

  resolved.push(
    ...(await Promise.all(tasks)).filter((entry): entry is SearchResult => entry != null)
  );
  return dedupeSearchResults(resolved);
}

async function resolveFutureSearchVariant(params: {
  rootConid: number;
  symbol: string;
  name: string;
  exchange: string;
  month: string;
}): Promise<SearchResult | null> {
  const { rootConid, symbol, name, exchange, month } = params;
  const cacheKey = `${rootConid}:${exchange}:FUT:${month}`;
  const cached = futureSearchVariantCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FUTURE_SEARCH_VARIANT_TTL_MS) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams({
      conid: String(rootConid),
      month,
      exchange,
      secType: 'FUT',
    });
    const rows = await ibkrFetch<
      Array<{
        conid?: number | string;
        symbol?: string;
        secType?: string;
        exchange?: string;
        listingExchange?: string;
        desc1?: string;
        maturityDate?: string;
        validExchanges?: string;
      }>
    >(`/iserver/secdef/info?${params.toString()}`);

    const match = rows.find((row) => Number(row.conid || 0) > 0);
    if (!match) {
      futureSearchVariantCache.set(cacheKey, {
        data: null,
        timestamp: Date.now(),
      });
      return null;
    }

    const conid = Number(match.conid || 0);
    const contractDisplay =
      String(match.desc1 || '').replace(/\([^)]*\)\s*$/, '').trim() ||
      formatFutureContractMonth(month, match.maturityDate);
    const result: SearchResult = {
      conid,
      name: `${name} ${contractDisplay}`.trim(),
      symbol: `${symbol} ${month}`.trim(),
      exchange: String(match.exchange || match.listingExchange || exchange || ''),
      type: String(match.secType || 'FUT'),
      allExchanges: String(match.validExchanges || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      rootConid,
      contractMonth: month,
      contractDisplay,
      underlyingSymbol: symbol,
    };
    futureSearchVariantCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });
    return result;
  } catch {
    futureSearchVariantCache.set(cacheKey, {
      data: null,
      timestamp: Date.now(),
    });
    return null;
  }
}

function formatFutureContractMonth(month: string, maturityDate?: string): string {
  const match = month.trim().toUpperCase().match(/^([A-Z]{3})(\d{2})$/);
  if (match) {
    const monthIndex = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ].indexOf(match[1]);
    if (monthIndex >= 0) {
      const year = Number.parseInt(match[2], 10);
      const date = new Date(Date.UTC(2000 + year, monthIndex, 1));
      return date.toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });
    }
  }

  if (maturityDate && /^\d{8}$/.test(maturityDate)) {
    const parsed = parseIbkrDateToUtcMs(maturityDate);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });
    }
  }

  return month;
}

async function probeFutureSearchVariants(params: {
  rootConid: number;
  symbol: string;
  name: string;
  exchange: string;
}): Promise<SearchResult[]> {
  const resolved: SearchResult[] = [];

  for (const month of buildFutureSearchProbeMonths()) {
    const variant = await resolveFutureSearchVariant({
      ...params,
      month,
    });
    if (!variant) continue;
    resolved.push(variant);
    if (resolved.length >= FUTURE_SEARCH_VARIANT_LIMIT) break;
  }

  return resolved;
}

function buildFutureSearchProbeMonths(now = new Date()): string[] {
  const labels: string[] = [];
  const monthCodes = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];

  for (let offset = 0; offset < FUTURE_SEARCH_PROBE_MONTH_COUNT; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    labels.push(
      `${monthCodes[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(-2)}`
    );
  }

  return labels;
}

function isLikelyFutureExchange(exchange: string): boolean {
  return FUTURE_SEARCH_EXCHANGES.has(exchange.trim().toUpperCase());
}

function getSearchRowExchange(
  raw: {
    companyHeader?: string;
    description: string | null;
  },
  sectionExchange?: string
): string {
  const sectionValue = String(sectionExchange || '')
    .split(';')
    .map((value) => value.trim())
    .find(Boolean);
  if (sectionValue) return sectionValue;

  const headerMatch = raw.companyHeader?.match(/\(([^)]+)\)\s*$/);
  if (headerMatch?.[1]) {
    return headerMatch[1].trim();
  }

  return String(raw.description || '').trim();
}

async function fetchInstrumentSearchRows(
  query: string,
  secType?: string
): Promise<IbkrSearchRow[]> {
  const body: Record<string, unknown> = { symbol: query, name: true };
  if (secType) body.secType = secType;

  const results = await ibkrFetch<IbkrSearchRow[] | { error?: string }>(
    '/iserver/secdef/search',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  if (Array.isArray(results)) {
    return results;
  }

  const message = results?.error?.trim() ?? '';
  if (isSearchMiss(message)) {
    return [];
  }

  throw new Error(message || 'Search failed');
}

function dedupeIbkrSearchRows(results: IbkrSearchRow[]): IbkrSearchRow[] {
  const deduped: IbkrSearchRow[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const key = `${result.conid}:${result.symbol || ''}:${result.companyHeader || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}

function sortSearchResults(
  results: SearchResult[],
  query: string,
  secType?: string,
  explicitFuture?: ExplicitFutureQuery | null
): SearchResult[] {
  return [...results].sort((left, right) => {
    const scoreDiff =
      scoreSearchResult(right, query, secType, explicitFuture) -
      scoreSearchResult(left, query, secType, explicitFuture);
    if (scoreDiff !== 0) return scoreDiff;
    return left.symbol.localeCompare(right.symbol);
  });
}

function scoreSearchResult(
  result: SearchResult,
  query: string,
  secType?: string,
  explicitFuture?: ExplicitFutureQuery | null
): number {
  const normalizedQuery = normalizeInstrumentSearchText(query);
  const compactQuery = compactInstrumentSearchText(query);
  const queryTokens = buildSearchScoreTokens(query);
  const symbolText = normalizeInstrumentSearchText(result.symbol);
  const compactSymbol = compactInstrumentSearchText(result.symbol);
  const underlyingText = normalizeInstrumentSearchText(result.underlyingSymbol);
  const compactUnderlying = compactInstrumentSearchText(result.underlyingSymbol);
  const nameText = normalizeInstrumentSearchText(result.name);
  const compactName = compactInstrumentSearchText(result.name);
  const queryShareClass = extractSearchShareClass(query);
  const resultShareClass = extractSearchShareClass(
    `${result.symbol} ${result.name}`
  );

  let score = getSearchTypePriority(result.type) + getSearchExchangePriority(result.exchange);

  if (secType && result.type.toUpperCase() === secType.toUpperCase()) {
    score += 250;
  }
  if (explicitFuture && result.type.toUpperCase() !== 'FUT') {
    score -= 500;
  }

  if (explicitFuture?.month && result.contractMonth === explicitFuture.month) {
    score += 950;
  }
  if (explicitFuture?.symbol && underlyingText === explicitFuture.symbol) {
    score += 500;
  }

  if (compactSymbol === compactQuery || compactUnderlying === compactQuery) {
    score += 1000;
  }
  if (matchesCompactShareClassVariant(result.symbol, compactQuery)) {
    score += 920;
  }
  if (symbolText === normalizedQuery || underlyingText === normalizedQuery) {
    score += 900;
  }
  if (compactName === compactQuery) {
    score += 700;
  }
  if (nameText.includes(normalizedQuery) || normalizedQuery.includes(nameText)) {
    score += 550;
  }
  if (compactSymbol.startsWith(compactQuery) || compactUnderlying.startsWith(compactQuery)) {
    score += 380;
  }
  if (compactName.startsWith(compactQuery)) {
    score += 220;
  }
  if (
    queryTokens.length > 0 &&
    queryTokens.every(
      (token) =>
        nameText.includes(token) ||
        symbolText.includes(token) ||
        underlyingText.includes(token) ||
        compactName.includes(token) ||
        compactSymbol.includes(token) ||
        compactUnderlying.includes(token)
    )
  ) {
    score += 420;
  }
  if (queryShareClass && resultShareClass === queryShareClass) {
    score += 260;
  } else if (queryShareClass && resultShareClass && resultShareClass !== queryShareClass) {
    score -= 160;
  }

  return score;
}

function buildSearchScoreTokens(query: string): string[] {
  const tokens = normalizeInstrumentSearchText(query)
    .split(' ')
    .filter(Boolean);

  return tokens.filter(
    (token, index) =>
      token.length > 1 || (tokens.length > 1 && index === tokens.length - 1)
  );
}

function extractSearchShareClass(value: string | null | undefined): string | null {
  const normalized = normalizeInstrumentSearchText(value);
  if (!normalized) return null;

  const classMatch = normalized.match(/\b(?:CL|CLASS)\s+([A-Z])\b/);
  if (classMatch?.[1]) {
    return classMatch[1];
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const lastToken = tokens.at(-1);
  if (lastToken && /^[A-Z]$/.test(lastToken)) {
    return lastToken;
  }

  return null;
}

function matchesCompactShareClassVariant(
  symbol: string,
  compactQuery: string
): boolean {
  if (!compactQuery || compactInstrumentSearchText(symbol) !== compactQuery) {
    return false;
  }

  return /[.\s]/.test(symbol.trim());
}

function getSearchTypePriority(type: string): number {
  switch (type.toUpperCase()) {
    case 'CASH':
      return 260;
    case 'FUT':
      return 250;
    case 'STK':
      return 240;
    case 'OPT':
      return 220;
    case 'CFD':
      return 210;
    case 'IND':
      return 190;
    case 'FUND':
      return 100;
    case 'BOND':
      return 20;
    default:
      return 150;
  }
}

function getSearchExchangePriority(exchange: string): number {
  switch (exchange.toUpperCase()) {
    case 'NYSE':
    case 'NASDAQ':
    case 'ARCA':
    case 'SMART':
    case 'IDEALPRO':
    case 'NYMEX':
    case 'CME':
    case 'COMEX':
      return 40;
    case 'VALUE':
      return -10;
    default:
      return 0;
  }
}

function dedupeSearchResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<number>();
  const deduped: SearchResult[] = [];

  for (const result of results) {
    if (seen.has(result.conid)) continue;
    seen.add(result.conid);
    deduped.push(result);
  }

  return deduped;
}

function parseScannerParams(payload: string): ScannerParams {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error('Scanner params returned an empty response');
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error('Scanner params returned an unsupported format');
  }

  return normalizeScannerParams(JSON.parse(trimmed) as Record<string, unknown>);
}

function normalizeScannerParams(raw: Record<string, unknown>): ScannerParams {
  const instruments = dedupeScannerOptions(
    toArray(raw.instrument_list ?? raw.instrumentList).map((entry) => {
      const record = asRecord(entry);
      const code = toStringValue(record.type ?? record.code);
      return {
        code,
        label: toStringValue(record.display_name ?? record.label ?? code),
        instrumentTypes: [code],
      };
    })
  );

  const locations = dedupeScannerOptions(
    flattenScannerLocations(toArray(raw.location_tree ?? raw.locationTree))
  );

  const scanTypes = dedupeScannerOptions(
    toArray(raw.scan_type_list ?? raw.scanTypeList).map((entry) => {
      const record = asRecord(entry);
      const code = toStringValue(record.scan_code ?? record.code ?? record.type);
      return {
        code,
        label: toStringValue(record.display_name ?? record.label ?? code),
        instrumentTypes: parseInstrumentTypes(record.instruments ?? record.instrument_list),
      };
    })
  );

  const filters = dedupeScannerFilters(
    toArray(raw.filter_list ?? raw.filterList).map((entry) => {
      const record = asRecord(entry);
      return {
        code: toStringValue(record.code),
        label: toStringValue(record.display_name ?? record.label ?? record.code),
        instrumentTypes: parseInstrumentTypes(record.instruments ?? record.instrument_list),
        group: toStringValue(record.group ?? record.category ?? 'General'),
        valueType: toStringValue(record.type ?? record.valueType ?? 'string'),
      };
    })
  );

  return {
    instruments,
    locations,
    scanTypes,
    filters,
  };
}

function normalizeScannerResults(
  raw: unknown,
  fallbackType: string
): ScannerResult[] {
  const root = asRecord(raw);
  const rootScanLabel = toStringValue(
    root.scan_data_column_name ?? root.scanDataColumnName ?? root.column_name
  );
  const rows = Array.isArray(raw)
    ? raw
    : toArray(root.contracts ?? root.results ?? root.scanner_result ?? root.data);

  const results: Array<ScannerResult | null> = rows.map((entry, index) => {
      const record = asRecord(entry);
      const contract = asRecord(record.contract);
      const conid = parseIntegerField(
        record.conid ??
          record.con_id ??
          record.contract_id ??
          contract.conid ??
          contract.con_id
      );
      const symbol = toStringValue(record.symbol ?? contract.symbol);
      const name = toStringValue(
        record.company_name ??
          record.companyName ??
          record.description ??
          record.contract_description ??
          contract.company_name ??
          contract.companyName
      );
      const exchange = toStringValue(
        record.listing_exchange ??
          record.exchange ??
          contract.listing_exchange ??
          contract.exchange
      );
      const type = toStringValue(
        record.sec_type ?? record.secType ?? contract.sec_type ?? contract.secType ?? fallbackType
      );
      const scanLabel = toStringValue(
        record.scan_data_column_name ??
          record.scanDataColumnName ??
          record.column_name ??
          rootScanLabel
      );
      const scanValue = flattenScannerValue(
        record.scan_data ?? record.scanData ?? record.value ?? record.distance
      );
      const contractDescription = toStringValue(
        record.contract_description_1 ?? contract.contract_description_1
      );
      const availableChartPeriods = toStringValue(
        record.available_chart_periods ?? contract.available_chart_periods
      );
      const metadata = buildScannerMetadata({
        contractDescription,
        availableChartPeriods,
      });

      if (!conid || !symbol) return null;

      return {
        conid,
        symbol,
        name: name || symbol,
        exchange,
        type,
        rank: parseIntegerField(record.rank ?? record.position) || index + 1,
        scanLabel: scanLabel || undefined,
        scanValue: scanValue || undefined,
        contractDescription: contractDescription || undefined,
        availableChartPeriods: availableChartPeriods || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    });

  return results.filter((result): result is ScannerResult => result != null);
}

function flattenScannerLocations(
  nodes: unknown[],
  parentCode?: string,
  rootInstrumentCode?: string
): ScannerParams['locations'] {
  const options: ScannerParams['locations'] = [];

  for (const node of nodes) {
    const record = asRecord(node);
    const code = toStringValue(record.type ?? record.code);
    const label = toStringValue(record.display_name ?? record.label ?? code);
    const children = toArray(record.locations ?? record.children);
    const parsedInstrumentTypes = parseInstrumentTypes(
      record.instruments ?? record.instrument_list
    );
    const instrumentCode = rootInstrumentCode ?? code;
    const instrumentTypes =
      parsedInstrumentTypes.length > 0
        ? parsedInstrumentTypes
        : instrumentCode
          ? [instrumentCode]
          : [];

    if (code) {
      options.push({
        code,
        label,
        instrumentTypes,
        parentCode,
        isLeaf: children.length === 0,
      });
    }

    options.push(...flattenScannerLocations(children, code || parentCode, instrumentCode));
  }

  return options;
}

function dedupeScannerOptions(options: ScannerParams['instruments']): ScannerParams['instruments'] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option.code || seen.has(option.code)) return false;
    seen.add(option.code);
    return true;
  });
}

function dedupeScannerFilters(filters: ScannerParams['filters']): ScannerParams['filters'] {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    if (!filter.code || seen.has(filter.code)) return false;
    seen.add(filter.code);
    return true;
  });
}

function parseInstrumentTypes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toStringValue(entry))
      .filter(Boolean);
  }

  const text = toStringValue(value);
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split('.')[0] ?? entry);
}

function flattenScannerValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => flattenScannerValue(entry)).filter(Boolean).join(' · ');
  }

  if (value == null) return '';
  return String(value);
}

function buildScannerMetadata(input: {
  contractDescription?: string;
  availableChartPeriods?: string;
}): Record<string, string> {
  const metadata: Record<string, string> = {};

  if (input.contractDescription) {
    metadata.contractDescription = input.contractDescription;
  }

  if (input.availableChartPeriods) {
    metadata.availableChartPeriods = input.availableChartPeriods;
  }

  return metadata;
}

function isMeaningfulScannerValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^[+-]?0(?:\.0+)?%?$/.test(normalized)) {
    return false;
  }
  return true;
}

function coalesceScannerValue(
  rawValue: string | undefined,
  derivedValue: string | undefined
): string | undefined {
  if (isMeaningfulScannerValue(rawValue)) {
    return rawValue;
  }
  return derivedValue ?? rawValue;
}

function deriveScannerValueFromSnapshot(
  scanLabel: string | undefined,
  snapshot: MarketDataSnapshot
): string | undefined {
  const normalized = scanLabel?.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized.includes('chg')) {
    if (!snapshot.changePct) return undefined;
    return String(snapshot.changePct).includes('%')
      ? String(snapshot.changePct)
      : `${snapshot.changePct}%`;
  }

  if (normalized.includes('volume')) {
    return String(snapshot.volume);
  }

  if (normalized.includes('price')) {
    return String(snapshot.last);
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function isSearchMiss(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === 'no contracts found' ||
    normalized.includes('no security definition has been found')
  );
}

function parseChange(value: string): number {
  // IBKR prefixes change with C (green/up) or H (red/down)
  return parseNumericField(value);
}

function parseIntegerField(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  const numeric = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseNumericField(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const cleaned = String(value)
    .trim()
    .replace(/^[A-Za-z]+/, '')
    .replace(/,/g, '');

  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMBT%])?$/i);
  if (!match) return 0;

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return 0;

  const suffix = match[2]?.toUpperCase();
  switch (suffix) {
    case 'K':
      return base * 1_000;
    case 'M':
      return base * 1_000_000;
    case 'B':
      return base * 1_000_000_000;
    case 'T':
      return base * 1_000_000_000_000;
    default:
      return base;
  }
}

function parseMarketDataStatus(
  value: unknown
): 'live' | 'delayed' | 'frozen' | 'unavailable' | 'unknown' {
  const code = String(value ?? '').trim().toUpperCase();
  const lead = code[0];

  switch (lead) {
    case 'R':
      return 'live';
    case 'D':
      return 'delayed';
    case 'Y':
    case 'Z':
      return 'frozen';
    case 'N':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

function hasLiveQuoteFields(item: Record<string, string | number>): boolean {
  return ['31', '84', '86', '82', '83'].some((field) => {
    const value = item[field];
    return value != null && String(value).trim() !== '';
  });
}
