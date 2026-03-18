import type { ChartDiagnosticEntry } from './chart-diagnostics-types';

interface StoredChartDiagnosticsSession {
  sessionId: string;
  updatedAt: number;
  entries: ChartDiagnosticEntry[];
}

const MAX_SESSIONS = 8;

declare global {
  // eslint-disable-next-line no-var
  var __pulseChartDiagnosticsStore: Map<string, StoredChartDiagnosticsSession> | undefined;
}

function getStore(): Map<string, StoredChartDiagnosticsSession> {
  if (!globalThis.__pulseChartDiagnosticsStore) {
    globalThis.__pulseChartDiagnosticsStore = new Map();
  }
  return globalThis.__pulseChartDiagnosticsStore;
}

export function syncChartDiagnosticsSession(
  sessionId: string,
  entries: ChartDiagnosticEntry[]
): StoredChartDiagnosticsSession {
  const store = getStore();
  const next: StoredChartDiagnosticsSession = {
    sessionId,
    updatedAt: Date.now(),
    entries,
  };

  store.set(sessionId, next);

  if (store.size > MAX_SESSIONS) {
    const sessions = Array.from(store.values()).sort(
      (left, right) => left.updatedAt - right.updatedAt
    );
    for (const session of sessions.slice(0, store.size - MAX_SESSIONS)) {
      store.delete(session.sessionId);
    }
  }

  return next;
}

export function readChartDiagnosticsSession(sessionId?: string): StoredChartDiagnosticsSession | null {
  const store = getStore();

  if (sessionId) {
    return store.get(sessionId) ?? null;
  }

  const sessions = Array.from(store.values()).sort(
    (left, right) => right.updatedAt - left.updatedAt
  );

  return sessions[0] ?? null;
}

export function clearChartDiagnosticsSession(sessionId?: string): void {
  const store = getStore();

  if (sessionId) {
    store.delete(sessionId);
    return;
  }

  const latest = readChartDiagnosticsSession();
  if (latest) {
    store.delete(latest.sessionId);
  }
}
