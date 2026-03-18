import { NextResponse } from 'next/server';
import { checkAuthStatus } from '@/lib/ibkr/client';
import type { AuthStatus } from '@/lib/ibkr/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function authPayload(auth: AuthStatus) {
  return {
    authenticated: auth.authenticated,
    competing: auth.competing,
    connected: auth.connected,
  };
}

export async function GET() {
  try {
    const auth: AuthStatus = await checkAuthStatus();

    console.log('[auth] →', JSON.stringify(auth));

    return NextResponse.json(authPayload(auth));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth check failed';
    console.error('[auth] ERROR:', message);
    return NextResponse.json({ error: message, authenticated: false }, { status: 502 });
  }
}
