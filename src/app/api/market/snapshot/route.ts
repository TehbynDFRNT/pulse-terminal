import { NextResponse } from 'next/server';

/**
 * Snapshot route — aggregates prices + macro + fundamentals.
 * Now just proxies the individual (Node.js-native) routes internally.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5001';

export async function GET() {
  try {
    const [pricesRes, macroRes, fundsRes] = await Promise.all([
      fetch(`${BASE}/api/market/prices`).then(r => r.json()),
      fetch(`${BASE}/api/market/macro`).then(r => r.json()),
      fetch(`${BASE}/api/market/fundamentals?symbols=NEM,AEM,GOLD,WPM,FNV`).then(r => r.json()),
    ]);

    return NextResponse.json({
      prices: pricesRes.prices || {},
      ratios: pricesRes.ratios || {},
      macro: macroRes,
      fundamentals: fundsRes,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, max-age=120' },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
