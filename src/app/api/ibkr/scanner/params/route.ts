import { NextRequest, NextResponse } from 'next/server';
import { getScannerParams } from '@/lib/ibkr/client';
import { mockScannerParams } from '@/lib/ibkr/mock-data';
import { compactScannerParams } from '@/lib/ibkr/scanner-params';

export async function GET(request: NextRequest) {
  const compact = request.nextUrl.searchParams.get('compact') === '1';
  const instrument = request.nextUrl.searchParams.get('instrument') || 'STK';

  try {
    const params = await getScannerParams();
    const response = compact ? compactScannerParams(params, instrument) : params;
    return NextResponse.json(response);
  } catch (err) {
    const fallback = compact
      ? compactScannerParams(mockScannerParams(), instrument)
      : mockScannerParams();
    const message = err instanceof Error ? err.message : 'Scanner params failed';
    console.warn('[ibkr] scanner params fallback', message);
    return NextResponse.json({
      ...fallback,
      warning: message,
      source: 'fallback',
    });
  }
}
