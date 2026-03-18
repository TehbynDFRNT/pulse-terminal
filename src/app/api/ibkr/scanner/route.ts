import { NextRequest, NextResponse } from 'next/server';
import {
  getScannerParams,
  IbkrRequestError,
  isIbkrEmptyResponseError,
  runScanner,
} from '@/lib/ibkr/client';
import {
  isCompatibleScannerLocation,
  isCompatibleScannerScanType,
} from '@/lib/ibkr/scanner-params';
import type { ScannerRunRequest } from '@/lib/ibkr/types';

export async function POST(request: NextRequest) {
  let body: ScannerRunRequest;

  try {
    body = (await request.json()) as ScannerRunRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.instrument || !body.location || !body.scanType) {
    return NextResponse.json(
      { error: 'instrument, location, and scanType are required' },
      { status: 400 }
    );
  }

  try {
    const params = await getScannerParams();

    if (!isCompatibleScannerLocation(params, body.instrument, body.location)) {
      return NextResponse.json(
        { error: 'Location is not valid for the selected instrument' },
        { status: 400 }
      );
    }

    if (!isCompatibleScannerScanType(params, body.instrument, body.scanType)) {
      return NextResponse.json(
        { error: 'Scan type is not valid for the selected instrument' },
        { status: 400 }
      );
    }

    const results = await runScanner(body);
    return NextResponse.json(results);
  } catch (err) {
    if (isIbkrEmptyResponseError(err)) {
      return NextResponse.json(
        {
          error:
            'Scanner temporarily unavailable. IBKR returned an empty response. Try again.',
        },
        { status: 503 }
      );
    }

    if (err instanceof IbkrRequestError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const message = err instanceof Error ? err.message : 'Scanner run failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
