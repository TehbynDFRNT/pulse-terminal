import { NextResponse } from 'next/server';
import yf from '@/lib/yahoo';
import { getCached, setCached, getCacheAge } from '@/lib/market-cache';

const CACHE_KEY = 'prices';
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const SYMBOLS: Record<string, string> = {
  'GC=F': 'Gold', 'SI=F': 'Silver', 'PL=F': 'Platinum',
  'DX-Y.NYB': 'DXY', 'BTC-USD': 'Bitcoin',
  'NST.AX': 'Northern Star', 'EVN.AX': 'Evolution',
  'RMS.AX': 'Ramelius', 'WGX.AX': 'Westgold',
  'SPY': 'S&P 500', 'GLD': 'Gold ETF', 'SLV': 'Silver ETF',
  'HG=F': 'Copper', 'CL=F': 'Crude Oil',
};

function safe(v: number | undefined | null): number | null {
  if (v === undefined || v === null || !isFinite(v)) return null;
  return Math.round(v * 10000) / 10000;
}

async function fetchPrices() {
  const tickers = Object.keys(SYMBOLS);

  // Batch quote — single call, yahoo-finance2 handles internally
  const quotes = await yf.quote(tickers);
  const quoteArr = Array.isArray(quotes) ? quotes : [quotes];

  const prices: Record<string, unknown> = {};
  const ratios: Record<string, number | null> = {};

  for (const q of quoteArr) {
    const sym = q.symbol;
    if (!sym || !SYMBOLS[sym]) continue;

    const price = safe(q.regularMarketPrice);
    const prev = safe(q.regularMarketPreviousClose);
    const change = price && prev ? safe(price - prev) : null;
    const changePct = price && prev && prev !== 0 ? safe((price - prev) / prev * 100) : null;

    prices[sym] = {
      name: SYMBOLS[sym],
      price,
      prev_close: prev,
      change,
      change_pct: changePct,
      year_high: safe(q.fiftyTwoWeekHigh),
      year_low: safe(q.fiftyTwoWeekLow),
      ma_50d: safe(q.fiftyDayAverage),
    };
  }

  // Ratios
  const gold = (prices['GC=F'] as { price: number | null })?.price;
  const silver = (prices['SI=F'] as { price: number | null })?.price;
  const copper = (prices['HG=F'] as { price: number | null })?.price;
  if (gold && silver) ratios.gold_silver = safe(gold / silver);
  if (copper && gold) ratios.copper_gold = safe(copper / gold * 1000);

  return { prices, ratios };
}

export async function GET() {
  try {
    // Check cache
    const cached = getCached<{ prices: unknown; ratios: unknown }>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      const age = getCacheAge(CACHE_KEY);
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, max-age=60',
          'X-Cache': 'HIT',
          'X-Cache-Age': String(age ?? 0),
        },
      });
    }

    const data = await fetchPrices();
    setCached(CACHE_KEY, data);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
