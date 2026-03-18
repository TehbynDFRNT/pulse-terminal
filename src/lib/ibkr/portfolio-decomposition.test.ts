import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioDecomposition } from './portfolio-decomposition.ts';

test('buildPortfolioDecomposition groups positions and cash into composition buckets', () => {
  const decomposition = buildPortfolioDecomposition({
    accountId: 'DUP1',
    baseCurrency: 'AUD',
    summary: {
      accountId: 'DUP1',
      netLiquidity: 1100,
      availableFunds: 0,
      buyingPower: 0,
      totalCash: 500,
      grossPosition: 600,
      initMargin: 0,
      maintMargin: 0,
      cushion: 1,
      unrealizedPnL: 0,
      realizedPnL: 0,
    },
    positions: [
      {
        conid: 1,
        symbol: 'IOZ',
        position: 10,
        marketPrice: 60,
        marketValue: 600,
        avgCost: 55,
        unrealizedPnl: 50,
        realizedPnl: 0,
        currency: 'AUD',
        assetClass: 'STK',
      },
    ],
    cashBalances: [
      {
        currency: 'AUD',
        cashBalance: 500,
        settledCash: 500,
        netLiquidationValue: 500,
        exchangeRate: 1,
        interest: 0,
        baseEquivalent: 500,
        unrealizedPnlBase: 0,
        realizedPnlBase: 0,
        entryBaseAmount: null,
        markToBasePnl: null,
        isBase: true,
      },
    ],
    securityDefinitions: [
      {
        conid: 1,
        currency: 'AUD',
        name: 'IOZ',
        assetClass: 'STK',
        ticker: 'IOZ',
        listingExchange: 'ASX',
        countryCode: 'AU',
        allExchanges: ['ASX'],
        sector: 'ETF',
        group: 'Funds',
        sectorGroup: 'Funds',
      },
    ],
  });

  assert.equal(decomposition.assetClasses[0]?.key, 'STK');
  assert.equal(decomposition.assetClasses[1]?.key, 'CASH');
  assert.equal(decomposition.currencies[0]?.key, 'AUD');
  assert.equal(decomposition.sectors[0]?.key, 'ETF');
});
