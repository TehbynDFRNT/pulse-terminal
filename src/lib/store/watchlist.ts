import { create } from 'zustand';
import type { WatchlistItem, MarketDataSnapshot } from '@/lib/ibkr/types';
import { normalizeInstrument, normalizeWatchlistItems } from '@/lib/ibkr/normalize-instrument';
import { getDisplayPrice } from '@/lib/ibkr/display-price';

interface PriceData {
  last: number;
  displayPrice: number;
  displayChange: number;
  displayChangePct: string;
  displaySource: 'mid' | 'last' | 'bid' | 'ask' | 'none';
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  mdAvailability: string;
  marketDataStatus: 'live' | 'delayed' | 'frozen' | 'unavailable' | 'unknown';
  change: number;
  changePct: string;
  volume: number;
  dayLow: number;
  dayHigh: number;
  open: number;
  prevClose: number;
  updated: number;
  hasLiveData: boolean;
}

interface WatchlistState {
  items: WatchlistItem[];
  prices: Record<number, PriceData>; // keyed by conid
  selectedConid: number | null;

  // Actions
  addItem: (item: WatchlistItem) => void;
  removeItem: (conid: number) => void;
  setItems: (items: WatchlistItem[]) => void;
  reorderItems: (items: WatchlistItem[]) => void;
  selectInstrument: (conid: number | null) => void;
  updatePrice: (conid: number, data: Partial<PriceData>) => void;
  updateLivePrices: (updates: Record<number, Partial<PriceData>>) => void;
  updatePrices: (snapshots: MarketDataSnapshot[]) => void;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  items: [],
  prices: {},
  selectedConid: null,

  addItem: (item) => {
    const normalized = normalizeInstrument(item);
    const existing = get().items.find((i) => i.conid === normalized.conid);
    if (existing) return;
    set((s) => {
      const nextItems = [...s.items, normalized];
      return {
        items: nextItems,
        selectedConid: s.selectedConid ?? normalized.conid,
      };
    });
  },

  removeItem: (conid) => {
    set((s) => {
      const items = s.items.filter((i) => i.conid !== conid);
      return {
        items,
        selectedConid: s.selectedConid === conid ? (items[0]?.conid ?? null) : s.selectedConid,
      };
    });
  },

  setItems: (items) =>
    set((s) => {
      const normalized = normalizeWatchlistItems(items);
      const selectedConid = normalized.some((item) => item.conid === s.selectedConid)
        ? s.selectedConid
        : (normalized[0]?.conid ?? null);
      if (
        selectedConid === s.selectedConid &&
        isSameWatchlistOrder(s.items, normalized)
      ) {
        return s;
      }
      return {
        items: normalized,
        selectedConid,
      };
    }),

  reorderItems: (items) =>
    set((s) => {
      const normalized = normalizeWatchlistItems(items);
      const selectedConid = normalized.some((item) => item.conid === s.selectedConid)
        ? s.selectedConid
        : (normalized[0]?.conid ?? null);
      if (
        selectedConid === s.selectedConid &&
        isSameWatchlistOrder(s.items, normalized)
      ) {
        return s;
      }
      return {
        items: normalized,
        selectedConid,
      };
    }),

  selectInstrument: (conid) => set({ selectedConid: conid }),

  updatePrice: (conid, data) => {
    set((s) => {
      const existing = s.prices[conid];
      const next = mergePriceData(existing, data);
      if (existing && isSamePriceData(existing, next)) {
        return s;
      }

      return {
        prices: {
          ...s.prices,
          [conid]: next,
        },
      };
    });
  },

  updateLivePrices: (updates) => {
    set((s) => {
      let nextPrices: Record<number, PriceData> | null = null;

      for (const [conidText, patch] of Object.entries(updates)) {
        const conid = Number(conidText);
        if (!(conid > 0)) continue;

        const existing = s.prices[conid];
        const next = mergePriceData(existing, patch);
        if (existing && isSamePriceData(existing, next)) {
          continue;
        }

        if (!nextPrices) {
          nextPrices = { ...s.prices };
        }
        nextPrices[conid] = next;
      }

      return nextPrices ? { prices: nextPrices } : s;
    });
  },

  updatePrices: (snapshots) => {
    set((s) => {
      let prices: Record<number, PriceData> | null = null;

      for (const snap of snapshots) {
        const existing = (prices ?? s.prices)[snap.conid];
        const preferExistingLive =
          existing?.marketDataStatus === 'live' &&
          (existing.updated ?? 0) > (snap.updated ?? 0);

        const next = mergePriceData(existing, {
          last: preferExistingLive ? existing.last : snap.last,
          displayPrice: preferExistingLive ? existing.displayPrice : snap.displayPrice,
          displayChange: preferExistingLive ? existing.displayChange : snap.displayChange,
          displayChangePct: preferExistingLive
            ? existing.displayChangePct
            : snap.displayChangePct,
          displaySource: preferExistingLive ? existing.displaySource : snap.displaySource,
          bid: preferExistingLive ? existing.bid : snap.bid,
          bidSize: preferExistingLive ? existing.bidSize : snap.bidSize,
          ask: preferExistingLive ? existing.ask : snap.ask,
          askSize: preferExistingLive ? existing.askSize : snap.askSize,
          mdAvailability: preferExistingLive ? existing.mdAvailability : snap.mdAvailability,
          marketDataStatus: preferExistingLive
            ? existing.marketDataStatus
            : snap.marketDataStatus,
          change: preferExistingLive ? existing.change : snap.change,
          changePct: preferExistingLive ? existing.changePct : snap.changePct,
          volume: preferExistingLive ? existing.volume : snap.volume,
          dayLow: preferExistingLive ? existing.dayLow : snap.dayLow,
          dayHigh: preferExistingLive ? existing.dayHigh : snap.dayHigh,
          open: snap.open || existing?.open || 0,
          prevClose: snap.prevClose || existing?.prevClose || 0,
          updated: preferExistingLive ? existing.updated : snap.updated,
          hasLiveData:
            (preferExistingLive ? existing.marketDataStatus : snap.marketDataStatus) === 'live',
        });

        if (existing && isSamePriceData(existing, next)) {
          continue;
        }

        if (!prices) {
          prices = { ...s.prices };
        }
        prices[snap.conid] = next;
      }

      return prices ? { prices } : s;
    });
  },
}));

function mergePriceData(
  existing: PriceData | undefined,
  data: Partial<PriceData>
): PriceData {
  const next = { ...existing, ...data } as PriceData;
  const display = getDisplayPrice({
    last: next.last,
    bid: next.bid,
    ask: next.ask,
    prevClose: next.prevClose,
    change: next.change,
    changePct: next.changePct,
  });

  next.displayPrice = display.displayPrice;
  next.displayChange = display.displayChange;
  next.displayChangePct = display.displayChangePct;
  next.displaySource = display.displaySource;

  return next;
}

function isSamePriceData(left: PriceData, right: PriceData): boolean {
  return (
    left.last === right.last &&
    left.displayPrice === right.displayPrice &&
    left.displayChange === right.displayChange &&
    left.displayChangePct === right.displayChangePct &&
    left.displaySource === right.displaySource &&
    left.bid === right.bid &&
    left.bidSize === right.bidSize &&
    left.ask === right.ask &&
    left.askSize === right.askSize &&
    left.mdAvailability === right.mdAvailability &&
    left.marketDataStatus === right.marketDataStatus &&
    left.change === right.change &&
    left.changePct === right.changePct &&
    left.volume === right.volume &&
    left.dayLow === right.dayLow &&
    left.dayHigh === right.dayHigh &&
    left.open === right.open &&
    left.prevClose === right.prevClose &&
    left.updated === right.updated &&
    left.hasLiveData === right.hasLiveData
  );
}

function isSameWatchlistOrder(left: WatchlistItem[], right: WatchlistItem[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.conid !== right[index]?.conid) {
      return false;
    }
  }
  return true;
}
