#!/usr/bin/env node

import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const RUNTIME_DIR = path.join(ROOT, '.runtime');
const PID_FILE = path.join(RUNTIME_DIR, 'openbb-sidecar.pid');
const LOG_FILE = path.join(RUNTIME_DIR, 'openbb-sidecar.log');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 5052;
const DEFAULT_PYTHON_PATH = path.join(ROOT, '.runtime', 'openbb-venv', 'bin', 'python');
const DEFAULT_SERVICE_SCRIPT = path.join(ROOT, 'scripts', 'openbb_sidecar.py');

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
  const host = process.env.OPENBB_SIDECAR_HOST || fileEnv.OPENBB_SIDECAR_HOST || DEFAULT_HOST;
  const port = Number(
    process.env.OPENBB_SIDECAR_PORT || fileEnv.OPENBB_SIDECAR_PORT || DEFAULT_PORT
  );
  const pythonPath =
    process.env.OPENBB_SIDECAR_PYTHON || fileEnv.OPENBB_SIDECAR_PYTHON || DEFAULT_PYTHON_PATH;
  const serviceScript =
    process.env.OPENBB_SIDECAR_SCRIPT || fileEnv.OPENBB_SIDECAR_SCRIPT || DEFAULT_SERVICE_SCRIPT;

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    pythonPath,
    serviceScript,
    healthUrl: `http://${host}:${Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT}/health`,
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

async function startDaemon() {
  await ensureRuntimeDir();
  await clearStalePidFile();
  const config = getConfig();

  const existingPid = await readPid();
  if (existingPid && isPidRunning(existingPid)) {
    console.log(`openbb sidecar already running (pid ${existingPid})`);
    return;
  }

  if (!fs.existsSync(config.pythonPath)) {
    throw new Error(`python runtime not found at ${config.pythonPath}`);
  }

  if (!fs.existsSync(config.serviceScript)) {
    throw new Error(`service script not found at ${config.serviceScript}`);
  }

  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(config.pythonPath, [config.serviceScript], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      OPENBB_SIDECAR_HOST: config.host,
      OPENBB_SIDECAR_PORT: String(config.port),
      PYTHONUNBUFFERED: '1',
    },
  });

  child.unref();
  fs.closeSync(logFd);

  await fsp.writeFile(PID_FILE, `${child.pid}\n`, 'utf8');
  console.log(`started openbb sidecar (pid ${child.pid})`);
  console.log(`log file: ${LOG_FILE}`);
}

async function stopDaemon() {
  await clearStalePidFile();
  const pid = await readPid();

  if (!pid) {
    console.log('openbb sidecar is not running');
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
  console.log(`stopped openbb sidecar (pid ${pid})`);
}

async function statusDaemon() {
  await clearStalePidFile();
  const pid = await readPid();
  const running = pid ? isPidRunning(pid) : false;
  const config = getConfig();

  console.log(running ? `openbb sidecar running (pid ${pid})` : 'openbb sidecar not running');
  console.log(`python: ${config.pythonPath}`);
  console.log(`service: ${config.serviceScript}`);
  console.log(`health: ${config.healthUrl}`);
  console.log(`log file: ${LOG_FILE}`);

  if (!running) return;

  try {
    const response = await fetch(config.healthUrl);
    const json = await response.json();
    console.log(`health status: ${json.status}`);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`health check failed: ${error.message}`);
    }
  }
}

async function runDaemon() {
  await ensureRuntimeDir();
  const config = getConfig();

  if (!fs.existsSync(config.pythonPath)) {
    throw new Error(`python runtime not found at ${config.pythonPath}`);
  }

  if (!fs.existsSync(config.serviceScript)) {
    throw new Error(`service script not found at ${config.serviceScript}`);
  }

  logLine(`starting openbb sidecar on ${config.healthUrl.replace('/health', '')}`);

  const child = spawn(config.pythonPath, [config.serviceScript], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENBB_SIDECAR_HOST: config.host,
      OPENBB_SIDECAR_PORT: String(config.port),
      PYTHONUNBUFFERED: '1',
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 0;
  });

  await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
}

async function main() {
  const command = process.argv[2] || 'status';

  switch (command) {
    case 'start':
      await startDaemon();
      return;
    case 'stop':
      await stopDaemon();
      return;
    case 'status':
      await statusDaemon();
      return;
    case 'daemon':
      await runDaemon();
      return;
    default:
      console.error(`unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
