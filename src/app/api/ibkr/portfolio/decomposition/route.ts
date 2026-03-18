import { NextResponse } from 'next/server';
import { getPortfolioDecomposition } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const decomposition = await getPortfolioDecomposition();
    return NextResponse.json(decomposition);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portfolio decomposition failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
