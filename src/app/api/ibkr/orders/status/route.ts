import { NextRequest, NextResponse } from 'next/server';
import { getOrderStatus } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('orderId');

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  try {
    const status = await getOrderStatus(orderId);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Order status failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
