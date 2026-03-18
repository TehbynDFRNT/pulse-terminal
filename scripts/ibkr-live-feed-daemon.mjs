#!/usr/bin/env node

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RUNTIME_DIR = path.join(ROOT, '.runtime');
const STATE_FILE = path.join(RUNTIME_DIR, 'ibkr-live-feed.json');
const STATE_TMP_FILE = path.join(RUNTIME_DIR, 'ibkr-live-feed.json.tmp');
const REGISTRY_FILE = path.join(RUNTIME_DIR, 'ibkr-live-feed-registry.json');
const REGISTRY_TMP_FILE = path.join(RUNTIME_DIR, 'ibkr-live-feed-registry.json.tmp');
const CHART_BOOTSTRAP_FILE = path.join(RUNTIME_DIR, 'ibkr-chart-bootstraps.json');
const CHART_BOOTSTRAP_TMP_FILE = path.join(
  RUNTIME_DIR,
  'ibkr-chart-bootstraps.json.tmp'
);
const WATCHLIST_FILE = path.join(ROOT, 'data', 'watchlist.json');
const PID_FILE = path.join(RUNTIME_DIR, 'ibkr-live-feed.pid');
const LOG_FILE = path.join(RUNTIME_DIR, 'ibkr-live-feed.log');
const DEFAULT_GATEWAY_URL = 'https://localhost:5050';
const DEFAULT_BASE_PATH = '/v1/api';
const DEFAULT_INTERVAL_MS = 1_000;
const TRACK_TTL_MS = 5 * 60 * 1000;
const BEAT_RETENTION_MS = 6 * 60 * 60 * 1000;
const MAX_BEATS = 20_000;
const PREWARM_SWEEP_INTERVAL_MS = 10_000;
const PREWARM_MAX_REQUESTS_PER_SWEEP = 2;
const CHART_BOOTSTRAP_ERROR_REFRESH_MS = 15 * 60 * 1000;
const WATCHLIST_FIELDS = '31,55,58,6509,84,88,86,85,7059,82,83,7282,71,70,7295,7741,7296';
const MEDIUM_WINDOW_THRESHOLD_SECS = 24 * 60 * 60;
const LONG_WINDOW_THRESHOLD_SECS = 30 * 24 * 60 * 60;
const MIN_MEDIUM_WINDOW_COVERAGE_RATIO = 0.9;
const MIN_LONG_WINDOW_COVERAGE_RATIO = 0.8;
const REQUEST_BAR_SECS = {
  '1min': 60,
  '5min': 5 * 60,
  '15min': 15 * 60,
  '30min': 30 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
};
const CHART_TIMEFRAMES = [
  {
    key: '5m',
    windowSecs: 5 * 60,
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
    ],
  },
  {
    key: '15m',
    windowSecs: 15 * 60,
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
    ],
  },
  {
    key: '30m',
    windowSecs: 30 * 60,
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
    ],
  },
  {
    key: '1h',
    windowSecs: 60 * 60,
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
    ],
  },
  {
    key: '4h',
    windowSecs: 4 * 60 * 60,
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
      { period: '3M', bar: '4h' },
    ],
  },
  {
    key: '1D',
    windowSecs: 24 * 60 * 60,
    requests: [
      { period: '1d', bar: '1min' },
      { period: '2d', bar: '5min' },
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
      { period: '1Y', bar: '1d' },
    ],
  },
  {
    key: '1W',
    windowSecs: 7 * 24 * 60 * 60,
    requests: [
      { period: '5d', bar: '15min' },
      { period: '1M', bar: '1h' },
      { period: '3M', bar: '4h' },
      { period: '1Y', bar: '1d' },
    ],
  },
  {
    key: '1M',
    windowSecs: 30 * 24 * 60 * 60,
    requests: [
      { period: '1Y', bar: '1d' },
      { period: '3M', bar: '4h' },
      { period: '1M', bar: '1h' },
    ],
  },
  {
    key: '3M',
    windowSecs: 90 * 24 * 60 * 60,
    requests: [
      { period: '1Y', bar: '1d' },
      { period: '3M', bar: '4h' },
    ],
  },
  {
    key: '1Y',
    windowSecs: 365 * 24 * 60 * 60,
    requests: [
      { period: '1Y', bar: '1d' },
      { period: '5Y', bar: '1w' },
    ],
  },
];

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function canonicalizeGatewayUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === '127.0.0.1' || url.hostname === '::1') {
      url.hostname = 'localhost';
    }
    return stripTrailingSlash(url.toString());
  } catch {
    return stripTrailingSlash(
      value.replace('127.0.0.1', 'localhost').replace('[::1]', 'localhost')
    );
  }
}

function parseEnvFile(filePath) {
  const env = {};

  if (!fs.existsSync(filePath)) return env;

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function getConfig() {
  const fileEnv = parseEnvFile(path.join(ROOT, '.env.local'));
  const gatewayUrl = canonicalizeGatewayUrl(
    process.env.IBKR_GATEWAY_URL ||
      fileEnv.IBKR_GATEWAY_URL ||
      DEFAULT_GATEWAY_URL
  );
  const basePath =
    process.env.IBKR_BASE_PATH || fileEnv.IBKR_BASE_PATH || DEFAULT_BASE_PATH;
  const intervalMs = Number(
    process.env.IBKR_LIVE_FEED_INTERVAL_MS ||
      fileEnv.IBKR_LIVE_FEED_INTERVAL_MS ||
      DEFAULT_INTERVAL_MS
  );

  return {
    baseUrl: `${gatewayUrl}${basePath}`,
    intervalMs:
      Number.isFinite(intervalMs) && intervalMs >= 1_000
        ? intervalMs
        : DEFAULT_INTERVAL_MS,
  };
}

function createEmptyState() {
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

function createEmptyRegistry() {
  return {
    trackedConids: {},
  };
}

function createEmptyChartBootstrapState() {
  return {
    updatedAt: 0,
    entries: {},
  };
}

function logLine(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

async function ensureRuntimeDir() {
  await fsp.mkdir(RUNTIME_DIR, { recursive: true });
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid() {
  try {
    const raw = await fsp.readFile(PID_FILE, 'utf8');
    const pid = Number(raw.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function clearStalePidFile() {
  const pid = await readPid();
  if (pid && !isPidRunning(pid)) {
    await fsp.rm(PID_FILE, { force: true });
  }
}

async function loadJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, tmpPath, value) {
  await ensureRuntimeDir();
  const uniqueTmpPath = `${tmpPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  await fsp.writeFile(uniqueTmpPath, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(uniqueTmpPath, filePath);
}

async function loadState() {
  return sanitizeState(await loadJson(STATE_FILE, createEmptyState()));
}

async function saveState(state) {
  await writeJsonAtomic(STATE_FILE, STATE_TMP_FILE, sanitizeState(state));
}

async function loadRegistry() {
  return sanitizeRegistry(await loadJson(REGISTRY_FILE, createEmptyRegistry()));
}

async function saveRegistry(registry) {
  await writeJsonAtomic(
    REGISTRY_FILE,
    REGISTRY_TMP_FILE,
    sanitizeRegistry(registry)
  );
}

async function loadChartBootstrapState() {
  return sanitizeChartBootstrapState(
    await loadJson(CHART_BOOTSTRAP_FILE, createEmptyChartBootstrapState())
  );
}

async function saveChartBootstrapState(state) {
  await writeJsonAtomic(
    CHART_BOOTSTRAP_FILE,
    CHART_BOOTSTRAP_TMP_FILE,
    sanitizeChartBootstrapState(state)
  );
}

async function loadWatchlistConids() {
  try {
    const raw = await fsp.readFile(WATCHLIST_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => Number(item?.conid))
          .filter((conid) => Number.isInteger(conid) && conid > 0)
      : [];
  } catch {
    return [];
  }
}

async function getTrackedConids() {
  const registry = await loadRegistry();
  const watchlistConids = await loadWatchlistConids();
  const now = Date.now();
  const tracked = new Set();

  for (const conid of watchlistConids) {
    tracked.add(conid);
    registry.trackedConids[String(conid)] = now;
  }

  for (const [rawConid, requestedAt] of Object.entries(registry.trackedConids)) {
    const conid = Number(rawConid);
    if (!Number.isInteger(conid) || conid <= 0) continue;
    if (now - requestedAt > TRACK_TTL_MS) {
      delete registry.trackedConids[rawConid];
      continue;
    }
    tracked.add(conid);
  }

  await saveRegistry(registry);
  return Array.from(tracked.values()).sort((left, right) => left - right);
}

async function requestJson(baseUrl, pathName) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'pulse-terminal-live-feed/1.0',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }

  return response.json();
}

async function checkAuthStatus(config) {
  try {
    const status = await requestJson(config.baseUrl, '/iserver/auth/status');
    return Boolean(status?.connected && status?.authenticated);
  } catch {
    return false;
  }
}

function getChartBootstrapKey(conid, timeframeKey) {
  return `${conid}:${timeframeKey}`;
}

function getChartBootstrapRefreshMs(windowSecs) {
  if (windowSecs <= 60 * 60) return 30_000;
  if (windowSecs <= 24 * 60 * 60) return 60_000;
  if (windowSecs <= 7 * 24 * 60 * 60) return 5 * 60_000;
  if (windowSecs <= 30 * 24 * 60 * 60) return 10 * 60_000;
  return 30 * 60_000;
}

function getHistoryCoverageRatio(bars, timeframe, requestBar) {
  if (!bars.length) return 0;

  const firstSecs = Math.floor(bars[0].time / 1000);
  const lastSecs = Math.floor(bars[bars.length - 1].time / 1000);
  const barSecs = estimateBarSecs(bars, requestBar);
  const coveredWindowSecs = Math.max(0, lastSecs - firstSecs) + barSecs;

  return coveredWindowSecs / timeframe.windowSecs;
}

function hasSufficientHistoryCoverage(bars, timeframe, requestBar) {
  if (!bars.length) return false;
  const coverageRatio = getHistoryCoverageRatio(bars, timeframe, requestBar);
  if (timeframe.windowSecs < MEDIUM_WINDOW_THRESHOLD_SECS) return true;
  if (timeframe.windowSecs < LONG_WINDOW_THRESHOLD_SECS) {
    return coverageRatio >= MIN_MEDIUM_WINDOW_COVERAGE_RATIO;
  }
  return coverageRatio >= MIN_LONG_WINDOW_COVERAGE_RATIO;
}

function estimateBarSecs(bars, requestBar) {
  for (let index = 1; index < bars.length; index += 1) {
    const diffSecs = Math.round((bars[index].time - bars[index - 1].time) / 1000);
    if (diffSecs > 0) return diffSecs;
  }

  return REQUEST_BAR_SECS[requestBar] ?? 0;
}

function isNonFatalHistoryError(error) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('503') ||
    message.includes('504') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('timed out') ||
    message.includes('no data') ||
    message.includes('no historical data') ||
    message.includes('outside of data farm')
  );
}

async function fetchHistoricalData(config, conid, period, bar, outsideRth = true) {
  const params = new URLSearchParams({
    conid: String(conid),
    period,
    bar,
    outsideRth: String(outsideRth),
    barType: 'last',
  });
  const payload = await requestJson(
    config.baseUrl,
    `/iserver/marketdata/history?${params.toString()}`
  );

  return Array.isArray(payload?.data)
    ? payload.data.map((barData) => ({
        time: Number(barData.t),
        open: Number(barData.o),
        high: Number(barData.h),
        low: Number(barData.l),
        close: Number(barData.c),
        volume: Number(barData.v) * Number(payload.volumeFactor ?? 1),
      }))
    : [];
}

async function loadHistoryWithFallback(config, conid, timeframe) {
  let lastError = null;
  let bestBars = [];
  let bestCoverageRatio = 0;
  let bestRequest = null;

  for (const request of timeframe.requests) {
    try {
      const bars = await fetchHistoricalData(
        config,
        conid,
        request.period,
        request.bar,
        true
      );
      if (bars.length > 0) {
        const coverageRatio = getHistoryCoverageRatio(bars, timeframe, request.bar);
        if (coverageRatio > bestCoverageRatio) {
          bestBars = bars;
          bestCoverageRatio = coverageRatio;
          bestRequest = request;
        }

        if (hasSufficientHistoryCoverage(bars, timeframe, request.bar)) {
          return {
            historyBars: bars,
            historyError: null,
            requestPeriod: request.period,
            requestBar: request.bar,
            coverageRatio,
          };
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'History fetch failed';
      if (!isNonFatalHistoryError(error)) {
        break;
      }
    }
  }

  return {
    historyBars: bestBars,
    historyError:
      bestBars.length > 0 && lastError == null && bestCoverageRatio > 0
        ? 'Available history does not cover the full requested window'
        : lastError,
    requestPeriod: bestRequest?.period ?? null,
    requestBar: bestRequest?.bar ?? null,
    coverageRatio: bestCoverageRatio > 0 ? bestCoverageRatio : null,
  };
}

async function prewarmChartBootstraps(config) {
  const conids = await loadWatchlistConids();
  const state = await loadChartBootstrapState();
  const allowedConids = new Set(conids);
  const now = Date.now();
  let changed = false;

  for (const key of Object.keys(state.entries)) {
    const entry = state.entries[key];
    if (!entry || allowedConids.has(entry.conid)) {
      continue;
    }
    delete state.entries[key];
    changed = true;
  }

  if (conids.length === 0) {
    if (changed) {
      state.updatedAt = Date.now();
      await saveChartBootstrapState(state);
    }
    return;
  }

  const candidates = [];
  for (const conid of conids) {
    for (const timeframe of CHART_TIMEFRAMES) {
      const key = getChartBootstrapKey(conid, timeframe.key);
      const existing = state.entries[key] ?? null;
      const refreshMs = existing?.historyError
        ? CHART_BOOTSTRAP_ERROR_REFRESH_MS
        : getChartBootstrapRefreshMs(timeframe.windowSecs);

      if (existing && now - existing.fetchedAt < refreshMs) {
        continue;
      }
      candidates.push({
        conid,
        timeframe,
        existingFetchedAt: existing?.fetchedAt ?? 0,
      });
    }
  }

  candidates.sort((left, right) => left.existingFetchedAt - right.existingFetchedAt);

  for (const candidate of candidates.slice(0, PREWARM_MAX_REQUESTS_PER_SWEEP)) {
    const next = await loadHistoryWithFallback(
      config,
      candidate.conid,
      candidate.timeframe
    );
    state.entries[getChartBootstrapKey(candidate.conid, candidate.timeframe.key)] = {
      conid: candidate.conid,
      timeframeKey: candidate.timeframe.key,
      historyBars: next.historyBars,
      historyError: next.historyError,
      fetchedAt: Date.now(),
      requestPeriod: next.requestPeriod,
      requestBar: next.requestBar,
      coverageRatio: next.coverageRatio,
    };
    changed = true;
  }

  if (changed) {
    state.updatedAt = Date.now();
    await saveChartBootstrapState(state);
  }
}

async function fetchSnapshots(config, conids) {
  if (conids.length === 0) return [];
  return requestJson(
    config.baseUrl,
    `/iserver/marketdata/snapshot?conids=${conids.join(',')}&fields=${WATCHLIST_FIELDS}`
  );
}

function sanitizeState(value) {
  const state = createEmptyState();
  if (!value || typeof value !== 'object') return state;

  state.connected = Boolean(value.connected);
  state.source = 'snapshot-daemon';
  state.updatedAt = toFiniteNumber(value.updatedAt);
  state.lastSuccessAt = toFiniteNumber(value.lastSuccessAt);
  state.error =
    typeof value.error === 'string' && value.error.trim().length > 0
      ? value.error
      : null;

  if (value.prices && typeof value.prices === 'object') {
    for (const [key, rawPrice] of Object.entries(value.prices)) {
      const price = sanitizeStreamingPrice(rawPrice);
      if (price) {
        state.prices[key] = price;
      }
    }
  }

  if (value.chartBeats && typeof value.chartBeats === 'object') {
    for (const [key, rawBeats] of Object.entries(value.chartBeats)) {
      if (!Array.isArray(rawBeats)) continue;
      state.chartBeats[key] = rawBeats
        .map((beat) => sanitizeBeat(beat))
        .filter(Boolean)
        .sort((left, right) => left.timeMs - right.timeMs);
    }
  }

  return state;
}

function sanitizeRegistry(value) {
  const registry = createEmptyRegistry();
  if (!value || typeof value !== 'object') return registry;
  if (!value.trackedConids || typeof value.trackedConids !== 'object') {
    return registry;
  }

  for (const [key, rawValue] of Object.entries(value.trackedConids)) {
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

function sanitizeChartBootstrapState(value) {
  const state = createEmptyChartBootstrapState();
  if (!value || typeof value !== 'object') return state;

  state.updatedAt = toFiniteNumber(value.updatedAt);

  if (value.entries && typeof value.entries === 'object') {
    for (const [key, rawEntry] of Object.entries(value.entries)) {
      const entry = sanitizeChartBootstrapEntry(rawEntry);
      if (entry) {
        state.entries[key] = entry;
      }
    }
  }

  return state;
}

function sanitizeChartBootstrapEntry(value) {
  if (!value || typeof value !== 'object') return null;

  const conid = Number(value.conid);
  const timeframeKey = String(value.timeframeKey ?? '');
  if (!Number.isInteger(conid) || conid <= 0 || timeframeKey.length === 0) {
    return null;
  }

  return {
    conid,
    timeframeKey,
    historyBars: Array.isArray(value.historyBars)
      ? value.historyBars
          .map((bar) => sanitizeHistoricalBar(bar))
          .filter(Boolean)
      : [],
    historyError:
      typeof value.historyError === 'string' ? value.historyError : null,
    fetchedAt: toFiniteNumber(value.fetchedAt),
    requestPeriod:
      typeof value.requestPeriod === 'string' ? value.requestPeriod : null,
    requestBar: typeof value.requestBar === 'string' ? value.requestBar : null,
    coverageRatio:
      Number.isFinite(Number(value.coverageRatio))
        ? Number(value.coverageRatio)
        : null,
  };
}

function sanitizeHistoricalBar(value) {
  if (!value || typeof value !== 'object') return null;

  const time = Number(value.time);
  const open = Number(value.open);
  const high = Number(value.high);
  const low = Number(value.low);
  const close = Number(value.close);
  const volume = Number(value.volume);

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

function sanitizeStreamingPrice(value) {
  if (!value || typeof value !== 'object') return null;
  const conid = Number(value.conid);
  if (!Number.isInteger(conid) || conid <= 0) return null;

  return {
    conid,
    last: toFiniteNumber(value.last),
    lastSize: toFiniteNumber(value.lastSize),
    displayPrice: toFiniteNumber(value.displayPrice),
    displayChange: toFiniteNumber(value.displayChange),
    displayChangePct: String(value.displayChangePct ?? '0%'),
    displaySource: sanitizeSource(value.displaySource),
    chartPrice: toFiniteNumber(value.chartPrice),
    chartSource: sanitizeSource(value.chartSource),
    bid: toFiniteNumber(value.bid),
    bidSize: toFiniteNumber(value.bidSize),
    ask: toFiniteNumber(value.ask),
    askSize: toFiniteNumber(value.askSize),
    change: toFiniteNumber(value.change),
    changePct: String(value.changePct ?? '0%'),
    volume: toFiniteNumber(value.volume),
    dayLow: toFiniteNumber(value.dayLow),
    dayHigh: toFiniteNumber(value.dayHigh),
    updated: toFiniteNumber(value.updated),
  };
}

function sanitizeBeat(value) {
  if (!value || typeof value !== 'object') return null;
  const timeMs = Number(value.timeMs);
  const beatValue = Number(value.value);
  if (!Number.isFinite(timeMs) || !Number.isFinite(beatValue)) return null;

  return {
    timeMs,
    value: beatValue,
    source: sanitizeSource(value.source),
  };
}

function sanitizeSource(value) {
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

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseNumericField(value) {
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

  switch (match[2]?.toUpperCase()) {
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

function parseChange(value) {
  return parseNumericField(value);
}

function getDisplayPrice({ last, bid, ask, prevClose, change, changePct }) {
  const validBid = bid > 0 ? bid : null;
  const validAsk = ask > 0 ? ask : null;
  const validLast = last > 0 ? last : null;
  const validPrevClose = prevClose > 0 ? prevClose : null;

  let displayPrice = 0;
  let displaySource = 'none';

  if (validBid != null && validAsk != null && validAsk >= validBid) {
    displayPrice = (validBid + validAsk) / 2;
    displaySource = 'mid';
  } else if (validLast != null) {
    displayPrice = validLast;
    displaySource = 'last';
  } else if (validBid != null) {
    displayPrice = validBid;
    displaySource = 'bid';
  } else if (validAsk != null) {
    displayPrice = validAsk;
    displaySource = 'ask';
  }

  if (displayPrice > 0 && validPrevClose != null) {
    const displayChange = displayPrice - validPrevClose;
    const displayChangePct = `${(displayChange / validPrevClose) * 100}%`;
    return { displayPrice, displayChange, displayChangePct, displaySource };
  }

  return {
    displayPrice,
    displayChange: Number.isFinite(change) ? change : 0,
    displayChangePct: changePct ? String(changePct) : '0%',
    displaySource,
  };
}

function getChartBeatPrice({ last, bid, ask, preferLast }) {
  const validBid = bid > 0 ? bid : null;
  const validAsk = ask > 0 ? ask : null;
  const validLast = last > 0 ? last : null;

  if (preferLast && validLast != null) {
    return { chartPrice: validLast, chartSource: 'last' };
  }
  if (validBid != null && validAsk != null && validAsk >= validBid) {
    return { chartPrice: (validBid + validAsk) / 2, chartSource: 'mid' };
  }
  if (validLast != null) {
    return { chartPrice: validLast, chartSource: 'last' };
  }
  if (validBid != null) {
    return { chartPrice: validBid, chartSource: 'bid' };
  }
  if (validAsk != null) {
    return { chartPrice: validAsk, chartSource: 'ask' };
  }
  return { chartPrice: 0, chartSource: 'none' };
}

function toStreamingPrice(item, existing) {
  const last = parseNumericField(item['31']);
  const lastSize = Math.round(parseNumericField(item['7059']));
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
  const hasFreshTradePrint =
    (Number.isFinite(last) &&
      last > 0 &&
      (!existing || existing.last !== last)) ||
    (Number.isFinite(lastSize) &&
      lastSize > 0 &&
      (!existing || existing.lastSize !== lastSize));
  const chart = getChartBeatPrice({
    last,
    bid,
    ask,
    preferLast: hasFreshTradePrint,
  });
  const updatedAt = Number(item._updated);

  return {
    conid: Number(item.conid),
    last,
    lastSize,
    displayPrice: display.displayPrice,
    displayChange: display.displayChange,
    displayChangePct: display.displayChangePct,
    displaySource: display.displaySource,
    chartPrice: chart.chartPrice,
    chartSource: chart.chartSource,
    bid,
    bidSize: Math.round(parseNumericField(item['88'])),
    ask,
    askSize: Math.round(parseNumericField(item['85'])),
    change,
    changePct,
    volume: Math.round(parseNumericField(item['7282_raw'] ?? item['7282'])),
    dayLow: parseNumericField(item['71']),
    dayHigh: parseNumericField(item['70']),
    updated: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  };
}

function appendBeat(existingBeats, price) {
  if (!(price.chartPrice > 0)) return existingBeats ?? [];

  const next = [...(existingBeats ?? [])];
  const beat = {
    timeMs: price.updated,
    value: price.chartPrice,
    source: price.chartSource,
  };
  const lastBeat = next[next.length - 1];
  if (
    lastBeat &&
    lastBeat.timeMs === beat.timeMs &&
    lastBeat.value === beat.value &&
    lastBeat.source === beat.source
  ) {
    return next;
  }

  next.push(beat);
  const cutoff = beat.timeMs - BEAT_RETENTION_MS;
  const pruned = next.filter((entry) => entry.timeMs >= cutoff);
  return pruned.length > MAX_BEATS
    ? pruned.slice(pruned.length - MAX_BEATS)
    : pruned;
}

async function tick(config) {
  const previousState = await loadState();
  const conids = await getTrackedConids();
  const trackedConids = new Set(conids);
  const nextState = {
    ...previousState,
    source: 'snapshot-daemon',
    updatedAt: Date.now(),
    error: null,
    prices: { ...previousState.prices },
    chartBeats: { ...previousState.chartBeats },
  };

  for (const key of Object.keys(nextState.prices)) {
    const conid = Number(key);
    if (Number.isInteger(conid) && trackedConids.has(conid)) {
      continue;
    }
    delete nextState.prices[key];
  }

  for (const key of Object.keys(nextState.chartBeats)) {
    const conid = Number(key);
    if (Number.isInteger(conid) && trackedConids.has(conid)) {
      continue;
    }
    delete nextState.chartBeats[key];
  }

  try {
    if (conids.length === 0) {
      nextState.connected = await checkAuthStatus(config);
      await saveState(nextState);
      return;
    }

    const snapshots = await fetchSnapshots(config, conids);
    for (const item of snapshots) {
      const conid = Number(item?.conid);
      if (!Number.isInteger(conid) || conid <= 0) continue;
      const key = String(conid);
      const price = toStreamingPrice(item, nextState.prices[key] ?? null);
      nextState.prices[key] = price;
      nextState.chartBeats[key] = appendBeat(nextState.chartBeats[key], price);
    }

    nextState.connected = true;
    nextState.lastSuccessAt = nextState.updatedAt;
    await saveState(nextState);
  } catch (error) {
    nextState.connected = await checkAuthStatus(config);
    nextState.error = error instanceof Error ? error.message : 'live feed tick failed';
    await saveState(nextState);
  }
}

async function startDaemon() {
  await ensureRuntimeDir();
  await clearStalePidFile();

  const existingPid = await readPid();
  if (existingPid && isPidRunning(existingPid)) {
    console.log(`live feed daemon already running (pid ${existingPid})`);
    return;
  }

  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [SCRIPT_PATH, 'daemon'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });

  child.unref();
  fs.closeSync(logFd);

  await fsp.writeFile(PID_FILE, `${child.pid}\n`, 'utf8');
  console.log(`started live feed daemon (pid ${child.pid})`);
  console.log(`log file: ${LOG_FILE}`);
}

async function stopDaemon() {
  await clearStalePidFile();
  const pid = await readPid();

  if (!pid) {
    console.log('live feed daemon is not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error instanceof Error) {
      console.log(`failed to stop pid ${pid}: ${error.message}`);
    }
    await fsp.rm(PID_FILE, { force: true });
    return;
  }

  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (isPidRunning(pid)) {
    process.kill(pid, 'SIGKILL');
  }

  await fsp.rm(PID_FILE, { force: true });
  console.log(`stopped live feed daemon (pid ${pid})`);
}

async function statusDaemon() {
  await clearStalePidFile();
  const pid = await readPid();
  const running = pid ? isPidRunning(pid) : false;
  const config = getConfig();
  const state = await loadState();
  const chartBootstraps = await loadChartBootstrapState();
  const trackedConids = await getTrackedConids();

  console.log(
    running ? `live feed daemon running (pid ${pid})` : 'live feed daemon not running'
  );
  console.log(`gateway: ${config.baseUrl}`);
  console.log(`interval: ${config.intervalMs}ms`);
  console.log(`tracked conids: ${trackedConids.join(', ') || '(none)'}`);
  console.log(`connected: ${state.connected}`);
  console.log(`updatedAt: ${state.updatedAt || 0}`);
  console.log(`lastSuccessAt: ${state.lastSuccessAt || 0}`);
  console.log(`error: ${state.error ?? '(none)'}`);
  console.log(
    `chart bootstraps: ${Object.keys(chartBootstraps.entries).length} cached`
  );
  console.log(`log file: ${LOG_FILE}`);
}

async function runDaemon() {
  await ensureRuntimeDir();
  const config = getConfig();
  const existingState = await loadState();
  await saveState({
    ...existingState,
    connected: false,
    error: null,
    source: 'snapshot-daemon',
  });
  logLine(`live feed daemon started: ${config.baseUrl} @ ${config.intervalMs}ms`);

  let shuttingDown = false;
  let prewarmPromise = null;
  let lastPrewarmSweepAt = 0;

  const maybePrewarmChartBootstraps = () => {
    if (shuttingDown || prewarmPromise) return;
    if (Date.now() - lastPrewarmSweepAt < PREWARM_SWEEP_INTERVAL_MS) return;

    lastPrewarmSweepAt = Date.now();
    prewarmPromise = prewarmChartBootstraps(config)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logLine(`chart bootstrap prewarm failed: ${message}`);
      })
      .finally(() => {
        prewarmPromise = null;
      });
  };

  const loop = setInterval(() => {
    if (shuttingDown) return;
    void tick(config);
    maybePrewarmChartBootstraps();
  }, config.intervalMs);

  const stop = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(loop);
    logLine(`received ${signal}, stopping live feed daemon`);
    await fsp.rm(PID_FILE, { force: true }).catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  await tick(config);
  maybePrewarmChartBootstraps();
}

async function main() {
  const command = process.argv[2] ?? 'status';

  switch (command) {
    case 'start':
      await startDaemon();
      break;
    case 'stop':
      await stopDaemon();
      break;
    case 'status':
      await statusDaemon();
      break;
    case 'daemon':
      await runDaemon();
      break;
    default:
      console.error(`unknown command: ${command}`);
      process.exitCode = 1;
  }
}

void main();
