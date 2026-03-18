import { spawn } from 'child_process';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  LiveFeedQuery,
  LiveFeedResponse,
  LiveFeedState,
  StreamingChartBeat,
  StreamingPrice,
} from './live-feed-types';
import { loadWatchlistItems } from './watchlist-state';

interface LiveFeedRegistry {
  trackedConids: Record<string, number>;
}

const RUNTIME_DIR = join(process.cwd(), '.runtime');
const DAEMON_SCRIPT_PATH = join(process.cwd(), 'scripts', 'ibkr-live-feed-daemon.mjs');
const LIVE_FEED_STATE_PATH = join(RUNTIME_DIR, 'ibkr-live-feed.json');
const LIVE_FEED_STATE_TMP_PATH = join(RUNTIME_DIR, 'ibkr-live-feed.json.tmp');
const LIVE_FEED_REGISTRY_PATH = join(RUNTIME_DIR, 'ibkr-live-feed-registry.json');
const LIVE_FEED_REGISTRY_TMP_PATH = join(
  RUNTIME_DIR,
  'ibkr-live-feed-registry.json.tmp'
);
const LIVE_FEED_PID_PATH = join(RUNTIME_DIR, 'ibkr-live-feed.pid');
const TRACK_TTL_MS = 5 * 60 * 1000;
const LIVE_FEED_STALE_MS = 20 * 1000;
const LIVE_FEED_MAX_BEAT_LAG_MS = 20 * 1000;
const LIVE_FEED_RESTART_COOLDOWN_MS = 30 * 1000;
let ensureDaemonPromise: Promise<boolean> | null = null;
let lastDaemonRestartAt = 0;

export function createEmptyLiveFeedState(): LiveFeedState {
  return {
    connected: false,
    source: 'snapshot-daemon',
    updatedAt: 0,
    lastSuccessAt: 0,
    error: null,
    prices: {},
    chartBeats: {},
  };
}

function isLiveFeedStateFresh(state: LiveFeedState, now = Date.now()) {
  return (
    state.connected &&
    state.lastSuccessAt > 0 &&
    now - state.lastSuccessAt <= LIVE_FEED_STALE_MS
  );
}

function getLiveFeedEffectiveError(state: LiveFeedState, now = Date.now()) {
  if (!state.connected) {
    return state.error ?? 'Live feed daemon disconnected';
  }
  if (state.lastSuccessAt <= 0 || now - state.lastSuccessAt > LIVE_FEED_STALE_MS) {
    return state.error ?? 'Live feed daemon stale';
  }
  return state.error;
}

function createEmptyRegistry(): LiveFeedRegistry {
  return {
    trackedConids: {},
  };
}

export async function loadLiveFeedState(): Promise<LiveFeedState> {
  try {
    const raw = await readFile(LIVE_FEED_STATE_PATH, 'utf-8');
    return sanitizeLiveFeedState(JSON.parse(raw));
  } catch {
    return createEmptyLiveFeedState();
  }
}

export async function saveLiveFeedState(state: LiveFeedState): Promise<void> {
  await ensureRuntimeDir();
  const payload = JSON.stringify(sanitizeLiveFeedState(state), null, 2);
  const tmpPath = `${LIVE_FEED_STATE_TMP_PATH}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  await writeFile(tmpPath, payload, 'utf-8');
  await rename(tmpPath, LIVE_FEED_STATE_PATH);
}

export async function loadLiveFeedRegistry(): Promise<LiveFeedRegistry> {
  try {
    const raw = await readFile(LIVE_FEED_REGISTRY_PATH, 'utf-8');
    return sanitizeRegistry(JSON.parse(raw));
  } catch {
    return createEmptyRegistry();
  }
}

export async function registerTrackedConids(conids: number[]): Promise<void> {
  if (conids.length === 0) return;

  const registry = await loadLiveFeedRegistry();
  const now = Date.now();

  for (const conid of conids) {
    if (Number.isInteger(conid) && conid > 0) {
      registry.trackedConids[String(conid)] = now;
    }
  }

  await saveLiveFeedRegistry(registry);
}

export async function getTrackedConids(): Promise<number[]> {
  const registry = await loadLiveFeedRegistry();
  const watchlist = await loadWatchlistItems().catch(() => ({ items: [] }));
  const now = Date.now();
  const merged = new Set<number>();

  for (const item of watchlist.items) {
    if (Number.isInteger(item.conid) && item.conid > 0) {
      merged.add(item.conid);
      registry.trackedConids[String(item.conid)] = now;
    }
  }

  for (const [rawConid, requestedAt] of Object.entries(registry.trackedConids)) {
    const conid = Number(rawConid);
    if (!Number.isInteger(conid) || conid <= 0) continue;
    if (now - requestedAt > TRACK_TTL_MS) {
      delete registry.trackedConids[rawConid];
      continue;
    }
    merged.add(conid);
  }

  await saveLiveFeedRegistry(registry);
  return Array.from(merged.values()).sort((left, right) => left - right);
}

async function readDaemonPid(): Promise<number | null> {
  try {
    const raw = await readFile(LIVE_FEED_PID_PATH, 'utf-8');
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startDaemonSupervisor() {
  const child = spawn(process.execPath, [DAEMON_SCRIPT_PATH, 'start'], {
    cwd: process.cwd(),
    detached: false,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

async function waitForPidExit(pid: number, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function ensureLiveFeedDaemon(): Promise<boolean> {
  if (ensureDaemonPromise) return ensureDaemonPromise;

  ensureDaemonPromise = (async () => {
    const now = Date.now();
    const pid = await readDaemonPid();
    const running = pid != null && isPidRunning(pid);
    const state = await loadLiveFeedState();
    const fresh = isLiveFeedStateFresh(state, now);

    if (running && fresh) {
      return false;
    }

    if (now - lastDaemonRestartAt < LIVE_FEED_RESTART_COOLDOWN_MS) {
      return false;
    }

    if (running && pid != null) {
      try {
        process.kill(pid, 'SIGTERM');
        await waitForPidExit(pid);
      } catch {
        // Ignore and attempt a clean start below.
      }
    }

    lastDaemonRestartAt = now;
    startDaemonSupervisor();
    return true;
  })().finally(() => {
    ensureDaemonPromise = null;
  });

  return ensureDaemonPromise;
}

export async function getLiveFeedResponse(
  conids: number[],
  query?: Partial<LiveFeedQuery>
): Promise<LiveFeedResponse> {
  const state = await loadLiveFeedState();
  const now = Date.now();
  const fresh = isLiveFeedStateFresh(state, now);
  const selectedConids =
    conids.length > 0
      ? conids.filter((conid) => Number.isInteger(conid) && conid > 0)
      : [];

  return {
    connected: fresh,
    source: state.source,
    updatedAt: state.updatedAt,
    lastSuccessAt: state.lastSuccessAt,
    error: getLiveFeedEffectiveError(state, now),
    prices: fresh
      ? selectedConids.length > 0
        ? selectedConids
            .map((conid) => state.prices[String(conid)] ?? null)
            .filter((price): price is StreamingPrice => price != null)
        : []
      : [],
    chartBeats: fresh
      ? buildChartBeatPayload(
          state.chartBeats,
          selectedConids,
          query?.beatsSince ?? {},
          now
        )
      : {},
  };
}

export async function getLiveFeedSeedBeats(
  conid: number,
  windowMs: number
): Promise<StreamingChartBeat[]> {
  const state = await loadLiveFeedState();
  const now = Date.now();
  if (!isLiveFeedStateFresh(state, now)) return [];
  const beats = state.chartBeats[String(conid)] ?? [];
  if (beats.length === 0) return [];
  const latestBeatAt = beats[beats.length - 1]?.timeMs ?? 0;
  if (latestBeatAt <= 0 || now - latestBeatAt > LIVE_FEED_MAX_BEAT_LAG_MS) {
    return [];
  }

  const cutoff = now - Math.max(windowMs, 0);
  return beats.filter((beat) => beat.timeMs >= cutoff);
}

async function saveLiveFeedRegistry(registry: LiveFeedRegistry): Promise<void> {
  await ensureRuntimeDir();
  const payload = JSON.stringify(sanitizeRegistry(registry), null, 2);
  const tmpPath = `${LIVE_FEED_REGISTRY_TMP_PATH}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  await writeFile(tmpPath, payload, 'utf-8');
  await rename(tmpPath, LIVE_FEED_REGISTRY_PATH);
}

function buildChartBeatPayload(
  chartBeats: Record<string, StreamingChartBeat[]>,
  conids: number[],
  beatsSince: Record<number, number>,
  now: number
): Record<string, StreamingChartBeat[]> {
  if (conids.length === 0) return {};

  const payload: Record<string, StreamingChartBeat[]> = {};
  for (const conid of conids) {
    const key = String(conid);
    const since = beatsSince[conid] ?? 0;
    const beats = chartBeats[key] ?? [];
    const latestBeatAt = beats[beats.length - 1]?.timeMs ?? 0;
    if (latestBeatAt <= 0 || now - latestBeatAt > LIVE_FEED_MAX_BEAT_LAG_MS) {
      payload[key] = [];
      continue;
    }
    payload[key] = since > 0 ? beats.filter((beat) => beat.timeMs > since) : beats;
  }
  return payload;
}

function sanitizeLiveFeedState(value: unknown): LiveFeedState {
  const state = createEmptyLiveFeedState();
  if (!value || typeof value !== 'object') return state;

  const record = value as Record<string, unknown>;
  state.connected = Boolean(record.connected);
  state.source = 'snapshot-daemon';
  state.updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : 0;
  state.lastSuccessAt =
    typeof record.lastSuccessAt === 'number' && Number.isFinite(record.lastSuccessAt)
      ? record.lastSuccessAt
      : 0;
  state.error =
    typeof record.error === 'string' && record.error.trim().length > 0
      ? record.error
      : null;

  if (record.prices && typeof record.prices === 'object') {
    for (const [key, rawPrice] of Object.entries(
      record.prices as Record<string, unknown>
    )) {
      const price = sanitizeStreamingPrice(rawPrice);
      if (price) {
        state.prices[key] = price;
      }
    }
  }

  if (record.chartBeats && typeof record.chartBeats === 'object') {
    for (const [key, rawBeats] of Object.entries(
      record.chartBeats as Record<string, unknown>
    )) {
      if (!Array.isArray(rawBeats)) continue;
      state.chartBeats[key] = rawBeats
        .map((beat) => sanitizeStreamingBeat(beat))
        .filter((beat): beat is StreamingChartBeat => beat != null)
        .sort((left, right) => left.timeMs - right.timeMs);
    }
  }

  return state;
}

function sanitizeRegistry(value: unknown): LiveFeedRegistry {
  const registry = createEmptyRegistry();
  if (!value || typeof value !== 'object') return registry;

  const tracked = (value as Record<string, unknown>).trackedConids;
  if (!tracked || typeof tracked !== 'object') return registry;

  for (const [key, rawValue] of Object.entries(
    tracked as Record<string, unknown>
  )) {
    const conid = Number(key);
    const requestedAt = Number(rawValue);
    if (
      Number.isInteger(conid) &&
      conid > 0 &&
      Number.isFinite(requestedAt) &&
      requestedAt > 0
    ) {
      registry.trackedConids[String(conid)] = requestedAt;
    }
  }

  return registry;
}

function sanitizeStreamingPrice(value: unknown): StreamingPrice | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const conid = Number(record.conid);
  if (!Number.isInteger(conid) || conid <= 0) return null;

  return {
    conid,
    last: toFiniteNumber(record.last),
    lastSize: toFiniteNumber(record.lastSize),
    displayPrice: toFiniteNumber(record.displayPrice),
    displayChange: toFiniteNumber(record.displayChange),
    displayChangePct: String(record.displayChangePct ?? '0%'),
    displaySource: sanitizePriceSource(record.displaySource),
    chartPrice: toFiniteNumber(record.chartPrice),
    chartSource: sanitizePriceSource(record.chartSource),
    bid: toFiniteNumber(record.bid),
    bidSize: toFiniteNumber(record.bidSize),
    ask: toFiniteNumber(record.ask),
    askSize: toFiniteNumber(record.askSize),
    change: toFiniteNumber(record.change),
    changePct: String(record.changePct ?? '0%'),
    volume: toFiniteNumber(record.volume),
    dayLow: toFiniteNumber(record.dayLow),
    dayHigh: toFiniteNumber(record.dayHigh),
    updated: toFiniteNumber(record.updated),
  };
}

function sanitizeStreamingBeat(value: unknown): StreamingChartBeat | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const timeMs = Number(record.timeMs);
  const beatValue = Number(record.value);
  if (!Number.isFinite(timeMs) || !Number.isFinite(beatValue)) return null;

  return {
    timeMs,
    value: beatValue,
    source: sanitizePriceSource(record.source),
  };
}

function sanitizePriceSource(value: unknown): StreamingPrice['chartSource'] {
  switch (value) {
    case 'mid':
    case 'last':
    case 'bid':
    case 'ask':
      return value;
    default:
      return 'none';
  }
}

function toFiniteNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function ensureRuntimeDir() {
  await mkdir(RUNTIME_DIR, { recursive: true });
}
