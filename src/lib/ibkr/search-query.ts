const FUTURE_MONTH_CODE_TO_ABBR: Record<string, string> = {
  F: 'JAN',
  G: 'FEB',
  H: 'MAR',
  J: 'APR',
  K: 'MAY',
  M: 'JUN',
  N: 'JUL',
  Q: 'AUG',
  U: 'SEP',
  V: 'OCT',
  X: 'NOV',
  Z: 'DEC',
};

export interface ExplicitFutureQuery {
  symbol: string;
  month: string;
}

export function sanitizeInstrumentSearchQuery(
  query: string | null | undefined
): string {
  const normalized = String(query ?? '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, ' ');

  if (!/[A-Za-z0-9]/.test(normalized)) {
    return '';
  }

  return normalized;
}

export function normalizeInstrumentSearchText(
  value: string | null | undefined
): string {
  return sanitizeInstrumentSearchQuery(value)
    .toUpperCase()
    .replace(/[./_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactInstrumentSearchText(
  value: string | null | undefined
): string {
  return normalizeInstrumentSearchText(value).replace(/\s+/g, '');
}

export function parseExplicitFutureQuery(
  query: string | null | undefined
): ExplicitFutureQuery | null {
  const normalized = normalizeInstrumentSearchText(query);
  if (!normalized) return null;

  const spacedMonth =
    normalized.match(/^([A-Z]{1,5})\s+([A-Z]{3})(\d{2})$/) ??
    normalized.match(/^([A-Z]{1,5})\s+([A-Z]{3})\s+(\d{2})$/);
  if (spacedMonth) {
    return {
      symbol: spacedMonth[1]!,
      month: `${spacedMonth[2]}${spacedMonth[3]}`,
    };
  }

  const compact = compactInstrumentSearchText(query);
  const codedMonth = compact.match(/^([A-Z]{1,5})([FGHJKMNQUVXZ])(\d{1,2})$/);
  if (!codedMonth) {
    return null;
  }

  const monthAbbr = FUTURE_MONTH_CODE_TO_ABBR[codedMonth[2]!];
  if (!monthAbbr) {
    return null;
  }

  const year = codedMonth[3]!.padStart(2, '0');
  return {
    symbol: codedMonth[1]!,
    month: `${monthAbbr}${year}`,
  };
}

export function buildInstrumentSearchQueries(
  query: string | null | undefined
): string[] {
  const sanitized = sanitizeInstrumentSearchQuery(query);
  if (!sanitized) return [];

  const variants: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | null | undefined) => {
    const next = sanitizeInstrumentSearchQuery(value);
    if (!next) return;
    const key = next.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(next);
  };

  const normalized = normalizeInstrumentSearchText(sanitized);
  const compact = compactInstrumentSearchText(sanitized);
  const tokens = normalized.split(' ').filter(Boolean);
  const explicitFuture = parseExplicitFutureQuery(sanitized);

  add(sanitized);

  if (normalized && normalized !== sanitized.toUpperCase()) {
    add(normalized);
  }

  if (
    compact &&
    (tokens.length <= 2 || compact.length <= 8 || explicitFuture != null) &&
    compact !== normalized &&
    compact !== sanitized.toUpperCase()
  ) {
    add(compact);
  }

  if (compact && !normalized.includes(' ') && /^[A-Z]{4,6}$/.test(compact)) {
    add(`${compact.slice(0, -1)} ${compact.slice(-1)}`);
    add(`${compact.slice(0, -1)}.${compact.slice(-1)}`);
  }

  if (explicitFuture) {
    add(`${explicitFuture.symbol} ${explicitFuture.month}`);
    add(explicitFuture.symbol);
  }

  if (tokens.length >= 3) {
    add(tokens.slice(0, -1).join(' '));
    add(tokens.slice(0, -2).join(' '));
  }

  return variants.slice(0, 6);
}
