#!/usr/bin/env node

import https from 'node:https';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RUNTIME_DIR = path.join(ROOT, '.runtime');
const PID_FILE = path.join(RUNTIME_DIR, 'gateway-keepalive.pid');
const LOG_FILE = path.join(RUNTIME_DIR, 'gateway-keepalive.log');
const DEFAULT_GATEWAY_URL = 'https://localhost:5050';
const DEFAULT_BASE_PATH = '/v1/api';
const DEFAULT_INTERVAL_MS = 55_000;

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
    process.env.IBKR_KEEPALIVE_INTERVAL_MS ||
      fileEnv.IBKR_KEEPALIVE_INTERVAL_MS ||
      DEFAULT_INTERVAL_MS
  );

  return {
    gatewayUrl,
    basePath,
    baseUrl: `${gatewayUrl}${basePath}`,
    intervalMs: Number.isFinite(intervalMs) && intervalMs >= 5_000
      ? intervalMs
      : DEFAULT_INTERVAL_MS,
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

async function requestJson(url, init = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const method = init.method || 'GET';
    const timeout = 15_000;

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'pulse-terminal-keepalive/1.0',
          ...(init.headers || {}),
        },
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data;

          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = text;
          }

          if ((res.statusCode || 0) >= 400) {
            const detail =
              typeof data === 'string' ? data : JSON.stringify(data);
            reject(
              new Error(
                `HTTP ${res.statusCode}${detail ? `: ${detail}` : ''}`
              )
            );
            return;
          }

          resolve(data);
        });
      }
    );

    req.setTimeout(timeout, () => {
      req.destroy(new Error(`request timed out after ${timeout}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function getAuthStatus(config) {
  return requestJson(`${config.baseUrl}/iserver/auth/status`);
}

async function tickle(config) {
  return requestJson(`${config.baseUrl}/tickle`);
}

async function startDaemon() {
  await ensureRuntimeDir();
  await clearStalePidFile();

  const existingPid = await readPid();
  if (existingPid && isPidRunning(existingPid)) {
    console.log(`gateway keepalive already running (pid ${existingPid})`);
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
  console.log(`started gateway keepalive (pid ${child.pid})`);
  console.log(`log file: ${LOG_FILE}`);
}

async function stopDaemon() {
  await clearStalePidFile();
  const pid = await readPid();

  if (!pid) {
    console.log('gateway keepalive is not running');
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
  console.log(`stopped gateway keepalive (pid ${pid})`);
}

async function statusDaemon() {
  await clearStalePidFile();
  const pid = await readPid();
  const running = pid ? isPidRunning(pid) : false;
  const config = getConfig();

  console.log(
    running
      ? `gateway keepalive running (pid ${pid})`
      : 'gateway keepalive not running'
  );
  console.log(`gateway: ${config.baseUrl}`);
  console.log(`interval: ${config.intervalMs}ms`);
  console.log(`log file: ${LOG_FILE}`);

  try {
    const auth = await getAuthStatus(config);
    console.log(
      `gateway auth: authenticated=${auth.authenticated} connected=${auth.connected} competing=${auth.competing}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`gateway auth check failed: ${message}`);
  }
}

async function runDaemon() {
  await ensureRuntimeDir();
  await fsp.writeFile(PID_FILE, `${process.pid}\n`, 'utf8');

  const config = getConfig();
  let stopping = false;
  let timer = null;
  let lastStateKey = '';
  let lastError = '';
  let consecutiveErrors = 0;
  let successCount = 0;

  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    if (timer) clearTimeout(timer);
    logLine(`received ${signal}, stopping keepalive`);
    await fsp.rm(PID_FILE, { force: true }).catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  logLine(
    `starting keepalive for ${config.baseUrl} every ${config.intervalMs}ms`
  );

  const cycle = async () => {
    if (stopping) return;

    try {
      const tickleData = await tickle(config);
      const auth = tickleData?.iserver?.authStatus ?? await getAuthStatus(config);
      const stateKey = [
        auth.authenticated,
        auth.connected,
        auth.competing,
      ].join(':');

      if (stateKey !== lastStateKey) {
        lastStateKey = stateKey;
        logLine(
          `gateway state authenticated=${auth.authenticated} connected=${auth.connected} competing=${auth.competing}`
        );
      }

      if (!auth.authenticated || !auth.connected) {
        logLine('gateway session is not active; manual login may be required');
      } else {
        successCount += 1;
        if (successCount % 30 === 0) {
          logLine('keepalive heartbeat ok');
        }
      }

      consecutiveErrors = 0;
      lastError = '';
    } catch (error) {
      consecutiveErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastError || consecutiveErrors === 1 || consecutiveErrors % 10 === 0) {
        lastError = message;
        logLine(`keepalive error: ${message}`);
      }
    } finally {
      if (!stopping) {
        timer = setTimeout(() => {
          void cycle();
        }, config.intervalMs);
      }
    }
  };

  await cycle();
}

const command = process.argv[2] || 'status';

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
  case 'once': {
    const config = getConfig();
    const data = await tickle(config);
    console.log(JSON.stringify(data, null, 2));
    break;
  }
  default:
    console.error(`unknown command: ${command}`);
    console.error('usage: node scripts/gateway-keepalive.mjs [start|stop|status|daemon|once]');
    process.exit(1);
}
