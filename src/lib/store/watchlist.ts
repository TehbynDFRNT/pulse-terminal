import { create } from 'zustand';
import type { WatchlistItem, MarketDataSnapshot } from '@/lib/ibkr/types';

interface PriceData {
  last: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  change: number;
  changePct: string;
  volume: number;
  dayLow: number;
  dayHigh: number;
  open: number;
  prevClose: number;
  updated: number;
}

interface WatchlistState {
  items: WatchlistItem[];
  prices: Record<number, PriceData>; // keyed by conid
  selectedConid: number | null;

  // Actions
  addItem: (item: WatchlistItem) => void;
  removeItem: (conid: number) => void;
  setItems: (items: WatchlistItem[]) => void;
  selectInstrument: (conid: number | null) => void;
  updatePrice: (conid: number, data: Partial<PriceData>) => void;
  updatePrices: (snapshots: MarketDataSnapshot[]) => void;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  items: [],
  prices: {},
  selectedConid: null,

  addItem: (item) => {
    const existing = get().items.find((i) => i.conid === item.conid);
    if (existing) return;
    set((s) => ({ items: [...s.items, item] }));
  },

  removeItem: (conid) => {
    set((s) => ({
      items: s.items.filter((i) => i.conid !== conid),
      selectedConid: s.selectedConid === conid ? null : s.selectedConid,
    }));
  },

  setItems: (items) => set({ items }),

  selectInstrument: (conid) => set({ selectedConid: conid }),

  updatePrice: (conid, data) => {
    set((s) => ({
      prices: {
        ...s.prices,
        [conid]: { ...s.prices[conid], ...data } as PriceData,
      },
    }));
  },

  updatePrices: (snapshots) => {
    const updates: Record<number, PriceData> = {};
    for (const snap of snapshots) {
      updates[snap.conid] = {
        last: snap.last,
        bid: snap.bid,
        bidSize: snap.bidSize,
        ask: snap.ask,
        askSize: snap.askSize,
        change: snap.change,
        changePct: snap.changePct,
        volume: snap.volume,
        dayLow: snap.dayLow,
        dayHigh: snap.dayHigh,
        open: snap.open,
        prevClose: snap.prevClose,
        updated: snap.updated,
      };
    }
    set((s) => ({ prices: { ...s.prices, ...updates } }));
  },
}));
