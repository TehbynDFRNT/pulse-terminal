import type {
  MarketDataSnapshot,
  MarketSessionPhase,
  ScannerResult,
} from './types';

export type RawMarketDataStatus =
  | 'live'
  | 'delayed'
  | 'frozen'
  | 'unavailable'
  | 'unknown';

export type MarketDataDisplayStatus =
  | 'live'
  | 'extended'
  | 'closed'
  | 'delayed'
  | 'frozen'
  | 'historical'
  | 'unavailable'
  | 'unknown';

export const DEFAULT_STALE_MARKET_DATA_MS = 15 * 60 * 1000;

interface MarketDataDisplayStatusArgs {
  marketDataStatus?: RawMarketDataStatus;
  sessionPhase?: MarketSessionPhase;
  updated?: number | null;
  lastActivityMs?: number | null;
  hasHistory?: boolean;
  staleMs?: number;
}

export function deriveMarketDataDisplayStatus({
  marketDataStatus = 'unknown',
  sessionPhase = 'unknown',
  updated,
  lastActivityMs,
  hasHistory = false,
  staleMs = DEFAULT_STALE_MARKET_DATA_MS,
}: MarketDataDisplayStatusArgs): MarketDataDisplayStatus {
  const activityMs = lastActivityMs ?? updated ?? null;

  switch (marketDataStatus) {
    case 'live':
      if (sessionPhase === 'extended') {
        return 'extended';
      }
      if (sessionPhase === 'closed') {
        return 'closed';
      }
      if (sessionPhase === 'regular') {
        return 'live';
      }
      if (
        activityMs != null &&
        Date.now() - activityMs > staleMs
      ) {
        return 'closed';
      }
      return 'live';
    case 'delayed':
      return 'delayed';
    case 'frozen':
      if (sessionPhase === 'closed') {
        return 'closed';
      }
      return 'frozen';
    case 'unavailable':
      return hasHistory ? 'historical' : 'unavailable';
    case 'unknown':
    default:
      return hasHistory ? 'historical' : 'unknown';
  }
}

export function aggregateMarketDataDisplayStatus(
  statuses: MarketDataDisplayStatus[]
): MarketDataDisplayStatus {
  if (statuses.some((status) => status === 'live')) return 'live';
  if (statuses.some((status) => status === 'extended')) return 'extended';
  if (statuses.some((status) => status === 'closed')) return 'closed';
  if (statuses.some((status) => status === 'delayed')) return 'delayed';
  if (statuses.some((status) => status === 'frozen')) return 'frozen';
  if (statuses.some((status) => status === 'historical')) return 'historical';
  if (statuses.some((status) => status === 'unavailable')) return 'unavailable';
  return 'unknown';
}

export function getMarketDataDisplayLabel(
  status: MarketDataDisplayStatus
): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'extended':
      return 'Extended';
    case 'closed':
      return 'Closed';
    case 'delayed':
      return 'Delayed';
    case 'frozen':
      return 'Frozen';
    case 'historical':
      return 'Historical';
    case 'unavailable':
      return 'No Data';
    default:
      return 'Gateway';
  }
}

export function getMarketDataDisplayCode(
  status: MarketDataDisplayStatus,
  sessionPhase: MarketSessionPhase = 'unknown'
): string {
  if (status === 'live' && sessionPhase === 'regular') return 'REG';
  if (status === 'extended' && sessionPhase === 'extended') return 'EXT';

  switch (status) {
    case 'live':
      return 'LVE';
    case 'extended':
      return 'EXT';
    case 'closed':
      return 'CLS';
    case 'delayed':
      return 'DLY';
    case 'frozen':
      return 'FRZ';
    case 'historical':
      return 'HIS';
    case 'unavailable':
      return 'NOD';
    default:
      return 'UNK';
  }
}

export function getMarketDataDisplayMark(
  status: MarketDataDisplayStatus,
  sessionPhase: MarketSessionPhase = 'unknown'
): string {
  if (status === 'live' && sessionPhase === 'regular') return 'R';
  if (status === 'extended' && sessionPhase === 'extended') return 'X';

  switch (status) {
    case 'live':
      return 'L';
    case 'extended':
      return 'X';
    case 'closed':
      return 'C';
    case 'delayed':
      return 'D';
    case 'frozen':
      return 'F';
    case 'historical':
      return 'H';
    case 'unavailable':
      return 'N';
    default:
      return '?';
  }
}

export function getMarketDataDisplayDotClass(
  status: MarketDataDisplayStatus | null
): string {
  switch (status) {
    case 'live':
      return 'bg-emerald-500';
    case 'extended':
      return 'bg-sky-500';
    case 'closed':
      return 'bg-orange-500';
    case 'delayed':
      return 'bg-amber-500';
    case 'frozen':
      return 'bg-sky-500';
    case 'historical':
      return 'bg-zinc-500';
    case 'unavailable':
      return 'bg-red-500';
    default:
      return 'bg-zinc-500';
  }
}

export function getMarketDataDisplayTextClass(
  status: MarketDataDisplayStatus | null
): string {
  switch (status) {
    case 'live':
      return 'text-zinc-500';
    case 'extended':
      return 'text-sky-400';
    case 'closed':
      return 'text-orange-400';
    case 'delayed':
      return 'text-amber-400';
    case 'frozen':
      return 'text-sky-400';
    case 'historical':
      return 'text-zinc-400';
    case 'unavailable':
      return 'text-red-400';
    default:
      return 'text-zinc-500';
  }
}

export function getMarketDataDisplayBadgeClass(
  status: MarketDataDisplayStatus
): string {
  switch (status) {
    case 'live':
      return 'bg-emerald-500/10 text-emerald-400';
    case 'extended':
      return 'bg-sky-500/10 text-sky-400';
    case 'closed':
      return 'bg-orange-500/10 text-orange-400';
    case 'delayed':
      return 'bg-amber-500/10 text-amber-400';
    case 'frozen':
      return 'bg-sky-500/10 text-sky-400';
    case 'historical':
      return 'bg-zinc-500/10 text-zinc-400';
    case 'unavailable':
      return 'bg-red-500/10 text-red-400';
    default:
      return 'bg-zinc-800 text-zinc-400';
  }
}

export function deriveSnapshotDisplayStatus(
  snapshot: Pick<MarketDataSnapshot, 'marketDataStatus' | 'updated' | 'last' | 'open' | 'prevClose' | 'dayLow' | 'dayHigh'>,
  sessionPhase?: MarketSessionPhase
): MarketDataDisplayStatus {
  const hasHistory =
    snapshot.last > 0 ||
    snapshot.open > 0 ||
    snapshot.prevClose > 0 ||
    snapshot.dayLow > 0 ||
    snapshot.dayHigh > 0;

  return deriveMarketDataDisplayStatus({
    marketDataStatus: snapshot.marketDataStatus,
    sessionPhase,
    updated: snapshot.updated,
    hasHistory,
  });
}

export function deriveScannerDisplayStatus(
  result: Pick<ScannerResult, 'marketDataStatus'> & { updated?: number },
  sessionPhase?: MarketSessionPhase
): MarketDataDisplayStatus {
  return deriveMarketDataDisplayStatus({
    marketDataStatus: result.marketDataStatus,
    sessionPhase,
    updated: result.updated,
  });
}
