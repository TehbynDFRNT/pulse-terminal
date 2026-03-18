import { create } from 'zustand';
import type { MarketDataDisplayStatus } from '@/lib/ibkr/display-status';

interface GatewayState {
  connected: boolean | null;
  marketDataMode: MarketDataDisplayStatus;
  setConnected: (v: boolean | null) => void;
  setMarketDataMode: (v: MarketDataDisplayStatus) => void;
}

export const useGatewayStore = create<GatewayState>((set) => ({
  connected: null,
  marketDataMode: 'unknown',
  setConnected: (v) => set({ connected: v }),
  setMarketDataMode: (v) => set({ marketDataMode: v }),
}));
