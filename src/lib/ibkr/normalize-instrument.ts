import type { WatchlistItem } from './types';

const KNOWN_BAD_CONIDS = [
  {
    symbol: 'MARA',
    badConid: 69067924,
    correctedConid: 474219659,
    exchange: 'NASDAQ',
    name: 'MARA HOLDINGS INC',
    type: 'STK',
  },
] as const;

type InstrumentLike = {
  conid: number;
  symbol: string;
  name: string;
  exchange: string;
  type?: string;
};

export function normalizeInstrument<T extends InstrumentLike>(item: T): T {
  const match = KNOWN_BAD_CONIDS.find(
    (candidate) =>
      item.symbol.toUpperCase() === candidate.symbol &&
      item.conid === candidate.badConid
  );

  if (!match) return item;

  return {
    ...item,
    conid: match.correctedConid,
    exchange: match.exchange,
    name: match.name,
    type: item.type ?? match.type,
  };
}

export function normalizeInstruments<T extends InstrumentLike>(items: T[]): T[] {
  return items.map((item) => normalizeInstrument(item));
}

export function normalizeWatchlistItems(items: WatchlistItem[]): WatchlistItem[] {
  return normalizeInstruments(items);
}
