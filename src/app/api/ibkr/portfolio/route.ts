import { NextRequest, NextResponse } from 'next/server';
import {
  getAccountSummary,
  getCashBalances,
  getPortfolioAccountContext,
  getPortfolioPnL,
  getPositions,
} from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'all';

  try {
    if (type === 'positions') {
      const positions = await getPositions();
      return NextResponse.json(positions);
    }

    if (type === 'summary') {
      const summary = await getAccountSummary();
      return NextResponse.json(summary);
    }

    if (type === 'pnl') {
      const pnl = await getPortfolioPnL();
      return NextResponse.json(pnl);
    }

    if (type === 'cash') {
      const cash = await getCashBalances();
      return NextResponse.json(cash);
    }

    if (type === 'account') {
      const account = await getPortfolioAccountContext();
      return NextResponse.json(account);
    }

    // Default: return all
    const [account, positions, summary, pnl, cash] = await Promise.all([
      getPortfolioAccountContext(),
      getPositions(),
      getAccountSummary(),
      getPortfolioPnL(),
      getCashBalances(),
    ]);

    return NextResponse.json({
      account,
      positions,
      summary,
      pnl,
      baseCurrency: cash.baseCurrency,
      cashBalances: cash.cashBalances,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portfolio fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
