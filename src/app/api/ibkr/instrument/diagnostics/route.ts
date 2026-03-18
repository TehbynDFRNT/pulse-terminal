import { NextRequest, NextResponse } from 'next/server';
import { getInstrumentDiagnostics } from '@/lib/ibkr/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const conid = Number(request.nextUrl.searchParams.get('conid') || 0);
  const exchange = request.nextUrl.searchParams.get('exchange') || undefined;

  if (!(conid > 0)) {
    return NextResponse.json({ error: 'conid is required' }, { status: 400 });
  }

  try {
    const diagnostics = await getInstrumentDiagnostics(conid, exchange);
    return NextResponse.json(diagnostics);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Instrument diagnostics failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
