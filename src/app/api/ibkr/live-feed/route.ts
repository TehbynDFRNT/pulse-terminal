import { NextRequest, NextResponse } from 'next/server';
import {
  ensureLiveFeedDaemon,
  getLiveFeedResponse,
  registerTrackedConids,
} from '@/lib/ibkr/live-feed-store';
import type { LiveFeedQuery } from '@/lib/ibkr/live-feed-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const conidParam = request.nextUrl.searchParams.get('conids') ?? '';
  const beatsSinceParam = request.nextUrl.searchParams.get('beatsSince') ?? '';
  const conids = conidParam
    .split(',')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  const beatsSince = parseBeatsSince(beatsSinceParam);

  if (conids.length > 0) {
    await registerTrackedConids(conids);
  }

  await ensureLiveFeedDaemon();
  const payload = await getLiveFeedResponse(conids, { beatsSince });
  return NextResponse.json(payload);
}

function parseBeatsSince(value: string): LiveFeedQuery['beatsSince'] {
  if (!value) return {};

  const parsed: LiveFeedQuery['beatsSince'] = {};
  for (const entry of value.split(',')) {
    const [rawConid, rawSince] = entry.split(':');
    const conid = Number.parseInt(rawConid ?? '', 10);
    const since = Number.parseInt(rawSince ?? '', 10);
    if (Number.isInteger(conid) && conid > 0 && Number.isFinite(since) && since > 0) {
      parsed[conid] = since;
    }
  }

  return parsed;
}
