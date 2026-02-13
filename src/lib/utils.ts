import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number, decimals = 2): string {
  if (!price && price !== 0) return '—';
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatLargeNumber(num: number): string {
  if (!num && num !== 0) return '—';
  if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function formatPnL(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}$${formatPrice(Math.abs(value))}`;
}

export function formatPnLPct(value: number, base: number): string {
  if (!base) return '—';
  const pct = (value / base) * 100;
  const prefix = pct >= 0 ? '+' : '';
  return `${prefix}${pct.toFixed(2)}%`;
}
