'use client';

import { deriveInstrumentAvailability } from '@/lib/ibkr/instrument-availability';
import { useMarketSchedule } from '@/lib/ibkr/useMarketSchedule';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { formatAdaptivePrice, formatPercentString } from '@/lib/utils';

interface InstrumentHeaderProps {
  conid?: number;
  exchange?: string;
  symbol: string;
  name?: string | null;
  color?: string;
  price?: number | null;
  changePct?: string | null;
}

function statusChipTone(
  key?: ReturnType<typeof deriveInstrumentAvailability>['key']
) {
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

function entitlementChipTone(entitled?: boolean) {
  if (entitled === true) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  }

  if (entitled === false) {
    return 'border-border bg-secondary text-muted-foreground';
  }

  return 'border-border bg-secondary text-muted-foreground';
}

function getStatusLabel(availability: ReturnType<typeof deriveInstrumentAvailability> | null) {
  switch (availability?.key) {
    case 'open-live':
      return 'Live';
    case 'open-delayed':
      return 'Delayed';
    case 'open-no-entitlement':
      return 'Open';
    case 'closed-cached':
    case 'historical-only':
    case 'closed-no-data':
      return 'Closed';
    case 'unknown':
      return 'Status Unprovided';
    default:
      return 'Status Unprovided';
  }
}

function getEntitlementLabel(entitled?: boolean | null) {
  if (entitled === true) return 'Entitled';
  if (entitled === false) return 'No Entitlement';
  return 'Entitlement Unprovided';
}

function getChangeDisplay(changePct?: string | null) {
  if (!changePct) {
    return {
      text: '—',
      positive: true,
    };
  }

  const cleaned = changePct.replace(/[^0-9.+-]/g, '');
  const numeric = Number.parseFloat(cleaned);

  return {
    text: formatPercentString(changePct),
    positive: Number.isFinite(numeric) ? numeric >= 0 : true,
  };
}

export function InstrumentHeader({
  conid,
  exchange,
  symbol,
  name,
  color,
  price,
  changePct,
}: InstrumentHeaderProps) {
  const snapshot = useWatchlistStore((s) =>
    conid ? (s.prices[conid] ?? null) : null
  );
  const { state: scheduleState } = useMarketSchedule(conid, exchange);
  const change = getChangeDisplay(changePct);
  const availability = deriveInstrumentAvailability({
    snapshot: snapshot
      ? {
          ...snapshot,
          conid: conid ?? 0,
          symbol,
          companyName: name ?? symbol,
        }
      : null,
    scheduleState,
  });
  const symbolTitle = name ? `${name} (${symbol})` : symbol;

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-card px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {color ? (
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="font-mono text-sm font-medium text-foreground"
            title={symbolTitle}
          >
            {symbol}
          </span>
          {name ? (
            <span
              className="min-w-0 truncate text-[10px] text-muted-foreground"
              title={symbolTitle}
            >
              {name}
            </span>
          ) : null}
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] ${statusChipTone(
                availability.key
              )}`}
            >
              {getStatusLabel(availability)}
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] ${entitlementChipTone(
                availability.entitled
              )}`}
            >
              {getEntitlementLabel(availability.entitled)}
            </span>
          </div>
        </div>
      </div>

      {price != null ? (
        <div className="ml-4 flex shrink-0 items-center gap-3">
          <span className="font-mono text-lg font-bold tabular-nums text-foreground">
            {formatAdaptivePrice(price)}
          </span>
          <span
            className={`font-mono text-sm tabular-nums ${
              change.positive ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {change.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
