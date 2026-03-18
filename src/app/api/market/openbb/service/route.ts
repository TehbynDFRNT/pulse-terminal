import { NextResponse } from 'next/server';
import {
  ensureOpenBBSidecar,
  getOpenBBServiceStatus,
  waitForOpenBBSidecarHealth,
} from '@/lib/openbb/service-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await getOpenBBServiceStatus());
}

export async function POST() {
  await ensureOpenBBSidecar();
  const healthy = await waitForOpenBBSidecarHealth(12_000);
  const status = await getOpenBBServiceStatus();

  return NextResponse.json(status, {
    status: healthy ? 200 : 503,
  });
}
