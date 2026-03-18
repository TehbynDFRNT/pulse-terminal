'use client';

import type {
  ChartDiagnosticEntry,
  ChartDiagnosticRecord,
} from './chart-diagnostics-types';
export type { ChartDiagnosticEntry, ChartDiagnosticRecord } from './chart-diagnostics-types';

interface ChartDiagnosticsApi {
  record: (record: ChartDiagnosticRecord) => void;
  report: () => ChartDiagnosticEntry[];
  export: () => string;
  clear: () => void;
  sessionId: () => string;
}

const STORAGE_KEY = 'pulse:chart-diagnostics:v1';
const SESSION_KEY = 'pulse:chart-diagnostics:session:v1';
const MAX_ENTRIES = 180;
const EMPTY_ENTRIES: ChartDiagnosticEntry[] = [];
const SYNC_DEBOUNCE_MS = 300;

let entries: ChartDiagnosticEntry[] = EMPTY_ENTRIES;
let seq = 0;
let initialized = false;
let syncTimer: number | null = null;
let lastSignatureByScopeEvent = new Map<string, string>();
let lastEntryIndexByScopeEvent = new Map<string, number>();
let sessionId = '';

declare global {
  interface Window {
    __pulseDiagnostics?: ChartDiagnosticsApi;
  }
}

export function initChartDiagnostics(): void {
  if (typeof window === 'undefined' || initialized) return;

  initialized = true;
  sessionId = loadSessionId();
  entries = loadEntries();
  seq = entries[entries.length - 1]?.seq ?? 0;
  rebuildIndexes();

  window.__pulseDiagnostics = {
    record: recordChartDiagnostic,
    report: getChartDiagnosticsReport,
    export: exportChartDiagnostics,
    clear: clearChartDiagnostics,
    sessionId: () => sessionId,
  };

  scheduleServerSync();
}

export function recordChartDiagnostic(record: ChartDiagnosticRecord): void {
  if (typeof window === 'undefined') return;

  initChartDiagnostics();

  const now = Date.now();
  const signature = record.signature ?? stableStringify(record.summary);
  const streamKey = `${record.event}:${record.scope}`;
  const lastSignature = lastSignatureByScopeEvent.get(streamKey);
  const lastIndex = lastEntryIndexByScopeEvent.get(streamKey);

  if (
    lastSignature === signature &&
    lastIndex != null &&
    entries[lastIndex]
  ) {
    const entry = entries[lastIndex];
    entry.count += 1;
    entry.lastAt = now;
    entry.summary = record.summary;
    entry.latestDetail = record.detail;
    persistEntries();
    scheduleServerSync();
    return;
  }

  const next: ChartDiagnosticEntry = {
    seq: ++seq,
    event: record.event,
    scope: record.scope,
    signature,
    count: 1,
    firstAt: now,
    lastAt: now,
    summary: record.summary,
    latestDetail: record.detail,
  };

  entries = [...entries, next].slice(-MAX_ENTRIES);
  rebuildIndexes();
  persistEntries();
  scheduleServerSync();
}

export function getChartDiagnosticsReport(): ChartDiagnosticEntry[] {
  initChartDiagnostics();
  return entries.map((entry) => ({ ...entry }));
}

export function exportChartDiagnostics(): string {
  return getChartDiagnosticsReport()
    .map((entry) => {
      const time = new Date(entry.lastAt).toLocaleTimeString('en-AU', {
        hour12: false,
      });
      return `${entry.seq}. ${time} x${entry.count} ${entry.event} ${entry.scope} ${JSON.stringify(entry.summary)}`;
    })
    .join('\n');
}

export function clearChartDiagnostics(): void {
  entries = EMPTY_ENTRIES;
  seq = 0;
  lastSignatureByScopeEvent = new Map();
  lastEntryIndexByScopeEvent = new Map();

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures in debug tooling.
    }
  }

  void syncEntriesToServer([]);
}

function rebuildIndexes(): void {
  lastSignatureByScopeEvent = new Map();
  lastEntryIndexByScopeEvent = new Map();

  entries.forEach((entry, index) => {
    const key = `${entry.event}:${entry.scope}`;
    lastSignatureByScopeEvent.set(key, entry.signature);
    lastEntryIndexByScopeEvent.set(key, index);
  });
}

function loadEntries(): ChartDiagnosticEntry[] {
  if (typeof window === 'undefined') return EMPTY_ENTRIES;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_ENTRIES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_ENTRIES;
    return parsed.filter(isEntry);
  } catch {
    return EMPTY_ENTRIES;
  }
}

function persistEntries(): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures in debug tooling.
  }
}

function loadSessionId(): string {
  if (typeof window === 'undefined') return 'server';

  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function scheduleServerSync(): void {
  if (typeof window === 'undefined') return;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void syncEntriesToServer(entries);
  }, SYNC_DEBOUNCE_MS);
}

async function syncEntriesToServer(nextEntries: ChartDiagnosticEntry[]): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await fetch('/api/diagnostics/chart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        entries: nextEntries,
      }),
      keepalive: true,
    });
  } catch {
    // Ignore diagnostics sync failures.
  }
}

function isEntry(value: unknown): value is ChartDiagnosticEntry {
  return (
    typeof value === 'object' &&
    value != null &&
    'seq' in value &&
    'event' in value &&
    'scope' in value &&
    'signature' in value
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}
