import { NextRequest, NextResponse } from 'next/server';
import { getPositions, getAccountSummary, getPortfolioPnL } from '@/lib/ibkr/client';

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

    // Default: return all
    const [positions, summary, pnl] = await Promise.all([
      getPositions(),
      getAccountSummary(),
      getPortfolioPnL(),
    ]);

    return NextResponse.json({ positions, summary, pnl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portfolio fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
