import { NextRequest, NextResponse } from 'next/server';
import {
  createAlert,
  deleteAlert,
  getAlertDetails,
  getAlerts,
  setAlertActive,
} from '@/lib/ibkr/client';
import type { AccountAlertCreateParams } from '@/lib/ibkr/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const alertId = request.nextUrl.searchParams.get('alertId');

  try {
    if (alertId) {
      const alert = await getAlertDetails(alertId);
      return NextResponse.json(alert);
    }

    const alerts = await getAlerts();
    return NextResponse.json(alerts);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alert fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AccountAlertCreateParams;
    const result = await createAlert(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alert creation failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { alertId?: number; active?: boolean };
    if (!(body.alertId && typeof body.active === 'boolean')) {
      return NextResponse.json({ error: 'alertId and active are required' }, { status: 400 });
    }

    const result = await setAlertActive(body.alertId, body.active);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alert update failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const alertId = request.nextUrl.searchParams.get('alertId');

  if (!alertId) {
    return NextResponse.json({ error: 'alertId is required' }, { status: 400 });
  }

  try {
    const result = await deleteAlert(alertId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alert delete failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
