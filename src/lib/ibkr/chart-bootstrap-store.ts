import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import type { HistoricalBar } from './types';

export interface ChartBootstrapCacheEntry {
  conid: number;
  timeframeKey: string;
  historyBars: HistoricalBar[];
  historyError: string | null;
  fetchedAt: number;
  requestPeriod: string | null;
  requestBar: string | null;
  coverageRatio: number | null;
}

interface ChartBootstrapStoreState {
  updatedAt: number;
  entries: Record<string, ChartBootstrapCacheEntry>;
}

const RUNTIME_DIR = join(process.cwd(), '.runtime');
const STORE_PATH = join(RUNTIME_DIR, 'ibkr-chart-bootstraps.json');
const STORE_TMP_PATH = join(RUNTIME_DIR, 'ibkr-chart-bootstraps.json.tmp');

export function getChartBootstrapStoreKey(
  conid: number,
  timeframeKey: string
): string {
  return `${conid}:${timeframeKey}`;
}

export async function getChartBootstrapEntry(
  conid: number,
  timeframeKey: string
): Promise<ChartBootstrapCacheEntry | null> {
  const state = await loadChartBootstrapStore();
  return state.entries[getChartBootstrapStoreKey(conid, timeframeKey)] ?? null;
}

export async function getChartBootstrapEntriesForConid(
  conid: number
): Promise<ChartBootstrapCacheEntry[]> {
  const state = await loadChartBootstrapStore();
  return Object.values(state.entries)
    .filter((entry) => entry.conid === conid)
    .sort((left, right) => {
      if (left.fetchedAt !== right.fetchedAt) {
        return right.fetchedAt - left.fetchedAt;
      }
      return left.timeframeKey.localeCompare(right.timeframeKey);
    });
}

export async function setChartBootstrapEntry(
  entry: ChartBootstrapCacheEntry
): Promise<void> {
  const state = await loadChartBootstrapStore();
  const sanitized = sanitizeEntry(entry);
  if (!sanitized) return;
  state.entries[getChartBootstrapStoreKey(entry.conid, entry.timeframeKey)] =
    sanitized;
  state.updatedAt = Date.now();
  await saveChartBootstrapStore(state);
}

async function loadChartBootstrapStore(): Promise<ChartBootstrapStoreState> {
  try {
    const raw = await readFile(STORE_PATH, 'utf-8');
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return createEmptyStore();
  }
}

async function saveChartBootstrapStore(
  state: ChartBootstrapStoreState
): Promise<void> {
  await mkdir(RUNTIME_DIR, { recursive: true });
  const tmpPath = `${STORE_TMP_PATH}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  await writeFile(
    tmpPath,
    JSON.stringify(sanitizeStore(state), null, 2),
    'utf-8'
  );
  await rename(tmpPath, STORE_PATH);
}

function createEmptyStore(): ChartBootstrapStoreState {
  return {
    updatedAt: 0,
    entries: {},
  };
}

function sanitizeStore(value: unknown): ChartBootstrapStoreState {
  const state = createEmptyStore();
  if (!value || typeof value !== 'object') return state;

  const record = value as Record<string, unknown>;
  state.updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : 0;

  if (record.entries && typeof record.entries === 'object') {
    for (const [key, rawEntry] of Object.entries(
      record.entries as Record<string, unknown>
    )) {
      const entry = sanitizeEntry(rawEntry);
      if (entry) {
        state.entries[key] = entry;
      }
    }
  }

  return state;
}

function sanitizeEntry(value: unknown): ChartBootstrapCacheEntry | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const conid = Number(record.conid);
  const timeframeKey = String(record.timeframeKey ?? '');
  if (!Number.isInteger(conid) || conid <= 0 || timeframeKey.length === 0) {
    return null;
  }

  const historyBars = Array.isArray(record.historyBars)
    ? record.historyBars
        .map((bar) => sanitizeBar(bar))
        .filter((bar): bar is HistoricalBar => bar != null)
    : [];

  return {
    conid,
    timeframeKey,
    historyBars,
    historyError:
      typeof record.historyError === 'string' ? record.historyError : null,
    fetchedAt:
      typeof record.fetchedAt === 'number' && Number.isFinite(record.fetchedAt)
        ? record.fetchedAt
        : 0,
    requestPeriod:
      typeof record.requestPeriod === 'string' ? record.requestPeriod : null,
    requestBar: typeof record.requestBar === 'string' ? record.requestBar : null,
    coverageRatio:
      typeof record.coverageRatio === 'number' &&
      Number.isFinite(record.coverageRatio)
        ? record.coverageRatio
        : null,
  };
}

function sanitizeBar(value: unknown): HistoricalBar | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const time = Number(record.time);
  const open = Number(record.open);
  const high = Number(record.high);
  const low = Number(record.low);
  const close = Number(record.close);
  const volume = Number(record.volume);

  if (
    !Number.isFinite(time) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !Number.isFinite(volume)
  ) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume,
  };
}
