// Browser-side client for the app's own IBKR API routes.
// Keep browser traffic same-origin and let Next.js talk to the gateway.

import type {
  MarketSchedule,
  MarketDataSnapshot,
  PortfolioSnapshot,
  PortfolioPerformanceResponse,
  Order,
  OrderMutationResponse,
  OrderParams,
  OrderStatusDetail,
  OrderWhatIfPreview,
  TradeExecution,
  AccountTransactionsEnvelope,
  AccountActivityResponse,
  AccountAlertCreateParams,
  AccountAlertDetail,
  AccountAlertMutationResult,
  AccountAlertSummary,
  FyiNotification,
  InstrumentDiagnostics,
  PortfolioDecompositionResponse,
  ScannerParams as IBKRScannerParams,
  ScannerResult as IBKRScannerResult,
  ScannerRunRequest,
  SearchResult as IBKRSearchResult,
} from './types';
import type { LiveFeedResponse } from './live-feed-types';
import { sanitizeInstrumentSearchQuery } from './search-query';

export type SearchResult = IBKRSearchResult;
export type ScannerParams = IBKRScannerParams;
export type ScannerResult = IBKRScannerResult;

export interface GatewayAuthStatus {
  authenticated: boolean;
  competing: boolean;
  connected: boolean;
}

function extractRouteErrorMessage(text: string) {
  if (!text) return '';

  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error;
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {}

  return text;
}

async function appFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    cache: 'no-store',
    signal: options.signal ?? AbortSignal.timeout(10000),
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const message = extractRouteErrorMessage(text) || res.statusText;
    throw new Error(`${path} -> IBKR ${res.status}: ${message}`);
  }

  return res.json() as Promise<T>;
}

export async function getGatewayAuth(): Promise<GatewayAuthStatus> {
  return appFetch<GatewayAuthStatus>('/api/ibkr/auth');
}

export async function getLiveFeedStatus(): Promise<LiveFeedResponse> {
  return appFetch<LiveFeedResponse>('/api/ibkr/live-feed');
}

export async function getMarketSnapshots(
  conids: number[]
): Promise<MarketDataSnapshot[]> {
  const params = new URLSearchParams({
    conids: conids.join(','),
  });
  return appFetch<MarketDataSnapshot[]>(`/api/ibkr/marketdata?${params}`);
}

export async function getMarketSchedule(
  conid: number,
  exchange?: string
): Promise<MarketSchedule> {
  const params = new URLSearchParams({
    conid: String(conid),
  });
  if (exchange) params.set('exchange', exchange);
  return appFetch<MarketSchedule>(`/api/ibkr/schedule?${params}`);
}

export async function getMarketSchedules(
  instruments: Array<{ conid: number; exchange?: string }>
): Promise<MarketSchedule[]> {
  return appFetch<MarketSchedule[]>('/api/ibkr/schedule/batch', {
    method: 'POST',
    body: JSON.stringify({ instruments }),
  });
}

export async function getLiveOrders(): Promise<Order[]> {
  return appFetch<Order[]>('/api/ibkr/orders');
}

export async function getRecentTrades(): Promise<TradeExecution[]> {
  return appFetch<TradeExecution[]>('/api/ibkr/trades');
}

export async function getRecentTradesForDays(days: number): Promise<TradeExecution[]> {
  const params = new URLSearchParams({ days: String(days) });
  return appFetch<TradeExecution[]>(`/api/ibkr/trades?${params}`);
}

export async function getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  return appFetch<PortfolioSnapshot>('/api/ibkr/portfolio');
}

export async function getPortfolioPerformance(
  timeframe: string
): Promise<PortfolioPerformanceResponse> {
  const params = new URLSearchParams({
    timeframe,
  });
  return appFetch<PortfolioPerformanceResponse>(
    `/api/ibkr/portfolio/performance?${params}`
  );
}

export async function getAccountTransactions(
  conid: number,
  days = 90
): Promise<AccountTransactionsEnvelope> {
  const params = new URLSearchParams({
    conid: String(conid),
    days: String(days),
  });
  return appFetch<AccountTransactionsEnvelope>(`/api/ibkr/transactions?${params}`);
}

export async function getAccountActivity(days = 7): Promise<AccountActivityResponse> {
  const params = new URLSearchParams({ days: String(days) });
  return appFetch<AccountActivityResponse>(`/api/ibkr/activity?${params}`);
}

export async function getPortfolioDecomposition(): Promise<PortfolioDecompositionResponse> {
  return appFetch<PortfolioDecompositionResponse>('/api/ibkr/portfolio/decomposition');
}

export async function previewOrder(
  params: OrderParams
): Promise<OrderWhatIfPreview> {
  return appFetch<OrderWhatIfPreview>('/api/ibkr/orders/preview', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getOrderStatus(
  orderId: number | string
): Promise<OrderStatusDetail> {
  const params = new URLSearchParams({ orderId: String(orderId) });
  return appFetch<OrderStatusDetail>(`/api/ibkr/orders/status?${params}`);
}

export async function modifyOrder(
  orderId: number | string,
  updates: Partial<OrderParams>
): Promise<OrderMutationResponse> {
  const params = new URLSearchParams({ orderId: String(orderId) });
  return appFetch<OrderMutationResponse>(`/api/ibkr/orders?${params}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function getAlerts(): Promise<AccountAlertSummary[]> {
  return appFetch<AccountAlertSummary[]>('/api/ibkr/alerts');
}

export async function getAlertDetails(
  alertId: number | string
): Promise<AccountAlertDetail> {
  const params = new URLSearchParams({ alertId: String(alertId) });
  return appFetch<AccountAlertDetail>(`/api/ibkr/alerts?${params}`);
}

export async function createAlert(
  payload: AccountAlertCreateParams
): Promise<AccountAlertMutationResult> {
  return appFetch<AccountAlertMutationResult>('/api/ibkr/alerts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function setAlertActive(
  alertId: number | string,
  active: boolean
): Promise<AccountAlertMutationResult> {
  return appFetch<AccountAlertMutationResult>('/api/ibkr/alerts', {
    method: 'PATCH',
    body: JSON.stringify({ alertId: Number(alertId), active }),
  });
}

export async function deleteAlert(
  alertId: number | string
): Promise<AccountAlertMutationResult> {
  const params = new URLSearchParams({ alertId: String(alertId) });
  return appFetch<AccountAlertMutationResult>(`/api/ibkr/alerts?${params}`, {
    method: 'DELETE',
  });
}

export async function getNotifications(): Promise<FyiNotification[]> {
  return appFetch<FyiNotification[]>('/api/ibkr/notifications');
}

export async function getInstrumentDiagnostics(
  conid: number,
  exchange?: string
): Promise<InstrumentDiagnostics> {
  const params = new URLSearchParams({ conid: String(conid) });
  if (exchange) params.set('exchange', exchange);
  return appFetch<InstrumentDiagnostics>(`/api/ibkr/instrument/diagnostics?${params}`);
}

export async function searchInstruments(
  query: string,
  secType?: string
): Promise<SearchResult[]> {
  const sanitized = sanitizeInstrumentSearchQuery(query);
  if (!sanitized) return [];

  const params = new URLSearchParams({ q: sanitized });
  if (secType) params.set('secType', secType);
  return appFetch<SearchResult[]>(`/api/ibkr/search?${params}`);
}

export async function getScannerParams(): Promise<ScannerParams> {
  return appFetch<ScannerParams>('/api/ibkr/scanner/params');
}

export async function getCompactScannerParams(
  instrument?: string
): Promise<ScannerParams> {
  const params = new URLSearchParams({ compact: '1' });
  if (instrument) params.set('instrument', instrument);
  return appFetch<ScannerParams>(`/api/ibkr/scanner/params?${params}`);
}

export async function runScanner(
  request: ScannerRunRequest
): Promise<ScannerResult[]> {
  return appFetch<ScannerResult[]>('/api/ibkr/scanner', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
