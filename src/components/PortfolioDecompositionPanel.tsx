'use client';

import { useEffect, useState } from 'react';
import { getPortfolioDecomposition } from '@/lib/ibkr/gateway-client';
import type {
  PortfolioDecompositionBucket,
  PortfolioDecompositionResponse,
} from '@/lib/ibkr/types';
import { usePortfolioStore } from '@/lib/store/portfolio';
import { cn, formatPrice } from '@/lib/utils';

function BucketList({
  title,
  buckets,
  baseCurrency,
}: {
  title: string;
  buckets: PortfolioDecompositionBucket[];
  baseCurrency: string | null;
}) {
  return (
    <div className="rounded border border-border/70 bg-background/70">
      <div className="border-b border-border/50 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border/40">
        {buckets.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">No exposure</div>
        ) : (
          buckets.slice(0, 5).map((bucket) => (
            <div key={bucket.key} className="px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-xs text-foreground">{bucket.label}</span>
                <span className="font-mono text-xs text-foreground">
                  {baseCurrency ?? '—'} {formatPrice(bucket.value, -1)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      bucket.value >= 0 ? 'bg-emerald-400' : 'bg-red-400'
                    )}
                    style={{ width: `${Math.max(bucket.weight * 100, 2)}%` }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-[10px] text-muted-foreground">
                  {(bucket.weight * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PortfolioDecompositionPanel() {
  const updatedAt = usePortfolioStore((s) => s.updatedAt);
  const [data, setData] = useState<PortfolioDecompositionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await getPortfolioDecomposition();
        if (!cancelled) {
          setData(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load decomposition');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [updatedAt]);

  return (
    <div className="border-t border-border/50">
      <div className="px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        Portfolio Mix
      </div>
      {error ? (
        <div className="px-3 pb-3 text-xs text-red-400">{error}</div>
      ) : loading && !data ? (
        <div className="px-3 pb-3 text-xs text-muted-foreground">Loading portfolio mix…</div>
      ) : data ? (
        <div className="grid gap-2 px-3 pb-3 lg:grid-cols-2">
          <BucketList
            title="Asset Classes"
            buckets={data.assetClasses}
            baseCurrency={data.baseCurrency}
          />
          <BucketList
            title="Currencies"
            buckets={data.currencies}
            baseCurrency={data.baseCurrency}
          />
          <BucketList
            title="Sectors"
            buckets={data.sectors}
            baseCurrency={data.baseCurrency}
          />
          <BucketList
            title="Groups"
            buckets={data.groups}
            baseCurrency={data.baseCurrency}
          />
        </div>
      ) : null}
    </div>
  );
}
