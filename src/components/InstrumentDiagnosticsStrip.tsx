'use client';

import { useEffect, useState } from 'react';
import { getInstrumentDiagnostics } from '@/lib/ibkr/gateway-client';
import type { InstrumentDiagnostics } from '@/lib/ibkr/types';
import { cn } from '@/lib/utils';

function toneForKey(key: InstrumentDiagnostics['availability']['key']) {
  switch (key) {
    case 'open-live':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    case 'open-delayed':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    case 'open-no-entitlement':
      return 'border-red-500/30 bg-red-500/10 text-red-400';
    case 'closed-cached':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-400';
    case 'historical-only':
      return 'border-zinc-500/30 bg-secondary text-muted-foreground';
    default:
      return 'border-border bg-secondary text-muted-foreground';
  }
}

export function InstrumentDiagnosticsStrip({
  conid,
  exchange,
}: {
  conid: number;
  exchange?: string;
}) {
  const [data, setData] = useState<InstrumentDiagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getInstrumentDiagnostics(conid, exchange);
        if (!cancelled) {
          setData(next);
        }
      } catch {
        if (!cancelled) {
          setData(null);
        }
      }
    };

    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conid, exchange]);

  if (!data) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span
        className={cn(
          'rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest',
          toneForKey(data.availability.key)
        )}
      >
        {data.availability.label}
      </span>
      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {data.entitled ? 'Entitled' : 'No entitlement'}
      </span>
      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {data.marketDataStatus}
      </span>
      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {data.currency}
      </span>
    </div>
  );
}
