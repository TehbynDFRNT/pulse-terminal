import { NextRequest, NextResponse } from 'next/server';
import {
  clearChartDiagnosticsSession,
  readChartDiagnosticsSession,
  syncChartDiagnosticsSession,
} from '@/lib/dev/chart-diagnostics-server';
import type { ChartDiagnosticEntry } from '@/lib/dev/chart-diagnostics-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session') ?? undefined;
  const verbose = request.nextUrl.searchParams.get('verbose') === '1';
  const session = readChartDiagnosticsSession(sessionId);

  if (!session) {
    return NextResponse.json({
      sessionId: sessionId ?? null,
      updatedAt: null,
      entries: [],
    });
  }

  return NextResponse.json({
    sessionId: session.sessionId,
    updatedAt: session.updatedAt,
    entries: session.entries.map((entry) =>
      verbose
        ? entry
        : {
            seq: entry.seq,
            event: entry.event,
            scope: entry.scope,
            signature: entry.signature,
            count: entry.count,
            firstAt: entry.firstAt,
            lastAt: entry.lastAt,
            summary: entry.summary,
          }
    ),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { sessionId?: string; entries?: ChartDiagnosticEntry[] }
    | null;

  const sessionId = body?.sessionId?.trim();
  const entries = Array.isArray(body?.entries) ? body.entries.filter(isEntry) : null;

  if (!sessionId || !entries) {
    return NextResponse.json(
      { error: 'sessionId and entries are required' },
      { status: 400 }
    );
  }

  const session = syncChartDiagnosticsSession(sessionId, entries);

  return NextResponse.json({
    sessionId: session.sessionId,
    updatedAt: session.updatedAt,
    entryCount: session.entries.length,
  });
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session') ?? undefined;
  clearChartDiagnosticsSession(sessionId);
  return NextResponse.json({ ok: true });
}

function isEntry(value: unknown): value is ChartDiagnosticEntry {
  return (
    typeof value === 'object' &&
    value != null &&
    'seq' in value &&
    'event' in value &&
    'scope' in value &&
    'signature' in value
  );
}
