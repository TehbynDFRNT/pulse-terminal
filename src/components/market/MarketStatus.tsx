'use client';

import {
  getMarketDataDisplayBadgeClass,
  getMarketDataDisplayCode,
  getMarketDataDisplayDotClass,
  getMarketDataDisplayLabel,
  getMarketDataDisplayTextClass,
  type MarketDataDisplayStatus,
} from '@/lib/ibkr/display-status';
import type { MarketSessionPhase } from '@/lib/ibkr/types';
import { cn } from '@/lib/utils';

interface MarketStatusInlineProps {
  status: MarketDataDisplayStatus;
  className?: string;
  dotClassName?: string;
  textClassName?: string;
  uppercase?: boolean;
}

export function MarketStatusInline({
  status,
  className,
  dotClassName,
  textClassName,
  uppercase = true,
}: MarketStatusInlineProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          getMarketDataDisplayDotClass(status),
          dotClassName
        )}
      />
      <span
        className={cn(
          'text-[10px] tracking-wider',
          uppercase && 'uppercase',
          getMarketDataDisplayTextClass(status),
          textClassName
        )}
      >
        {getMarketDataDisplayLabel(status)}
      </span>
    </div>
  );
}

interface MarketStatusBadgeProps {
  status: MarketDataDisplayStatus;
  label?: string;
  sessionPhase?: MarketSessionPhase;
  className?: string;
}

export function MarketStatusBadge({
  status,
  label,
  sessionPhase = 'unknown',
  className,
}: MarketStatusBadgeProps) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
        getMarketDataDisplayBadgeClass(status),
        className
      )}
    >
      {label ?? getMarketDataDisplayCode(status, sessionPhase)}
    </span>
  );
}
