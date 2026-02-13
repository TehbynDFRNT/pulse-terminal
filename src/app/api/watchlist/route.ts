import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { WatchlistData, WatchlistItem } from '@/lib/ibkr/types';

const WATCHLIST_PATH = join(process.cwd(), 'data', 'watchlist.json');

async function loadWatchlist(): Promise<WatchlistData> {
  try {
    const raw = await readFile(WATCHLIST_PATH, 'utf-8');
    return JSON.parse(raw) as WatchlistData;
  } catch {
    return { items: [] };
  }
}

async function saveWatchlist(data: WatchlistData): Promise<void> {
  await writeFile(WATCHLIST_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// GET /api/watchlist — load saved watchlist
export async function GET() {
  const data = await loadWatchlist();
  return NextResponse.json(data);
}

// POST /api/watchlist — add item to watchlist
export async function POST(request: NextRequest) {
  const item = (await request.json()) as WatchlistItem;

  if (!item.conid || !item.symbol) {
    return NextResponse.json(
      { error: 'Missing required fields: conid, symbol' },
      { status: 400 }
    );
  }

  const data = await loadWatchlist();
  const exists = data.items.some((i) => i.conid === item.conid);

  if (!exists) {
    data.items.push(item);
    await saveWatchlist(data);
  }

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

  const data = await loadWatchlist();
  data.items = data.items.filter((i) => i.conid !== parseInt(conid, 10));
  await saveWatchlist(data);

  return NextResponse.json(data);
}
