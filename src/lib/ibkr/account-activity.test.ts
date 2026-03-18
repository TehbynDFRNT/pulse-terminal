import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountActivity } from './account-activity.ts';

test('buildAccountActivity aggregates totals and symbol groups', () => {
  const activity = buildAccountActivity({
    accountId: 'DUP123',
    days: 7,
    trades: [
      {
        executionId: '1',
        orderId: 1,
        conid: 1,
        symbol: 'BTC',
        companyName: 'Bitcoin',
        side: 'BUY',
        size: 1,
        price: 100,
        exchange: 'PAXOS',
        commission: 1,
        netAmount: -101,
        tradeTime: '',
        tradeTimeMs: 200,
        description: '',
        secType: 'CRYPTO',
        listingExchange: 'PAXOS',
        accountId: 'DUP123',
      },
      {
        executionId: '2',
        orderId: 2,
        conid: 1,
        symbol: 'BTC',
        companyName: 'Bitcoin',
        side: 'SELL',
        size: 0.5,
        price: 120,
        exchange: 'PAXOS',
        commission: 0.5,
        netAmount: 59.5,
        tradeTime: '',
        tradeTimeMs: 300,
        description: '',
        secType: 'CRYPTO',
        listingExchange: 'PAXOS',
        accountId: 'DUP123',
      },
    ],
  });

  assert.equal(activity.totals.executions, 2);
  assert.equal(activity.totals.symbols, 1);
  assert.equal(activity.totals.grossBuy, 100);
  assert.equal(activity.totals.grossSell, 60);
  assert.equal(activity.totals.commission, 1.5);
  assert.equal(activity.bySymbol[0]?.symbol, 'BTC');
});
