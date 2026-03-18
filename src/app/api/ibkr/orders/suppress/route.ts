import { NextRequest, NextResponse } from 'next/server';
import { resetSuppressedOrderReplies, suppressOrderReplyMessages } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { messageIds?: string[]; reset?: boolean };
    if (body.reset) {
      const result = await resetSuppressedOrderReplies();
      return NextResponse.json(result);
    }

    const messageIds = Array.isArray(body.messageIds)
      ? body.messageIds.map((entry) => String(entry)).filter(Boolean)
      : [];
    if (messageIds.length === 0) {
      return NextResponse.json({ error: 'messageIds is required' }, { status: 400 });
    }

    const result = await suppressOrderReplyMessages(messageIds);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Suppress request failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
