import { NextRequest, NextResponse } from 'next/server';
import type { WatchlistItem } from '@/lib/ibkr/types';
import { normalizeInstrument, normalizeWatchlistItems } from '@/lib/ibkr/normalize-instrument';
import { getMarketDataSnapshot } from '@/lib/ibkr/client';
import {
  loadWatchlistState,
  saveWatchlistState,
} from '@/lib/ibkr/watchlist-state';

// GET /api/watchlist — load saved watchlist
export async function GET() {
  const data = await loadWatchlistState();

  if (shouldBootstrapPrices(data) && data.items.length > 0) {
    try {
      const snapshots = await getMarketDataSnapshot(data.items.map((item) => item.conid));
      data.prices = snapshots;
      await saveWatchlistState(data);
    } catch {
      // Keep the watchlist load resilient even if gateway snapshot bootstrap fails.
    }
  }

  return NextResponse.json(data);
}

function shouldBootstrapPrices(data: { items: WatchlistItem[]; prices?: Array<{
  conid: number;
  updated?: number;
  last?: number;
  displayPrice?: number;
}> }): boolean {
  if (data.items.length === 0) return false;

  const prices = data.prices ?? [];
  if (prices.length < data.items.length) return true;

  const itemConids = new Set(data.items.map((item) => item.conid));
  const validPrices = prices.filter((price) => itemConids.has(price.conid));
  if (validPrices.length < data.items.length) return true;

  return validPrices.every(
    (price) =>
      (price.updated ?? 0) <= 0 &&
      (price.displayPrice ?? 0) <= 0 &&
      (price.last ?? 0) <= 0
  );
}

// POST /api/watchlist — add item to watchlist
export async function POST(request: NextRequest) {
  const item = normalizeInstrument((await request.json()) as WatchlistItem);

  if (!item.conid || !item.symbol) {
    return NextResponse.json(
      { error: 'Missing required fields: conid, symbol' },
      { status: 400 }
    );
  }

  const data = await loadWatchlistState();
  const exists = data.items.some((i) => i.conid === item.conid);

  if (!exists) {
    data.items.push(item);
    await saveWatchlistState(data);
  }

  return NextResponse.json(data);
}

// PUT /api/watchlist — replace saved watchlist
export async function PUT(request: NextRequest) {
  const items = normalizeWatchlistItems((await request.json()) as WatchlistItem[]);
  const existing = await loadWatchlistState();
  const data = {
    items,
    prices: (existing.prices ?? []).filter((snapshot) =>
      items.some((item) => item.conid === snapshot.conid)
    ),
  };
  await saveWatchlistState(data);
  return NextResponse.json(data);
}

// DELETE /api/watchlist — remove item from watchlist
export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const conid = searchParams.get('conid');

  if (!conid) {
    return NextResponse.json(
      { error: 'Query parameter "conid" is required' },
      { status: 400 }
    );
  }

  const data = await loadWatchlistState();
  data.items = data.items.filter((i) => i.conid !== parseInt(conid, 10));
  data.prices = (data.prices ?? []).filter(
    (snapshot) => snapshot.conid !== parseInt(conid, 10)
  );
  await saveWatchlistState(data);

  return NextResponse.json(data);
}
