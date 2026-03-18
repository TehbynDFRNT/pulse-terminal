import type {
  AccountActivityResponse,
  AccountActivitySymbolSummary,
  AccountActivityTotals,
  TradeExecution,
} from './types';

interface BuildAccountActivityParams {
  accountId: string;
  days: number;
  trades: TradeExecution[];
}

export function buildAccountActivity({
  accountId,
  days,
  trades,
}: BuildAccountActivityParams): AccountActivityResponse {
  const bySymbol = new Map<string, AccountActivitySymbolSummary>();
  let grossBuy = 0;
  let grossSell = 0;
  let netAmount = 0;
  let commission = 0;

  for (const trade of trades) {
    const notional = Math.abs(trade.size * trade.price);
    if (trade.side === 'BUY') {
      grossBuy += notional;
    } else {
      grossSell += notional;
    }
    netAmount += trade.netAmount;
    commission += Math.abs(trade.commission);

    const existing = bySymbol.get(trade.symbol) ?? {
      symbol: trade.symbol,
      executions: 0,
      grossBuy: 0,
      grossSell: 0,
      netAmount: 0,
      commission: 0,
      lastTradeAt: 0,
    };

    existing.executions += 1;
    existing.netAmount += trade.netAmount;
    existing.commission += Math.abs(trade.commission);
    existing.lastTradeAt = Math.max(existing.lastTradeAt, trade.tradeTimeMs);
    if (trade.side === 'BUY') {
      existing.grossBuy += notional;
    } else {
      existing.grossSell += notional;
    }

    bySymbol.set(trade.symbol, existing);
  }

  const totals: AccountActivityTotals = {
    executions: trades.length,
    symbols: bySymbol.size,
    grossBuy,
    grossSell,
    netAmount,
    commission,
  };

  return {
    accountId,
    days,
    totals,
    bySymbol: Array.from(bySymbol.values()).sort((left, right) => right.lastTradeAt - left.lastTradeAt),
    trades: [...trades].sort((left, right) => right.tradeTimeMs - left.tradeTimeMs),
  };
}
