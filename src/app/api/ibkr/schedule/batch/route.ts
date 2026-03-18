import { NextRequest, NextResponse } from 'next/server';
import { getMarketSchedule } from '@/lib/ibkr/client';
import { buildFallbackMarketSchedule } from '@/lib/ibkr/market-schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ScheduleBatchRequest {
  instruments?: Array<{
    conid?: number;
    exchange?: string;
  }>;
}

const SCHEDULE_BATCH_CHUNK_SIZE = 50;

export async function POST(request: NextRequest) {
  let body: ScheduleBatchRequest;

  try {
    body = (await request.json()) as ScheduleBatchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const instruments = Array.isArray(body.instruments) ? body.instruments : [];
  if (instruments.length === 0) {
    return NextResponse.json(
      { error: 'Body field "instruments" must be a non-empty array' },
      { status: 400 }
    );
  }

  const normalized = instruments
    .map((instrument) => ({
      conid: Number.parseInt(String(instrument.conid), 10),
      exchange: instrument.exchange?.trim() || undefined,
    }))
    .filter((instrument) => Number.isFinite(instrument.conid) && instrument.conid > 0);

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'No valid instruments provided' }, { status: 400 });
  }

  try {
    const schedules = [];

    for (let index = 0; index < normalized.length; index += SCHEDULE_BATCH_CHUNK_SIZE) {
      const chunk = normalized.slice(index, index + SCHEDULE_BATCH_CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((instrument) =>
          getMarketSchedule(instrument.conid, instrument.exchange)
        )
      );

      schedules.push(
        ...results.map((result, chunkIndex) => {
          const instrument = chunk[chunkIndex]!;
          if (result.status === 'fulfilled') {
            return result.value;
          }

          const message =
            result.reason instanceof Error
              ? result.reason.message
              : 'Schedule fetch failed';
          console.warn('[ibkr] schedule batch fallback', {
            conid: instrument.conid,
            exchange: instrument.exchange,
            message,
          });
          return buildFallbackMarketSchedule(
            instrument.conid,
            instrument.exchange
          );
        })
      );
    }

    return NextResponse.json(schedules);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Schedule batch fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
