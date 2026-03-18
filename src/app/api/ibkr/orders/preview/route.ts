import { NextRequest, NextResponse } from 'next/server';
import { getOrderTicket, previewOrder, IbkrRequestError } from '@/lib/ibkr/client';
import { normalizeOrderParamsForTicket, validateOrderParamsForTicket } from '@/lib/ibkr/order-ticket';
import type { OrderParams } from '@/lib/ibkr/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OrderParams;

    if (!body.conid || !body.side || !body.orderType) {
      return NextResponse.json(
        { error: 'Missing required fields: conid, side, orderType' },
        { status: 400 }
      );
    }

    const ticket = await getOrderTicket(body.conid, body.side);
    const normalized = normalizeOrderParamsForTicket(body, ticket);
    normalized.secType = normalized.secType || ticket.contract.instrumentType;
    const errors = validateOrderParamsForTicket(normalized, ticket);

    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], details: errors }, { status: 422 });
    }

    const result = await previewOrder(normalized);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IbkrRequestError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    const message = err instanceof Error ? err.message : 'Order preview failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
