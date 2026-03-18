import { NextResponse } from 'next/server';
import { getNotifications } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const notifications = await getNotifications();
    return NextResponse.json(notifications);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Notification fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
