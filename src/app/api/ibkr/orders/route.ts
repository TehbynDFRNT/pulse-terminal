import { NextRequest, NextResponse } from 'next/server';
import os from 'node:os';
import {
  placeOrder,
  cancelOrder,
  getLiveOrders,
  getOrderTicket,
  modifyOrder,
  IbkrRequestError,
} from '@/lib/ibkr/client';
import { normalizeOrderParamsForTicket, validateOrderParamsForTicket } from '@/lib/ibkr/order-ticket';
import type { OrderParams } from '@/lib/ibkr/types';

// GET /api/ibkr/orders — fetch all live orders
export async function GET() {
  try {
    const orders = await getLiveOrders();
    return NextResponse.json(orders);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch orders';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// POST /api/ibkr/orders — place a new order
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

    if (
      (ticket.contract.instrumentType === 'FUT' || ticket.contract.instrumentType === 'FOP') &&
      !normalized.manualIndicator
    ) {
      normalized.manualIndicator = true;
      normalized.extOperator =
        normalized.extOperator ||
        process.env.IBKR_EXT_OPERATOR ||
        process.env.USER ||
        os.userInfo().username ||
        'pulse-terminal';
      normalized.secType = normalized.secType || ticket.contract.instrumentType;
    }

    const result = await placeOrder(normalized);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IbkrRequestError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    const message = err instanceof Error ? err.message : 'Order placement failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// DELETE /api/ibkr/orders — cancel an order
export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return NextResponse.json(
      { error: 'Query parameter "orderId" is required' },
      { status: 400 }
    );
  }

  try {
    const result = await cancelOrder(orderId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancel failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// PATCH /api/ibkr/orders?orderId=123 — modify an order
export async function PATCH(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return NextResponse.json(
      { error: 'Query parameter "orderId" is required' },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as Partial<OrderParams>;
    const result = await modifyOrder(orderId, body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IbkrRequestError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    const message = err instanceof Error ? err.message : 'Modify failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
