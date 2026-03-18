import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number, decimals = 2): string {
  if (!price && price !== 0) return '—';
  const value = Math.abs(price);
  const resolvedDecimals =
    decimals >= 0
      ? decimals
      : value >= 1
        ? 2
        : value >= 0.1
          ? 5
          : value >= 0.01
            ? 6
            : 8;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(2, resolvedDecimals),
    maximumFractionDigits: resolvedDecimals,
    useGrouping: false,
  }).format(price);
}

export function formatAdaptivePrice(price: number): string {
  if (!price && price !== 0) return '—';
  return formatPrice(price, -1);
}

export function formatPercentString(value: string, decimals = 2): string {
  if (!value) return '—';
  const numeric = Number.parseFloat(value.replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(numeric)) return value;
  const prefix = numeric >= 0 ? '+' : '';
  return `${prefix}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(numeric)}%`;
}

export function formatLargeNumber(num: number): string {
  if (!num && num !== 0) return '—';
  return String(num);
}

export function formatPnL(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}$${formatPrice(Math.abs(value))}`;
}

export function formatPnLPct(value: number, base: number): string {
  if (!base) return '—';
  const pct = (value / base) * 100;
  const prefix = pct >= 0 ? '+' : '';
  return `${prefix}${pct}%`;
}
