import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  MarketDataSnapshot,
  WatchlistData,
  WatchlistStateData,
} from './types';
import { normalizeWatchlistItems } from './normalize-instrument';

const WATCHLIST_PATH = join(process.cwd(), 'data', 'watchlist.json');
const WATCHLIST_STATE_PATH = join(process.cwd(), 'data', 'watchlist-state.json');
const WATCHLIST_BACKUP_PATH = join(process.cwd(), 'data', 'watchlist.backup.json');
const WATCHLIST_STATE_BACKUP_PATH = join(
  process.cwd(),
  'data',
  'watchlist-state.backup.json'
);

export async function loadWatchlistItems(): Promise<WatchlistData> {
  try {
    const raw = await readFile(WATCHLIST_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as WatchlistData;
    const normalized = { items: normalizeWatchlistItems(parsed.items ?? []) };
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await saveWatchlistItems(normalized);
    }
    if (normalized.items.length > 0) {
      return normalized;
    }
  } catch {
    // Fall through to backup recovery.
  }

  const backup = await loadWatchlistItemsBackup();
  if (backup.items.length > 0) {
    await writeWatchlistJson(WATCHLIST_PATH, backup);
    return backup;
  }

  return { items: [] };
}

export async function saveWatchlistItems(data: WatchlistData): Promise<void> {
  const payload = { items: normalizeWatchlistItems(data.items ?? []) };
  await writeWatchlistJson(WATCHLIST_PATH, payload);
  if (payload.items.length > 0) {
    await writeWatchlistJson(WATCHLIST_BACKUP_PATH, payload);
  }
}

export async function loadWatchlistState(): Promise<WatchlistStateData> {
  const items = await loadWatchlistItems();

  try {
    const raw = await readFile(WATCHLIST_STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as WatchlistStateData;
    const prices = filterWatchlistPrices(items.items, parsed.prices);

    if (items.items.length > 0 || prices.length > 0) {
      return {
        items: items.items,
        prices,
      };
    }
  } catch {
    // Fall through to backup recovery.
  }

  const backup = await loadWatchlistStateBackup();
  if (backup.items.length > 0) {
    await saveWatchlistState(backup);
    return backup;
  }

  return {
    items: items.items,
    prices: [],
  };
}

export async function saveWatchlistState(data: WatchlistStateData): Promise<void> {
  const payload: WatchlistStateData = {
    items: normalizeWatchlistItems(data.items),
    prices: (data.prices ?? []).sort((a, b) => a.conid - b.conid),
  };
  await saveWatchlistItems({ items: payload.items });
  await writeWatchlistJson(WATCHLIST_STATE_PATH, payload);
  if (payload.items.length > 0) {
    await writeWatchlistJson(WATCHLIST_STATE_BACKUP_PATH, payload);
  }
}

export async function mergeWatchlistSnapshots(
  snapshots: MarketDataSnapshot[]
): Promise<void> {
  if (snapshots.length === 0) return;

  const state = await loadWatchlistState();
  const allowedConids = new Set(state.items.map((item) => item.conid));
  const existing = new Map(
    (state.prices ?? []).map((snapshot) => [snapshot.conid, snapshot] as const)
  );

  for (const snapshot of snapshots) {
    if (!allowedConids.has(snapshot.conid)) continue;
    existing.set(snapshot.conid, snapshot);
  }

  await saveWatchlistState({
    items: state.items,
    prices: Array.from(existing.values()),
  });
}

async function loadWatchlistItemsBackup(): Promise<WatchlistData> {
  try {
    const raw = await readFile(WATCHLIST_BACKUP_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as WatchlistData;
    return { items: normalizeWatchlistItems(parsed.items ?? []) };
  } catch {
    return { items: [] };
  }
}

async function loadWatchlistStateBackup(): Promise<WatchlistStateData> {
  try {
    const raw = await readFile(WATCHLIST_STATE_BACKUP_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as WatchlistStateData;
    const items = normalizeWatchlistItems(parsed.items ?? []);
    return {
      items,
      prices: filterWatchlistPrices(items, parsed.prices),
    };
  } catch {
    return { items: [], prices: [] };
  }
}

function filterWatchlistPrices(
  items: WatchlistStateData['items'],
  prices: MarketDataSnapshot[] | undefined
): MarketDataSnapshot[] {
  const allowedConids = new Set(items.map((item) => item.conid));
  return Array.isArray(prices)
    ? prices
        .filter((snapshot) => allowedConids.has(snapshot.conid))
        .sort((a, b) => a.conid - b.conid)
    : [];
}

async function writeWatchlistJson(
  path: string,
  data: WatchlistData | WatchlistStateData
): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}
