#!/usr/bin/env npx tsx
// ─── IBKR Gateway End-to-End Test Script ──────────────────────────
// Tests each API endpoint against the live CP Gateway on port 5050.
// Run: npx tsx scripts/test-gateway.ts
//   or: NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/test-gateway.ts

// Accept self-signed SSL cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import https from 'node:https';
import { URL } from 'node:url';

const BASE = process.env.IBKR_GATEWAY_URL
  ? `${process.env.IBKR_GATEWAY_URL}/v1/api`
  : 'https://localhost:5050/v1/api';

// ─── Helpers ──────────────────────────────────────────────────────

function request(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`);
    const payload = body ? JSON.stringify(body) : undefined;

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'pulse-terminal/1.0',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          let data: unknown;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function get(path: string) {
  return request('GET', path);
}
function post(path: string, body?: unknown) {
  return request('POST', path, body);
}

function pass(label: string, detail?: string) {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label: string, detail?: string) {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
}
function info(label: string, detail?: string) {
  console.log(`  ℹ️  ${label}${detail ? ` — ${detail}` : ''}`);
}
function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

function summarize(data: unknown, maxKeys = 8): string {
  if (data === null || data === undefined) return String(data);
  if (typeof data !== 'object') return String(data).slice(0, 120);
  if (Array.isArray(data)) return `[${data.length} items]`;
  const keys = Object.keys(data as Record<string, unknown>);
  const shown = keys.slice(0, maxKeys).join(', ');
  const extra = keys.length > maxKeys ? ` +${keys.length - maxKeys} more` : '';
  return `{${shown}${extra}}`;
}

// ─── Test Runner ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let accountId = '';
let discoveredConid = 0;

async function run() {
  console.log('\n🔌 IBKR Gateway Test Suite');
  console.log(`   Target: ${BASE}`);
  console.log(`   Time:   ${new Date().toISOString()}\n`);

  // ──────────────────────────────────────────────────────────
  // 1. Auth Status
  // ──────────────────────────────────────────────────────────
  section('1. Auth Status — GET /iserver/auth/status');
  try {
    const { status, data } = await get('/iserver/auth/status');
    const d = data as Record<string, unknown>;
    if (status === 200 && d.authenticated === true) {
      pass('Auth status', `authenticated=${d.authenticated}, competing=${d.competing}, connected=${d.connected}`);
      if ('established' in d) info('established flag present', `established=${d.established}`);
      passed++;
    } else {
      fail('Auth status', `status=${status}, authenticated=${d.authenticated}`);
      console.log('    ⚠️  Gateway may not be authenticated. Login at https://localhost:5050');
      failed++;
      // Continue anyway — some endpoints may still work
    }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string }; code?: string };
    const code = e.code || e.cause?.code || e.message || 'unknown';
    fail('Auth status', `Connection failed: ${code}`);
    console.log('    ⚠️  Is the CP Gateway running? Common causes:');
    console.log('       - ECONNREFUSED: Gateway not running on this port');
    console.log('       - DEPTH_ZERO_SELF_SIGNED_CERT: Need NODE_TLS_REJECT_UNAUTHORIZED=0');
    console.log('       - The IB Gateway app (TWS API) is NOT the CP Gateway (REST API)');
    console.log('       - Download CP Gateway: https://www.interactivebrokers.com/en/trading/ib-api.php');
    failed++;
    console.log('\n🛑 Cannot reach gateway. Aborting.\n');
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────
  // 2. Tickle (Keepalive)
  // ──────────────────────────────────────────────────────────
  section('2. Tickle — GET /tickle');
  try {
    const { status, data } = await get('/tickle');
    const d = data as Record<string, unknown>;
    if (status === 200 && d.session) {
      pass('Tickle keepalive', `session=${String(d.session).slice(0, 16)}..., ssoExpires=${d.ssoExpires}`);
      passed++;
    } else {
      fail('Tickle', `status=${status}, data=${summarize(data)}`);
      failed++;
    }
  } catch (err) {
    fail('Tickle', (err as Error).message);
    failed++;
  }

  // ──────────────────────────────────────────────────────────
  // 3. Accounts
  // ──────────────────────────────────────────────────────────
  section('3. Accounts — GET /iserver/accounts');
  try {
    const { status, data } = await get('/iserver/accounts');
    const d = data as Record<string, unknown>;
    if (status === 200 && Array.isArray(d.accounts) && d.accounts.length > 0) {
      accountId = d.selectedAccount as string || (d.accounts as string[])[0];
      pass('Get accounts', `accounts=${JSON.stringify(d.accounts)}, selected=${accountId}, isPaper=${d.isPaper}`);
      passed++;
    } else {
      fail('Get accounts', `status=${status}, data=${summarize(data)}`);
      failed++;
    }
  } catch (err) {
    fail('Get accounts', (err as Error).message);
    failed++;
  }

  if (!accountId) {
    console.log('\n⚠️  No account ID discovered. Portfolio/order tests will be skipped.\n');
  }

  // ──────────────────────────────────────────────────────────
  // 4. Contract Search
  // ──────────────────────────────────────────────────────────
  section('4. Contract Search — GET /iserver/secdef/search?symbol=AAPL');
  try {
    const { status, data } = await get('/iserver/secdef/search?symbol=AAPL&secType=STK');
    if (status === 200 && Array.isArray(data) && data.length > 0) {
      const first = data[0] as Record<string, unknown>;
      discoveredConid = first.conid as number;
      pass('Contract search (AAPL)', `found ${data.length} result(s), conid=${discoveredConid}, name=${first.companyName}`);
      passed++;
    } else {
      fail('Contract search', `status=${status}, data=${summarize(data)}`);
      failed++;
    }
  } catch (err) {
    fail('Contract search', (err as Error).message);
    failed++;
  }

  // Also test a non-US search
  try {
    const { status, data } = await get('/iserver/secdef/search?symbol=BHP&secType=STK');
    if (status === 200 && Array.isArray(data) && data.length > 0) {
      const first = data[0] as Record<string, unknown>;
      info('Non-US search (BHP)', `conid=${first.conid}, name=${first.companyName}`);
    }
  } catch {
    // Non-critical
  }

  // ──────────────────────────────────────────────────────────
  // 5. Market Data Snapshot (two-call pattern)
  // ──────────────────────────────────────────────────────────
  section('5. Market Data Snapshot — GET /iserver/marketdata/snapshot');
  if (discoveredConid) {
    try {
      // First call — initializes server-side stream (may return empty)
      const fields = '31,55,84,86,82,83,7282';
      info('Pre-flight request (initializes stream)...');
      const { status: s1, data: d1 } = await get(
        `/iserver/marketdata/snapshot?conids=${discoveredConid}&fields=${fields}`
      );
      info('Pre-flight response', `status=${s1}, data=${summarize(d1)}`);

      // Wait for stream to populate
      await new Promise((r) => setTimeout(r, 1500));

      // Second call — should have data
      const { status: s2, data: d2 } = await get(
        `/iserver/marketdata/snapshot?conids=${discoveredConid}&fields=${fields}`
      );

      if (s2 === 200 && Array.isArray(d2) && d2.length > 0) {
        const snap = d2[0] as Record<string, unknown>;
        const hasData = snap['31'] || snap['84'] || snap['86'];
        if (hasData) {
          pass('Snapshot (2nd call)', `conid=${snap.conid}, last=${snap['31']}, bid=${snap['84']}, ask=${snap['86']}, change=${snap['82']}`);
          passed++;
        } else {
          info('Snapshot returned but fields are empty (delayed data / no subscription?)', summarize(snap));
          pass('Snapshot endpoint works', 'Fields empty — likely no real-time data subscription');
          passed++;
        }
      } else {
        fail('Snapshot', `status=${s2}, data=${summarize(d2)}`);
        failed++;
      }
    } catch (err) {
      fail('Snapshot', (err as Error).message);
      failed++;
    }
  } else {
    info('Skipped — no conid from search');
  }

  // ──────────────────────────────────────────────────────────
  // 6. Historical Data
  // ──────────────────────────────────────────────────────────
  // NOTE: The HMDS (Historical Market Data Service) bridge initializes lazily —
  // it may not be ready immediately after gateway login. The /tickle call above
  // (test 2) wakes it up, but it can take a few seconds. If the first request
  // fails with "Chart data unavailable" (500), we retry after a short wait.
  //
  // We use period=2d instead of 1d to avoid an IBKR quirk where period=1d
  // with bar=5min can return 500 for some symbols outside market hours
  // (e.g. AAPL on weekends/pre-market). Longer periods are more reliable.
  section('6. Historical Data — GET /iserver/marketdata/history');
  if (discoveredConid) {
    // Check HMDS bridge status first
    try {
      const { data: tickleData } = await get('/tickle');
      const td = tickleData as Record<string, unknown>;
      const hmds = td.hmds as Record<string, unknown> | undefined;
      if (hmds?.error) {
        info('HMDS bridge not ready yet', `hmds=${JSON.stringify(hmds)} — waiting 3s`);
        await new Promise((r) => setTimeout(r, 3000));
        await get('/tickle'); // second tickle to nudge HMDS
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        const hmdsAuth = hmds?.authStatus as Record<string, unknown> | undefined;
        if (hmdsAuth) {
          info('HMDS bridge status', `authenticated=${hmdsAuth.authenticated}, connected=${hmdsAuth.connected}`);
        }
      }
    } catch {
      // Non-critical — proceed with the test anyway
    }

    for (const attempt of [1, 2]) {
      try {
        const { status, data } = await get(
          `/iserver/marketdata/history?conid=${discoveredConid}&period=2d&bar=5min&outsideRth=false`
        );
        const d = data as Record<string, unknown>;
        if (status === 200 && d.data && Array.isArray(d.data)) {
          const bars = d.data as Array<Record<string, number>>;
          pass(
            'Historical bars',
            `symbol=${d.symbol}, bars=${bars.length}, latest close=${bars[bars.length - 1]?.c}${attempt > 1 ? ' (succeeded on retry)' : ''}`
          );
          passed++;
          break;
        } else if (status === 500) {
          const errMsg = (d.error as string) || 'unknown';
          if (attempt === 1) {
            info(`Attempt 1 failed (${errMsg})`, 'HMDS bridge may still be initializing — retrying in 3s');
            await new Promise((r) => setTimeout(r, 3000));
          } else {
            fail('Historical data', `status=${status}, error="${errMsg}" (failed after retry — HMDS bridge may need gateway restart)`);
            failed++;
          }
        } else {
          fail('Historical data', `status=${status}, data=${summarize(data)}`);
          failed++;
          break;
        }
      } catch (err) {
        fail('Historical data', (err as Error).message);
        failed++;
        break;
      }
    }
  } else {
    info('Skipped — no conid from search');
  }

  // ──────────────────────────────────────────────────────────
  // 7. Portfolio Accounts
  // ──────────────────────────────────────────────────────────
  section('7. Portfolio Accounts — GET /portfolio/accounts');
  try {
    const { status, data } = await get('/portfolio/accounts');
    if (status === 200 && Array.isArray(data) && data.length > 0) {
      const acct = data[0] as Record<string, unknown>;
      pass('Portfolio accounts', `id=${acct.id || acct.accountId}, type=${acct.type}, currency=${acct.currency}`);
      // Use this as fallback for accountId
      if (!accountId) accountId = (acct.id || acct.accountId) as string;
      passed++;
    } else {
      fail('Portfolio accounts', `status=${status}, data=${summarize(data)}`);
      failed++;
    }
  } catch (err) {
    fail('Portfolio accounts', (err as Error).message);
    failed++;
  }

  // ──────────────────────────────────────────────────────────
  // 8. Positions
  // ──────────────────────────────────────────────────────────
  section('8. Positions — GET /portfolio/{accountId}/positions/0');
  if (accountId) {
    try {
      const { status, data } = await get(`/portfolio/${accountId}/positions/0`);
      if (status === 200) {
        if (Array.isArray(data) && data.length > 0) {
          const pos = data[0] as Record<string, unknown>;
          pass(
            'Positions',
            `${data.length} position(s), first: ${pos.contractDesc} qty=${pos.position} mktVal=${pos.mktValue} unrealPnl=${pos.unrealizedPnl}`
          );
        } else {
          pass('Positions', 'No open positions (empty portfolio — expected for paper)');
        }
        passed++;
      } else {
        fail('Positions', `status=${status}, data=${summarize(data)}`);
        failed++;
      }
    } catch (err) {
      fail('Positions', (err as Error).message);
      failed++;
    }
  } else {
    info('Skipped — no accountId');
  }

  // ──────────────────────────────────────────────────────────
  // 9. Account Summary
  // ──────────────────────────────────────────────────────────
  section('9. Account Summary — GET /portfolio/{accountId}/summary');
  if (accountId) {
    try {
      const { status, data } = await get(`/portfolio/${accountId}/summary`);
      const d = data as Record<string, Record<string, unknown>>;
      if (status === 200 && d.netliquidation) {
        pass(
          'Account summary',
          `NLV=${d.netliquidation?.amount}, availFunds=${d.availablefunds?.amount}, buyingPower=${d.buyingpower?.amount}`
        );
        passed++;
      } else {
        fail('Account summary', `status=${status}, keys=${summarize(data)}`);
        failed++;
      }
    } catch (err) {
      fail('Account summary', (err as Error).message);
      failed++;
    }
  } else {
    info('Skipped — no accountId');
  }

  // ──────────────────────────────────────────────────────────
  // 10. P&L Partitioned
  // ──────────────────────────────────────────────────────────
  section('10. P&L — GET /iserver/account/pnl/partitioned');
  try {
    const { status, data } = await get('/iserver/account/pnl/partitioned');
    const d = data as Record<string, unknown>;
    if (status === 200 && d.upnl) {
      const upnl = d.upnl as Record<string, Record<string, number>>;
      const key = Object.keys(upnl)[0];
      const pnl = upnl[key];
      if (pnl) {
        pass(
          'P&L partitioned',
          `key=${key}, dailyPnL=${pnl.dpl}, NLV=${pnl.nl}, unrealPnL=${pnl.upl}, excessLiq=${pnl.uel ?? pnl.el}, mktVal=${pnl.mv}`
        );
        // Check if uel or el is present
        if ('uel' in pnl) {
          info('Uses new "uel" field for excess liquidity ✓');
        } else if ('el' in pnl) {
          info('Uses legacy "el" field for excess liquidity — uel migration not yet live for this gateway version');
        }
      } else {
        pass('P&L partitioned', 'Response received but no account entries (may need positions)');
      }
      passed++;
    } else {
      fail('P&L partitioned', `status=${status}, data=${summarize(data)}`);
      failed++;
    }
  } catch (err) {
    fail('P&L partitioned', (err as Error).message);
    failed++;
  }

  // ──────────────────────────────────────────────────────────
  // 11. Live Orders
  // ──────────────────────────────────────────────────────────
  section('11. Live Orders — GET /iserver/account/orders');
  try {
    const { status, data } = await get('/iserver/account/orders?force=true');
    const d = data as Record<string, unknown>;
    if (status === 200) {
      const orders = (d.orders || []) as unknown[];
      pass('Live orders', `${orders.length} order(s)`);
      if (orders.length > 0) {
        const first = orders[0] as Record<string, unknown>;
        info('First order', `id=${first.orderId} ${first.side} ${first.totalSize} ${first.ticker} @ ${first.price} status=${first.status}`);
      }
      passed++;
    } else {
      fail('Live orders', `status=${status}, data=${summarize(data)}`);
      failed++;
    }
  } catch (err) {
    fail('Live orders', (err as Error).message);
    failed++;
  }

  // ──────────────────────────────────────────────────────────
  // 12. Account Ledger (bonus)
  // ──────────────────────────────────────────────────────────
  section('12. Account Ledger — GET /portfolio/{accountId}/ledger');
  if (accountId) {
    try {
      const { status, data } = await get(`/portfolio/${accountId}/ledger`);
      const d = data as Record<string, Record<string, unknown>>;
      if (status === 200) {
        const currencies = Object.keys(d);
        const base = d.BASE;
        pass(
          'Account ledger',
          `currencies=[${currencies.join(', ')}], base NLV=${base?.netliquidationvalue}`
        );
        passed++;
      } else {
        fail('Account ledger', `status=${status}, data=${summarize(data)}`);
        failed++;
      }
    } catch (err) {
      fail('Account ledger', (err as Error).message);
      failed++;
    }
  } else {
    info('Skipped — no accountId');
  }

  // ──────────────────────────────────────────────────────────
  // 13. Contract Info (bonus)
  // ──────────────────────────────────────────────────────────
  section('13. Contract Info — GET /iserver/contract/{conid}/info');
  if (discoveredConid) {
    try {
      const { status, data } = await get(`/iserver/contract/${discoveredConid}/info`);
      const d = data as Record<string, unknown>;
      if (status === 200 && d.symbol) {
        pass(
          'Contract info',
          `symbol=${d.symbol}, name=${d.company_name}, type=${d.instrument_type}, currency=${d.currency}, exchange=${d.exchange}`
        );
        passed++;
      } else {
        fail('Contract info', `status=${status}, data=${summarize(data)}`);
        failed++;
      }
    } catch (err) {
      fail('Contract info', (err as Error).message);
      failed++;
    }
  } else {
    info('Skipped — no conid');
  }

  // ──────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log(`${'═'.repeat(60)}`);

  if (accountId) {
    console.log(`\n  📋 Discovered Account ID: ${accountId}`);
    console.log(`     → Update .env.local: IBKR_ACCOUNT_ID=${accountId}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\n💥 Unhandled error:', err);
  process.exit(1);
});
