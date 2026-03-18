import { NextRequest, NextResponse } from 'next/server';
import { getOrderTicket, IbkrRequestError } from '@/lib/ibkr/client';
import type { OrderSide } from '@/lib/ibkr/types';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conid = Number(searchParams.get('conid'));
  const side = (searchParams.get('side') || 'BUY').toUpperCase() as OrderSide;

  if (!Number.isFinite(conid) || conid <= 0) {
    return NextResponse.json({ error: 'Query parameter "conid" must be a positive integer.' }, { status: 400 });
  }

  if (side !== 'BUY' && side !== 'SELL') {
    return NextResponse.json({ error: 'Query parameter "side" must be BUY or SELL.' }, { status: 400 });
  }

  try {
    const ticket = await getOrderTicket(conid, side);
    return NextResponse.json(ticket);
  } catch (err) {
    if (err instanceof IbkrRequestError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const message = err instanceof Error ? err.message : 'Failed to fetch order rules';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
