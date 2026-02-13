import { NextRequest, NextResponse } from 'next/server';
import { placeOrder, cancelOrder, getLiveOrders } from '@/lib/ibkr/client';
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

    if (!body.conid || !body.side || !body.orderType || !body.quantity) {
      return NextResponse.json(
        { error: 'Missing required fields: conid, side, orderType, quantity' },
        { status: 400 }
      );
    }

    const result = await placeOrder(body);
    return NextResponse.json(result);
  } catch (err) {
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
