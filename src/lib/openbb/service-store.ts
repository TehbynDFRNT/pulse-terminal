import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getOpenBBSidecarBaseUrl } from '@/lib/openbb/runtime';
import type { OpenBBServiceStatus } from '@/lib/openbb/service-types';

const RUNTIME_DIR = join(process.cwd(), '.runtime');
const OPENBB_DAEMON_SCRIPT_PATH = join(
  process.cwd(),
  'scripts',
  'openbb-sidecar-daemon.mjs'
);
const OPENBB_PID_PATH = join(RUNTIME_DIR, 'openbb-sidecar.pid');
const OPENBB_RESTART_COOLDOWN_MS = 20_000;
const OPENBB_HEALTH_POLL_MS = 250;

let ensureOpenBBPromise: Promise<boolean> | null = null;
let lastOpenBBRestartAt = 0;

interface OpenBBHealthPayload {
  status?: string;
  datasets?: string[];
}

async function readOpenBBSidecarPid(): Promise<number | null> {
  try {
    const raw = await readFile(OPENBB_PID_PATH, 'utf-8');
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

function startOpenBBSupervisor() {
  const child = spawn(process.execPath, [OPENBB_DAEMON_SCRIPT_PATH, 'start'], {
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
    if (!isPidRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return !isPidRunning(pid);
}

async function probeOpenBBHealth(timeoutMs = 1_000): Promise<OpenBBHealthPayload | null> {
  try {
    const response = await fetch(`${getOpenBBSidecarBaseUrl()}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as OpenBBHealthPayload;
    return payload.status === 'ok' ? payload : null;
  } catch {
    return null;
  }
}

export async function waitForOpenBBSidecarHealth(timeoutMs = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const health = await probeOpenBBHealth(Math.min(1_000, timeoutMs));
    if (health) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, OPENBB_HEALTH_POLL_MS));
  }

  return false;
}

export async function ensureOpenBBSidecar(): Promise<boolean> {
  if (ensureOpenBBPromise) return ensureOpenBBPromise;

  ensureOpenBBPromise = (async () => {
    const now = Date.now();
    const pid = await readOpenBBSidecarPid();
    const running = pid != null && isPidRunning(pid);

    if (running) {
      const healthy = await waitForOpenBBSidecarHealth(1_500);
      if (healthy) {
        return false;
      }
    }

    if (now - lastOpenBBRestartAt < OPENBB_RESTART_COOLDOWN_MS) {
      return false;
    }

    if (running && pid != null) {
      try {
        process.kill(pid, 'SIGTERM');
        await waitForPidExit(pid);
      } catch {
        // Ignore and fall through to a clean restart.
      }
    }

    lastOpenBBRestartAt = now;
    startOpenBBSupervisor();
    return true;
  })().finally(() => {
    ensureOpenBBPromise = null;
  });

  return ensureOpenBBPromise;
}

export async function getOpenBBServiceStatus(): Promise<OpenBBServiceStatus> {
  const checkedAt = Date.now();
  const pid = await readOpenBBSidecarPid();
  const running = pid != null && isPidRunning(pid);
  const url = getOpenBBSidecarBaseUrl();

  if (!running) {
    return {
      state: 'offline',
      connected: false,
      running: false,
      pid: null,
      url,
      datasets: [],
      error: null,
      checkedAt,
    };
  }

  const health = await probeOpenBBHealth();
  if (health) {
    return {
      state: 'connected',
      connected: true,
      running: true,
      pid,
      url,
      datasets: Array.isArray(health.datasets) ? health.datasets : [],
      error: null,
      checkedAt,
    };
  }

  return {
    state: 'starting',
    connected: false,
    running: true,
    pid,
    url,
    datasets: [],
    error: 'OpenBB sidecar is running but not yet healthy',
    checkedAt,
  };
}
